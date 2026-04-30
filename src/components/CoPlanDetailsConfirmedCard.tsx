import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar } from './Avatar';
import { ChatMessage, ConversationParticipant } from '../services/chatService';
import { Plan } from '../types';
import { fetchPlanById } from '../services/plansService';

interface Props {
  message: ChatMessage;
  participants?: Record<string, ConversationParticipant>;
  /** Linked plan id — the card fetches the full plan to render the
   *  timeline. Card stays in a graceful loading state while fetching. */
  planId?: string | null;
  /** Plan title — used for the eyebrow line "Léo a confirmé X". */
  planTitle?: string | null;
  /** Optional meetup ISO — used to anchor arrival times in the timeline. */
  meetupAt?: string | null;
  /** Open the map directly when tapped. The parent passes a handler that
   *  navigates to PlanDetail with `openMap: true` so the map sheet
   *  auto-opens. Different destination than the pinned plan card (which
   *  opens PlanDetail without the map) so the two widgets stop being
   *  visually + functionally redundant. */
  onPressMap?: () => void;
}

/**
 * Animated chat card surfaced when a participant confirms the workspace
 * details (coplan_details_confirmed system event). Replaces the previous
 * one-line compact event with a richer preview of the journey :
 *
 *   • Eyebrow : "● PLAN PRÊT  · X a confirmé Y"
 *   • Horizontal timeline : numbered terracotta pins for each place,
 *     connected by a line, with travel-time pills between them when
 *     plan.travelSegments is populated. Arrival times under each pin
 *     are computed from meetupAt + cumulative travel + on-site time.
 *   • CTA bar : "Voir le trajet sur la map →" — taps to deep-link to
 *     the map sheet (different destination than the pinned plan card).
 *
 * If the plan has more than 4 places, the timeline shows the first 3
 * + a "+ N étapes" pill so the chat row stays compact.
 *
 * Animation : slide-up + fade-in on mount, soft shimmer on the chevron
 * to invite the tap.
 */
