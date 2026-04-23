/**
 * Singleton loader for the Google Maps JavaScript API on web.
 *
 * Multiple components may want to use Google Maps simultaneously
 * (PlanMapModal.web, FriendsMapView.web…). Loading the script twice is
 * a common bug — silently breaks one of the callers. This module
 * de-duplicates: first caller triggers the script load; subsequent
 * callers wait on the same promise and resolve when the script is ready.
 *
 * Web-only — do not import from native code.
 */

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';
const GLOBAL_CALLBACK = '__proofGoogleMapsCallback';

let loaded = false;
let loading = false;
const waiters: (() => void)[] = [];

export function loadGoogleMaps(callback: () => void): void {
  if (loaded && (window as any).google?.maps) {
    callback();
    return;
  }
  waiters.push(callback);
  if (loading) return;
  loading = true;

  (window as any)[GLOBAL_CALLBACK] = () => {
    loaded = true;
    loading = false;
    while (waiters.length) {
      const cb = waiters.shift();
      try { cb && cb(); } catch (e) { console.error('[loadGoogleMaps] waiter error', e); }
    }
  };

  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&callback=${GLOBAL_CALLBACK}`;
  script.async = true;
  script.defer = true;
  script.onerror = () => {
    loading = false;
    console.error('[loadGoogleMaps] failed to load Google Maps script');
  };
  document.head.appendChild(script);
}

export function isGoogleMapsReady(): boolean {
  return loaded && !!(window as any).google?.maps;
}
