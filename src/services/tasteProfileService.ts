/**
 * Taste profile service — source of truth for the user's recommendation
 * signals. Built to scale from 0 to 5k DAU without rework.
 *
 * Two collections in Firestore :
 *   • /users/{userId}/taste_profile/main      — single doc, the
 *     aggregate profile read by the ranking algorithm. Updated in
 *     debounced batches (~30s) so we never spam writes.
 *   • /users/{userId}/feed_signals/{eventId}  — append-only log of raw
 *     events (TTL 30 days, cleaned by a future Cloud Function). Lets
 *     us recompute the profile if the algo changes.
 *
 * On the client, we keep a hot mirror in `tasteProfileStore` (Zustand
 * + AsyncStorage cache) so reads are instant. Writes are coalesced :
 *   recordSignal()  → push to in-memory queue + update local profile
 *                     optimistically + schedule flush
 *   flushSignals()  → batched write to feed_signals + merge update on
 *                     taste_profile/main (every 30s, or on app
 *                     background, or on pull-to-refresh)
 *
 * This pattern gives us :
 *   • instant UI (no await on every tap)
 *   • near-zero Firestore costs (1 batched write/min worst case)
 *   • multi-device sync via Firestore realtime
 *   • recoverability (raw log = re-derive profile any time)
 */

import {
  collection, doc, getDoc, setDoc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebaseConfig';

// ══════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════

/** Onboarding answers — pèsent fort au cold start (jours 1-5 ou
 *  jusqu'à 50 events captés), puis se diluent à mesure que les
 *  signaux comportementaux s'accumulent. Cf. feedRanking.ts. */
export interface OnboardingPrefs {
  /** Pourquoi tu sors — multi-select. */
  purposes: string[];
  /** Avec qui tu sors le plus souvent — single-select. */
  company: 'solo' | 'couple' | 'friends' | 'family' | null;
  /** Style de lieux préféré — single-select. */
  style: 'hidden' | 'iconic' | 'new' | 'safe' | null;
  /** Budget habituel — single-select. */
  budget: 'free' | 'low' | 'medium' | 'high' | null;
}

export interface TasteProfile {
  userId: string;
  /** { categoryName: weight } — categories the user has saved/liked/done.
   *  Higher = stronger affinity. Computed via decay (recent signals
   *  weigh more) at flush time. */
  topCategories: Record<string, number>;
  /** { authorId: weight } — authors the user repeatedly saves from. */
  topAuthors: Record<string, number>;
  /** { neighborhood: weight } — districts the user gravitates around.
   *  Inferred from saved/done plan place addresses. */
  topNeighborhoods: Record<string, number>;
  /** { categoryName: weight } — NEGATIVE signal from "Pas intéressé"
   *  + repeated quick skips. Higher = stronger dislike → suppressed
   *  in ranking. */
  dislikedCategories: Record<string, number>;
  /** Aggregate event counters — used for cold-start detection
   *  (< 50 total = onboarding boost still active). */
  doneCount: number;
  proofCount: number;
  saveCount: number;
  likeCount: number;
  searchCount: number;
  detailViewCount: number;
  skipCount: number;
  /** Posts the user has explicitly hidden ("Pas intéressé") — never
   *  shown again. */
  hiddenPostIds: string[];
  /** Onboarding answers — null until completed. */
  onboardingPrefs: OnboardingPrefs | null;
  /** Last computed at — for cache freshness checks. */
  lastUpdated: string;
  createdAt: string;
}

/** Signal types — keep this enum stable, adding new types is fine
 *  but renaming breaks the event log replay. */
export type FeedSignalType =
  | 'view'           // post a été affiché à l'écran (dwellMs > 1500)
  | 'detail'         // user a ouvert le detail d'un plan (commitToDetail)
  | 'skip'           // post scrollé en < 1.5s
  | 'like'
  | 'save'
  | 'done'           // markAsDone
  | 'proof'          // proofed (= validated done)
  | 'search'         // search executed
  | 'tap_place'      // user a tap un place dans un plan
  | 'not_interested';// "Pas intéressé" depuis le menu 3-points

export interface FeedSignal {
  /** Idempotent id — `s_${ts}_${rand}` côté client. */
  id: string;
  userId: string;
  type: FeedSignalType;
  /** Post id (planId ou spotId) selon le contexte. */
  postId?: string;
  /** Catégorie principale du post — gardée pour pouvoir recalculer
   *  les agrégats sans avoir à re-fetch les posts. */
  category?: string;
  /** Author / creator of the post — pour author_affinity. */
  authorId?: string;
  /** Neighborhood (arrondissement, etc.) — pour geo affinity. */
  neighborhood?: string;
  /** Search query si type === 'search'. */
  query?: string;
  /** Dwell time si type === 'view' / 'detail' / 'skip'. */
  dwellMs?: number;
  /** ISO timestamp — assigné côté client au moment du recordSignal. */
  ts: string;
}

// ══════════════════════════════════════════════════════════════
// Pending queue + debounced flush
// ══════════════════════════════════════════════════════════════

/** Events en attente de flush vers Firestore. Vidé toutes les 30s
 *  ou immédiatement sur flushSignals() / app background. */
const pendingEvents: FeedSignal[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 30_000;

/** Callback notifié quand le profile change localement — branché par
 *  le store pour mettre à jour l'UI sans attendre Firestore. */
let onProfileChangeCallback: ((updater: (prev: TasteProfile | null) => TasteProfile | null) => void) | null = null;

export function setProfileChangeListener(
  cb: (updater: (prev: TasteProfile | null) => TasteProfile | null) => void,
) {
  onProfileChangeCallback = cb;
}

/**
 * Push un événement dans la queue + mettre à jour le profile local
 * de manière optimiste. Aucun await — c'est instant.
 */
export function recordSignal(
  userId: string,
  signal: Omit<FeedSignal, 'id' | 'userId' | 'ts'>,
): void {
  const fullSignal: FeedSignal = {
    id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    ts: new Date().toISOString(),
    ...signal,
  };
  pendingEvents.push(fullSignal);

  // Update optimiste du profile local — l'algo de ranking voit
  // immédiatement le nouveau signal sans attendre le flush.
  if (onProfileChangeCallback) {
    onProfileChangeCallback((prev) => applySignalToProfile(prev, fullSignal));
  }

  // Schedule flush si pas déjà programmé.
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushSignals().catch((err) =>
        console.warn('[tasteProfile] flush error:', err),
      );
    }, FLUSH_INTERVAL_MS);
  }
}