export const CoPlanDetailsConfirmedCard: React.FC<Props> = ({
  message,
  participants,
  planId,
  planTitle,
  meetupAt,
  onPressMap,
}) => {
  const ev = message.systemEvent;
  if (!ev) return null;

  const actorId = ev.actorId || message.senderId;
  const actor = participants?.[actorId];
  const actorName = actor?.displayName?.split(' ')[0] || 'Quelqu’un';

  // ── Plan fetch — the timeline needs places + travelSegments ──
  // We refetch every time planId changes (typically once per card). Plan
  // data is small ; no need for a global cache here.
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(!!planId);
  useEffect(() => {
    if (!planId) {
      setPlan(null);
      setLoadingPlan(false);
      return;
    }
    let cancelled = false;
    setLoadingPlan(true);
    fetchPlanById(planId)
      .then((p) => { if (!cancelled) setPlan(p); })
      .catch((err) => console.warn('[CoPlanDetailsConfirmedCard] fetchPlanById:', err))
      .finally(() => { if (!cancelled) setLoadingPlan(false); });
    return () => { cancelled = true; };
  }, [planId]);

  // ── Slide-up + fade-in on mount ──
  const enterY = useRef(new Animated.Value(14)).current;
  const enterOp = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(enterY, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      Animated.timing(enterOp, { toValue: 1, duration: 360, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Soft shimmer on the CTA arrow — invites the tap ──
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(800),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);
  const shimmerX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0, 4] });

  // ── Build timeline data ────────────────────────────────────────
  // Cap at 3 places visually so the row stays readable in the chat.
  // Extra places get a "+ N étapes" indicator at the end.
  const places = plan?.places ?? [];
  const visiblePlaces = places.slice(0, 3);
  const remainingCount = Math.max(0, places.length - visiblePlaces.length);

  // Compute arrival times if we have a meetupAt anchor. Travel time
  // sourced from plan.travelSegments (minutes). On-site duration from
  // place.estimatedDurationMin (default 60min when missing). If we
  // can't anchor (no meetupAt), we still render the pins + names but
  // skip the time row.
  const arrivalTimes = computeArrivalTimes(places, plan?.travelSegments, meetupAt);

  // Travel-time pills between pin i and pin i+1 — reads from
  // travelSegments. Falls back to null if not populated, in which
  // case we just render the connecting line without a pill.
  const segmentDurationsMin = computeSegmentDurations(places, plan?.travelSegments);

  return (
    <Animated.View
      style={[
        styles.wrap,
        { opacity: enterOp, transform: [{ translateY: enterY }] },
      ]}
    >
      <TouchableOpacity
        style={styles.card}
        activeOpacity={onPressMap ? 0.9 : 1}
        onPress={onPressMap}
        disabled={!onPressMap}
      >
        {/* ── Header — actor + eyebrow + plan title ── */}
        <View style={styles.header}>
          {actor ? (
            <Avatar
              initials={actor.initials}
              bg={actor.avatarBg}
              color={actor.avatarColor}
              size="S"
              avatarUrl={actor.avatarUrl ?? undefined}
            />
          ) : (
            <View style={styles.actorFallback} />
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.eyebrowRow}>
              <View style={styles.eyebrowDot} />
              <Text style={styles.eyebrow}>PLAN PRÊT</Text>
            </View>
            <Text style={styles.verb} numberOfLines={1}>
              {actorName} a confirmé{planTitle ? ' ' : ' la journée'}
              {planTitle ? <Text style={styles.title}>{planTitle}</Text> : null}
            </Text>
          </View>
        </View>

        {/* ── Timeline ── */}
        {loadingPlan ? (
          <View style={styles.loadingTimeline}>
            <ActivityIndicator size="small" color={Colors.primary} />
          </View>
        ) : visiblePlaces.length > 0 ? (
          <View style={styles.timelineRow}>
            {visiblePlaces.map((p, i) => {
              const isLast = i === visiblePlaces.length - 1 && remainingCount === 0;
              const segDur = segmentDurationsMin[i];
              return (
                <React.Fragment key={p.id || i}>
                  <PinColumn
                    index={i + 1}
                    name={p.name}
                    time={arrivalTimes[i] ?? null}
                  />
                  {!isLast && (
                    <SegmentConnector
                      durationMin={segDur}
                      // Show "+ N" pill on the last visible connector when
                      // there are hidden places — keeps the count visible.
                      moreCount={
                        i === visiblePlaces.length - 1 && remainingCount > 0
                          ? remainingCount
                          : 0
                      }
                    />
                  )}
                </React.Fragment>
              );
            })}
          </View>
        ) : null}

        {/* ── CTA bar — "Voir le trajet sur la map" ── */}
        {onPressMap && (
          <View style={styles.ctaBar}>
            <Ionicons name="map-outline" size={14} color={Colors.primary} />
            <Text style={styles.ctaText}>Voir le trajet sur la map</Text>
            <Animated.View style={{ transform: [{ translateX: shimmerX }] }}>
              <Ionicons name="arrow-forward" size={14} color={Colors.primary} />
            </Animated.View>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

// ══════════════════════════════════════════════════════════════
// Sub-components
// ══════════════════════════════════════════════════════════════

const PinColumn: React.FC<{ index: number; name: string; time: string | null }> = ({
  index, name, time,
}) => (
  <View style={styles.pinCol}>
    <View style={styles.pin}>
      <Text style={styles.pinNum}>{index}</Text>
    </View>
    <Text style={styles.pinName} numberOfLines={1}>{name}</Text>
    {time ? <Text style={styles.pinTime}>{time}</Text> : null}
  </View>
);

const SegmentConnector: React.FC<{ durationMin: number | null; moreCount: number }> = ({
  durationMin, moreCount,
}) => (
  <View style={styles.segment}>
    <View style={styles.segmentLine} />
    {moreCount > 0 ? (
      <View style={styles.segmentPillMore}>
        <Text style={styles.segmentPillMoreText}>+ {moreCount}</Text>
      </View>
    ) : durationMin != null && durationMin > 0 ? (
      <View style={styles.segmentPill}>
        <Ionicons name="walk-outline" size={10} color={Colors.primary} />
        <Text style={styles.segmentPillText}>{formatDurationShort(durationMin)}</Text>
      </View>
    ) : null}
    <View style={styles.segmentLine} />
  </View>
);

// ══════════════════════════════════════════════════════════════
// Helpers — timeline math
// ══════════════════════════════════════════════════════════════

/** Format minutes to a chat-tight label : "12 min" / "1h05". */
function formatDurationShort(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
}

/** Format a Date (or ISO) to "12h00" — minutes only when ≠ 0. */
function formatTimeLabel(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  if (m === 0) return `${h}h`;
  return `${h}h${m.toString().padStart(2, '0')}`;
}

/**
 * Compute arrival times at each place from a meetupAt anchor + cumulative
 * travel + on-site durations. Returns null entries when we can't anchor.
 */
function computeArrivalTimes(
  places: Array<{ id: string; estimatedDurationMin?: number }>,
  travelSegments: Array<{ fromPlaceId: string; toPlaceId: string; duration: number }> | undefined,
  meetupAtISO: string | null | undefined,
): Array<string | null> {
  if (!meetupAtISO) return places.map(() => null);
  const startMs = new Date(meetupAtISO).getTime();
  if (!Number.isFinite(startMs)) return places.map(() => null);

  const out: Array<string | null> = [];
  let cursorMs = startMs;
  for (let i = 0; i < places.length; i++) {
    if (i === 0) {
      out.push(formatTimeLabel(new Date(cursorMs)));
      // After the first place : add its on-site duration before next
      cursorMs += (places[i].estimatedDurationMin ?? 60) * 60 * 1000;
      continue;
    }
    // Add travel from previous place
    const seg = travelSegments?.find(
      (s) => s.fromPlaceId === places[i - 1].id && s.toPlaceId === places[i].id,
    ) || (travelSegments && travelSegments[i - 1]);
    if (seg && seg.duration > 0) cursorMs += seg.duration * 60 * 1000;
    out.push(formatTimeLabel(new Date(cursorMs)));
    cursorMs += (places[i].estimatedDurationMin ?? 60) * 60 * 1000;
  }
  return out;
}

/**
 * Pull segment durations (in min) between consecutive places. Returns
 * an array aligned with `places` where index i = duration to go FROM
 * place[i] TO place[i+1] (last entry is null/0). Falls back to
 * null when travelSegments aren't populated — UI then renders the
 * connector without a pill.
 */
function computeSegmentDurations(
  places: Array<{ id: string }>,
  travelSegments: Array<{ fromPlaceId: string; toPlaceId: string; duration: number }> | undefined,
): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = 0; i < places.length - 1; i++) {
    const seg = travelSegments?.find(
      (s) => s.fromPlaceId === places[i].id && s.toPlaceId === places[i + 1].id,
    ) || (travelSegments && travelSegments[i]);
    out.push(seg?.duration ?? null);
  }
  return out;
}

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  card: {
    backgroundColor: Colors.bgSecondary,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 0,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.terracotta100,
    overflow: 'hidden',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  actorFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  eyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  eyebrow: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.primary,
  },
  verb: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    letterSpacing: -0.05,
  },
  title: {
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },

  // Timeline
  loadingTimeline: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 4,
    paddingBottom: 14,
  },
  pinCol: {
    alignItems: 'center',
    minWidth: 52,
    maxWidth: 110,
    paddingHorizontal: 2,
  },
  pin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinNum: {
    fontSize: 12,
    fontFamily: Fonts.bodyBold,
    color: Colors.textOnAccent,
    letterSpacing: -0.1,
  },
  pinName: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
    textAlign: 'center',
  },
  pinTime: {
    marginTop: 1,
    fontSize: 10.5,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    color: Colors.textTertiary,
    letterSpacing: 0.05,
  },

  // Segment connector (the line + travel pill between two pins)
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    minWidth: 30,
  },
  segmentLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.terracotta200,
  },
  segmentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 99,
    backgroundColor: Colors.terracotta50,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.terracotta200,
    marginHorizontal: 4,
  },
  segmentPillText: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
    letterSpacing: 0.05,
  },
  segmentPillMore: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 99,
    backgroundColor: Colors.primary,
    marginHorizontal: 4,
  },
  segmentPillMoreText: {
    fontSize: 10,
    fontFamily: Fonts.bodyBold,
    color: Colors.textOnAccent,
    letterSpacing: 0.1,
  },

  // CTA bar at the bottom
  ctaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginHorizontal: -14, // reach the card's edges
    backgroundColor: Colors.terracotta50,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.terracotta100,
  },
  ctaText: {
    fontSize: 12.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
    letterSpacing: -0.05,
  },
});
