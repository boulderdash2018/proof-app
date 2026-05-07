/**
 * Feed ranking — heuristique côté client, pure et déterministe (modulo
 * un jitter d'exploration seedé par userId+jour pour rester cohérent
 * dans une session).
 *
 * Inputs : (rankableItems, tasteProfile, now) → array trié par score
 * desc + diversity-enforced (pas plus de 3 items consécutifs de la
 * même catégorie).
 *
 * Le scoring est intentionnellement transparent (chaque facteur est
 * un nombre normalisé entre 0 et 1, pondéré par un coefficient fixe)
 * pour qu'on puisse débugger et expliquer "pourquoi je vois ce post"
 * à l'user au tap.
 *
 * Phase 1 : zéro ML, juste de l'arithmétique. Suffisant jusqu'à
 * ~5k DAU. Au-delà, on déplacera ce calcul côté Cloud Function pour
 * pré-ranker tous les users la nuit, mais le code SCORE restera
 * identique — c'est juste l'orchestration qui change.
 */

import { TasteProfile } from '../services/tasteProfileService';
import { Plan, Spot } from '../types';

// ══════════════════════════════════════════════════════════════
// Common rankable shape — Plan et Spot normalisés
// ══════════════════════════════════════════════════════════════

export interface RankableItem {
  id: string;
  type: 'plan' | 'spot';
  authorId: string;
  /** Catégories normalisées (lowercase). Pour Plan = tags + place
   *  types ; pour Spot = placeCategory. Une seule entrée pour le
   *  bucketing diversity. */
  primaryCategory: string;
  /** Toutes les catégories pour le matching d'affinité. */
  allCategories: string[];
  city?: string;
  neighborhood?: string;
  createdAt: string;
  likesCount: number;
  savesCount: number;
  proofCount: number;
  /** Référence vers le post original — le caller le récupère après
   *  ranking pour rendre l'UI. */
  raw: Plan | Spot;
}

/** Convertit un Plan en RankableItem. */
export function planToRankable(plan: Plan): RankableItem {
  const placeCategories = (plan.places || [])
    .map((p) => (p as any).type)
    .filter((c): c is string => !!c)
    .map((c) => c.toLowerCase());
  const tagCategories = (plan.tags || []).map((t) => String(t).toLowerCase());
  const allCategories = Array.from(new Set([...tagCategories, ...placeCategories]));
  const primary = allCategories[0] || 'unknown';

  return {
    id: plan.id,
    type: 'plan',
    authorId: plan.authorId,
    primaryCategory: primary,
    allCategories,
    city: plan.city,
    neighborhood: extractNeighborhood(plan.places?.[0]?.address),
    createdAt: plan.createdAt,
    likesCount: plan.likesCount || 0,
    savesCount: (plan.savedByIds?.length) || 0,
    proofCount: plan.proofCount || 0,
    raw: plan,
  };
}

/** Convertit un Spot en RankableItem. */
export function spotToRankable(spot: Spot): RankableItem {
  const cat = (spot.placeCategory || 'unknown').toLowerCase();
  return {
    id: spot.id,
    type: 'spot',
    authorId: spot.recommenderId,
    primaryCategory: cat,
    allCategories: [cat],
    city: spot.city,
    neighborhood: extractNeighborhood(spot.placeAddress),
    createdAt: spot.createdAt,
    likesCount: 0,
    savesCount: spot.savedByIds?.length || 0,
    proofCount: 0,
    raw: spot,
  };
}

/** Extrait l'arrondissement parisien d'une adresse type "10 Rue X, 75011 Paris".
 *  Retourne "11e" / "1er" / null. Volontairement simple — Paris-only
 *  pour l'instant ; généralisera quand on étendra à d'autres villes. */
function extractNeighborhood(address?: string): string | undefined {
  if (!address) return undefined;
  const m = address.match(/\b75(\d{3})\b/);
  if (!m) return undefined;
  const num = parseInt(m[1], 10);
  if (num < 1 || num > 20) return undefined;
  return num === 1 ? '1er' : `${num}e`;
}

