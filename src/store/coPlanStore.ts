import { create } from 'zustand';
import {
  PlanDraft,
  CoPlanParticipant,
  CoPlanProposedPlace,
} from '../types';
import {
  subscribePlanDraft,
  proposePlace as svcProposePlace,
  removePlace as svcRemovePlace,
  togglePlaceVote as svcTogglePlaceVote,
  movePlace as svcMovePlace,
  setAvailability as svcSetAvailability,
  renameDraft as svcRenameDraft,
  pingPresence as svcPingPresence,
  markDraftLocked,
  makeLocalId,
  computeOverlapCounts,
  slotKeyToMeetupAt,
} from '../services/planDraftService';
import { createPlan } from '../services/plansService';
import { attachPlanToConversation, createGroupConversation, postSystemEvent, ConversationParticipant, SystemEvent } from '../services/chatService';
import { useAuthStore } from './authStore';
import { Place, CategoryTag, TransportMode, CoAuthor } from '../types';

/**
 * Observes a single active draft at a time (what the workspace screen shows).
 * All mutations apply optimistically then persist.
 *
 * The heartbeat timer is owned here so any screen subscribing to the store
 * automatically announces presence while mounted.
 */

const PRESENCE_INTERVAL_MS = 20_000;
/** Activity toasts auto-dismiss after this delay. */
const ACTIVITY_TTL_MS = 5_000;
/** Skip events older than this on a fresh snapshot — protects against
 *  dumping a backlog when a user opens the workspace. */
const ACTIVITY_FRESHNESS_MS = 8_000;

/** Lightweight signal-of-life event surfaced as a toast in the workspace. */
export type CoPlanActivityKind =
  | 'place_added'
  | 'place_removed'
  | 'vote_added'
  | 'availability_added';

export interface CoPlanActivityEvent {
  id: string;
  kind: CoPlanActivityKind;
  actorId: string;
  actorName: string;       // first name only — kept short on the toast
  actorAvatarBg: string;
  actorAvatarColor: string;
  actorAvatarUrl: string | null;
  actorInitials: string;
  /** Subject of the action — place name for place/vote, slot count for avail. */
  detail: string;
  createdAt: number;       // ms epoch
}

interface CoPlanStore {
  // ── Observation of a single draft ──
  draft: PlanDraft | null;
  draftId: string | null;
  _unsub: (() => void) | null;
  _userId: string | null;
  _presenceTimer: ReturnType<typeof setInterval> | null;
  /** Previous draft snapshot — used to compute diffs & emit activity events. */
  _prevDraft: PlanDraft | null;
  /** Live, capped-size queue of recent events from OTHER participants. */
  recentActivity: CoPlanActivityEvent[];
  _activityPruneTimer: ReturnType<typeof setInterval> | null;

  // ── Actions — subscription ──
  observeDraft: (draftId: string, userId: string) => void;
  stopObserving: () => void;
  /** Remove a single activity toast (typically when the user taps it). */
  dismissActivity: (id: string) => void;

  // ── Actions — mutations (optimistic) ──
  rename: (title: string) => Promise<void>;
  proposePlace: (input: {
    googlePlaceId: string;
    name: string;
    address: string;
    photoUrl?: string;
    category?: string;
    priceLevel?: number;
    estimatedDurationMin?: number;
    latitude?: number;
    longitude?: number;
  }) => Promise<void>;
  removePlace: (placeId: string) => Promise<void>;
  toggleVote: (placeId: string) => Promise<void>;
  movePlace: (placeId: string, direction: 'up' | 'down') => Promise<void>;
  setAvailability: (slots: string[]) => Promise<void>;
  toggleAvailabilitySlot: (slotKey: string) => Promise<void>;

  // ── Lock → conversion to real Plan + group conv ──
  lockDraft: (publishOnFeed: boolean) => Promise<{ conversationId: string; planId: string | null } | null>;

  // ── Derived helpers (pure reads, compute on demand) ──
  getSortedPlaces: () => CoPlanProposedPlace[];
  getOverlapCounts: () => Record<string, number>;
  getMySlots: () => string[];
  getBestOverlapSlot: () => { key: string; count: number } | null;
  isPresent: (otherUserId: string) => boolean;
}

