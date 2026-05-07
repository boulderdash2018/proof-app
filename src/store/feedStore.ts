import { create } from 'zustand';
import { Plan, SavedPlan, Spot } from '../types';
import analytics from '../services/analyticsUtils';
import {
  fetchFeedPlans,
  fetchLikedPlanIds,
  fetchSavedPlanIds,
  toggleLikePlan,
  savePlan as savePlanFS,
  unsavePlan as unsavePlanFS,
} from '../services/plansService';
import { fetchFeedSpots } from '../services/spotsService';
import { getFriendIds, getMutualFollowIds, getFollowingIds } from '../services/friendsService';
import { useSavesStore } from './savesStore';
import { useAuthStore } from './authStore';
import { useTasteProfileStore } from './tasteProfileStore';

// Helper to get current user id reliably
const getCurrentUserId = (): string | null => {
  return useAuthStore.getState().user?.id || null;
};

type FeedTab = 'reco' | 'friends';

interface FeedStore {
  plans: Plan[];
  friendsPlans: Plan[];
  /** Spots du feed reco — interleave côté UI 1 toutes les 3 cartes. */
  spots: Spot[];
  isLoading: boolean;
  isRefreshing: boolean;
  isFriendsLoading: boolean;
  isFriendsRefreshing: boolean;
  likedPlanIds: Set<string>;
  savedPlanIds: Set<string>;
  /** Last viewed plan index per tab — persists across screen focus/blur so the feed
   * doesn't jump back to the start when the user navigates away and returns. */
  lastIndex: Record<FeedTab, number>;
  /** Which tab was active last — restored when the feed re-mounts. */
  lastTab: FeedTab;
  fetchFeed: (userId?: string, guestInterests?: string[], city?: string) => Promise<void>;
  refreshFeed: (guestInterests?: string[], city?: string) => Promise<void>;
  fetchFriendsFeed: (city?: string) => Promise<void>;
  refreshFriendsFeed: (city?: string) => Promise<void>;
  fetchSpots: (city?: string) => Promise<void>;
  addPlan: (plan: Plan) => void;
  toggleLike: (planId: string) => void;
  toggleSave: (planId: string) => void;
  setLastIndex: (tab: FeedTab, index: number) => void;
  setLastTab: (tab: FeedTab) => void;
}

