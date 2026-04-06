export interface ExploreCategoryItem {
  name: string;
  emoji: string;
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
          { name: 'Cheap date', emoji: '💸', gradient: ['#FF9A60', '#C94520'], subtitle: 'Day & night' },
          { name: 'Medium price', emoji: '🥂', gradient: ['#A855F7', '#6D28D9'], subtitle: 'Day & night' },
          { name: 'Expensive date', emoji: '✨', gradient: ['#F59E0B', '#D97706'], subtitle: '' },
          { name: 'Rainy-day date', emoji: '🌧️', gradient: ['#34D399', '#059669'], subtitle: '' },
        ],
      },
      {
        title: 'PAR VIBE',
        items: [
          { name: 'Artistic date', emoji: '🎨', gradient: ['#EC4899', '#BE185D'], subtitle: '' },
          { name: 'Original / niche', emoji: '🔮', gradient: ['#60A5FA', '#2563EB'], subtitle: '' },
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
          { name: 'Food-lover day', emoji: '🍕', gradient: ['#FF9A60', '#C94520'], subtitle: '' },
          { name: 'Coffee-lover day', emoji: '☕', gradient: ['#A78BFA', '#7C3AED'], subtitle: '' },
        ],
      },
      {
        title: 'CULTURE & DISCOVERY',
        items: [
          { name: 'Discover niche addresses', emoji: '📍', gradient: ['#F472B6', '#DB2777'], subtitle: '' },
          { name: 'Vinyl dig', emoji: '🎵', gradient: ['#1E293B', '#475569'], subtitle: '' },
          { name: 'Cinephile day', emoji: '🎬', gradient: ['#EF4444', '#B91C1C'], subtitle: '' },
          { name: 'Theatre lover day', emoji: '🎭', gradient: ['#8B5CF6', '#6D28D9'], subtitle: '' },
        ],
      },
      {
        title: 'ACTIVITIES',
        items: [
          { name: 'Shopping day', emoji: '🛍️', gradient: ['#EC4899', '#BE185D'], subtitle: 'Niche addresses' },
          { name: 'Touristic day', emoji: '🗺️', gradient: ['#3B82F6', '#1D4ED8'], subtitle: 'Cheap / medium / expensive' },
          { name: 'Running day', emoji: '🏃', gradient: ['#10B981', '#047857'], subtitle: '' },
          { name: 'Meet new people', emoji: '🤝', gradient: ['#F59E0B', '#D97706'], subtitle: '' },
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
          { name: 'Sports & chill day', emoji: '⚽', gradient: ['#10B981', '#047857'], subtitle: '' },
          { name: 'Cool bars with the crew', emoji: '🍻', gradient: ['#F59E0B', '#D97706'], subtitle: '' },
          { name: 'Girls day', emoji: '💅', gradient: ['#EC4899', '#BE185D'], subtitle: '' },
          { name: 'Cheap & nice spot', emoji: '💰', gradient: ['#FF9A60', '#C94520'], subtitle: 'For the crew' },
          { name: 'Rainy day with friends', emoji: '🌧️', gradient: ['#60A5FA', '#2563EB'], subtitle: '' },
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
          { name: 'Shopping solo', emoji: '🛍️', gradient: ['#EC4899', '#BE185D'], subtitle: '' },
          { name: 'Good restaurant solo', emoji: '🍽️', gradient: ['#FF9A60', '#C94520'], subtitle: '' },
          { name: 'Places to relax', emoji: '🧘', gradient: ['#34D399', '#059669'], subtitle: 'On your own' },
          { name: 'Meet new people', emoji: '🤝', gradient: ['#F59E0B', '#D97706'], subtitle: '' },
          { name: 'Sports day solo', emoji: '🏋️', gradient: ['#3B82F6', '#1D4ED8'], subtitle: '' },
          { name: 'Rainy day solo', emoji: '🌧️', gradient: ['#6B7280', '#374151'], subtitle: '' },
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
          { name: 'Sad-day reset', emoji: '😔', gradient: ['#60A5FA', '#2563EB'], subtitle: 'Plans doux pour repartir doucement' },
          { name: 'Dopamine day', emoji: '⚡', gradient: ['#FBBF24', '#D97706'], subtitle: 'Boost garanti, \u00E9nergie max' },
          { name: 'Breakup recovery', emoji: '💔', gradient: ['#8B5CF6', '#6D28D9'], subtitle: "Tu vas t'en remettre, promis" },
          { name: 'Romantic solo day', emoji: '🌹', gradient: ['#F472B6', '#DB2777'], subtitle: 'Prendre soin de soi' },
          { name: 'Get your life together', emoji: '📋', gradient: ['#10B981', '#047857'], subtitle: 'Productive reset day' },
          { name: 'Productive reset day', emoji: '💪', gradient: ['#EF4444', '#B91C1C'], subtitle: 'Remise \u00E0 z\u00E9ro compl\u00E8te' },
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
          { name: 'Last-minute plan', emoji: '⏰', gradient: ['#EF4444', '#B91C1C'], subtitle: '' },
          { name: 'After-work plan', emoji: '🍸', gradient: ['#8B5CF6', '#6D28D9'], subtitle: '' },
          { name: 'Hangover recovery', emoji: '🥴', gradient: ['#10B981', '#047857'], subtitle: '' },
          { name: 'Birthday', emoji: '🎂', gradient: ['#EC4899', '#BE185D'], subtitle: '' },
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
        title: 'EN CE MOMENT \u00C0 PARIS',
        items: [
          { name: 'Best-rated spots', emoji: '🏆', gradient: ['#FF9A60', '#C94520'], subtitle: 'Les mieux not\u00E9s par Proof', hot: true },
          { name: 'Hidden gems', emoji: '💎', gradient: ['#60A5FA', '#2563EB'], subtitle: 'Adresses que personne ne conna\u00EEt', planCount: 34 },
          { name: 'Hidden city only', emoji: '🏙️', gradient: ['#1E293B', '#475569'], subtitle: 'Loin des guides touristiques', planCount: 27 },
          { name: 'Under 20\u20AC day', emoji: '💰', gradient: ['#F59E0B', '#D97706'], subtitle: 'Budget mini, exp\u00E9rience maxi', planCount: 71 },
          { name: 'Under 50\u20AC night', emoji: '🌃', gradient: ['#8B5CF6', '#6D28D9'], subtitle: 'Soir\u00E9e accessible', planCount: 58 },
          { name: 'Cool girl sports', emoji: '🏄‍♀️', gradient: ['#EC4899', '#BE185D'], subtitle: 'Pilates, padel, climbing...', planCount: 18 },
          { name: 'Only locals know', emoji: '🏘️', gradient: ['#3B82F6', '#1D4ED8'], subtitle: 'Spots 100% parisiens', planCount: 22 },
          { name: 'Meet finance bros', emoji: '💼', gradient: ['#6B7280', '#374151'], subtitle: 'Networking d\u00E9guis\u00E9', planCount: 11 },
        ],
      },
    ],
  },
];
