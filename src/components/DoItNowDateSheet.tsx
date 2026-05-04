import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { formatMeetupForTitle } from '../services/planDraftService';
import { checkPlacesClosedAtDate, PlaceOpenAtDateStatus } from '../services/googlePlacesService';
import { fetchPlanById } from '../services/plansService';
import { BlockingClosedPlacesAlert } from './BlockingClosedPlacesAlert';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Current meetup ISO (used as initial value). Null = no date yet. */
  currentMeetupAt: string | null;
  /** Persist a new date. Returns when the write is confirmed. */
  onConfirm: (iso: string) => Promise<void>;
  /** Optional clear action — only rendered if currentMeetupAt is set. */
  onClear?: () => Promise<void>;
  /** Eyebrow / title overrides. Defaults : "QUAND ?" / "Fixe la date du départ". */
  title?: string;
  eyebrow?: string;
  /** Places attached to the linked plan/draft. When provided, the
   *  sheet runs the closed-at-date check on confirm and BLOCKS the
   *  persist if any place would be closed at the chosen date+time.
   *  Falsy / empty → no check (same as before). */
  placesToCheck?: Array<{ googlePlaceId: string; name: string }>;
  /** Alternative to placesToCheck — pass a planId and the sheet will
   *  lazy-fetch the Plan on confirm. Convenient for callers (chat
   *  pinned card) that don't have the places pre-loaded. Ignored if
   *  `placesToCheck` is also passed. */
  linkedPlanId?: string;
}

/**
 * DoItNowDateSheet — generic date/heure picker sheet.
 *
 * Same visual language as CoPlanMeetupSheet (terracotta day strip,
 * hour pills) but decoupled from the coPlanStore so it can be reused
 * to set the start time of a group session from the chat. The caller
 * passes initial value + persist callback ; the sheet handles the UI
 * state internally.
 *
 * Layout :
 *   • Header with calendar icon + eyebrow + title
 *   • Horizontal scroll of 21 days (today → +20j)
 *   • Grid of hours 8h..22h (15 chips)
 *   • Live preview line ("le 1 mai à 18h")
 *   • Annuler / Confirmer actions
 *   • Optional "Retirer la date" link
 */
