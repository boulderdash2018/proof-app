import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Animated,
  Dimensions,
  StatusBar,
  ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { ImmersiveCard } from '../components/ImmersiveCard';
import { LoadingSkeleton, EmptyState } from '../components';
import { SharePlanSheet } from '../components/SharePlanSheet';
import {
  useAuthStore, useFeedStore, useNotifStore,
  useTrendingStore, useSocialProofStore, useChatStore,
} from '../store';
import { useGuestStore } from '../store/guestStore';
import { useCity } from '../hooks/useCity';
import { useTranslation } from '../hooks/useTranslation';
import { Plan } from '../types';

const { width: SCREEN_W } = Dimensions.get('window');
type FeedTab = 'reco' | 'friends';

/* ================================================================
   IMMERSIVE FEED — Creme-style rounded card, horizontal swipe
   ================================================================ */

export const FeedScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const guestInterests = useGuestStore((s) => s.interests);
  const setShowAccountPrompt = useGuestStore((s) => s.setShowAccountPrompt);
  const isGuest = !isAuthenticated;
  const cityConfig = useCity();
  const { t } = useTranslation();

  const {
    plans, friendsPlans,
    isLoading, isFriendsLoading,
    likedPlanIds, savedPlanIds,
    fetchFeed, fetchFriendsFeed,
    toggleLike, toggleSave,
  } = useFeedStore();
  const { unreadCount, subscribe: subscribeNotifs } = useNotifStore();
  const { totalUnread: chatUnread, subscribe: subscribeChat } = useChatStore();

  // ── State ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<FeedTab>('reco');
  const [listH, setListH] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [friendsFetched, setFriendsFetched] = useState(false);
  const [sharePlan, setSharePlan] = useState<Plan | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const flatListRef = useRef<FlatList<Plan>>(null);

  // ── Animations ─────────────────────────────────────────────────
  const tabIndicatorLeft = useRef(new Animated.Value(0)).current;
  const tabIndicatorWidth = useRef(new Animated.Value(0)).current;
  const recoLayout = useRef({ x: 0, width: 0 });
  const friendsLayout = useRef({ x: 0, width: 0 });
  const bellPulse = useRef(new Animated.Value(1)).current;
  const prevUnreadRef = useRef(unreadCount);

  // ── Status bar — light on dark ────────────────────────────────
  useFocusEffect(useCallback(() => { StatusBar.setBarStyle('light-content'); }, []));

  // ── Data fetching ─────────────────────────────────────────────
  useEffect(() => {
    fetchFeed(user?.id, isGuest ? guestInterests : undefined, cityConfig.name);
    if (!isGuest && user?.id) {
      subscribeNotifs(user.id);
      subscribeChat(user.id);
      useSocialProofStore.getState().init(user.id);
    }
    useTrendingStore.getState().fetchTrending(cityConfig.name);
  }, [user?.id, isGuest, cityConfig.name]);

  // ── Bell pulse on new notification ────────────────────────────
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

  // ── Tab switching ─────────────────────────────────────────────
  const switchTab = useCallback(
    (tab: FeedTab) => {
      if (tab === activeTab) return;
      if (tab === 'friends' && isGuest) { setShowAccountPrompt(true); return; }
      const target = tab === 'reco' ? recoLayout.current : friendsLayout.current;
      Animated.parallel([
        Animated.spring(tabIndicatorLeft, { toValue: target.x, useNativeDriver: false, friction: 8, tension: 80 }),
        Animated.spring(tabIndicatorWidth, { toValue: target.width, useNativeDriver: false, friction: 8, tension: 80 }),
      ]).start();
      setActiveTab(tab);
      setCurrentIndex(0);
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      if (tab === 'friends' && !friendsFetched) {
        fetchFriendsFeed(cityConfig.name);
        setFriendsFetched(true);
      }
    },
    [activeTab, isGuest, friendsFetched, cityConfig.name],
  );

  // ── Auth guard ────────────────────────────────────────────────
  const requireAuth = useCallback((): boolean => {
    if (isGuest) { setShowAccountPrompt(true); return true; }
    return false;
  }, [isGuest]);

  // ── Actions ───────────────────────────────────────────────────
  const handleLike = useCallback((planId: string) => {
    if (requireAuth()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleLike(planId);
  }, [requireAuth]);

  const handleSave = useCallback((planId: string) => {
    if (requireAuth()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleSave(planId);
  }, [requireAuth]);

  // ── Viewability tracking for progress ─────────────────────────
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
  ).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  // ── Derived ───────────────────────────────────────────────────
  const currentPlans = activeTab === 'reco' ? plans : friendsPlans;
  const currentLoading = activeTab === 'reco' ? isLoading : isFriendsLoading;
  const progressPercent =
    currentPlans.length > 1 ? ((currentIndex + 1) / currentPlans.length) * 100 : 100;

  const getCoverPhoto = useCallback((plan: Plan): string | undefined => {
    return (
      plan.coverPhotos?.[0] ||
      plan.places?.find((p) => p.photoUrls?.length)?.photoUrls?.[0]
    );
  }, []);

  // ═══════════════════════════════════════════════════════════════
  //  RENDER ITEM — ImmersiveCard with swipe-to-reveal detail
  // ═══════════════════════════════════════════════════════════════
  const renderItem = useCallback(
    ({ item, index }: { item: Plan; index: number }) => (
      <ImmersiveCard
        plan={item}
        width={SCREEN_W}
        height={listH}
        isActive={index === currentIndex}
        isLiked={likedPlanIds.has(item.id)}
        isSaved={savedPlanIds.has(item.id)}
        onLike={() => handleLike(item.id)}
        onSave={() => handleSave(item.id)}
        onAuthorPress={() => {
          if (!requireAuth())
            navigation.navigate('OtherProfile', { userId: item.authorId });
        }}
        onProfilePress={(userId) => {
          if (!requireAuth()) navigation.navigate('OtherProfile', { userId });
        }}
        onDetailStateChange={setIsDetailOpen}
        onPlanPress={() => navigation.navigate('PlanDetail', { planId: item.id })}
        onPlacePress={(placeId) => navigation.navigate('PlaceDetail', { placeId, planId: item.id })}
      />
    ),
    [listH, currentIndex, likedPlanIds, savedPlanIds, requireAuth, handleLike, handleSave],
  );

  // ══════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <View style={styles.container}>
      {/* ─── Header (normal flow on black bg) ─── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.logo}>
            proof<Text style={{ color: Colors.primary }}>.</Text>
          </Text>
          <View style={styles.headerIcons}>
            {isGuest ? (
              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={() => setShowAccountPrompt(true)}
              >
                <Ionicons name="person-add-outline" size={18} color="#FFF" />
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.headerIconBtn}
                  onPress={() => navigation.navigate('ChatList')}
                >
                  <Ionicons
                    name={chatUnread > 0 ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
                    size={18}
                    color="#FFF"
                  />
                  {chatUnread > 0 && (
                    <View style={styles.headerBadge}>
                      <Text style={styles.headerBadgeText}>
                        {chatUnread > 9 ? '9+' : chatUnread}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.headerIconBtn}
                  onPress={() => navigation.navigate('Notifications')}
                >
                  <Animated.View style={{ transform: [{ scale: bellPulse }] }}>
                    <Ionicons
                      name={unreadCount > 0 ? 'notifications' : 'notifications-outline'}
                      size={19}
                      color="#FFF"
                    />
                  </Animated.View>
                  {unreadCount > 0 && (
                    <View style={styles.headerBadge}>
                      <Text style={styles.headerBadgeText}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Tabs: Recommandations / Amis */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            onLayout={(e: any) => {
              const { x, width } = e.nativeEvent.layout;
              recoLayout.current = { x, width };
              if (activeTab === 'reco') {
                tabIndicatorLeft.setValue(x);
                tabIndicatorWidth.setValue(width);
              }
            }}
            onPress={() => switchTab('reco')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, { opacity: activeTab === 'reco' ? 1 : 0.5 }]}>
              Recommandations
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onLayout={(e: any) => {
              const { x, width } = e.nativeEvent.layout;
              friendsLayout.current = { x, width };
              if (activeTab === 'friends') {
                tabIndicatorLeft.setValue(x);
                tabIndicatorWidth.setValue(width);
              }
            }}
            onPress={() => switchTab('friends')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, { opacity: activeTab === 'friends' ? 1 : 0.5 }]}>
              Amis
            </Text>
          </TouchableOpacity>
          <Animated.View
            style={[styles.tabIndicator, { left: tabIndicatorLeft, width: tabIndicatorWidth }]}
          />
        </View>
      </View>

      {/* ─── FlatList area ─── */}
      <View style={styles.listArea} onLayout={(e) => setListH(e.nativeEvent.layout.height)}>
        {listH === 0 ? null : currentLoading && currentPlans.length === 0 ? (
          <View style={styles.centeredWrap}>
            <LoadingSkeleton count={1} />
          </View>
        ) : currentPlans.length === 0 ? (
          <View style={styles.centeredWrap}>
            <EmptyState
              icon={activeTab === 'reco' ? '🏙️' : '👥'}
              title={activeTab === 'reco' ? t.feed_empty_title : "Aucun plan d'amis"}
              subtitle={
                activeTab === 'reco'
                  ? t.feed_empty_subtitle
                  : 'Suivez des personnes pour voir leurs plans ici'
              }
              ctaLabel={activeTab === 'reco' ? t.feed_empty_cta : 'Trouver des amis'}
              onCtaPress={() => {
                if (activeTab === 'reco') {
                  if (isGuest) { setShowAccountPrompt(true); return; }
                  navigation.navigate('ExploreTab');
                } else {
                  navigation.navigate('ProfileTab', { screen: 'FriendRequests' });
                }
              }}
            />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            horizontal
            pagingEnabled
            scrollEnabled={!isDetailOpen}
            data={currentPlans}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            windowSize={3}
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            getItemLayout={(_, index) => ({
              length: SCREEN_W,
              offset: SCREEN_W * index,
              index,
            })}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            decelerationRate="fast"
          />
        )}
      </View>

      {/* ─── Progress bar ─── */}
      {currentPlans.length > 1 && (
        <View style={[styles.progressBar, { top: insets.top + 4 }]} pointerEvents="none">
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
        </View>
      )}

      {/* ─── Share plan sheet ─── */}
      {sharePlan && (
        <SharePlanSheet
          visible={!!sharePlan}
          onClose={() => setSharePlan(null)}
          planId={sharePlan.id}
          planTitle={sharePlan.title}
          planCover={getCoverPhoto(sharePlan)}
          planAuthorName={sharePlan.author.displayName}
        />
      )}
    </View>
  );
};

// ════════════════════════════════════════════════════════════════
//  STYLES
// ════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  // ── Header (normal flow) ───────────────────────────────────
  header: {
    paddingBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  logo: {
    fontSize: 26,
    fontFamily: Fonts.serifBold,
    color: '#FFF',
    letterSpacing: -1,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  } as any,
  headerIconBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E85D5D',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  headerBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFF',
  },

  // ── Tabs ───────────────────────────────────────────────────
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingBottom: 8,
    paddingHorizontal: 16,
  } as any,
  tabText: {
    fontSize: 15,
    fontFamily: Fonts.serifBold,
    color: '#FFF',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: '#FFF',
  },

  // ── FlatList area ──────────────────────────────────────────
  listArea: {
    flex: 1,
  },

  // ── Progress bar ───────────────────────────────────────────
  progressBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 15,
  },
  progressTrack: {
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },

  // ── Loading / Empty ────────────────────────────────────────
  centeredWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
});
