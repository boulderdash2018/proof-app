import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Animated,
  Dimensions,
  Image,
  StatusBar,
  ViewToken,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, getRankForProofs } from '../constants';
import { FloatingAvatars } from '../components/FloatingAvatars';
import { RankBadge } from '../components/RankBadge';
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
   IMMERSIVE FULL-SCREEN FEED
   - One plan per frame, horizontal swipe navigation
   - Photo fills the entire screen, overlaid info + actions
   - Inspired by Creme app
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
  const [containerH, setContainerH] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [friendsFetched, setFriendsFetched] = useState(false);
  const [sharePlan, setSharePlan] = useState<Plan | null>(null);
  const flatListRef = useRef<FlatList<Plan>>(null);

  // ── Animations ─────────────────────────────────────────────────
  const tabIndicatorLeft = useRef(new Animated.Value(0)).current;
  const tabIndicatorWidth = useRef(new Animated.Value(0)).current;
  const recoLayout = useRef({ x: 0, width: 0 });
  const friendsLayout = useRef({ x: 0, width: 0 });
  const bellPulse = useRef(new Animated.Value(1)).current;
  const prevUnreadRef = useRef(unreadCount);

  // ── Status bar — light on dark ────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle('light-content');
    }, []),
  );

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
      if (tab === 'friends' && isGuest) {
        setShowAccountPrompt(true);
        return;
      }
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
    if (isGuest) {
      setShowAccountPrompt(true);
      return true;
    }
    return false;
  }, [isGuest]);

  // ── Actions ───────────────────────────────────────────────────
  const handleLike = useCallback(
    (planId: string) => {
      if (requireAuth()) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      toggleLike(planId);
    },
    [requireAuth],
  );

  const handleSave = useCallback(
    (planId: string) => {
      if (requireAuth()) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      toggleSave(planId);
    },
    [requireAuth],
  );

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

  // ── Render a single full-screen frame ─────────────────────────
  const renderFrame = useCallback(
    ({ item }: { item: Plan; index: number }) => {
      const coverUrl = getCoverPhoto(item);
      const rank = getRankForProofs(item.author?.total_proof_validations || 0);

      return (
        <View style={[styles.frame, { width: SCREEN_W, height: containerH }]}>
          {/* ─── Full-bleed cover photo ─── */}
          {coverUrl ? (
            <Image
              source={{ uri: coverUrl }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
          ) : (
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#1C1917' }]} />
          )}

          {/* ─── Top gradient (header legibility) ─── */}
          <LinearGradient
            colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.15)', 'transparent']}
            locations={[0, 0.6, 1]}
            style={styles.topGradient}
          />

          {/* ─── Bottom gradient (info legibility) ─── */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.92)']}
            locations={[0.3, 0.6, 1]}
            style={styles.bottomGradient}
          />

          {/* ─── Side actions (right column) ─── */}
          <View style={styles.sideActions}>
            {/* Like */}
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleLike(item.id)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={likedPlanIds.has(item.id) ? 'heart' : 'heart-outline'}
                size={28}
                color={likedPlanIds.has(item.id) ? '#FF4D67' : '#FFF'}
              />
              {item.likesCount > 0 && (
                <Text style={styles.actionCount}>{item.likesCount}</Text>
              )}
            </TouchableOpacity>

            {/* Save */}
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleSave(item.id)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={savedPlanIds.has(item.id) ? 'bookmark' : 'bookmark-outline'}
                size={26}
                color={savedPlanIds.has(item.id) ? Colors.primary : '#FFF'}
              />
              {(item.savedByIds?.length ?? 0) > 0 && (
                <Text style={styles.actionCount}>{item.savedByIds!.length}</Text>
              )}
            </TouchableOpacity>

            {/* Comment */}
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => {
                if (!requireAuth()) navigation.navigate('PlanDetail', { planId: item.id });
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="chatbubble-outline" size={24} color="#FFF" />
              {item.commentsCount > 0 && (
                <Text style={styles.actionCount}>{item.commentsCount}</Text>
              )}
            </TouchableOpacity>

            {/* Share */}
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => {
                if (!requireAuth()) setSharePlan(item);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="paper-plane-outline" size={22} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* ─── Bottom info (left side) ─── */}
          <View style={styles.bottomInfo}>
            {/* Social-proof avatars */}
            <FloatingAvatars
              plan={item}
              onProfilePress={(userId) => {
                if (!requireAuth()) navigation.navigate('OtherProfile', { userId });
              }}
              containerStyle={styles.avatarsInline}
            />

            {/* Plan title — tappable for detail */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation.navigate('PlanDetail', { planId: item.id })}
            >
              <Text style={styles.planTitle} numberOfLines={2}>
                {item.title}
              </Text>
            </TouchableOpacity>

            {/* Author row */}
            <TouchableOpacity
              style={styles.authorRow}
              activeOpacity={0.7}
              onPress={() => {
                if (!requireAuth())
                  navigation.navigate('OtherProfile', { userId: item.authorId });
              }}
            >
              <View
                style={[
                  styles.authorAvatar,
                  { backgroundColor: item.author?.avatarBg || '#444' },
                ]}
              >
                {item.author?.avatarUrl ? (
                  <Image
                    source={{ uri: item.author.avatarUrl }}
                    style={styles.authorAvatarImg}
                  />
                ) : (
                  <Text
                    style={[
                      styles.authorInitials,
                      { color: item.author?.avatarColor || '#FFF' },
                    ]}
                  >
                    {item.author?.initials || '?'}
                  </Text>
                )}
              </View>
              <Text style={styles.authorName} numberOfLines={1}>
                {item.author?.displayName || 'Inconnu'}
              </Text>
              {rank && <RankBadge rank={rank} small />}
            </TouchableOpacity>

            {/* Meta: price · duration · places */}
            <View style={styles.metaRow}>
              {item.price ? <Text style={styles.metaText}>{item.price}</Text> : null}
              {item.price && item.duration ? <Text style={styles.metaDot}>·</Text> : null}
              {item.duration ? <Text style={styles.metaText}>{item.duration}</Text> : null}
              {(item.price || item.duration) && item.places?.length > 0 ? (
                <Text style={styles.metaDot}>·</Text>
              ) : null}
              {item.places?.length > 0 ? (
                <Text style={styles.metaText}>
                  {item.places.length} lieu{item.places.length > 1 ? 'x' : ''}
                </Text>
              ) : null}
            </View>

            {/* Category tags */}
            {item.tags?.length > 0 && (
              <View style={styles.tagsRow}>
                {item.tags.slice(0, 3).map((tag, i) => (
                  <View key={i} style={styles.tagChip}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      );
    },
    [containerH, likedPlanIds, savedPlanIds, requireAuth, handleLike, handleSave],
  );

  // ══════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <View style={styles.container} onLayout={(e) => setContainerH(e.nativeEvent.layout.height)}>
      {/* ─── Main horizontal FlatList ─── */}
      {containerH === 0 ? null : currentLoading && currentPlans.length === 0 ? (
        <View style={[styles.centeredWrap, { paddingTop: insets.top + 100 }]}>
          <LoadingSkeleton count={1} />
        </View>
      ) : currentPlans.length === 0 ? (
        <View style={[styles.centeredWrap, { paddingTop: insets.top + 100 }]}>
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
                if (isGuest) {
                  setShowAccountPrompt(true);
                  return;
                }
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
          data={currentPlans}
          renderItem={renderFrame}
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

      {/* ─── Progress bar ─── */}
      {currentPlans.length > 1 && (
        <View style={[styles.progressBar, { top: insets.top + 4 }]} pointerEvents="none">
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
        </View>
      )}

      {/* ─── Header overlay (logo + icons + tabs) ─── */}
      <View
        style={[styles.headerOverlay, { paddingTop: insets.top + 10 }]}
        pointerEvents="box-none"
      >
        <View style={styles.headerRow} pointerEvents="box-none">
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
                    name={
                      chatUnread > 0
                        ? 'chatbubble-ellipses'
                        : 'chatbubble-ellipses-outline'
                    }
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
        <View style={styles.tabRow} pointerEvents="box-none">
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
            <Text
              style={[styles.tabText, { opacity: activeTab === 'reco' ? 1 : 0.5 }]}
            >
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
            <Text
              style={[styles.tabText, { opacity: activeTab === 'friends' ? 1 : 0.5 }]}
            >
              Amis
            </Text>
          </TouchableOpacity>
          <Animated.View
            style={[
              styles.tabIndicator,
              { left: tabIndicatorLeft, width: tabIndicatorWidth },
            ]}
          />
        </View>
      </View>

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

  // ── Frame ──────────────────────────────────────────────────
  frame: {
    overflow: 'hidden',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '35%',
    zIndex: 1,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    zIndex: 1,
  },

  // ── Side actions ───────────────────────────────────────────
  sideActions: {
    position: 'absolute',
    right: 14,
    bottom: 160,
    alignItems: 'center',
    zIndex: 5,
    gap: 20,
  } as any,
  actionBtn: {
    alignItems: 'center',
    gap: 2,
  } as any,
  actionCount: {
    color: '#FFF',
    fontSize: 11,
    fontFamily: Fonts.serifSemiBold,
    marginTop: 1,
  },

  // ── Bottom info ────────────────────────────────────────────
  bottomInfo: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 70,
    zIndex: 5,
  },
  avatarsInline: {
    position: 'relative',
    bottom: 0,
    left: 0,
    marginBottom: 10,
  },
  planTitle: {
    fontSize: 24,
    fontFamily: Fonts.serifBold,
    color: '#FFF',
    lineHeight: 30,
    marginBottom: 8,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  } as any,
  authorAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  authorAvatarImg: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  authorInitials: {
    fontSize: 9,
    fontWeight: '700',
  },
  authorName: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontFamily: Fonts.serifSemiBold,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  } as any,
  metaText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontFamily: Fonts.serif,
  },
  metaDot: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  } as any,
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  tagText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontFamily: Fonts.serifSemiBold,
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
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1,
    backgroundColor: '#FFF',
  },

  // ── Header overlay ─────────────────────────────────────────
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
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

  // ── Loading / Empty ────────────────────────────────────────
  centeredWrap: {
    flex: 1,
    backgroundColor: '#000',
    paddingHorizontal: 24,
  },
});
