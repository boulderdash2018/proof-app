import { User, Plan, Place, Review, Badge, BadgeId, Notification, SavedPlan, SignupData, CategoryTag } from '../types';
import { sleep, randomDelay } from '../utils';

// ==================== SEED USERS ====================

const emma: User = {
  id: 'user-1',
  username: 'emmaleblanc',
  displayName: 'Emma Leblanc',
  initials: 'EL',
  avatarBg: '#F0EEFF',
  avatarColor: '#534AB7',
  badgeType: 'top_creator',
  bio: 'Exploratrice parisienne 🗼',
  isPrivate: false,
  xpPoints: 3200,
  coins: 180,
  level: 18,
  xpForNextLevel: 4000,
  rank: 'Gold Explorer',
  planCount: 42,
  followersCount: 1247,
  followingCount: 89,
  likesReceived: 3450,
  unlockedBadges: ['explorer', 'top_creator', 'citadin', 'viral_5', 'first_plan', 'foodie_expert'],
  createdAt: '2024-06-15T10:00:00Z',
};

const lucas: User = {
  id: 'user-2',
  username: 'lucasmartin',
  displayName: 'Lucas Martin',
  initials: 'LM',
  avatarBg: '#E8F5F0',
  avatarColor: '#0F6E56',
  badgeType: 'novice',
  bio: 'Nouveau sur Paris 🚴',
  isPrivate: true,
  xpPoints: 320,
  coins: 25,
  level: 4,
  xpForNextLevel: 500,
  rank: 'Bronze Explorer',
  planCount: 3,
  followersCount: 28,
  followingCount: 67,
  likesReceived: 112,
  unlockedBadges: ['first_plan'],
  createdAt: '2025-01-10T14:00:00Z',
};

const jade: User = {
  id: 'user-3',
  username: 'jaderousso',
  displayName: 'Jade Rousseau',
  initials: 'JR',
  avatarBg: '#FFF3E8',
  avatarColor: '#C4600A',
  badgeType: 'creator',
  bio: 'Amoureuse de Montmartre ❤️',
  isPrivate: false,
  xpPoints: 1800,
  coins: 95,
  level: 14,
  xpForNextLevel: 2500,
  rank: 'Silver Explorer',
  planCount: 18,
  followersCount: 562,
  followingCount: 134,
  likesReceived: 1890,
  unlockedBadges: ['explorer', 'citadin', 'first_plan'],
  createdAt: '2024-09-20T09:00:00Z',
};

const currentUser: User = {
  id: 'user-current',
  username: 'leotran',
  displayName: 'Léo Tran',
  initials: 'LT',
  avatarBg: '#F0EEFF',
  avatarColor: '#534AB7',
  badgeType: 'creator',
  bio: 'Curieux de tout 🌍',
  isPrivate: false,
  xpPoints: 1240,
  coins: 80,
  level: 12,
  xpForNextLevel: 2000,
  rank: 'Silver Explorer',
  planCount: 24,
  followersCount: 183,
  followingCount: 97,
  likesReceived: 1200,
  unlockedBadges: ['explorer', 'citadin'],
  createdAt: '2024-08-01T08:00:00Z',
};

// ==================== SEED REVIEWS ====================

const makeReviews = (placeId: string): Review[] => [
  {
    id: `rev-${placeId}-1`,
    authorId: 'user-1',
    authorName: 'Emma L.',
    authorInitials: 'EL',
    authorAvatarBg: '#F0EEFF',
    authorAvatarColor: '#534AB7',
    text: 'Super ambiance, je recommande à 100% ! Le cadre est magnifique et le service impeccable.',
    rating: 5,
    createdAt: '2025-02-15T12:00:00Z',
  },
  {
    id: `rev-${placeId}-2`,
    authorId: 'user-3',
    authorName: 'Jade R.',
    authorInitials: 'JR',
    authorAvatarBg: '#FFF3E8',
    authorAvatarColor: '#C4600A',
    text: 'Très chouette endroit, parfait pour une sortie entre amis.',
    rating: 4,
    createdAt: '2025-02-20T15:30:00Z',
  },
  {
    id: `rev-${placeId}-3`,
    authorId: 'user-2',
    authorName: 'Lucas M.',
    authorInitials: 'LM',
    authorAvatarBg: '#E8F5F0',
    authorAvatarColor: '#0F6E56',
    text: 'Sympa mais un peu bondé le weekend. Essayez en semaine.',
    rating: 4,
    createdAt: '2025-03-01T10:00:00Z',
  },
];

