import { Platform } from 'react-native';
import { DoItNowTransport } from '../types';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';

// On web, call through the Vercel `/api/directions` proxy to dodge CORS
// (Google's Directions API doesn't set an Access-Control-Allow-Origin header).
// On native, call directly for lowest latency.
const isWeb = Platform.OS === 'web';
const isDev = __DEV__ || process.env.NODE_ENV === 'development';
const API_BASE_URL = isDev ? 'https://proof-app-black.vercel.app' : '';

export interface RouteStep {
  startLocation: { lat: number; lng: number };
  endLocation: { lat: number; lng: number };
  polyline: string; // encoded polyline
  distance: string;
  duration: string;
  instruction: string;
}

export interface RouteResult {
  distanceText: string;
  durationText: string;
  distanceMeters: number;
  durationSeconds: number;
  overviewPolyline: string;
  steps: RouteStep[];
}

// Decode Google encoded polyline to array of coordinates
export function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

export async function getDirections(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: DoItNowTransport = 'walking'
): Promise<RouteResult | null> {
  // Timeout dur 6s — sans ça un fetch peut hang indéfiniment et bloquer
  // tout pool de connexions du browser quand plusieurs segments sont
  // calculés en parallèle (cf. ERR_INSUFFICIENT_RESOURCES en cascade).
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);
  try {
    const originParam = `${origin.lat},${origin.lng}`;
    const destParam = `${destination.lat},${destination.lng}`;
    const url = isWeb
      ? `${API_BASE_URL}/api/directions?origin=${originParam}&destination=${destParam}&mode=${mode}`
      : `https://maps.googleapis.com/maps/api/directions/json?origin=${originParam}&destination=${destParam}&mode=${mode}&key=${API_KEY}`;

    const res = await fetch(url, { signal: controller.signal });
    const data = await res.json();

    if (data.status !== 'OK' || !data.routes?.length) {
      console.warn('[directions] No route found:', data.status);
      return null;
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    return {
      distanceText: leg.distance.text,
      durationText: leg.duration.text,
      distanceMeters: leg.distance.value,
      durationSeconds: leg.duration.value,
      overviewPolyline: route.overview_polyline.points,
      steps: leg.steps.map((s: any) => ({
        startLocation: { lat: s.start_location.lat, lng: s.start_location.lng },
        endLocation: { lat: s.end_location.lat, lng: s.end_location.lng },
        polyline: s.polyline.points,
        distance: s.distance.text,
        duration: s.duration.text,
        instruction: s.html_instructions?.replace(/<[^>]+>/g, '') || '',
      })),
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.warn('[directions] timeout 6s for', `${origin.lat},${origin.lng} → ${destination.lat},${destination.lng}`);
    } else {
      console.error('[directions] Error:', err);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