export const useFeedStore = create<FeedStore>((set, get) => ({
  plans: [],
  friendsPlans: [],
  spots: [],
  isLoading: false,
  isRefreshing: false,
  isFriendsLoading: false,
  isFriendsRefreshing: false,
  likedPlanIds: new Set<string>(),
  savedPlanIds: new Set<string>(),
  lastIndex: { reco: 0, friends: 0 },
  lastTab: 'reco',

  setLastIndex: (tab, index) => {
    const current = get().lastIndex;
    if (current[tab] === index) return;
    set({ lastIndex: { ...current, [tab]: index } });
  },

  setLastTab: (tab) => {
    if (get().lastTab === tab) return;
    set({ lastTab: tab });
  },

  fetchFeed: async (userId?: string, guestInterests?: string[], city?: string) => {
    const uid = userId || getCurrentUserId();
    set({ isLoading: true });
    try {
      const [plansRaw, spots] = await Promise.all([
        fetchFeedPlans(city),
        fetchFeedSpots(city).catch((e) => { console.error('fetchFeedSpots error:', e); return []; }),
      ]);
      let plans = plansRaw;

      if (uid) {
        const [likedIds, savedIds, friendIds, followingIds] = await Promise.all([
          fetchLikedPlanIds(uid),
          fetchSavedPlanIds(uid),
          getFriendIds(uid),
          getFollowingIds(uid),
        ]);
        // Recommendations: public plans from followed accounts + own plans + friend plans
        const followingSet = new Set([...friendIds, ...followingIds]);
        plans = plans.filter((p) =>
          !p.author?.isPrivate || p.authorId === uid || followingSet.has(p.authorId)
        );
        set({ plans, spots, isLoading: false, likedPlanIds: likedIds, savedPlanIds: savedIds } as any);
      } else {
        // Not logged in: filter out all private plans
        plans = plans.filter((p) => !p.author?.isPrivate);
        // Guest mode: filter by interests
        if (guestInterests && guestInterests.length > 0) {
          const interestsLower = guestInterests.map((i) => i.toLowerCase());
          plans = plans.filter((p) =>
            p.tags.some((tag) => interestsLower.includes(tag.toLowerCase()))
          );
        }
        set({ plans, spots, isLoading: false } as any);
      }
    } catch (err) {
      console.error('fetchFeed error:', err);
      set({ isLoading: false });
    }
  },

  refreshFeed: async (guestInterests?: string[], city?: string) => {
    const uid = getCurrentUserId();
    set({ isRefreshing: true });
    try {
      const [plansRaw, spots] = await Promise.all([
        fetchFeedPlans(city),
        fetchFeedSpots(city).catch((e) => { console.error('fetchFeedSpots error:', e); return []; }),
      ]);
      let plans = plansRaw;

      if (uid) {
        const [likedIds, savedIds, friendIds, followingIds] = await Promise.all([
          fetchLikedPlanIds(uid),
          fetchSavedPlanIds(uid),
          getFriendIds(uid),
          getFollowingIds(uid),
        ]);
        const followingSet = new Set([...friendIds, ...followingIds]);
        plans = plans.filter((p) =>
          !p.author?.isPrivate || p.authorId === uid || followingSet.has(p.authorId)
        );
        set({ plans, spots, isRefreshing: false, likedPlanIds: likedIds, savedPlanIds: savedIds } as any);
      } else {
        plans = plans.filter((p) => !p.author?.isPrivate);
        if (guestInterests && guestInterests.length > 0) {
          const interestsLower = guestInterests.map((i) => i.toLowerCase());
          plans = plans.filter((p) =>
            p.tags.some((tag) => interestsLower.includes(tag.toLowerCase()))
          );
        }
        set({ plans, spots, isRefreshing: false } as any);
      }
    } catch {
      set({ isRefreshing: false });
    }
  },

  fetchSpots: async (city?: string) => {
    try {
      const spots = await fetchFeedSpots(city);
      set({ spots });
    } catch (err) {
      console.error('fetchSpots error:', err);
    }
  },

  fetchFriendsFeed: async (city?: string) => {
    const uid = getCurrentUserId();
    if (!uid) return;
    set({ isFriendsLoading: true });
    try {
      const [allPlans, mutualIds] = await Promise.all([
        fetchFeedPlans(city),
        getMutualFollowIds(uid),
      ]);
      const mutualSet = new Set(mutualIds);
      const friendsPlans = allPlans.filter((p) => mutualSet.has(p.authorId));
      set({ friendsPlans, isFriendsLoading: false });
    } catch (err) {
      console.error('fetchFriendsFeed error:', err);
      set({ isFriendsLoading: false });
    }
  },

  refreshFriendsFeed: async (city?: string) => {
    const uid = getCurrentUserId();
    if (!uid) return;
    set({ isFriendsRefreshing: true });
    try {
      const [allPlans, mutualIds] = await Promise.all([
        fetchFeedPlans(city),
        getMutualFollowIds(uid),
      ]);
      const mutualSet = new Set(mutualIds);
      const friendsPlans = allPlans.filter((p) => mutualSet.has(p.authorId));
      set({ friendsPlans, isFriendsRefreshing: false });
    } catch {
      set({ isFriendsRefreshing: false });
    }
  },

  addPlan: (plan: Plan) => {
    const { plans } = get();
    set({ plans: [plan, ...plans] });
  },

  toggleLike: (planId: string) => {
    const uid = getCurrentUserId();
    if (!uid) { console.warn('[feedStore] toggleLike: no user id'); return; }

    const { likedPlanIds, plans, friendsPlans } = get();
    const newLiked = new Set(likedPlanIds);
    const isLiked = newLiked.has(planId);
    const plan = plans.find((p) => p.id === planId) || friendsPlans.find((p) => p.id === planId);

    if (isLiked) {
      newLiked.delete(planId);
      analytics.planUnliked(planId);
    } else {
      newLiked.add(planId);
      if (plan) analytics.planLiked(planId, plan.title, plan.authorId);
    }

    const updateLikes = (p: Plan) => {
      if (p.id !== planId) return p;
      const newLikedByIds = isLiked
        ? (p.likedByIds || []).filter((id) => id !== uid)
        : [...(p.likedByIds || []), uid];
      return { ...p, likesCount: p.likesCount + (isLiked ? -1 : 1), likedByIds: newLikedByIds };
    };

    set({
      likedPlanIds: newLiked,
      plans: plans.map(updateLikes),
      friendsPlans: friendsPlans.map(updateLikes),
    });
    // Persist to Firestore in background + notify
    const sender = useAuthStore.getState().user || undefined;
    toggleLikePlan(uid, planId, isLiked, sender, plan || undefined).catch(console.error);
    // Capture taste profile signal (only on like, not unlike — un
    // unlike est un signal trop ambigu pour pondérer).
    if (!isLiked && plan) {
      // Capture taste profile signal — pondère "like" comme un signal
      // moyen (W=1). Cf. tasteProfileService.SIGNAL_WEIGHTS.
      useTasteProfileStore.getState().recordSignal({
        type: 'like',
        postId: planId,
        category: plan.tags?.[0]?.toLowerCase(),
        authorId: plan.authorId,
      });
    }
  },

  toggleSave: (planId: string) => {
    const uid = getCurrentUserId();
    if (!uid) { console.warn('[feedStore] toggleSave: no user id'); return; }

    const { savedPlanIds, plans, friendsPlans } = get();
    const newSaved = new Set(savedPlanIds);
    const plan = plans.find((p) => p.id === planId) || friendsPlans.find((p) => p.id === planId);
    const savesStore = useSavesStore.getState();

    let isSaving = false;

    if (newSaved.has(planId)) {
      // Block unsave if user already submitted a proof for this plan
      const savedEntry = savesStore.savedPlans.find((sp) => sp.planId === planId);
      if (savedEntry?.isDone) return;

      newSaved.delete(planId);
      analytics.planUnsaved(planId);
      savesStore.unsave(planId);
      // Persist to Firestore
      unsavePlanFS(uid, planId).catch(console.error);
    } else {
      isSaving = true;
      newSaved.add(planId);
      if (plan) {
        analytics.planSaved(planId, plan.title);
        // Add to saves store as "to do"
        const entry: SavedPlan = { planId: plan.id, plan, isDone: false, savedAt: new Date().toISOString() };
        useSavesStore.setState((state) => ({ savedPlans: [entry, ...state.savedPlans] }));
        // Persist to Firestore + notify
        const sender = useAuthStore.getState().user || undefined;
        savePlanFS(uid, planId, sender, plan).catch(console.error);
        // Capture taste profile signal — save = signal fort (W=2),
        // l'user a explicitement bookmark le plan.
        useTasteProfileStore.getState().recordSignal({
          type: 'save',
          postId: planId,
          category: plan.tags?.[0]?.toLowerCase(),
          authorId: plan.authorId,
        });
      }
    }

    // Update savedByIds optimistically so FloatingAvatars react immediately
    const updateSavedBy = (p: Plan) => {
      if (p.id !== planId) return p;
      return {
        ...p,
        savedByIds: isSaving
          ? [...(p.savedByIds || []), uid]
          : (p.savedByIds || []).filter((id) => id !== uid),
      };
    };

    set({
      savedPlanIds: newSaved,
      plans: plans.map(updateSavedBy),
      friendsPlans: friendsPlans.map(updateSavedBy),
    });
  },
}));