/**
 * Flush forcé — appelé sur app background, pull-to-refresh, ou
 * périodiquement par le timer. Idempotent et safe à appeler en
 * parallèle.
 */
export async function flushSignals(): Promise<void> {
  if (pendingEvents.length === 0) return;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  // Snapshot local + reset queue immédiatement pour ne pas perdre
  // d'events qui arriveraient pendant le write.
  const batch = pendingEvents.splice(0, pendingEvents.length);

  try {
    const userId = batch[0].userId;
    const fbBatch = writeBatch(db);

    // Append signals au log brut.
    batch.forEach((sig) => {
      const ref = doc(collection(db, 'users', userId, 'feed_signals'));
      fbBatch.set(ref, sig);
    });

    // Merge update sur taste_profile/main avec les agrégats updated.
    const profileRef = doc(db, 'users', userId, 'taste_profile', 'main');
    const profileSnap = await getDoc(profileRef);
    const current: TasteProfile | null = profileSnap.exists()
      ? (profileSnap.data() as TasteProfile)
      : null;
    const updated = batch.reduce(
      (acc: TasteProfile | null, sig) => applySignalToProfile(acc, sig),
      current ?? createEmptyProfile(userId),
    );
    if (updated) {
      fbBatch.set(profileRef, { ...updated, lastUpdated: new Date().toISOString() });
    }

    await fbBatch.commit();
  } catch (err) {
    // Rollback : remettre les events dans la queue pour retry au
    // prochain flush. On ne perd rien.
    pendingEvents.unshift(...batch);
    throw err;
  }
}

// ══════════════════════════════════════════════════════════════
// Profile aggregation — pure functions
// ══════════════════════════════════════════════════════════════

const SIGNAL_WEIGHTS: Record<FeedSignalType, number> = {
  view: 0.05,
  detail: 0.5,
  skip: 0,
  like: 1,
  save: 2,
  done: 3,
  proof: 4,
  search: 0.3,
  tap_place: 0.5,
  not_interested: 0,
};

const NEGATIVE_WEIGHTS: Record<FeedSignalType, number> = {
  not_interested: 3,
  skip: 0.2,
  view: 0,
  detail: 0,
  like: 0,
  save: 0,
  done: 0,
  proof: 0,
  search: 0,
  tap_place: 0,
};

/**
 * Pure : applique un signal au profile. Utilisé à la fois côté UI
 * (optimiste) et côté flush (server-side merge).
 */
