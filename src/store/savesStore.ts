import { create } from 'zustand';
import { Plan, SavedPlan } from '../types';
import mockApi from '../services/mockApi';

interface SavesStore {
  savedPlans: SavedPlan[];
  isLoading: boolean;
  fetchSaves: () => Promise<void>;
  markAsDone: (planId: string) => void;
  addCreatedPlan: (plan: Plan) => void;
  unsave: (planId: string) => void;
}

export const useSavesStore = create<SavesStore>((set, get) => ({
  savedPlans: [],
  isLoading: false,

  fetchSaves: async () => {
    set({ isLoading: true });
    try {
      const savedPlans = await mockApi.getSavedPlans();
      set({ savedPlans, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  markAsDone: (planId: string) => {
    const { savedPlans } = get();
    const updated = savedPlans.map((sp) =>
      sp.planId === planId ? { ...sp, isDone: true } : sp
    );
    set({ savedPlans: updated });
    mockApi.markPlanDone(planId);
  },

  addCreatedPlan: (plan: Plan) => {
    const { savedPlans } = get();
    const entry: SavedPlan = { planId: plan.id, plan, isDone: true, savedAt: new Date().toISOString() };
    set({ savedPlans: [entry, ...savedPlans] });
  },

  unsave: (planId: string) => {
    const { savedPlans } = get();
    set({ savedPlans: savedPlans.filter((sp) => sp.planId !== planId) });
    mockApi.unsavePlan(planId);
  },
}));
