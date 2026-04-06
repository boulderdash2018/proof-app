import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SettingsStore {
  // Notification preferences
  notifLikes: boolean;
  notifFollowers: boolean;
  notifComments: boolean;
  notifReminders: boolean;
  setNotifLikes: (v: boolean) => void;
  setNotifFollowers: (v: boolean) => void;
  setNotifComments: (v: boolean) => void;
  setNotifReminders: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      // Notification defaults
      notifLikes: true,
      notifFollowers: true,
      notifComments: true,
      notifReminders: false,
      setNotifLikes: (v) => set({ notifLikes: v }),
      setNotifFollowers: (v) => set({ notifFollowers: v }),
      setNotifComments: (v) => set({ notifComments: v }),
      setNotifReminders: (v) => set({ notifReminders: v }),
    }),
    {
      name: 'proof-settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
