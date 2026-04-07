import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface GuestStore {
  hasCompletedSurvey: boolean;
  city: string;
  interests: string[];
  wantsAuth: boolean;
  showAccountPrompt: boolean;
  completeSurvey: (city: string, interests: string[]) => void;
  setWantsAuth: (wants: boolean) => void;
  setShowAccountPrompt: (show: boolean) => void;
  reset: () => void;
}

export const useGuestStore = create<GuestStore>()(
  persist(
    (set) => ({
      hasCompletedSurvey: false,
      city: '',
      interests: [],
      wantsAuth: false,
      showAccountPrompt: false,

      completeSurvey: (city, interests) =>
        set({ hasCompletedSurvey: true, city, interests }),

      setWantsAuth: (wants) =>
        set({ wantsAuth: wants, showAccountPrompt: false }),

      setShowAccountPrompt: (show) =>
        set({ showAccountPrompt: show }),

      reset: () =>
        set({ hasCompletedSurvey: false, city: '', interests: [], wantsAuth: false, showAccountPrompt: false }),
    }),
    {
      name: 'proof-guest',
      partialize: (state) => ({
        hasCompletedSurvey: state.hasCompletedSurvey,
        city: state.city,
        interests: state.interests,
      }),
    }
  )
);
