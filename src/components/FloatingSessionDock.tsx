import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Pressable, View, Text, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar } from './Avatar';

export interface DockParticipant {
  userId: string;
  displayName: string;
  initials: string;
  avatarUrl?: string | null;
  avatarBg: string;
  avatarColor: string;
}

interface Props {
  /** Tap handler — typically navigate to DoItNow with the session params. */
  onPress: () => void;
  /** Other participants currently joined to the session (excluding self).
   *  Drives the social label "Léa et Marc sont en route". */
  others: DockParticipant[];
  /** Force-hide (e.g. when the message input is focused — no CTA noise
   *  while the user is typing). The component animates out cleanly. */
  hidden?: boolean;
  /** Bottom offset in px from the input bar — caller usually passes
   *  `insets.bottom + inputBarHeight`. */
  bottom?: number;
}

/**
 * Floating action dock anchored just above the message input bar of a
 * co-plan group conv when a session is active. Replaces the previous
 * sticky terracotta CTA (which competed with the pinned plan card)
 * and the inline "Rejoindre la session" button (which scrolled out
 * of view).
 *
 * Why this shape :
 *   • Lives near the thumb — fast, ergonomic
 *   • Carries social pressure ("Léa et Marc sont en route") instead
 *     of a passive label — turns the affordance into a nudge
 *   • Pulse dot + soft slide-in on appear, slide-out when hidden
 *
 * Auto-hides when the input is focused so the user can type without
 * a permanent terracotta layer in their peripheral vision.
 */
export const FloatingSessionDock: React.FC<Props> = ({
  onPress, others, hidden, bottom = 70,
}) => {
  // ── Entry / exit animation ──
  // Single Animated value drives both opacity + translateY ; spring on
  // entry, fast ease on exit so the dock doesn't stutter while typing.
  const reveal = useRef(new Animated.Value(hidden ? 0 : 1)).current;
  useEffect(() => {
    if (hidden) {
      Animated.timing(reveal, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(reveal, {
        toValue: 1,
        friction: 7,
        tension: 80,
        useNativeDriver: true,
      }).start();
    }
  }, [hidden, reveal]);

  // Subtle pulse on the live dot — signals "session is happening NOW".
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (hidden) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [hidden, pulse]);

  const opacity = reveal;
  const translateY = reveal.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] });

  // Social presence label.
  const presenceLabel = (() => {
    if (others.length === 0) return null;
    if (others.length === 1) return `${first(others[0])} est en route`;
    if (others.length === 2) return `${first(others[0])} et ${first(others[1])} sont en route`;
    return `${first(others[0])} et ${others.length - 1} autres sont en route`;
  })();

  const visibleAvs = others.slice(0, 3);

  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      style={[styles.wrap, { bottom, opacity, transform: [{ translateY }] }]}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.dock, pressed && styles.dockPressed]}
        accessibilityRole="button"
        accessibilityLabel={`Rejoindre la session${presenceLabel ? ` — ${presenceLabel}` : ''}`}
      >
        {/* Live dot — pulses to signal "active right now" */}
        <Animated.View
          style={[
            styles.pulseDot,
            { opacity: pulseOpacity, transform: [{ scale: pulseScale }] },
          ]}
        />

        {/* Stacked avatars — 3 max, overlapped, terracotta border */}
        {visibleAvs.length > 0 && (
          <View style={styles.avStack}>
            {visibleAvs.map((p, i) => (
              <View
                key={p.userId}
                style={[
                  styles.avSlot,
                  { marginLeft: i === 0 ? 0 : -6, zIndex: visibleAvs.length - i },
                ]}
              >
                <Avatar
                  initials={p.initials}
                  bg={p.avatarBg}
                  color={p.avatarColor}
                  size="XS"
                  avatarUrl={p.avatarUrl ?? undefined}
                />
              </View>
            ))}
          </View>
        )}

        <View style={styles.label}>
          <Text style={styles.title}>Rejoindre la session</Text>
          {presenceLabel && (
            <Text style={styles.sub} numberOfLines={1}>
              {presenceLabel}
            </Text>
          )}
        </View>

        <Ionicons name="arrow-forward" size={15} color={Colors.textOnAccent} />
      </Pressable>
    </Animated.View>
  );
};

function first(p: DockParticipant): string {
  return (p.displayName || '').split(' ')[0] || 'Quelqu\'un';
}

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 40,
  },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 8,
  },
  dockPressed: {
    backgroundColor: Colors.primaryDeep,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.textOnAccent,
  },
  avStack: {
    flexDirection: 'row',
  },
  avSlot: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: 99,
  },
  label: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
    letterSpacing: -0.1,
  },
  sub: {
    fontSize: 11,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textOnAccent,
    opacity: 0.85,
    marginTop: 2,
    letterSpacing: 0.05,
  },
});