// ==================== SEED PLACES ====================

const places: Record<string, Place[]> = {
  'plan-1': [
    {
      id: 'place-1-1',
      name: 'Café Charlot',
      type: 'Brunch',
      address: '38 Rue de Bretagne, 75003 Paris',
      rating: 4.6,
      reviewCount: 84,
      ratingDistribution: [55, 25, 12, 5, 3],
      reviews: makeReviews('place-1-1'),
    },
    {
      id: 'place-1-2',
      name: 'Galerie Perrotin',
      type: 'Expo',
      address: '76 Rue de Turenne, 75003 Paris',
      rating: 4.8,
      reviewCount: 127,
      ratingDistribution: [68, 20, 8, 3, 1],
      reviews: makeReviews('place-1-2'),
    },
    {
      id: 'place-1-3',
      name: 'Ober Mamma',
      type: 'Dîner',
      address: '107 Bd Richard-Lenoir, 75011 Paris',
      rating: 4.5,
      reviewCount: 203,
      ratingDistribution: [50, 28, 14, 5, 3],
      reviews: makeReviews('place-1-3'),
    },
  ],
  'plan-2': [
    {
      id: 'place-2-1',
      name: 'Ten Belles Coffee',
      type: 'Café',
      address: '10 Rue de la Grange aux Belles, 75010 Paris',
      rating: 4.7,
      reviewCount: 156,
      ratingDistribution: [62, 22, 10, 4, 2],
      reviews: makeReviews('place-2-1'),
    },
    {
      id: 'place-2-2',
      name: "Vélib' Station Canal",
      type: 'Transport',
      address: 'Quai de Jemmapes, 75010 Paris',
      rating: 4.2,
      reviewCount: 43,
      ratingDistribution: [35, 30, 20, 10, 5],
      reviews: makeReviews('place-2-2'),
    },
    {
      id: 'place-2-3',
      name: 'Le Galopin',
      type: 'Déjeuner',
      address: '34 Rue Sainte-Marthe, 75010 Paris',
      rating: 4.9,
      reviewCount: 89,
      ratingDistribution: [78, 15, 5, 1, 1],
      reviews: makeReviews('place-2-3'),
    },
  ],
  'plan-3': [
    {
      id: 'place-3-1',
      name: 'Le Moulin de la Galette',
      type: 'Brunch',
      address: '83 Rue Lepic, 75018 Paris',
      rating: 4.4,
      reviewCount: 178,
      ratingDistribution: [45, 30, 15, 7, 3],
      reviews: makeReviews('place-3-1'),
    },
    {
      id: 'place-3-2',
      name: 'Sacré-Cœur',
      type: 'Balade',
      address: '35 Rue du Chevalier de la Barre, 75018 Paris',
      rating: 4.9,
      reviewCount: 542,
      ratingDistribution: [80, 12, 5, 2, 1],
      reviews: makeReviews('place-3-2'),
    },
    {
      id: 'place-3-3',
      name: 'La Maison Rose',
      type: 'Photo spot',
      address: '2 Rue de l\'Abreuvoir, 75018 Paris',
      rating: 4.6,
      reviewCount: 234,
      ratingDistribution: [52, 28, 12, 5, 3],
      reviews: makeReviews('place-3-3'),
    },
  ],
};

// ==================== SEED PLANS ====================

