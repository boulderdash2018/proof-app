import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DraftPlace {
  id: string;
  googlePlaceId?: string;
  name: string;
  type: string;
  address?: string;
  price: string;
  duration: string;
  customPhoto?: string;
  comment?: string;
  questionAnswer?: string;
  question?: string;
}

interface DraftTravel {
  fromId: string;
  toId: string;
  duration: string;
  transport: string;
}

export interface DraftState {
  title: string;
  coverPhotos: string[];
  selectedTags: string[];
  places: DraftPlace[];
  travels: DraftTravel[];
  savedAt: number | null;
}

interface DraftStore extends DraftState {
  saveDraft: (draft: Omit<DraftState, 'savedAt'>) => void;
  clearDraft: () => void;
  hasDraft: () => boolean;
}

const EMPTY: DraftState = {
  title: '',
  coverPhotos: [],
  selectedTags: [],
  places: [],
  travels: [],
  savedAt: null,
};

export const useDraftStore = create<DraftStore>()(
  persist(
    (set, get) => ({
      ...EMPTY,
      saveDraft: (draft) => set({ ...draft, savedAt: Date.now() }),
      clearDraft: () => set(EMPTY),
      hasDraft: () => {
        const s = get();
        return s.title.length > 0 || s.places.length > 0 || s.coverPhotos.length > 0;
      },
    }),
    {
      name: 'proof-create-draft',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
