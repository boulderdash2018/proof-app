export interface ExploreCategoryItem {
  name: string;
  emoji: string;
  gradient: [string, string];
  subtitle?: string;
}

export interface ExploreSection {
  title: string;
  items: ExploreCategoryItem[];
}

export interface ExploreGroup {
  key: string;
  label: string;
  emoji: string;
  sections: ExploreSection[];
}

export const EXPLORE_GROUPS: ExploreGroup[] = [
  {
    key: 'date',
    label: 'Date',
    emoji: '👩‍❤️‍👨',
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
    sections: [
      {
        title: 'MOOD BASED',
        items: [
          { name: 'Sad-day reset', emoji: '😢', gradient: ['#60A5FA', '#2563EB'], subtitle: '' },
          { name: 'Romantic solo day', emoji: '💝', gradient: ['#F472B6', '#DB2777'], subtitle: '' },
          { name: 'Breakup recovery', emoji: '💔', gradient: ['#8B5CF6', '#6D28D9'], subtitle: '' },
          { name: 'Dopamine day', emoji: '⚡', gradient: ['#FBBF24', '#D97706'], subtitle: '' },
          { name: 'Get your life together', emoji: '📋', gradient: ['#10B981', '#047857'], subtitle: '' },
          { name: 'Productive reset day', emoji: '💪', gradient: ['#EF4444', '#B91C1C'], subtitle: '' },
        ],
      },
    ],
  },
  {
    key: 'occasion',
    label: 'Occasion',
    emoji: '🎉',
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
    sections: [
      {
        title: 'PAR BUDGET',
        items: [
          { name: 'Under 20\u20AC day', emoji: '💶', gradient: ['#10B981', '#047857'], subtitle: '' },
          { name: 'Under 50\u20AC night', emoji: '🌙', gradient: ['#8B5CF6', '#6D28D9'], subtitle: '' },
        ],
      },
      {
        title: 'HIDDEN SPOTS',
        items: [
          { name: 'Hidden city only', emoji: '🏙️', gradient: ['#1E293B', '#475569'], subtitle: '' },
          { name: 'No tourist spots', emoji: '🚫', gradient: ['#EF4444', '#B91C1C'], subtitle: '' },
          { name: 'Only locals know', emoji: '📌', gradient: ['#F59E0B', '#D97706'], subtitle: '' },
          { name: 'Best-rated in town', emoji: '⭐', gradient: ['#FF9A60', '#C94520'], subtitle: '' },
          { name: 'Hidden gems', emoji: '💎', gradient: ['#60A5FA', '#2563EB'], subtitle: '' },
        ],
      },
      {
        title: 'LIFESTYLE',
        items: [
          { name: 'Cool girl sports', emoji: '🏄‍♀️', gradient: ['#EC4899', '#BE185D'], subtitle: '' },
          { name: 'Meet finance bros', emoji: '💼', gradient: ['#1E293B', '#475569'], subtitle: '' },
        ],
      },
    ],
  },
];
