/**
 * Route optimizer — given N places with lat/lng, computes the visit order
 * that minimizes the total walking duration.
 *
 * Approach :
 *   1. Fetch a pairwise duration matrix via Google Directions API (N² calls).
 *   2. Brute-force all permutations starting from place[0] — free TSP with
 *      N ≤ 6. Each permutation is a candidate order ; we keep the one with
 *      smallest total duration.
 *
 * We cap at MAX_OPTIMIZABLE_PLACES (6) to keep the cost + latency bounded.
 * Above that cap we short-circuit and return the input order unchanged.
 */

import { getDirections } from './directionsService';
import { DoItNowTransport } from '../types';

export const MAX_OPTIMIZABLE_PLACES = 6;

interface Stop {
  id: string;
  lat: number;
  lng: number;
}

export interface OptimizeRouteResult {
  /** Ordered list of place ids — the best visit order found. */
  orderedIds: string[];
  /** Sum of travel times between consecutive stops, seconds. */
  totalDurationSeconds: number;
  /** Sum of travel distances, meters. */
  totalDistanceMeters: number;
  /** Human-readable total duration label (e.g. "1 h 42 min"). */
  totalDurationText: string;
  /** True if we skipped optimization (e.g. too many places, missing coords). */
  skipped?: boolean;
}

const formatDuration = (seconds: number): string => {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m - h * 60;
  return rem > 0 ? `${h} h ${rem} min` : `${h} h`;
};

/** All permutations of an array — brute force, fine for small N. */
const permute = <T,>(arr: T[]): T[][] => {
  if (arr.length <= 1) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    const tails = permute(rest);
    for (const t of tails) out.push([arr[i], ...t]);
  }
  return out;
};

export async function optimizeRoute(
  stops: Stop[],
  transport: DoItNowTransport = 'walking',
): Promise<OptimizeRouteResult> {
  // Not enough data → return input as-is.
  if (stops.length <= 1) {
    return {
      orderedIds: stops.map((s) => s.id),
      totalDurationSeconds: 0,
      totalDistanceMeters: 0,
      totalDurationText: '0 min',
    };
  }
  if (stops.length > MAX_OPTIMIZABLE_PLACES) {
    return {
      orderedIds: stops.map((s) => s.id),
      totalDurationSeconds: 0,
      totalDistanceMeters: 0,
      totalDurationText: '',
      skipped: true,
    };
  }

  // 1. Build pairwise duration + distance matrix via N² Directions calls.
  //    We run them concurrently ; for 6 places = 30 calls (5 per row × 6 rows — skip i===j).
  const n = stops.length;
  const durSec: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const distM: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  const tasks: Promise<void>[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const a = stops[i];
      const b = stops[j];
      tasks.push(
        getDirections(
          { lat: a.lat, lng: a.lng },
          { lat: b.lat, lng: b.lng },
          transport,
        ).then((res) => {
          if (res) {
            durSec[i][j] = res.durationSeconds;
            distM[i][j] = res.distanceMeters;
          } else {
            // Fallback : approximate with straight-line distance ÷ 1.4 m/s walking.
            const approx = haversine(a, b);
            durSec[i][j] = Math.max(60, Math.round(approx / 1.4));
            distM[i][j] = Math.round(approx);
          }
        }),
      );
    }
  }
  await Promise.all(tasks);

  // 2. Brute-force all permutations to find the shortest total duration.
  //    We FIX the starting stop at index 0 (the first proposed) to make
  //    the order deterministic from a UX standpoint ; permute the rest.
  const fixedStart = 0;
  const restIndices = Array.from({ length: n }, (_, i) => i).filter((i) => i !== fixedStart);
  const allOrders = permute(restIndices).map((tail) => [fixedStart, ...tail]);

  let best = allOrders[0];
  let bestDur = totalOf(best, durSec);
  for (const order of allOrders) {
    const d = totalOf(order, durSec);
    if (d < bestDur) {
      best = order;
      bestDur = d;
    }
  }
  const bestDist = totalOf(best, distM);

  return {
    orderedIds: best.map((i) => stops[i].id),
    totalDurationSeconds: bestDur,
    totalDistanceMeters: bestDist,
    totalDurationText: formatDuration(bestDur),
  };
}

const totalOf = (order: number[], matrix: number[][]): number => {
  let sum = 0;
  for (let k = 0; k < order.length - 1; k++) {
    sum += matrix[order[k]][order[k + 1]] || 0;
  }
  return sum;
};

/** Straight-line distance in meters between two coords (haversine). */
const haversine = (a: Stop, b: Stop): number => {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
