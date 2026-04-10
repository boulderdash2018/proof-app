/**
 * Seed Proof app V2 — Official plans from @proof account.
 * Covers Paris, London, Madrid with correct explorer filter tags.
 * Fetches real places from Google Places API (New).
 *
 * Run:  node scripts/seedPlansV2.js
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

const CITY_COORDS = {
  Paris:  { latitude: 48.8566,  longitude: 2.3522 },
  London: { latitude: 51.5074,  longitude: -0.1278 },
  Madrid: { latitude: 40.4168,  longitude: -3.7038 },
};

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
  stadium: 'Stade', store: 'Boutique', food: 'Restaurant', zoo: 'Zoo',
  aquarium: 'Aquarium', market: 'Marché', brewery: 'Brasserie',
  point_of_interest: 'Lieu', establishment: 'Lieu',
};

function getReadableType(types, fallback) {
  for (const t of types) { if (TYPE_LABELS[t]) return TYPE_LABELS[t]; }
  return fallback || 'Lieu';
}

// ═══════════════════ GOOGLE PLACES API ═══════════════════

const placeCache = {};

async function searchPlace(searchQuery, city = 'Paris') {
  const cacheKey = `${city}::${searchQuery}`;
  if (placeCache[cacheKey]) return placeCache[cacheKey];

  const coords = CITY_COORDS[city] || CITY_COORDS.Paris;
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
          circle: { center: coords, radius: 15000 },
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
    placeCache[cacheKey] = result;
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
// Each place: { q, type, price, dur, tip, [qn, ans] }
//   q     = Google Places search query
//   type  = fallback readable type
//   price = price in euros
//   dur   = duration in minutes
//   tip   = creator's tip (comment field)
//   qn    = optional question
//   ans   = optional answer

const SEED_PLANS = [

  // ╔═══════════════════════════════════════════════╗
  // ║              🎡  LONDON  (16 plans)           ║
  // ╚═══════════════════════════════════════════════╝

  // 1 — Date × Coffee lover
  {
    title: 'Le flat white trail',
    tags: ['Date', 'Coffee lover', 'Loved by Proofers'],
    transport: 'À pied',
    city: 'London',
    places: [
      { q: 'Monmouth Coffee Company Borough Market London', type: 'Café', price: 5, dur: 25, tip: 'Cash only. Prenez le filter du jour, pas l\'espresso.' },
      { q: 'Rosslyn Coffee London City', type: 'Café', price: 5, dur: 20, tip: 'Le meilleur flat white de la City. Minuscule mais impeccable.' },
      { q: 'Kaffeine London Fitzrovia Great Titchfield Street', type: 'Café', price: 5, dur: 25, tip: 'Le banana bread est légendaire. Arrivez avant midi.', qn: 'Quel est ton plat / drink préféré ici ?', ans: 'Le flat white et le banana bread. Impossible de faire mieux.' },
      { q: 'The Attendant Fitzrovia London café', type: 'Café', price: 6, dur: 30, tip: 'Oui, c\'est dans d\'anciennes toilettes victoriennes. Et c\'est excellent.' },
    ],
  },

  // 2 — Friends × Cool bars
  {
    title: 'East London cocktail run',
    tags: ['Friends', 'Cool bars', 'Original'],
    transport: 'À pied',
    city: 'London',
    places: [
      { q: 'Satan\'s Whiskers cocktail bar Bethnal Green London', type: 'Bar', price: 14, dur: 45, tip: 'Pas de carte. Dites ce que vous aimez, ils improvisent.', qn: 'Qu\'est-ce qui rend cet endroit unique ?', ans: 'Pas de menu. Le barman vous lit et crée votre cocktail.' },
      { q: 'Happiness Forgets Hoxton Square London bar', type: 'Bar', price: 15, dur: 45, tip: 'Le basement le plus cool de Londres. Réservez en ligne.' },
      { q: 'Callooh Callay Shoreditch London cocktail bar', type: 'Bar', price: 14, dur: 45, tip: 'Passez par l\'armoire au fond pour la salle secrète.' },
      { q: 'Nightjar Old Street London cocktail bar', type: 'Bar', price: 16, dur: 50, tip: 'Live jazz + cocktails d\'exception. Réservation indispensable.' },
    ],
  },

  // 3 — Solo × Museum
  {
    title: 'South Bank culture day',
    tags: ['Solo', 'Museum', 'City Tour'],
    transport: 'À pied',
    city: 'London',
    places: [
      { q: 'Tate Modern London Bankside', type: 'Musée', price: 0, dur: 90, tip: 'Les expos permanentes sont gratuites. Le Turbine Hall est un must.' },
      { q: 'Hayward Gallery Southbank Centre London', type: 'Galerie', price: 18, dur: 50, tip: 'Les expos ici sont toujours audacieuses. Vérifiez le programme.', qn: 'Qu\'est-ce qui rend cet endroit unique ?', ans: 'L\'architecture brutaliste et les expos qu\'on ne voit nulle part ailleurs.' },
      { q: 'BFI Southbank London cinema bar', type: 'Cinéma', price: 6, dur: 30, tip: 'Prenez un verre au bar du BFI, les affiches vintage sont incroyables.' },
      { q: 'Borough Market London food market', type: 'Marché', price: 12, dur: 40, tip: 'Padella pour les pâtes fraîches. La queue avance vite, ça vaut le coup.' },
    ],
  },

  // 4 — Family × Aquarium / Zoo
  {
    title: 'London Zoo & Primrose Hill',
    tags: ['Family', 'Aquarium / Zoo', 'Nature'],
    transport: 'Métro',
    city: 'London',
    places: [
      { q: 'ZSL London Zoo Regent\'s Park', type: 'Zoo', price: 30, dur: 120, tip: 'Arrivez à l\'ouverture, les animaux sont plus actifs le matin.', qn: 'À quel moment de la journée y aller ?', ans: 'Le matin. Les manchots sont nourris à 14h30.' },
      { q: 'Regent\'s Park London boating lake café', type: 'Parc', price: 6, dur: 30, tip: 'Les pédalos sur le lac, les enfants adorent.' },
      { q: 'Primrose Hill London viewpoint', type: 'Parc', price: 0, dur: 25, tip: 'La plus belle vue panoramique de Londres. Parfait pour un picnic.' },
    ],
  },

  // 5 — Friends × Sports de salle tendance
  {
    title: 'Bermondsey bouldering day',
    tags: ['Friends', 'Sports de salle tendance'],
    transport: 'Métro',
    city: 'London',
    places: [
      { q: 'Arch Climbing Wall Bermondsey London bouldering', type: 'Sport', price: 16, dur: 90, tip: 'Location de chaussons incluse. 15 000 m² de grimpe.' },
      { q: 'Padella Borough Market London pasta restaurant', type: 'Restaurant', price: 12, dur: 40, tip: 'La queue peut faire 30-45min. Allez-y à 11h30 pile.', qn: 'Le rapport qualité-prix en toute honnêteté ?', ans: 'Pâtes fraîches à £7. Le meilleur ratio de Londres.' },
      { q: 'Maltby Street Market London Bermondsey', type: 'Marché', price: 8, dur: 30, tip: 'Plus authentique que Borough Market. Les vrais locaux viennent ici.' },
    ],
  },

  // 6 — Co-Worker × Authentic Restaurant
  {
    title: 'Soho power lunch',
    tags: ['Co-Worker', 'Authentic Restaurant'],
    transport: 'À pied',
    city: 'London',
    places: [
      { q: 'Kaffeine London Fitzrovia café specialty coffee', type: 'Café', price: 5, dur: 25, tip: 'Commencez par le meilleur café du quartier.' },
      { q: 'Barrafina Dean Street Soho London tapas', type: 'Restaurant', price: 35, dur: 60, tip: 'Pas de réservation, comptoir uniquement. Arrivez à 11h45 pour éviter la queue.' },
      { q: 'Bar Crispin Soho London wine bar', type: 'Bar', price: 14, dur: 45, tip: 'Vin nat et small plates. L\'endroit parfait pour closer un deal sans se ruiner.', qn: 'C\'est quoi l\'ambiance en un mot ?', ans: 'Décontracté-classe.' },
    ],
  },

  // 7 — Solo × Vinyl
  {
    title: 'Vinyl dig : Soho to Brick Lane',
    tags: ['Solo', 'Vinyl', 'Niche / Hidden gems'],
    transport: 'Métro',
    city: 'London',
    places: [
      { q: 'Phonica Records Poland Street Soho London', type: 'Boutique', price: 15, dur: 30, tip: 'Le QG des DJs londoniens. Section house et techno inégalable.' },
      { q: 'Sounds of the Universe Broadwick Street Soho London', type: 'Boutique', price: 12, dur: 25, tip: 'La plus grande sélection de soul, funk et world music du UK.', qn: 'Qu\'est-ce qui rend cet endroit unique ?', ans: 'Des disques qu\'on ne trouve nulle part ailleurs. Le staff est passionné.' },
      { q: 'Sister Ray Berwick Street Soho London record shop', type: 'Boutique', price: 10, dur: 25, tip: 'Indie et alternatif depuis 1989. Les recommandations du staff sont en or.' },
      { q: 'Rough Trade East Brick Lane London record shop', type: 'Boutique', price: 15, dur: 30, tip: 'Le temple du vinyle à Londres. In-stores live réguliers.' },
    ],
  },

  // 8 — Date × Fashion
  {
    title: 'Dover Street to Shoreditch',
    tags: ['Date', 'Fashion', 'Shopping'],
    transport: 'Métro',
    city: 'London',
    places: [
      { q: 'Dover Street Market London Haymarket', type: 'Boutique', price: 0, dur: 40, tip: '6 étages de mode. Même sans acheter, c\'est une expo à ciel ouvert.' },
      { q: 'Goodhood Store Shoreditch London', type: 'Boutique', price: 0, dur: 25, tip: 'Streetwear pointu et marques émergentes. Pas du hype vide.', qn: 'C\'est quoi l\'ambiance en un mot ?', ans: 'Cool sans effort.' },
      { q: 'Present London Shoreditch boutique', type: 'Boutique', price: 0, dur: 20, tip: 'Sélection ultra-curatée. Des marques que personne ne connaît encore.' },
      { q: 'Rochelle Canteen Shoreditch London restaurant', type: 'Restaurant', price: 25, dur: 50, tip: 'Dans une ancienne école. Le lunch parfait post-shopping.' },
    ],
  },

  // 9 — Pet-Friendly × Nature
  {
    title: 'Hampstead avec ton chien',
    tags: ['Pet-Friendly', 'Nature'],
    transport: 'Métro',
    city: 'London',
    places: [
      { q: 'Hampstead Heath London park', type: 'Parc', price: 0, dur: 60, tip: 'Les chiens peuvent courir librement. Vue depuis Parliament Hill.', qn: 'Le meilleur moment pour éviter la foule ?', ans: 'En semaine avant 10h. Le week-end c\'est blindé.' },
      { q: 'Kenwood House Brew House café Hampstead London', type: 'Café', price: 8, dur: 30, tip: 'Terrasse dog-friendly avec vue sur les jardins.' },
      { q: 'The Flask Highgate London pub', type: 'Bar', price: 8, dur: 40, tip: 'Pub historique avec jardin. Chiens bienvenus partout.' },
    ],
  },

  // 10 — Friends × Cool neighbourhood
  {
    title: 'Hackney Wick creative day',
    tags: ['Friends', 'Cool neighbourhood', 'Original'],
    transport: 'Métro',
    city: 'London',
    places: [
      { q: 'Crate Brewery Hackney Wick London', type: 'Bar', price: 8, dur: 45, tip: 'Pizza et bière artisanale au bord du canal. Le spot iconique du quartier.', qn: 'Tu y vas plutôt solo ou accompagné ?', ans: 'En crew. L\'ambiance est meilleure à plusieurs.' },
      { q: 'Barge East Hackney Wick London restaurant', type: 'Restaurant', price: 20, dur: 60, tip: 'Restaurant sur une péniche hollandaise de 1920. Réservez.' },
      { q: 'Howling Hops Tank Bar Hackney Wick London brewery', type: 'Bar', price: 8, dur: 40, tip: 'Brasserie avec tank bar. La bière la plus fraîche de Londres.' },
    ],
  },

  // 11 — Solo × Récupération & wellness
  {
    title: 'London wellness reset',
    tags: ['Solo', 'Récupération & wellness'],
    transport: 'Métro',
    city: 'London',
    places: [
      { q: 'Serpentine Lido Hyde Park London outdoor swimming', type: 'Sport', price: 8, dur: 45, tip: 'Nage en plein air dans Hyde Park. Ouvert toute l\'année pour les braves.' },
      { q: 'Daylesford Organic Pimlico London café', type: 'Café', price: 16, dur: 35, tip: 'Le brunch organic parfait post-swim. Cher mais impeccable.' },
      { q: 'Kyoto Garden Holland Park London', type: 'Parc', price: 0, dur: 30, tip: 'Jardin japonais caché en plein Londres. Paons en liberté.', qn: 'Le truc que personne ne sait sur cet endroit ?', ans: 'Il y a des vrais paons. Et presque personne ne connaît ce jardin.' },
    ],
  },

  // 12 — Date × Wine lover
  {
    title: 'Natural wine crawl London',
    tags: ['Date', 'Wine lover', 'Niche / Hidden gems'],
    transport: 'Vélo',
    city: 'London',
    places: [
      { q: 'Sager + Wilde Hackney Road London wine bar', type: 'Bar', price: 12, dur: 40, tip: 'L\'OG du vin nat londonien depuis 2013. Prix doux au verre.' },
      { q: 'P. Franco Clapton London wine bar', type: 'Bar', price: 10, dur: 35, tip: '4 tabourets, vin exceptionnel, small plates mémorables.', qn: 'Le rapport qualité-prix en toute honnêteté ?', ans: 'Incroyable pour la qualité. Le menu change tous les jours.' },
      { q: 'Bright restaurant London Fields', type: 'Restaurant', price: 25, dur: 50, tip: 'Le chef change le menu quotidiennement. Cave naturelle remarquable.' },
      { q: 'Towpath Café Regent\'s Canal Haggerston London', type: 'Café', price: 6, dur: 25, tip: 'Au bord du canal. Cash only. Fermé quand il pleut.' },
    ],
  },

  // 13 — Solo × Shopping
  {
    title: 'Brick Lane to Broadway Market',
    tags: ['Solo', 'Shopping'],
    transport: 'À pied',
    city: 'London',
    places: [
      { q: 'Brick Lane Vintage Market London', type: 'Marché', price: 15, dur: 35, tip: 'Le dimanche matin. Arrivez avant 11h pour les meilleures trouvailles.' },
      { q: 'Rough Trade East Brick Lane London', type: 'Boutique', price: 10, dur: 20, tip: 'Même sans acheter de vinyle, l\'ambiance vaut le détour.' },
      { q: 'Broadway Market London Hackney', type: 'Marché', price: 10, dur: 35, tip: 'Le samedi uniquement. Street food et artisans locaux.', qn: 'C\'est mieux en été ou en hiver ?', ans: 'Été. Les stands débordent dans la rue, l\'ambiance est solaire.' },
      { q: 'London Fields Brewery taproom Hackney', type: 'Bar', price: 6, dur: 30, tip: 'Pour finir la journée. Bière locale, ambiance relax.' },
    ],
  },

  // 14 — Friends × Sports outdoor & lifestyle
  {
    title: 'Victoria Park run & brunch',
    tags: ['Friends', 'Sports outdoor & lifestyle'],
    transport: 'Vélo',
    city: 'London',
    places: [
      { q: 'Victoria Park London Hackney', type: 'Parc', price: 0, dur: 35, tip: 'Parkrun gratuit chaque samedi à 9h. Inscription en ligne 2 min.' },
      { q: 'Pavilion Café Victoria Park London', type: 'Café', price: 8, dur: 30, tip: 'Le meilleur café du parc, au bord du lac. Le carrot cake est parfait.', qn: 'Quel est ton plat / drink préféré ici ?', ans: 'Flat white + carrot cake face au lac. Le samedi matin idéal.' },
      { q: 'E5 Bakehouse London Fields bakery', type: 'Boulangerie', price: 8, dur: 25, tip: 'Pain au levain cuit sur place. Le sourdough toast est dingue.' },
    ],
  },

  // 15 — Friends × Bar to watch sports + Cool Places to watch
  {
    title: 'Premier League au pub',
    tags: ['Friends', 'Bar to watch sports', 'Cool Places to watch'],
    transport: 'Métro',
    city: 'London',
    places: [
      { q: 'The Faltering Fullback Finsbury Park London pub', type: 'Bar', price: 7, dur: 90, tip: 'LE pub pour le football. Écrans partout et jardin secret à trois niveaux.' },
      { q: 'Piebury Corner London Holloway Road pie shop', type: 'Restaurant', price: 10, dur: 30, tip: 'Meat pies faites maison. Tradition anglaise match day.' },
      { q: 'The Twelve Pins Finsbury Park London pub', type: 'Bar', price: 6, dur: 60, tip: 'Ambiance 100% locale. Loin des pubs touristiques du centre.' },
    ],
  },

  // 16 — Friends × Places for Music lovers
  {
    title: 'Jazz night Soho',
    tags: ['Friends', 'Places for Music lovers'],
    transport: 'À pied',
    city: 'London',
    places: [
      { q: 'Ronnie Scott\'s Jazz Club Soho London', type: 'Club', price: 30, dur: 90, tip: 'Réservez 2 semaines avant. Le bar au fond = sans résa mais arrivez à 18h.', qn: 'Un conseil pour ceux qui y vont ?', ans: 'Prenez les places Late Late Show (23h30), moitié prix, même artistes.' },
      { q: 'Bar Italia Frith Street Soho London café', type: 'Café', price: 5, dur: 20, tip: 'Ouvert depuis 1949. Espresso debout au comptoir.' },
      { q: 'Pizza Pilgrims Dean Street Soho London', type: 'Restaurant', price: 14, dur: 40, tip: 'La Margherita au forno à bois. Rapide, pas cher, parfait.' },
    ],
  },


  // ╔═══════════════════════════════════════════════╗
  // ║              💃  MADRID  (16 plans)           ║
  // ╚═══════════════════════════════════════════════╝

  // 17 — Date × Coffee lover
  {
    title: 'Specialty coffee à Malasaña',
    tags: ['Date', 'Coffee lover'],
    transport: 'À pied',
    city: 'Madrid',
    places: [
      { q: 'Toma Café Malasaña Madrid', type: 'Café', price: 4, dur: 25, tip: 'Le pionnier du specialty coffee madrilène depuis 2012. Ils torréfient sur place.' },
      { q: 'HanSo Café Madrid Malasaña', type: 'Café', price: 4, dur: 25, tip: 'Pour-over impeccable dans une ambiance cosy.', qn: 'Quel est ton plat / drink préféré ici ?', ans: 'Le V60 single origin. Demandez le grain du moment au barista.' },
      { q: 'Misión Café Madrid', type: 'Café', price: 5, dur: 25, tip: 'Brunch australien en plein Madrid. Les avocado toasts sont un classique.' },
      { q: 'Federal Café Malasaña Madrid', type: 'Café', price: 5, dur: 30, tip: 'Le spot des freelances. Bon wifi, bon flat white, bonne vibe.' },
    ],
  },

  // 18 — Friends × Cool bars
  {
    title: 'La tournée Malasaña',
    tags: ['Friends', 'Cool bars', 'Original'],
    transport: 'À pied',
    city: 'Madrid',
    places: [
      { q: '1862 Dry Bar Malasaña Madrid cocktail', type: 'Bar', price: 12, dur: 45, tip: 'Top 50 mondial. Le cocktail signature change chaque mois.', qn: 'Qu\'est-ce qui rend cet endroit unique ?', ans: 'Technique classique, esprit créatif. Le barman est un artiste.' },
      { q: 'Macera Taller Bar Madrid cocktail', type: 'Bar', price: 11, dur: 40, tip: 'Ils fabriquent leurs propres infusions maison. Un labo + un bar.' },
      { q: 'Sala Equis Madrid bar cine', type: 'Bar', price: 10, dur: 40, tip: 'Ancien cinéma X reconverti en bar. L\'architecture est folle.' },
      { q: 'Kikekeller Madrid bar galería Malasaña', type: 'Bar', price: 8, dur: 35, tip: 'Galerie d\'art le jour, bar le soir. Double vie assumée.' },
    ],
  },

  // 19 — Solo × Museum
  {
    title: 'Triángulo del arte',
    tags: ['Solo', 'Museum', 'City Tour'],
    transport: 'À pied',
    city: 'Madrid',
    places: [
      { q: 'Museo del Prado Madrid', type: 'Musée', price: 15, dur: 120, tip: 'Entrée gratuite les 2 dernières heures. Foncez aux Velázquez et Goya.', qn: 'Le meilleur moment pour éviter la foule ?', ans: 'En semaine après 16h. Gratuit de 18h à 20h, mais blindé.' },
      { q: 'Museo Reina Sofía Madrid', type: 'Musée', price: 12, dur: 90, tip: 'Guernica au 2e étage. Gratuit lundi-samedi après 19h et dimanche après 13h30.' },
      { q: 'CaixaForum Madrid museo', type: 'Musée', price: 6, dur: 50, tip: 'Le mur végétal extérieur est déjà une œuvre. Expos temporaires excellentes.' },
    ],
  },

  // 20 — Family × City Tour
  {
    title: 'Madrid en familia',
    tags: ['Family', 'City Tour'],
    transport: 'À pied',
    city: 'Madrid',
    places: [
      { q: 'Templo de Debod Madrid parque', type: 'Attraction', price: 0, dur: 30, tip: 'Temple égyptien offert à l\'Espagne. Les enfants adorent l\'histoire.', qn: 'À quel moment de la journée y aller ?', ans: 'Au coucher du soleil. La lumière sur le temple est magique.' },
      { q: 'Parque del Retiro Madrid barcas lago', type: 'Parc', price: 8, dur: 40, tip: 'Barques sur le lac : 6€ pour 45min. Ça vaut chaque centime.' },
      { q: 'Mercado de San Miguel Madrid', type: 'Marché', price: 15, dur: 35, tip: 'Tapas variées, chaque enfant choisit ce qu\'il veut.' },
      { q: 'Palacio Real de Madrid', type: 'Attraction', price: 0, dur: 20, tip: 'La relève de la garde mercredi et samedi à 11h. Arrivez 30min avant.' },
    ],
  },

  // 21 — Friends × Authentic Restaurant
  {
    title: 'Cava Baja tapas crawl',
    tags: ['Friends', 'Authentic Restaurant', 'Loved by Proofers'],
    transport: 'À pied',
    city: 'Madrid',
    places: [
      { q: 'Juana la Loca Madrid tapas La Latina', type: 'Restaurant', price: 15, dur: 40, tip: 'La tortilla de patatas caramélisée. Celle qui a tout changé.', qn: 'Qu\'est-ce que tu commanderais les yeux fermés ?', ans: 'La tortilla caramelizada. On en parle encore 3 jours après.' },
      { q: 'Casa Lucio Madrid restaurante La Latina', type: 'Restaurant', price: 25, dur: 50, tip: 'Les huevos rotos depuis 1974. Réservez, c\'est toujours plein.' },
      { q: 'Taberna La Concha La Latina Madrid', type: 'Bar', price: 8, dur: 30, tip: 'Le vermouth maison en terrasse. Simple et parfait.' },
      { q: 'La Barraca Madrid bar restaurante', type: 'Restaurant', price: 12, dur: 40, tip: 'Vins nat et tapas créatives. Le repaire des locaux du quartier.' },
    ],
  },

  // 22 — Co-Worker × Cool Concept
  {
    title: 'Remote work à Malasaña',
    tags: ['Co-Worker', 'Cool Concept'],
    transport: 'À pied',
    city: 'Madrid',
    places: [
      { q: 'Federal Café Madrid Malasaña coworking', type: 'Café', price: 6, dur: 90, tip: 'Le meilleur wifi du quartier. Prises partout et pas de regard noir si vous restez.' },
      { q: 'Toma Café Madrid specialty coffee', type: 'Café', price: 4, dur: 60, tip: 'Pour le deuxième café de la journée. Ambiance concentrée, musique discrète.', qn: 'Combien de temps tu resterais ici ?', ans: 'Facilement 2h. Le wifi tient bien et personne ne te presse.' },
      { q: 'La Bicicleta Café Madrid Malasaña', type: 'Café', price: 5, dur: 45, tip: 'Vous pouvez littéralement garer votre vélo à l\'intérieur. Concept unique.' },
    ],
  },

  // 23 — Solo × Vinyl
  {
    title: 'Vinyl dig Madrid',
    tags: ['Solo', 'Vinyl', 'Niche / Hidden gems'],
    transport: 'À pied',
    city: 'Madrid',
    places: [
      { q: 'Radio City Discos Malasaña Madrid vinyl records', type: 'Boutique', price: 12, dur: 30, tip: 'L\'institution du vinyle madrilène. Section flamenco unique en son genre.' },
      { q: 'Discos Revolver Madrid Malasaña record shop', type: 'Boutique', price: 10, dur: 25, tip: 'Indie, rock alternatif, post-punk. Le staff connaît chaque disque.', qn: 'Qu\'est-ce qui rend cet endroit unique ?', ans: 'La sélection est ultra-personnelle. Chaque bac raconte une histoire.' },
      { q: 'BeCool Records Madrid tienda discos', type: 'Boutique', price: 10, dur: 25, tip: 'Electro, house, techno. Bien organisé, prix corrects.' },
      { q: 'Café Comercial Madrid Gran Vía', type: 'Café', price: 5, dur: 25, tip: 'Le plus vieux café de Madrid, rouvert en 2017. Pause parfaite entre deux bacs.' },
    ],
  },

  // 24 — Date × Nature
  {
    title: 'Sunset au Retiro',
    tags: ['Date', 'Nature'],
    transport: 'À pied',
    city: 'Madrid',
    places: [
      { q: 'Real Jardín Botánico Madrid', type: 'Parc', price: 6, dur: 40, tip: 'Plus calme que le Retiro. Parfait pour un début de date tranquille.' },
      { q: 'Palacio de Cristal Retiro Madrid', type: 'Galerie', price: 0, dur: 25, tip: 'Expo gratuite dans un palais de verre au milieu du parc.', qn: 'C\'est mieux en été ou en hiver ?', ans: 'Au printemps. Les cerisiers en fleur autour du palais, c\'est irréel.' },
      { q: 'Rosaleda del Retiro Madrid roseraie', type: 'Parc', price: 0, dur: 20, tip: 'La roseraie au coucher du soleil. Un moment suspendu.' },
      { q: 'StreetXO Madrid restaurante', type: 'Restaurant', price: 20, dur: 50, tip: 'Street food asiatique version haute cuisine. Réservez pour le dîner.' },
    ],
  },

  // 25 — Pet-Friendly × Nature
  {
    title: 'Madrid Río con tu perro',
    tags: ['Pet-Friendly', 'Nature'],
    transport: 'À pied',
    city: 'Madrid',
    places: [
      { q: 'Madrid Río parque promenade', type: 'Parc', price: 0, dur: 45, tip: 'Espaces chiens tout le long de la rivière. Idéal pour une grande balade.' },
      { q: 'Matadero Madrid centro cultural', type: 'Lieu', price: 0, dur: 30, tip: 'Ancien abattoir devenu centre d\'art. Terrasse dog-friendly.', qn: 'Qu\'est-ce qui rend cet endroit unique ?', ans: 'L\'architecture industrielle reconvertie. Expos gratuites et ambiance créative.' },
      { q: 'Casa de Campo Madrid parque', type: 'Parc', price: 0, dur: 40, tip: 'Le plus grand parc de Madrid. Votre chien peut courir librement.' },
    ],
  },

  // 26 — Friends × Sports de raquette
  {
    title: 'Padel y cañas',
    tags: ['Friends', 'Sports de raquette'],
    transport: 'Métro',
    city: 'Madrid',
    places: [
      { q: 'WePadel Madrid padel club', type: 'Sport', price: 12, dur: 60, tip: 'Réservez le créneau de 18h, c\'est le sweet spot. Raquettes dispo sur place.' },
      { q: 'Sala de Despiece Ponzano Madrid restaurante', type: 'Restaurant', price: 18, dur: 45, tip: 'Post-padel parfait. Tapas créatives dans un décor de boucherie design.', qn: 'Qu\'est-ce que tu commanderais les yeux fermés ?', ans: 'Le tataki de thon et les croquetas. Pas de débat.' },
      { q: 'La Tape Madrid Ponzano wine bar', type: 'Bar', price: 10, dur: 40, tip: 'Vins et fromages espagnols sur la terrasse. Le finish parfait.' },
    ],
  },

  // 27 — Solo × Cool neighbourhood
  {
    title: 'Lavapiés underground',
    tags: ['Solo', 'Cool neighbourhood', 'Niche / Hidden gems'],
    transport: 'À pied',
    city: 'Madrid',
    places: [
      { q: 'La Casa Encendida Madrid Lavapiés centro cultural', type: 'Lieu', price: 0, dur: 40, tip: 'Centre culturel gratuit. Expos, ciné et rooftop bar secret au dernier étage.', qn: 'Le truc que personne ne sait sur cet endroit ?', ans: 'Le rooftop au 5e étage. Vue sur tout Madrid et personne n\'est au courant.' },
      { q: 'Bendita Locura Madrid Lavapiés bar vino', type: 'Bar', price: 8, dur: 35, tip: 'Vin nat et ambiance de quartier. Le patron connaît tout le monde.' },
      { q: 'Taberna El Sur Madrid Lavapiés restaurante', type: 'Restaurant', price: 10, dur: 40, tip: 'Cuisine fusion latino-espagnole. Prix imbattables pour la qualité.' },
      { q: 'Cine Doré Filmoteca Española Madrid', type: 'Cinéma', price: 3, dur: 100, tip: 'Films d\'auteur à 3€. Le bâtiment Art Nouveau est splendide.' },
    ],
  },

  // 28 — Date × Wine lover
  {
    title: 'Wine bars de Madrid',
    tags: ['Date', 'Wine lover'],
    transport: 'À pied',
    city: 'Madrid',
    places: [
      { q: 'Angelita Madrid wine bar restaurante', type: 'Bar', price: 14, dur: 40, tip: 'Cave de 500 références. Le sommelier guide sans aucune prétention.' },
      { q: 'La Venencia Madrid sherry bar Huertas', type: 'Bar', price: 5, dur: 30, tip: 'Sherry uniquement, depuis 1922. Photos interdites — c\'est la règle.', qn: 'Une anecdote ou fun fact sur ce lieu ?', ans: 'Ouvert pendant la guerre civile, repaire d\'espions. Les règles n\'ont pas changé.' },
      { q: 'Bendita Locura Lavapiés Madrid vino natural', type: 'Bar', price: 10, dur: 35, tip: 'Le vin nat le plus accessible de Madrid. Parfait pour découvrir.' },
      { q: 'TriCiclo Madrid restaurante', type: 'Restaurant', price: 22, dur: 50, tip: 'Le menu dégustation à l\'aveugle avec accord vins. Aventure gustative garantie.' },
    ],
  },

  // 29 — Friends × Les classiques urbains + Cool Places to watch
  {
    title: 'Match day au Bernabéu',
    tags: ['Friends', 'Les classiques urbains', 'Cool Places to watch', 'Bar to watch sports'],
    transport: 'Métro',
    city: 'Madrid',
    places: [
      { q: 'Santiago Bernabéu Madrid tour estadio Real Madrid', type: 'Stade', price: 25, dur: 75, tip: 'Le tour du stade vaut le coup même sans match. Le nouveau toit rétractable est fou.', qn: 'Si tu devais y emmener un touriste, pourquoi ?', ans: 'Le musée des trophées et la vue depuis les gradins. Frissons garantis.' },
      { q: 'Casa Dani Mercado de la Paz Madrid tortilla', type: 'Restaurant', price: 10, dur: 35, tip: 'La meilleure tortilla de Madrid. Pas de débat possible.' },
      { q: 'Cervecería Alemana Madrid Plaza Santa Ana', type: 'Bar', price: 8, dur: 40, tip: 'Hemingway buvait ici. Cañas et ambiance locale garantie.' },
    ],
  },

  // 30 — Solo × Fashion + Shopping
  {
    title: 'Vintage Madrid',
    tags: ['Solo', 'Fashion', 'Shopping'],
    transport: 'À pied',
    city: 'Madrid',
    places: [
      { q: 'El Rastro Madrid mercadillo mercado', type: 'Marché', price: 15, dur: 50, tip: 'Dimanche uniquement 9h-15h. Arrivez tôt pour les trouvailles.', qn: 'Le meilleur moment pour éviter la foule ?', ans: 'Avant 10h30. Après c\'est la cohue et la négo est plus dure.' },
      { q: 'Magpie Vintage Madrid tienda ropa', type: 'Boutique', price: 20, dur: 25, tip: 'Sélection ultra-curatée. Du Levi\'s 501 à l\'Hermès vintage.' },
      { q: 'Flamingos Vintage Kilo Madrid', type: 'Boutique', price: 15, dur: 25, tip: 'Fringues au kilo. Prenez votre temps pour dénicher les pépites.' },
      { q: 'Toma Café Madrid', type: 'Café', price: 4, dur: 20, tip: 'Pause café méritée entre deux trouvailles. Le batch brew est excellent.' },
    ],
  },

  // 31 — Friends × Places for Music lovers
  {
    title: 'Jazz y flamenco',
    tags: ['Friends', 'Places for Music lovers'],
    transport: 'À pied',
    city: 'Madrid',
    places: [
      { q: 'Café Central Madrid jazz club', type: 'Club', price: 15, dur: 75, tip: 'Le meilleur jazz club d\'Espagne. Sets à 21h et 23h.' },
      { q: 'Cardamomo Tablao Flamenco Madrid', type: 'Club', price: 25, dur: 60, tip: 'Flamenco authentique, pas un piège à touristes. Réservez la veille.', qn: 'Un conseil pour ceux qui y vont ?', ans: 'Prenez les places proches de la scène. Le plancher vibre sous vos pieds.' },
      { q: 'Corral de la Morería Madrid flamenco tablao', type: 'Club', price: 30, dur: 70, tip: 'Le tablao le plus ancien du monde. Le plus cher mais le plus intense.' },
    ],
  },

  // 32 — Friends × Sports sociaux & crew
  {
    title: 'Afterwork football',
    tags: ['Friends', 'Sports sociaux & crew', 'Les classiques urbains'],
    transport: 'Métro',
    city: 'Madrid',
    places: [
      { q: 'Urban Soccer Madrid fútbol sala 5', type: 'Sport', price: 8, dur: 60, tip: 'Foot en salle à 5. Réservez le terrain 2, le mieux éclairé.' },
      { q: 'Lateral Madrid restaurante terraza', type: 'Restaurant', price: 15, dur: 45, tip: 'Post-match parfait. Burgers et cañas en terrasse.' },
      { q: 'Bodega de la Ardosa Madrid bar vermú', type: 'Bar', price: 6, dur: 35, tip: 'Les meilleures cañas du quartier depuis 1892. La tortilla est légendaire.', qn: 'Le rapport qualité-prix en toute honnêteté ?', ans: 'Vermú + tapa à 4€. Le meilleur ratio de Madrid.' },
    ],
  },


  // ╔═══════════════════════════════════════════════╗
  // ║              🗼  PARIS  (12 plans)            ║
  // ╚═══════════════════════════════════════════════╝

  // 33 — Family × Aquarium / Zoo
  {
    title: 'Paris en famille : le plan parfait',
    tags: ['Family', 'Aquarium / Zoo'],
    transport: 'Métro',
    city: 'Paris',
    places: [
      { q: 'Aquarium de Paris Trocadéro', type: 'Aquarium', price: 22, dur: 60, tip: 'Les requins et les méduses fascinent à tous les coups.' },
      { q: 'Jardin d\'Acclimatation Paris Bois de Boulogne', type: 'Parc', price: 7, dur: 90, tip: 'Manèges + ferme pédagogique. Prévoyez 2h minimum.', qn: 'Tu y vas plutôt solo ou accompagné ?', ans: 'En famille. Les gamins ne veulent plus partir.' },
      { q: 'Angelina Paris rue de Rivoli salon de thé', type: 'Café', price: 10, dur: 30, tip: 'Le chocolat chaud le plus épais de Paris. Les enfants en raffolent.' },
    ],
  },

  // 34 — Pet-Friendly × Nature
  {
    title: 'Balade avec ton chien',
    tags: ['Pet-Friendly', 'Nature'],
    transport: 'À pied',
    city: 'Paris',
    places: [
      { q: 'Bois de Vincennes Paris lac Daumesnil promenade', type: 'Parc', price: 0, dur: 50, tip: 'Chiens sans laisse dans certaines zones. Le lac Daumesnil est magnifique.' },
      { q: 'Le Pavillon des Canaux Paris café canal Ourcq', type: 'Café', price: 7, dur: 30, tip: 'Terrasse dog-friendly au bord du canal. Ambiance maison.', qn: 'Qu\'est-ce qui rend cet endroit unique ?', ans: 'Chaque pièce est décorée comme chez quelqu\'un. On travaille dans la salle de bain.' },
      { q: 'Canal Saint-Martin Paris promenade', type: 'Lieu', price: 0, dur: 30, tip: 'La balade le long du canal avec les écluses. Votre chien va adorer.' },
    ],
  },

  // 35 — Friends × Bar to watch sports
  {
    title: 'Watch party au pub',
    tags: ['Friends', 'Bar to watch sports', 'Cool Places to watch'],
    transport: 'Métro',
    city: 'Paris',
    places: [
      { q: 'The Bombardier Paris pub anglais Panthéon', type: 'Bar', price: 8, dur: 90, tip: 'LE pub pour la Premier League et la Ligue des Champions à Paris.' },
      { q: 'The Frog & Rosbif Paris bar bière artisanale', type: 'Bar', price: 8, dur: 60, tip: 'Bière brassée sur place. Le fish & chips est correct.' },
      { q: 'Café Oz Grands Boulevards Paris bar', type: 'Bar', price: 7, dur: 60, tip: 'Grand écran, bonne bière, ambiance détendue.', qn: 'Le spot parfait pour quel mood ?', ans: 'Soir de finale avec les potes. L\'ambiance monte tout seul.' },
    ],
  },

  // 36 — Friends × Sports de raquette
  {
    title: 'Padel entre potes',
    tags: ['Friends', 'Sports de raquette'],
    transport: 'Métro',
    city: 'Paris',
    places: [
      { q: 'All In Padel Paris club padel intérieur', type: 'Sport', price: 15, dur: 60, tip: 'Le meilleur centre de padel de la capitale. Réservez 48h à l\'avance.' },
      { q: 'We Are Padel Paris', type: 'Sport', price: 12, dur: 60, tip: 'Plus accessible, parfait pour les débutants. Raquettes en location.' },
      { q: 'Le Perchoir Paris rooftop bar Ménilmontant', type: 'Bar', price: 14, dur: 50, tip: 'Post-padel en terrasse. La vue sur Paris est la récompense.', qn: 'C\'est mieux en été ou en hiver ?', ans: 'Été, sans hésitation. Le coucher de soleil d\'ici est le meilleur de Paris.' },
    ],
  },

  // 37 — Solo × Places for Music lovers
  {
    title: 'Jazz & vinyles parisiens',
    tags: ['Solo', 'Places for Music lovers', 'Vinyl'],
    transport: 'Métro',
    city: 'Paris',
    places: [
      { q: 'Le Duc des Lombards Paris jazz club', type: 'Club', price: 25, dur: 75, tip: 'Le temple du jazz parisien. Deux sets par soir, le 2e est souvent meilleur.', qn: 'Un conseil pour ceux qui y vont ?', ans: 'Le set de 22h est plus intime. Dîner-concert = bon deal.' },
      { q: 'New Morning Paris salle concert jazz', type: 'Club', price: 20, dur: 90, tip: 'Jazz, world, soul. La prog est toujours impeccable depuis 1981.' },
      { q: 'Café A Paris canal Saint-Martin café', type: 'Café', price: 7, dur: 25, tip: 'Ouvert tard, parfait pour débriefer le concert.' },
    ],
  },

  // 38 — Date × Cool Concept
  {
    title: 'Date au concept store',
    tags: ['Date', 'Cool Concept', 'Original'],
    transport: 'À pied',
    city: 'Paris',
    places: [
      { q: 'Merci Paris concept store boulevard Beaumarchais', type: 'Boutique', price: 0, dur: 30, tip: 'Le Used Book Café au sous-sol = date parfait. Discret, beau, intelligent.' },
      { q: 'The Broken Arm Paris Marais concept store', type: 'Boutique', price: 0, dur: 25, tip: 'Mode pointue + café au fond. Le genre d\'endroit qui impressionne sans forcer.', qn: 'Tu conseillerais pour un premier date ?', ans: 'Absolument. C\'est chic sans être intimidant.' },
      { q: 'Café Oberkampf Paris', type: 'Café', price: 5, dur: 25, tip: 'Le spot du quartier. Simple, bon, efficace.' },
      { q: 'Centre Commercial Paris concept store rue de Marseille', type: 'Boutique', price: 0, dur: 20, tip: 'Marques éthiques et streetwear parisien. Ultra-niché.' },
    ],
  },

  // 39 — Family × Shopping
  {
    title: 'Les puces du dimanche',
    tags: ['Family', 'Shopping'],
    transport: 'Métro',
    city: 'Paris',
    places: [
      { q: 'Marché aux Puces de Saint-Ouen Paris', type: 'Marché', price: 0, dur: 75, tip: 'Le plus grand marché aux puces du monde. Négociez toujours, ça fait partie du jeu.', qn: 'Un conseil pour ceux qui y vont ?', ans: 'Commencez par le Marché Vernaison pour le vintage, Dauphine pour l\'art.' },
      { q: 'Chez Louisette Paris restaurant puces Saint-Ouen', type: 'Restaurant', price: 18, dur: 45, tip: 'Chanson française live et steak-frites. L\'institution des puces.' },
      { q: 'La REcyclerie Paris café gare Ornano', type: 'Café', price: 8, dur: 30, tip: 'Ancienne gare de la Petite Ceinture. Ferme urbaine au fond du jardin.' },
    ],
  },

  // 40 — Solo × Sports de salle tendance
  {
    title: 'Cool girl morning',
    tags: ['Solo', 'Sports de salle tendance'],
    transport: 'Métro',
    city: 'Paris',
    places: [
      { q: 'Rituel Studio Paris pilates reformer', type: 'Sport', price: 30, dur: 50, tip: 'Le Pilates reformer le plus hype de Paris. Réservez 5 jours avant.' },
      { q: 'Wild and the Moon Paris Marais juice bar', type: 'Café', price: 12, dur: 25, tip: 'Jus pressé + açaí bowl post-workout. Healthy sans compromis.', qn: 'Quel est ton plat / drink préféré ici ?', ans: 'Le Green Detox juice + un açaí bowl. Combo parfait après le sport.' },
      { q: 'Merci Paris concept store café', type: 'Boutique', price: 0, dur: 20, tip: 'Le Used Book Café pour un moment slow. Parfait pour finir en douceur.' },
    ],
  },

  // 41 — Date × Cool neighbourhood
  {
    title: 'Balade à la Butte-aux-Cailles',
    tags: ['Date', 'Cool neighbourhood'],
    transport: 'Métro',
    city: 'Paris',
    places: [
      { q: 'Butte aux Cailles Paris quartier promenade', type: 'Lieu', price: 0, dur: 25, tip: 'Le street art sur chaque mur. Chaque ruelle est une galerie à ciel ouvert.' },
      { q: 'Chez Gladines Paris restaurant basque Butte aux Cailles', type: 'Restaurant', price: 14, dur: 45, tip: 'Portions géantes, prix mini. Le magret de canard est une tuerie.', qn: 'Le rapport qualité-prix en toute honnêteté ?', ans: 'Plat + dessert à 15€ et vous roulez en sortant. Imbattable.' },
      { q: 'Piscine de la Butte aux Cailles Paris', type: 'Sport', price: 5, dur: 50, tip: 'Piscine Art Déco de 1924. Bassin extérieur ouvert l\'été.' },
      { q: 'Le Temps des Cerises Paris café coopératif Butte aux Cailles', type: 'Bar', price: 6, dur: 30, tip: 'Café coopératif depuis 1976. L\'âme du quartier en un lieu.' },
    ],
  },

  // 42 — Friends × Sports outdoor & lifestyle
  {
    title: 'Outdoor sur le canal',
    tags: ['Friends', 'Sports outdoor & lifestyle'],
    transport: 'Vélo',
    city: 'Paris',
    places: [
      { q: 'Base Nautique de la Villette Paris kayak paddle', type: 'Sport', price: 10, dur: 60, tip: 'Kayak ou paddle sur le bassin. Réservez le matin, c\'est plus calme.' },
      { q: 'Canal de l\'Ourcq Paris piste cyclable promenade', type: 'Lieu', price: 0, dur: 30, tip: 'Piste cyclable plate le long du canal. Scenic et tranquille.' },
      { q: 'La REcyclerie Paris café terrasse', type: 'Café', price: 8, dur: 30, tip: 'Pause café dans l\'ancienne gare. Poules en liberté dans le jardin.', qn: 'Première chose qui t\'a marqué en arrivant ?', ans: 'Les poules. En plein Paris, dans une gare abandonnée. Surréaliste.' },
      { q: 'Parc de la Villette Paris', type: 'Parc', price: 0, dur: 25, tip: 'Finissez sur l\'herbe. Apportez des bières du canal.' },
    ],
  },

  // 43 — Solo × Niche & émergent
  {
    title: 'Le sport que personne ne fait encore',
    tags: ['Solo', 'Niche & émergent'],
    transport: 'Métro',
    city: 'Paris',
    places: [
      { q: 'We Are Padel Paris club padel indoor', type: 'Sport', price: 12, dur: 50, tip: 'Le padel explose en France. Testez maintenant avant que ce soit bondé.' },
      { q: 'Piscine Joséphine Baker Paris piscine flottante', type: 'Sport', price: 5, dur: 45, tip: 'Piscine flottante sur la Seine. Toit ouvrant en été.', qn: 'Qu\'est-ce qui rend cet endroit unique ?', ans: 'Vous nagez littéralement sur la Seine. Le toit s\'ouvre l\'été.' },
      { q: 'Café Lomi Paris Goutte d\'Or torréfacteur', type: 'Café', price: 5, dur: 20, tip: 'Le café de spécialité pour récupérer. Torréfié ici, dans la Goutte d\'Or.' },
    ],
  },

  // 44 — Friends × Tout le reste
  {
    title: 'La journée inclassable',
    tags: ['Friends', 'Tout le reste', 'Original'],
    transport: 'Métro',
    city: 'Paris',
    places: [
      { q: 'Musée de la Chasse et de la Nature Paris Marais', type: 'Musée', price: 8, dur: 45, tip: 'Le musée le plus bizarre et beau de Paris. Personne n\'y va et c\'est un tort.' },
      { q: 'Le Dernier Bar avant la Fin du Monde Paris bar geek', type: 'Bar', price: 10, dur: 50, tip: 'Bar gaming, jeux de société, cocktails thématiques. Le QG des geeks.', qn: 'Le spot parfait pour quel mood ?', ans: 'Quand tu veux déconnecter du réel. Board games + cocktails = soirée garantie.' },
      { q: 'Ground Control Paris gare tiers-lieu', type: 'Bar', price: 8, dur: 45, tip: 'Ancienne gare SNCF. Street food, concerts, marchés. Tout en un.' },
    ],
  },
];

// ═══════════════════ MAIN ═══════════════════

async function findProofUser() {
  const q1 = query(collection(db, 'users'), where('username', '==', 'proof'));
  const snap1 = await getDocs(q1);
  if (!snap1.empty) return { id: snap1.docs[0].id, ...snap1.docs[0].data() };

  const q2 = query(collection(db, 'users'), where('username', '==', 'proof.'));
  const snap2 = await getDocs(q2);
  if (!snap2.empty) return { id: snap2.docs[0].id, ...snap2.docs[0].data() };

  throw new Error('Could not find proof user. Check username in Firestore.');
}

async function main() {
  console.log('🌱 Seeding Proof plans V2 — Paris · London · Madrid\n');

  // 1. Find proof user
  const proofUser = await findProofUser();
  console.log(`✓ Found proof user: ${proofUser.id} (${proofUser.displayName})\n`);

  // Ensure account is public
  if (proofUser.isPrivate !== false) {
    await updateDoc(doc(db, 'users', proofUser.id), { isPrivate: false });
    console.log('  → Set proof account to public\n');
  }

  // Build author object — strip undefined (Firestore rejects them)
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
    total_proof_validations: 300,
    isFounder: proofUser.isFounder || false,
    createdAt: proofUser.createdAt || new Date().toISOString(),
  };
  const author = JSON.parse(JSON.stringify(authorRaw));

  // 2. Process each plan
  let created = 0;
  let placesFetched = 0;
  let placesFromCache = 0;
  const baseTime = Date.now();
  const cityCounts = { Paris: 0, London: 0, Madrid: 0 };

  for (let i = 0; i < SEED_PLANS.length; i++) {
    const def = SEED_PLANS[i];
    const city = def.city || 'Paris';
    console.log(`[${i + 1}/${SEED_PLANS.length}] ${def.city ? `${def.city} ·` : ''} ${def.title}`);

    // Resolve places via Google Places API
    const places = [];
    let totalPrice = 0;
    let totalDuration = 0;

    for (const p of def.places) {
      const wasCached = !!placeCache[`${city}::${p.q}`];
      const result = await searchPlace(p.q, city);
      if (!wasCached && result) { placesFetched++; await delay(150); }
      if (wasCached && result) { placesFromCache++; }

      const placeObj = {
        id: result ? result.placeId : `place-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: result ? result.name : p.q.replace(/ (Paris|London|Madrid).*$/i, ''),
        type: result ? getReadableType(result.types, p.type) : p.type,
        address: result ? result.address : `${city}`,
        rating: result ? result.rating : 0,
        reviewCount: result ? result.reviewCount : 0,
        ratingDistribution: [0, 0, 0, 0, 0],
        reviews: [],
        photoUrls: result ? result.photoUrls : [],
        placePrice: p.price,
        placeDuration: p.dur,
      };

      // Optional enrichments
      if (result?.latitude) placeObj.latitude = result.latitude;
      if (result?.longitude) placeObj.longitude = result.longitude;
      if (result?.placeId) placeObj.googlePlaceId = result.placeId;
      if (result?.priceLevel !== undefined) placeObj.priceLevel = result.priceLevel;
      if (p.tip) placeObj.comment = p.tip;
      if (p.qn) placeObj.question = p.qn;
      if (p.ans) placeObj.questionAnswer = p.ans;

      places.push(placeObj);

      if (!wasCached && result) {
        console.log(`  ✓ ${result.name} (${result.rating}★, ${result.photoUrls.length} photos)`);
      }

      totalPrice += p.price;
      totalDuration += p.dur;
    }

    // Travel time between places
    totalDuration += (places.length - 1) * 10;

    // Spread createdAt over 3 weeks (4h apart)
    const createdAt = new Date(baseTime - i * 4 * 3600000).toISOString();
    const planId = `plan-v2-${baseTime - i * 4 * 3600000}`;
    const gradient = GRADIENTS[i % GRADIENTS.length];

    // Use first place's photos as cover
    const coverPhotos = places[0]?.photoUrls?.slice(0, 3) || [];

    const plan = {
      id: planId,
      authorId: author.id,
      author,
      title: def.title,
      gradient,
      tags: def.tags,
      places,
      price: `~${totalPrice}€`,
      duration: formatDuration(totalDuration),
      transport: def.transport,
      city,
      travelSegments: [],
      coverPhotos,
      likesCount: 0,
      commentsCount: 0,
      proofCount: 0,
      declinedCount: 0,
      xpReward: 20,
      createdAt,
      timeAgo: 'maintenant',
    };

    await setDoc(doc(db, 'plans', planId), plan);
    cityCounts[city] = (cityCounts[city] || 0) + 1;
    console.log(`  → Created: ${planId} | ${plan.price} | ${plan.duration}\n`);
    created++;
  }

  // Increment proof user's planCount
  const newPlanCount = (proofUser.planCount || 0) + created;
  await updateDoc(doc(db, 'users', proofUser.id), {
    planCount: newPlanCount,
    total_proof_validations: 300,
  });

  console.log('═══════════════════════════════════════');
  console.log(`✅ Done! Created ${created} plans.`);
  console.log(`   🗼 Paris: ${cityCounts.Paris} | 🎡 London: ${cityCounts.London} | 💃 Madrid: ${cityCounts.Madrid}`);
  console.log(`📍 ${placesFetched} Google API calls, ${placesFromCache} from cache.`);
  console.log(`👤 Updated proof user planCount to ${newPlanCount}.`);
  console.log('═══════════════════════════════════════');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
