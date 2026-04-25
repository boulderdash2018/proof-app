/**
 * Co-plan drafts — collaborative plan workspaces where a group of friends
 * organize a day together (pick places, mark availability, optimize route)
 * before locking it into a real Plan + group conversation.
 *
 * Every participant subscribes to the same Firestore doc. All mutations are
 * optimistic client-side then persisted. Presence heartbeats are stored in a
 * `presence` map so each participant knows who's currently viewing.
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  where,
  getDocs,
  runTransaction,
  setDoc,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import {
  PlanDraft,
  CoPlanParticipant,
  CoPlanProposedPlace,
  CoPlanProposal,
  CoPlanProposalType,
  CoPlanVote,
} from '../types';
import { createGroupConversation, ConversationParticipant, postSystemEvent } from './chatService';

const DRAFTS = 'plan_drafts';
const PROPOSALS = 'proposals';

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

const toISO = (ts: any): string => {
  if (!ts) return new Date().toISOString();
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof ts === 'string') return ts;
  return new Date().toISOString();
};

const hydrateDraft = (id: string, data: any): PlanDraft => {
  // Backward-compat : legacy drafts stored conv id under `publishedConvId`.
  const conversationId = data.conversationId || data.publishedConvId;
  return {
    id,
    title: data.title || '',
    createdBy: data.createdBy,
    participants: Array.isArray(data.participants) ? data.participants : [],
    participantDetails: data.participantDetails || {},
    proposedPlaces: Array.isArray(data.proposedPlaces) ? data.proposedPlaces : [],
    availability: data.availability || {},
    status: data.status || 'draft',
    meetupAt: data.meetupAt,
    lockedBy: data.lockedBy,
    lockedAt: data.lockedAt ? toISO(data.lockedAt) : undefined,
    publishedPlanId: data.publishedPlanId,
    conversationId,
    publishedConvId: data.publishedConvId,
    presence: data.presence || {},
    createdAt: toISO(data.createdAt),
    updatedAt: toISO(data.updatedAt),
  };
};

/** Tiny client-side uuid for proposedPlaces. */
export const makeLocalId = (): string =>
  `pp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ══════════════════════════════════════════════════════════════
// Create / Fetch
// ══════════════════════════════════════════════════════════════

export interface CreateDraftInput {
  title: string;
  creator: CoPlanParticipant;
  invitees: CoPlanParticipant[];
}

export const createPlanDraft = async (input: CreateDraftInput): Promise<string> => {
  const { title, creator, invitees } = input;
  const all = [creator, ...invitees];
  const participantIds = all.map((p) => p.userId);
  const participantDetails: Record<string, CoPlanParticipant> = {};
  all.forEach((p) => { participantDetails[p.userId] = p; });

  const cleanTitle = title.trim() || 'Nouveau brouillon';

  const payload = {
    title: cleanTitle,
    createdBy: creator.userId,
    participants: participantIds,
    participantDetails,
    proposedPlaces: [],
    availability: {},
    status: 'draft',
    presence: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // 1) Create the draft doc
  const ref = await addDoc(collection(db, DRAFTS), payload);

  // 2) Spin up the linked group conversation IMMEDIATELY so participants can
  //    chat while organizing. The conv is enriched with linkedPlanId at lock
  //    time (see lockDraft → attachPlanToConversation), but starts plan-less
  //    so the chat UI is usable from minute one.
  try {
    const me: ConversationParticipant = {
      userId: creator.userId,
      displayName: creator.displayName,
      username: creator.username,
      avatarUrl: creator.avatarUrl,
      avatarBg: creator.avatarBg,
      avatarColor: creator.avatarColor,
      initials: creator.initials,
    };
    const others: ConversationParticipant[] = invitees.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      username: p.username,
      avatarUrl: p.avatarUrl,
      avatarBg: p.avatarBg,
      avatarColor: p.avatarColor,
      initials: p.initials,
    }));
    const conversationId = await createGroupConversation({
      creator: me,
      otherParticipants: others,
      groupName: cleanTitle,
      // No plan + no meetupAt yet — those land at lock time.
      linkedDraftId: ref.id,
    });
    // Link the conv id back onto the draft for easy retrieval.
    await updateDoc(ref, { conversationId, updatedAt: serverTimestamp() });
  } catch (err) {
    // Non-fatal — draft is usable without the conv (degraded but workable).
    console.warn('[planDraftService] could not seed conversation for draft:', err);
  }

  return ref.id;
};

/**
 * Lazily attach a group conversation to a draft that was created BEFORE
 * we started seeding convs at draft time. Idempotent — a no-op if the
 * draft already has `conversationId` (or the legacy `publishedConvId`).
 *
 * Called by the workspace screen on first observe so legacy brouillons
 * end up with a chat too. The first participant to open such a draft
 * wins the race; subsequent calls bail out via the `existing` check.
 *
 * Returns the conv id (existing or newly created), or null if it failed.
 */
export const backfillConversationForDraft = async (
  draftId: string,
): Promise<string | null> => {
  try {
    const ref = doc(db, DRAFTS, draftId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data() as any;
    // Already has one — patch its `linkedDraftId` if missing (older convs
    // were seeded before that field existed) and bail out.
    const existing = data.conversationId || data.publishedConvId;
    if (existing) {
      try {
        const convRef = doc(db, 'conversations', existing);
        const convSnap = await getDoc(convRef);
        if (convSnap.exists() && !convSnap.data().linkedDraftId) {
          await updateDoc(convRef, { linkedDraftId: draftId });
        }
      } catch (err) {
        console.warn('[planDraftService] could not backfill linkedDraftId on existing conv:', err);
      }
      return existing;
    }

    const details: Record<string, CoPlanParticipant> | undefined = data.participantDetails;
    const participants: string[] | undefined = data.participants;
    if (!details || !participants || participants.length === 0) {
      console.warn('[planDraftService] backfill: draft missing participantDetails');
      return null;
    }

    const creatorId: string = data.createdBy;
    const creator = details[creatorId];
    if (!creator) {
      console.warn('[planDraftService] backfill: creator details missing');
      return null;
    }

    const me: ConversationParticipant = {
      userId: creator.userId,
      displayName: creator.displayName,
      username: creator.username,
      avatarUrl: creator.avatarUrl,
      avatarBg: creator.avatarBg,
      avatarColor: creator.avatarColor,
      initials: creator.initials,
    };
    const others: ConversationParticipant[] = participants
      .filter((id) => id !== creatorId)
      .map((id) => details[id])
      .filter(Boolean)
      .map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        username: p.username,
        avatarUrl: p.avatarUrl,
        avatarBg: p.avatarBg,
        avatarColor: p.avatarColor,
        initials: p.initials,
      }));

    const conversationId = await createGroupConversation({
      creator: me,
      otherParticipants: others,
      groupName: data.title || 'Brouillon',
      linkedDraftId: draftId,
    });
    await updateDoc(ref, { conversationId, updatedAt: serverTimestamp() });
    return conversationId;
  } catch (err) {
    console.warn('[planDraftService] backfill error:', err);
    return null;
  }
};

export const fetchPlanDraft = async (draftId: string): Promise<PlanDraft | null> => {
  const snap = await getDoc(doc(db, DRAFTS, draftId));
  if (!snap.exists()) return null;
  return hydrateDraft(snap.id, snap.data());
};

/**
 * Find an active draft attached to a given conversation id. Used by the
 * conversation screen to decide whether to render the "📋 Brouillon"
 * lens-switcher tab.
 *
 * The query is constrained by `participants array-contains userId` so it
 * complies with the standard plan_drafts rule pattern (only participants
 * can read). Without this filter, Firestore rejects the whole query with
 * "Missing or insufficient permissions", which silently broke ALL
 * conversation opens — even DMs unrelated to co-plan.
 *
 * Returns null if no matching active draft.
 */
export const findDraftByConversationId = async (
  conversationId: string,
  userId: string,
): Promise<PlanDraft | null> => {
  if (!userId) return null;
  try {
    const q = query(
      collection(db, DRAFTS),
      where('participants', 'array-contains', userId),
      where('conversationId', '==', conversationId),
    );
    const snap = await getDocs(q);
    // Pick the freshest active draft (locked drafts shouldn't surface the
    // "Brouillon en cours" affordance — the plan is now real).
    const drafts = snap.docs
      .map((d) => hydrateDraft(d.id, d.data()))
      .filter((d) => d.status === 'draft');
    if (drafts.length === 0) return null;
    drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return drafts[0];
  } catch (err) {
    // Defensive — rules might still reject the query in some configs.
    // Failing silently means the lens-switcher tab simply won't appear,
    // not that the whole conv breaks.
    console.warn('[planDraftService] findDraftByConversationId failed:', err);
    return null;
  }
};

/** List all active drafts the current user participates in, newest first. */
export const fetchMyActiveDrafts = async (userId: string): Promise<PlanDraft[]> => {
  const q = query(
    collection(db, DRAFTS),
    where('participants', 'array-contains', userId),
  );
  const snap = await getDocs(q);
  const drafts = snap.docs
    .map((d) => hydrateDraft(d.id, d.data()))
    .filter((d) => d.status === 'draft');
  drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return drafts;
};

export const subscribePlanDraft = (
  draftId: string,
  onData: (draft: PlanDraft | null) => void,
  onError?: (err: Error) => void,
): (() => void) => {
  return onSnapshot(
    doc(db, DRAFTS, draftId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(hydrateDraft(snap.id, snap.data()));
    },
    (err) => {
      console.warn('[planDraftService] subscribe error:', err);
      onError?.(err);
    },
  );
};

/**
 * Subscribe to the list of drafts where the user is a participant.
 * Kept filtered client-side to avoid a composite Firestore index.
 */
export const subscribeMyDrafts = (
  userId: string,
  onData: (drafts: PlanDraft[]) => void,
  onError?: (err: Error) => void,
): (() => void) => {
  const q = query(
    collection(db, DRAFTS),
    where('participants', 'array-contains', userId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const drafts = snap.docs
        .map((d) => hydrateDraft(d.id, d.data()))
        .filter((d) => d.status === 'draft');
      drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      onData(drafts);
    },
    (err) => {
      console.warn('[planDraftService] subscribeMyDrafts error:', err);
      onError?.(err);
    },
  );
};

// ══════════════════════════════════════════════════════════════
// Mutations
// ══════════════════════════════════════════════════════════════

/** Update the draft's title (inline edit from the workspace header). */
export const renameDraft = async (draftId: string, title: string): Promise<void> => {
  const clean = title.trim();
  if (!clean) return;
  await updateDoc(doc(db, DRAFTS, draftId), {
    title: clean,
    updatedAt: serverTimestamp(),
  });
};

/** Add a new proposed place. Appends at the end (highest orderIndex). */
export const proposePlace = async (
  draftId: string,
  place: Omit<CoPlanProposedPlace, 'proposedAt' | 'votes' | 'orderIndex'>,
): Promise<void> => {
  const ref = doc(db, DRAFTS, draftId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const existing: CoPlanProposedPlace[] = Array.isArray(data.proposedPlaces) ? data.proposedPlaces : [];
  const maxOrder = existing.reduce((m, p) => Math.max(m, p.orderIndex ?? 0), 0);
  const newPlace: CoPlanProposedPlace = {
    ...place,
    proposedAt: new Date().toISOString(),
    votes: [place.proposedBy], // proposer auto-upvotes
    orderIndex: maxOrder + 1,
  };
  await updateDoc(ref, {
    proposedPlaces: [...existing, newPlace],
    updatedAt: serverTimestamp(),
  });
};

/** Remove a proposed place (only the proposer or any participant — we allow any). */
export const removePlace = async (draftId: string, placeId: string): Promise<void> => {
  const ref = doc(db, DRAFTS, draftId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const next: CoPlanProposedPlace[] = (data.proposedPlaces || []).filter(
    (p: CoPlanProposedPlace) => p.id !== placeId,
  );
  await updateDoc(ref, {
    proposedPlaces: next,
    updatedAt: serverTimestamp(),
  });
};

/** Toggle a user's vote on a place. Re-tap = un-vote. */
export const togglePlaceVote = async (
  draftId: string,
  placeId: string,
  userId: string,
): Promise<void> => {
  const ref = doc(db, DRAFTS, draftId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const places: CoPlanProposedPlace[] = data.proposedPlaces || [];
  const next = places.map((p) => {
    if (p.id !== placeId) return p;
    const has = (p.votes || []).includes(userId);
    return {
      ...p,
      votes: has
        ? p.votes.filter((u) => u !== userId)
        : [...(p.votes || []), userId],
    };
  });
  await updateDoc(ref, {
    proposedPlaces: next,
    updatedAt: serverTimestamp(),
  });
};

/** Reorder places by moving one up/down in the list (orderIndex shift). */
export const movePlace = async (
  draftId: string,
  placeId: string,
  direction: 'up' | 'down',
): Promise<void> => {
  const ref = doc(db, DRAFTS, draftId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const places: CoPlanProposedPlace[] = [...(data.proposedPlaces || [])];
  places.sort((a, b) => a.orderIndex - b.orderIndex);

  const idx = places.findIndex((p) => p.id === placeId);
  if (idx < 0) return;
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= places.length) return;

  // Swap orderIndex values
  const aIdx = places[idx].orderIndex;
  const bIdx = places[swapWith].orderIndex;
  places[idx] = { ...places[idx], orderIndex: bIdx };
  places[swapWith] = { ...places[swapWith], orderIndex: aIdx };

  await updateDoc(ref, {
    proposedPlaces: places,
    updatedAt: serverTimestamp(),
  });
};

/** Set the current user's availability slots (full replace). */
export const setAvailability = async (
  draftId: string,
  userId: string,
  slots: string[],
): Promise<void> => {
  await updateDoc(doc(db, DRAFTS, draftId), {
    [`availability.${userId}`]: {
      slots,
      updatedAt: new Date().toISOString(),
    },
    updatedAt: serverTimestamp(),
  });
};

/** Heartbeat for live presence (fire every ~20s while the workspace is open). */
export const pingPresence = async (draftId: string, userId: string): Promise<void> => {
  try {
    await updateDoc(doc(db, DRAFTS, draftId), {
      [`presence.${userId}`]: Date.now(),
    });
  } catch {
    // Silently ignore — presence is best-effort.
  }
};

// ══════════════════════════════════════════════════════════════
// Lock (conversion to a real Plan happens in coPlanStore via
// planDraftService.markLocked after Plan + Conv are created)
// ══════════════════════════════════════════════════════════════

export const markDraftLocked = async (
  draftId: string,
  userId: string,
  meetupAt: string | null,
  publishedPlanId: string | null,
  publishedConvId: string,
): Promise<void> => {
  const payload: Record<string, any> = {
    status: 'locked',
    lockedBy: userId,
    lockedAt: serverTimestamp(),
    publishedConvId,
    updatedAt: serverTimestamp(),
  };
  if (meetupAt) payload.meetupAt = meetupAt;
  if (publishedPlanId) payload.publishedPlanId = publishedPlanId;
  await updateDoc(doc(db, DRAFTS, draftId), payload);
};

/** Archive a draft (soft delete — leaves history for audit). */
export const archiveDraft = async (draftId: string): Promise<void> => {
  await updateDoc(doc(db, DRAFTS, draftId), {
    status: 'archived',
    updatedAt: serverTimestamp(),
  });
};

/** Hard-delete a draft. Only the creator should call this (UI gating). */
export const deletePlanDraft = async (draftId: string): Promise<void> => {
  await deleteDoc(doc(db, DRAFTS, draftId));
};

// ══════════════════════════════════════════════════════════════
// Utilities — overlap computation + slot enumeration
// ══════════════════════════════════════════════════════════════

export type DayPart = 'morning' | 'midday' | 'afternoon' | 'evening';

/** The 4 daily time blocks used for the availability grid. */
export const DAY_PARTS: DayPart[] = ['morning', 'midday', 'afternoon', 'evening'];

/**
 * Build slot key "YYYY-MM-DD-{part}". Format is stable and sortable.
 */
export const buildSlotKey = (dateISO: string, part: DayPart): string => {
  const day = new Date(dateISO).toISOString().slice(0, 10);
  return `${day}-${part}`;
};

/** Parse a slot key back to its parts. Returns null on malformed input. */
export const parseSlotKey = (key: string): { dateISO: string; part: DayPart } | null => {
  const m = key.match(/^(\d{4}-\d{2}-\d{2})-(morning|midday|afternoon|evening)$/);
  if (!m) return null;
  return { dateISO: m[1], part: m[2] as DayPart };
};

/**
 * For each slot, count how many users marked themselves available.
 * Returns a map slotKey → count.
 */
export const computeOverlapCounts = (
  availability: Record<string, { slots: string[] }>,
): Record<string, number> => {
  const counts: Record<string, number> = {};
  Object.values(availability).forEach((a) => {
    (a?.slots || []).forEach((k) => {
      counts[k] = (counts[k] || 0) + 1;
    });
  });
  return counts;
};

/** Map the "best" overlap slot to an ISO datetime suggestion (midpoint hour of the part). */
export const slotKeyToMeetupAt = (key: string): string | null => {
  const parsed = parseSlotKey(key);
  if (!parsed) return null;
  const d = new Date(`${parsed.dateISO}T00:00:00`);
  const hoursByPart: Record<DayPart, number> = {
    morning: 10,
    midday: 12,
    afternoon: 15,
    evening: 19,
  };
  d.setHours(hoursByPart[parsed.part], 0, 0, 0);
  return d.toISOString();
};

/** Human-readable label for a slot key (e.g. "Sam 26 · midi"). */
export const formatSlotKeyShort = (key: string): string => {
  const parsed = parseSlotKey(key);
  if (!parsed) return key;
  const d = new Date(`${parsed.dateISO}T12:00:00`);
  const dayLabel = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
  const partLabel: Record<DayPart, string> = {
    morning: 'matin',
    midday: 'midi',
    afternoon: 'après-midi',
    evening: 'soir',
  };
  return `${dayLabel} · ${partLabel[parsed.part]}`;
};

// ══════════════════════════════════════════════════════════════
// Proposals subcollection — group-validated mutations of the draft.
//
// Lives at `plan_drafts/{draftId}/proposals/{propId}`. A proposal is a
// pending mutation that needs a strict-majority vote (>50% of
// participants voting "pour") before it auto-applies. This protects
// participants' contributions: anyone can ADD freely (soft action), but
// REMOVING / REPLACING / RENAMING someone else's work goes through the
// group.
//
// Auto-apply is transactional — the first client to detect a passing
// threshold wins the apply via runTransaction; any racing client sees
// status !== 'pending' and bails out.
// ══════════════════════════════════════════════════════════════

const hydrateProposal = (id: string, data: any): CoPlanProposal => ({
  id,
  type: data.type,
  proposedBy: data.proposedBy,
  proposedAt: toISO(data.proposedAt),
  payload: data.payload || {},
  votes: data.votes || {},
  status: data.status || 'pending',
  resolvedAt: data.resolvedAt ? toISO(data.resolvedAt) : undefined,
  resolvedBy: data.resolvedBy,
  chatMessageId: data.chatMessageId,
});

/**
 * Create a proposal doc + post the mirror chat card. Returns the new
 * proposal id (which is also linked back via `chatMessageId` once the
 * chat message exists).
 *
 * Idempotency: not strictly idempotent — caller should debounce the UI.
 * Two rapid taps will create two proposals, which is annoying but harmless.
 */
export const createProposal = async (input: {
  draftId: string;
  proposedBy: string;
  type: CoPlanProposalType;
  payload: CoPlanProposal['payload'];
  /** Conv id for the linked chat — required to post the mirror card. */
  conversationId: string;
  /** Snapshot subject for the chat preview line ("Café Pinson"). */
  subject: string;
}): Promise<string> => {
  const propRef = doc(collection(db, DRAFTS, input.draftId, PROPOSALS));
  const propId = propRef.id;

  // Proposer auto-counts as "pour" — they wouldn't propose against themselves.
  const initialVotes: Record<string, CoPlanVote> = {
    [input.proposedBy]: 'pour',
  };

  await setDoc(propRef, {
    type: input.type,
    proposedBy: input.proposedBy,
    proposedAt: serverTimestamp(),
    payload: input.payload,
    votes: initialVotes,
    status: 'pending',
  });

  // Post the mirror chat message — type='coplan_proposal' so the
  // ConversationScreen renders it as a rich card with vote buttons.
  // We DON'T use postSystemEvent here (different shape) — direct addDoc.
  try {
    const messagesCol = collection(db, 'conversations', input.conversationId, 'messages');
    const msgRef = await addDoc(messagesCol, {
      conversationId: input.conversationId,
      senderId: input.proposedBy,
      type: 'coplan_proposal',
      content: '',
      proposalDraftId: input.draftId,
      proposalId: propId,
      proposalType: input.type,
      proposalSubject: input.subject,
      reactions: [],
      readBy: [input.proposedBy],
      createdAt: serverTimestamp(),
    });
    // Update conv lastMessage + back-link the chatMessageId on the proposal.
    await updateDoc(doc(db, 'conversations', input.conversationId), {
      lastMessage: previewForProposal(input.type, input.subject),
      lastMessageType: 'coplan_proposal',
      lastMessageSenderId: input.proposedBy,
      lastMessageAt: serverTimestamp(),
    });
    await updateDoc(propRef, { chatMessageId: msgRef.id });
  } catch (err) {
    console.warn('[planDraftService] could not post proposal mirror message:', err);
  }

  return propId;
};

const previewForProposal = (type: CoPlanProposalType, subject: string): string => {
  switch (type) {
    case 'remove_place':   return `Proposition : retirer ${subject}`;
    case 'replace_place':  return `Proposition : remplacer ${subject}`;
    case 'change_meetup':  return `Proposition : changer la date`;
    case 'change_title':   return `Proposition : nouveau titre`;
  }
};

/** Subscribe to a single proposal doc — used by the chat card to render
 *  live vote count + status transitions. */
export const subscribeProposal = (
  draftId: string,
  proposalId: string,
  onData: (proposal: CoPlanProposal | null) => void,
  onError?: (err: Error) => void,
): (() => void) => {
  return onSnapshot(
    doc(db, DRAFTS, draftId, PROPOSALS, proposalId),
    (snap) => {
      if (!snap.exists()) return onData(null);
      onData(hydrateProposal(snap.id, snap.data()));
    },
    (err) => {
      console.warn('[planDraftService] subscribeProposal error:', err.message);
      onError?.(err);
    },
  );
};

/**
 * Vote on a pending proposal. After the vote write, runs the auto-apply
 * check transactionally — the first client to see a passing threshold
 * applies the mutation; racing clients see status !== 'pending' and skip.
 *
 * Toggles work like this:
 *   • Tap "Pour" when no vote        → record 'pour'
 *   • Tap "Pour" when already 'pour' → unvote (delete from map)
 *   • Tap "Contre" when no vote      → record 'contre'
 *   • Tap "Contre" when 'pour'       → switch to 'contre'
 *   • etc.
 */
export const voteOnProposal = async (
  draftId: string,
  proposalId: string,
  voterUserId: string,
  vote: CoPlanVote,
): Promise<void> => {
  const propRef = doc(db, DRAFTS, draftId, PROPOSALS, proposalId);
  const snap = await getDoc(propRef);
  if (!snap.exists()) return;
  const prop = hydrateProposal(snap.id, snap.data());
  if (prop.status !== 'pending') return; // already resolved — silent no-op

  const currentVote = prop.votes[voterUserId];
  const nextVotes = { ...prop.votes };
  if (currentVote === vote) {
    // Same button = unvote
    delete nextVotes[voterUserId];
  } else {
    nextVotes[voterUserId] = vote;
  }

  await updateDoc(propRef, { votes: nextVotes });

  // Threshold check — strict majority (>50%) of participants voting "pour".
  const draftSnap = await getDoc(doc(db, DRAFTS, draftId));
  if (!draftSnap.exists()) return;
  const totalParticipants: number = (draftSnap.data().participants || []).length;
  const pourCount = Object.values(nextVotes).filter((v) => v === 'pour').length;
  const contreCount = Object.values(nextVotes).filter((v) => v === 'contre').length;

  if (pourCount * 2 > totalParticipants) {
    await applyProposal(draftId, proposalId);
  } else if (contreCount * 2 >= totalParticipants) {
    // Mathematically impossible to reach majority pour → mark rejected early.
    await rejectProposal(draftId, proposalId, voterUserId);
  }
};

/**
 * Apply a passing proposal to the draft transactionally. Only the FIRST
 * caller to see status='pending' wins; subsequent callers see 'applied'
 * and bail out — protects against duplicate mutations from racing
 * clients all detecting the threshold simultaneously.
 *
 * Currently handles `remove_place`. `replace_place` / `change_*` are
 * stubbed for the next commit.
 */
export const applyProposal = async (
  draftId: string,
  proposalId: string,
): Promise<void> => {
  const propRef = doc(db, DRAFTS, draftId, PROPOSALS, proposalId);
  const draftRef = doc(db, DRAFTS, draftId);

  let appliedSubject = '';
  let conversationId = '';

  try {
    await runTransaction(db, async (tx) => {
      const propSnap = await tx.get(propRef);
      if (!propSnap.exists()) throw new Error('proposal vanished');
      const prop = hydrateProposal(propSnap.id, propSnap.data());
      if (prop.status !== 'pending') return; // already resolved — bail

      const draftSnap = await tx.get(draftRef);
      if (!draftSnap.exists()) throw new Error('draft vanished');
      const draft = draftSnap.data();
      conversationId = draft.conversationId || draft.publishedConvId || '';

      switch (prop.type) {
        case 'remove_place': {
          const places: CoPlanProposedPlace[] = draft.proposedPlaces || [];
          const target = places.find((p) => p.id === prop.payload.placeId);
          appliedSubject = target?.name || prop.payload.placeName || 'lieu';
          tx.update(draftRef, {
            proposedPlaces: places.filter((p) => p.id !== prop.payload.placeId),
            updatedAt: serverTimestamp(),
          });
          break;
        }
        // Other types — wired in commit 3.
        case 'replace_place':
        case 'change_meetup':
        case 'change_title':
          // For now: just mark resolved without mutating the draft. The
          // real apply lands when the corresponding UI does.
          appliedSubject = prop.payload.placeName || prop.payload.title || '';
          break;
      }

      tx.update(propRef, {
        status: 'applied',
        resolvedAt: serverTimestamp(),
      });
    });
  } catch (err) {
    console.warn('[planDraftService] applyProposal failed:', err);
    return;
  }

  // Post a confirmation system event in the conv (best-effort, outside
  // the transaction so a chat error doesn't roll back the draft mutation).
  // The proposal CARD itself also transforms via its live snapshot, so
  // this event is mostly a "lastMessage" cue in the conversations list.
  if (conversationId && appliedSubject) {
    postSystemEvent(
      conversationId,
      { kind: 'coplan_proposal_applied', payload: appliedSubject },
      `Proposition adoptée : ${appliedSubject}`,
    ).catch(() => {});
  }
};

/** Mark a proposal rejected (when contre count makes pour-majority impossible). */
export const rejectProposal = async (
  draftId: string,
  proposalId: string,
  resolverUserId: string,
): Promise<void> => {
  const propRef = doc(db, DRAFTS, draftId, PROPOSALS, proposalId);
  let rejectedSubject = '';
  let conversationId = '';
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(propRef);
      if (!snap.exists()) return;
      const prop = hydrateProposal(snap.id, snap.data());
      if (prop.status !== 'pending') return;
      rejectedSubject = prop.payload.placeName || prop.payload.title || '';
      // Pull conv id from parent draft for the post-rejection event.
      const draftSnap = await tx.get(doc(db, DRAFTS, draftId));
      if (draftSnap.exists()) {
        conversationId = draftSnap.data().conversationId || draftSnap.data().publishedConvId || '';
      }
      tx.update(propRef, {
        status: 'rejected',
        resolvedAt: serverTimestamp(),
        resolvedBy: resolverUserId,
      });
    });
  } catch (err) {
    console.warn('[planDraftService] rejectProposal failed:', err);
    return;
  }
  if (conversationId) {
    postSystemEvent(
      conversationId,
      { kind: 'coplan_proposal_rejected', payload: rejectedSubject },
      `Proposition rejetée${rejectedSubject ? ` : ${rejectedSubject}` : ''}`,
    ).catch(() => {});
  }
};
