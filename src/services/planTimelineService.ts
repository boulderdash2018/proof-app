/**
 * Plan timeline — étant donné une liste de lieux + une heure de départ,
 * calcule pour chaque lieu :
 *   • L'heure d'arrivée
 *   • L'heure de départ (= arrivée + durée de visite)
 *   • Le temps de trajet vers le lieu suivant
 *
 * Utilisé par la "Details view" du workspace pour donner à chaque
 * participant un planning précis ("18h00 → Tour Eiffel · 18h45 → trajet
 * 12 min · 18h57 → Panthéon…").
 *
 * Architecture :
 *   • Durées de visite — heuristique par catégorie (cohérente avec
 *     CoPlanSummaryFooter qui aggregate la même donnée).
 *   • Trajets — fetch via Google Directions (n-1 appels). Cache local
 *     mémo via une signature stable (ids ordonnés + transport).
 *
 * Volontairement pas dans coPlanStore — c'est un calcul cher (Directions
 * API), on ne veut pas le déclencher sur chaque update du brouillon. La
 * Details view appelle explicitement quand l'utilisateur l'ouvre.
 */

import { CoPlanProposedPlace, DoItNowTransport } from '../types';
import { getDirections } from './directionsService';

// ══════════════════════════════════════════════════════════════
// Heuristics — keep in sync with CoPlanSummaryFooter so the
// "Durée totale" matches between the summary footer and the
// details view. If you change one, change the other.
// ══════════════════════════════════════════════════════════════

const CATEGORY_DURATION_MIN: Record<string, number> = {
  restaurant: 75,
  cafe: 45,
  bar: 60,
  bakery: 20,
  museum: 90,
  art_gallery: 60,
  park: 40,
  night_club: 120,
  movie_theater: 120,
  clothing_store: 30,
  book_store: 25,
  shopping_mall: 60,
  gym: 60,
  spa: 90,
  tourist_attraction: 60,
  library: 60,
};

const DEFAULT_DURATION_MIN = 45;

const visitDurationMin = (p: CoPlanProposedPlace): number => {
  if (typeof p.estimatedDurationMin === 'number' && p.estimatedDurationMin > 0) {
    return p.estimatedDurationMin;
  }
  if (p.category && CATEGORY_DURATION_MIN[p.category] != null) {
    return CATEGORY_DURATION_MIN[p.category];
  }
  return DEFAULT_DURATION_MIN;
};

// ══════════════════════════════════════════════════════════════
// Public types
// ══════════════════════════════════════════════════════════════

export interface TimelineStop {
  placeId: string;
  placeName: string;
  /** ISO arrival time at this place. */
  arrivalISO: string;
  /** ISO departure time = arrival + visit duration. */
  departureISO: string;
  /** Visit duration on-site, minutes. */
  visitMinutes: number;
  /** Travel time TO this place from the previous one, seconds.
   *  null for the first stop (no predecessor) or when the Directions
   *  API failed and we fell back to "no travel time" (the user sees
   *  a dash). */
  travelFromPreviousSeconds: number | null;
  /** Human-readable travel duration (e.g. "12 min"). null when same. */
  travelFromPreviousText: string | null;
}

export interface Timeline {
  stops: TimelineStop[];
  /** Last departure time — when the plan effectively ends. */
  endISO: string;
  /** Total duration in minutes (from first arrival to last departure). */
  totalMinutes: number;
  /** Total walking/travel time in minutes (sum of segments). */
  travelMinutes: number;
  /** Total on-site time in minutes (sum of visit durations). */
  onSiteMinutes: number;
}

// ══════════════════════════════════════════════════════════════
// Compute — async because of Directions API calls
// ══════════════════════════════════════════════════════════════

/** Build a stable cache signature for a places+transport combo. */
const signatureFor = (places: CoPlanProposedPlace[], transport: DoItNowTransport): string =>
  `${transport}|${places.map((p) => p.id).join(',')}`;

const segmentCache = new Map<string, number[]>();
const SEGMENT_CACHE_MAX = 32;

const cacheGetSegments = (sig: string): number[] | null => {
  return segmentCache.get(sig) || null;
};

const cacheSetSegments = (sig: string, segs: number[]): void => {
  if (segmentCache.size >= SEGMENT_CACHE_MAX) {
    // Evict oldest insert — Map iteration is insertion-ordered.
    const firstKey = segmentCache.keys().next().value;
    if (firstKey !== undefined) segmentCache.delete(firstKey);
  }
  segmentCache.set(sig, segs);
};

// ⚠️ Dedup in-flight : si deux callers demandent computePlanTimeline avec
// la même signature en parallèle (cache miss simultané), on partage la
// même promesse. Sinon les deux callers lancent CHACUN leurs Directions
// fetches → tempête de requêtes → ERR_INSUFFICIENT_RESOURCES → freeze.
// Les promesses sont supprimées une fois résolues (succès ou échec).
const inflightSegments = new Map<string, Promise<number[]>>();