// ══════════════════════════════════════════════════════════════
// Chat mirror helper — posts a system event in the linked group
// conversation whenever the workspace is mutated. The event is
// non-blocking (.catch swallow) so a failed post never breaks the
// optimistic mutation.
//
// Each call infers the current draft + actor from the store state,
// resolves the actor's first name from participantDetails, and uses
// a stable preview text so the conversation list "lastMessage"
// reads naturally ("Léa a proposé Café Pinson").
// ══════════════════════════════════════════════════════════════

function postCoPlanMirror(
  kind: SystemEvent['kind'],
  detail: string,
  /** Optional place id — set for `coplan_place_added` so the chat can
   *  render inline vote buttons that drive the workspace vote count. */
  placeId?: string,
): void {
  // Read latest state — important: this fires AFTER the optimistic
  // update so `get().draft` already reflects the change.
  const { draft, _userId } = useCoPlanStore.getState();
  if (!draft || !_userId) return;
  const convId = draft.conversationId || draft.publishedConvId;
  if (!convId) return;
  const me = draft.participantDetails[_userId];
  const firstName = me ? me.displayName.split(' ')[0] : 'Quelqu\'un';

  let preview = '';
  switch (kind) {
    case 'coplan_place_added':      preview = `${firstName} a proposé ${detail}`; break;
    case 'coplan_place_removed':    preview = `${firstName} a retiré ${detail}`; break;
    case 'coplan_place_voted':      preview = `${firstName} a voté pour ${detail}`; break;
    case 'coplan_availability_set': preview = `${firstName} a marqué ${detail}`; break;
    case 'coplan_locked':           preview = `Plan verrouillé : ${detail}`; break;
    default:                        preview = `${firstName} a modifié le brouillon`;
  }

  const event: SystemEvent = {
    kind,
    actorId: _userId,
    payload: detail,
    draftId: draft.id,
    ...(placeId ? { placeId } : null),
  };

  postSystemEvent(convId, event, preview).catch((err) => {
    console.warn('[coPlanStore] postSystemEvent failed:', err);
  });
}

