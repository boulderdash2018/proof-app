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
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import {
  PlanDraft,
  CoPlanParticipant,
  CoPlanProposedPlace,
} from '../types';
import { createGroupConversation, ConversationParticipant } from './chatService';

const DRAFTS = 'plan_drafts';

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
    // Already has one — nothing to do.
    const existing = data.conversationId || data.publishedConvId;
    if (existing) return existing;

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
