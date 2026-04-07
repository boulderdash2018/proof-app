export interface ExploreCategoryItem {
  name: string;
  emoji: string;       // kept for mood/tendance (actual emoji)
  icon?: string;       // Ionicons icon name for grid categories
  gradient: [string, string];
  subtitle?: string;
  planCount?: number;
  hot?: boolean;
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

// Warm, muted luxury gradients for the Maison de Nuit palette
export const EXPLORE_GROUPS: ExploreGroup[] = [
  {
    key: 'date',
    label: 'Date',
    emoji: '👩‍❤️‍👨',
    layout: 'grid',
    sections: [
      {
        title: 'PAR BUDGET',
        items: [
          { name: 'Cheap date', icon: 'wallet-outline', emoji: '💸', gradient: ['#8B6A50', '#5C4030'], subtitle: 'Day & night' },
          { name: 'Medium price', icon: 'wine-outline', emoji: '🥂', gradient: ['#7B6088', '#4A3555'], subtitle: 'Day & night' },
          { name: 'Expensive date', icon: 'diamond-outline', emoji: '✨', gradient: ['#8B7530', '#5C4E20'], subtitle: '' },
          { name: 'Rainy-day date', icon: 'umbrella-outline', emoji: '🌧️', gradient: ['#4A7068', '#2D4A44'], subtitle: '' },
        ],
      },
      {
        title: 'PAR VIBE',
        items: [
          { name: 'Artistic date', icon: 'color-palette-outline', emoji: '🎨', gradient: ['#8B5070', '#5C3048'], subtitle: '' },
          { name: 'Original / niche', icon: 'compass-outline', emoji: '🔮', gradient: ['#5A6880', '#3A4858'], subtitle: '' },
          { name: 'Picnic date', icon: 'sunny-outline', emoji: '🧺', gradient: ['#4A6A50', '#2D4830'], subtitle: '' },
        ],
      },
    ],
  },
  {
    key: 'everyone',
    label: '4 Everyone',
    emoji: '🌍',
    layout: 'grid',
    sections: [
      {
        title: 'FOOD & DRINK',
        items: [
          { name: 'Food-lover day', icon: 'restaurant-outline', emoji: '🍕', gradient: ['#8B6A50', '#5C4030'], subtitle: '' },
          { name: 'Coffee-lover day', icon: 'cafe-outline', emoji: '☕', gradient: ['#6B5A70', '#4A3D55'], subtitle: '' },
          { name: 'Brunch crawl', icon: 'sunny-outline', emoji: '🥞', gradient: ['#8B7530', '#5C4E20'], subtitle: '', hot: true },
        ],
      },
      {
        title: 'CULTURE & DISCOVERY',
        items: [
          { name: 'Discover niche addresses', icon: 'location-outline', emoji: '📍', gradient: ['#7B5060', '#553040'], subtitle: '' },
          { name: 'Vinyl dig', icon: 'musical-notes-outline', emoji: '🎵', gradient: ['#5A5048', '#3D352E'], subtitle: '' },
          { name: 'Cinephile day', icon: 'film-outline', emoji: '🎬', gradient: ['#7B4A4A', '#553030'], subtitle: '' },
          { name: 'Theatre lover day', icon: 'ticket-outline', emoji: '🎭', gradient: ['#6B5080', '#4A3560'], subtitle: '' },
          { name: 'Gallery hopping', icon: 'images-outline', emoji: '🖼️', gradient: ['#6B5080', '#4A3560'], subtitle: '' },
          { name: 'Bookshop crawl', icon: 'book-outline', emoji: '📚', gradient: ['#5A5048', '#3D352E'], subtitle: '' },
        ],
      },
      {
        title: 'ACTIVITIES',
        items: [
          { name: 'Shopping day', icon: 'bag-handle-outline', emoji: '🛍️', gradient: ['#8B5070', '#5C3048'], subtitle: 'Niche addresses' },
          { name: 'Touristic day', icon: 'map-outline', emoji: '🗺️', gradient: ['#5A6878', '#3A4858'], subtitle: 'Cheap / medium / expensive' },
          { name: 'Running day', icon: 'fitness-outline', emoji: '🏃', gradient: ['#4A6A50', '#2D4830'], subtitle: '' },
          { name: 'Meet new people', icon: 'people-outline', emoji: '🤝', gradient: ['#7B6840', '#5C4E28'], subtitle: '' },
          { name: 'Thrift & vintage', icon: 'shirt-outline', emoji: '👕', gradient: ['#7B6088', '#4A3555'], subtitle: 'Fripes & pépites' },
        ],
      },
    ],
  },
  {
    key: 'friends',
    label: 'Friends',
    emoji: '👯',
    layout: 'grid',
    sections: [
      {
        title: 'AVEC LA TEAM',
        items: [
          { name: 'Sports & chill day', icon: 'football-outline', emoji: '⚽', gradient: ['#4A6A50', '#2D4830'], subtitle: '' },
          { name: 'Cool bars with the crew', icon: 'beer-outline', emoji: '🍻', gradient: ['#7B6840', '#5C4E28'], subtitle: '' },
          { name: 'Girls day', icon: 'heart-outline', emoji: '💅', gradient: ['#8B5070', '#5C3048'], subtitle: '' },
          { name: 'Cheap & nice spot', icon: 'cash-outline', emoji: '💰', gradient: ['#8B6A50', '#5C4030'], subtitle: 'For the crew' },
          { name: 'Rainy day with friends', icon: 'rainy-outline', emoji: '🌧️', gradient: ['#5A6880', '#3A4858'], subtitle: '' },
          { name: 'Wine bar crawl', icon: 'wine-outline', emoji: '🍷', gradient: ['#7B4A4A', '#553030'], subtitle: '', hot: true },
          { name: 'Padel & chill', icon: 'tennisball-outline', emoji: '🏓', gradient: ['#4A6A50', '#2D4830'], subtitle: '' },
        ],
      },
    ],
  },
  {
    key: 'alone',
    label: 'Solo',
    emoji: '🧘',
    layout: 'grid',
    sections: [
      {
        title: 'SOLO VIBES',
        items: [
          { name: 'Shopping solo', icon: 'bag-outline', emoji: '🛍️', gradient: ['#8B5070', '#5C3048'], subtitle: '' },
          { name: 'Good restaurant solo', icon: 'restaurant-outline', emoji: '🍽️', gradient: ['#8B6A50', '#5C4030'], subtitle: '' },
          { name: 'Places to relax', icon: 'leaf-outline', emoji: '🧘', gradient: ['#4A7068', '#2D4A44'], subtitle: 'On your own' },
          { name: 'Meet new people', icon: 'people-outline', emoji: '🤝', gradient: ['#7B6840', '#5C4E28'], subtitle: '' },
          { name: 'Sports day solo', icon: 'barbell-outline', emoji: '🏋️', gradient: ['#5A6878', '#3A4858'], subtitle: '' },
          { name: 'Rainy day solo', icon: 'cloudy-outline', emoji: '🌧️', gradient: ['#5A5048', '#3D352E'], subtitle: '' },
          { name: 'Wellness day', icon: 'water-outline', emoji: '🧖', gradient: ['#4A7068', '#2D4A44'], subtitle: '' },
        ],
      },
    ],
  },
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
  {
    key: 'occasion',
    label: 'Occasion',
    emoji: '🎉',
    layout: 'grid',
    sections: [
      {
        title: 'SPECIAL OCCASION',
        items: [
          { name: 'Last-minute plan', icon: 'alarm-outline', emoji: '⏰', gradient: ['#7B4A4A', '#553030'], subtitle: '' },
          { name: 'After-work plan', icon: 'moon-outline', emoji: '🍸', gradient: ['#6B5080', '#4A3560'], subtitle: '' },
          { name: 'Hangover recovery', icon: 'medical-outline', emoji: '🥴', gradient: ['#4A7068', '#2D4A44'], subtitle: '' },
          { name: 'Birthday', icon: 'gift-outline', emoji: '🎂', gradient: ['#8B5070', '#5C3048'], subtitle: '' },
          { name: 'Rooftop night', icon: 'business-outline', emoji: '🌃', gradient: ['#5A6880', '#3A4858'], subtitle: '', hot: true },
        ],
      },
    ],
  },
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
