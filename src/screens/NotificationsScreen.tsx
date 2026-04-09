import React, { useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  Animated, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout, Fonts } from '../constants';
import { Avatar, EmptyState } from '../components';
import { useNotifStore, useAuthStore } from '../store';
import { useColors } from '../hooks/useColors';
import { Notification, NotificationType } from '../types';

// ========== HELPERS ==========

const NOTIF_ICONS: Partial<Record<NotificationType, { name: string; color: string }>> = {
  new_like: { name: 'heart', color: '#E85D5D' },
  new_follower: { name: 'person-add', color: '#5B9BB5' },
  new_comment: { name: 'chatbubble', color: '#7BA06E' },
  new_proof_it: { name: 'checkmark-circle', color: '#C9A84C' },
  plan_saved: { name: 'bookmark', color: '#D4845A' },
  plan_recreated: { name: 'copy', color: '#8B7BA0' },
  mention: { name: 'at', color: '#5B9BB5' },
  rank_up: { name: 'trophy', color: '#C9A84C' },
  badge_unlocked: { name: 'ribbon', color: '#C9A84C' },
  xp_milestone: { name: 'flash', color: '#D4845A' },
  plan_trending: { name: 'trending-up', color: '#E85D5D' },
  plan_milestone: { name: 'flag', color: '#C9A84C' },
  first_in_city: { name: 'location', color: '#5B9BB5' },
  friend_posted: { name: 'document-text', color: '#7BA06E' },
  friend_completed: { name: 'checkmark-done', color: '#5B9BB5' },
};

const formatTimeAgo = (dateStr: string): string => {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
};

type GroupKey = 'today' | 'week' | 'earlier';
const groupNotifications = (notifs: Notification[]): { key: GroupKey; label: string; data: Notification[] }[] => {
  const now = Date.now();
  const oneDayAgo = now - 86400000;
  const oneWeekAgo = now - 604800000;

  const today: Notification[] = [];
  const week: Notification[] = [];
  const earlier: Notification[] = [];

  notifs.forEach((n) => {
    const ts = new Date(n.createdAt).getTime();
    if (ts >= oneDayAgo) today.push(n);
    else if (ts >= oneWeekAgo) week.push(n);
    else earlier.push(n);
  });

  const groups: { key: GroupKey; label: string; data: Notification[] }[] = [];
  if (today.length > 0) groups.push({ key: 'today', label: 'TODAY', data: today });
  if (week.length > 0) groups.push({ key: 'week', label: 'THIS WEEK', data: week });
  if (earlier.length > 0) groups.push({ key: 'earlier', label: 'EARLIER', data: earlier });
  return groups;
};

// ========== COMPONENT ==========

