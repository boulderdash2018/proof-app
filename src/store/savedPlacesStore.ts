import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SavedPlace {
  placeId: string;
  name: string;
  address: string;
  types: string[];
  rating: number;
  reviewCount: number;
  photoUrl: string | null;
  savedAt: number;
  /** Coords Google Places — optional pour rester rétrocompatible avec
   *  les saved places créés avant l'ajout de ces champs. Quand absentes,
   *  le lieu n'apparaît juste pas sur la wishlist map (mais reste dans
   *  la liste des saved places sans dégradation visible). */
  latitude?: number;
  longitude?: number;
}

interface SavedPlacesStore {
  places: SavedPlace[];
  savePlace: (place: SavedPlace) => void;
  unsavePlace: (placeId: string) => void;
  isPlaceSaved: (placeId: string) => boolean;
}

export const useSavedPlacesStore = create<SavedPlacesStore>()(
  persist(
    (set, get) => ({
      places: [],

      savePlace: (place) => {
        const { places } = get();
        if (places.some((p) => p.placeId === place.placeId)) return;
        set({ places: [place, ...places] });
      },

      unsavePlace: (placeId) => {
        set({ places: get().places.filter((p) => p.placeId !== placeId) });
      },

      isPlaceSaved: (placeId) => {
        return get().places.some((p) => p.placeId === placeId);
      },
    }),
    {
      name: 'proof-saved-places',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
