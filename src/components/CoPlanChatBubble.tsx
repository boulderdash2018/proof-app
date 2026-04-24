import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, TouchableOpacity, View, Text, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '../constants';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store';

interface Props {
  /** Conv id of the group chat linked to the draft. Undefined if the draft
   *  was created before we started seeding the conv at draft time — the
   *  bubble will self-hide in that case. */
  conversationId?: string;
  onPress: () => void;
}

/**
 * Floating action button anchored bottom-right of the co-plan workspace.
 * Acts as a shortcut to the live group conversation so participants can
 * keep the planning doc *and* the chat thread in parallel.
 *
 * Polish details :
 *   • Spring scale-in on mount (slight delay so it appears after the
 *     workspace has settled, not at the same instant as the rest)
 *   • Idle pulse loop (2s period, subtle) to signal the bubble is "live"
 *   • Unread dot + count pulled from chatStore for the linked conv
 *   • Haptic impact + tap-scale on press
 */
export const CoPlanChatBubble: React.FC<Props> = ({ conversationId, onPress }) => {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const conversations = useChatStore((s) => s.conversations);

  // Locate the conv + its unread for me.
  const conv = conversations.find((c) => c.id === conversationId);
  const unread = conv && user?.id ? (conv.unreadCount[user.id] || 0) : 0;

  // Animated values
  const entering = useRef(new Animated.Value(0)).current;
  const idle = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  /** "Discuter" label — animates in then stays visible permanently so the
   *  affordance is unmissable. (Earlier iteration peeked then collapsed,
   *  but it made the button too cryptic once the label was gone.) */
  const labelAnim = useRef(new Animated.Value(0)).current;

  // Enter animation
  useEffect(() => {
    if (!conversationId) return;
    Animated.spring(entering, {
      toValue: 1,
      delay: 320,
      friction: 6,
      tension: 90,
      useNativeDriver: true,
    }).start();

    // Label slides out and stays — no auto-collapse.
    Animated.sequence([
      Animated.delay(520),
      Animated.spring(labelAnim, {
        toValue: 1,
        friction: 7,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [conversationId, entering, labelAnim]);

  // Gentle idle pulse loop
  useEffect(() => {
    if (!conversationId) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(idle, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(idle, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(2800),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [conversationId, idle]);

  if (!conversationId) return null;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(press, { toValue: 0.9, duration: 90, useNativeDriver: true }),
      Animated.spring(press, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  const scale = Animated.multiply(
    entering,
    Animated.multiply(
      press,
      idle.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }),
    ),
  );

  const glowOpacity = idle.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.45] });
  const glowScale = idle.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] });

  // Peek label transforms — opacity fades in, slides from the bubble's edge.
  const labelOpacity = labelAnim;
  const labelTranslateX = labelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });
  const labelScale = labelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1],
  });

  return (
    <View
      style={[styles.wrap, { bottom: insets.bottom + 18 }]}
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

      {/* The whole label+bubble is a single tappable area so the press
          target is generous and the label is not just decorative. */}
      <Animated.View style={{ transform: [{ scale }] }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handlePress}
          style={styles.touchRow}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir le chat du groupe"
        >
          <Animated.View
            style={[
              styles.label,
              {
                opacity: labelOpacity,
                transform: [{ translateX: labelTranslateX }, { scale: labelScale }],
              },
            ]}
          >
            <Text style={styles.labelText}>Discuter</Text>
            <View style={styles.labelTail} />
          </Animated.View>

          <View style={styles.button}>
            <Ionicons name="chatbubbles" size={22} color={Colors.textOnAccent} />
            {unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unread > 9 ? '9+' : unread}
                </Text>
              </View>
            )}
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
  // The pressable row containing label + circle.
  touchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // "Discuter" label — sits to the LEFT of the bubble, permanent now.
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
  // Small notch pointing toward the bubble — pure aesthetic.
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
    right: -9, // (BUBBLE_SIZE + 18 - BUBBLE_SIZE) / 2 — centers halo on bubble
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
    // Multi-layered shadow for a premium "lifted" feel — web ignores elevation
    // but uses shadow*, native uses elevation.
    shadowColor: Colors.primaryDeep,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : null),
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: Colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: Fonts.bodyBold,
    color: Colors.primary,
    lineHeight: 12,
  },
});
