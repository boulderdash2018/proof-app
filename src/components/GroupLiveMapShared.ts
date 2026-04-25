/**
 * Shared geo + format helpers used by both GroupLiveMapSheet variants
 * (native + web). Pure functions, no React, no platform code.
 */

/** Haversine distance between two coords, in km. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // earth radius km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Coarse walking-time estimate (5 km/h). For ETA only — fine for UI. */
export function walkingMinutes(distKm: number): number {
  const minutes = (distKm / 5) * 60;
  return Math.max(1, Math.round(minutes));
}

/** Compact distance label : "850 m" under 1km, "1,2 km" otherwise. */
export function formatDistanceShort(distKm: number): string {
  if (distKm < 1) {
    const m = Math.round(distKm * 1000);
    return `${m} m`;
  }
  return `${distKm.toFixed(1).replace('.', ',')} km`;
}

/** "à l'instant" / "il y a 2 min" / "il y a 8 min" — used to grey-out
 *  stale presences on the map. */
export function formatRelativePresence(ts: number): string {
  const diffMs = Date.now() - ts;
  if (diffMs < 30_000) return 'à l\'instant';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'il y a moins d\'une min';
  if (minutes < 60) return `il y a ${minutes} min`;
  return 'il y a longtemps';
}
