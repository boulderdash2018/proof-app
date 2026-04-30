import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Current duration in minutes (or null/undefined if using the default). */
  currentMinutes?: number | null;
  /** Persist a new duration in minutes. Pass null to clear the override
   *  (timeline falls back to the default 60min). */
  onConfirm: (minutes: number | null) => Promise<void>;
  /** Place name for the header line. */
  placeName?: string;
  /** Optional Google category (restaurant / bar / cinema / etc.) — used
   *  to pre-select an "occasion" chip when relevant. */
  placeCategory?: string;
}

// ──────────────────────────────────────────────────────────────
// Picker presets
// ──────────────────────────────────────────────────────────────

interface PrecisePreset {
  label: string;
  minutes: number;
}

const PRECISE_PRESETS: PrecisePreset[] = [
  { label: '30 min', minutes: 30 },
  { label: '1h',     minutes: 60 },
  { label: '1h30',   minutes: 90 },
  { label: '2h',     minutes: 120 },
  { label: '2h30',   minutes: 150 },
  { label: '3h',     minutes: 180 },
  { label: '4h',     minutes: 240 },
];

interface OccasionPreset {
  key: string;
  emoji: string;
  label: string;
  minutes: number;
  /** Google place_type categories where this occasion makes sense.
   *  Used to suggest the chip first when the place matches. */
  matchCategories?: string[];
}

const OCCASION_PRESETS: OccasionPreset[] = [
  { key: 'match',  emoji: '⚽', label: 'Match',         minutes: 150, matchCategories: ['bar', 'pub', 'sports_bar'] },
  { key: 'cine',   emoji: '🎬', label: 'Séance ciné',  minutes: 135, matchCategories: ['movie_theater'] },
  { key: 'diner',  emoji: '🍽',  label: 'Dîner long',   minutes: 120, matchCategories: ['restaurant', 'meal_takeaway', 'meal_delivery'] },
  { key: 'brunch', emoji: '🥐', label: 'Brunch',        minutes: 105, matchCategories: ['cafe', 'bakery', 'restaurant'] },
  { key: 'before', emoji: '🍺', label: 'Before / verre', minutes: 45, matchCategories: ['bar', 'cafe', 'pub'] },
  { key: 'soiree', emoji: '🎉', label: 'Soirée',        minutes: 180, matchCategories: ['night_club', 'bar'] },
];

