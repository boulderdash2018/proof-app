export interface ExploreCategoryItem {
  name: string;
  emoji: string;
  icon?: string;
  gradient: [string, string];
  subtitle?: string;
  planCount?: number;
  hot?: boolean;
  badgeLabel?: string;   // e.g. "🔥 Cette semaine", "📈 En hausse"
}

export interface ExploreSection {
  title: string;
  items: ExploreCategoryItem[];
}

export type ExploreLayout = 'grid' | 'mood-list' | 'ranked-list';

export interface ExploreGroup {
  key: string;
  label: string;
  emoji: string;
  layout: ExploreLayout;
  sections: ExploreSection[];
}

// ═══════════════════════════════════════════════
// ROW 1 — Par personne
// ═══════════════════════════════════════════════

export interface PersonFilter {
  key: string;
  label: string;
  emoji: string;
}

export const PERSON_FILTERS: PersonFilter[] = [
  { key: 'date', label: 'Date', emoji: '👩‍❤️‍👨' },
  { key: 'friends', label: 'Friends', emoji: '👯' },
  { key: 'solo', label: 'Solo', emoji: '🧘' },
  { key: 'family', label: 'Family', emoji: '👨‍👩‍👧' },
  { key: 'pet-friendly', label: 'Pet-Friendly', emoji: '🐾' },
  { key: 'co-worker', label: 'Co-Worker', emoji: '💼' },
  { key: 'around-you', label: 'Around You', emoji: '📍' },
];

// ═══════════════════════════════════════════════
// ROW 2 — Par thème / Catégorie
// ═══════════════════════════════════════════════

