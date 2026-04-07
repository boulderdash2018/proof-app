import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Animated,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { PlanCard, LoadingSkeleton, EmptyState } from '../components';
import { useAuthStore, useFeedStore, useNotifStore } from '../store';
import { useGuestStore } from '../store/guestStore';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { Plan } from '../types';

const TAB_WIDTH = Dimensions.get('window').width / 2;

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
  const { unreadCount, fetchNotifications } = useNotifStore();

  const [activeTab, setActiveTab] = useState<FeedTab>('reco');
  const indicatorX = useRef(new Animated.Value(0)).current;
  const [friendsFetched, setFriendsFetched] = useState(false);

  useEffect(() => {
    fetchFeed(user?.id, isGuest ? guestInterests : undefined);
    if (!isGuest) fetchNotifications();
  }, [user?.id, isGuest]);

  const switchTab = (tab: FeedTab) => {
    if (tab === 'friends' && isGuest) {
      setShowAccountPrompt(true);
      return;
    }
    setActiveTab(tab);
    Animated.spring(indicatorX, {
      toValue: tab === 'reco' ? 0 : TAB_WIDTH,
      useNativeDriver: true,
      friction: 8,
      tension: 80,
    }).start();

    // Lazy-load friends feed on first switch
    if (tab === 'friends' && !friendsFetched) {
      fetchFriendsFeed();
      setFriendsFetched(true);
    }
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

  const renderItem = ({ item }: { item: Plan }) => (
    <PlanCard
      plan={item}
      isLiked={likedPlanIds.has(item.id)}
      isSaved={savedPlanIds.has(item.id)}
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
    />
  );

  const currentPlans = activeTab === 'reco' ? plans : friendsPlans;
  const currentLoading = activeTab === 'reco' ? isLoading : isFriendsLoading;
  const currentRefreshing = activeTab === 'reco' ? isRefreshing : isFriendsRefreshing;

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.borderLight }]}>
        <Text style={[styles.logo, { color: C.black }]}>
          proof<Text style={{ color: C.primary }}>.</Text>
        </Text>
        <View style={styles.headerRight}>
          {isGuest ? (
            <TouchableOpacity
              style={[styles.bellBtn, { backgroundColor: C.primary }]}
              onPress={() => setShowAccountPrompt(true)}
            >
              <Ionicons name="person-add-outline" size={16} color="#FFF" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.bellBtn, { backgroundColor: C.gray200 }]}
              onPress={() => navigation.navigate('Notifications')}
            >
              <Ionicons name="notifications-outline" size={18} color={C.gray800} />
              {unreadCount > 0 && <View style={styles.bellBadge} />}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { borderBottomColor: C.borderLight }]}>
        <TouchableOpacity style={styles.tab} onPress={() => switchTab('reco')} activeOpacity={0.7}>
          <Text style={[styles.tabText, activeTab === 'reco' ? { color: C.black, fontFamily: Fonts.serifBold } : { color: C.gray600, fontFamily: Fonts.serifSemiBold }]}>
            Recommandations
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => switchTab('friends')} activeOpacity={0.7}>
          <Text style={[styles.tabText, activeTab === 'friends' ? { color: C.black, fontFamily: Fonts.serifBold } : { color: C.gray600, fontFamily: Fonts.serifSemiBold }]}>
            Amis
          </Text>
        </TouchableOpacity>
        <Animated.View
          style={[
            styles.tabIndicator,
            { backgroundColor: C.primary, transform: [{ translateX: indicatorX }] },
          ]}
        />
      </View>

      {/* Content */}
      {currentLoading && currentPlans.length === 0 ? (
        <LoadingSkeleton count={3} />
      ) : (
        <FlatList
          data={currentPlans}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={currentRefreshing}
              onRefresh={() => {
                if (activeTab === 'reco') {
                  refreshFeed(isGuest ? guestInterests : undefined);
                } else {
                  refreshFriendsFeed();
                }
              }}
              tintColor={C.primary}
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
                subtitle="Suivez des personnes qui vous suivent pour voir leurs plans ici"
                ctaLabel="Explorer"
                onCtaPress={() => navigation.navigate('ExploreTab')}
              />
            )
          }
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bellBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  bellBadge: { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.error },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    position: 'relative',
  },
  tab: {
    width: TAB_WIDTH,
    alignItems: 'center',
    paddingVertical: 12,
  },
  tabText: {
    fontSize: 14,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: TAB_WIDTH,
    height: 2.5,
    borderRadius: 2,
  },

  list: { paddingTop: 10, paddingBottom: 20 },
});