// ══════════════════════════════════════════════════════════════
// Scoring — formule heuristique
// ══════════════════════════════════════════════════════════════

/**
 * Coefficients de pondération — somme = 1 (hors penalties).
 * Tweak ces nombres si on veut booster un facteur, c'est centralisé.
 */
const W_RECENCY = 0.20;
const W_SOCIAL_PROOF = 0.15;
const W_TAG_AFFINITY = 0.20;
const W_AUTHOR_AFFINITY = 0.10;
const W_GEO_PROXIMITY = 0.05;
const W_NOVELTY = 0.05;
const W_EXPLORATION = 0.20;
const W_ONBOARDING = 0.30; // ne s'applique qu'au cold start, decays
const W_SKIP_PENALTY = 0.15;
const W_SEEN_PENALTY = 0.10;
const W_DISLIKE_PENALTY = 0.20;

/** Decay de recency : un post de 0 jour vaut 1, de 14 jours vaut ~0.36,
 *  de 30 jours vaut ~0.12. exp(-age_days / 14). */
function recencyScore(createdAt: string, now: Date): number {
  const ageMs = now.getTime() - new Date(createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.exp(-Math.max(ageDays, 0) / 14);
}

/** Social proof normalisé via log — empêche les viral d'écraser tout
 *  le reste. log(1 + likes + 2*saves + 3*proofs) / log(50). */
function socialProofScore(item: RankableItem): number {
  const raw = item.likesCount + 2 * item.savesCount + 3 * item.proofCount;
  return Math.min(1, Math.log(1 + raw) / Math.log(50));
}

/** Tag affinity : produit scalaire normalisé entre les catégories
 *  du post et les top categories du user. Si user adore "cafe"
 *  (weight 12) et le post a "cafe" → score élevé. */
function tagAffinityScore(item: RankableItem, profile: TasteProfile): number {
  const total = Object.values(profile.topCategories).reduce((s, w) => s + w, 0);
  if (total === 0) return 0;
  let score = 0;
  for (const cat of item.allCategories) {
    score += (profile.topCategories[cat] || 0) / total;
  }
  return Math.min(1, score);
}

/** Author affinity : si l'user a déjà saved/liké des posts de cet
 *  auteur, boost. Normalisé sur le top author. */
function authorAffinityScore(item: RankableItem, profile: TasteProfile): number {
  const max = Math.max(0, ...Object.values(profile.topAuthors));
  if (max === 0) return 0;
  return (profile.topAuthors[item.authorId] || 0) / max;
}

/** Geo proximity : si le neighborhood du post est dans le top 3
 *  arrondissements de l'user, boost. */
function geoProximityScore(item: RankableItem, profile: TasteProfile): number {
  if (!item.neighborhood) return 0;
  const sorted = Object.entries(profile.topNeighborhoods)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([k]) => k);
  return sorted.includes(item.neighborhood) ? 1 : 0;
}

/** Onboarding match : ne s'active qu'au cold start. Compare les
 *  prefs onboarding aux catégories du post. Decays à mesure que
 *  totalSignals augmente — passe à 0 vers 50 events. */
function onboardingMatchScore(item: RankableItem, profile: TasteProfile, totalSignals: number): number {
  if (!profile.onboardingPrefs) return 0;
  const decay = Math.max(0, 1 - totalSignals / 50);
  if (decay === 0) return 0;

  const prefs = profile.onboardingPrefs;
  let match = 0;

  // Mapping purposes → categories Google Places. Heuristique simple,
  // raffinable plus tard.
  const purposeMap: Record<string, string[]> = {
    eat: ['restaurant', 'food', 'meal_takeaway'],
    drink: ['cafe', 'bar', 'night_club'],
    culture: ['museum', 'art_gallery', 'tourist_attraction', 'church'],
    nature: ['park'],
    shopping: ['clothing_store', 'shopping_mall', 'store'],
  };
  for (const purpose of prefs.purposes) {
    const cats = purposeMap[purpose] || [];
    if (cats.some((c) => item.allCategories.includes(c))) {
      match += 0.4;
    }
  }

  return Math.min(1, match) * decay;
}

