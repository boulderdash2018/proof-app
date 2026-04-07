const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';
const BASE_URL = 'https://places.googleapis.com/v1/places';

export interface GooglePlaceAutocomplete {
  placeId: string;
  name: string;
  address: string;
  types: string[];
}

export interface GooglePlaceDetails {
  placeId: string;
  name: string;
  address: string;
  types: string[];
  rating: number;
  reviewCount: number;
  priceLevel?: number;
  phoneNumber?: string;
  website?: string;
  openingHours?: string[];
  photoUrls: string[];
  latitude: number;
  longitude: number;
  reviews: GooglePlaceReview[];
}

export interface GooglePlaceReview {
  authorName: string;
  rating: number;
  text: string;
  relativeTime: string;
  photoUrl?: string;
}

// Map Google types to readable French labels
const TYPE_LABELS: Record<string, string> = {
  restaurant: 'Restaurant',
  cafe: 'Café',
  bar: 'Bar',
  bakery: 'Boulangerie',
  museum: 'Musée',
  art_gallery: 'Galerie',
  park: 'Parc',
  night_club: 'Club',
  movie_theater: 'Cinéma',
  clothing_store: 'Boutique',
  book_store: 'Librairie',
  shopping_mall: 'Centre commercial',
  gym: 'Salle de sport',
  spa: 'Spa',
  tourist_attraction: 'Attraction',
  church: 'Église',
  library: 'Bibliothèque',
  stadium: 'Stade',
  store: 'Boutique',
  food: 'Restaurant',
  point_of_interest: 'Lieu',
  establishment: 'Lieu',
};

function getReadableType(types: string[]): string {
  for (const t of types) {
    if (TYPE_LABELS[t]) return TYPE_LABELS[t];
  }
  return 'Lieu';
}

function getPhotoUrl(photoName: string, maxWidth: number = 400): string {
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidth}&key=${API_KEY}`;
}

// ==================== AUTOCOMPLETE ====================
export async function searchPlacesAutocomplete(
  query: string,
  locationBias?: { lat: number; lng: number },
): Promise<GooglePlaceAutocomplete[]> {
  if (!query || query.length < 2) return [];

  const body: any = {
    input: query,
    languageCode: 'fr',
    includedRegionCodes: ['fr'],
  };

  if (locationBias) {
    body.locationBias = {
      circle: {
        center: { latitude: locationBias.lat, longitude: locationBias.lng },
        radius: 15000,
      },
    };
  }

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!data.suggestions) return [];

    return data.suggestions
      .filter((s: any) => s.placePrediction)
      .map((s: any) => ({
        placeId: s.placePrediction.placeId,
        name: s.placePrediction.structuredFormat?.mainText?.text || s.placePrediction.text?.text || '',
        address: s.placePrediction.structuredFormat?.secondaryText?.text || '',
        types: s.placePrediction.types || [],
      }));
  } catch (err) {
    console.error('Places autocomplete error:', err);
    return [];
  }
}

// ==================== PLACE DETAILS ====================
export async function getPlaceDetails(placeId: string): Promise<GooglePlaceDetails | null> {
  const fields = [
    'id',
    'displayName',
    'formattedAddress',
    'types',
    'rating',
    'userRatingCount',
    'priceLevel',
    'nationalPhoneNumber',
    'websiteUri',
    'currentOpeningHours',
    'photos',
    'location',
    'reviews',
  ];

  try {
    const res = await fetch(`${BASE_URL}/${placeId}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': fields.join(','),
        'Accept-Language': 'fr',
      },
    });

    const data = await res.json();
    if (!data.displayName) return null;

    const photos = (data.photos || []).slice(0, 5).map((p: any) => getPhotoUrl(p.name, 600));

    const reviews: GooglePlaceReview[] = (data.reviews || []).slice(0, 5).map((r: any) => ({
      authorName: r.authorAttribution?.displayName || 'Anonyme',
      rating: r.rating || 0,
      text: r.text?.text || '',
      relativeTime: r.relativePublishTimeDescription || '',
      photoUrl: r.authorAttribution?.photoUri || undefined,
    }));

    return {
      placeId: data.id || placeId,
      name: data.displayName?.text || '',
      address: data.formattedAddress || '',
      types: data.types || [],
      rating: data.rating || 0,
      reviewCount: data.userRatingCount || 0,
      priceLevel: data.priceLevel ? parsePriceLevel(data.priceLevel) : undefined,
      phoneNumber: data.nationalPhoneNumber || undefined,
      website: data.websiteUri || undefined,
      openingHours: data.currentOpeningHours?.weekdayDescriptions || undefined,
      photoUrls: photos,
      latitude: data.location?.latitude || 0,
      longitude: data.location?.longitude || 0,
      reviews,
    };
  } catch (err) {
    console.error('Place details error:', err);
    return null;
  }
}

// ==================== TEXT SEARCH ====================
export async function searchPlacesNearby(
  query: string,
  locationBias?: { lat: number; lng: number },
): Promise<GooglePlaceDetails[]> {
  const body: any = {
    textQuery: query,
    languageCode: 'fr',
    maxResultCount: 10,
  };

  if (locationBias) {
    body.locationBias = {
      circle: {
        center: { latitude: locationBias.lat, longitude: locationBias.lng },
        radius: 15000,
      },
    };
  }

  const fields = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.types',
    'places.rating',
    'places.userRatingCount',
    'places.priceLevel',
    'places.photos',
    'places.location',
  ];

  try {
    const res = await fetch(`${BASE_URL}:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': fields.join(','),
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!data.places) return [];

    return data.places.map((p: any) => ({
      placeId: p.id,
      name: p.displayName?.text || '',
      address: p.formattedAddress || '',
      types: p.types || [],
      rating: p.rating || 0,
      reviewCount: p.userRatingCount || 0,
      priceLevel: p.priceLevel ? parsePriceLevel(p.priceLevel) : undefined,
      photoUrls: (p.photos || []).slice(0, 3).map((ph: any) => getPhotoUrl(ph.name, 400)),
      latitude: p.location?.latitude || 0,
      longitude: p.location?.longitude || 0,
      reviews: [],
    }));
  } catch (err) {
    console.error('Text search error:', err);
    return [];
  }
}

// ==================== HELPERS ====================
function parsePriceLevel(level: string): number {
  const map: Record<string, number> = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return map[level] ?? 2;
}

export function priceLevelToSymbol(level?: number): string {
  if (level === undefined) return '';
  return '€'.repeat(Math.max(level, 1));
}

export { getReadableType };
