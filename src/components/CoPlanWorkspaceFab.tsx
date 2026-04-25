import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../constants';

interface Props {
  /** Tap handler — typically navigates to the workspace screen. */
  onPress: () => void;
  /** Hide entirely when the conv has no associated draft. */
  visible: boolean;
}

/**
 * "Modifier le plan" floating action button — anchored bottom-right of the
 * conversation screen. Construction icon (🛠) signals "go edit the plan
 * doc", which is the workspace.
 *
 * Design rationale (from product feedback) : the conv is the home of a
 * co-plan group; the workspace is an atelier you visit to modify, then
 * come back. The FAB makes that asymmetry explicit — there's a clear
 * "go modify" affordance in the conv, and a back chevron in the workspace.
 *
 * Interactions :
 *   • Spring scale-in on mount (delay 280ms so it appears after the conv
 *     has settled).
 *   • Permanent label "Modifier le plan" sits to the LEFT of the icon.
 *     Whole label+icon area is one tappable target.
 *   • Soft idle pulse (1.6s × 2 + 3.2s pause) — subtle "alive" cue.
 *   • Tap-bounce + haptic on press.
 */
export const CoPlanWorkspaceFab: React.FC<Props> = ({ onPress, visible }) => {
  const insets = useSafeAreaInsets();

  const entering = useRef(new Animated.Value(0)).current;
  const idle = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;

  // Enter animation — runs once when the FAB becomes visible.
  useEffect(() => {
    if (!visible) return;
    Animated.spring(entering, {
      toValue: 1,
      delay: 280,
      friction: 6,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [visible, entering]);

  // Gentle idle pulse loop — only runs while visible to save cycles.
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(idle, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(idle, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(3200),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, idle]);

  if (!visible) return null;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(press, { toValue: 0.92, duration: 90, useNativeDriver: true }),
      Animated.spring(press, { toValue: 1, friction: 4, tension: 180, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  // Composite scale = enter * press * idle micro-pulse.
  const scale = Animated.multiply(
    entering,
    Animated.multiply(
      press,
      idle.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }),
    ),
  );

  const glowOpacity = idle.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.42] });
  const glowScale = idle.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });

  return (
    <View
      style={[styles.wrap, { bottom: insets.bottom + 84 }]}
      pointerEvents="box-none"
    >
      {/* Glow ring — subtle terracotta halo that breathes with the idle pulse */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          {
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
      />

      <Animated.View style={{ transform: [{ scale }] }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handlePress}
          style={styles.touchRow}
          accessibilityRole="button"
          accessibilityLabel="Modifier le plan dans l'atelier"
        >
          <View style={styles.label}>
            <Text style={styles.labelText}>Modifier le plan</Text>
            <View style={styles.labelTail} />
          </View>

          <View style={styles.button}>
            <Ionicons name="construct" size={22} color={Colors.textOnAccent} />
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const BUBBLE_SIZE = 54;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 18,
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 50,
  },
  touchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    marginRight: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: Colors.bgSecondary,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  labelText: {
    fontSize: 12.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: 0.1,
  },
  labelTail: {
    position: 'absolute',
    right: -4,
    top: '50%',
    marginTop: -4,
    width: 8,
    height: 8,
    transform: [{ rotate: '45deg' }],
    backgroundColor: Colors.bgSecondary,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  glow: {
    position: 'absolute',
    right: -9,
    top: -9,
    width: BUBBLE_SIZE + 18,
    height: BUBBLE_SIZE + 18,
    borderRadius: (BUBBLE_SIZE + 18) / 2,
    backgroundColor: Colors.primary,
  },
  button: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primaryDeep,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : null),
  },
});