/** Penalties */

function skipPenaltyScore(item: RankableItem, profile: TasteProfile): number {
  // Si une catégorie a été ajoutée à dislikedCategories par des skips
  // répétés, on pénalise. Normalisé sur le max disliked.
  const max = Math.max(0, ...Object.values(profile.dislikedCategories));
  if (max === 0) return 0;
  let penalty = 0;
  for (const cat of item.allCategories) {
    penalty += (profile.dislikedCategories[cat] || 0) / max;
  }
  return Math.min(1, penalty);
}

function seenPenaltyScore(item: RankableItem, seenIds: Set<string>): number {
  return seenIds.has(item.id) ? 1 : 0;
}

/** Exploration jitter — random seed dérivée du userId+jour pour
 *  rester reproductible dans une session, mais varier d'un jour à
 *  l'autre. Comme ça pull-to-refresh donne une nouvelle seed et
 *  re-shuffle. */
function explorationJitter(itemId: string, seed: number): number {
  // PRNG simple : hash itemId * seed → [0, 1].
  let h = seed;
  for (let i = 0; i < itemId.length; i++) {
    h = (h * 31 + itemId.charCodeAt(i)) | 0;
  }
  // Normalize to [0, 1].
  return (Math.abs(h) % 10000) / 10000;
}

// ══════════════════════════════════════════════════════════════
// Score breakdown — pour debug + UI "Why am I seeing this?"
// ══════════════════════════════════════════════════════════════

export interface ScoreBreakdown {
  total: number;
  recency: number;
  socialProof: number;
  tagAffinity: number;
  authorAffinity: number;
  geoProximity: number;
  onboardingMatch: number;
  exploration: number;
  skipPenalty: number;
  seenPenalty: number;
  dislikePenalty: number;
  hiddenByUser: boolean;
}

export function scoreItem(
  item: RankableItem,
  profile: TasteProfile,
  seenIds: Set<string>,
  now: Date,
  totalSignals: number,
  jitterSeed: number,
): ScoreBreakdown {
  const hidden = profile.hiddenPostIds.includes(item.id);
  if (hidden) {
    return {
      total: -Infinity, // garanti d'être en bas
      recency: 0, socialProof: 0, tagAffinity: 0, authorAffinity: 0,
      geoProximity: 0, onboardingMatch: 0, exploration: 0,
      skipPenalty: 0, seenPenalty: 0, dislikePenalty: 0,
      hiddenByUser: true,
    };
  }

  const recency = recencyScore(item.createdAt, now);
  const socialProof = socialProofScore(item);
  const tagAffinity = tagAffinityScore(item, profile);
  const authorAffinity = authorAffinityScore(item, profile);
  const geoProximity = geoProximityScore(item, profile);
  const onboardingMatch = onboardingMatchScore(item, profile, totalSignals);
  const exploration = explorationJitter(item.id, jitterSeed);
  const skipPenalty = skipPenaltyScore(item, profile);
  const seenPenalty = seenPenaltyScore(item, seenIds);
  const dislike = 0; // reserved for future explicit dislike-vote feature

  const total =
      W_RECENCY * recency
    + W_SOCIAL_PROOF * socialProof
    + W_TAG_AFFINITY * tagAffinity
    + W_AUTHOR_AFFINITY * authorAffinity
    + W_GEO_PROXIMITY * geoProximity
    + W_ONBOARDING * onboardingMatch
    + W_EXPLORATION * exploration
    + W_NOVELTY * (1 - seenPenalty)
    - W_SKIP_PENALTY * skipPenalty
    - W_SEEN_PENALTY * seenPenalty
    - W_DISLIKE_PENALTY * dislike;

  return {
    total, recency, socialProof, tagAffinity, authorAffinity,
    geoProximity, onboardingMatch, exploration,
    skipPenalty, seenPenalty, dislikePenalty: dislike,
    hiddenByUser: false,
  };
}