const formatMinutes = (m: number): string => {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}h${r.toString().padStart(2, '0')}` : `${h}h`;
};

/**
 * DurationPickerSheet — quick selector for the on-site duration of a
 * proposed place. Two sections :
 *
 *   1. **Précis** — minute-grain chips (30min, 1h, 1h30, …, 4h)
 *   2. **Occasions** — context tags with implied duration ("⚽ Match",
 *      "🎬 Séance ciné", etc.) ; tapping picks both the duration AND
 *      a known label for the chat ("baptisteqh a fixé · Match · 2h30").
 *
 * Heuristic : occasion presets matching the place's Google category
 * (e.g. movie_theater → "🎬 Séance ciné") are surfaced first so the
 * most contextual choice is always one tap away.
 *
 * Tapping a chip is the confirmation — no separate Confirmer button.
 * We close the sheet immediately after the persist callback resolves.
 *
 * Optional "Retirer la durée custom" link clears the override and lets
 * the timeline fall back to the default 60min.
 */
export const DurationPickerSheet: React.FC<Props> = ({
  visible, onClose, currentMinutes, onConfirm, placeName, placeCategory,
}) => {
  const [submittingValue, setSubmittingValue] = useState<number | null | 'clear' | null>(null);

  useEffect(() => {
    if (visible) setSubmittingValue(null);
  }, [visible]);

  const apply = async (minutes: number | null) => {
    if (submittingValue !== null) return;
    setSubmittingValue(minutes === null ? 'clear' : minutes);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await onConfirm(minutes);
      onClose();
    } catch (err) {
      console.warn('[DurationPickerSheet] persist failed:', err);
    } finally {
      setSubmittingValue(null);
    }
  };

  // Sort occasions : matching ones first, then the rest. Stable order
  // within each group preserves the natural reading flow.
  const sortedOccasions = [...OCCASION_PRESETS].sort((a, b) => {
    const aMatch = a.matchCategories?.includes(placeCategory ?? '') ? 0 : 1;
    const bMatch = b.matchCategories?.includes(placeCategory ?? '') ? 0 : 1;
    return aMatch - bMatch;
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Ionicons name="time-outline" size={18} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>COMBIEN DE TEMPS ?</Text>
              <Text style={styles.title} numberOfLines={1}>
                {placeName ? `Sur place — ${placeName}` : 'Durée sur place'}
              </Text>
            </View>
          </View>

          {/* Precise chips */}
          <Text style={styles.sectionLabel}>Précis</Text>
          <View style={styles.chipGrid}>
            {PRECISE_PRESETS.map((p) => {
              const isCurrent = currentMinutes === p.minutes;
              const isLoading = submittingValue === p.minutes;
              return (
                <TouchableOpacity
                  key={p.minutes}
                  style={[styles.chip, isCurrent && styles.chipActive]}
                  onPress={() => apply(p.minutes)}
                  disabled={submittingValue !== null}
                  activeOpacity={0.75}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color={isCurrent ? Colors.textOnAccent : Colors.primary} />
                  ) : (
                    <Text style={[styles.chipText, isCurrent && styles.chipTextActive]}>
                      {p.label}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Occasion chips */}
          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
            Ou pour les soirées spéciales
          </Text>
          <View style={styles.chipGridOccasions}>
            {sortedOccasions.map((o) => {
              const isCurrent = currentMinutes === o.minutes;
              const isLoading = submittingValue === o.minutes;
              const isSuggested = !!o.matchCategories?.includes(placeCategory ?? '');
              return (
                <TouchableOpacity
                  key={o.key}
                  style={[
                    styles.chipOccasion,
                    isCurrent && styles.chipOccasionActive,
                    isSuggested && !isCurrent && styles.chipOccasionSuggested,
                  ]}
                  onPress={() => apply(o.minutes)}
                  disabled={submittingValue !== null}
                  activeOpacity={0.75}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color={isCurrent ? Colors.textOnAccent : Colors.primary} />
                  ) : (
                    <>
                      <Text style={styles.chipOccasionEmoji}>{o.emoji}</Text>
                      <View>
                        <Text style={[styles.chipOccasionLabel, isCurrent && styles.chipTextActive]}>
                          {o.label}
                        </Text>
                        <Text style={[styles.chipOccasionSub, isCurrent && styles.chipOccasionSubActive]}>
                          {formatMinutes(o.minutes)}
                        </Text>
                      </View>
                    </>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Clear override (only if a custom value is set) */}
          {typeof currentMinutes === 'number' && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => apply(null)}
              disabled={submittingValue !== null}
              activeOpacity={0.7}
            >
              {submittingValue === 'clear' ? (
                <ActivityIndicator size="small" color={Colors.textSecondary} />
              ) : (
                <>
                  <Ionicons name="refresh-outline" size={13} color={Colors.textSecondary} />
                  <Text style={styles.clearText}>Revenir à la durée par défaut (1h)</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(44,36,32,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.bgSecondary,
    borderRadius: 18,
    padding: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.terracotta50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.primary,
    marginBottom: 2,
  },
  title: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    letterSpacing: -0.2,
    color: Colors.textPrimary,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
    marginBottom: 8,
  },

  // Precise chips
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    minWidth: 64,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },
  chipTextActive: {
    color: Colors.textOnAccent,
  },

  // Occasion chips — wider with emoji + label + duration sub
  chipGridOccasions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chipOccasion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.bgPrimary,
    minHeight: 52,
  },
  chipOccasionActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipOccasionSuggested: {
    borderColor: Colors.terracotta300,
    backgroundColor: Colors.terracotta50,
  },
  chipOccasionEmoji: {
    fontSize: 18,
  },
  chipOccasionLabel: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  chipOccasionSub: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  chipOccasionSubActive: {
    color: 'rgba(255,248,240,0.85)',
  },

  // Clear
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
  },
  clearText: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
  },
});
