import { create } from 'zustand';
import { Notification } from '../types';
import {
  fetchNotifications as fetchNotifs,
  markNotificationRead as markReadService,
  markAllNotificationsRead as markAllService,
} from '../services/notificationsService';
import {
  collection, query, where, orderBy, limit, onSnapshot,
} from 'firebase/firestore';
import { db } from '../services/firebaseConfig';

interface NotifStore {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  hasMore: boolean;
  _unsub: (() => void) | null;
  _userId: string | null;

  subscribe: (userId: string) => void;
  unsubscribe: () => void;
  fetchNotifications: (userId: string) => Promise<void>;
  loadMore: (userId: string) => Promise<void>;
  markAllRead: (userId: string) => void;
  markRead: (id: string) => void;
}

export const useNotifStore = create<NotifStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  hasMore: true,
  _unsub: null,
  _userId: null,

  subscribe: (userId: string) => {
    // Don't re-subscribe if already listening to this user
    if (get()._userId === userId && get()._unsub) return;
    get().unsubscribe();

    try {
      const q = query(
        collection(db, 'notifications'),
        where('recipientId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(30)
      );
      const unsub = onSnapshot(q, (snap) => {
        const notifications: Notification[] = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        } as Notification));
        const unreadCount = notifications.filter((n) => !n.read).length;
        set({ notifications, unreadCount });
      }, (err) => {
        // Silently handle — likely missing index
        console.warn('[notifStore] onSnapshot error:', err.message);
      });
      set({ _unsub: unsub, _userId: userId });
    } catch (err) {
      console.warn('[notifStore] subscribe error:', err);
    }
  },

  unsubscribe: () => {
    const { _unsub } = get();
    _unsub?.();
    set({ _unsub: null, _userId: null });
  },

  fetchNotifications: async (userId: string) => {
    set({ isLoading: true });
    try {
      const { notifications, lastVisible } = await fetchNotifs(userId);
      const unreadCount = notifications.filter((n) => !n.read).length;
      set({ notifications, unreadCount, hasMore: notifications.length >= 20, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  loadMore: async (userId: string) => {
    const { hasMore, isLoading, notifications } = get();
    if (!hasMore || isLoading || notifications.length === 0) return;
    set({ isLoading: true });
    try {
      const { notifications: more } = await fetchNotifs(userId);
      set((state) => ({
        notifications: [...state.notifications, ...more],
        hasMore: more.length >= 20,
        isLoading: false,
      }));
    } catch {
      set({ isLoading: false });
    }
  },

  markAllRead: (userId: string) => {
    const { notifications } = get();
    const updated = notifications.map((n) => ({ ...n, read: true }));
    set({ notifications: updated, unreadCount: 0 });
    markAllService(userId).catch(() => {});
  },

  markRead: (id: string) => {
    const { notifications } = get();
    const updated = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    const unreadCount = updated.filter((n) => !n.read).length;
    set({ notifications: updated, unreadCount });
    markReadService(id).catch(() => {});
  },
}));
