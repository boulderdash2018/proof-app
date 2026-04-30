/**
 * Multi-user plan sessions — live Firestore doc that all participants observe.
 *
 * A session is created when one participant taps "Démarrer la session" on a
 * group conversation. Other participants can join from the system message.
 * Each participant's check-in per place writes to the shared doc so everyone
 * sees real-time progress.
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { ConversationParticipant, postSystemEvent } from './chatService';

const SESSIONS = 'plan_sessions';

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

export interface SessionCheckin {
  /** ISO timestamp when the participant checked in at the place. */
  at: string;
  /** Optional photo captured at the place (Firebase Storage URL). */
  photoUrl?: string;
}

export interface SessionParticipant extends ConversationParticipant {
  joinedAt: string;
  /** Map placeId -> checkin. */
  checkins: Record<string, SessionCheckin>;
  /** ISO timestamp when this participant finished the plan (reached the
   *  last step, regardless of whether they proofed it). Once set, the
   *  user can no longer rejoin the session — the FloatingDock and
   *  Rejoindre CTA hide themselves. */
  finishedAt?: string;
  /** Whether the user proofed the plan (true) or simply skipped through
   *  to the end (false). Surfaced for analytics + future "X a validé /
   *  X a juste fait" copy variants. */
  proofed?: boolean;
}

export interface GroupPlanSession {
  id: string;
  planId: string;
  planTitle: string;
  planCover?: string | null;
  conversationId: string;
  createdBy: string;
  participants: Record<string, SessionParticipant>;
  status: 'active' | 'completed';
  startedAt: string;
  completedAt?: string;
  /** Ordered list of place IDs (snapshot of plan places at start time). */
  placeOrder: string[];
}

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

const toISO = (ts: any): string => {
  if (!ts) return new Date().toISOString();
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof ts === 'string') return ts;
  return new Date().toISOString();
};

const hydrateSession = (id: string, data: any): GroupPlanSession => {
  const participants: Record<string, SessionParticipant> = {};
  const rawParticipants = data.participants || {};
  Object.keys(rawParticipants).forEach((pid) => {
    const p = rawParticipants[pid];
    participants[pid] = {
      ...p,
      joinedAt: toISO(p.joinedAt),
      checkins: p.checkins || {},
      ...(p.finishedAt ? { finishedAt: toISO(p.finishedAt) } : {}),
      ...(typeof p.proofed === 'boolean' ? { proofed: p.proofed } : {}),
    };
  });
  return {
    id,
    planId: data.planId,
    planTitle: data.planTitle,
    planCover: data.planCover ?? null,
    conversationId: data.conversationId,
    createdBy: data.createdBy,
    participants,
    status: data.status || 'active',
    startedAt: toISO(data.startedAt),
    completedAt: data.completedAt ? toISO(data.completedAt) : undefined,
    placeOrder: Array.isArray(data.placeOrder) ? data.placeOrder : [],
  };
};

// ══════════════════════════════════════════════════════════════
// Create / Join / Complete
// ══════════════════════════════════════════════════════════════

export interface CreateSessionInput {
  plan: {
    id: string;
    title: string;
    coverPhoto?: string | null;
    placeIds: string[];
  };
  conversationId: string;
  creator: ConversationParticipant;
}

/** Creates a new active session + posts a `session_started` system message in the group. */
export const createGroupSession = async (input: CreateSessionInput): Promise<string> => {
  const { plan, conversationId, creator } = input;

  const participantSeed: Record<string, any> = {
    [creator.userId]: {
      ...creator,
      joinedAt: new Date().toISOString(),
      checkins: {},
    },
  };

  const sessionRef = await addDoc(collection(db, SESSIONS), {
    planId: plan.id,
    planTitle: plan.title,
    planCover: plan.coverPhoto ?? null,
    conversationId,
    createdBy: creator.userId,
    participants: participantSeed,
    placeOrder: plan.placeIds,
    status: 'active',
    startedAt: serverTimestamp(),
  });

  // Link the session back to the conversation so the pinned card reflects the live state.
  await updateDoc(doc(db, 'conversations', conversationId), {
    activeSessionId: sessionRef.id,
  });

  // System message with a pointer to this session (stored in payload).
  await postSystemEvent(
    conversationId,
    {
      kind: 'session_started',
      actorId: creator.userId,
      payload: sessionRef.id,
    },
    `${creator.displayName} a démarré la session`,
  );

  return sessionRef.id;
};

