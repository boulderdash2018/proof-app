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

  /**
   * Mark a plan as done with optional proof status.
   *
   * Robust against missing entries: if the planId is not yet in savedPlans
   * (e.g. user proofs a plan they never bookmarked), we INSERT a new entry
   * with the done/validated state rather than silently no-op'ing. This was
   * the root cause of the "impossible d'enregistrer la proof + l'user peut
   * re-proof" bug — the map() approach only mutated existing entries.
   */
  markAsDone: (planId: string, proofStatus?: ProofStatus) => {
    const uid = getCurrentUserId();
    const sender = useAuthStore.getState().user || undefined;
    const { savedPlans } = get();
    const existing = savedPlans.find((sp) => sp.planId === planId);

    let updated: SavedPlan[];
    if (existing) {
      updated = savedPlans.map((sp) =>
        sp.planId === planId ? { ...sp, isDone: true, proofStatus } : sp
      );
    } else {
      // No existing entry → insert a minimal one. The plan payload is only
      // known locally when the caller provides it via the store elsewhere;
      // here we insert with a null plan so the entry is at least findable
      // for the isAlreadyProofed check. Subsequent fetchSaves will hydrate
      // the full Plan object from Firestore.
      updated = [
        { planId, plan: null as any, isDone: true, proofStatus, savedAt: new Date().toISOString() },
        ...savedPlans,
      ];
    }
    set({ savedPlans: updated });
    if (uid) markPlanAsDone(uid, planId, proofStatus, sender, existing?.plan).catch(console.error);
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
