import { create } from 'zustand';
import { getFollowingIds, getUserById } from '../services/friendsService';

export interface MinimalUser {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  avatarBg: string;
  avatarColor: string;
  initials: string;
}

interface SocialProofStore {
  followingIds: string[];
  userCache: Record<string, MinimalUser>;
  loaded: boolean;
  init: (currentUserId: string) => Promise<void>;
  getUser: (id: string) => MinimalUser | undefined;
  ensureUsers: (ids: string[]) => Promise<void>;
}

export const useSocialProofStore = create<SocialProofStore>()((set, get) => ({
  followingIds: [],
  userCache: {},
  loaded: false,

  init: async (currentUserId: string) => {
    if (get().loaded) return;
    try {
      const ids = await getFollowingIds(currentUserId);
      set({ followingIds: ids, loaded: true });
      // Pre-fetch profiles for all following users
      const { ensureUsers } = get();
      ensureUsers(ids);
    } catch {
      set({ loaded: true });
    }
  },

  getUser: (id: string) => get().userCache[id],

  ensureUsers: async (ids: string[]) => {
    const cache = get().userCache;
    const missing = ids.filter((id) => !cache[id]);
    if (missing.length === 0) return;
    const results = await Promise.all(missing.map((id) => getUserById(id).catch(() => null)));
    const newEntries: Record<string, MinimalUser> = {};
    results.forEach((user) => {
      if (user) {
        newEntries[user.id] = {
          id: user.id,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          avatarBg: user.avatarBg,
          avatarColor: user.avatarColor,
          initials: user.initials,
        };
      }
    });
    if (Object.keys(newEntries).length > 0) {
      set((s) => ({ userCache: { ...s.userCache, ...newEntries } }));
    }
  },
}));
