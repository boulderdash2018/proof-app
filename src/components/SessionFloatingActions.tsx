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
  /** Tap "Le groupe" → opens the GroupLiveMapSheet. */
  onOpenMap: () => void;
  /** Tap "Discussion" → navigates to the conv screen. */
  onOpenChat: () => void;
  /** Number of friends visible on the map (for the badge label). */
  friendCount: number;
  /** When the live-map sheet is open, the "Le groupe" FAB hides
   *  (you're already viewing the group — having a button to open it
   *  again was confusing per user feedback). */
  mapSheetOpen?: boolean;
}

/**
 * Stacked vertical FAB cluster anchored bottom-right of the active
 * session screen. Up to two buttons :
 *   • Le groupe (people-circle) → opens GroupLiveMapSheet — auto-hides
 *     while the sheet is already open so the affordance is unique
 *   • Discussion (chat) → navigates back to the conversation, with
 *     unread badge
 *
 * Direction-to-place is already handled by DoItNow's existing buttons
 * (Google Maps deeplink), so we don't duplicate that here.
 *
 * Each button carries a permanent label to its left so the affordance
 * is unmissable, even on first session.
 */
export const SessionFloatingActions: React.FC<Props> = ({
  conversationId, onOpenMap, onOpenChat, friendCount, mapSheetOpen,
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
      {/* "LE GROUPE" — auto-hides while the map sheet is already open
          (no point in offering a button to open what's already on screen) */}
      {!mapSheetOpen && (
        <TouchableOpacity
          style={styles.row}
          onPress={onOpenMap}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Voir où sont mes amis"
        >
          <View style={styles.label}>
            <Text style={styles.labelText}>Le groupe</Text>
            <View style={styles.labelTail} />
          </View>
          <View style={styles.btn}>
            <Ionicons name="people" size={20} color={Colors.textOnAccent} />
            {friendCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{friendCount}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      )}

      {/* "DISCUSSION" — always visible (works as a way out of the map sheet too) */}
      {conversationId && (
        <TouchableOpacity
          style={styles.row}
          onPress={onOpenChat}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir la conversation du groupe"
        >
          <View style={styles.label}>
            <Text style={styles.labelText}>Discussion</Text>
            <View style={styles.labelTail} />
          </View>
          <View style={[styles.btn, styles.btnChat]}>
            <Ionicons name="chatbubbles" size={20} color={Colors.textOnAccent} />
            {unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </View>
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
  // Row = label tooltip + circular FAB; the whole row is one tap target.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    marginRight: 8,
    paddingHorizontal: 11,
    paddingVertical: 6,
    backgroundColor: Colors.bgSecondary,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  labelText: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: 0.05,
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