export const useCoPlanStore = create<CoPlanStore>((set, get) => ({
  draft: null,
  draftId: null,
  _unsub: null,
  _userId: null,
  _presenceTimer: null,
  _prevDraft: null,
  recentActivity: [],
  _activityPruneTimer: null,

  // ── Subscribe to a draft + start presence heartbeat ──
  observeDraft: (draftId: string, userId: string) => {
    const state = get();
    if (state.draftId === draftId && state._unsub) {
      // Already watching — no-op.
      return;
    }
    // Close any previous subscription + timer.
    state._unsub?.();
    if (state._presenceTimer) clearInterval(state._presenceTimer);
    if (state._activityPruneTimer) clearInterval(state._activityPruneTimer);

    set({
      draftId,
      draft: null,
      _userId: userId,
      _prevDraft: null,
      recentActivity: [],
    });

    const unsub = subscribePlanDraft(draftId, (next) => {
      const prev = get()._prevDraft;
      // Diff vs. previous snapshot — first snapshot is treated as baseline.
      if (prev && next) {
        const events = diffDraftForActivity(prev, next, userId);
        if (events.length > 0) {
          set((s) => ({
            // Keep newest first, cap at 6 in memory (UI shows top 3).
            recentActivity: [...events, ...s.recentActivity].slice(0, 6),
          }));
        }
      }
      set({ draft: next, _prevDraft: next });
    });

    // Fire first heartbeat immediately, then every 20s.
    svcPingPresence(draftId, userId).catch(() => {});
    const timer = setInterval(() => {
      svcPingPresence(draftId, userId).catch(() => {});
    }, PRESENCE_INTERVAL_MS);

    // Prune stale activity events every second.
    const pruneTimer = setInterval(() => {
      const now = Date.now();
      const fresh = get().recentActivity.filter(
        (e) => now - e.createdAt < ACTIVITY_TTL_MS,
      );
      if (fresh.length !== get().recentActivity.length) {
        set({ recentActivity: fresh });
      }
    }, 1000);

    set({ _unsub: unsub, _presenceTimer: timer, _activityPruneTimer: pruneTimer });
  },

  stopObserving: () => {
    const { _unsub, _presenceTimer, _activityPruneTimer } = get();
    _unsub?.();
    if (_presenceTimer) clearInterval(_presenceTimer);
    if (_activityPruneTimer) clearInterval(_activityPruneTimer);
    set({
      _unsub: null,
      _presenceTimer: null,
      _activityPruneTimer: null,
      draftId: null,
      draft: null,
      _userId: null,
      _prevDraft: null,
      recentActivity: [],
    });
  },

  /** Manually dismiss a single toast — used by the toast component. */
  dismissActivity: (id: string) => {
    set((s) => ({ recentActivity: s.recentActivity.filter((e) => e.id !== id) }));
  },

  // ── Mutations — each applies optimistic first, service call in background ──

  rename: async (title: string) => {
    const { draftId, draft } = get();
    if (!draftId || !draft) return;
    const clean = title.trim();
    if (!clean || clean === draft.title) return;
    // Optimistic
    set({ draft: { ...draft, title: clean } });
    try {
      await svcRenameDraft(draftId, clean);
    } catch (err) {
      console.warn('[coPlanStore] rename error:', err);
    }
  },

  proposePlace: async (input) => {
    const { draftId, draft, _userId } = get();
    if (!draftId || !draft || !_userId) return;
    // Firestore rejects objects containing `undefined`. We spread optional
    // fields conditionally so absent values simply don't exist on the doc
    // rather than being serialised as undefined.
    const newPlace: CoPlanProposedPlace = {
      id: makeLocalId(),
      googlePlaceId: input.googlePlaceId,
      name: input.name,
      address: input.address,
      proposedBy: _userId,
      proposedAt: new Date().toISOString(),
      votes: [_userId],
      orderIndex: (draft.proposedPlaces.reduce((m, p) => Math.max(m, p.orderIndex), 0) + 1),
      ...(input.photoUrl !== undefined && { photoUrl: input.photoUrl }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.priceLevel !== undefined && { priceLevel: input.priceLevel }),
      ...(input.estimatedDurationMin !== undefined && { estimatedDurationMin: input.estimatedDurationMin }),
      ...(input.latitude !== undefined && { latitude: input.latitude }),
      ...(input.longitude !== undefined && { longitude: input.longitude }),
    };
    // Optimistic
    set({
      draft: {
        ...draft,
        proposedPlaces: [...draft.proposedPlaces, newPlace],
      },
    });
    try {
      await svcProposePlace(draftId, newPlace);
      // Mirror the action into the linked chat thread so participants
      // not currently in the workspace get a "Léa a proposé X" entry.
      // The placeId lets the chat-side render inline pour/contre buttons.
      postCoPlanMirror('coplan_place_added', newPlace.name, newPlace.id);
    } catch (err) {
      console.warn('[coPlanStore] proposePlace error:', err);
    }
  },

  removePlace: async (placeId: string) => {
    const { draftId, draft } = get();
    if (!draftId || !draft) return;
    // Capture the name BEFORE we strip it from the optimistic state.
    const removed = draft.proposedPlaces.find((p) => p.id === placeId);
    set({
      draft: {
        ...draft,
        proposedPlaces: draft.proposedPlaces.filter((p) => p.id !== placeId),
      },
    });
    try {
      await svcRemovePlace(draftId, placeId);
      if (removed) postCoPlanMirror('coplan_place_removed', removed.name);
    } catch (err) {
      console.warn('[coPlanStore] removePlace error:', err);
    }
  },

  toggleVote: async (placeId: string) => {
    const { draftId, draft, _userId } = get();
    if (!draftId || !draft || !_userId) return;
    const target = draft.proposedPlaces.find((p) => p.id === placeId);
    if (!target) return;
    const wasVoting = target.votes.includes(_userId);
    const next = draft.proposedPlaces.map((p) => {
      if (p.id !== placeId) return p;
      return {
        ...p,
        votes: wasVoting ? p.votes.filter((u) => u !== _userId) : [...p.votes, _userId],
      };
    });
    set({ draft: { ...draft, proposedPlaces: next } });
    try {
      await svcTogglePlaceVote(draftId, placeId, _userId);
      // Only emit on the ADD direction — un-votes are silent in the chat
      // to avoid noise from indecisive tappers.
      if (!wasVoting) postCoPlanMirror('coplan_place_voted', target.name);
    } catch (err) {
      console.warn('[coPlanStore] toggleVote error:', err);
    }
  },

  movePlace: async (placeId: string, direction: 'up' | 'down') => {
    const { draftId, draft } = get();
    if (!draftId || !draft) return;
    const sorted = [...draft.proposedPlaces].sort((a, b) => a.orderIndex - b.orderIndex);
    const idx = sorted.findIndex((p) => p.id === placeId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx].orderIndex;
    const b = sorted[swapIdx].orderIndex;
    sorted[idx] = { ...sorted[idx], orderIndex: b };
    sorted[swapIdx] = { ...sorted[swapIdx], orderIndex: a };
    set({ draft: { ...draft, proposedPlaces: sorted } });
    try {
      await svcMovePlace(draftId, placeId, direction);
    } catch (err) {
      console.warn('[coPlanStore] movePlace error:', err);
    }
  },

  setAvailability: async (slots: string[]) => {
    const { draftId, draft, _userId } = get();
    if (!draftId || !draft || !_userId) return;
    // Snapshot prior count to decide whether this counts as an "add".
    const prevCount = draft.availability[_userId]?.slots.length || 0;
    // Optimistic
    const dedupSorted = Array.from(new Set(slots)).sort();
    set({
      draft: {
        ...draft,
        availability: {
          ...draft.availability,
          [_userId]: { slots: dedupSorted, updatedAt: new Date().toISOString() },
        },
      },
    });
    try {
      await svcSetAvailability(draftId, _userId, dedupSorted);
      // Mirror only when the user's slot count INCREASES — un-checking
      // slots is silent in the chat to keep the thread clean. Net adds
      // are batched into one event regardless of how many slots were
      // ticked in the same call.
      if (dedupSorted.length > prevCount) {
        const delta = dedupSorted.length - prevCount;
        const detail = delta === 1 ? '1 dispo' : `${delta} dispos`;
        postCoPlanMirror('coplan_availability_set', detail);
      }
    } catch (err) {
      console.warn('[coPlanStore] setAvailability error:', err);
    }
  },

  toggleAvailabilitySlot: async (slotKey: string) => {
    const { draft, _userId } = get();
    if (!draft || !_userId) return;
    const current = draft.availability[_userId]?.slots || [];
    const next = current.includes(slotKey)
      ? current.filter((k) => k !== slotKey)
      : [...current, slotKey];
    await get().setAvailability(next);
  },

  // ── Derived helpers ──

  getSortedPlaces: () => {
    const { draft } = get();
    if (!draft) return [];
    // Sort by orderIndex asc by default.
    return [...draft.proposedPlaces].sort((a, b) => a.orderIndex - b.orderIndex);
  },

  getOverlapCounts: () => {
    const { draft } = get();
    if (!draft) return {};
    return computeOverlapCounts(draft.availability);
  },

  getMySlots: () => {
    const { draft, _userId } = get();
    if (!draft || !_userId) return [];
    return draft.availability[_userId]?.slots || [];
  },

  getBestOverlapSlot: () => {
    const { draft } = get();
    if (!draft) return null;
    const counts = computeOverlapCounts(draft.availability);
    let bestKey: string | null = null;
    let bestCount = 0;
    Object.entries(counts).forEach(([k, c]) => {
      // Highest count wins, tie-break on earliest (lexicographic works because
      // slot keys start with YYYY-MM-DD).
      if (c > bestCount || (c === bestCount && bestKey && k < bestKey)) {
        bestKey = k;
        bestCount = c;
      }
    });
    return bestKey ? { key: bestKey, count: bestCount } : null;
  },

  // ── Lock → convert to real Plan + group conv ──
  // Called from the LockConfirmSheet. Builds a Plan + group conversation
  // doc, links them on the draft (markDraftLocked), and returns the ids.
  lockDraft: async (publishOnFeed: boolean) => {
    const { draft, _userId } = get();
    if (!draft || !_userId) return null;
    const user = useAuthStore.getState().user;
    if (!user) return null;

    try {
      // 1) Determine meetupAt from the best overlap slot (if any).
      const best = get().getBestOverlapSlot();
      const meetupAt = best ? slotKeyToMeetupAt(best.key) : null;

      // 2) Build places in manual order.
      const sortedPlaces = get().getSortedPlaces();
      const planPlaces: Place[] = sortedPlaces.map((p) => ({
        id: `place-${p.googlePlaceId}-${Math.random().toString(36).slice(2, 8)}`,
        googlePlaceId: p.googlePlaceId,
        name: p.name,
        type: p.category || 'Lieu',
        address: p.address,
        rating: 0,
        reviewCount: 0,
        ratingDistribution: [0, 0, 0, 0, 0],
        reviews: [],
        photoUrls: p.photoUrl ? [p.photoUrl] : [],
        priceLevel: p.priceLevel,
        latitude: p.latitude,
        longitude: p.longitude,
      }));

      // 3) Coarse category tag from the first place's category.
      const defaultTags: CategoryTag[] = sortedPlaces[0]?.category ? [sortedPlaces[0].category] : [];
      const defaultTransport: TransportMode = 'À pied';

      // 4) Build CoAuthor lite descriptors for each participant (other than me).
      //    Only included when publishing on the feed — Q5 : "au nom de tout le monde".
      const coAuthors: CoAuthor[] = publishOnFeed
        ? Object.values(draft.participantDetails)
            .filter((p) => p.userId !== user.id)
            .map((p) => ({
              id: p.userId,
              username: p.username,
              displayName: p.displayName,
              initials: p.initials,
              avatarUrl: p.avatarUrl,
              avatarBg: p.avatarBg,
              avatarColor: p.avatarColor,
            }))
        : [];

      // 5) Create the Plan doc. Always created — the group conv needs a
      //    linkedPlanId for "Do it now" multi-user. Visibility controls
      //    whether the Plan appears in public feed queries.
      const plan = await createPlan(
        {
          title: draft.title,
          tags: defaultTags,
          places: planPlaces,
          price: '$$',
          duration: '',
          transport: defaultTransport,
          travelSegments: [],
          coverPhotos: sortedPlaces[0]?.photoUrl ? [sortedPlaces[0].photoUrl] : [],
          city: 'Paris',
          coAuthors,
          visibility: publishOnFeed ? 'public' : 'private',
          sourceDraftId: draft.id,
        },
        user,
      );

      // 5) Attach the plan to the EXISTING conversation (created at draft
      //    creation time so participants could chat during the prep phase).
      //    Fallback : if for some reason the draft has no conv id yet (legacy
      //    drafts pre-this-commit), create one on the fly to keep things working.
      let convId = draft.conversationId || draft.publishedConvId;
      if (convId) {
        await attachPlanToConversation(
          convId,
          {
            id: plan.id,
            title: plan.title,
            coverPhoto: plan.coverPhotos?.[0] ?? null,
          },
          meetupAt,
        );
      } else {
        const me: ConversationParticipant = {
          userId: user.id,
          displayName: user.displayName,
          username: user.username,
          avatarUrl: user.avatarUrl || null,
          avatarBg: user.avatarBg,
          avatarColor: user.avatarColor,
          initials: user.initials,
        };
        const others: ConversationParticipant[] = Object.values(draft.participantDetails)
          .filter((p) => p.userId !== user.id)
          .map((p) => ({
            userId: p.userId,
            displayName: p.displayName,
            username: p.username,
            avatarUrl: p.avatarUrl,
            avatarBg: p.avatarBg,
            avatarColor: p.avatarColor,
            initials: p.initials,
          }));
        convId = await createGroupConversation({
          creator: me,
          otherParticipants: others,
          plan: {
            id: plan.id,
            title: plan.title,
            coverPhoto: plan.coverPhotos?.[0] ?? null,
          },
          meetupAt: meetupAt || undefined,
        });
      }

      // 6) Mark the draft as locked + cross-linked.
      await markDraftLocked(
        draft.id,
        _userId,
        meetupAt,
        publishOnFeed ? plan.id : null,
        convId,
      );

      return { conversationId: convId, planId: plan.id };
    } catch (err) {
      console.warn('[coPlanStore] lockDraft error:', err);
      return null;
    }
  },

  isPresent: (otherUserId: string) => {
    const { draft } = get();
    if (!draft) return false;
    const ts = draft.presence?.[otherUserId];
    if (!ts) return false;
    return Date.now() - ts < 45_000; // 45s = ~2x heartbeat
  },
}));