// ══════════════════════════════════════════════════════════════
// Diversity enforcer
// ══════════════════════════════════════════════════════════════

/**
 * Empêche d'avoir 3+ items de la même catégorie d'affilée. Si le
 * top-3 du sort initial est tout cafés, on insère un item d'une
 * autre catégorie au milieu. C'est ce qui fait que l'user a la
 * sensation de "découvrir", pas de "voir 5 cafés à la suite".
 */
function enforceDiversity(items: RankableItem[]): RankableItem[] {
  if (items.length <= 2) return items;
  const out: RankableItem[] = [];
  const remaining = [...items];

  while (remaining.length > 0) {
    // Détermine si les 2 derniers ajoutés sont de la même catégorie.
    const last = out[out.length - 1];
    const beforeLast = out[out.length - 2];
    const blocked = last && beforeLast && last.primaryCategory === beforeLast.primaryCategory
      ? last.primaryCategory
      : null;

    // Trouve le prochain item — préfère un item d'une catégorie
    // différente si on est en streak de 2.
    let pickIdx = 0;
    if (blocked) {
      const altIdx = remaining.findIndex((r) => r.primaryCategory !== blocked);
      if (altIdx !== -1) pickIdx = altIdx;
    }
    out.push(remaining.splice(pickIdx, 1)[0]);
  }

  return out;
}

// ══════════════════════════════════════════════════════════════
// Public API — rank a list
// ══════════════════════════════════════════════════════════════

/**
 * Rank a list of plans + spots according to the user's taste profile.
 * Returns a single mixed array, sorted desc by score, diversity-
 * enforced (no 3+ same-category in a row), hidden posts filtered out.
 *
 * `seenIds` — postIds the user has already seen (for novelty bonus).
 * `jitterSeed` — typically `userId.length + dayOfYear`. Pass a new
 * value on pull-to-refresh to re-shuffle exploration.
 */
export function rankFeed(
  plans: Plan[],
  spots: Spot[],
  profile: TasteProfile,
  seenIds: Set<string>,
  options: { now?: Date; jitterSeed?: number } = {},
): { item: RankableItem; score: ScoreBreakdown }[] {
  const now = options.now || new Date();
  const seed = options.jitterSeed ?? Math.floor(now.getTime() / (24 * 60 * 60 * 1000));

  const totalSignals =
    profile.likeCount + profile.saveCount + profile.doneCount
    + profile.proofCount + profile.detailViewCount + profile.searchCount;

  const items: RankableItem[] = [
    ...plans.map(planToRankable),
    ...spots.map(spotToRankable),
  ];

  // Score chaque item.
  const scored = items
    .map((item) => ({ item, score: scoreItem(item, profile, seenIds, now, totalSignals, seed) }))
    .filter((s) => !s.score.hiddenByUser); // filtrage hard des hidden

  // Tri desc par score total.
  scored.sort((a, b) => b.score.total - a.score.total);

  // Diversity enforcer sur l'ordre final.
  const reorderedItems = enforceDiversity(scored.map((s) => s.item));
  const byId = new Map(scored.map((s) => [s.item.id, s]));
  return reorderedItems.map((item) => byId.get(item.id)!);
}

/**
 * Détecte le cold-start — < 5 signaux totaux capturés.
 * Le caller affiche une bannière "on apprend" et bypasse
 * partiellement le ranking (on montre les top social-proof).
 */
export function isColdStart(profile: TasteProfile): boolean {
  const totalEngagement =
    profile.likeCount + profile.saveCount + profile.doneCount + profile.proofCount;
  return totalEngagement < 5;
}
