import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, Text, TouchableOpacity, Platform, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';

const TRACK_PAD = 4;

export type CoPlanLens = 'plan' | 'chat';

interface Props {
  active: CoPlanLens;
  onChange: (next: CoPlanLens) => void;
  /** Unread message count on the chat side — shown as a small dot/number. */
  unreadCount?: number;
  /** Pulse signal on the plan side — set true when there's recent activity
   *  (e.g. someone just added a place) so the tab subtly invites attention. */
  planHasNewActivity?: boolean;
}

/**
 * Lens switcher — the **single, unmissable** affordance to toggle between
 * the two facets of the same co-plan: the editable workspace ("Plan") and
 * the group chat ("Discussion").
 *
 * Mounted at the top of BOTH screens (CoPlanWorkspaceScreen and the
 * ConversationScreen for co-plan groups). Tap the inactive tab → navigate
 * to the other screen. Same gesture from anywhere — no hidden bubble, no
 * scrolling required to see it.
 *
 * Design choices:
 *   • Pill-in-pill: terracotta-tinted track holds two segments; the active
 *     segment glides under the pressed tab (animated indicator) so the
 *     transition feels mechanical/predictable instead of "pop".
 *   • Unread badge on chat side, soft pulse dot on plan side — at a glance,
 *     you know which lens has news.
 *   • Equal-width segments via flex:1 so the indicator math is trivial
 *     (translateX between 0 and 50%).
 */
export const CoPlanLensSwitcher: React.FC<Props> = ({
  active,
  onChange,
  unreadCount = 0,
  planHasNewActivity = false,
}) => {
  // Track width is measured on layout so the indicator can be a precise
  // fixed pixel width (no percentage math that overlaps the padding).
  const [trackWidth, setTrackWidth] = useState(0);
  const indicatorWidth = trackWidth > 0 ? (trackWidth - TRACK_PAD * 2) / 2 : 0;

  const indicator = useRef(new Animated.Value(active === 'plan' ? 0 : 1)).current;
  const planPulse = useRef(new Animated.Value(0)).current;

  // Animate indicator on active change.
  useEffect(() => {
    Animated.timing(indicator, {
      toValue: active === 'plan' ? 0 : 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      // Animating translateX via JS driver (Animated cannot do native-driver
      // with measured layout values reliably across RN-Web + native).
      useNativeDriver: false,
    }).start();
  }, [active, indicator]);

  const handleTrackLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - trackWidth) > 0.5) setTrackWidth(w);
  };

  // Subtle infinite pulse on the plan side when there's recent activity.
  useEffect(() => {
    if (!planHasNewActivity) {
      planPulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(planPulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(planPulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [planHasNewActivity, planPulse]);

  // Indicator slides from x=0 (under the plan tab) to x=indicatorWidth
  // (under the chat tab), in pixels.
  const indicatorTranslateX = indicator.interpolate({
    inputRange: [0, 1],
    outputRange: [0, indicatorWidth],
  });

  const planActive = active === 'plan';
  const chatActive = active === 'chat';

  const planDotScale = planPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.4],
  });
  const planDotOpacity = planPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.7, 1],
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.track} onLayout={handleTrackLayout}>
        {/* Animated indicator — sits BEHIND the segments so the active
            label sits on terracotta, the inactive on the cream track.
            Hidden until we know the track width to avoid a 1-frame flash
            at width 0. */}
        {indicatorWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              {
                width: indicatorWidth,
                transform: [{ translateX: indicatorTranslateX }],
              },
            ]}
          />
        )}

        {/* PLAN segment */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => onChange('plan')}
          style={styles.segment}
          accessibilityRole="tab"
          accessibilityState={{ selected: planActive }}
          accessibilityLabel="Voir le brouillon de plan"
        >
          <Ionicons
            name="construct"
            size={14}
            color={planActive ? Colors.textOnAccent : Colors.primary}
          />
          <Text style={[styles.segmentText, planActive ? styles.segmentTextActive : styles.segmentTextInactive]}>
            Plan
          </Text>
          {planHasNewActivity && !planActive && (
            <Animated.View
              style={[
                styles.pulseDot,
                {
                  opacity: planDotOpacity,
                  transform: [{ scale: planDotScale }],
                },
              ]}
            />
          )}
        </TouchableOpacity>

        {/* CHAT segment */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => onChange('chat')}
          style={styles.segment}
          accessibilityRole="tab"
          accessibilityState={{ selected: chatActive }}
          accessibilityLabel="Voir la discussion du groupe"
        >
          <Ionicons
            name="chatbubbles"
            size={14}
            color={chatActive ? Colors.textOnAccent : Colors.primary}
          />
          <Text style={[styles.segmentText, chatActive ? styles.segmentTextActive : styles.segmentTextInactive]}>
            Discussion
          </Text>
          {unreadCount > 0 && !chatActive && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: Colors.bgSecondary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSubtle,
  },
  track: {
    flexDirection: 'row',
    backgroundColor: Colors.terracotta50,
    borderRadius: 12,
    padding: TRACK_PAD,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.terracotta200,
  },
  // Indicator slides under the active segment. Width is computed from
  // the track's measured width so each segment is exactly half (no
  // percentage overlap with padding). Slides via translateX in pixels.
  indicator: {
    position: 'absolute',
    top: TRACK_PAD,
    left: TRACK_PAD,
    bottom: TRACK_PAD,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primaryDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 2,
    ...(Platform.OS === 'web' ? ({ willChange: 'transform' } as any) : null),
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 9,
    // Sit ABOVE the indicator (indicator is positioned absolute under).
    zIndex: 1,
  },
  segmentText: {
    fontSize: 13.5,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: -0.1,
  },
  segmentTextActive: {
    color: Colors.textOnAccent,
  },
  segmentTextInactive: {
    color: Colors.primary,
  },
  // Soft attention dot on the plan side — pulses when there's recent
  // activity from another participant.
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.primary,
    marginLeft: 2,
  },
  // Hard count badge on the chat side — same as conversations list.
  unreadBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  unreadBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.bodyBold,
    color: Colors.textOnAccent,
    lineHeight: 12,
  },
});
