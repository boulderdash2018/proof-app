import { create } from 'zustand';
import { computeTrendingCategories, TrendingCategory } from '../services/trendingService';

interface TrendingStore {
  categories: TrendingCategory[];
  topTags: string[];          // top 5 tag names — used by PlanCard for badge
  isLoading: boolean;
  lastFetched: number | null;
  lastCity: string | null;
  fetchTrending: (city?: string) => Promise<void>;
}

const CACHE_MS = 5 * 60 * 1000; // 5-minute cache

export const useTrendingStore = create<TrendingStore>((set, get) => ({
  categories: [],
  topTags: [],
  isLoading: false,
  lastFetched: null,
  lastCity: null,

  fetchTrending: async (city?: string) => {
    const { lastFetched, lastCity, isLoading } = get();
    if (isLoading) return;
    const cityChanged = city !== lastCity;
    if (!cityChanged && lastFetched && Date.now() - lastFetched < CACHE_MS) return;

    set({ isLoading: true });
    try {
      const categories = await computeTrendingCategories(city);
      const topTags = categories.slice(0, 5).map((c) => c.name);
      set({ categories, topTags, lastFetched: Date.now(), lastCity: city || null });
    } catch (err) {
      console.error('[trendingStore] fetch error:', err);
    } finally {
      set({ isLoading: false });
    }
  },
}));
