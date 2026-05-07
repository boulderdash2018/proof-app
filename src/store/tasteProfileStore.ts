/**
 * Taste profile store — Zustand wrapper avec cache AsyncStorage pour
 * lecture instantanée au launch, sync Firestore en background.
 *
 * Pattern :
 *   1. Au signin / launch : `init(userId)` → charge depuis cache local
 *      (instantané) puis fetch Firestore en background (sync).
 *   2. Pendant la session : `recordSignal()` met à jour le profile
 *      LOCAL immédiatement (optimiste) — l'algo de ranking voit le
 *      changement sans round-trip serveur.
 *   3. Toutes les 30s ou au background, `flushSignals()` push la
 *      queue vers Firestore et merge sur taste_profile/main.
 *   4. Si l'user signout → `reset()` clear le cache.
 *
 * Le store est branché au service via `setProfileChangeListener` au
 * mount, garantissant que les writes optimistes du service mettent
 * à jour l'état Zustand → l'UI re-render.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  TasteProfile,
  loadTasteProfile,
  flushSignals,
  recordSignal as svcRecordSignal,
  setProfileChangeListener,
  saveOnboardingPrefs as svcSaveOnboardingPrefs,
  OnboardingPrefs,
  FeedSignal,
} from '../services/tasteProfileService';

interface TasteProfileStore {
  /** Profile courant — null si user pas connecté ou pas encore chargé. */
  profile: TasteProfile | null;
  /** Set des post IDs vus dans cette session (in-memory only) — pas
   *  persisté car volatile par design (à chaque app open on repart
   *  vierge pour la session). */
  seenInSession: Set<string>;
  /** True quand le store est initialisé pour le user courant. */
  isReady: boolean;

  /** À appeler au signin / app launch. Idempotent. */
  init: (userId: string) => Promise<void>;
  /** Reset au signout. */
  reset: () => void;
  /** Push un signal — instant, optimiste, debounced flush. */
  recordSignal: (signal: Omit<FeedSignal, 'id' | 'userId' | 'ts'>) => void;
  /** Marque un post comme vu dans la session. */
  markSeen: (postId: string) => void;
  /** Flush forcé — appelé au pull-to-refresh ou app background. */
  flush: () => Promise<void>;
  /** Persiste les onboarding prefs et update le profile. */
  setOnboardingPrefs: (prefs: OnboardingPrefs) => Promise<void>;
}

export const useTasteProfileStore = create<TasteProfileStore>()(
  persist(
    (set, get) => ({
      profile: null,
      seenInSession: new Set(),
      isReady: false,

      init: async (userId: string) => {
        // Si déjà initialisé pour ce user, no-op.
        if (get().isReady && get().profile?.userId === userId) return;

        // Branche le service → store pour les updates optimistes.
        setProfileChangeListener((updater) => {
          set((s) => {
            const next = updater(s.profile);
            return next ? { profile: next } : {};
          });
        });

        // Cache hit : on a déjà un profile en local pour ce user, on
        // l'utilise instantanément. Sync Firestore en background.
        const cached = get().profile;
        if (cached && cached.userId === userId) {
          set({ isReady: true });
        }

        // Fetch frais depuis Firestore (peut overrider le cache si
        // les compteurs ont divergé via un autre device).
        try {
          const fresh = await loadTasteProfile(userId);
          set({ profile: fresh, isReady: true });
        } catch (err) {
          console.warn('[tasteProfileStore] init failed:', err);
          set({ isReady: true }); // marque ready même en erreur pour
                                  // ne pas bloquer l'UI
        }
      },

      reset: () => {
        set({ profile: null, seenInSession: new Set(), isReady: false });
        setProfileChangeListener(() => {});
      },

      recordSignal: (signal) => {
        const profile = get().profile;
        if (!profile) return; // pas connecté, on ignore
        svcRecordSignal(profile.userId, signal);
      },

      markSeen: (postId) => {
        set((s) => {
          if (s.seenInSession.has(postId)) return {};
          const next = new Set(s.seenInSession);
          next.add(postId);
          return { seenInSession: next };
        });
      },

      flush: async () => {
        try {
          await flushSignals();
        } catch (err) {
          console.warn('[tasteProfileStore] flush failed:', err);
        }
      },

      setOnboardingPrefs: async (prefs) => {
        const profile = get().profile;
        if (!profile) return;
        try {
          await svcSaveOnboardingPrefs(profile.userId, prefs);
          set((s) => s.profile ? { profile: { ...s.profile, onboardingPrefs: prefs } } : {});
        } catch (err) {
          console.warn('[tasteProfileStore] setOnboardingPrefs failed:', err);
        }
      },
    }),
    {
      name: 'proof-taste-profile',
      storage: createJSONStorage(() => AsyncStorage),
      // On persiste juste profile (pas seenInSession qui est volatile,
      // ni isReady qui se ré-établit au launch).
      partialize: (state) => ({ profile: state.profile }) as any,
      // Sets ne sont pas JSON-serializable — on rehydrate avec un Set vide.
      onRehydrateStorage: () => (state) => {
        if (state) {
          (state as any).seenInSession = new Set();
          (state as any).isReady = false;
        }
      },
    },
  ),
);
