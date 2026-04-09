import { create } from 'zustand';
import { Plan, SavedPlan, ProofStatus } from '../types';
import {
  fetchSavedPlans,
  markPlanAsDone,
  unsavePlan as unsavePlanFS,
  saveCreatedPlan,
} from '../services/plansService';
import { useAuthStore } from './authStore';

const getCurrentUserId = (): string | null => {
  return useAuthStore.getState().user?.id || null;
};

interface SavesStore {
  savedPlans: SavedPlan[];
  isLoading: boolean;
  fetchSaves: (userId?: string) => Promise<void>;
  markAsDone: (planId: string, proofStatus?: ProofStatus) => void;
  addCreatedPlan: (plan: Plan) => void;
  unsave: (planId: string) => void;
}

export const useSavesStore = create<SavesStore>((set, get) => ({
  savedPlans: [],
  isLoading: false,

  fetchSaves: async (userId?: string) => {
    const uid = userId || getCurrentUserId();
    if (!uid) return;
    set({ isLoading: true });
    try {
      const savedPlans = await fetchSavedPlans(uid);
      set({ savedPlans, isLoading: false });
    } catch (err) {
      console.error('fetchSaves error:', err);
      set({ isLoading: false });
    }
  },

  markAsDone: (planId: string, proofStatus?: ProofStatus) => {
    const uid = getCurrentUserId();
    const sender = useAuthStore.getState().user || undefined;
    const { savedPlans } = get();
    const plan = savedPlans.find((sp) => sp.planId === planId)?.plan || undefined;
    const updated = savedPlans.map((sp) =>
      sp.planId === planId ? { ...sp, isDone: true, proofStatus } : sp
    );
    set({ savedPlans: updated });
    if (uid) markPlanAsDone(uid, planId, proofStatus, sender, plan).catch(console.error);
  },

  addCreatedPlan: (plan: Plan) => {
    const uid = getCurrentUserId();
    const { savedPlans } = get();
    const entry: SavedPlan = { planId: plan.id, plan, isDone: true, savedAt: new Date().toISOString() };
    set({ savedPlans: [entry, ...savedPlans] });
    if (uid) saveCreatedPlan(uid, plan.id).catch(console.error);
  },

  unsave: (planId: string) => {
    const uid = getCurrentUserId();
    const { savedPlans } = get();
    set({ savedPlans: savedPlans.filter((sp) => sp.planId !== planId) });
    if (uid) unsavePlanFS(uid, planId).catch(console.error);
  },
}));
