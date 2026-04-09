import { create } from 'zustand';
import { computeTrendingCategories, TrendingCategory } from '../services/trendingService';

interface TrendingStore {
  categories: TrendingCategory[];
  topTags: string[];          // top 5 tag names — used by PlanCard for badge
  isLoading: boolean;
  lastFetched: number | null;
  fetchTrending: () => Promise<void>;
}

const CACHE_MS = 5 * 60 * 1000; // 5-minute cache

export const useTrendingStore = create<TrendingStore>((set, get) => ({
  categories: [],
  topTags: [],
  isLoading: false,
  lastFetched: null,

  fetchTrending: async () => {
    const { lastFetched, isLoading } = get();
    if (isLoading) return;
    if (lastFetched && Date.now() - lastFetched < CACHE_MS) return;

    set({ isLoading: true });
    try {
      const categories = await computeTrendingCategories();
      const topTags = categories.slice(0, 5).map((c) => c.name);
      set({ categories, topTags, lastFetched: Date.now() });
    } catch (err) {
      console.error('[trendingStore] fetch error:', err);
    } finally {
      set({ isLoading: false });
    }
  },
}));
