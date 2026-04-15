import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { PlanCard, LoadingSkeleton, EmptyState } from '../components';
import { SharePlanSheet } from '../components/SharePlanSheet';
import { useAuthStore, useFeedStore, useNotifStore, useTrendingStore, useSocialProofStore, useChatStore } from '../store';
import { useGuestStore } from '../store/guestStore';
import { useColors } from '../hooks/useColors';
import { useCity } from '../hooks/useCity';
import { useTranslation } from '../hooks/useTranslation';
import { Plan } from '../types';

type FeedTab = 'reco' | 'friends';

export const FeedScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const guestInterests = useGuestStore((s) => s.interests);
  const setShowAccountPrompt = useGuestStore((s) => s.setShowAccountPrompt);
  const isGuest = !isAuthenticated;
  const C = useColors();
  const cityConfig = useCity();
  const { t } = useTranslation();

  const {
    plans, friendsPlans,
    isLoading, isRefreshing,
    isFriendsLoading, isFriendsRefreshing,
    likedPlanIds, savedPlanIds,
    fetchFeed, refreshFeed,
    fetchFriendsFeed, refreshFriendsFeed,
    toggleLike, toggleSave,
  } = useFeedStore();
  const { unreadCount, subscribe: subscribeNotifs } = useNotifStore();
  const { totalUnread: chatUnread, subscribe: subscribeChat } = useChatStore();

  const [activeTab, setActiveTab] = useState<FeedTab>('reco');
  const tabIndicatorLeft = useRef(new Animated.Value(0)).current;
  const tabIndicatorWidth = useRef(new Animated.Value(0)).current;
  const contentSlideX = useRef(new Animated.Value(0)).current;
  const recoLayout = useRef({ x: 0, width: 0 });
  const friendsLayout = useRef({ x: 0, width: 0 });
  const bellPulse = useRef(new Animated.Value(1)).current;
  const prevUnreadRef = useRef(unreadCount);
  const [friendsFetched, setFriendsFetched] = useState(false);
  const [sharePlan, setSharePlan] = useState<Plan | null>(null);

  // ── Contextual greeting ──
  const getGreeting = (): string => {
    const now = new Date();
    const h = now.getHours();
    const day = now.getDay(); // 0=Sun
    if (h >= 23 || h < 6) return 'Encore debout ? proof aussi.';
    if (day === 0) return 'Slow Sunday — voilà ce que proof te propose.';
    if (day === 6) {
      if (h < 11) return 'Samedi matin — la ville t\'appartient.';
      if (h < 18) return 'Parfait pour un plan. proof t\'attend.';
      return 'Samedi soir — proof a ce qu\'il faut.';
    }
    if (day === 5 && h >= 18) return 'C\'est vendredi. proof a une ou deux idées.';
    if (h < 11) return 'Bonjour, qu\'est-ce qu\'on fait aujourd\'hui ?';
    if (h < 18) return 'proof a quelques idées pour cet après-midi.';
    return 'La soirée commence. proof est là.';
  };

  const [greeting, setGreeting] = useState(getGreeting);
  const greetingOpacity = useRef(new Animated.Value(1)).current;

  // ── Collapsing header (Instagram-style) ──
  const [headerH, setHeaderH] = useState(100);
  const headerY = useRef(new Animated.Value(0)).current;
  const lastScrollYRef = useRef(0);
  const headerShown = useRef(true);

  useEffect(() => {
    // Recalculate greeting every minute
    const interval = setInterval(() => {
      const next = getGreeting();
      if (next !== greeting) {
        Animated.timing(greetingOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
          setGreeting(next);
          Animated.timing(greetingOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        });
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [greeting]);

  useEffect(() => {
    fetchFeed(user?.id, isGuest ? guestInterests : undefined, cityConfig.name);
    if (!isGuest && user?.id) {
      subscribeNotifs(user.id);
      subscribeChat(user.id);
      useSocialProofStore.getState().init(user.id);
    }
    // Pre-fetch trending tags so PlanCard badges appear
    useTrendingStore.getState().fetchTrending(cityConfig.name);
  }, [user?.id, isGuest, cityConfig.name]);

  // Pulse bell when new unread arrives
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Animated.sequence([
        Animated.timing(bellPulse, { toValue: 1.25, duration: 150, useNativeDriver: true }),
        Animated.timing(bellPulse, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  const switchTab = (tab: FeedTab) => {
    if (tab === activeTab) return;
    if (tab === 'friends' && isGuest) {
      setShowAccountPrompt(true);
      return;
    }

    // Animate tab indicator immediately
    const target = tab === 'reco' ? recoLayout.current : friendsLayout.current;
    Animated.parallel([
      Animated.spring(tabIndicatorLeft, { toValue: target.x, useNativeDriver: false, friction: 8, tension: 80 }),
      Animated.spring(tabIndicatorWidth, { toValue: target.width, useNativeDriver: false, friction: 8, tension: 80 }),
    ]).start();

    // Slide content out → swap → slide content in
    const goingRight = tab === 'friends';
    Animated.timing(contentSlideX, { toValue: goingRight ? -40 : 40, duration: 140, useNativeDriver: true }).start(() => {
      setActiveTab(tab);
      if (tab === 'friends' && !friendsFetched) {
        fetchFriendsFeed(cityConfig.name);
        setFriendsFetched(true);
      }
      contentSlideX.setValue(goingRight ? 40 : -40);
      Animated.spring(contentSlideX, { toValue: 0, useNativeDriver: true, friction: 12, tension: 100 }).start();
    });
  };

  const requireAuth = (): boolean => {
    if (isGuest) { setShowAccountPrompt(true); return true; }
    return false;
  };

  const handleLike = (planId: string) => {
    if (requireAuth()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleLike(planId);
  };

  const handleSave = (planId: string) => {
    if (requireAuth()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleSave(planId);
  };

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastScrollYRef.current;
    lastScrollYRef.current = y;

    // Near top or pull-to-refresh — always show
    if (y <= 5) {
      if (!headerShown.current) {
        headerShown.current = true;
        Animated.spring(headerY, { toValue: 0, useNativeDriver: true, friction: 20, tension: 200 }).start();
      }
      return;
    }

    if (dy > 3 && headerShown.current) {
      // Scrolling down → hide
      headerShown.current = false;
      Animated.timing(headerY, { toValue: -headerH, duration: 280, useNativeDriver: true }).start();
    } else if (dy < -1 && !headerShown.current) {
      // Scrolling up → show immediately
      headerShown.current = true;
      Animated.spring(headerY, { toValue: 0, useNativeDriver: true, friction: 20, tension: 200 }).start();
    }
  }, [headerH]);

  const renderItem = ({ item, index }: { item: Plan; index: number }) => (
    <PlanCard
      plan={item}
      isLiked={likedPlanIds.has(item.id)}
      isSaved={savedPlanIds.has(item.id)}
      index={index}
      onPress={() => navigation.navigate('PlanDetail', { planId: item.id })}
      onLike={() => handleLike(item.id)}
      onSave={() => handleSave(item.id)}
      onComment={() => {
        if (requireAuth()) return;
        navigation.navigate('PlanDetail', { planId: item.id });
      }}
      onAuthorPress={() => {
        if (requireAuth()) return;
        navigation.navigate('OtherProfile', { userId: item.authorId });
      }}
      onShare={() => {
        if (requireAuth()) return;
        setSharePlan(item);
      }}
      onProfilePress={(userId) => {
        if (requireAuth()) return;
        navigation.navigate('OtherProfile', { userId });
      }}
    />
  );

  const currentPlans = activeTab === 'reco' ? plans : friendsPlans;
  const currentLoading = activeTab === 'reco' ? isLoading : isFriendsLoading;
  const currentRefreshing = activeTab === 'reco' ? isRefreshing : isFriendsRefreshing;

  return (
    <View style={[styles.container, { backgroundColor: C.white }]}>
      {/* Content — slide animation on tab switch */}
      <Animated.View style={{ flex: 1, transform: [{ translateX: contentSlideX }] }}>
      {currentLoading && currentPlans.length === 0 ? (
        <View style={{ flex: 1, paddingTop: insets.top + headerH }}>
          <LoadingSkeleton count={3} />
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={currentPlans}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 20, paddingTop: insets.top + headerH }}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={currentRefreshing}
              onRefresh={() => {
                if (activeTab === 'reco') {
                  refreshFeed(isGuest ? guestInterests : undefined, cityConfig.name);
                } else {
                  refreshFriendsFeed(cityConfig.name);
                }
              }}
              tintColor={C.primary}
              progressViewOffset={insets.top + headerH}
            />
          }
          ListEmptyComponent={
            activeTab === 'reco' ? (
              <EmptyState
                icon="🏙️"
                title={t.feed_empty_title}
                subtitle={t.feed_empty_subtitle}
                ctaLabel={t.feed_empty_cta}
                onCtaPress={() => {
                  if (isGuest) { setShowAccountPrompt(true); return; }
                  navigation.navigate('ExploreTab');
                }}
              />
            ) : (
              <EmptyState
                icon="👥"
                title="Aucun plan d'amis"
                subtitle="Suivez des personnes pour voir leurs plans ici"
                ctaLabel="Trouver des amis"
                onCtaPress={() => navigation.navigate('ProfileTab', { screen: 'FriendRequests' })}
              />
            )
          }
        />
      )}
      </Animated.View>

      {/* Safe area background — always visible above header */}
      <View style={[styles.safeAreaFill, { height: insets.top, backgroundColor: C.white }]} />

      {/* Collapsible header + tabs */}
      <Animated.View
        onLayout={(e: any) => setHeaderH(e.nativeEvent.layout.height)}
        style={[styles.floatingHeader, { top: insets.top, backgroundColor: C.white, transform: [{ translateY: headerY }] }]}
      >
        <View style={[styles.header, { borderBottomColor: C.borderLight }]}>
          <View style={styles.headerLeft}>
            <Text style={[styles.logo, { color: C.black }]}>
              proof<Text style={{ color: C.primary }}>.</Text>
            </Text>
            <Animated.Text style={[styles.greeting, { color: C.gray600, opacity: greetingOpacity }]} numberOfLines={1}>
              {greeting}
            </Animated.Text>
          </View>
          <View style={styles.headerRight}>
            {isGuest ? (
              <TouchableOpacity
                style={[styles.bellBtn, { backgroundColor: C.primary }]}
                onPress={() => setShowAccountPrompt(true)}
              >
                <Ionicons name="person-add-outline" size={16} color="#FFF" />
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.bellBtn}
                  onPress={() => navigation.navigate('ChatList')}
                >
                  <Ionicons name={chatUnread > 0 ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'} size={18} color={C.gray800} />
                  {chatUnread > 0 && (
                    <View style={styles.bellBadge}>
                      <Text style={styles.bellBadgeText}>{chatUnread > 9 ? '9+' : chatUnread}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.bellBtn}
                  onPress={() => navigation.navigate('Notifications')}
                >
                  <Animated.View style={{ transform: [{ scale: bellPulse }] }}>
                    <Ionicons name={unreadCount > 0 ? 'notifications' : 'notifications-outline'} size={19} color={C.gray800} />
                  </Animated.View>
                  {unreadCount > 0 && (
                    <View style={styles.bellBadge}>
                      <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        <View style={styles.tabBar}>
          <View style={styles.tabRow}>
            <TouchableOpacity
              onLayout={(e: any) => {
                const { x, width } = e.nativeEvent.layout;
                recoLayout.current = { x, width };
                if (activeTab === 'reco') { tabIndicatorLeft.setValue(x); tabIndicatorWidth.setValue(width); }
              }}
              onPress={() => switchTab('reco')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, { color: C.black, fontFamily: Fonts.serifBold, opacity: activeTab === 'reco' ? 1 : 0.4 }]}>
                Recommandations
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onLayout={(e: any) => {
                const { x, width } = e.nativeEvent.layout;
                friendsLayout.current = { x, width };
                if (activeTab === 'friends') { tabIndicatorLeft.setValue(x); tabIndicatorWidth.setValue(width); }
              }}
              onPress={() => switchTab('friends')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, { color: C.black, fontFamily: Fonts.serifBold, opacity: activeTab === 'friends' ? 1 : 0.4 }]}>
                Amis
              </Text>
            </TouchableOpacity>
            <Animated.View
              style={[
                styles.tabIndicator,
                { backgroundColor: C.primary, left: tabIndicatorLeft, width: tabIndicatorWidth },
              ]}
            />
          </View>
        </View>
      </Animated.View>

      {/* Share plan sheet */}
      {sharePlan && (
        <SharePlanSheet
          visible={!!sharePlan}
          onClose={() => setSharePlan(null)}
          planId={sharePlan.id}
          planTitle={sharePlan.title}
          planCover={sharePlan.coverPhotos?.[0] || sharePlan.places?.find(p => p.photoUrls?.length)?.photoUrls?.[0]}
          planAuthorName={sharePlan.author.displayName}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 0,
  },
  logo: { fontSize: 28, fontFamily: Fonts.serifBold, letterSpacing: -1 },
  headerLeft: { flex: 1 },
  greeting: { fontSize: 12, fontFamily: Fonts.serif, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bellBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  bellBadge: { position: 'absolute', top: 2, right: 0, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#E85D5D', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  bellBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFF' },

  // Tabs — TikTok style
  tabBar: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    paddingBottom: 8,
  } as any,
  tabText: {
    fontSize: 15,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    height: 2.5,
    borderRadius: 2,
  },

  // Collapsing header
  safeAreaFill: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 200, elevation: 20 },
  floatingHeader: { position: 'absolute', left: 0, right: 0, zIndex: 100, elevation: 10 },
});
