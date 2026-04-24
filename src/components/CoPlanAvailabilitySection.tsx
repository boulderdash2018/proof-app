import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { useAuthStore } from '../store';
import { useCoPlanStore } from '../store/coPlanStore';
import {
  DAY_PARTS,
  DayPart,
  buildSlotKey,
  formatSlotKeyShort,
} from '../services/planDraftService';
import { CoPlanParticipant } from '../types';

interface Props {
  participants: Record<string, CoPlanParticipant>;
  /** How many days forward to show. Default 5 — good balance between
   *  planning horizon and grid width on mobile. */
  daysForward?: number;
}

const DAY_PART_LABELS: Record<DayPart, string> = {
  morning: 'Matin',
  midday: 'Midi',
  afternoon: 'Aprèm',
  evening: 'Soir',
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const DAY_PART_ICONS: Record<DayPart, IconName> = {
  morning: 'sunny-outline',
  midday: 'restaurant-outline',
  afternoon: 'cafe-outline',
  evening: 'moon-outline',
};

/**
 * "Quand ?" section — availability grid (dates × dayparts) with live overlap.
 *
 * Each participant taps their available slots. The cell intensity grows with
 * the number of participants available — fully-overlapping cells are shown
 * in terracotta solid with a "★" marker. The best overlap slot is surfaced
 * at the bottom as a suggestion.
 */
export const CoPlanAvailabilitySection: React.FC<Props> = ({
  participants, daysForward = 5,
}) => {
  const user = useAuthStore((s) => s.user);
  const draft = useCoPlanStore((s) => s.draft);
  const mySlots = useCoPlanStore((s) => s.getMySlots());
  const overlapCounts = useCoPlanStore((s) => s.getOverlapCounts());
  const toggleSlot = useCoPlanStore((s) => s.toggleAvailabilitySlot);

  const totalParticipants = draft?.participants.length ?? 1;

  // Build the day grid starting from today for N days.
  const days = useMemo(() => {
    const out: { iso: string; label: string; weekday: string }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < daysForward; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      out.push({
        iso,
        label: d.toLocaleDateString('fr-FR', { day: 'numeric' }),
        weekday: d.toLocaleDateString('fr-FR', { weekday: 'short' }).toLowerCase().replace('.', ''),
      });
    }
    return out;
  }, [daysForward]);

  // Best overlap — pick the slot with the highest participant count (ties: earliest).
  const bestSlot = useMemo(() => {
    let bestKey: string | null = null;
    let bestCount = 0;
    Object.entries(overlapCounts).forEach(([k, c]) => {
      if (c > bestCount || (c === bestCount && bestKey && k < bestKey)) {
        bestKey = k;
        bestCount = c;
      }
    });
    return bestKey ? { key: bestKey, count: bestCount } : null;
  }, [overlapCounts]);

  const mySet = useMemo(() => new Set(mySlots), [mySlots]);

  return (
    <View>
      {/* Grid */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gridScroll}>
        <View>
          {/* Header row — day dates */}
          <View style={styles.headerRow}>
            {/* Empty top-left corner spacer (aligns with the left labels column) */}
            <View style={styles.slotLabelCol} />
            {days.map((d) => (
              <View key={d.iso} style={styles.dayHeader}>
                <Text style={styles.dayWeekday}>{d.weekday}</Text>
                <Text style={styles.dayNumber}>{d.label}</Text>
              </View>
            ))}
          </View>

          {/* Slot rows */}
          {DAY_PARTS.map((part) => (
            <View key={part} style={styles.slotRow}>
              <View style={styles.slotLabelCol}>
                <Ionicons name={DAY_PART_ICONS[part]} size={13} color={Colors.textTertiary} />
                <Text style={styles.slotLabelText}>{DAY_PART_LABELS[part]}</Text>
              </View>
              {days.map((d) => {
                const key = buildSlotKey(d.iso, part);
                const count = overlapCounts[key] || 0;
                const mine = mySet.has(key);
                return (
                  <SlotCell
                    key={key}
                    isMine={mine}
                    count={count}
                    total={totalParticipants}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      toggleSlot(key);
                    }}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Best overlap highlight */}
      {bestSlot && bestSlot.count > 0 && (
        <View style={styles.bestWrap}>
          <View style={styles.bestDot} />
          <View style={{ flex: 1 }}>
            <Text style={styles.bestLabel}>
              MEILLEUR CRÉNEAU COMMUN
            </Text>
            <Text style={styles.bestValue}>
              {formatSlotKeyShort(bestSlot.key)}{' '}
              <Text style={styles.bestCount}>
                · {bestSlot.count}/{totalParticipants} dispos
              </Text>
            </Text>
          </View>
          {bestSlot.count === totalParticipants && (
            <View style={styles.fullBadge}>
              <Text style={styles.fullBadgeText}>TOUS OK</Text>
            </View>
          )}
        </View>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: Colors.bgPrimary, borderColor: Colors.borderSubtle }]} />
          <Text style={styles.legendText}>vide</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: Colors.terracotta50, borderColor: Colors.terracotta100 }]} />
          <Text style={styles.legendText}>1 pers.</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: Colors.terracotta200, borderColor: Colors.terracotta300 }]} />
          <Text style={styles.legendText}>quelques-uns</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: Colors.primary, borderColor: Colors.primaryDeep }]} />
          <Text style={styles.legendText}>tous dispos</Text>
        </View>
      </View>
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// Slot cell — color intensity grows with count/total
// ══════════════════════════════════════════════════════════════

