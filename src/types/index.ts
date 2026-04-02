export type BadgeType = 'top_creator' | 'creator' | 'novice';

export type TransportMode = 'Métro' | 'Vélo' | 'À pied' | 'Voiture' | 'Trottinette';

export type CategoryTag =
  | 'cheap date' | 'w the bro' | 'alone' | 'tiktokable' | 'niche'
  | 'soirée' | 'sport' | 'famille' | 'culture' | 'outdoor'
  | 'foodie' | 'fashion' | 'romantique' | 'solo vibe';

export interface User {
  id: string;
  username: string;
  displayName: string;
  initials: string;
  avatarUrl?: string;
  avatarBg: string;
  avatarColor: string;
  badgeType: BadgeType;
  bio?: string;
  isPrivate: boolean;
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
  name: string;
  type: string;
  address: string;
  rating: number;
  reviewCount: number;
  ratingDistribution: [number, number, number, number, number];
  reviews: Review[];
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
  likesCount: number;
  commentsCount: number;
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

export interface SavedPlan {
  planId: string;
  plan: Plan;
  isDone: boolean;
  savedAt: string;
}

export interface SignupData {
  firstName: string;
  email: string;
  password: string;
}
