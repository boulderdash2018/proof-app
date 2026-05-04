import { Platform } from 'react-native';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';
const BASE_URL = 'https://places.googleapis.com/v1/places';

// On web, use Vercel API routes to avoid CORS; on native, call Google directly
const isWeb = Platform.OS === 'web';

// In local dev, relative /api/... routes aren't served by `expo start`, so point
// to the deployed Vercel instance. In production, keep relative paths.
const isDev = __DEV__ || process.env.NODE_ENV === 'development';
const API_BASE_URL = isDev ? 'https://proof-app-black.vercel.app' : '';

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
  if (isWeb) {
    return `${API_BASE_URL}/api/places-photo?photoName=${encodeURIComponent(photoName)}&maxWidth=${maxWidth}`;
  }
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidth}&key=${API_KEY}`;
}

// ==================== AUTOCOMPLETE ====================
export async function searchPlacesAutocomplete(
  query: string,
  locationBias?: { lat: number; lng: number },
  countryCode?: string,
): Promise<GooglePlaceAutocomplete[]> {
  if (!query || query.length < 2) return [];

  const body: any = {
    input: query,
    languageCode: 'fr',
    includedRegionCodes: [countryCode || 'fr'],
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
    const url = isWeb ? `${API_BASE_URL}/api/places-autocomplete` : 'https://places.googleapis.com/v1/places:autocomplete';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!isWeb) headers['X-Goog-Api-Key'] = API_KEY;

    const res = await fetch(url, {
      method: 'POST',
      headers,
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

  // ⚠️ Timeout dur 7s : sans ça un fetch peut hang indéfiniment (Vercel route
  // qui ne répond plus, connexion stale, Google API lente). Si ça arrive
  // pendant lockDraft (CoPlan), le Promise.all bloque tout et l'app freeze
  // sans message d'erreur. AbortController lève une AbortError attrapée par
  // le catch en bas → retourne null → fallback sur les snapshots locaux.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  try {
    const url = isWeb
      ? `${API_BASE_URL}/api/places-details?placeId=${encodeURIComponent(placeId)}&fields=${encodeURIComponent(fields.join(','))}`
      : `${BASE_URL}/${placeId}`;
    const headers: Record<string, string> = isWeb
      ? {}
      : { 'X-Goog-Api-Key': API_KEY, 'X-Goog-FieldMask': fields.join(','), 'Accept-Language': 'fr' };

    const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });

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
  } catch (err: any) {
    // AbortError = timeout 7s atteint, fallback silencieux. Tout autre
    // err est loggé mais on retourne null → caller doit fallback.
    if (err?.name === 'AbortError') {
      console.warn('[getPlaceDetails] timeout 7s for placeId:', placeId);
    } else {
      console.error('Place details error:', err);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ==================== PLACE OPEN STATUS ====================
export interface PlaceOpenStatus {
  placeId: string;
  name: string;
  isOpen: boolean | null;         // null = unknown
  isPermanentlyClosed: boolean;
  nextOpenTime?: string;          // e.g. "09:00"
}

export async function checkPlaceOpenStatus(placeId: string, placeName: string): Promise<PlaceOpenStatus> {
  const fallback: PlaceOpenStatus = { placeId, name: placeName, isOpen: null, isPermanentlyClosed: false };
  const fields = ['id', 'businessStatus', 'currentOpeningHours', 'regularOpeningHours'];

  try {
    const url = isWeb
      ? `${API_BASE_URL}/api/places-details?placeId=${encodeURIComponent(placeId)}&fields=${encodeURIComponent(fields.join(','))}`
      : `${BASE_URL}/${placeId}`;
    const headers: Record<string, string> = isWeb
      ? {}
      : { 'X-Goog-Api-Key': API_KEY, 'X-Goog-FieldMask': fields.join(',') };

    const res = await fetch(url, { method: 'GET', headers });
    const data = await res.json();

    const isPermanentlyClosed =
      data.businessStatus === 'CLOSED_PERMANENTLY' ||
      data.businessStatus === 'CLOSED_TEMPORARILY';

    if (isPermanentlyClosed) {
      return { placeId, name: placeName, isOpen: false, isPermanentlyClosed: true };
    }

    const hours = data.currentOpeningHours || data.regularOpeningHours;
    const isOpen = hours?.openNow ?? null;

    // Try to find next opening time from periods
    let nextOpenTime: string | undefined;
    if (isOpen === false && hours?.periods) {
      const now = new Date();
      const currentDay = now.getDay(); // 0=Sun
      const currentMins = now.getHours() * 60 + now.getMinutes();

      for (const period of hours.periods) {
        if (!period.open) continue;
        const openDay = period.open.day;
        const openHour = period.open.hour ?? 0;
        const openMin = period.open.minute ?? 0;
        const openMins = openHour * 60 + openMin;

        // Same day, later time
        if (openDay === currentDay && openMins > currentMins) {
          nextOpenTime = `${String(openHour).padStart(2, '0')}:${String(openMin).padStart(2, '0')}`;
          break;
        }
        // Next day
        if (openDay === (currentDay + 1) % 7) {
          nextOpenTime = `${String(openHour).padStart(2, '0')}:${String(openMin).padStart(2, '0')}`;
          break;
        }
      }
    }

    return { placeId, name: placeName, isOpen, isPermanentlyClosed: false, nextOpenTime };
  } catch (err) {
    console.error('[checkPlaceOpenStatus] error:', err);
    return fallback;
  }
}

/**
 * Result of checking if a place would be open at a SPECIFIC future
 * date+time. Same shape as `PlaceOpenStatus` minus `nextOpenTime`
 * (we don't compute a "next open" for a future check — the caller
 * already chose a date and we just answer yes/no/unknown).
 */
export interface PlaceOpenAtDateStatus {
  placeId: string;
  name: string;
  /** true = open at the target date, false = closed, null = unknown
   *  (no opening hours data for this place — we don't block on null). */
  isOpen: boolean | null;
  /** Place is permanently closed regardless of date — always treated
   *  as a hard block. */
  isPermanentlyClosed: boolean;
}

/**
 * Check whether a place is OPEN at a specific future date+time.
 *
 * Used by the co-plan flows to block scheduling a meetup on a date
 * where any place would be closed (different from `checkPlaceOpenStatus`
 * which only checks "right now"). Reads `regularOpeningHours.periods`
 * from Google Places and walks the periods to see if the target day-
 * of-week + minute-of-day falls inside any open window.
 *
 * Returns `isOpen: null` when the place has no opening hours data —
 * the caller should treat null as "unknown, don't block" (Google
 * sometimes lacks data for certain place types like parks, viewpoints,
 * etc., and we don't want to block on that).
 */
export async function checkPlaceOpenAtDate(
  placeId: string,
  placeName: string,
  targetDate: Date,
): Promise<PlaceOpenAtDateStatus> {
  const fallback: PlaceOpenAtDateStatus = {
    placeId, name: placeName, isOpen: null, isPermanentlyClosed: false,
  };
  const fields = ['id', 'businessStatus', 'regularOpeningHours', 'currentOpeningHours'];

  try {
    const url = isWeb
      ? `${API_BASE_URL}/api/places-details?placeId=${encodeURIComponent(placeId)}&fields=${encodeURIComponent(fields.join(','))}`
      : `${BASE_URL}/${placeId}`;
    const headers: Record<string, string> = isWeb
      ? {}
      : { 'X-Goog-Api-Key': API_KEY, 'X-Goog-FieldMask': fields.join(',') };

    // Same 7s timeout pattern as getPlaceDetails — without it a stale
    // fetch could hang the whole "set the date" flow.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);
    let data: any;
    try {
      const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
      data = await res.json();
    } finally {
      clearTimeout(timeoutId);
    }

    if (
      data.businessStatus === 'CLOSED_PERMANENTLY' ||
      data.businessStatus === 'CLOSED_TEMPORARILY'
    ) {
      return { placeId, name: placeName, isOpen: false, isPermanentlyClosed: true };
    }

    // Prefer regularOpeningHours for a future-date check (currentOpeningHours
    // may include holiday-specific overrides but is centered on "now").
    const hours = data.regularOpeningHours || data.currentOpeningHours;
    const periods: any[] | undefined = hours?.periods;
    if (!Array.isArray(periods) || periods.length === 0) {
      // No structured periods → unknown. Don't block.
      return fallback;
    }

    // Special case : a place that's open 24/7 typically returns a single
    // period with `{ open: { day: 0, hour: 0, minute: 0 } }` and NO close.
    // Treat as always open.
    const isAlways24_7 = periods.length === 1 && !periods[0].close
      && periods[0].open?.day === 0
      && (periods[0].open?.hour ?? 0) === 0
      && (periods[0].open?.minute ?? 0) === 0;
    if (isAlways24_7) {
      return { placeId, name: placeName, isOpen: true, isPermanentlyClosed: false };
    }

    const targetDay = targetDate.getDay(); // 0 = Sunday
    const targetMins = targetDate.getHours() * 60 + targetDate.getMinutes();

    // Walk each period and check if the target falls inside.
    // A period can SPAN MIDNIGHT (e.g. open Friday 22:00, close Saturday
    // 02:00) — handle by treating close.day !== open.day as a wrap.
    for (const period of periods) {
      if (!period.open) continue;
      const openDay = period.open.day ?? 0;
      const openMins = (period.open.hour ?? 0) * 60 + (period.open.minute ?? 0);
      // If `close` is missing AND open.day = 0/hour = 0 we covered it
      // above. Otherwise treat missing close as "open until end of day".
      const closeDay = period.close?.day ?? openDay;
      const closeMins = period.close
        ? (period.close.hour ?? 0) * 60 + (period.close.minute ?? 0)
        : 24 * 60;

      // Build absolute "minutes since Sunday 00:00" for comparison,
      // wrapping the close around the week if it precedes the open.
      const openAbs = openDay * 24 * 60 + openMins;
      let closeAbs = closeDay * 24 * 60 + closeMins;
      if (closeAbs <= openAbs) closeAbs += 7 * 24 * 60; // crosses week boundary

      const targetAbs = targetDay * 24 * 60 + targetMins;
      // Also try the target shifted by +7 days for ranges that started
      // last week and continue into "this week" relative to the period.
      const targetAbsNextWeek = targetAbs + 7 * 24 * 60;

      const inRange = (t: number) => t >= openAbs && t < closeAbs;
      if (inRange(targetAbs) || inRange(targetAbsNextWeek)) {
        return { placeId, name: placeName, isOpen: true, isPermanentlyClosed: false };
      }
    }

    // No matching period → closed at that date+time.
    return { placeId, name: placeName, isOpen: false, isPermanentlyClosed: false };
  } catch (err) {
    console.warn('[checkPlaceOpenAtDate] error:', err);
    return fallback;
  }
}

/**
 * Batch version : check multiple places in parallel and return ONLY
 * the ones that would be closed at the target date. `unknown` (isOpen
 * = null) is NOT considered closed — we don't block on missing data.
 *
 * Used by every co-plan date-setter to enforce the rule "you can't
 * propose a date where a place is closed".
 */
export async function checkPlacesClosedAtDate(
  places: Array<{ googlePlaceId: string; name: string }>,
  targetDate: Date,
): Promise<PlaceOpenAtDateStatus[]> {
  if (places.length === 0) return [];
  const results = await Promise.all(
    places.map((p) => checkPlaceOpenAtDate(p.googlePlaceId, p.name, targetDate)),
  );
  return results.filter((r) => r.isPermanentlyClosed || r.isOpen === false);
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
    const url = isWeb ? `${API_BASE_URL}/api/places-search` : `${BASE_URL}:searchText`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!isWeb) {
      headers['X-Goog-Api-Key'] = API_KEY;
      headers['X-Goog-FieldMask'] = fields.join(',');
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
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

// ==================== ROUTES / TRAVEL TIME ====================
const TRANSPORT_TO_TRAVEL_MODE: Record<string, string> = {
  'Métro': 'TRANSIT',
  'Vélo': 'BICYCLE',
  'À pied': 'WALK',
  'Voiture': 'DRIVE',
  'Trottinette': 'BICYCLE', // closest match
};

export async function computeTravelDuration(
  originPlaceId: string,
  destinationPlaceId: string,
  transportMode: string,
): Promise<number | null> {
  const travelMode = TRANSPORT_TO_TRAVEL_MODE[transportMode] || 'WALK';

  try {
    if (isWeb) {
      const res = await fetch(`${API_BASE_URL}/api/routes-duration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originPlaceId, destinationPlaceId, travelMode }),
      });
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        const seconds = parseInt(data.routes[0].duration.replace('s', ''), 10);
        return Math.round(seconds / 60);
      }
      return null;
    } else {
      const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': API_KEY,
          'X-Goog-FieldMask': 'routes.duration',
        },
        body: JSON.stringify({
          origin: { placeId: originPlaceId },
          destination: { placeId: destinationPlaceId },
          travelMode,
          languageCode: 'fr',
        }),
      });
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        const seconds = parseInt(data.routes[0].duration.replace('s', ''), 10);
        return Math.round(seconds / 60);
      }
      return null;
    }
  } catch (err) {
    console.error('Routes API error:', err);
    return null;
  }
}

export { getReadableType };
