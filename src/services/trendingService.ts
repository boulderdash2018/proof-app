import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { Plan } from '../types';
import { EXPLORE_GROUPS } from '../constants/exploreCategories';

// ─── Types ───────────────────────────────────────────────

export type TrendingBadge = 'hot_this_week' | 'rising' | null;

export interface TrendingCategory {
  name: string;
  emoji: string;
  gradient: [string, string];
  subtitle: string;
  planCount: number;
  score: number;
  badge: TrendingBadge;
  badgeLabel: string | null;   // "🔥 Cette semaine" | "📈 En hausse"
  hot: boolean;
}

// ─── Category metadata map from EXPLORE_GROUPS ───────────

const buildCategoryMeta = (): Map<string, { emoji: string; gradient: [string, string] }> => {
  const map = new Map<string, { emoji: string; gradient: [string, string] }>();
  for (const group of EXPLORE_GROUPS) {
    for (const section of group.sections) {
      for (const item of section.items) {
        if (!map.has(item.name)) {
          map.set(item.name, { emoji: item.emoji, gradient: item.gradient });
        }
      }
    }
  }
  return map;
};

const CATEGORY_META = buildCategoryMeta();
const DEFAULT_GRADIENT: [string, string] = ['#5A5048', '#3D352E'];

// ─── Scoring engine ──────────────────────────────────────

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

interface TagAccumulator {
  totalScore: number;
  recentScore: number;   // contribution from last 7 days
  planCount: number;
}

/**
 * Compute trending categories from all public plans.
 * Scoring:  proofCount × 5  +  likesCount × 3  +  commentsCount × 2  +  1 (existence)
 * Temporal: ≤ 7 days → ×2,  ≤ 30 days → ×1.5,  older → ×1
 *
 * Returns top 8 categories sorted by score.
 * Returns [] when not enough data → caller should use editorial fallback.
 */
export const computeTrendingCategories = async (city?: string): Promise<TrendingCategory[]> => {
  try {
    const snap = await getDocs(collection(db, 'plans'));
    const now = Date.now();

    const tagScores = new Map<string, TagAccumulator>();

    for (const d of snap.docs) {
      const plan = d.data() as Plan;
      // Only public plans
      if (plan.author?.isPrivate !== false) continue;
      // City filter: legacy plans without city field are treated as Paris
      if (city) {
        const planCity = (plan as any).city || 'Paris';
        if (planCity !== city) continue;
      }

      const tags = plan.tags || [];
      if (tags.length === 0) continue;

      const age = now - new Date(plan.createdAt).getTime();
      const temporalMultiplier = age <= SEVEN_DAYS ? 2 : age <= THIRTY_DAYS ? 1.5 : 1;

      const planScore = (
        (plan.proofCount || 0) * 5 +
        (plan.likesCount || 0) * 3 +
        (plan.commentsCount || 0) * 2 +
        1
      ) * temporalMultiplier;

      const recentContribution = age <= SEVEN_DAYS ? planScore : 0;

      for (const tag of tags) {
        const acc = tagScores.get(tag) || { totalScore: 0, recentScore: 0, planCount: 0 };
        acc.totalScore += planScore;
        acc.recentScore += recentContribution;
        acc.planCount += 1;
        tagScores.set(tag, acc);
      }
    }

    // Build ranked list
    const ranked: TrendingCategory[] = [];

    for (const [tag, data] of tagScores.entries()) {
      const meta = CATEGORY_META.get(tag);
      const recentRatio = data.totalScore > 0 ? data.recentScore / data.totalScore : 0;

      let badge: TrendingBadge = null;
      let badgeLabel: string | null = null;

      if (recentRatio > 0.5) {
        badge = 'hot_this_week';
        badgeLabel = '🔥 Cette semaine';
      } else if (recentRatio > 0.25) {
        badge = 'rising';
        badgeLabel = '📈 En hausse';
      }

      const subtitle =
        data.planCount >= 10
          ? `${data.planCount} plans · Populaire`
          : `${data.planCount} plan${data.planCount > 1 ? 's' : ''}`;

      ranked.push({
        name: tag,
        emoji: meta?.emoji || '📌',
        gradient: meta?.gradient || DEFAULT_GRADIENT,
        subtitle,
        planCount: data.planCount,
        score: data.totalScore,
        badge,
        badgeLabel,
        hot: badge === 'hot_this_week',
      });
    }

    ranked.sort((a, b) => b.score - a.score);
    const top8 = ranked.slice(0, 8);

    // Fallback guard: if fewer than 3 categories have ≥ 2 plans, signal empty
    const significant = top8.filter((c) => c.planCount >= 2);
    if (significant.length < 3) return [];

    return top8;
  } catch (err) {
    console.error('[trendingService] computeTrendingCategories error:', err);
    return [];
  }
};