export const EXPLORE_GROUPS: ExploreGroup[] = [
  // ── FOOD & DRINKS ──
  {
    key: 'food-drinks',
    label: 'Food & Drinks',
    emoji: '🍽️',
    layout: 'grid',
    sections: [
      {
        title: 'FOOD & DRINKS',
        items: [
          { name: 'Coffee lover', icon: 'cafe-outline', emoji: '☕', gradient: ['#6B5A70', '#4A3D55'] },
          { name: 'Cool bars', icon: 'beer-outline', emoji: '🍻', gradient: ['#7B6840', '#5C4E28'] },
          { name: 'Authentic Restaurant', icon: 'restaurant-outline', emoji: '🍽️', gradient: ['#8B6A50', '#5C4030'] },
          { name: 'Cool Concept', icon: 'bulb-outline', emoji: '💡', gradient: ['#7B6088', '#4A3555'] },
          { name: 'Wine lover', icon: 'wine-outline', emoji: '🍷', gradient: ['#7B4A4A', '#553030'] },
          { name: 'Niche / Hidden gems', icon: 'compass-outline', emoji: '💎', gradient: ['#5A6880', '#3A4858'] },
          { name: 'Original', icon: 'sparkles-outline', emoji: '✨', gradient: ['#8B7530', '#5C4E20'] },
          { name: 'Loved by Proofers', icon: 'heart-outline', emoji: '❤️', gradient: ['#8B5070', '#5C3048'], hot: true },
          { name: 'Bar to watch sports', icon: 'tv-outline', emoji: '📺', gradient: ['#4A6A50', '#2D4830'] },
        ],
      },
    ],
  },

  // ── CULTURE & DISCOVERY ──
  {
    key: 'culture-discovery',
    label: 'Culture & Discovery',
    emoji: '🎨',
    layout: 'grid',
    sections: [
      {
        title: 'CULTURE & DISCOVERY',
        items: [
          { name: 'Museum', icon: 'business-outline', emoji: '🏛️', gradient: ['#7B6088', '#4A3555'] },
          { name: 'Aquarium / Zoo', icon: 'fish-outline', emoji: '🐠', gradient: ['#4A7068', '#2D4A44'] },
          { name: 'Fashion', icon: 'shirt-outline', emoji: '👗', gradient: ['#8B5070', '#5C3048'] },
          { name: 'Shopping', icon: 'bag-handle-outline', emoji: '🛍️', gradient: ['#8B6A50', '#5C4030'] },
          { name: 'City Tour', icon: 'map-outline', emoji: '🗺️', gradient: ['#5A6878', '#3A4858'] },
          { name: 'Nature', icon: 'leaf-outline', emoji: '🌿', gradient: ['#4A6A50', '#2D4830'] },
          { name: 'Cool neighbourhood', icon: 'location-outline', emoji: '🏘️', gradient: ['#5A5048', '#3D352E'] },
          { name: 'Niche / Hidden gems', icon: 'compass-outline', emoji: '💎', gradient: ['#5A6880', '#3A4858'] },
          { name: 'Original', icon: 'sparkles-outline', emoji: '✨', gradient: ['#8B7530', '#5C4E20'] },
          { name: 'Loved by Proofers', icon: 'heart-outline', emoji: '❤️', gradient: ['#8B5070', '#5C3048'], hot: true },
          { name: 'Vinyl', icon: 'musical-notes-outline', emoji: '🎵', gradient: ['#5A5048', '#3D352E'] },
          { name: 'Places for Music lovers', icon: 'headset-outline', emoji: '🎧', gradient: ['#6B5080', '#4A3560'] },
        ],
      },
    ],
  },

  // ── SPORTS ──
  {
    key: 'sports',
    label: 'Sports',
    emoji: '🏃',
    layout: 'grid',
    sections: [
      {
        title: 'SPORTS',
        items: [
          { name: 'Les classiques urbains', icon: 'football-outline', emoji: '⚽', gradient: ['#4A6A50', '#2D4830'] },
          { name: 'Sports de salle tendance', icon: 'barbell-outline', emoji: '🏋️', gradient: ['#7B6088', '#4A3555'] },
          { name: 'Sports de raquette', icon: 'tennisball-outline', emoji: '🎾', gradient: ['#8B7530', '#5C4E20'] },
          { name: 'Sports outdoor & lifestyle', icon: 'bicycle-outline', emoji: '🚴', gradient: ['#4A7068', '#2D4A44'] },
          { name: 'Récupération & wellness', icon: 'water-outline', emoji: '🧖', gradient: ['#6B5A70', '#4A3D55'] },
          { name: 'Sports sociaux & crew', icon: 'people-outline', emoji: '🤝', gradient: ['#7B6840', '#5C4E28'] },
          { name: 'Niche & émergent', icon: 'flash-outline', emoji: '⚡', gradient: ['#5A6880', '#3A4858'] },
          { name: 'Cool Places to watch', icon: 'tv-outline', emoji: '📺', gradient: ['#7B4A4A', '#553030'] },
          { name: 'Niche / Hidden gems', icon: 'compass-outline', emoji: '💎', gradient: ['#5A6880', '#3A4858'] },
          { name: 'Original', icon: 'sparkles-outline', emoji: '✨', gradient: ['#8B7530', '#5C4E20'] },
          { name: 'Loved by Proofers', icon: 'heart-outline', emoji: '❤️', gradient: ['#8B5070', '#5C3048'], hot: true },
        ],
      },
    ],
  },

  // ── OTHER ──
  {
    key: 'other',
    label: 'Other',
    emoji: '🔮',
    layout: 'grid',
    sections: [
      {
        title: 'OTHER',
        items: [
          { name: 'Tout le reste', icon: 'apps-outline', emoji: '🌀', gradient: ['#5A5048', '#3D352E'], subtitle: 'Ce qui ne rentre nulle part ailleurs' },
        ],
      },
    ],
  },

  // ── MOOD (unchanged) ──
  {
    key: 'mood',
    label: 'Mood',
    emoji: '💭',
    layout: 'mood-list',
    sections: [
      {
        title: 'COMMENT TU TE SENS ?',
        items: [
          { name: 'Sad-day reset', emoji: '😔', gradient: ['#5A6880', '#3A4858'], subtitle: 'Plans doux pour repartir doucement' },
          { name: 'Dopamine day', emoji: '⚡', gradient: ['#8B7530', '#5C4E20'], subtitle: 'Boost garanti, énergie max' },
          { name: 'Breakup recovery', emoji: '💔', gradient: ['#7B6088', '#4A3555'], subtitle: "Tu vas t'en remettre, promis" },
          { name: 'Romantic solo day', emoji: '🌹', gradient: ['#8B5070', '#5C3048'], subtitle: 'Prendre soin de soi' },
          { name: 'Get your life together', emoji: '📋', gradient: ['#4A6A50', '#2D4830'], subtitle: 'Productive reset day' },
          { name: 'Productive reset day', emoji: '💪', gradient: ['#7B4A4A', '#553030'], subtitle: 'Remise à zéro complète' },
        ],
      },
    ],
  },

  // ── TENDANCE (unchanged) ──
  {
    key: 'trending',
    label: 'Tendance',
    emoji: '🔥',
    layout: 'ranked-list',
    sections: [
      {
        title: 'EN CE MOMENT À PARIS',
        items: [
          { name: 'Best-rated spots', emoji: '🏆', gradient: ['#8B6A50', '#5C4030'], subtitle: 'Les mieux notés par Proof', hot: true },
          { name: 'Hidden gems', emoji: '💎', gradient: ['#5A6880', '#3A4858'], subtitle: 'Adresses que personne ne connaît', planCount: 34 },
          { name: 'Hidden city only', emoji: '🏙️', gradient: ['#5A5048', '#3D352E'], subtitle: 'Loin des guides touristiques', planCount: 27 },
          { name: 'Under 20€ day', emoji: '💰', gradient: ['#7B6840', '#5C4E28'], subtitle: 'Budget mini, expérience maxi', planCount: 71 },
          { name: 'Under 50€ night', emoji: '🌃', gradient: ['#6B5080', '#4A3560'], subtitle: 'Soirée accessible', planCount: 58 },
          { name: 'Cool girl sports', emoji: '🏄‍♀️', gradient: ['#8B5070', '#5C3048'], subtitle: 'Pilates, padel, climbing...', planCount: 18 },
          { name: 'Only locals know', emoji: '🏘️', gradient: ['#5A6878', '#3A4858'], subtitle: 'Spots 100% parisiens', planCount: 22 },
          { name: 'Meet finance bros', emoji: '💼', gradient: ['#5A5048', '#3D352E'], subtitle: 'Networking déguisé', planCount: 11 },
        ],
      },
    ],
  },
];