const GRADIENTS = [
  'linear-gradient(135deg, #FF9A60, #FF6B35, #C94520)',
  'linear-gradient(135deg, #5ED4B4, #1D9E75, #0B5C48)',
  'linear-gradient(135deg, #F4A0C0, #D4537E, #993556)',
  'linear-gradient(135deg, #7C8CF8, #5B5EE8, #3A3DB0)',
  'linear-gradient(135deg, #FFD76E, #F5A623, #D48B07)',
  'linear-gradient(135deg, #82E0F5, #3EADD1, #1A7BA0)',
];

let seedPlans: Plan[] = [
  {
    id: 'plan-1',
    authorId: 'user-1',
    author: emma,
    title: 'Journée Marais parfaite ☀️',
    gradient: 'linear-gradient(135deg, #FF9A60, #FF6B35, #C94520)',
    tags: ['cheap date', 'tiktokable', 'culture'] as CategoryTag[],
    places: places['plan-1'],
    price: '~22€',
    duration: '5h',
    transport: 'Métro',
    likesCount: 247,
    commentsCount: 18,
    proofCount: 0,
    declinedCount: 0,
    xpReward: 30,
    createdAt: '2025-03-28T14:00:00Z',
    timeAgo: '3j',
  },
  {
    id: 'plan-2',
    authorId: 'user-2',
    author: lucas,
    title: 'Boys trip Canal St-Martin 🛶',
    gradient: 'linear-gradient(135deg, #5ED4B4, #1D9E75, #0B5C48)',
    tags: ['w the bro', 'sport', 'outdoor'] as CategoryTag[],
    places: places['plan-2'],
    price: '~15€',
    duration: '4h',
    transport: 'Vélo',
    likesCount: 89,
    commentsCount: 7,
    proofCount: 0,
    declinedCount: 0,
    xpReward: 20,
    createdAt: '2025-03-29T10:00:00Z',
    timeAgo: '2j',
  },
  {
    id: 'plan-3',
    authorId: 'user-3',
    author: jade,
    title: 'Date parfaite à Montmartre 🌹',
    gradient: 'linear-gradient(135deg, #F4A0C0, #D4537E, #993556)',
    tags: ['cheap date', 'tiktokable', 'romantique'] as CategoryTag[],
    places: places['plan-3'],
    price: '~35€',
    duration: '6h',
    transport: 'À pied',
    likesCount: 412,
    commentsCount: 31,
    proofCount: 0,
    declinedCount: 0,
    xpReward: 45,
    createdAt: '2025-03-27T09:00:00Z',
    timeAgo: '4j',
  },
];

// ==================== SEED BADGES ====================

const allBadges: Badge[] = [
  { id: 'explorer', emoji: '🗺️', label: 'Explorateur', description: '5 plans sauvegardés', isUnlocked: false },
  { id: 'top_creator', emoji: '🏆', label: 'Top Creator', description: '100 likes reçus', isUnlocked: false },
  { id: 'citadin', emoji: '🌆', label: 'Citadin', description: '10 plans créés', isUnlocked: false },
  { id: 'viral_5', emoji: '🔥', label: 'Viral ×5', description: '1 plan avec 50+ likes', isUnlocked: false },
  { id: 'first_plan', emoji: '✨', label: 'Premier plan', description: 'Créer son 1er plan', isUnlocked: false },
  { id: 'social_butterfly', emoji: '🦋', label: 'Social Butterfly', description: '50 followers', isUnlocked: false },
  { id: 'foodie_expert', emoji: '🍽️', label: 'Foodie Expert', description: '5 plans catégorie foodie', isUnlocked: false },
];

// ==================== SEED NOTIFICATIONS ====================

