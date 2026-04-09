import { create } from 'zustand';
import { Notification } from '../types';
import {
  fetchNotifications as fetchNotifs,
  subscribeToUnreadCount,
  subscribeToNotifications,
  markNotificationRead as markReadService,
  markAllNotificationsRead as markAllService,
} from '../services/notificationsService';
import { QueryDocumentSnapshot } from 'firebase/firestore';

interface NotifStore {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  hasMore: boolean;
  lastDoc: QueryDocumentSnapshot | null;
  _unsubUnread: (() => void) | null;
  _unsubNotifs: (() => void) | null;

  subscribe: (userId: string) => void;
  unsubscribe: () => void;
  fetchNotifications: (userId: string) => Promise<void>;
  loadMore: (userId: string) => Promise<void>;
  markAllRead: (userId: string) => void;
  markRead: (id: string) => void;
  setUnreadCount: (count: number) => void;
}

export const useNotifStore = create<NotifStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  hasMore: true,
  lastDoc: null,
  _unsubUnread: null,
  _unsubNotifs: null,

  subscribe: (userId: string) => {
    // Unsubscribe existing listeners
    get().unsubscribe();
    // Real-time unread count badge
    const unsubUnread = subscribeToUnreadCount(userId, (count) => {
      set({ unreadCount: count });
    });
    // Real-time notification list
    const unsubNotifs = subscribeToNotifications(userId, (notifications) => {
      set({ notifications });
    });
    set({ _unsubUnread: unsubUnread, _unsubNotifs: unsubNotifs });
  },

  unsubscribe: () => {
    const { _unsubUnread, _unsubNotifs } = get();
    _unsubUnread?.();
    _unsubNotifs?.();
    set({ _unsubUnread: null, _unsubNotifs: null });
  },

  fetchNotifications: async (userId: string) => {
    set({ isLoading: true });
    try {
      const { notifications, lastVisible } = await fetchNotifs(userId);
      set({ notifications, lastDoc: lastVisible, hasMore: notifications.length >= 20, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  loadMore: async (userId: string) => {
    const { lastDoc, hasMore, isLoading } = get();
    if (!hasMore || isLoading) return;
    set({ isLoading: true });
    try {
      const { notifications: more, lastVisible } = await fetchNotifs(userId, lastDoc);
      set((state) => ({
        notifications: [...state.notifications, ...more],
        lastDoc: lastVisible,
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

  setUnreadCount: (count: number) => set({ unreadCount: count }),
}));
