import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { useCoPlanStore } from '../store/coPlanStore';
import { computePlanTimeline, formatTimeOfDay, Timeline } from '../services/planTimelineService';
import { formatMeetupForTitle } from '../services/planDraftService';
import { CoPlanProposedPlace } from '../types';

interface Props {
  /** Tap "Modifier les détails" → returns to edit mode. */
  onEdit: () => void;
  /** Tap "Lancer le plan" → triggers final lock (LockSheet). */
  onLock: () => void;
  /** Lock-readiness gate from the workspace. */
  canLock: boolean;
}

/**
 * Read-only details view of a co-plan brouillon.
 *
 * Affiché quand l'utilisateur a cliqué "Confirmer les détails du plan"
 * dans le workspace. Contenu :
 *   • Bandeau date/heure de rendez-vous
 *   • Timeline verticale : pour chaque lieu, heure d'arrivée + nom +
 *     durée sur place + flèche vers suivant avec temps de trajet
 *   • Pills "budget total" + "durée totale"
 *   • Bouton "Modifier" en haut (retour édition)
 *   • Bouton "Lancer le plan" en bas (lock final)
 *
 * La timeline est calculée on-demand via `computePlanTimeline` (Google
 * Directions API, n-1 appels). Cache local côté service ; au sein de
 * cette view on garde l'état dans un useState.
 */
export const CoPlanDetailsView: React.FC<Props> = ({ onEdit, onLock, canLock }) => {
  const draft = useCoPlanStore((s) => s.draft);
  const places = useCoPlanStore((s) => s.getSortedPlaces());

  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [loading, setLoading] = useState(false);

  // Heure de départ : si meetupAtProposed est posé, on l'utilise. Sinon
  // on prend "aujourd'hui à 18h" comme fallback explicite — l'utilisateur
  // verra que la date n'a pas été fixée et pourra revenir éditer.
  const startISO = useMemo(() => {
    if (draft?.meetupAtProposed) return draft.meetupAtProposed;
    const fallback = new Date();
    fallback.setHours(18, 0, 0, 0);
    return fallback.toISOString();
  }, [draft?.meetupAtProposed]);

  // Compute la timeline à chaque changement de places ou de meetupAt.
  // Le service cache les segments via signature, donc relancer à
  // l'identique est gratuit.
  useEffect(() => {
    let cancelled = false;
    if (places.length === 0) {
      setTimeline(null);
      return;
    }
    setLoading(true);
    computePlanTimeline(places, startISO, 'walking')
      .then((tl) => {
        if (!cancelled) setTimeline(tl);
      })
      .catch((err) => {
        console.warn('[CoPlanDetailsView] computePlanTimeline error:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [places, startISO]);

  if (!draft) return null;

  const hasMeetup = !!draft.meetupAtProposed;
  const totals = computeBudget(places);

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {/* ── Bandeau "Modifier" ────────────────────────────── */}
      <TouchableOpacity
        style={styles.editStrip}
        onPress={onEdit}
        activeOpacity={0.7}
      >
        <Ionicons name="create-outline" size={14} color={Colors.primary} />
        <Text style={styles.editStripText}>Modifier les détails</Text>
      </TouchableOpacity>

      {/* ── Carte récap du rendez-vous ────────────────────── */}
      <View style={styles.recapCard}>
        <View style={styles.recapTitleRow}>
          <Ionicons name="calendar" size={16} color={Colors.primary} />
          <Text style={styles.recapEyebrow}>RENDEZ-VOUS</Text>
        </View>
        <Text style={styles.recapValue}>
          {hasMeetup
            ? formatMeetupForTitle(draft.meetupAtProposed!).replace(/^le /, '')
            : 'Date à fixer'}
        </Text>
        {!hasMeetup && (
          <Text style={styles.recapHint}>
            Reviens à la modif pour choisir une date — la timeline ci-dessous
            est calculée à partir de 18h00 (estimation).
          </Text>
        )}
      </View>

      {/* ── Pills durée + budget ──────────────────────────── */}
      <View style={styles.pillsRow}>
        <View style={styles.pill}>
          <Ionicons name="time-outline" size={13} color={Colors.textSecondary} />
          <Text style={styles.pillLabel}>Durée totale</Text>
          <Text style={styles.pillValue}>
            {timeline ? formatMinutes(timeline.totalMinutes) : '—'}
          </Text>
        </View>
        <View style={styles.pill}>
          <Ionicons name="cash-outline" size={13} color={Colors.textSecondary} />
          <Text style={styles.pillLabel}>Budget</Text>
          <Text style={styles.pillValue}>
            {totals.min === totals.max ? `≈ ${totals.min}€` : `${totals.min}-${totals.max}€`}
          </Text>
          <Text style={styles.pillHint}>/ pers.</Text>
        </View>
      </View>

      {/* ── Timeline ──────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>DÉROULÉ</Text>
      {loading && !timeline ? (
        <View style={styles.timelineLoading}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : timeline ? (
        <View style={styles.timeline}>
          {timeline.stops.map((stop, idx) => (
            <React.Fragment key={stop.placeId}>
              {/* Travel segment (none for first stop) */}
              {idx > 0 && (
                <View style={styles.travelRow}>
                  <View style={styles.travelDottedLine} />
                  <View style={styles.travelChip}>
                    <Ionicons name="walk" size={11} color={Colors.textSecondary} />
                    <Text style={styles.travelChipText}>
                      {stop.travelFromPreviousText || '—'}
                    </Text>
                  </View>
                  <View style={styles.travelDottedLine} />
                </View>
              )}
              {/* Stop */}
              <View style={styles.stopRow}>
                <View style={styles.timeCol}>
                  <Text style={styles.timeArrival}>{formatTimeOfDay(stop.arrivalISO)}</Text>
                  <Text style={styles.timeDeparture}>
                    → {formatTimeOfDay(stop.departureISO)}
                  </Text>
                </View>
                <View style={styles.dotCol}>
                  <View style={styles.dot} />
                </View>
                <View style={styles.stopBody}>
                  <Text style={styles.stopName} numberOfLines={2}>
                    {stop.placeName}
                  </Text>
                  <Text style={styles.stopDuration}>
                    {formatMinutes(stop.visitMinutes)} sur place
                  </Text>
                </View>
              </View>
            </React.Fragment>
          ))}
          {/* Footer "Fin du plan" */}
          {timeline.stops.length > 0 && (
            <View style={styles.endRow}>
              <View style={styles.timeCol}>
                <Text style={styles.timeArrival}>{formatTimeOfDay(timeline.endISO)}</Text>
              </View>
              <View style={styles.dotCol}>
                <View style={[styles.dot, styles.dotEnd]} />
              </View>
              <View style={styles.stopBody}>
                <Text style={styles.endLabel}>Fin du plan</Text>
              </View>
            </View>
          )}
        </View>
      ) : (
        <Text style={styles.emptyHint}>
          Ajoute au moins un lieu pour voir le déroulé.
        </Text>
      )}

      {/* ── Bouton "Lancer le plan" en bas ─────────────────── */}
      <TouchableOpacity
        style={[styles.lockBtn, !canLock && styles.lockBtnDisabled]}
        onPress={onLock}
        disabled={!canLock}
        activeOpacity={0.85}
      >
        <Ionicons
          name="rocket"
          size={16}
          color={canLock ? Colors.textOnAccent : Colors.textTertiary}
        />
        <Text
          style={[styles.lockBtnText, !canLock && styles.lockBtnTextDisabled]}
        >
          Lancer le plan
        </Text>
      </TouchableOpacity>
      {!canLock && (
        <Text style={styles.lockHint}>
          Ajoute au moins un lieu avant de lancer le plan.
        </Text>
      )}
    </ScrollView>
  );
};