// NOTE: seed kept for legacy mock parity. The Notification shape evolved
// (Firestore is the source of truth now); cast preserves the seed file
// without forcing a refactor of dead mock data.
const seedNotifications = ([
  {
    id: 'notif-1',
    type: 'like',
    fromUser: emma,
    planTitle: 'Journée Marais parfaite ☀️',
    message: 'Emma Leblanc a aimé votre plan',
    isRead: false,
    createdAt: '2025-03-31T10:00:00Z',
  },
  {
    id: 'notif-2',
    type: 'follow',
    fromUser: jade,
    message: 'Jade Rousseau a commencé à vous suivre',
    isRead: false,
    createdAt: '2025-03-31T08:30:00Z',
  },
  {
    id: 'notif-3',
    type: 'comment',
    fromUser: lucas,
    planTitle: 'Boys trip Canal St-Martin 🛶',
    message: 'Lucas Martin a commenté votre plan',
    isRead: true,
    createdAt: '2025-03-30T16:00:00Z',
  },
  {
    id: 'notif-4',
    type: 'xp_gained',
    message: 'Tu as gagné 30 XP ! Tu es passé niveau 12 🎉',
    isRead: true,
    createdAt: '2025-03-29T12:00:00Z',
  },
  {
    id: 'notif-5',
    type: 'badge_unlocked',
    message: 'Badge débloqué : 🌆 Citadin !',
    isRead: true,
    createdAt: '2025-03-28T18:00:00Z',
  },
] as unknown) as Notification[];

// ==================== SEED SAVED PLANS ====================

const seedSavedPlans: SavedPlan[] = [
  {
    planId: 'plan-2',
    plan: seedPlans[1],
    isDone: false,
    savedAt: '2025-03-29T11:00:00Z',
  },
  {
    planId: 'plan-3',
    plan: seedPlans[2],
    isDone: false,
    savedAt: '2025-03-28T15:00:00Z',
  },
];

// ==================== FOLLOWERS / FOLLOWING SEED ====================

const followersList: User[] = [emma, jade, lucas];
const followingList: User[] = [emma, jade];

// ==================== SEARCHABLE PLACES ====================

const searchablePlaces = [
  { id: 'sp-1', name: 'Le Bouillon Chartier', type: 'Restaurant' },
  { id: 'sp-2', name: 'Shakespeare and Company', type: 'Librairie' },
  { id: 'sp-3', name: 'Musée Picasso', type: 'Musée' },
  { id: 'sp-4', name: 'Canal Saint-Martin', type: 'Balade' },
  { id: 'sp-5', name: 'Le Comptoir Général', type: 'Bar' },
  { id: 'sp-6', name: 'Marché des Enfants Rouges', type: 'Marché' },
  { id: 'sp-7', name: 'Parc des Buttes-Chaumont', type: 'Parc' },
  { id: 'sp-8', name: 'La REcyclerie', type: 'Café' },
  { id: 'sp-9', name: 'Palais de Tokyo', type: 'Musée' },
  { id: 'sp-10', name: 'Rosa Bonheur', type: 'Bar' },
];

// ==================== API FUNCTIONS ====================

