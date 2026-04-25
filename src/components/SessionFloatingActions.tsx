import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, TouchableOpacity, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store';

interface Props {
  /** Conv id linked to the session — for the chat shortcut. */
  conversationId?: string;
  /** Tap "Carte" → opens the GroupLiveMapSheet. */
  onOpenMap: () => void;
  /** Tap "Chat" → navigates to the conv screen. */
  onOpenChat: () => void;
  /** Number of friends visible on the map (for the badge label). */
  friendCount: number;
}

/**
 * Stacked vertical FAB cluster anchored bottom-right of the active
 * session screen. Two buttons :
 *   • Carte   → opens GroupLiveMapSheet (live positions of friends)
 *   • Chat    → navigates back to the conversation, with unread badge
 *
 * Direction-to-place is already handled by DoItNow's existing buttons
 * (Google Maps deeplink), so we don't duplicate that here.
 *
 * Spring scale-in on mount, soft idle pulse to signal "live" state.
 */
export const SessionFloatingActions: React.FC<Props> = ({
  conversationId, onOpenMap, onOpenChat, friendCount,
}) => {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const conversations = useChatStore((s) => s.conversations);
  const conv = conversations.find((c) => c.id === conversationId);
  const unread = conv && user?.id ? (conv.unreadCount[user.id] || 0) : 0;

  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(enter, {
      toValue: 1,
      delay: 280,
      friction: 7,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  const opacity = enter;
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          bottom: insets.bottom + 100, // sit above the existing DoItNow bottom CTA
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      {/* MAP BUTTON */}
      <TouchableOpacity
        style={styles.btn}
        onPress={onOpenMap}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Voir la carte du groupe"
      >
        <Ionicons name="map" size={20} color={Colors.textOnAccent} />
        {friendCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{friendCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* CHAT BUTTON */}
      {conversationId && (
        <TouchableOpacity
          style={[styles.btn, styles.btnChat]}
          onPress={onOpenChat}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir la conversation du groupe"
        >
          <Ionicons name="chatbubbles" size={20} color={Colors.textOnAccent} />
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

const BTN_SIZE = 52;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 14,
    gap: 10,
    alignItems: 'flex-end',
    zIndex: 50,
  },
  btn: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primaryDeep,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  btnChat: {
    backgroundColor: Colors.textPrimary,
    shadowColor: '#000',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontFamily: Fonts.bodyBold,
    color: Colors.primary,
    lineHeight: 12,
  },
});
