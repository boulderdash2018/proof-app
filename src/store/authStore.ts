import { create } from 'zustand';
import { User, SignupData } from '../types';
import { firebaseAuthService, updateUserProfile } from '../services/firebaseAuth';
import { trackEvent, identifyUser, resetUser } from '../services/posthogConfig';

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
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
      const user = await firebaseAuthService.login(email, password);
      set({ user, isAuthenticated: true, isLoading: false });

      // Track login event
      trackEvent('user_login', { email });
      identifyUser(user.id, { email: user.id });
    } catch (error: any) {
      set({ isLoading: false });
      trackEvent('login_failed', { email });
      throw error;
    }
  },

  loginWithGoogle: async () => {
    set({ isLoading: true });
    try {
      const user = await firebaseAuthService.signInWithGoogle();
      set({ user, isAuthenticated: true, isLoading: false });
      trackEvent('user_login_google', { email: user.username });
      identifyUser(user.id, { email: user.id });
    } catch (error: any) {
      set({ isLoading: false });
      trackEvent('login_google_failed');
      throw error;
    }
  },

  signup: async (data: SignupData) => {
    set({ isLoading: true });
    try {
      const user = await firebaseAuthService.signup(data);
      set({ user, isAuthenticated: true, isLoading: false });

      // Track signup event
      trackEvent('user_signup', { email: data.email });
      identifyUser(user.id, { email: user.id });
    } catch (error: any) {
      set({ isLoading: false });
      trackEvent('signup_failed', { email: data.email });
      throw error;
    }
  },

  logout: async () => {
    set({ user: null, isAuthenticated: false });
    trackEvent('user_logout');
    resetUser();
  },

  updateProfile: async (data: Partial<User>) => {
    const currentUser = get().user;
    if (!currentUser) return;
    await updateUserProfile(currentUser.id, data);
    set({ user: { ...currentUser, ...data } });
  },

  loadSession: async () => {
    set({ isLoading: true });
    try {
      const user = await firebaseAuthService.getCurrentUser();
      if (user) {
        set({ user, isAuthenticated: true, isLoading: false });
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  setUser: (user: User) => set({ user }),
}));