export const mockApi = {
  // Auth
  login: async (email: string, _password: string): Promise<User> => {
    await sleep(randomDelay());
    return { ...currentUser };
  },

  signup: async (_data: SignupData): Promise<User> => {
    await sleep(randomDelay());
    return { ...currentUser, xpPoints: 0, coins: 0, level: 1, planCount: 0, followersCount: 0, likesReceived: 0, unlockedBadges: [] };
  },

  getCurrentUser: async (): Promise<User> => {
    await sleep(randomDelay());
    return { ...currentUser };
  },

  getUserById: async (userId: string): Promise<User> => {
    await sleep(randomDelay());
    const users = [emma, lucas, jade, currentUser];
    return { ...(users.find((u) => u.id === userId) || emma) };
  },

  getUserByUsername: async (username: string): Promise<User> => {
    await sleep(randomDelay());
    const users = [emma, lucas, jade, currentUser];
    return { ...(users.find((u) => u.username === username) || emma) };
  },

  updateProfile: async (data: Partial<User>): Promise<User> => {
    await sleep(randomDelay());
    return { ...currentUser, ...data };
  },

  checkUsernameAvailable: async (username: string): Promise<boolean> => {
    await sleep(randomDelay());
    return !['emmaleblanc', 'lucasmartin', 'jaderousso'].includes(username.toLowerCase());
  },

  // Feed
  getFeed: async (): Promise<Plan[]> => {
    await sleep(randomDelay());
    return [...seedPlans];
  },

  getPlansByCategory: async (category: CategoryTag): Promise<Plan[]> => {
    await sleep(randomDelay());
    return seedPlans.filter((p) => p.tags.includes(category));
  },

  searchPlans: async (query: string): Promise<Plan[]> => {
    await sleep(randomDelay());
    const q = query.toLowerCase();
    return seedPlans.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.places.some((pl) => pl.name.toLowerCase().includes(q)) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
    );
  },

  getPlanById: async (planId: string): Promise<Plan | null> => {
    await sleep(randomDelay());
    return seedPlans.find((p) => p.id === planId) || null;
  },

  getUserPlans: async (userId: string): Promise<Plan[]> => {
    await sleep(randomDelay());
    return seedPlans.filter((p) => p.authorId === userId);
  },

  // Interactions
  likePlan: async (_planId: string): Promise<void> => {
    await sleep(200);
  },

  unlikePlan: async (_planId: string): Promise<void> => {
    await sleep(200);
  },

  savePlan: async (planId: string): Promise<SavedPlan> => {
    await sleep(200);
    const plan = seedPlans.find((p) => p.id === planId)!;
    return { planId, plan, isDone: false, savedAt: new Date().toISOString() };
  },

  unsavePlan: async (_planId: string): Promise<void> => {
    await sleep(200);
  },

  // Saves
  getSavedPlans: async (): Promise<SavedPlan[]> => {
    await sleep(randomDelay());
    return [...seedSavedPlans];
  },

  markPlanDone: async (planId: string): Promise<void> => {
    await sleep(200);
  },

  // Create
  publishPlan: async (planData: Partial<Plan>, author?: User): Promise<Plan> => {
    await sleep(1500);
    const randomGradient = GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)];
    const newPlan: Plan = {
      id: 'plan-new-' + Date.now(),
      authorId: author?.id || currentUser.id,
      author: author || currentUser,
      title: planData.title || '',
      gradient: randomGradient,
      tags: planData.tags || [],
      places: planData.places || [],
      price: planData.price || '~0€',
      duration: planData.duration || '0h',
      transport: planData.transport || 'Métro',
      likesCount: 0,
      commentsCount: 0,
      proofCount: 0,
      declinedCount: 0,
      xpReward: 20,
      createdAt: new Date().toISOString(),
      timeAgo: 'maintenant',
    };
    // Add to seedPlans so it appears in feed + profile
    seedPlans = [newPlan, ...seedPlans];
    return newPlan;
  },

  searchPlacesForCreate: async (query: string): Promise<Array<{ id: string; name: string; type: string }>> => {
    await sleep(randomDelay());
    const q = query.toLowerCase();
    return searchablePlaces.filter(
      (p) => p.name.toLowerCase().includes(q) || p.type.toLowerCase().includes(q)
    );
  },

  // Notifications
  getNotifications: async (): Promise<Notification[]> => {
    await sleep(randomDelay());
    return [...seedNotifications];
  },

  markNotificationRead: async (_id: string): Promise<void> => {
    await sleep(100);
  },

  markAllNotificationsRead: async (): Promise<void> => {
    await sleep(200);
  },

  // Social
  getFollowers: async (_userId: string): Promise<User[]> => {
    await sleep(randomDelay());
    return [...followersList];
  },

  getFollowing: async (_userId: string): Promise<User[]> => {
    await sleep(randomDelay());
    return [...followingList];
  },

  followUser: async (_userId: string): Promise<void> => {
    await sleep(300);
  },

  unfollowUser: async (_userId: string): Promise<void> => {
    await sleep(300);
  },

  // Badges
  getBadges: async (unlockedIds: BadgeId[]): Promise<Badge[]> => {
    await sleep(randomDelay());
    return allBadges.map((b) => ({
      ...b,
      isUnlocked: unlockedIds.includes(b.id),
    }));
  },

  // Forgot password
  sendPasswordReset: async (_email: string): Promise<void> => {
    await sleep(randomDelay());
  },
};

export default mockApi;
