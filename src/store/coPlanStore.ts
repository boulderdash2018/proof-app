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
import { createGroupConversation, ConversationParticipant } from '../services/chatService';
import { useAuthStore } from './authStore';
import { Place, CategoryTag, TransportMode } from '../types';

/**
 * Observes a single active draft at a time (what the workspace screen shows).
 * All mutations apply optimistically then persist.
 *
 * The heartbeat timer is owned here so any screen subscribing to the store
 * automatically announces presence while mounted.
 */

const PRESENCE_INTERVAL_MS = 20_000;

interface CoPlanStore {
  // ── Observation of a single draft ──
  draft: PlanDraft | null;
  draftId: string | null;
  _unsub: (() => void) | null;
  _userId: string | null;
  _presenceTimer: ReturnType<typeof setInterval> | null;

  // ── Actions — subscription ──
  observeDraft: (draftId: string, userId: string) => void;
  stopObserving: () => void;

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

export const useCoPlanStore = create<CoPlanStore>((set, get) => ({
  draft: null,
  draftId: null,
  _unsub: null,
  _userId: null,
  _presenceTimer: null,

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

    set({
      draftId,
      draft: null,
      _userId: userId,
    });

    const unsub = subscribePlanDraft(draftId, (draft) => {
      set({ draft });
    });

    // Fire first heartbeat immediately, then every 20s.
    svcPingPresence(draftId, userId).catch(() => {});
    const timer = setInterval(() => {
      svcPingPresence(draftId, userId).catch(() => {});
    }, PRESENCE_INTERVAL_MS);

    set({ _unsub: unsub, _presenceTimer: timer });
  },

  stopObserving: () => {
    const { _unsub, _presenceTimer } = get();
    _unsub?.();
    if (_presenceTimer) clearInterval(_presenceTimer);
    set({
      _unsub: null,
      _presenceTimer: null,
      draftId: null,
      draft: null,
      _userId: null,
    });
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
    const newPlace: CoPlanProposedPlace = {
      id: makeLocalId(),
      googlePlaceId: input.googlePlaceId,
      name: input.name,
      address: input.address,
      photoUrl: input.photoUrl,
      category: input.category,
      priceLevel: input.priceLevel,
      estimatedDurationMin: input.estimatedDurationMin,
      latitude: input.latitude,
      longitude: input.longitude,
      proposedBy: _userId,
      proposedAt: new Date().toISOString(),
      votes: [_userId],
      orderIndex: (draft.proposedPlaces.reduce((m, p) => Math.max(m, p.orderIndex), 0) + 1),
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
    } catch (err) {
      console.warn('[coPlanStore] proposePlace error:', err);
    }
  },

  removePlace: async (placeId: string) => {
    const { draftId, draft } = get();
    if (!draftId || !draft) return;
    set({
      draft: {
        ...draft,
        proposedPlaces: draft.proposedPlaces.filter((p) => p.id !== placeId),
      },
    });
    try {
      await svcRemovePlace(draftId, placeId);
    } catch (err) {
      console.warn('[coPlanStore] removePlace error:', err);
    }
  },

  toggleVote: async (placeId: string) => {
    const { draftId, draft, _userId } = get();
    if (!draftId || !draft || !_userId) return;
    const next = draft.proposedPlaces.map((p) => {
      if (p.id !== placeId) return p;
      const has = p.votes.includes(_userId);
      return {
        ...p,
        votes: has ? p.votes.filter((u) => u !== _userId) : [...p.votes, _userId],
      };
    });
    set({ draft: { ...draft, proposedPlaces: next } });
    try {
      await svcTogglePlaceVote(draftId, placeId, _userId);
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

      // 4) Create the Plan doc. We always create it — the group conv needs
      //    a linkedPlanId to enable the "Do it now" multi-user flow.
      //    Commit 11 will gate feed visibility based on publishOnFeed.
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
        },
        user,
      );

      // 5) Create the group conversation linking the plan.
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

      const convId = await createGroupConversation({
        creator: me,
        otherParticipants: others,
        plan: {
          id: plan.id,
          title: plan.title,
          coverPhoto: plan.coverPhotos?.[0] ?? null,
        },
        meetupAt: meetupAt || undefined,
      });

      // 6) Mark the draft as locked + cross-linked.
      await markDraftLocked(
        draft.id,
        _userId,
        meetupAt,
        publishOnFeed ? plan.id : null, // only record publishedPlanId if meant to be on feed (used by commit 11)
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
