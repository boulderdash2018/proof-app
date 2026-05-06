/**
 * Per-participant progress helpers for a group plan session.
 *
 * Pure functions — no React, no store. Given the session snapshot,
 * a place list, and (optionally) a live presence, compute everything
 * the unified GroupSessionMap needs to surface :
 *   • current step (0-indexed) + total steps
 *   • status : in_transit / on_site / finished
 *   • distance + walking-min ETA to the next place
 *   • the next place's name + coords (the one the user is heading to)
 *
 * "On site" threshold = 80 m (matches the auto-arrive heuristic used
 * elsewhere in DoItNow). Beyond that we consider the user is in transit.
 */

import { haversineKm, walkingMinutes } from '../components/GroupLiveMapShared';

/** Minimal shape needed from a session participant. */
type SessionLikeParticipant = {
  userId: string;
  checkins: Record<string, unknown>;
  finishedAt?: string;
};

/** Minimal shape needed from a place. */
type PlaceLike = {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
};

/** Minimal shape from useLivePresence. */
type LivePresenceLike = {
  userId: string;
  lat: number;
  lng: number;
  ts: number;
};

export type ParticipantStatus = 'in_transit' | 'on_site' | 'finished';

export interface ParticipantProgress {
  /** 0-indexed position in placeOrder. Equals totalSteps when finished. */
  stepIdx: number;
  totalSteps: number;
  status: ParticipantStatus;
  /** Meters to the place currently being targeted. Null when finished
   *  or when we don't have a live position. */
  distanceM: number | null;
  /** Walking-minutes ETA to the next place. Null if no live position. */
  etaMin: number | null;
  /** Place currently targeted (the one the user is heading to). Null
   *  when the participant has finished the entire plan. */
  nextPlace: PlaceLike | null;
}

/** Distance threshold (m) below which we consider the user on-site. */
const ON_SITE_THRESHOLD_M = 80;

/**
 * Compute progress for a single participant.
 *
 * Algorithm :
 *   • If `finishedAt` is set OR they've checked in to every place in
 *     placeOrder → status = finished, no nextPlace.
 *   • Otherwise the "next place" is `placeOrder[checkinsCount]` (the
 *     one immediately after their last completed step).
 *   • If we have a live presence + the next place has coords, compute
 *     haversine distance. < 80 m → on_site, else in_transit.
 */
export function computeParticipantProgress(
  participant: SessionLikeParticipant,
  placeOrder: string[],
  placesById: Record<string, PlaceLike>,
  livePresence: LivePresenceLike | null,
): ParticipantProgress {
  const totalSteps = placeOrder.length;
  const checkinsCount = Object.keys(participant.checkins || {}).length;

  // Finished : explicit flag OR all steps done.
  if (participant.finishedAt || checkinsCount >= totalSteps) {
    return {
      stepIdx: totalSteps,
      totalSteps,
      status: 'finished',
      distanceM: null,
      etaMin: null,
      nextPlace: null,
    };
  }

  const stepIdx = checkinsCount;
  const nextPlaceId = placeOrder[stepIdx];
  const nextPlace = placesById[nextPlaceId] || null;

  // No live presence → we can show step but not distance/eta.
  if (!livePresence || !nextPlace?.latitude || !nextPlace?.longitude) {
    return {
      stepIdx,
      totalSteps,
      status: 'in_transit',
      distanceM: null,
      etaMin: null,
      nextPlace,
    };
  }

  const distKm = haversineKm(
    livePresence.lat,
    livePresence.lng,
    nextPlace.latitude,
    nextPlace.longitude,
  );
  const distanceM = Math.round(distKm * 1000);
  const status: ParticipantStatus = distanceM <= ON_SITE_THRESHOLD_M ? 'on_site' : 'in_transit';
  const etaMin = status === 'on_site' ? 0 : walkingMinutes(distKm);

  return {
    stepIdx,
    totalSteps,
    status,
    distanceM,
    etaMin,
    nextPlace,
  };
}

/** "à 230m du Café X" / "sur place — Café X" / "✓ a fini les 4 étapes" */
export function formatProgressLine(progress: ParticipantProgress): string {
  if (progress.status === 'finished') {
    return progress.totalSteps > 0
      ? `✓ A fini les ${progress.totalSteps} étapes`
      : '✓ A terminé';
  }
  if (!progress.nextPlace) return 'En route…';

  if (progress.status === 'on_site') {
    return `Sur place — ${progress.nextPlace.name}`;
  }

  if (progress.distanceM == null) {
    return `Étape ${progress.stepIdx + 1} — ${progress.nextPlace.name}`;
  }
  const dist = progress.distanceM < 1000
    ? `${progress.distanceM} m`
    : `${(progress.distanceM / 1000).toFixed(1).replace('.', ',')} km`;
  if (progress.etaMin != null) {
    return `À ${dist} · ${progress.etaMin} min — ${progress.nextPlace.name}`;
  }
  return `À ${dist} — ${progress.nextPlace.name}`;
}

/** "2/4" — small chip displayed next to the avatar. */
export function formatStepChip(progress: ParticipantProgress): string {
  return `${Math.min(progress.stepIdx + 1, progress.totalSteps)}/${progress.totalSteps}`;
}
