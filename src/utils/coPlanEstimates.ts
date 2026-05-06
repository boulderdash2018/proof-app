/**
 * Shared estimate heuristics for CoPlan proposed places.
 *
 * Centralises the duration + budget logic used by BOTH the per-row UI
 * (CoPlanPlacesSection) and the aggregate footer (CoPlanSummaryFooter).
 * Before this file the two surfaces had divergent defaults — the row
 * showed "1h sur place" while the footer summed 75min for a restaurant
 * (category-based heuristic) → user sees 1h × 2 places = 2h on rows but
 * 2h30 in footer. Now both call the same helpers.
 *
 * Both helpers are pure : no React, no store access. Pass the place(s)
 * in. That keeps them testable and trivially memoizable.
 */

/** Type-relaxed input — only needs the two fields we read. */
type EstimateInput = {
  estimatedDurationMin?: number;
  priceLevel?: number;
  category?: string;
};

// ══════════════════════════════════════════════════════════════
// Duration
// ══════════════════════════════════════════════════════════════

/**
 * Per-category minutes-on-site fallback when a place has no explicit
 * `estimatedDurationMin`. Values reflect a typical Parisian short visit.
 * Add categories sparingly — the goal is not exhaustive coverage but
 * catching the obvious ones (restaurant, café, museum, etc).
 */
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

/** Final fallback when neither override nor category heuristic apply.
 *  60min was chosen to align with the row UI's "1h sur place" default
 *  (avoids the 45 vs 60 discrepancy that bugged users). */
const DEFAULT_DURATION_MIN = 60;

/**
 * Resolve a single place's duration in minutes. Priority :
 *   1. Explicit override (`estimatedDurationMin > 0`) — set by a user
 *      via the duration picker.
 *   2. Category heuristic from `CATEGORY_DURATION_MIN`.
 *   3. `DEFAULT_DURATION_MIN` (60min).
 */
export function estimatePlaceDurationMin(place: EstimateInput): number {
  const explicit = place.estimatedDurationMin;
  if (typeof explicit === 'number' && explicit > 0) return explicit;
  if (place.category && CATEGORY_DURATION_MIN[place.category] != null) {
    return CATEGORY_DURATION_MIN[place.category];
  }
  return DEFAULT_DURATION_MIN;
}

// ══════════════════════════════════════════════════════════════
// Budget
// ══════════════════════════════════════════════════════════════

/** Google priceLevel (1-4) → euro range per person per place. */
const PRICE_LEVEL_RANGE: Array<[number, number]> = [
  [0, 0],     // level 0 — free / unknown → skip
  [10, 20],   // level 1 — $
  [25, 45],   // level 2 — $$
  [50, 85],   // level 3 — $$$
  [100, 180], // level 4 — $$$$
];

/**
 * Per-category budget fallback (Paris ballpark) when Google has no
 * `priceLevel`. Many places (especially small spots, parks, libraries)
 * lack priceLevel → without this fallback the footer used to show 0€
 * even with 4 places picked. Now we always show a useful estimate.
 */
const CATEGORY_BUDGET_FALLBACK: Record<string, [number, number]> = {
  restaurant: [20, 35],
  cafe: [5, 10],
  bar: [12, 22],
  bakery: [3, 8],
  museum: [10, 18],
  art_gallery: [0, 12],
  park: [0, 0],
  night_club: [15, 30],
  movie_theater: [10, 14],
  clothing_store: [25, 75],
  book_store: [10, 25],
  shopping_mall: [20, 60],
  gym: [10, 20],
  spa: [50, 110],
  tourist_attraction: [10, 20],
  library: [0, 0],
};

/** Last-resort range when neither priceLevel nor category match.
 *  Conservative ballpark — better than displaying "0€" which is
 *  misleading. */
const DEFAULT_BUDGET_RANGE: [number, number] = [10, 20];

/**
 * Resolve a single place's budget range (min, max) in euros per person.
 * Priority :
 *   1. `priceLevel` from Google Places (1-4).
 *   2. Category fallback from `CATEGORY_BUDGET_FALLBACK`.
 *   3. `DEFAULT_BUDGET_RANGE` ([10, 20]).
 *
 * Returns [0, 0] only when category explicitly maps to free (park,
 * library) — those legitimately cost nothing.
 */
export function estimatePlaceBudgetRange(place: EstimateInput): [number, number] {
  const lvl = place.priceLevel;
  if (typeof lvl === 'number' && lvl >= 1 && lvl <= 4) {
    return PRICE_LEVEL_RANGE[lvl];
  }
  if (place.category && CATEGORY_BUDGET_FALLBACK[place.category] != null) {
    return CATEGORY_BUDGET_FALLBACK[place.category];
  }
  return DEFAULT_BUDGET_RANGE;
}

// ══════════════════════════════════════════════════════════════
// Aggregations
// ══════════════════════════════════════════════════════════════

/** Sum durations + budget ranges across a list of places. */
export function computeCoPlanEstimates(places: EstimateInput[]): {
  durationMin: number;
  budgetMin: number;
  budgetMax: number;
} {
  let durationMin = 0;
  let budgetMin = 0;
  let budgetMax = 0;
  places.forEach((p) => {
    durationMin += estimatePlaceDurationMin(p);
    const [bMin, bMax] = estimatePlaceBudgetRange(p);
    budgetMin += bMin;
    budgetMax += bMax;
  });
  return { durationMin, budgetMin, budgetMax };
}

// ══════════════════════════════════════════════════════════════
// Formatters
// ══════════════════════════════════════════════════════════════

/** Format minutes as "45 min", "1h", "2h30". */
export function formatDurationMinutes(min: number): string {
  if (min <= 0) return '—';
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const rem = Math.round(min - h * 60);
  return rem > 0 ? `${h}h${rem.toString().padStart(2, '0')}` : `${h}h`;
}

/** Format the per-place duration chip on a CoPlan row.
 *
 *  Retourne `null` quand la durée n'a PAS été explicitement posée par
 *  un participant (= c'est une estimation) — la chip n'affichera pas
 *  de chiffre, juste le crayon + un CTA "Définir la durée".
 *  Cette décision UX vient du fait que toute valeur affichée sur la
 *  row était lue par le user comme contractuelle, et créait un
 *  mismatch perçu avec le total estimé du footer (qui agrège selon
 *  la même heuristique mais peut différer si une catégorie tombe
 *  sur 45min vs 60min default). En supprimant le chiffre tant que
 *  rien n'est posé, on garde une seule source de vérité pour la
 *  durée affichée : le footer (qui s'adapte automatiquement) et
 *  les lieux qui ont une valeur EXPLICITE.
 *
 *  Override → "1h30 sur place" / "45 min sur place" — affiché tel
 *  quel, c'est ce que le participant a posé.
 *  Pas d'override → null → la row affiche un libellé alternatif (ex.
 *  "Définir la durée") + le crayon. */
export function formatPlaceDurationLabel(place: EstimateInput): string | null {
  const explicit = place.estimatedDurationMin;
  if (!(typeof explicit === 'number' && explicit > 0)) {
    return null;
  }
  if (explicit < 60) return `${explicit} min sur place`;
  const h = Math.floor(explicit / 60);
  const r = explicit % 60;
  const dur = r > 0 ? `${h}h${r.toString().padStart(2, '0')}` : `${h}h`;
  return `${dur} sur place`;
}
