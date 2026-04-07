import { doc, getDoc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { User } from '../types';
import { getRankForProofs } from '../constants/ranks';
import { ACHIEVEMENTS, AchievementId } from '../constants/achievements';
import { fetchUserPlans } from './plansService';
import { getFollowerIds } from './friendsService';

export interface UserBadgeStats {
  plans_count: number;
  total_likes_received: number;
  total_proof_validations: number;
  comments_given_count: number;
  places_rated_count: number;
  plans_saved_count: number;
  plans_completed_count: number;
  followers_count: number;
  cities_posted: string[];
  streak_count: number;
  // Computed from plan queries
  max_plan_likes: number;
  max_plan_saves: number;
  weekly_plans_count: number;
  solo_plans_count: number;
  friends_plans_count: number;
  date_plans_count: number;
  budget_plans_count: number;
  has_rainy_plan: boolean;
  has_luxe_plan: boolean;
  has_mood_board_complete: boolean;
  has_hidden_gem: boolean;
  has_night_owl_plan: boolean;
  is_pioneer: boolean;
  is_early_adopter: boolean;
  // Current achievements
  unlocked: string[];
}

const BADGE_CHECKS: Record<AchievementId, (s: UserBadgeStats) => boolean> = {
  // Plans
  first_step: (s) => s.plans_count >= 1,
  on_a_roll: (s) => s.plans_count >= 5,
  prolific: (s) => s.plans_count >= 10,
  machine: (s) => s.plans_count >= 25,
  weekly_drop: (s) => s.weekly_plans_count >= 3,
  city_hopper: (s) => s.cities_posted.length >= 2,
  globetrotter: (s) => s.cities_posted.length >= 4,
  rainy_day_hero: (s) => s.has_rainy_plan,
  solo_rider: (s) => s.solo_plans_count >= 5,
  squad_goals: (s) => s.friends_plans_count >= 5,
  date_master: (s) => s.date_plans_count >= 5,
  mood_board: (s) => s.has_mood_board_complete,
  budget_king: (s) => s.budget_plans_count >= 5,
  luxe_life: (s) => s.has_luxe_plan,
  // Social
  first_love: (s) => s.total_likes_received >= 1,
  fan_club: (s) => s.total_likes_received >= 50,
  viral: (s) => s.max_plan_likes >= 100,
  proof_it: (s) => s.total_proof_validations >= 1,
  trusted: (s) => s.total_proof_validations >= 10,
  first_comment: (s) => s.comments_given_count >= 1,
  critic: (s) => s.comments_given_count >= 10,
  saved_badge: (s) => s.max_plan_saves >= 10,
  must_do: (s) => s.max_plan_saves >= 50,
  social_butterfly: (s) => s.followers_count >= 10,
  influence: (s) => s.followers_count >= 50,
  recreated: () => false, // Needs recreate tracking
  // Places
  place_rater: (s) => s.places_rated_count >= 1,
  critic_local: (s) => s.places_rated_count >= 10,
  collector: (s) => s.plans_saved_count >= 20,
  done_badge: (s) => s.plans_completed_count >= 1,
  completionist: (s) => s.plans_completed_count >= 10,
  hidden_gem: (s) => s.has_hidden_gem,
  // Special
  proof_pioneer: (s) => s.is_pioneer,
  early_adopter: (s) => s.is_early_adopter,
  night_owl: (s) => s.has_night_owl_plan,
  comeback_kid: () => false, // Needs activity tracking
  streak_7: (s) => s.streak_count >= 7,
  first_in_city: () => false, // Needs city tracking
};

const parsePrice = (price: string): number => {
  const match = price.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
};

const TAG_MATCHERS = {
  solo: (tags: string[]) => tags.some((t) => t.toLowerCase().includes('solo')),
  friends: (tags: string[]) => tags.some((t) => /friend|bro|squad|group/i.test(t)),
  date: (tags: string[]) => tags.some((t) => /date|romantic|couple/i.test(t)),
  rainy: (tags: string[]) => tags.some((t) => /rain|rainy|indoor/i.test(t)),
  mood_set: new Set(['sad-day', 'dopamine', 'breakup', 'romantic', 'productive']),
};

/** Compute badge stats by querying user's plans and Firestore data */
export const computeBadgeStats = async (userId: string, user: User): Promise<UserBadgeStats> => {
  const plans = await fetchUserPlans(userId);
  const followerIds = await getFollowerIds(userId);

  // Saved/completed plans
  let savedCount = 0;
  let completedCount = 0;
  try {
    const savedSnap = await getDocs(collection(db, `users/${userId}/savedPlans`));
    savedSnap.docs.forEach((d) => {
      savedCount++;
      if (d.data().isDone) completedCount++;
    });
  } catch {}

  // Comments given
  let commentsGiven = user.comments_given_count ?? 0;
  try {
    const commentsSnap = await getDocs(query(collection(db, 'comments'), where('authorId', '==', userId)));
    commentsGiven = commentsSnap.size;
  } catch {}

  // Compute from plans
  let totalLikes = 0;
  let totalProofs = 0;
  let maxLikes = 0;
  let maxSaves = 0;
  let soloCount = 0;
  let friendsCount = 0;
  let dateCount = 0;
  let budgetCount = 0;
  let hasRainy = false;
  let hasLuxe = false;
  let hasNightOwl = false;
  let hasHiddenGem = false;
  const moodsFound = new Set<string>();
  const cities = new Set<string>(user.cities_posted ?? []);

  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let weeklyCount = 0;

  for (const plan of plans) {
    totalLikes += plan.likesCount || 0;
    totalProofs += (plan as any).proofCount || 0;
    if (plan.likesCount > maxLikes) maxLikes = plan.likesCount;

    const price = parsePrice(plan.price);
    if (price <= 20) budgetCount++;
    if (price >= 200) hasLuxe = true;

    if (TAG_MATCHERS.solo(plan.tags)) soloCount++;
    if (TAG_MATCHERS.friends(plan.tags)) friendsCount++;
    if (TAG_MATCHERS.date(plan.tags)) dateCount++;
    if (TAG_MATCHERS.rainy(plan.tags)) hasRainy = true;

    // Mood board check
    for (const tag of plan.tags) {
      const lower = tag.toLowerCase();
      if (TAG_MATCHERS.mood_set.has(lower)) moodsFound.add(lower);
    }

    // Night owl check (created between 00:00-05:00)
    const hour = new Date(plan.createdAt).getHours();
    if (hour >= 0 && hour < 5) hasNightOwl = true;

    // Weekly count
    if (new Date(plan.createdAt).getTime() > oneWeekAgo) weeklyCount++;

    // City extraction from first place address
    if (plan.places.length > 0) {
      const addr = plan.places[0].address;
      const parts = addr.split(',');
      if (parts.length >= 2) cities.add(parts[parts.length - 2].trim());
    }

    // Hidden gem check
    for (const place of plan.places) {
      if (place.reviewCount < 100) hasHiddenGem = true;
    }
  }

  // Early adopter: signed up before 2026-07-01 (placeholder launch date)
  const isEarly = new Date(user.createdAt).getTime() < new Date('2026-07-01').getTime();

  return {
    plans_count: plans.length,
    total_likes_received: totalLikes,
    total_proof_validations: totalProofs,
    comments_given_count: commentsGiven,
    places_rated_count: user.places_rated_count ?? 0,
    plans_saved_count: savedCount,
    plans_completed_count: completedCount,
    followers_count: followerIds.length,
    cities_posted: Array.from(cities),
    streak_count: user.streak_count ?? 0,
    max_plan_likes: maxLikes,
    max_plan_saves: maxSaves,
    weekly_plans_count: weeklyCount,
    solo_plans_count: soloCount,
    friends_plans_count: friendsCount,
    date_plans_count: dateCount,
    budget_plans_count: budgetCount,
    has_rainy_plan: hasRainy,
    has_luxe_plan: hasLuxe,
    has_mood_board_complete: moodsFound.size >= 5,
    has_hidden_gem: hasHiddenGem,
    has_night_owl_plan: hasNightOwl,
    is_pioneer: false, // Would need user count query
    is_early_adopter: isEarly,
    unlocked: user.achievements ?? [],
  };
};

/** Check all badges and return newly unlocked ones */
export const checkAndUnlockBadges = async (userId: string, user: User): Promise<{ newBadges: AchievementId[]; allBadges: AchievementId[]; totalProofs: number }> => {
  const stats = await computeBadgeStats(userId, user);
  const currentBadges = new Set(stats.unlocked);
  const newBadges: AchievementId[] = [];

  for (const achievement of ACHIEVEMENTS) {
    if (currentBadges.has(achievement.id)) continue;
    const checker = BADGE_CHECKS[achievement.id];
    if (checker && checker(stats)) {
      newBadges.push(achievement.id);
      currentBadges.add(achievement.id);
    }
  }

  const allBadges = Array.from(currentBadges) as AchievementId[];

  // Update user doc with new badges and stats
  if (newBadges.length > 0 || stats.total_proof_validations !== (user.total_proof_validations ?? 0)) {
    try {
      const rank = getRankForProofs(stats.total_proof_validations);
      await updateDoc(doc(db, 'users', userId), {
        achievements: allBadges,
        achievements_count: allBadges.length,
        total_proof_validations: stats.total_proof_validations,
        total_likes_received: stats.total_likes_received,
        comments_given_count: stats.comments_given_count,
        plans_saved_count: stats.plans_saved_count,
        plans_completed_count: stats.plans_completed_count,
        followers_count: stats.followers_count,
        cities_posted: stats.cities_posted,
        rank: rank.id,
      });
    } catch (err) {
      console.error('[badgeService] update user badges error:', err);
    }
  }

  return { newBadges, allBadges, totalProofs: stats.total_proof_validations };
};
