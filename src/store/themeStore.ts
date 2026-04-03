import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ThemeStore {
  isDark: boolean;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      isDark: false,
      toggleTheme: () => set((s) => ({ isDark: !s.isDark })),
    }),
    {
      name: 'proof-theme',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
