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
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { useCoPlanStore } from '../store/coPlanStore';
import { useAuthStore } from '../store/authStore';
import { formatMeetupForTitle } from '../services/planDraftService';
import { checkPlacesClosedAtDate, PlaceOpenAtDateStatus } from '../services/googlePlacesService';
import { BlockingClosedPlacesAlert } from './BlockingClosedPlacesAlert';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * CoPlanMeetupSheet — date/heure picker pour fixer le rendez-vous d'un
 * brouillon de co-plan.
 *
 * Comportement :
 *   • Créateur du brouillon  → écrit directement la valeur (no vote).
 *     L'UI réagit en temps réel pour tous les participants via le live
 *     subscribe du draft.
 *   • Autre participant      → crée une proposition `change_meetup` qui
 *     part en sondage dans le chat (réutilise le pipeline `proposals`
 *     existant). La date n'est appliquée que si la majorité simple vote
 *     "pour".
 *
 * Picker custom (pas de DateTimePicker natif — pas de support web propre) :
 *   • Bandeau horizontal de 21 jours (auj → +20j)
 *   • Grille d'heures de 8h à 22h (15 chips)
 *
 * Bouton "Retirer la date" affiché si meetupAtProposed est déjà set.
 */
export const CoPlanMeetupSheet: React.FC<Props> = ({ visible, onClose }) => {
  const draft = useCoPlanStore((s) => s.draft);
  const setMeetupAtProposed = useCoPlanStore((s) => s.setMeetupAtProposed);
  const proposeChangeMeetup = useCoPlanStore((s) => s.proposeChangeMeetup);
  const user = useAuthStore((s) => s.user);

  const isCreator = !!draft && !!user && draft.createdBy === user.id;
  const currentMeetup = draft?.meetupAtProposed;

  // ── Local picker state ──
  // Garde la valeur actuelle comme défaut quand le sheet s'ouvre — sinon
  // par défaut "demain à 18h".
  const [selectedDay, setSelectedDay] = useState<string>(''); // YYYY-MM-DD
  const [selectedHour, setSelectedHour] = useState<number>(18);
  const [submitting, setSubmitting] = useState(false);
  // Blocking-alert state when one or more places would be closed at
  // the chosen date. Visible = list non-empty.
  const [closedPlaces, setClosedPlaces] = useState<PlaceOpenAtDateStatus[] | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (currentMeetup) {
      const d = new Date(currentMeetup);
      setSelectedDay(toDayKey(d));
      setSelectedHour(d.getHours());
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setSelectedDay(toDayKey(tomorrow));
      setSelectedHour(18);
    }
  }, [visible, currentMeetup]);

  const days = useMemo(() => buildDays(21), []);
  const hours = useMemo(() => Array.from({ length: 15 }, (_, i) => i + 8), []); // 8..22

  if (!draft || !user) return null;

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
      // ── Pre-flight : block the date if any place would be closed ──
      // Hard rule for co-plans : you cannot propose a date where a
      // place is closed (different from DoItNow's soft warn). The
      // check fetches periods from Google Places per place ; we run
      // them in parallel + cap with a 7s timeout each so a slow API
      // can't hang the confirm.
      const placesToCheck = (draft.proposedPlaces || [])
        .filter((p) => p.googlePlaceId)
        .map((p) => ({ googlePlaceId: p.googlePlaceId, name: p.name }));
      if (placesToCheck.length > 0) {
        const closed = await checkPlacesClosedAtDate(placesToCheck, new Date(iso));
        if (closed.length > 0) {
          setClosedPlaces(closed);
          setSubmitting(false);
          return;
        }
      }

      if (isCreator) {
        await setMeetupAtProposed(iso);
        onClose();
      } else {
        const propId = await proposeChangeMeetup(iso);
        if (propId) {
          onClose();
          // Léger feedback pour expliquer que c'est en sondage.
          setTimeout(() => {
            Alert.alert(
              'Proposition envoyée',
              'Le groupe doit valider la nouvelle date dans le chat.',
            );
          }, 220);
        } else {
          Alert.alert('Erreur', 'La proposition n\'a pas pu être créée.');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = async () => {
    if (submitting) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      if (isCreator) {
        await setMeetupAtProposed(null);
      } else {
        await proposeChangeMeetup(null);
      }
      onClose();
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
              <Text style={styles.eyebrow}>QUAND ?</Text>
              <Text style={styles.title}>
                {isCreator ? 'Fixe la date du plan' : 'Propose une date'}
              </Text>
            </View>
          </View>

          {/* Sub-line — explain the vote path for non-creators */}
          {!isCreator && (
            <Text style={styles.subline}>
              Ta proposition partira en sondage dans le chat.
            </Text>
          )}

          {/* ── Day strip ───────────────────────────────────────── */}
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

          {/* ── Hour grid ───────────────────────────────────────── */}
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
                  <Ionicons
                    name={isCreator ? 'checkmark' : 'send'}
                    size={14}
                    color={Colors.textOnAccent}
                  />
                  <Text style={styles.btnConfirmText}>
                    {isCreator ? 'Confirmer' : 'Proposer au groupe'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Clear */}
          {!!currentMeetup && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={handleClear}
              disabled={submitting}
              activeOpacity={0.7}
            >
              <Ionicons name="close-circle-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.clearText}>
                {isCreator ? 'Retirer la date' : 'Proposer de retirer la date'}
              </Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>

      {/* Blocking alert when the chosen date hits closed places. The
          alert dismisses without persisting → the user lands back on
          the picker and can choose another slot. */}
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
// Helpers — local date utilities
// ══════════════════════════════════════════════════════════════

const toDayKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
};

interface DayCell {
  key: string;
  dow: string;   // "lun"
  dayNum: string; // "17"
  month: string; // "avr"
}

const buildDays = (count: number): DayCell[] => {
  const out: DayCell[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push({
      key: toDayKey(d),
      dow: d
        .toLocaleDateString('fr-FR', { weekday: 'short' })
        .replace('.', ''),
      dayNum: d.getDate().toString(),
      month: d
        .toLocaleDateString('fr-FR', { month: 'short' })
        .replace('.', ''),
    });
  }
  return out;
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
  subline: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginBottom: 14,
    marginLeft: 52,
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
  dayStrip: {
    gap: 8,
    paddingRight: 4,
  },
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
