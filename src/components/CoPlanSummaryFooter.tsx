import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { useCoPlanStore } from '../store/coPlanStore';
import { CoPlanProposedPlace } from '../types';

/**
 * Summary footer — aggregates duration + budget estimates from the
 * proposed places. Displayed as a compact pill row in the workspace,
 * right above the VERROUILLER section so the user has the full picture
 * before locking.
 *
 * Duration : sums estimatedDurationMin (when available) — falls back to
 *   a per-category heuristic if the place didn't come with one.
 *
 * Budget : aggregates priceLevel (0-4 Google Places) into a per-person
 *   range using ballpark euros. Shows min-max total per person.
 */
export const CoPlanSummaryFooter: React.FC = () => {
  const places = useCoPlanStore((s) => s.getSortedPlaces());

  const { durationMin, budgetMin, budgetMax } = useMemo(
    () => computeEstimates(places),
    [places],
  );

  if (places.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.pill}>
        <Ionicons name="time-outline" size={13} color={Colors.textSecondary} />
        <Text style={styles.pillLabel}>Durée</Text>
        <Text style={styles.pillValue}>{formatDuration(durationMin)}</Text>
      </View>
      <View style={styles.pill}>
        <Ionicons name="cash-outline" size={13} color={Colors.textSecondary} />
        <Text style={styles.pillLabel}>Budget</Text>
        <Text style={styles.pillValue}>
          {budgetMin === budgetMax
            ? `≈ ${budgetMin}€`
            : `${budgetMin}-${budgetMax}€`}
        </Text>
        <Text style={styles.pillHint}>/ pers.</Text>
      </View>
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// Estimation heuristics
// ══════════════════════════════════════════════════════════════

/** Per-Google-priceLevel euro ballpark (min, max) per person per place. */
const PRICE_LEVEL_RANGE: Array<[number, number]> = [
  [0, 0],     // level 0 — free / unknown → skip
  [10, 20],   // level 1 — $
  [25, 45],   // level 2 — $$
  [50, 85],   // level 3 — $$$
  [100, 180], // level 4 — $$$$
];

/** Category → minutes on-site heuristic. Keep minimal — accepted approximations. */
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

const computeEstimates = (places: CoPlanProposedPlace[]) => {
  let durationMin = 0;
  let budgetMin = 0;
  let budgetMax = 0;
  places.forEach((p) => {
    // Duration
    const explicit = p.estimatedDurationMin;
    if (typeof explicit === 'number' && explicit > 0) {
      durationMin += explicit;
    } else if (p.category && CATEGORY_DURATION_MIN[p.category] != null) {
      durationMin += CATEGORY_DURATION_MIN[p.category];
    } else {
      durationMin += DEFAULT_DURATION_MIN;
    }
    // Budget
    const lvl = p.priceLevel;
    if (typeof lvl === 'number' && lvl >= 1 && lvl <= 4) {
      const [min, max] = PRICE_LEVEL_RANGE[lvl];
      budgetMin += min;
      budgetMax += max;
    }
  });
  return { durationMin, budgetMin, budgetMax };
};

const formatDuration = (min: number): string => {
  if (min <= 0) return '—';
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const rem = Math.round(min - h * 60);
  return rem > 0 ? `${h}h${rem.toString().padStart(2, '0')}` : `${h}h`;
};

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: Colors.bgSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  pillLabel: {
    fontSize: 10.5,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: Colors.textTertiary,
  },
  pillValue: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  pillHint: {
    fontSize: 10.5,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
  },
});
