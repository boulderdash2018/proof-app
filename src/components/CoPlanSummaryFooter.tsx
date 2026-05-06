import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { useCoPlanStore } from '../store/coPlanStore';
import {
  computeCoPlanEstimates,
  formatDurationMinutes,
} from '../utils/coPlanEstimates';

/**
 * Summary footer — aggregates duration + budget estimates from the
 * proposed places. Displayed as a compact pill row in the workspace,
 * right above the VERROUILLER section so the user has the full picture
 * before locking.
 *
 * Both estimates delegate to `utils/coPlanEstimates` — the SAME
 * heuristic used by the per-row chip. This guarantees the row sum and
 * the footer total agree (e.g. 1h × 2 rows = 2h footer, not 2h30 from a
 * divergent category default).
 */
export const CoPlanSummaryFooter: React.FC = () => {
  const places = useCoPlanStore((s) => s.getSortedPlaces());

  const { durationMin, budgetMin, budgetMax } = useMemo(
    () => computeCoPlanEstimates(places),
    [places],
  );

  if (places.length === 0) return null;

  // Budget can be 0-0 only if every place explicitly maps to free
  // (park, library). In that case we want to show "Gratuit" rather
  // than "0€" or hiding the pill entirely.
  const isFree = budgetMin === 0 && budgetMax === 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.pill}>
        <Ionicons name="time-outline" size={13} color={Colors.textSecondary} />
        <Text style={styles.pillLabel}>Durée</Text>
        <Text style={styles.pillValue}>{formatDurationMinutes(durationMin)}</Text>
      </View>
      <View style={styles.pill}>
        <Ionicons name="cash-outline" size={13} color={Colors.textSecondary} />
        <Text style={styles.pillLabel}>Budget</Text>
        <Text style={styles.pillValue}>
          {isFree
            ? 'Gratuit'
            : budgetMin === budgetMax
              ? `≈ ${budgetMin}€`
              : `${budgetMin}-${budgetMax}€`}
        </Text>
        {!isFree && <Text style={styles.pillHint}>/ pers.</Text>}
      </View>
    </View>
  );
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
