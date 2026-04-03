import { create } from 'zustand';

export type Language = 'fr' | 'en';

interface LanguageStore {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const useLanguageStore = create<LanguageStore>((set) => ({
  language: 'fr',
  setLanguage: (language) => set({ language }),
}));
