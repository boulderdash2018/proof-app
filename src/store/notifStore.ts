import { create } from 'zustand';
import { Notification } from '../types';
import mockApi from '../services/mockApi';

interface NotifStore {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  fetchNotifications: () => Promise<void>;
  markAllRead: () => void;
  markRead: (id: string) => void;
}

export const useNotifStore = create<NotifStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,

  fetchNotifications: async () => {
    set({ isLoading: true });
    try {
      const notifications = await mockApi.getNotifications();
      const unreadCount = notifications.filter((n) => !n.isRead).length;
      set({ notifications, unreadCount, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  markAllRead: () => {
    const { notifications } = get();
    const updated = notifications.map((n) => ({ ...n, isRead: true }));
    set({ notifications: updated, unreadCount: 0 });
    mockApi.markAllNotificationsRead();
  },

  markRead: (id: string) => {
    const { notifications } = get();
    const updated = notifications.map((n) =>
      n.id === id ? { ...n, isRead: true } : n
    );
    const unreadCount = updated.filter((n) => !n.isRead).length;
    set({ notifications: updated, unreadCount });
    mockApi.markNotificationRead(id);
  },
}));
