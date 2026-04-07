export type AchievementCategory = 'plans' | 'social' | 'places' | 'special';

export type AchievementId =
  // Plans
  | 'first_step' | 'on_a_roll' | 'prolific' | 'machine'
  | 'weekly_drop' | 'city_hopper' | 'globetrotter'
  | 'rainy_day_hero' | 'solo_rider' | 'squad_goals' | 'date_master'
  | 'mood_board' | 'budget_king' | 'luxe_life'
  // Social
  | 'first_love' | 'fan_club' | 'viral'
  | 'proof_it' | 'trusted'
  | 'first_comment' | 'critic'
  | 'saved_badge' | 'must_do'
  | 'social_butterfly' | 'influence' | 'recreated'
  // Places
  | 'place_rater' | 'critic_local'
  | 'collector' | 'done_badge' | 'completionist' | 'hidden_gem'
  // Special
  | 'proof_pioneer' | 'early_adopter' | 'night_owl'
  | 'comeback_kid' | 'streak_7' | 'first_in_city';

export interface AchievementDef {
  id: AchievementId;
  name: string;
  nameEn: string;
  emoji: string;
  description: string;
  descriptionEn: string;
  category: AchievementCategory;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ─── PLANS ───
  { id: 'first_step', name: 'Premier pas', nameEn: 'First Step', emoji: '🏁', description: 'Crée ton premier plan', descriptionEn: 'Create your first plan', category: 'plans' },
  { id: 'on_a_roll', name: 'Lancé', nameEn: 'On a Roll', emoji: '🔥', description: 'Crée 5 plans', descriptionEn: 'Create 5 plans', category: 'plans' },
  { id: 'prolific', name: 'Prolifique', nameEn: 'Prolific', emoji: '⚡', description: 'Crée 10 plans', descriptionEn: 'Create 10 plans', category: 'plans' },
  { id: 'machine', name: 'Machine', nameEn: 'Machine', emoji: '🤖', description: 'Crée 25 plans', descriptionEn: 'Create 25 plans', category: 'plans' },
  { id: 'weekly_drop', name: 'Weekly Drop', nameEn: 'Weekly Drop', emoji: '📅', description: '3 plans en 7 jours', descriptionEn: '3 plans in 7 days', category: 'plans' },
  { id: 'city_hopper', name: 'City Hopper', nameEn: 'City Hopper', emoji: '🚆', description: 'Plans dans 2 villes différentes', descriptionEn: 'Plans in 2 different cities', category: 'plans' },
  { id: 'globetrotter', name: 'Globetrotter', nameEn: 'Globetrotter', emoji: '🌍', description: 'Plans dans 4 villes différentes', descriptionEn: 'Plans in 4 different cities', category: 'plans' },
  { id: 'rainy_day_hero', name: 'Rainy Day Hero', nameEn: 'Rainy Day Hero', emoji: '☔', description: '1 plan catégorie rainy day', descriptionEn: '1 plan in rainy day category', category: 'plans' },
  { id: 'solo_rider', name: 'Solo Rider', nameEn: 'Solo Rider', emoji: '🎧', description: '5 plans catégorie solo', descriptionEn: '5 solo category plans', category: 'plans' },
  { id: 'squad_goals', name: 'Squad Goals', nameEn: 'Squad Goals', emoji: '👯', description: '5 plans catégorie friends', descriptionEn: '5 friends category plans', category: 'plans' },
  { id: 'date_master', name: 'Date Master', nameEn: 'Date Master', emoji: '💕', description: '5 plans catégorie date', descriptionEn: '5 date category plans', category: 'plans' },
  { id: 'mood_board', name: 'Mood Board', nameEn: 'Mood Board', emoji: '🎨', description: '1 plan dans chaque mood : sad-day, dopamine, breakup, romantic, productive', descriptionEn: '1 plan in each mood: sad-day, dopamine, breakup, romantic, productive', category: 'plans' },
  { id: 'budget_king', name: 'Budget King', nameEn: 'Budget King', emoji: '💰', description: '5 plans à 20€ ou moins', descriptionEn: '5 plans at 20€ or less', category: 'plans' },
  { id: 'luxe_life', name: 'Luxe Life', nameEn: 'Luxe Life', emoji: '💎', description: '1 plan à 200€ ou plus', descriptionEn: '1 plan at 200€ or more', category: 'plans' },

