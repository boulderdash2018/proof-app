import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';

interface Props {
  variant: 'applied' | 'rejected';
  /** The subject of the resolution — e.g. "Le Flandrin" for the action
   *  "Le Flandrin retiré". Used to compose the secondary label after "·". */
  subject?: string;
}

/**
 * Soft-tinted pill rendered when a co-plan proposition resolves —
 * either adopted by majority pour (sage green ✓) or rejected by
 * majority contre (warm gray ✕).
 *
 * Sits at the chat's centerline, full-width minus margins, so it reads
 * as a "decision moment" rather than a regular message. Calmer than
 * shouting "PROPOSITION ADOPTÉE" in a card — the actual proposal card
 * above already shows the full context.
 *
 * Examples :
 *   ┌────────────────────────────────────────────────┐
 *   │  ✓  Proposition adoptée  ·  Le Flandrin retiré │
 *   └────────────────────────────────────────────────┘
 *
 *   ┌────────────────────────────────────────────────┐
 *   │  ✕  Proposition rejetée                         │
 *   └────────────────────────────────────────────────┘
 */
export const CoPlanResolutionPill: React.FC<Props> = ({ variant, subject }) => {
  const isApplied = variant === 'applied';
  const label = isApplied ? 'Proposition adoptée' : 'Proposition rejetée';
  const tint = isApplied ? Colors.success : Colors.textTertiary;
  const bgTint = isApplied ? 'rgba(123,153,113,0.10)' : 'rgba(160,145,129,0.10)';
  const borderTint = isApplied ? 'rgba(123,153,113,0.22)' : 'rgba(160,145,129,0.22)';

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.pill,
          { backgroundColor: bgTint, borderColor: borderTint },
        ]}
      >
        <Ionicons
          name={isApplied ? 'checkmark-circle' : 'close-circle'}
          size={15}
          color={tint}
        />
        <Text style={[styles.label, { color: Colors.textPrimary }]} numberOfLines={1}>
          {label}
          {subject ? (
            <>
              <Text style={styles.sep}>  ·  </Text>
              <Text style={[styles.subject, { color: tint }]}>{subject}</Text>
            </>
          ) : null}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
  },
  label: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: -0.05,
  },
  sep: {
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
  },
  subject: {
    fontFamily: Fonts.bodyMedium,
  },
});
