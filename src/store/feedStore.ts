import { create } from 'zustand';
import { Plan } from '../types';
import mockApi from '../services/mockApi';
import analytics from '../services/analyticsUtils';

interface FeedStore {
  plans: Plan[];
  isLoading: boolean;
  isRefreshing: boolean;
  likedPlanIds: Set<string>;
  savedPlanIds: Set<string>;
  fetchFeed: () => Promise<void>;
  refreshFeed: () => Promise<void>;
  toggleLike: (planId: string) => void;
  toggleSave: (planId: string) => void;
}

export const useFeedStore = create<FeedStore>((set, get) => ({
  plans: [],
  isLoading: false,
  isRefreshing: false,
  likedPlanIds: new Set<string>(),
  savedPlanIds: new Set<string>(['plan-2', 'plan-3']),

  fetchFeed: async () => {
    set({ isLoading: true });
    try {
      const plans = await mockApi.getFeed();
      set({ plans, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  refreshFeed: async () => {
    set({ isRefreshing: true });
    try {
      const plans = await mockApi.getFeed();
      set({ plans, isRefreshing: false });
    } catch {
      set({ isRefreshing: false });
    }
  },

  toggleLike: (planId: string) => {
    const { likedPlanIds, plans } = get();
    const newLiked = new Set(likedPlanIds);
    const isLiked = newLiked.has(planId);
    const plan = plans.find((p) => p.id === planId);

    if (isLiked) {
      newLiked.delete(planId);
      mockApi.unlikePlan(planId);
      analytics.planUnliked(planId);
    } else {
      newLiked.add(planId);
      mockApi.likePlan(planId);
      if (plan) {
        analytics.planLiked(planId, plan.title, plan.authorId);
      }
    }

    const updatedPlans = plans.map((p) =>
      p.id === planId
        ? { ...p, likesCount: p.likesCount + (isLiked ? -1 : 1) }
        : p
    );

    set({ likedPlanIds: newLiked, plans: updatedPlans });
  },

  toggleSave: (planId: string) => {
    const { savedPlanIds, plans } = get();
    const newSaved = new Set(savedPlanIds);
    const plan = plans.find((p) => p.id === planId);

    if (newSaved.has(planId)) {
      newSaved.delete(planId);
      mockApi.unsavePlan(planId);
      analytics.planUnsaved(planId);
    } else {
      newSaved.add(planId);
      mockApi.savePlan(planId);
      if (plan) {
        analytics.planSaved(planId, plan.title);
      }
    }

    set({ savedPlanIds: newSaved });
  },
}));