export const NotificationsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const C = useColors();
  const user = useAuthStore((s) => s.user);
  const {
    notifications, unreadCount, isLoading, hasMore,
    fetchNotifications, loadMore, markAllRead, markRead, subscribe,
  } = useNotifStore();

  // Fade-out animation for mark all read
  const fadeAnims = useRef<Record<string, Animated.Value>>({}).current;

  useEffect(() => {
    if (user?.id) {
      subscribe(user.id);
      fetchNotifications(user.id);
    }
  }, [user?.id]);

  // Ensure anim values exist for each notification
  notifications.forEach((n) => {
    if (!fadeAnims[n.id]) fadeAnims[n.id] = new Animated.Value(1);
  });

  const handleMarkAllRead = useCallback(() => {
    if (!user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Animate unread dots/bg fading out
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    const anims = unreadIds.map((id) =>
      Animated.timing(fadeAnims[id] || new Animated.Value(1), { toValue: 0, duration: 300, useNativeDriver: true })
    );
    Animated.stagger(30, anims).start(() => {
      markAllRead(user.id);
      // Reset anims
      unreadIds.forEach((id) => { if (fadeAnims[id]) fadeAnims[id].setValue(1); });
    });
  }, [notifications, user]);

  const handlePress = useCallback((notif: Notification) => {
    markRead(notif.id);
    // Navigate to context
    if (notif.type === 'new_follower') {
      navigation.navigate('OtherProfile', { userId: notif.senderId });
    } else if (notif.planId) {
      navigation.navigate('PlanDetail', { planId: notif.planId });
    }
  }, []);

  const handleEndReached = useCallback(() => {
    if (user?.id) loadMore(user.id);
  }, [user?.id]);

  const groups = useMemo(() => groupNotifications(notifications), [notifications]);

  // Flatten into sections for FlatList
  const flatData = useMemo(() => {
    const items: ({ type: 'header'; label: string; key: string } | { type: 'notif'; data: Notification; key: string })[] = [];
    groups.forEach((g) => {
      items.push({ type: 'header', label: g.label, key: `header-${g.key}` });
      g.data.forEach((n) => items.push({ type: 'notif', data: n, key: n.id }));
    });
    return items;
  }, [groups]);

  const renderItem = useCallback(({ item }: { item: typeof flatData[number] }) => {
    if (item.type === 'header') {
      return (
        <Text style={[styles.sectionHeader, { color: C.gray600 }]}>{item.label}</Text>
      );
    }

    const notif = item.data;
    const icon = NOTIF_ICONS[notif.type] || { name: 'notifications', color: C.gray600 };
    const isUnread = !notif.read;
    const fadeAnim = fadeAnims[notif.id] || new Animated.Value(1);

    return (
      <TouchableOpacity
        style={[styles.notifRow, isUnread && { backgroundColor: C.unreadBg || '#2A2118' }]}
        onPress={() => handlePress(notif)}
        activeOpacity={0.7}
      >
        {/* Unread dot */}
        {isUnread && (
          <Animated.View style={[styles.unreadDot, { backgroundColor: C.primary, opacity: fadeAnim }]} />
        )}

        {/* Avatar */}
        {notif.senderInitials ? (
          <Avatar
            initials={notif.senderInitials}
            bg={notif.senderAvatar}
            color={notif.senderAvatarColor}
            size="M"
          />
        ) : (
          <View style={[styles.iconCircle, { backgroundColor: icon.color + '20' }]}>
            <Ionicons name={icon.name as any} size={18} color={icon.color} />
          </View>
        )}

        {/* Content */}
        <View style={styles.notifContent}>
          <Text style={[styles.notifText, { color: C.black }]} numberOfLines={2}>
            <Text style={styles.notifBold}>{notif.senderUsername} </Text>
            {notif.content.replace(notif.senderUsername + ' ', '')}
          </Text>
          <Text style={[styles.notifTime, { color: C.gray600 }]}>{formatTimeAgo(notif.createdAt)}</Text>
        </View>

        {/* Plan cover thumbnail */}
        {notif.planCover && (
          <Image source={{ uri: notif.planCover }} style={styles.planThumb} />
        )}
      </TouchableOpacity>
    );
  }, [C, handlePress]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={C.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: C.black }]}>Notifications</Text>
        <TouchableOpacity onPress={handleMarkAllRead}>
          <Text style={[styles.markAll, { color: C.primary }]}>Mark all as read</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        data={flatData}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.list}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loadingWrap}><ActivityIndicator color={C.primary} /></View>
          ) : (
            <EmptyState icon="🔔" title="Nothing yet" subtitle="Go post a plan and see what happens 👀" />
          )
        }
        ListFooterComponent={
          isLoading && notifications.length > 0 ? (
            <ActivityIndicator color={C.primary} style={{ paddingVertical: 20 }} />
          ) : null
        }
      />
    </View>
  );
};

// ========== STYLES ==========

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPadding, paddingVertical: 12, borderBottomWidth: 1,
  },
  backBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', fontFamily: Fonts.serifBold },
  markAll: { fontSize: 12, fontWeight: '600' },
  list: { paddingBottom: 40 },
  loadingWrap: { paddingTop: 60, alignItems: 'center' },

  // Section header
  sectionHeader: {
    fontSize: 10, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.8, paddingHorizontal: Layout.screenPadding,
    paddingTop: 18, paddingBottom: 8,
  },

  // Notification row
  notifRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Layout.screenPadding, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
    gap: 12,
  },
  unreadDot: {
    position: 'absolute', left: 6, width: 6, height: 6, borderRadius: 3,
  },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  notifContent: { flex: 1 },
  notifText: { fontSize: 13, fontFamily: Fonts.serif, lineHeight: 18 },
  notifBold: { fontFamily: Fonts.serifBold },
  notifTime: { fontSize: 11, marginTop: 3 },
  planThumb: { width: 44, height: 44, borderRadius: 8 },
});
