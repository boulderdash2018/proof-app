import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Language = 'fr' | 'en';

interface LanguageStore {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const useLanguageStore = create<LanguageStore>()(
  persist(
    (set) => ({
      language: 'fr',
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'proof-language',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
