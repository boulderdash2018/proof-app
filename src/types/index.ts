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
  pinnedPlanIds?: string[];
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
  customPhoto?: string;      // user's own photo URI/URL
  comment?: string;          // user's personal comment
  question?: string;         // the question that was shown
  questionAnswer?: string;   // answer to the question
  questions?: { question: string; answer: string }[];  // multiple QAs
  reservationRecommended?: boolean;
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
  city?: string;
  /** Creator's signature tip — a short mandatory sentence added at the end of plan creation */
  authorTip?: string;
  likesCount: number;
  commentsCount: number;
  proofCount: number;
  declinedCount: number;
  xpReward: number;
  createdAt: string;
  timeAgo: string;
  likedByIds?: string[];
  savedByIds?: string[];
  recreatedByIds?: string[];
  /**
   * Append-only log of save timestamps (ms epoch). Used for the trending
   * algorithm — read-side pruning keeps memory bounded. Best-effort: on
   * unsave we don't remove the timestamp (cheap noise, decays out within 7 days).
   */
  recentSaves?: number[];
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

export type NotificationType =
  | 'new_follower' | 'new_like' | 'new_comment' | 'new_proof_it'
  | 'plan_recreated' | 'plan_saved' | 'mention'
  | 'rank_up' | 'badge_unlocked' | 'xp_milestone'
  | 'plan_trending' | 'plan_milestone' | 'first_in_city'
  | 'friend_posted' | 'friend_completed';

export interface Notification {
  id: string;
  recipientId: string;
  senderId: string;
  senderUsername: string;
  senderAvatar: string;          // avatarBg color
  senderAvatarUrl: string | null; // profile photo URL
  senderInitials: string;
  senderAvatarColor: string;
  type: NotificationType;
  content: string;
  planId: string | null;
  planTitle: string | null;
  planCover: string | null;
  read: boolean;
  createdAt: string;             // ISO string
}

export type ReviewSource = 'do_it_now' | 'already_done' | 'organize';

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
  source?: ReviewSource;
  createdAt: string;
  updatedAt?: string;
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

// ==================== DO IT NOW ====================

export type DoItNowTransport = 'walking' | 'transit' | 'bicycling' | 'driving';

export interface DoItNowPlaceVisit {
  placeId: string;
  placeName: string;
  arrivedAt: string;
  leftAt?: string;
  timeSpentMinutes?: number;
  photoUrl?: string;
  rating?: number;
  reviewText?: string;
  pricePaid?: number;
}

export interface DoItNowSession {
  id: string;
  planId: string;
  planTitle: string;
  userId: string;
  transport: DoItNowTransport;
  startedAt: string;
  completedAt?: string;
  currentPlaceIndex: number;
  placesVisited: DoItNowPlaceVisit[];
  totalDurationMinutes?: number;
  isPaused: boolean;
  status: 'active' | 'paused' | 'completed';
  isOrganizeMode?: boolean;
  organizeTitle?: string;
  organizeTags?: CategoryTag[];
}

export interface PlanPhoto {
  planId: string;
  planTitle: string;
  placeId: string;
  placeName: string;
  photoUrl: string;
  takenAt: string;
}
