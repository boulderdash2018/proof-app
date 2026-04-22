import React, { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  Animated, ActivityIndicator, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout, Fonts } from '../constants';
import { Avatar, EmptyState } from '../components';
import { useNotifStore, useAuthStore, useFriendsStore } from '../store';
import { useColors } from '../hooks/useColors';
import { Notification, NotificationType, Plan } from '../types';
import { getUserById, isFollowingUser } from '../services/friendsService';
import {
  findUserTrendingPlan,
  countAuthorActivity24h,
  type PlanTrendStats,
} from '../services/trendingService';

// ====================================================================
//  HELPERS — time formatting, classification, grouping
// ====================================================================

const formatTimeAgo = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `il y a ${days} j`;
  const weeks = Math.floor(days / 7);
  return `il y a ${weeks} sem`;
};

const formatDateHeadline = (d: Date): string => {
  // « Mardi 21 avril »
  const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const day = days[d.getDay()];
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} ${d.getDate()} ${months[d.getMonth()]}`.toUpperCase();
};

// Achievement notifs collapse into a single weekly card.
const ACHIEVEMENT_TYPES: ReadonlySet<NotificationType> = new Set([
  'rank_up',
  'badge_unlocked',
  'xp_milestone',
  'plan_milestone',
  'first_in_city',
]);

const ACHIEVEMENT_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  rank_up: { icon: 'trophy-outline', label: 'Nouveau rang' },
  badge_unlocked: { icon: 'ribbon-outline', label: 'Badge débloqué' },
  xp_milestone: { icon: 'flash-outline', label: 'Palier XP' },
  plan_milestone: { icon: 'flag-outline', label: 'Cap franchi' },
  first_in_city: { icon: 'location-outline', label: 'Premier sur la ville' },
};

type RowKind = 'social' | 'mention' | 'follow' | 'validation';
const classifyRow = (type: NotificationType): RowKind => {
  if (type === 'new_follower') return 'follow';
  if (type === 'new_proof_it' || type === 'plan_recreated' || type === 'friend_completed') return 'validation';
  if (type === 'mention') return 'mention';
  return 'social';
};

type GroupKey = 'today' | 'week' | 'earlier';
interface NotifGroup {
  key: GroupKey;
  label: string;
  rows: Notification[];
  achievements: Notification[];
}

const groupByBucket = (notifs: Notification[]): NotifGroup[] => {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const oneWeek = 7 * oneDay;

  const buckets: Record<GroupKey, NotifGroup> = {
    today: { key: 'today', label: "AUJOURD'HUI", rows: [], achievements: [] },
    week: { key: 'week', label: 'CETTE SEMAINE', rows: [], achievements: [] },
    earlier: { key: 'earlier', label: 'PLUS TÔT', rows: [], achievements: [] },
  };

  for (const n of notifs) {
    const age = now - new Date(n.createdAt).getTime();
    const bucket = age < oneDay ? buckets.today : age < oneWeek ? buckets.week : buckets.earlier;
    if (ACHIEVEMENT_TYPES.has(n.type)) bucket.achievements.push(n);
    else bucket.rows.push(n);
  }

  return Object.values(buckets).filter((b) => b.rows.length + b.achievements.length > 0);
};

// ====================================================================
//  FLAT LIST ITEM TYPES
// ====================================================================

type Item =
  | { kind: 'date'; key: string; date: Date; activity24h: number; mutationsLabel: string }
  | { kind: 'hero'; key: string; plan: Plan; stats: PlanTrendStats }
  | { kind: 'sectionLabel'; key: string; label: string; count: number }
  | { kind: 'achievementsCard'; key: string; group: GroupKey; items: Notification[] }
  | { kind: 'row'; key: string; notif: Notification }
  | { kind: 'footer'; key: string };

// ====================================================================
//  COMPONENT
// ====================================================================

export const NotificationsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const C = useColors();
  const user = useAuthStore((s) => s.user);
  const {
    notifications, isLoading,
    fetchNotifications, loadMore, markAllRead, markRead, subscribe,
  } = useNotifStore();
  const follow = useFriendsStore((s) => s.follow);

  // Trending hero data
  const [trending, setTrending] = useState<{ plan: Plan; stats: PlanTrendStats } | null>(null);
  const [activity24h, setActivity24h] = useState<number>(0);

  // Subscribe to live notifications
  useEffect(() => {
    if (!user?.id) return;
    subscribe(user.id);
    fetchNotifications(user.id);
  }, [user?.id]);

  // Compute trending + activity counts (refresh whenever notifications change,
  // since a new notif likely means the underlying plan stats changed too)
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    findUserTrendingPlan(user.id).then((t) => { if (!cancelled) setTrending(t); });
    countAuthorActivity24h(user.id).then((c) => { if (!cancelled) setActivity24h(c); });
    return () => { cancelled = true; };
  }, [user?.id, notifications.length]);

  // Follow-back tracking for new_follower rows
  const [followStatus, setFollowStatus] = useState<Record<string, 'loading' | 'following' | 'not_following'>>({});
  const checkedFollowRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) return;
    const followerNotifs = notifications.filter((n) => n.type === 'new_follower' && n.senderId);
    const toCheck = followerNotifs.filter((n) => !checkedFollowRef.current.has(n.senderId));
    if (toCheck.length === 0) return;
    toCheck.forEach((n) => checkedFollowRef.current.add(n.senderId));
    setFollowStatus((prev) => {
      const next = { ...prev };
      toCheck.forEach((n) => { if (!next[n.senderId]) next[n.senderId] = 'loading'; });
      return next;
    });
    Promise.all(
      toCheck.map(async (n) => {
        try {
          const following = await isFollowingUser(user.id, n.senderId);
          return { id: n.senderId, status: following ? 'following' : 'not_following' } as const;
        } catch {
          return { id: n.senderId, status: 'not_following' } as const;
        }
      }),
    ).then((results) => {
      setFollowStatus((prev) => {
        const next = { ...prev };
        results.forEach((r) => { next[r.id] = r.status; });
        return next;
      });
    });
  }, [notifications, user?.id]);

  const handleFollowBack = useCallback(async (senderId: string) => {
    if (!user?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFollowStatus((prev) => ({ ...prev, [senderId]: 'loading' }));
    try {
      await follow(user.id, senderId);
      setFollowStatus((prev) => ({ ...prev, [senderId]: 'following' }));
    } catch {
      setFollowStatus((prev) => ({ ...prev, [senderId]: 'not_following' }));
    }
  }, [user?.id, follow]);

  // Live avatar URLs (Firestore lookups for senders we haven't cached)
  const [senderAvatars, setSenderAvatars] = useState<Record<string, string | null>>({});
  const fetchedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const ids = [...new Set(notifications.map((n) => n.senderId))].filter(
      (id) => id && !fetchedIdsRef.current.has(id),
    );
    if (ids.length === 0) return;
    ids.forEach((id) => fetchedIdsRef.current.add(id));
    Promise.all(
      ids.map(async (id) => {
        try {
          const u = await getUserById(id);
          return { id, url: u?.avatarUrl || null };
        } catch {
          return { id, url: null };
        }
      }),
    ).then((results) => {
      setSenderAvatars((prev) => {
        const next = { ...prev };
        results.forEach((r) => { next[r.id] = r.url; });
        return next;
      });
    });
  }, [notifications]);

  // ── Mark all read with subtle fade ──
  const fadeAnims = useRef<Record<string, Animated.Value>>({}).current;
  notifications.forEach((n) => { if (!fadeAnims[n.id]) fadeAnims[n.id] = new Animated.Value(1); });

  const handleMarkAllRead = useCallback(() => {
    if (!user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    const anims = unreadIds.map((id) =>
      Animated.timing(fadeAnims[id] || new Animated.Value(1), { toValue: 0, duration: 240, useNativeDriver: true }),
    );
    Animated.stagger(20, anims).start(() => {
      markAllRead(user.id);
      unreadIds.forEach((id) => { if (fadeAnims[id]) fadeAnims[id].setValue(1); });
    });
  }, [notifications, user]);

  const handlePress = useCallback((notif: Notification) => {
    markRead(notif.id);
    if (notif.planId) navigation.navigate('PlanDetail', { planId: notif.planId });
    else if (notif.type === 'new_follower') navigation.navigate('OtherProfile', { userId: notif.senderId });
  }, [markRead, navigation]);

  // ── Build flat data for the FlatList ──
  const flatData = useMemo<Item[]>(() => {
    const items: Item[] = [];
    const today = new Date();
    const mutationsLabel =
      activity24h === 0 ? 'Calme aujourd\u2019hui' : activity24h === 1 ? '1 mouvement aujourd\u2019hui' : `${activity24h} mouvements aujourd\u2019hui`;
    items.push({ kind: 'date', key: 'date', date: today, activity24h, mutationsLabel });

    if (trending) {
      items.push({ kind: 'hero', key: 'hero', plan: trending.plan, stats: trending.stats });
    }

    const groups = groupByBucket(notifications);
    for (const g of groups) {
      const totalForLabel = g.rows.length + g.achievements.length;
      items.push({ kind: 'sectionLabel', key: `lbl-${g.key}`, label: g.label, count: totalForLabel });
      if (g.achievements.length > 0) {
        items.push({ kind: 'achievementsCard', key: `ach-${g.key}`, group: g.key, items: g.achievements });
      }
      for (const n of g.rows) {
        items.push({ kind: 'row', key: n.id, notif: n });
      }
    }

    if (notifications.length > 0) items.push({ kind: 'footer', key: 'footer' });
    return items;
  }, [notifications, trending, activity24h]);

  // ====================================================================
  //  RENDER HELPERS
  // ====================================================================

  const renderHero = useCallback((plan: Plan, stats: PlanTrendStats) => {
    const cover = plan.coverPhotos?.[0] || plan.places?.find((p) => p.photoUrls?.length)?.photoUrls?.[0];
    return (
      <TouchableOpacity
        style={styles.heroCard}
        onPress={() => navigation.navigate('PlanDetail', { planId: plan.id })}
        activeOpacity={0.85}
      >
        <View style={styles.heroBody}>
          <View style={styles.heroTagRow}>
            <Ionicons name="trending-up" size={14} color={Colors.primary} />
            <Text style={styles.heroTagText}>EN TENDANCE</Text>
          </View>
          <Text style={styles.heroTitle} numberOfLines={2}>{plan.title}</Text>
          <Text style={styles.heroMeta}>
            <Text style={styles.heroMetaAccent}>+{stats.saves24h}</Text>
            {' '}sauvegardes en 24 h
          </Text>
        </View>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.heroThumb} />
        ) : (
          <View style={[styles.heroThumb, { backgroundColor: Colors.terracotta100 }]} />
        )}
      </TouchableOpacity>
    );
  }, [navigation]);

  const renderAchievementsCard = useCallback((group: GroupKey, items: Notification[]) => {
    const title = group === 'today' ? "Tes progrès aujourd'hui" : group === 'week' ? 'Tes progrès cette semaine' : 'Tes progrès passés';
    return (
      <View style={styles.achCard}>
        <Text style={styles.achTitle}>{title}</Text>
        <View style={styles.achList}>
          {items.slice(0, 5).map((n, idx) => {
            const meta = ACHIEVEMENT_META[n.type] || { icon: 'sparkles-outline' as const, label: 'Étape' };
            return (
              <TouchableOpacity
                key={n.id}
                style={[styles.achRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.borderSubtle }]}
                onPress={() => handlePress(n)}
                activeOpacity={0.7}
              >
                <Ionicons name={meta.icon} size={16} color={Colors.terracotta700} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.achLabel}>{meta.label}</Text>
                  <Text style={styles.achContent} numberOfLines={1}>{n.content}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }, [handlePress]);

  const renderRow = useCallback((notif: Notification) => {
    const isUnread = !notif.read;
    const fadeAnim = fadeAnims[notif.id] || new Animated.Value(1);
    const kind = classifyRow(notif.type);
    const time = formatTimeAgo(notif.createdAt);
    const avatarUrl = senderAvatars[notif.senderId] ?? notif.senderAvatarUrl ?? undefined;

    let cta: React.ReactNode = null;
    if (kind === 'follow') {
      const status = followStatus[notif.senderId];
      if (status === 'loading') cta = <ActivityIndicator size="small" color={Colors.primary} style={{ width: 90 }} />;
      else if (status === 'following') {
        cta = (
          <View style={[styles.ctaPill, styles.ctaPillGhost]}>
            <Text style={styles.ctaPillGhostText}>Suivi</Text>
          </View>
        );
      } else if (status === 'not_following') {
        cta = (
          <TouchableOpacity
            style={[styles.ctaPill, styles.ctaPillFilled]}
            onPress={() => handleFollowBack(notif.senderId)}
            activeOpacity={0.8}
          >
            <Text style={styles.ctaPillFilledText}>Suivre</Text>
          </TouchableOpacity>
        );
      }
    } else if (kind === 'validation') {
      cta = (
        <View style={[styles.ctaPill, styles.ctaPillGhost]}>
          <Text style={styles.ctaPillGhostText}>Voir</Text>
        </View>
      );
    }

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => handlePress(notif)}
        activeOpacity={0.7}
      >
        {isUnread && (
          <Animated.View style={[styles.unreadDot, { opacity: fadeAnim }]} />
        )}
        <View style={styles.rowAvatar}>
          {notif.senderInitials ? (
            <Avatar
              initials={notif.senderInitials}
              bg={notif.senderAvatar}
              color={notif.senderAvatarColor}
              size="SS"
              avatarUrl={avatarUrl}
            />
          ) : (
            <View style={styles.iconAvatar}>
              <Ionicons name="notifications-outline" size={14} color={Colors.terracotta700} />
            </View>
          )}
        </View>
        <View style={styles.rowContent}>
          <Text style={styles.rowText} numberOfLines={2}>
            <Text style={styles.rowActor}>{notif.senderUsername}</Text>
            <Text style={styles.rowAction}>
              {' '}{notif.content.replace(notif.senderUsername + ' ', '')}
            </Text>
          </Text>
          <Text style={styles.rowTime}>{time}</Text>
        </View>
        {cta}
      </TouchableOpacity>
    );
  }, [fadeAnims, senderAvatars, followStatus, handleFollowBack, handlePress]);

  const renderItem = useCallback(({ item }: { item: Item }) => {
    switch (item.kind) {
      case 'date':
        return (
          <View style={styles.dateBlock}>
            <Text style={styles.dateLabel}>{formatDateHeadline(item.date)}</Text>
            <Text style={styles.dateHeadline}>{item.mutationsLabel}.</Text>
          </View>
        );
      case 'hero':
        return renderHero(item.plan, item.stats);
      case 'sectionLabel':
        return (
          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionLabel}>{item.label}</Text>
            <Text style={styles.sectionCount}>{item.count}</Text>
          </View>
        );
      case 'achievementsCard':
        return renderAchievementsCard(item.group, item.items);
      case 'row':
        return renderRow(item.notif);
      case 'footer':
        return <Text style={styles.footer}>— fin du briefing —</Text>;
    }
  }, [renderHero, renderAchievementsCard, renderRow]);

  // ====================================================================
  //  RENDER
  // ====================================================================
  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: Colors.bgPrimary }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Activité</Text>
        <TouchableOpacity onPress={handleMarkAllRead}>
          <Text style={styles.markAll}>Tout lire</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={flatData}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.list}
        onEndReached={() => user?.id && loadMore(user.id)}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loadingWrap}><ActivityIndicator color={Colors.primary} /></View>
          ) : (
            <EmptyState icon="📭" title="Calme plat" subtitle="Poste un plan, observe l'écho." />
          )
        }
        ListFooterComponent={
          isLoading && notifications.length > 0 ? (
            <ActivityIndicator color={Colors.primary} style={{ paddingVertical: 20 }} />
          ) : null
        }
      />
    </View>
  );
};

// ====================================================================
//  STYLES
// ====================================================================
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPadding, paddingVertical: 12,
  },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontFamily: Fonts.displaySemiBold, color: Colors.textPrimary, letterSpacing: -0.2 },
  markAll: { fontSize: 13, fontFamily: Fonts.bodySemiBold, color: Colors.primary },
  list: { paddingBottom: 60 },
  loadingWrap: { paddingTop: 60, alignItems: 'center' },

  // Date block
  dateBlock: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 18,
    paddingBottom: 14,
  },
  dateLabel: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: 1.4,
    color: Colors.textTertiary,
    marginBottom: 6,
  },
  dateHeadline: {
    fontSize: 26,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.4,
    lineHeight: 32,
  },

  // Hero — En tendance
  heroCard: {
    marginHorizontal: Layout.screenPadding,
    marginBottom: 8,
    backgroundColor: Colors.bgSecondary,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroBody: { flex: 1 },
  heroTagRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginBottom: 6,
  },
  heroTagText: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: 1.2,
    color: Colors.primary,
  },
  heroTitle: {
    fontSize: 17,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 22,
    marginBottom: 4,
  },
  heroMeta: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
  },
  heroMetaAccent: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  heroThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
  },

  // Section label row
  sectionLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 22,
    paddingBottom: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: 1.4,
    color: Colors.textTertiary,
  },
  sectionCount: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
  },

  // Achievements card (consolidated)
  achCard: {
    marginHorizontal: Layout.screenPadding,
    marginBottom: 6,
    backgroundColor: Colors.bgSecondary,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  achTitle: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  achList: {},
  achRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  achLabel: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: 0.6,
    color: Colors.terracotta700,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  achContent: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textPrimary,
    lineHeight: 17,
  },

  // Compact row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: 11,
    gap: 12,
  },
  unreadDot: {
    position: 'absolute',
    left: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  rowAvatar: { width: 36, height: 36 },
  iconAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.terracotta100,
    alignItems: 'center', justifyContent: 'center',
  },
  rowContent: { flex: 1 },
  rowText: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  rowActor: { fontFamily: Fonts.bodySemiBold },
  rowAction: { color: Colors.textPrimary },
  rowTime: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    marginTop: 2,
  },

  // Inline CTA pills
  ctaPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPillFilled: { backgroundColor: Colors.primary },
  ctaPillFilledText: { fontSize: 12, fontFamily: Fonts.bodySemiBold, color: Colors.textOnAccent },
  ctaPillGhost: { borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderMedium },
  ctaPillGhostText: { fontSize: 12, fontFamily: Fonts.bodySemiBold, color: Colors.textSecondary },

  // Footer
  footer: {
    fontSize: 12,
    fontFamily: Fonts.displayItalic,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 28,
    marginBottom: 12,
  },
});
