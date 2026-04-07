export type BadgeType = 'top_creator' | 'creator' | 'novice';

// Re-export rank/achievement types from constants
export type { RankId } from '../constants/ranks';
export type { AchievementId, AchievementCategory } from '../constants/achievements';

export type TransportMode = 'Métro' | 'Vélo' | 'À pied' | 'Voiture' | 'Trottinette';

export type CategoryTag = string;

export interface User {
  id: string;
  username: string;
  displayName: string;
  initials: string;
  avatarUrl?: string | null;
  avatarBg: string;
  avatarColor: string;
  badgeType: BadgeType;
  bio?: string;
  isPrivate: boolean;
  setupComplete?: boolean;
  xpPoints: number;
  coins: number;
  level: number;
  xpForNextLevel: number;
  rank: string;
  planCount: number;
  followersCount: number;
  followingCount: number;
  likesReceived: number;
  unlockedBadges: BadgeId[];
  // Badge/rank stats
  total_proof_validations?: number;
  comments_given_count?: number;
  places_rated_count?: number;
  plans_saved_count?: number;
  plans_completed_count?: number;
  cities_posted?: string[];
  achievements?: string[];
  achievements_count?: number;
  last_active_dates?: string[];
  streak_count?: number;
  isFounder?: boolean;
  createdAt: string;
}

export interface Review {
  id: string;
  authorId: string;
  authorName: string;
  authorInitials: string;
  authorAvatarBg: string;
  authorAvatarColor: string;
  text: string;
  rating: number;
  createdAt: string;
}

export interface Place {
  id: string;
  googlePlaceId?: string;
  name: string;
  type: string;
  address: string;
  rating: number;
  reviewCount: number;
  ratingDistribution: [number, number, number, number, number];
  reviews: Review[];
  photoUrls?: string[];
  openingHours?: string[];
  phoneNumber?: string;
  website?: string;
  latitude?: number;
  longitude?: number;
  priceLevel?: number;       // 0-4 Google price level
  placePrice?: number;       // price in € for this place
  placeDuration?: number;    // time spent in minutes
}

export interface TravelSegment {
  fromPlaceId: string;
  toPlaceId: string;
  duration: number;          // travel time in minutes
  transport: TransportMode;
}

export interface Plan {
  id: string;
  authorId: string;
  author: User;
  title: string;
  gradient: string;
  tags: CategoryTag[];
  places: Place[];
  price: string;
  duration: string;
  transport: TransportMode;
  travelSegments?: TravelSegment[];
  coverPhotos?: string[];
  likesCount: number;
  commentsCount: number;
  proofCount: number;
  declinedCount: number;
  xpReward: number;
  createdAt: string;
  timeAgo: string;
}

export type BadgeId =
  | 'explorer' | 'top_creator' | 'citadin' | 'viral_5'
  | 'first_plan' | 'social_butterfly' | 'foodie_expert';

export interface Badge {
  id: BadgeId;
  emoji: string;
  label: string;
  description: string;
  isUnlocked: boolean;
}

export interface Notification {
  id: string;
  type: 'like' | 'follow' | 'comment' | 'xp_gained' | 'badge_unlocked';
  fromUser?: User;
  planTitle?: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface PlaceReview {
  id: string;
  placeId: string;
  googlePlaceId?: string;
  planId: string;
  authorId: string;
  authorName: string;
  authorInitials: string;
  authorAvatarBg: string;
  authorAvatarColor: string;
  authorAvatarUrl?: string | null;
  rating: number;
  text?: string;
  createdAt: string;
}

export type ProofStatus = 'validated' | 'declined';

export interface SavedPlan {
  planId: string;
  plan: Plan;
  isDone: boolean;
  proofStatus?: ProofStatus;
  savedAt: string;
}

export interface Comment {
  id: string;
  planId: string;
  authorId: string;
  authorName: string;
  authorInitials: string;
  authorAvatarBg: string;
  authorAvatarColor: string;
  authorAvatarUrl?: string | null;
  text: string;
  createdAt: string;
}

export interface SignupData {
  firstName: string;
  email: string;
  password: string;
}

export interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromUser?: User;
  toUser?: User;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}
