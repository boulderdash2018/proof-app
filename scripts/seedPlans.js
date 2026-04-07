/**
 * Seed Proof app with official plans from the @proof account.
 * Fetches real places from Google Places API (New).
 * Run: node scripts/seedPlans.js
 * Requires Node.js 18+ (global fetch).
 */

const { initializeApp } = require('firebase/app');
const {
  getFirestore, collection, getDocs, setDoc, doc, query, where, updateDoc,
} = require('firebase/firestore');

// ═══════════════════ CONFIG ═══════════════════

const firebaseConfig = {
  apiKey: 'AIzaSyBMwRpnw0zmOxkV661V5ByvWGf64GhjEsw',
  authDomain: 'proof-app-97cb0.firebaseapp.com',
  projectId: 'proof-app-97cb0',
  storageBucket: 'proof-app-97cb0.firebasestorage.app',
  messagingSenderId: '582557455243',
  appId: '1:582557455243:web:2c11ea8d53a343a99ad58e',
};

const GOOGLE_API_KEY = 'AIzaSyDW8Yq6u3_IaOWTnUyy_SLlW96pkmPaWoA';
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const GRADIENTS = [
  'linear-gradient(135deg, #FF9A60, #FF6B35, #C94520)',
  'linear-gradient(135deg, #5ED4B4, #1D9E75, #0B5C48)',
  'linear-gradient(135deg, #F4A0C0, #D4537E, #993556)',
  'linear-gradient(135deg, #7C8CF8, #5B5EE8, #3A3DB0)',
  'linear-gradient(135deg, #FFD76E, #F5A623, #D48B07)',
  'linear-gradient(135deg, #82E0F5, #3EADD1, #1A7BA0)',
];

const TYPE_LABELS = {
  restaurant: 'Restaurant', cafe: 'Café', bar: 'Bar', bakery: 'Boulangerie',
  museum: 'Musée', art_gallery: 'Galerie', park: 'Parc', night_club: 'Club',
  movie_theater: 'Cinéma', clothing_store: 'Boutique', book_store: 'Librairie',
  shopping_mall: 'Centre commercial', gym: 'Salle de sport', spa: 'Spa',
  tourist_attraction: 'Attraction', church: 'Église', library: 'Bibliothèque',
  stadium: 'Stade', store: 'Boutique', food: 'Restaurant',
  point_of_interest: 'Lieu', establishment: 'Lieu',
};

function getReadableType(types, fallback) {
  for (const t of types) { if (TYPE_LABELS[t]) return TYPE_LABELS[t]; }
  return fallback || 'Lieu';
}

// ═══════════════════ GOOGLE PLACES API ═══════════════════

const placeCache = {};

async function searchPlace(searchQuery) {
  if (placeCache[searchQuery]) return placeCache[searchQuery];

  const fields = [
    'places.id', 'places.displayName', 'places.formattedAddress',
    'places.types', 'places.rating', 'places.userRatingCount',
    'places.priceLevel', 'places.photos', 'places.location',
  ];

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': fields.join(','),
      },
      body: JSON.stringify({
        textQuery: searchQuery,
        languageCode: 'fr',
        maxResultCount: 1,
        locationBias: {
          circle: {
            center: { latitude: 48.8566, longitude: 2.3522 },
            radius: 15000,
          },
        },
      }),
    });

    const data = await res.json();
    if (!data.places || data.places.length === 0) return null;

    const p = data.places[0];
    const photoUrls = (p.photos || []).slice(0, 3).map(ph =>
      `https://places.googleapis.com/v1/${ph.name}/media?maxWidthPx=600&key=${GOOGLE_API_KEY}`
    );

    const result = {
      placeId: p.id,
      name: p.displayName?.text || '',
      address: p.formattedAddress || '',
      types: p.types || [],
      rating: p.rating || 0,
      reviewCount: p.userRatingCount || 0,
      priceLevel: p.priceLevel ? parsePriceLevel(p.priceLevel) : undefined,
      photoUrls,
      latitude: p.location?.latitude || 0,
      longitude: p.location?.longitude || 0,
    };
    placeCache[searchQuery] = result;
    return result;
  } catch (err) {
    console.error(`  API error for "${searchQuery}":`, err.message);
    return null;
  }
}