// ══════════════════════════════════════════════════════════════
// Activity diff helper — pure function. Compares two consecutive
// PlanDraft snapshots and emits one event per meaningful change
// originating from a participant other than the current user.
// Discards events older than ACTIVITY_FRESHNESS_MS so we never
// flash a backlog when the workspace mounts after an action.
// ══════════════════════════════════════════════════════════════

const makeEventId = (() => {
  let n = 0;
  return () => `act-${Date.now().toString(36)}-${(++n).toString(36)}`;
})();

const buildActorMeta = (
  draft: PlanDraft,
  actorId: string,
): Pick<
  CoPlanActivityEvent,
  'actorId' | 'actorName' | 'actorAvatarBg' | 'actorAvatarColor' | 'actorAvatarUrl' | 'actorInitials'
> => {
  const p: CoPlanParticipant | undefined = draft.participantDetails[actorId];
  return {
    actorId,
    actorName: p ? p.displayName.split(' ')[0] : 'Quelqu\'un',
    actorAvatarBg: p?.avatarBg ?? '#D5C2B0',
    actorAvatarColor: p?.avatarColor ?? '#2C2420',
    actorAvatarUrl: p?.avatarUrl ?? null,
    actorInitials: p?.initials ?? '?',
  };
};

function diffDraftForActivity(
  prev: PlanDraft,
  next: PlanDraft,
  myUserId: string,
): CoPlanActivityEvent[] {
  const events: CoPlanActivityEvent[] = [];
  const now = Date.now();

  // 1) Places added / removed
  const prevPlaceIds = new Set(prev.proposedPlaces.map((p) => p.id));
  const nextPlaceIds = new Set(next.proposedPlaces.map((p) => p.id));

  for (const place of next.proposedPlaces) {
    if (prevPlaceIds.has(place.id)) continue;
    if (place.proposedBy === myUserId) continue;
    // Honour freshness — proposedAt is ISO; ignore if older than threshold.
    const proposedTs = Date.parse(place.proposedAt);
    if (!Number.isNaN(proposedTs) && now - proposedTs > ACTIVITY_FRESHNESS_MS) continue;
    events.push({
      id: makeEventId(),
      kind: 'place_added',
      detail: place.name,
      createdAt: now,
      ...buildActorMeta(next, place.proposedBy),
    });
  }
  for (const place of prev.proposedPlaces) {
    if (nextPlaceIds.has(place.id)) continue;
    if (place.proposedBy === myUserId) continue;
    // Removal doesn't carry actor metadata reliably (the writer is whoever
    // pressed × on the row — we approximate as the original proposer).
    events.push({
      id: makeEventId(),
      kind: 'place_removed',
      detail: place.name,
      createdAt: now,
      ...buildActorMeta(prev, place.proposedBy),
    });
  }

  // 2) Vote added on an existing place — actor is the user that just appeared
  //    in the votes array. We surface only ADDS (un-votes are silent).
  for (const place of next.proposedPlaces) {
    const prevPlace = prev.proposedPlaces.find((p) => p.id === place.id);
    if (!prevPlace) continue;
    const prevVoters = new Set(prevPlace.votes);
    for (const voter of place.votes) {
      if (prevVoters.has(voter)) continue;
      if (voter === myUserId) continue;
      events.push({
        id: makeEventId(),
        kind: 'vote_added',
        detail: place.name,
        createdAt: now,
        ...buildActorMeta(next, voter),
      });
    }
  }

  // 3) Availability — count NEW slots per other user, emit one toast per
  //    user-burst regardless of how many slots they ticked at once.
  for (const userId of Object.keys(next.availability)) {
    if (userId === myUserId) continue;
    const prevSlots = new Set(prev.availability[userId]?.slots || []);
    const nextSlots = next.availability[userId]?.slots || [];
    const added = nextSlots.filter((s) => !prevSlots.has(s));
    if (added.length === 0) continue;
    // Skip events for an updatedAt older than freshness — protects against
    // a "first observation" pre-existing slots being re-emitted.
    const ts = Date.parse(next.availability[userId].updatedAt);
    if (!Number.isNaN(ts) && now - ts > ACTIVITY_FRESHNESS_MS) continue;
    events.push({
      id: makeEventId(),
      kind: 'availability_added',
      detail: added.length === 1 ? '1 dispo' : `${added.length} dispos`,
      createdAt: now,
      ...buildActorMeta(next, userId),
    });
  }

  return events;
}
