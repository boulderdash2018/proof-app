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
  fetchFeed: (userId?: string) => Promise<void>;
  refreshFeed: () => Promise<void>;
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

  fetchFeed: async (userId?: string) => {
    const uid = userId || getCurrentUserId();
    set({ isLoading: true });
    try {
      const plans = await fetchFeedPlans();
      const updates: Partial<FeedStore> = { plans, isLoading: false };

      if (uid) {
        const [likedIds, savedIds] = await Promise.all([
          fetchLikedPlanIds(uid),
          fetchSavedPlanIds(uid),
        ]);
        updates.likedPlanIds = likedIds;
        updates.savedPlanIds = savedIds;
      }

      set(updates as any);
    } catch (err) {
      console.error('fetchFeed error:', err);
      set({ isLoading: false });
    }
  },

  refreshFeed: async () => {
    const uid = getCurrentUserId();
    set({ isRefreshing: true });
    try {
      const plans = await fetchFeedPlans();
      const updates: Partial<FeedStore> = { plans, isRefreshing: false };

      if (uid) {
        const [likedIds, savedIds] = await Promise.all([
          fetchLikedPlanIds(uid),
          fetchSavedPlanIds(uid),
        ]);
        updates.likedPlanIds = likedIds;
        updates.savedPlanIds = savedIds;
      }

      set(updates as any);
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
