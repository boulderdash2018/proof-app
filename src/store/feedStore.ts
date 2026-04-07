import { create } from 'zustand';
import { Plan, SavedPlan } from '../types';
import analytics from '../services/analyticsUtils';
import {
  fetchFeedPlans,
  fetchLikedPlanIds,
  fetchSavedPlanIds,
  toggleLikePlan,
  savePlan as savePlanFS,
  unsavePlan as unsavePlanFS,
} from '../services/plansService';
import { getFriendIds } from '../services/friendsService';
import { useSavesStore } from './savesStore';
import { useAuthStore } from './authStore';

// Helper to get current user id reliably
const getCurrentUserId = (): string | null => {
  return useAuthStore.getState().user?.id || null;
};

interface FeedStore {
  plans: Plan[];
  isLoading: boolean;
  isRefreshing: boolean;
  likedPlanIds: Set<string>;
  savedPlanIds: Set<string>;
  fetchFeed: (userId?: string, guestInterests?: string[]) => Promise<void>;
  refreshFeed: (guestInterests?: string[]) => Promise<void>;
  addPlan: (plan: Plan) => void;
  toggleLike: (planId: string) => void;
  toggleSave: (planId: string) => void;
}

export const useFeedStore = create<FeedStore>((set, get) => ({
  plans: [],
  isLoading: false,
  isRefreshing: false,
  likedPlanIds: new Set<string>(),
  savedPlanIds: new Set<string>(),

  fetchFeed: async (userId?: string, guestInterests?: string[]) => {
    const uid = userId || getCurrentUserId();
    set({ isLoading: true });
    try {
      let plans = await fetchFeedPlans();

      if (uid) {
        const [likedIds, savedIds, friendIds] = await Promise.all([
          fetchLikedPlanIds(uid),
          fetchSavedPlanIds(uid),
          getFriendIds(uid),
        ]);
        // Filter out plans from private accounts (unless own or friend)
        const friendSet = new Set(friendIds);
        plans = plans.filter((p) =>
          !p.author?.isPrivate || p.authorId === uid || friendSet.has(p.authorId)
        );
        set({ plans, isLoading: false, likedPlanIds: likedIds, savedPlanIds: savedIds } as any);
      } else {
        // Not logged in: filter out all private plans
        plans = plans.filter((p) => !p.author?.isPrivate);
        // Guest mode: filter by interests
        if (guestInterests && guestInterests.length > 0) {
          const interestsLower = guestInterests.map((i) => i.toLowerCase());
          plans = plans.filter((p) =>
            p.tags.some((tag) => interestsLower.includes(tag.toLowerCase()))
          );
        }
        set({ plans, isLoading: false } as any);
      }
    } catch (err) {
      console.error('fetchFeed error:', err);
      set({ isLoading: false });
    }
  },

  refreshFeed: async (guestInterests?: string[]) => {
    const uid = getCurrentUserId();
    set({ isRefreshing: true });
    try {
      let plans = await fetchFeedPlans();

      if (uid) {
        const [likedIds, savedIds, friendIds] = await Promise.all([
          fetchLikedPlanIds(uid),
          fetchSavedPlanIds(uid),
          getFriendIds(uid),
        ]);
        const friendSet = new Set(friendIds);
        plans = plans.filter((p) =>
          !p.author?.isPrivate || p.authorId === uid || friendSet.has(p.authorId)
        );
        set({ plans, isRefreshing: false, likedPlanIds: likedIds, savedPlanIds: savedIds } as any);
      } else {
        plans = plans.filter((p) => !p.author?.isPrivate);
        if (guestInterests && guestInterests.length > 0) {
          const interestsLower = guestInterests.map((i) => i.toLowerCase());
          plans = plans.filter((p) =>
            p.tags.some((tag) => interestsLower.includes(tag.toLowerCase()))
          );
        }
        set({ plans, isRefreshing: false } as any);
      }
    } catch {
      set({ isRefreshing: false });
    }
  },

  addPlan: (plan: Plan) => {
    const { plans } = get();
    set({ plans: [plan, ...plans] });
  },

  toggleLike: (planId: string) => {
    const uid = getCurrentUserId();
    if (!uid) { console.warn('[feedStore] toggleLike: no user id'); return; }

    const { likedPlanIds, plans } = get();
    const newLiked = new Set(likedPlanIds);
    const isLiked = newLiked.has(planId);
    const plan = plans.find((p) => p.id === planId);

    if (isLiked) {
      newLiked.delete(planId);
      analytics.planUnliked(planId);
    } else {
      newLiked.add(planId);
      if (plan) analytics.planLiked(planId, plan.title, plan.authorId);
    }

    const updatedPlans = plans.map((p) =>
      p.id === planId
        ? { ...p, likesCount: p.likesCount + (isLiked ? -1 : 1) }
        : p
    );

    set({ likedPlanIds: newLiked, plans: updatedPlans });
    // Persist to Firestore in background
    toggleLikePlan(uid, planId, isLiked).catch(console.error);
  },

  toggleSave: (planId: string) => {
    const uid = getCurrentUserId();
    if (!uid) { console.warn('[feedStore] toggleSave: no user id'); return; }

    const { savedPlanIds, plans } = get();
    const newSaved = new Set(savedPlanIds);
    const plan = plans.find((p) => p.id === planId);
    const savesStore = useSavesStore.getState();

    if (newSaved.has(planId)) {
      newSaved.delete(planId);
      analytics.planUnsaved(planId);
      savesStore.unsave(planId);
      // Persist to Firestore
      unsavePlanFS(uid, planId).catch(console.error);
    } else {
      newSaved.add(planId);
      if (plan) {
        analytics.planSaved(planId, plan.title);
        // Add to saves store as "to do"
        const entry: SavedPlan = { planId: plan.id, plan, isDone: false, savedAt: new Date().toISOString() };
        useSavesStore.setState((state) => ({ savedPlans: [entry, ...state.savedPlans] }));
        // Persist to Firestore
        savePlanFS(uid, planId).catch(console.error);
      }
    }

    set({ savedPlanIds: newSaved });
  },
}));
