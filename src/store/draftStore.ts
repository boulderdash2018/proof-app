import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DraftPlace {
  id: string;
  googlePlaceId?: string;
  name: string;
  type: string;
  address?: string;
  priceRangeIndex: number;
  exactPrice: string;
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

export interface DraftItem {
  id: string;
  title: string;
  coverPhotos: string[];
  selectedTags: string[];
  places: DraftPlace[];
  travels: DraftTravel[];
  updatedAt: number;
}

interface DraftStore {
  drafts: DraftItem[];
  saveDraft: (id: string, data: Omit<DraftItem, 'id' | 'updatedAt'>) => void;
  deleteDraft: (id: string) => void;
  getDraft: (id: string) => DraftItem | undefined;
  hasDrafts: () => boolean;
}

export const useDraftStore = create<DraftStore>()(
  persist(
    (set, get) => ({
      drafts: [],
      saveDraft: (id, data) => set((state) => {
        const idx = state.drafts.findIndex((d) => d.id === id);
        const item: DraftItem = { ...data, id, updatedAt: Date.now() };
        if (idx >= 0) {
          const updated = [...state.drafts];
          updated[idx] = item;
          return { drafts: updated };
        }
        return { drafts: [...state.drafts, item] };
      }),
      deleteDraft: (id) => set((state) => ({
        drafts: state.drafts.filter((d) => d.id !== id),
      })),
      getDraft: (id) => get().drafts.find((d) => d.id === id),
      hasDrafts: () => get().drafts.length > 0,
    }),
    {
      name: 'proof-create-draft',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      migrate: (persisted: any, version: number) => {
        // Migrate from v0/v1 single-draft format to v2 multi-draft
        if (version < 2 && persisted) {
          const old = persisted as any;
          if (old.title !== undefined && !old.drafts) {
            const drafts: DraftItem[] = [];
            if (old.title || old.places?.length > 0 || old.coverPhotos?.length > 0) {
              drafts.push({
                id: 'migrated-' + (old.savedAt || Date.now()),
                title: old.title || '',
                coverPhotos: old.coverPhotos || [],
                selectedTags: old.selectedTags || [],
                places: old.places || [],
                travels: old.travels || [],
                updatedAt: old.savedAt || Date.now(),
              });
            }
            return { drafts };
          }
        }
        return persisted as DraftStore;
      },
    }
  )
);

// Re-export for backward compat
export type DraftState = DraftItem;