function parsePriceLevel(level) {
  const map = {
    PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return map[level] ?? undefined;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatDuration(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

// ═══════════════════ PLAN DEFINITIONS ═══════════════════
// Each place: [searchQuery, fallbackType, priceEur, durationMin]

const SEED_PLANS = [
  // ──────── DATE: PAR BUDGET ────────
  {
    title: 'Date à 20 balles qui claque',
    tags: ['Cheap date', 'cheap date'],
    transport: 'Métro',
    places: [
      ['Parc des Buttes-Chaumont Paris', 'Parc', 0, 30],
      ['Chez Alain Miam Miam Paris crêperie', 'Crêperie', 8, 40],
      ['Café Oberkampf Paris', 'Café', 5, 25],
      ['Le Comptoir Général Paris bar', 'Bar', 7, 60],
    ],
  },
  {
    title: 'Soirée parfaite à 50€',
    tags: ['Medium price'],
    transport: 'À pied',
    places: [
      ['Palais de Tokyo Paris musée', 'Musée', 14, 60],
      ['Café Kitsuné Palais Royal Paris', 'Café', 7, 25],
      ['Le Bouillon Julien Paris restaurant', 'Restaurant', 18, 60],
      ['Candelaria Paris bar cocktail', 'Bar', 14, 45],
    ],
  },
  {
    title: 'All-in : la soirée royale',
    tags: ['Expensive date'],
    transport: 'Voiture',
    places: [
      ['Fondation Louis Vuitton Paris', 'Musée', 16, 75],
      ['Café de Flore Paris', 'Café', 14, 30],
      ['Clamato Paris restaurant', 'Restaurant', 55, 75],
      ['Experimental Cocktail Club Paris', 'Bar', 22, 60],
    ],
  },
  {
    title: "Quand il pleut, on s'aime mieux",
    tags: ['Rainy-day date'],
    transport: 'Métro',
    places: [
      ["Musée de l'Orangerie Paris", 'Musée', 12, 60],
      ['Café Stern Paris Passage des Panoramas', 'Café', 10, 30],
      ['Le Grand Rex Paris cinéma', 'Cinéma', 14, 120],
    ],
  },

  // ──────── DATE: PAR VIBE ────────
  {
    title: "L'art nous va si bien",
    tags: ['Artistic date', 'culture'],
    transport: 'Métro',
    places: [
      ["Atelier des Lumières Paris", 'Musée', 16, 50],
      ['Wild and the Moon Paris Marais', 'Café', 8, 25],
      ['Le BAL Paris galerie photo', 'Galerie', 8, 40],
      ['La Bellevilloise Paris bar', 'Bar', 10, 60],
    ],
  },
  {
    title: 'Le date que personne fait',
    tags: ['Original / niche', 'niche'],
    transport: 'À pied',
    places: [
      ['Musée de la Chasse et de la Nature Paris', 'Musée', 8, 45],
      ['Boot Café Paris', 'Café', 5, 20],
      ['Shakespeare and Company Paris librairie', 'Librairie', 0, 25],
      ['Le Dernier Bar avant la Fin du Monde Paris', 'Bar', 14, 60],
    ],
  },
  {
    title: 'Picnic sur les quais, date rêvée',
    tags: ['Picnic date', 'cheap date', 'outdoor'],
    transport: 'À pied',
    places: [
      ['Marché Bastille Paris', 'Marché', 12, 30],
      ['Île Saint-Louis Paris', 'Lieu', 0, 20],
      ['Square du Vert-Galant Paris', 'Parc', 0, 90],
    ],
  },

  // ──────── 4 EVERYONE: FOOD & DRINK ────────
  {
    title: 'Le food trip ultime',
    tags: ['Food-lover day', 'foodie'],
    transport: 'À pied',
    places: [
      ['Marché des Enfants Rouges Paris', 'Marché', 12, 45],
      ['Breizh Café Paris Marais crêperie', 'Crêperie', 16, 50],
      ['Jacques Genin Paris chocolatier pâtissier', 'Pâtisserie', 10, 20],
      ['Le Bouillon Chartier Paris restaurant', 'Restaurant', 15, 60],
    ],
  },
  {
    title: 'Coffee crawl des vrais',
    tags: ['Coffee-lover day', 'foodie'],
    transport: 'Vélo',
    places: [
      ['Belleville Brûlerie Paris café', 'Café', 5, 25],
      ['Café Oberkampf Paris', 'Café', 5, 25],
      ['Honor Café Paris', 'Café', 5, 25],
      ['Fragments Paris café spécialité', 'Café', 5, 25],
      ['Telescope Café Paris', 'Café', 5, 20],
    ],
  },
  {
    title: 'Le brunch crawl du dimanche',
    tags: ['Brunch crawl', 'foodie'],
    transport: 'Vélo',
    places: [
      ['Season Paris restaurant healthy', 'Restaurant', 16, 50],
      ['Ob-La-Di café Paris', 'Café', 8, 25],
      ['Holybelly Paris restaurant brunch', 'Restaurant', 16, 50],
    ],
  },

  // ──────── 4 EVERYONE: CULTURE & DISCOVERY ────────
  {
    title: 'Adresses que personne donne',
    tags: ['Discover niche addresses', 'niche'],
    transport: 'À pied',
    places: [
      ['The Broken Arm Paris concept store', 'Boutique', 0, 20],
      ['Galerie Perrotin Paris Marais', 'Galerie', 0, 30],
      ['Le Syndicat Paris bar cocktail', 'Bar', 14, 45],
      ['Librairie Yvon Lambert Paris', 'Librairie', 0, 20],
    ],
  },
  {
    title: 'Chasse au vinyle dans Paris',
    tags: ['Vinyl dig', 'niche', 'culture'],
    transport: 'À pied',
    places: [
      ['Bimbo Tower Paris disquaire', 'Boutique', 15, 30],
      ['Superfly Records Paris disquaire', 'Boutique', 10, 30],
      ['Balades Sonores Paris disquaire', 'Boutique', 10, 25],
      ['Café Lomi Paris', 'Café', 5, 20],
    ],
  },
  {
    title: 'Journée cinéphile parfaite',
    tags: ['Cinephile day', 'culture'],
    transport: 'Métro',
    places: [
      ['Cinémathèque Française Paris Bercy', 'Cinéma', 7, 120],
      ['Café des Deux Moulins Paris Amélie', 'Café', 8, 30],
      ['Le Champo cinéma Paris', 'Cinéma', 10, 120],
    ],
  },
  {
    title: 'Soirée théâtre complète',
    tags: ['Theatre lover day', 'culture'],
    transport: 'À pied',
    places: [
      ['Café de la Mairie Paris Saint-Sulpice', 'Café', 7, 25],
      ['Théâtre de la Huchette Paris', 'Théâtre', 25, 90],
      ['La Comédie-Française Paris', 'Théâtre', 30, 120],
    ],
  },
  {
    title: 'De galerie en galerie',
    tags: ['Gallery hopping', 'culture'],
    transport: 'À pied',
    places: [
      ['Galerie Perrotin Paris Marais', 'Galerie', 0, 30],
      ['Galerie Thaddaeus Ropac Paris Marais', 'Galerie', 0, 30],
      ['Galerie Templon Paris', 'Galerie', 0, 30],
      ['Café Stern Paris Passage des Panoramas', 'Café', 10, 25],
    ],
  },
  {
    title: 'Librairies cachées de Paris',
    tags: ['Bookshop crawl', 'culture', 'niche'],
    transport: 'À pied',
    places: [
      ['Shakespeare and Company Paris librairie', 'Librairie', 0, 30],
      ['Librairie Yvon Lambert Paris', 'Librairie', 0, 20],
      ['The Abbey Bookshop Paris', 'Librairie', 0, 20],
      ['Café de la Nouvelle Mairie Paris', 'Café', 7, 30],
    ],
  },

  // ──────── 4 EVERYONE: ACTIVITIES ────────
  {
    title: 'Shopping hors des sentiers',
    tags: ['Shopping day', 'fashion'],
    transport: 'À pied',
    places: [
      ['Merci Paris concept store boulevard Beaumarchais', 'Boutique', 30, 40],
      ['Centre Commercial Paris rue de Marseille', 'Boutique', 25, 30],
      ['Kilo Shop Paris Marais vintage', 'Boutique', 20, 30],
    ],
  },
  {
    title: 'Touriste oui, basique non',
    tags: ['Touristic day'],
    transport: 'Métro',
    places: [
      ['Sacré-Cœur Montmartre Paris', 'Attraction', 0, 45],
      ["Musée d'Orsay Paris", 'Musée', 16, 90],
      ['Rue Cler Paris marché', 'Lieu', 10, 30],
      ['Le Bouillon Chartier Paris restaurant', 'Restaurant', 15, 60],
    ],
  },
  {
    title: 'Run & brunch du dimanche',
    tags: ['Running day', 'sport', 'outdoor'],
    transport: 'À pied',
    places: [
      ['Jardin du Luxembourg Paris', 'Parc', 0, 45],
      ['Ten Belles Bread Paris boulangerie', 'Boulangerie', 8, 25],
      ['Season Paris restaurant healthy brunch', 'Restaurant', 18, 45],
    ],
  },
  {
    title: 'Là où les parisiens se parlent',
    tags: ['Meet new people'],
    transport: 'Métro',
    places: [
      ['Ground Control Paris bar', 'Bar', 8, 60],
      ['La REcyclerie Paris café', 'Café', 8, 40],
      ['Wanderlust Paris bar', 'Bar', 12, 60],
    ],
  },
  {
    title: 'Chine & vintage parisien',
    tags: ['Thrift & vintage', 'fashion', 'niche'],
    transport: 'Métro',
    places: [
      ['Kilo Shop Paris vintage Marais', 'Boutique', 20, 30],
      ["Free'P'Star Paris friperie", 'Boutique', 15, 25],
      ["Marché aux Puces de Saint-Ouen Paris", 'Marché', 20, 60],
      ['Café Lomi Paris', 'Café', 5, 20],
    ],
  },

  // ──────── FRIENDS ────────
  {
    title: 'Escalade, bières, rooftop',
    tags: ['Sports & chill day', 'sport', 'w the bro'],
    transport: 'Métro',
    places: [
      ["Climb Up Paris Porte d'Ivry escalade", 'Sport', 18, 90],
      ['Rosa Bonheur sur Seine Paris bar', 'Bar', 10, 60],
      ['Le Perchoir Paris rooftop bar', 'Bar', 14, 60],
    ],
  },
  {
    title: 'Le bar crawl du quartier',
    tags: ['Cool bars with the crew', 'soirée', 'w the bro'],
    transport: 'À pied',
    places: [
      ['Le Syndicat Paris cocktail bar', 'Bar', 14, 45],
      ['Candelaria Paris bar cocktail', 'Bar', 14, 45],
      ['Little Red Door Paris bar cocktail', 'Bar', 15, 45],
      ['Le Perchoir Marais Paris rooftop bar', 'Bar', 14, 45],
    ],
  },
  {
    title: 'Girls day sans cliché',
    tags: ['Girls day', 'fashion'],
    transport: 'À pied',
    places: [
      ['Season Paris restaurant brunch healthy', 'Restaurant', 16, 50],
      ['Merci Paris concept store', 'Boutique', 0, 30],
      ['Café de Flore Paris', 'Café', 12, 40],
      ['Maison Kitsuné Paris boutique', 'Boutique', 0, 20],
    ],
  },
  {
    title: 'La sortie à 15€ par tête',
    tags: ['Cheap & nice spot', 'cheap date', 'w the bro'],
    transport: 'Métro',
    places: [
      ['Parc de la Villette Paris', 'Parc', 0, 40],
      ['Le Bouillon Pigalle Paris restaurant', 'Restaurant', 12, 50],
      ['Le Pop In Paris bar Oberkampf', 'Bar', 5, 60],
    ],
  },
  {
    title: 'Pluie + crew = bonne idée',
    tags: ['Rainy day with friends', 'w the bro'],
    transport: 'Métro',
    places: [
      ['Le Hasard Ludique Paris bar jeux', 'Bar', 8, 60],
      ['Le Bouillon Julien Paris restaurant', 'Restaurant', 18, 60],
      ['Le Comptoir Général Paris bar', 'Bar', 10, 60],
    ],
  },
  {
    title: 'Tournée des bars à vin nat',
    tags: ['Wine bar crawl', 'soirée', 'w the bro'],
    transport: 'À pied',
    places: [
      ['Le Verre Volé Paris bar à vin restaurant', 'Bar', 15, 45],
      ['Le Barav Paris bar à vin', 'Bar', 12, 40],
      ['Septime La Cave Paris bar à vin', 'Bar', 15, 40],
      ['Vivant Cave Paris bar à vin', 'Bar', 14, 40],
    ],
  },
  {
    title: 'Padel, douche, bières',
    tags: ['Padel & chill', 'sport', 'w the bro'],
    transport: 'Métro',
    places: [
      ['All In Padel Paris padel', 'Sport', 15, 60],
      ['Café A Paris canal Saint-Martin', 'Café', 7, 25],
      ['Rosa Bonheur sur Seine Paris bar', 'Bar', 10, 60],
    ],
  },

  // ──────── SOLO ────────
  {
    title: 'Solo shopping, zéro compromis',
    tags: ['Shopping solo', 'solo vibe', 'fashion'],
    transport: 'Métro',
    places: [
      ['Le Bon Marché Paris grand magasin', 'Boutique', 40, 45],
      ['Merci Paris concept store', 'Boutique', 20, 30],
      ['Kilo Shop Paris Marais', 'Boutique', 20, 30],
    ],
  },
  {
    title: "Table pour un, s'il vous plaît",
    tags: ['Good restaurant solo', 'solo vibe', 'foodie'],
    transport: 'À pied',
    places: [
      ['Le Comptoir du Panthéon Paris restaurant', 'Restaurant', 20, 60],
      ['Café Kitsuné Paris Palais Royal', 'Café', 6, 20],
      ['Clover Grill Paris restaurant', 'Restaurant', 35, 75],
    ],
  },
  {
    title: 'Reset total en solo',
    tags: ['Places to relax', 'solo vibe'],
    transport: 'À pied',
    places: [
      ['Jardin du Palais Royal Paris', 'Parc', 0, 30],
      ['Hammam de la Mosquée de Paris', 'Spa', 25, 90],
      ['Café de la Mosquée de Paris', 'Café', 6, 30],
    ],
  },
  {
    title: 'Solo mais pas seul',
    tags: ['Meet new people', 'solo vibe'],
    transport: 'Métro',
    places: [
      ['Ground Control Paris bar communal', 'Bar', 8, 60],
      ['Pavillon Puebla Paris Buttes-Chaumont bar', 'Bar', 10, 45],
      ['Le Bouillon Chartier Paris restaurant', 'Restaurant', 14, 50],
    ],
  },
  {
    title: 'Grind solo : sport edition',
    tags: ['Sports day solo', 'solo vibe', 'sport'],
    transport: 'Métro',
    places: [
      ["Climb Up Paris escalade salle", 'Sport', 18, 90],
      ['Café Lomi Paris', 'Café', 5, 25],
      ['Piscine Joséphine Baker Paris', 'Sport', 5, 60],
    ],
  },
  {
    title: 'Journée cozy sous la pluie',
    tags: ['Rainy day solo', 'solo vibe'],
    transport: 'À pied',
    places: [
      ['Le Champo cinéma Paris Latin Quarter', 'Cinéma', 10, 120],
      ['Café de Flore Paris', 'Café', 12, 40],
      ['Shakespeare and Company Paris librairie', 'Librairie', 0, 30],
    ],
  },
  {
    title: 'Journée bien-être totale',
    tags: ['Wellness day', 'solo vibe'],
    transport: 'À pied',
    places: [
      ['Hammam de la Mosquée de Paris', 'Spa', 25, 90],
      ['Café de la Mosquée de Paris', 'Café', 6, 25],
      ['Jardin des Plantes Paris', 'Parc', 0, 30],
    ],
  },

  // ──────── MOOD ────────
  {
    title: 'Quand ça va pas, commence ici',
    tags: ['Sad-day reset'],
    transport: 'À pied',
    places: [
      ['Jardin des Plantes Paris', 'Parc', 0, 40],
      ['Café de la Mosquée de Paris', 'Café', 6, 30],
      ['Le Grand Action cinéma Paris', 'Cinéma', 10, 120],
    ],
  },
  {
    title: 'Journée dopamine max',
    tags: ['Dopamine day'],
    transport: 'Métro',
    places: [
      ['Le Bouillon Pigalle Paris restaurant', 'Restaurant', 12, 45],
      ["Atelier des Lumières Paris", 'Musée', 16, 50],
      ['Le Perchoir Paris rooftop bar', 'Bar', 14, 60],
    ],
  },
  {
    title: 'Post-breakup recovery arc',
    tags: ['Breakup recovery'],
    transport: 'Métro',
    places: [
      ['Parc des Buttes-Chaumont Paris', 'Parc', 0, 40],
      ['Le Bouillon Chartier Paris restaurant', 'Restaurant', 14, 50],
      ['Le Hasard Ludique Paris bar jeux', 'Bar', 10, 60],
    ],
  },
  {
    title: 'Rendez-vous avec toi-même',
    tags: ['Romantic solo day', 'solo vibe'],
    transport: 'À pied',
    places: [
      ['Musée de la Vie Romantique Paris', 'Musée', 0, 45],
      ['Rose Bakery Paris café', 'Café', 10, 30],
      ['Jardin du Palais Royal Paris', 'Parc', 0, 25],
      ['Mariage Frères Paris thé salon', 'Café', 12, 30],
    ],
  },
  {
    title: 'Reset complet en un jour',
    tags: ['Get your life together'],
    transport: 'À pied',
    places: [
      ['Anticafé Paris coworking', 'Café', 5, 90],
      ['Jardin du Luxembourg Paris', 'Parc', 0, 30],
      ['Season Paris restaurant healthy', 'Restaurant', 16, 45],
    ],
  },
  {
    title: 'La journée du renouveau',
    tags: ['Productive reset day'],
    transport: 'À pied',
    places: [
      ['Piscine Joséphine Baker Paris', 'Sport', 5, 60],
      ['Wild and the Moon Paris Marais', 'Café', 9, 25],
      ['KB CaféShop Paris', 'Café', 5, 90],
    ],
  },

  // ──────── OCCASION ────────
  {
    title: "Sortie dans 30 min, let's go",
    tags: ['Last-minute plan'],
    transport: 'À pied',
    places: [
      ['Café Oberkampf Paris', 'Café', 5, 20],
      ['Pink Mamma Paris restaurant italien', 'Restaurant', 18, 60],
      ['Le Mary Celeste Paris bar cocktail', 'Bar', 14, 45],
    ],
  },
  {
    title: "L'after-work qui déchire",
    tags: ['After-work plan', 'soirée'],
    transport: 'À pied',
    places: [
      ['Le Perchoir Marais Paris rooftop bar', 'Bar', 14, 60],
      ['Le Syndicat Paris bar cocktail', 'Bar', 14, 45],
      ['Ober Mamma Paris restaurant', 'Restaurant', 18, 60],
    ],
  },
  {
    title: 'Le kit survie du lendemain',
    tags: ['Hangover recovery'],
    transport: 'À pied',
    places: [
      ['Café de Flore Paris', 'Café', 10, 30],
      ['Pho 14 Paris restaurant vietnamien', 'Restaurant', 10, 40],
      ['Jardin du Luxembourg Paris', 'Parc', 0, 40],
    ],
  },
  {
    title: 'Anniversaire mémorable',
    tags: ['Birthday', 'soirée'],
    transport: 'Métro',
    places: [
      ['Pink Mamma Paris restaurant italien', 'Restaurant', 25, 75],
      ['Le Perchoir Paris rooftop bar', 'Bar', 14, 60],
      ['Wanderlust Paris bar club', 'Bar', 12, 60],
    ],
  },
  {
    title: "Paris vu d'en haut",
    tags: ['Rooftop night', 'soirée'],
    transport: 'Métro',
    places: [
      ['Le Perchoir Marais Paris rooftop', 'Bar', 14, 60],
      ['Mama Shelter Paris East rooftop bar', 'Bar', 12, 45],
      ['Le Nüba Paris club rooftop', 'Club', 10, 60],
    ],
  },

  // ──────── TRENDING ────────
  {
    title: 'Top 5 des spots les mieux notés',
    tags: ['Best-rated spots', 'foodie'],
    transport: 'Métro',
    places: [
      ['Breizh Café Paris Marais crêperie', 'Crêperie', 16, 50],
      ['Jacques Genin Paris chocolatier', 'Pâtisserie', 10, 25],
      ['Le Bouillon Chartier Paris', 'Restaurant', 14, 50],
      ['Café Kitsuné Paris Palais Royal', 'Café', 6, 20],
    ],
  },
  {
    title: "Pépites qu'Instagram connaît pas",
    tags: ['Hidden gems', 'niche'],
    transport: 'Métro',
    places: [
      ['Musée Nissim de Camondo Paris', 'Musée', 12, 60],
      ['La REcyclerie Paris café ancien gare', 'Café', 8, 40],
      ['Le Pavillon des Canaux Paris café', 'Café', 7, 40],
      ['Boot Café Paris', 'Café', 5, 20],
    ],
  },
  {
    title: 'Paris secret : 0 touriste',
    tags: ['Hidden city only', 'niche', 'outdoor'],
    transport: 'Métro',
    places: [
      ['Petite Ceinture Paris 15ème promenade', 'Lieu', 0, 30],
      ['Marché aux Puces de Vanves Paris', 'Marché', 0, 45],
      ['La Campagne à Paris 20ème', 'Lieu', 0, 20],
      ['Coulée verte René-Dumont Paris promenade plantée', 'Parc', 0, 30],
    ],
  },
  {
    title: 'Journée full à moins de 20€',
    tags: ['Under 20€ day', 'cheap date'],
    transport: 'À pied',
    places: [
      ['Parc de Belleville Paris', 'Parc', 0, 30],
      ['Le Bouillon Pigalle Paris restaurant', 'Restaurant', 12, 50],
      ['Café Lomi Paris', 'Café', 5, 20],
    ],
  },
  {
    title: 'Soirée complète sous 50€',
    tags: ['Under 50€ night', 'soirée'],
    transport: 'À pied',
    places: [
      ['Le Bouillon Julien Paris restaurant Art Nouveau', 'Restaurant', 18, 60],
      ['Le Syndicat Paris bar cocktail', 'Bar', 14, 45],
      ['La Java Paris club salle de bal', 'Club', 12, 60],
    ],
  },
  {
    title: 'Pilates, escalade & smoothie bowl',
    tags: ['Cool girl sports', 'sport'],
    transport: 'À pied',
    places: [
      ["Climb Up Paris escalade salle", 'Sport', 18, 90],
      ['Wild and the Moon Paris Marais smoothie', 'Café', 9, 30],
      ['Merci Paris concept store café', 'Boutique', 0, 20],
    ],
  },
  {
    title: '100% parisien, 0% guide',
    tags: ['Only locals know', 'niche'],
    transport: 'À pied',
    places: [
      ['Le Verre Volé Paris restaurant vin naturel', 'Restaurant', 20, 60],
      ['Chez Prune Paris café canal Saint-Martin', 'Café', 8, 30],
      ['Le Barav Paris bar à vin naturel', 'Bar', 10, 45],
    ],
  },
  {
    title: 'Les QG de la finance parisienne',
    tags: ['Meet finance bros'],
    transport: 'Voiture',
    places: [
      ['Café Marly Paris Louvre terrasse', 'Café', 15, 30],
      ['Ferdi Paris restaurant hamburger', 'Restaurant', 25, 60],
      ['Hotel Costes Paris bar', 'Bar', 22, 60],
      ['Buddha-Bar Paris restaurant bar', 'Bar', 20, 60],
    ],
  },
];

// ═══════════════════ MAIN ═══════════════════

async function findProofUser() {
  const q = query(collection(db, 'users'), where('username', '==', 'proof'));
  const snap = await getDocs(q);
  if (snap.empty) {
    // Try without dot
    const q2 = query(collection(db, 'users'), where('username', '==', 'proof.'));
    const snap2 = await getDocs(q2);
    if (snap2.empty) throw new Error('Could not find proof user. Check username in Firestore.');
    return { id: snap2.docs[0].id, ...snap2.docs[0].data() };
  }
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function main() {
  console.log('🌱 Seeding Proof plans...\n');

  // 1. Find proof user
  const proofUser = await findProofUser();
  console.log(`✓ Found proof user: ${proofUser.id} (${proofUser.displayName})\n`);

  // Ensure account is public
  if (proofUser.isPrivate !== false) {
    await updateDoc(doc(db, 'users', proofUser.id), { isPrivate: false });
    console.log('  → Set proof account to public\n');
  }

  // Build author object — strip all undefined values (Firestore rejects them)
  const authorRaw = {
    id: proofUser.id,
    username: proofUser.username || 'proof',
    displayName: proofUser.displayName || 'Proof',
    initials: proofUser.initials || 'P',
    avatarUrl: proofUser.avatarUrl || null,
    avatarBg: proofUser.avatarBg || '#FF6B35',
    avatarColor: proofUser.avatarColor || '#FFFFFF',
    badgeType: 'top_creator',
    bio: proofUser.bio || '',
    isPrivate: false,
    setupComplete: true,
    xpPoints: proofUser.xpPoints || 0,
    coins: proofUser.coins || 0,
    level: proofUser.level || 1,
    xpForNextLevel: proofUser.xpForNextLevel || 100,
    rank: 'Top Creator',
    planCount: proofUser.planCount || 0,
    followersCount: proofUser.followersCount || 0,
    followingCount: proofUser.followingCount || 0,
    likesReceived: proofUser.likesReceived || 0,
    unlockedBadges: proofUser.unlockedBadges || [],
    total_proof_validations: 300, // Top Creator rank
    isFounder: proofUser.isFounder || false,
    createdAt: proofUser.createdAt || new Date().toISOString(),
  };
  // Remove undefined fields
  const author = JSON.parse(JSON.stringify(authorRaw));

  // 2. Process each plan
  let created = 0;
  let placesFetched = 0;
  let placesFromCache = 0;
  const baseTime = Date.now();

  for (let i = 0; i < SEED_PLANS.length; i++) {
    const def = SEED_PLANS[i];
    console.log(`[${i + 1}/${SEED_PLANS.length}] ${def.title}`);

    // Resolve places via Google Places API
    const places = [];
    let totalPrice = 0;
    let totalDuration = 0;

    for (const [searchQuery, fallbackType, price, duration] of def.places) {
      const wasCached = !!placeCache[searchQuery];
      const result = await searchPlace(searchQuery);
      if (!wasCached && result) { placesFetched++; await delay(150); }
      if (wasCached && result) { placesFromCache++; }

      if (!result) {
        console.log(`  ⚠ Not found: ${searchQuery}`);
        places.push({
          id: `place-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: searchQuery.replace(/ Paris.*$/, ''),
          type: fallbackType,
          address: 'Paris, France',
          rating: 0,
          reviewCount: 0,
          ratingDistribution: [0, 0, 0, 0, 0],
          reviews: [],
          photoUrls: [],
          placePrice: price,
          placeDuration: duration,
        });
      } else {
        const place = {
          id: result.placeId,
          googlePlaceId: result.placeId,
          name: result.name,
          type: getReadableType(result.types, fallbackType),
          address: result.address,
          rating: result.rating,
          reviewCount: result.reviewCount,
          ratingDistribution: [0, 0, 0, 0, 0],
          reviews: [],
          photoUrls: result.photoUrls,
          latitude: result.latitude,
          longitude: result.longitude,
          placePrice: price,
          placeDuration: duration,
        };
        if (result.priceLevel !== undefined) place.priceLevel = result.priceLevel;
        places.push(place);
        if (!wasCached) console.log(`  ✓ ${result.name} (${result.rating}★, ${result.photoUrls.length} photos)`);
      }

      totalPrice += price;
      totalDuration += duration;
    }

    // Add ~10min travel between places
    totalDuration += (places.length - 1) * 10;

    // Spread createdAt over 2 weeks (6h apart)
    const createdAt = new Date(baseTime - i * 6 * 3600000).toISOString();
    const planId = `plan-${baseTime - i * 6 * 3600000}`;
    const gradient = GRADIENTS[i % GRADIENTS.length];

    const plan = {
      id: planId,
      authorId: author.id,
      author,
      title: def.title,
      gradient,
      tags: def.tags,
      places,
      price: `${totalPrice}€`,
      duration: formatDuration(totalDuration),
      transport: def.transport,
      travelSegments: [],
      coverPhotos: [],
      likesCount: 0,
      commentsCount: 0,
      proofCount: 0,
      declinedCount: 0,
      xpReward: 20,
      createdAt,
      timeAgo: 'maintenant',
    };

    await setDoc(doc(db, 'plans', planId), plan);
    console.log(`  → Created: ${planId} | ${plan.price} | ${plan.duration}\n`);
    created++;
  }

  // Update proof user's planCount
  await updateDoc(doc(db, 'users', proofUser.id), {
    planCount: created,
    total_proof_validations: 300,
  });

  console.log('═══════════════════════════════════════');
  console.log(`✅ Done! Created ${created} plans.`);
  console.log(`📍 ${placesFetched} Google API calls, ${placesFromCache} from cache.`);
  console.log(`👤 Updated proof user planCount to ${created}.`);
  console.log('═══════════════════════════════════════');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