interface CellProps {
  isMine: boolean;
  count: number;
  total: number;
  onPress: () => void;
}

const SlotCell: React.FC<CellProps> = ({ isMine, count, total, onPress }) => {
  const ratio = total > 0 ? count / total : 0;

  // Background : empty / 1 / partial / full — typed as string to allow reassignment.
  let bg: string = Colors.bgPrimary;
  let border: string = Colors.borderSubtle;
  let countColor: string = Colors.textTertiary;
  if (ratio > 0 && ratio < 0.5) {
    bg = Colors.terracotta50;
    border = Colors.terracotta100;
    countColor = Colors.primaryDeep;
  } else if (ratio >= 0.5 && ratio < 1) {
    bg = Colors.terracotta200;
    border = Colors.terracotta300;
    countColor = Colors.terracotta700;
  } else if (ratio >= 1) {
    bg = Colors.primary;
    border = Colors.primaryDeep;
    countColor = Colors.textOnAccent;
  }

  return (
    <TouchableOpacity
      style={[
        styles.cell,
        { backgroundColor: bg, borderColor: border },
        isMine && styles.cellMine,
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {count > 0 && (
        <Text style={[styles.cellCount, { color: countColor }]}>{count}</Text>
      )}
      {isMine && (
        <View style={styles.cellMyMarker}>
          <Ionicons
            name="checkmark"
            size={9}
            color={ratio >= 1 ? Colors.textOnAccent : Colors.primary}
          />
        </View>
      )}
    </TouchableOpacity>
  );
};

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const CELL_W = 46;
const CELL_H = 38;

const styles = StyleSheet.create({
  gridScroll: {
    paddingVertical: 4,
  },
  headerRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayHeader: {
    width: CELL_W,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  dayWeekday: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.textTertiary,
  },
  dayNumber: {
    fontSize: 14,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    marginTop: 1,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  slotLabelCol: {
    width: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingRight: 4,
  },
  slotLabelText: {
    fontSize: 11.5,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
  },
  cell: {
    width: CELL_W - 4,
    height: CELL_H,
    marginHorizontal: 2,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cellMine: {
    // Subtle "I am in" indicator — same as cell but with a small check marker overlay.
  },
  cellCount: {
    fontSize: 12,
    fontFamily: Fonts.bodyBold,
  },
  cellMyMarker: {
    position: 'absolute',
    top: 2,
    right: 2,
  },

  // Best overlap
  bestWrap: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.terracotta50,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.terracotta100,
  },
  bestDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  bestLabel: {
    fontSize: 9,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.primary,
  },
  bestValue: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    marginTop: 2,
    letterSpacing: -0.1,
  },
  bestCount: {
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
  },
  fullBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: Colors.primary,
  },
  fullBadgeText: {
    fontSize: 9,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 0.8,
    color: Colors.textOnAccent,
  },

  // Legend
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
    paddingHorizontal: 2,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth + 0.5,
  },
  legendText: {
    fontSize: 10.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
  },
});
