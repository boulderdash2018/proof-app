import { create } from 'zustand';
import { Plan, SavedPlan } from '../types';
import {
  fetchSavedPlans,
  markPlanAsDone,
  unsavePlan as unsavePlanFS,
  saveCreatedPlan,
} from '../services/plansService';

interface SavesStore {
  savedPlans: SavedPlan[];
  isLoading: boolean;
  currentUserId: string | null;
  fetchSaves: (userId?: string) => Promise<void>;
  markAsDone: (planId: string) => void;
  addCreatedPlan: (plan: Plan) => void;
  unsave: (planId: string) => void;
}

export const useSavesStore = create<SavesStore>((set, get) => ({
  savedPlans: [],
  isLoading: false,
  currentUserId: null,

  fetchSaves: async (userId?: string) => {
    const uid = userId || get().currentUserId;
    if (!uid) return;
    set({ isLoading: true, currentUserId: uid });
    try {
      const savedPlans = await fetchSavedPlans(uid);
      set({ savedPlans, isLoading: false });
    } catch (err) {
      console.error('fetchSaves error:', err);
      set({ isLoading: false });
    }
  },

  markAsDone: (planId: string) => {
    const { savedPlans, currentUserId } = get();
    const updated = savedPlans.map((sp) =>
      sp.planId === planId ? { ...sp, isDone: true } : sp
    );
    set({ savedPlans: updated });
    // Persist to Firestore
    if (currentUserId) {
      markPlanAsDone(currentUserId, planId).catch(console.error);
    }
  },

  addCreatedPlan: (plan: Plan) => {
    const { savedPlans, currentUserId } = get();
    const entry: SavedPlan = { planId: plan.id, plan, isDone: true, savedAt: new Date().toISOString() };
    set({ savedPlans: [entry, ...savedPlans] });
    // Persist to Firestore
    if (currentUserId) {
      saveCreatedPlan(currentUserId, plan.id).catch(console.error);
    }
  },

  unsave: (planId: string) => {
    const { savedPlans, currentUserId } = get();
    set({ savedPlans: savedPlans.filter((sp) => sp.planId !== planId) });
    // Persist to Firestore
    if (currentUserId) {
      unsavePlanFS(currentUserId, planId).catch(console.error);
    }
  },
}));