const formatTravel = (seconds: number): string => {
  const m = Math.round(seconds / 60);
  if (m < 1) return '< 1 min';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m - h * 60;
  return rem > 0 ? `${h} h ${rem} min` : `${h} h`;
};

/**
 * Compute the timeline. Awaits all Directions calls in parallel.
 *
 * Travel time fallback : if a place is missing coordinates OR Directions
 * fails for any reason, we set travelFromPrevious to null so the UI can
 * render a dash. The plan timing then "compresses" by skipping that
 * segment — better than blocking the whole timeline.
 */
export const computePlanTimeline = async (
  orderedPlaces: CoPlanProposedPlace[],
  startISO: string,
  transport: DoItNowTransport = 'walking',
): Promise<Timeline> => {
  if (orderedPlaces.length === 0) {
    return {
      stops: [],
      endISO: startISO,
      totalMinutes: 0,
      travelMinutes: 0,
      onSiteMinutes: 0,
    };
  }

  // Fetch all consecutive segments. Cache per signature so re-opening the
  // details view without changes is instantaneous.
  const sig = signatureFor(orderedPlaces, transport);
  let segments = cacheGetSegments(sig);

  if (!segments) {
    // Dedup in-flight — si une compute est déjà en cours pour cette sig,
    // on attend la SAME promesse plutôt que de lancer une 2e tempête de
    // fetches en parallèle. Critique sur web où le browser limite à ~6
    // connexions par host.
    let pending = inflightSegments.get(sig);
    if (!pending) {
      pending = (async () => {
        const segPromises: Promise<number | null>[] = [];
        for (let i = 1; i < orderedPlaces.length; i++) {
          const from = orderedPlaces[i - 1];
          const to = orderedPlaces[i];
          if (
            typeof from.latitude !== 'number' ||
            typeof from.longitude !== 'number' ||
            typeof to.latitude !== 'number' ||
            typeof to.longitude !== 'number'
          ) {
            segPromises.push(Promise.resolve(null));
            continue;
          }
          segPromises.push(
            getDirections(
              { lat: from.latitude, lng: from.longitude },
              { lat: to.latitude, lng: to.longitude },
              transport,
            )
              .then((r) => (r ? r.durationSeconds : null))
              .catch(() => null),
          );
        }
        const resolved = await Promise.all(segPromises);
        const segs = resolved.map((s) => s ?? 0);
        // Only cache if every segment resolved — partial failures shouldn't
        // poison the cache (next open might have network back).
        if (resolved.every((s) => s !== null)) {
          cacheSetSegments(sig, segs);
        }
        return segs;
      })();
      inflightSegments.set(sig, pending);
      // Cleanup quoi qu'il arrive (succès ou échec) — sinon on bloque
      // les futures computes avec la même sig.
      pending.finally(() => {
        if (inflightSegments.get(sig) === pending) {
          inflightSegments.delete(sig);
        }
      });
    }
    segments = await pending;
  }

  // Walk the timeline from startISO.
  const stops: TimelineStop[] = [];
  let cursor = new Date(startISO).getTime();
  let totalTravelSec = 0;
  let totalVisitMin = 0;

  for (let i = 0; i < orderedPlaces.length; i++) {
    const place = orderedPlaces[i];
    // For places after the first, add the travel segment from the previous
    // stop's departure to compute this stop's arrival.
    let travelSec: number | null = null;
    if (i > 0) {
      travelSec = segments![i - 1];
      cursor += travelSec * 1000;
      totalTravelSec += travelSec;
    }
    const arrivalDate = new Date(cursor);
    const visitMin = visitDurationMin(place);
    cursor += visitMin * 60_000;
    totalVisitMin += visitMin;
    const departureDate = new Date(cursor);

    stops.push({
      placeId: place.id,
      placeName: place.name,
      arrivalISO: arrivalDate.toISOString(),
      departureISO: departureDate.toISOString(),
      visitMinutes: visitMin,
      travelFromPreviousSeconds: i === 0 ? null : travelSec,
      travelFromPreviousText: i === 0 || travelSec === null || travelSec === 0
        ? null
        : formatTravel(travelSec),
    });
  }

  const endISO = stops[stops.length - 1].departureISO;
  const totalMinutes = Math.round((cursor - new Date(startISO).getTime()) / 60_000);

  return {
    stops,
    endISO,
    totalMinutes,
    travelMinutes: Math.round(totalTravelSec / 60),
    onSiteMinutes: totalVisitMin,
  };
};

/** Format a Date or ISO as a short HH:MM time (24h, fr-FR). */
export const formatTimeOfDay = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h.toString().padStart(2, '0')}h${m.toString().padStart(2, '0')}`;
};