  // ─── SOCIAL ───
  { id: 'first_love', name: 'First Love', nameEn: 'First Love', emoji: '❤️', description: 'Reçois ton premier like', descriptionEn: 'Receive your first like', category: 'social' },
  { id: 'fan_club', name: 'Fan Club', nameEn: 'Fan Club', emoji: '🙌', description: 'Reçois 50 likes au total', descriptionEn: 'Receive 50 total likes', category: 'social' },
  { id: 'viral', name: 'Viral', nameEn: 'Viral', emoji: '🚀', description: '1 plan avec 100+ likes', descriptionEn: '1 plan with 100+ likes', category: 'social' },
  { id: 'proof_it', name: 'Proof It', nameEn: 'Proof It', emoji: '✅', description: 'Reçois ta première validation Proof', descriptionEn: 'Receive your first Proof validation', category: 'social' },
  { id: 'trusted', name: 'Trusted', nameEn: 'Trusted', emoji: '🛡️', description: 'Reçois 10 validations Proof', descriptionEn: 'Receive 10 Proof validations', category: 'social' },
  { id: 'first_comment', name: 'First Comment', nameEn: 'First Comment', emoji: '💬', description: 'Poste ton premier commentaire', descriptionEn: 'Post your first comment', category: 'social' },
  { id: 'critic', name: 'Critic', nameEn: 'Critic', emoji: '📝', description: 'Poste 10 commentaires', descriptionEn: 'Post 10 comments', category: 'social' },
  { id: 'saved_badge', name: 'Saved', nameEn: 'Saved', emoji: '🔖', description: '1 plan sauvegardé 10+ fois', descriptionEn: '1 plan saved 10+ times', category: 'social' },
  { id: 'must_do', name: 'Must Do', nameEn: 'Must Do', emoji: '⭐', description: '1 plan sauvegardé 50+ fois', descriptionEn: '1 plan saved 50+ times', category: 'social' },
  { id: 'social_butterfly', name: 'Social Butterfly', nameEn: 'Social Butterfly', emoji: '🦋', description: '10 abonnés', descriptionEn: '10 followers', category: 'social' },
  { id: 'influence', name: 'Influence', nameEn: 'Influence', emoji: '📣', description: '50 abonnés', descriptionEn: '50 followers', category: 'social' },
  { id: 'recreated', name: 'Recreated', nameEn: 'Recreated', emoji: '🔄', description: '1 plan refait par quelqu\'un', descriptionEn: '1 plan recreated by someone', category: 'social' },

  // ─── PLACES ───
  { id: 'place_rater', name: 'Place Rater', nameEn: 'Place Rater', emoji: '📍', description: 'Note ton premier lieu', descriptionEn: 'Rate your first place', category: 'places' },
  { id: 'critic_local', name: 'Critic Local', nameEn: 'Local Critic', emoji: '🏅', description: 'Note 10 lieux', descriptionEn: 'Rate 10 places', category: 'places' },
  { id: 'collector', name: 'Collector', nameEn: 'Collector', emoji: '📚', description: 'Sauvegarde 20 plans', descriptionEn: 'Save 20 plans', category: 'places' },
  { id: 'done_badge', name: 'Done', nameEn: 'Done', emoji: '✓', description: 'Complète ton premier plan', descriptionEn: 'Complete your first plan', category: 'places' },
  { id: 'completionist', name: 'Completionist', nameEn: 'Completionist', emoji: '🏆', description: 'Complète 10 plans', descriptionEn: 'Complete 10 plans', category: 'places' },
  { id: 'hidden_gem', name: 'Hidden Gem', nameEn: 'Hidden Gem', emoji: '💎', description: '1 lieu avec moins de 100 avis Google', descriptionEn: '1 place with fewer than 100 Google reviews', category: 'places' },

  // ─── SPECIAL ───
  { id: 'proof_pioneer', name: 'Proof Pioneer', nameEn: 'Proof Pioneer', emoji: '🏴', description: 'Parmi les 500 premiers inscrits', descriptionEn: 'Among the first 500 users', category: 'special' },
  { id: 'early_adopter', name: 'Early Adopter', nameEn: 'Early Adopter', emoji: '🌅', description: 'Inscrit avant le lancement public', descriptionEn: 'Signed up before public launch', category: 'special' },
  { id: 'night_owl', name: 'Night Owl', nameEn: 'Night Owl', emoji: '🦉', description: '1 plan créé entre 00h et 05h', descriptionEn: '1 plan created between midnight and 5am', category: 'special' },
  { id: 'comeback_kid', name: 'Comeback Kid', nameEn: 'Comeback Kid', emoji: '🔙', description: 'Retour après 30 jours inactif + plan posté', descriptionEn: 'Return after 30 days inactive + plan posted', category: 'special' },
  { id: 'streak_7', name: 'Streak', nameEn: 'Streak', emoji: '🔥', description: 'Actif 7 jours consécutifs', descriptionEn: 'Active 7 consecutive days', category: 'special' },
  { id: 'first_in_city', name: 'First in City', nameEn: 'First in City', emoji: '🗺️', description: 'Premier à poster dans une nouvelle ville', descriptionEn: 'First to post in a new city', category: 'special' },
];

export const TOTAL_ACHIEVEMENTS = ACHIEVEMENTS.length;

export const ACHIEVEMENTS_BY_CATEGORY = {
  plans: ACHIEVEMENTS.filter((a) => a.category === 'plans'),
  social: ACHIEVEMENTS.filter((a) => a.category === 'social'),
  places: ACHIEVEMENTS.filter((a) => a.category === 'places'),
  special: ACHIEVEMENTS.filter((a) => a.category === 'special'),
};
