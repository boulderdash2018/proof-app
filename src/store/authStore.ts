import { create } from 'zustand';
import { User, SignupData } from '../types';
import mockApi from '../services/mockApi';

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: SignupData) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  loadSession: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const user = await mockApi.login(email, password);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      set({ isLoading: false });
      throw new Error('Identifiants incorrects');
    }
  },

  signup: async (data: SignupData) => {
    set({ isLoading: true });
    try {
      const user = await mockApi.signup(data);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      set({ isLoading: false });
      throw new Error("Erreur lors de l'inscription");
    }
  },

  logout: async () => {
    set({ user: null, isAuthenticated: false });
  },

  updateProfile: async (data: Partial<User>) => {
    const updated = await mockApi.updateProfile(data);
    set({ user: updated });
  },

  loadSession: async () => {
    set({ isLoading: true });
    try {
      // Simulate checking stored session
      const user = await mockApi.getCurrentUser();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  setUser: (user: User) => set({ user }),
}));
