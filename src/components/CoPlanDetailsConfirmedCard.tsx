import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar } from './Avatar';
import { ChatMessage, ConversationParticipant } from '../services/chatService';

interface Props {
  message: ChatMessage;
  participants?: Record<string, ConversationParticipant>;
  /** Number of places in the linked plan — drives the "N étapes" label. */
  placesCount?: number;
  /** Cover image of the linked plan, used as the card background. */
  coverPhoto?: string | null;
  /** Plan title — bolded under the eyebrow. */
  planTitle?: string;
  /** Optional date — when the journey is scheduled. */
  meetupAt?: string | null;
  /** Tapping the card → navigate to plan detail. */
  onPress?: () => void;
}

/**
 * Animated chat card surfaced when a participant confirms the workspace
 * details (coplan_details_confirmed system event). Replaces the previous
 * one-line compact event with a richer preview so the moment "the plan
 * is ready" is unmissable in the conversation.
 *
 * Animation : slide-up + fade-in on mount, soft shimmer pulse on the
 * chevron to invite tapping. Stays on the cream DA — no flashy colors,
 * just a subtle terracotta border and a "PLAN PRÊT" terracotta eyebrow.
 *
 * The card is intentionally COMPACT (~80–100px tall) so it doesn't
 * dominate the chat. Tapping it opens the full plan detail.
 */
export const CoPlanDetailsConfirmedCard: React.FC<Props> = ({
  message,
  participants,
  placesCount,
  coverPhoto,
  planTitle,
  meetupAt,
  onPress,
}) => {
  const ev = message.systemEvent;
  if (!ev) return null;

  const actorId = ev.actorId || message.senderId;
  const actor = participants?.[actorId];
  const actorName = actor?.displayName?.split(' ')[0] || 'Quelqu’un';

  // The payload from postCoPlanMirror is a compact summary string
  // ("Paris · 3 mai · 12h · 3 lieux"). We use it as a fallback subline
  // when meetupAt isn't passed in by the parent.
  const summary = ev.payload || '';

  // ── Slide-up + fade-in on mount ──
  const enterY = useRef(new Animated.Value(14)).current;
  const enterOp = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(enterY, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      Animated.timing(enterOp, { toValue: 1, duration: 360, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Soft shimmer on the chevron arrow — invites the tap ──
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
  const shimmerOp = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });

  const verb = `${actorName} a confirmé la journée`;

  // Subline : place count + meetupAt or fallback summary.
  const sublineParts: string[] = [];
  if (typeof placesCount === 'number' && placesCount > 0) {
    sublineParts.push(`${placesCount} étape${placesCount > 1 ? 's' : ''}`);
  }
  if (meetupAt) {
    try {
      const d = new Date(meetupAt);
      const dateLabel = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      const timeLabel = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      sublineParts.push(`${dateLabel} · ${timeLabel}`);
    } catch {
      // ignore — fallback to summary below
    }
  }
  const subline = sublineParts.length > 0 ? sublineParts.join(' · ') : summary;

  return (
    <Animated.View
      style={[
        styles.wrap,
        { opacity: enterOp, transform: [{ translateY: enterY }] },
      ]}
    >
      <TouchableOpacity
        style={styles.card}
        activeOpacity={onPress ? 0.85 : 1}
        onPress={onPress}
        disabled={!onPress}
      >
        {/* ── Left actor avatar ── */}
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

        {/* ── Body ── */}
        <View style={styles.body}>
          <View style={styles.eyebrowRow}>
            <View style={styles.eyebrowDot} />
            <Text style={styles.eyebrow}>PLAN PRÊT</Text>
          </View>
          <Text style={styles.verb} numberOfLines={1}>{verb}</Text>
          {planTitle ? (
            <Text style={styles.title} numberOfLines={1}>{planTitle}</Text>
          ) : null}
          {subline ? (
            <Text style={styles.subline} numberOfLines={1}>{subline}</Text>
          ) : null}
        </View>

        {/* ── Right chevron — pulses to invite the tap ── */}
        {onPress && (
          <Animated.View
            style={{ transform: [{ translateX: shimmerX }], opacity: shimmerOp }}
          >
            <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
          </Animated.View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.bgSecondary,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.terracotta100,
  },
  actorFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
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
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  title: {
    fontSize: 14,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    marginTop: 2,
  },
  subline: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
    letterSpacing: -0.05,
  },
});