export const DoItNowDateSheet: React.FC<Props> = ({
  visible, onClose, currentMeetupAt, onConfirm, onClear,
  title = 'Fixe la date du départ',
  eyebrow = 'QUAND ?',
  placesToCheck,
  linkedPlanId,
}) => {
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [selectedHour, setSelectedHour] = useState<number>(18);
  const [submitting, setSubmitting] = useState(false);
  const [closedPlaces, setClosedPlaces] = useState<PlaceOpenAtDateStatus[] | null>(null);

  // Re-init when the sheet opens, or when the upstream meetup changes.
  useEffect(() => {
    if (!visible) return;
    if (currentMeetupAt) {
      const d = new Date(currentMeetupAt);
      if (!Number.isNaN(d.getTime())) {
        setSelectedDay(toDayKey(d));
        setSelectedHour(d.getHours());
        return;
      }
    }
    // Fallback : tomorrow at 18h.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setSelectedDay(toDayKey(tomorrow));
    setSelectedHour(18);
  }, [visible, currentMeetupAt]);

  const days = useMemo(() => buildDays(21), []);
  const hours = useMemo(() => Array.from({ length: 15 }, (_, i) => i + 8), []);

  const buildIso = (): string | null => {
    if (!selectedDay) return null;
    const [y, m, d] = selectedDay.split('-').map((s) => parseInt(s, 10));
    const dt = new Date(y, m - 1, d, selectedHour, 0, 0, 0);
    return dt.toISOString();
  };

  const handleConfirm = async () => {
    const iso = buildIso();
    if (!iso || submitting) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      // Pre-flight closed-at-date check — same blocking rule as
      // CoPlanMeetupSheet. Resolves places either from the explicit
      // `placesToCheck` prop or, as a fallback, by lazy-fetching the
      // linked plan via `linkedPlanId`. Skipped if neither is set.
      let resolvedPlaces: Array<{ googlePlaceId: string; name: string }> | null = null;
      if (placesToCheck && placesToCheck.length > 0) {
        resolvedPlaces = placesToCheck;
      } else if (linkedPlanId) {
        try {
          const plan = await fetchPlanById(linkedPlanId);
          if (plan) {
            resolvedPlaces = (plan.places || [])
              .filter((p) => !!p.googlePlaceId)
              .map((p) => ({ googlePlaceId: p.googlePlaceId!, name: p.name }));
          }
        } catch (err) {
          console.warn('[DoItNowDateSheet] linkedPlan fetch failed:', err);
        }
      }
      if (resolvedPlaces && resolvedPlaces.length > 0) {
        const closed = await checkPlacesClosedAtDate(resolvedPlaces, new Date(iso));
        if (closed.length > 0) {
          setClosedPlaces(closed);
          setSubmitting(false);
          return;
        }
      }
      await onConfirm(iso);
      onClose();
    } catch (err) {
      console.warn('[DoItNowDateSheet] confirm failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = async () => {
    if (!onClear || submitting) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await onClear();
      onClose();
    } catch (err) {
      console.warn('[DoItNowDateSheet] clear failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const previewIso = buildIso();
  const preview = previewIso ? formatMeetupForTitle(previewIso) : '';

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
              <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>{eyebrow}</Text>
              <Text style={styles.title}>{title}</Text>
            </View>
          </View>

          {/* Day strip */}
          <Text style={styles.sectionLabel}>Jour</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayStrip}
          >
            {days.map((day) => {
              const isSelected = day.key === selectedDay;
              return (
                <TouchableOpacity
                  key={day.key}
                  style={[styles.dayChip, isSelected && styles.dayChipActive]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setSelectedDay(day.key);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.dayChipDow, isSelected && styles.dayChipTextActive]}>
                    {day.dow}
                  </Text>
                  <Text style={[styles.dayChipNum, isSelected && styles.dayChipTextActive]}>
                    {day.dayNum}
                  </Text>
                  <Text style={[styles.dayChipMonth, isSelected && styles.dayChipTextActive]}>
                    {day.month}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Hour grid */}
          <Text style={styles.sectionLabel}>Heure</Text>
          <View style={styles.hourGrid}>
            {hours.map((h) => {
              const isSelected = h === selectedHour;
              return (
                <TouchableOpacity
                  key={h}
                  style={[styles.hourChip, isSelected && styles.hourChipActive]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setSelectedHour(h);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.hourChipText, isSelected && styles.hourChipTextActive]}>
                    {h}h
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Preview */}
          {!!preview && (
            <View style={styles.preview}>
              <Ionicons name="time-outline" size={13} color={Colors.primary} />
              <Text style={styles.previewText}>{preview}</Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.btnGhost}
              onPress={onClose}
              disabled={submitting}
              activeOpacity={0.7}
            >
              <Text style={styles.btnGhostText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnConfirm, submitting && { opacity: 0.6 }]}
              onPress={handleConfirm}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color={Colors.textOnAccent} size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={14} color={Colors.textOnAccent} />
                  <Text style={styles.btnConfirmText}>Confirmer</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Optional clear */}
          {onClear && currentMeetupAt && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={handleClear}
              disabled={submitting}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.clearText}>Retirer la date</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>

      {/* Blocking alert when the chosen date hits closed places. */}
      <BlockingClosedPlacesAlert
        visible={!!closedPlaces && closedPlaces.length > 0}
        closedPlaces={closedPlaces ?? []}
        targetDateLabel={previewIso ? formatMeetupForTitle(previewIso) : 'à cette date'}
        onDismiss={() => setClosedPlaces(null)}
      />
    </Modal>
  );
};

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

const toDayKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
};

interface DayCell {
  key: string;
  dow: string;
  dayNum: string;
  month: string;
}

const buildDays = (count: number): DayCell[] => {
  const out: DayCell[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push({
      key: toDayKey(d),
      dow: d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''),
      dayNum: d.getDate().toString(),
      month: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
    });
  }
  return out;
};

// ══════════════════════════════════════════════════════════════
// Styles — copied from CoPlanMeetupSheet for visual consistency
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
    marginBottom: 8,
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
    fontSize: 17,
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
    marginTop: 14,
    marginBottom: 8,
  },
  dayStrip: { gap: 8, paddingRight: 4 },
  dayChip: {
    width: 56,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  dayChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dayChipDow: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
  },
  dayChipNum: {
    fontSize: 18,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
  },
  dayChipMonth: {
    fontSize: 10,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
  },
  dayChipTextActive: {
    color: Colors.textOnAccent,
  },
  hourGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  hourChip: {
    minWidth: 52,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.bgPrimary,
    alignItems: 'center',
  },
  hourChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  hourChipText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },
  hourChipTextActive: {
    color: Colors.textOnAccent,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: Colors.terracotta50,
    marginTop: 16,
  },
  previewText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
  },
  btnGhost: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 99,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgPrimary,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  btnGhostText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },
  btnConfirm: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 99,
    backgroundColor: Colors.primary,
  },
  btnConfirmText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    marginTop: 6,
  },
  clearText: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
  },
});