// ══════════════════════════════════════════════════════════════
// Local helpers
// ══════════════════════════════════════════════════════════════

const PRICE_LEVEL_RANGE: Array<[number, number]> = [
  [0, 0],
  [10, 20],
  [25, 45],
  [50, 85],
  [100, 180],
];

const computeBudget = (places: CoPlanProposedPlace[]) => {
  let min = 0;
  let max = 0;
  places.forEach((p) => {
    const lvl = p.priceLevel;
    if (typeof lvl === 'number' && lvl >= 1 && lvl <= 4) {
      const [a, b] = PRICE_LEVEL_RANGE[lvl];
      min += a;
      max += b;
    }
  });
  return { min, max };
};

const formatMinutes = (min: number): string => {
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
  scroll: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 80,
  },

  // Edit strip (top)
  editStrip: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: Colors.terracotta50,
    marginBottom: 14,
  },
  editStripText: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },

  // Recap
  recapCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: Colors.terracotta50,
    borderWidth: 1,
    borderColor: Colors.terracotta200,
    marginBottom: 14,
  },
  recapTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  recapEyebrow: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.primary,
  },
  recapValue: {
    fontSize: 18,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  recapHint: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginTop: 6,
  },

  // Pills
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
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

  // Section label
  sectionLabel: {
    fontSize: 10,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: Colors.textSecondary,
    marginBottom: 10,
  },

  // Timeline
  timelineLoading: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  timeline: {
    paddingLeft: 4,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 4,
  },
  timeCol: {
    width: 64,
    paddingTop: 1,
  },
  timeArrival: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },
  timeDeparture: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  dotCol: {
    width: 12,
    alignItems: 'center',
    paddingTop: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: Colors.bgPrimary,
  },
  dotEnd: {
    backgroundColor: Colors.bgPrimary,
    borderColor: Colors.primary,
  },
  stopBody: {
    flex: 1,
    paddingVertical: 2,
  },
  stopName: {
    fontSize: 14,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  stopDuration: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Travel segment
  travelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 64 + 4,
    paddingVertical: 8,
  },
  travelDottedLine: {
    flex: 1,
    height: 1,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    borderStyle: 'dashed',
  },
  travelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: Colors.bgSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  travelChipText: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
  },

  // End row
  endRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingTop: 4,
    paddingBottom: 4,
  },
  endLabel: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
    letterSpacing: -0.1,
  },

  // Empty state
  emptyHint: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    paddingVertical: 24,
    textAlign: 'center',
  },

  // Lock CTA
  lockBtn: {
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 99,
    backgroundColor: Colors.primary,
  },
  lockBtnDisabled: {
    backgroundColor: Colors.gray200,
  },
  lockBtnText: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
    letterSpacing: -0.1,
  },
  lockBtnTextDisabled: {
    color: Colors.textTertiary,
  },
  lockHint: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
});