/** Adds the current user to the session's participants map. */
export const joinGroupSession = async (
  sessionId: string,
  participant: ConversationParticipant,
): Promise<void> => {
  const ref = doc(db, SESSIONS, sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const existing = (data.participants || {})[participant.userId];
  if (existing) return; // already joined
  await updateDoc(ref, {
    [`participants.${participant.userId}`]: {
      ...participant,
      joinedAt: new Date().toISOString(),
      checkins: {},
    },
  });
};

/** Records a participant's check-in at a specific place. */
export const checkInAtPlace = async (
  sessionId: string,
  userId: string,
  placeId: string,
  photoUrl?: string,
): Promise<void> => {
  const ref = doc(db, SESSIONS, sessionId);
  const payload: SessionCheckin = {
    at: new Date().toISOString(),
    ...(photoUrl ? { photoUrl } : {}),
  };
  await updateDoc(ref, {
    [`participants.${userId}.checkins.${placeId}`]: payload,
  });
};

/**
 * Posts a "session_advanced" system message in the group chat when a
 * participant moves to the next place. Best-effort — chat post errors
 * are swallowed so they don't break the local progression.
 *
 * Format displayed in chat: "Marc est passé à Toutainville (étape 2/3)"
 *
 * Optional `sessionId` is included in the payload as JSON so the chat UI
 * can later deep-link the message back to the session.
 */
export const notifySessionAdvanced = async (
  conversationId: string,
  actor: ConversationParticipant,
  toIndex: number,           // 0-based index of the place the user just reached
  totalPlaces: number,
  toPlaceName: string,
  sessionId?: string,
): Promise<void> => {
  try {
    const oneBased = toIndex + 1;
    const preview = `${actor.displayName} est passé à ${toPlaceName} (étape ${oneBased}/${totalPlaces})`;
    await postSystemEvent(
      conversationId,
      {
        kind: 'session_advanced',
        actorId: actor.userId,
        payload: sessionId ? `${toPlaceName}|${oneBased}|${totalPlaces}|${sessionId}` : `${toPlaceName}|${oneBased}|${totalPlaces}`,
      },
      preview,
    );
  } catch (err) {
    console.warn('[notifySessionAdvanced] failed:', err);
  }
};

/**
 * Marks ONE user as finished in the session. Writes participant.finishedAt
 * + participant.proofed. After the write, re-reads the session and if
 * EVERY participant has a finishedAt, transitions the session to
 * 'completed' atomically (status + completedAt + clear conv.activeSessionId
 * + post session_completed event). Idempotent — calling twice for the
 * same user is a no-op for the second call.
 *
 * Returns true if THIS call closed the whole session ; false if other
 * participants are still active.
 */
export const markUserFinishedInSession = async (
  sessionId: string,
  actor: ConversationParticipant,
  proofed: boolean,
): Promise<boolean> => {
  const ref = doc(db, SESSIONS, sessionId);
  const beforeSnap = await getDoc(ref);
  if (!beforeSnap.exists()) return false;
  const beforeData = beforeSnap.data();
  if (beforeData.status === 'completed') return false;

  // Idempotent : skip if already finished.
  const myFinished = beforeData.participants?.[actor.userId]?.finishedAt;
  if (!myFinished) {
    await updateDoc(ref, {
      [`participants.${actor.userId}.finishedAt`]: new Date().toISOString(),
      [`participants.${actor.userId}.proofed`]: proofed,
    });
  }

  // Re-read to compute "all finished" off the freshly-merged state.
  const afterSnap = await getDoc(ref);
  const afterData = afterSnap.data() || {};
  const participants = afterData.participants || {};
  const ids = Object.keys(participants);
  const allFinished = ids.length > 0 && ids.every((id) => !!participants[id]?.finishedAt);

  if (!allFinished) return false;

  // Last one out — close the session for the whole group.
  await updateDoc(ref, {
    status: 'completed',
    completedAt: serverTimestamp(),
  });
  // Clear activeSessionId AND stamp lastSessionCompletedAt — the latter
  // lets the chat hide the "Démarrer la session" button after the
  // parcours is over (no restart from the same conv ; user makes a
  // new group if they want to redo the plan).
  await updateDoc(doc(db, 'conversations', afterData.conversationId), {
    activeSessionId: null,
    lastSessionCompletedAt: serverTimestamp(),
  });
  await postSystemEvent(
    afterData.conversationId,
    {
      kind: 'session_completed',
      actorId: actor.userId,
      payload: sessionId,
    },
    `Session terminée — rassemblez vos souvenirs 📸`,
  );
  return true;
};

/**
 * Force-closes a session (admin / debug path). Marks status completed,
 * clears the conv pointer, posts the system message. Used by the
 * "Terminer la session pour tout le monde" creator-only action — not
 * by the per-user completion flow which prefers markUserFinishedInSession.
 */
export const completeGroupSession = async (
  sessionId: string,
  actor: ConversationParticipant,
): Promise<void> => {
  const ref = doc(db, SESSIONS, sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  if (data.status === 'completed') return;

  await updateDoc(ref, {
    status: 'completed',
    completedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'conversations', data.conversationId), {
    activeSessionId: null,
  });
  await postSystemEvent(
    data.conversationId,
    {
      kind: 'session_completed',
      actorId: actor.userId,
      payload: sessionId,
    },
    `Session terminée — rassemblez vos souvenirs 📸`,
  );
};

// ══════════════════════════════════════════════════════════════
// Subscriptions
// ══════════════════════════════════════════════════════════════

export const subscribeSession = (
  sessionId: string,
  onData: (session: GroupPlanSession | null) => void,
  onError?: (err: Error) => void,
): (() => void) => {
  const ref = doc(db, SESSIONS, sessionId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(hydrateSession(snap.id, snap.data()));
    },
    (err) => {
      console.warn('[planSessionService] subscribe error:', err);
      onError?.(err);
    },
  );
};

/** Fetch all active sessions I'm a participant in (for cross-screen toast). */
export const fetchMyActiveSessions = async (userId: string): Promise<GroupPlanSession[]> => {
  const q = query(
    collection(db, SESSIONS),
    where('status', '==', 'active'),
  );
  const snap = await getDocs(q);
  const mine = snap.docs
    .map((d) => hydrateSession(d.id, d.data()))
    .filter((s) => Boolean(s.participants[userId]));
  return mine;
};
