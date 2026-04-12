import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface RecentSearchesStore {
  searches: string[];
  addSearch: (query: string) => void;
  clearSearches: () => void;
}

export const useRecentSearchesStore = create<RecentSearchesStore>()(
  persist(
    (set, get) => ({
      searches: [],

      addSearch: (query: string) => {
        const trimmed = query.trim();
        if (!trimmed) return;
        const filtered = get().searches.filter((s) => s !== trimmed);
        set({ searches: [trimmed, ...filtered].slice(0, 5) });
      },

      clearSearches: () => set({ searches: [] }),
    }),
    {
      name: 'proof-recent-searches',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
