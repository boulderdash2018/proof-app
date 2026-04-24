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
  makeLocalId,
  computeOverlapCounts,
} from '../services/planDraftService';

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

  // ── Derived helpers (pure reads, compute on demand) ──
  getSortedPlaces: () => CoPlanProposedPlace[];
  getOverlapCounts: () => Record<string, number>;
  getMySlots: () => string[];
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

  isPresent: (otherUserId: string) => {
    const { draft } = get();
    if (!draft) return false;
    const ts = draft.presence?.[otherUserId];
    if (!ts) return false;
    return Date.now() - ts < 45_000; // 45s = ~2x heartbeat
  },
}));