export function applySignalToProfile(
  prev: TasteProfile | null,
  sig: FeedSignal,
): TasteProfile {
  const profile: TasteProfile = prev
    ? { ...prev, topCategories: { ...prev.topCategories }, topAuthors: { ...prev.topAuthors }, topNeighborhoods: { ...prev.topNeighborhoods }, dislikedCategories: { ...prev.dislikedCategories }, hiddenPostIds: [...prev.hiddenPostIds] }
    : createEmptyProfile(sig.userId);

  // Counter aggrégats
  switch (sig.type) {
    case 'like':              profile.likeCount++; break;
    case 'save':              profile.saveCount++; break;
    case 'done':              profile.doneCount++; break;
    case 'proof':             profile.proofCount++; break;
    case 'search':            profile.searchCount++; break;
    case 'detail':            profile.detailViewCount++; break;
    case 'skip':              profile.skipCount++; break;
    default: break;
  }

  // Affinités positives par catégorie / auteur / neighborhood
  const w = SIGNAL_WEIGHTS[sig.type] || 0;
  if (w > 0) {
    if (sig.category) {
      profile.topCategories[sig.category] = (profile.topCategories[sig.category] || 0) + w;
    }
    if (sig.authorId) {
      profile.topAuthors[sig.authorId] = (profile.topAuthors[sig.authorId] || 0) + w;
    }
    if (sig.neighborhood) {
      profile.topNeighborhoods[sig.neighborhood] = (profile.topNeighborhoods[sig.neighborhood] || 0) + w;
    }
  }

  // Affinités négatives — "Pas intéressé" + skips répétés
  const nw = NEGATIVE_WEIGHTS[sig.type] || 0;
  if (nw > 0 && sig.category) {
    profile.dislikedCategories[sig.category] = (profile.dislikedCategories[sig.category] || 0) + nw;
  }

  // Hidden posts — "Pas intéressé" cache définitivement
  if (sig.type === 'not_interested' && sig.postId && !profile.hiddenPostIds.includes(sig.postId)) {
    profile.hiddenPostIds = [...profile.hiddenPostIds, sig.postId];
  }

  profile.lastUpdated = sig.ts;
  return profile;
}

export function createEmptyProfile(userId: string): TasteProfile {
  const now = new Date().toISOString();
  return {
    userId,
    topCategories: {},
    topAuthors: {},
    topNeighborhoods: {},
    dislikedCategories: {},
    doneCount: 0,
    proofCount: 0,
    saveCount: 0,
    likeCount: 0,
    searchCount: 0,
    detailViewCount: 0,
    skipCount: 0,
    hiddenPostIds: [],
    onboardingPrefs: null,
    lastUpdated: now,
    createdAt: now,
  };
}

// ══════════════════════════════════════════════════════════════
// Firestore CRUD
// ══════════════════════════════════════════════════════════════

/**
 * Charge le profile depuis Firestore. Crée un profile vide si absent.
 * Appelé une fois au démarrage par le store.
 */
export async function loadTasteProfile(userId: string): Promise<TasteProfile> {
  const ref = doc(db, 'users', userId, 'taste_profile', 'main');
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return snap.data() as TasteProfile;
  }
  // Crée un profile vide en Firestore pour démarrer.
  const empty = createEmptyProfile(userId);
  await setDoc(ref, empty);
  return empty;
}

/**
 * Persistance directe des onboarding prefs — pas debounced (event
 * one-shot, important qu'il atteigne Firestore tout de suite).
 */
export async function saveOnboardingPrefs(
  userId: string,
  prefs: OnboardingPrefs,
): Promise<void> {
  const ref = doc(db, 'users', userId, 'taste_profile', 'main');
  const snap = await getDoc(ref);
  const current = snap.exists() ? (snap.data() as TasteProfile) : createEmptyProfile(userId);
  const updated: TasteProfile = {
    ...current,
    onboardingPrefs: prefs,
    lastUpdated: new Date().toISOString(),
  };
  await setDoc(ref, updated);
  if (onProfileChangeCallback) {
    onProfileChangeCallback(() => updated);
  }
}

/** Helper exposed pour debug / future sync — retourne le snapshot
 *  serveur sans toucher au cache local. */
export async function fetchTasteProfileFresh(userId: string): Promise<TasteProfile | null> {
  const ref = doc(db, 'users', userId, 'taste_profile', 'main');
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as TasteProfile) : null;
}
