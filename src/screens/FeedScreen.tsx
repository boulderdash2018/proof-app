import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants';
import { PlanCard, PtsPill, LoadingSkeleton, EmptyState } from '../components';
import { useAuthStore, useFeedStore, useNotifStore } from '../store';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { Plan } from '../types';

export const FeedScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const C = useColors();
  const { t } = useTranslation();
  const { plans, isLoading, isRefreshing, likedPlanIds, savedPlanIds, fetchFeed, refreshFeed, toggleLike, toggleSave } =
    useFeedStore();
  const { unreadCount, fetchNotifications } = useNotifStore();

  useEffect(() => {
    fetchFeed(user?.id);
    fetchNotifications();
  }, [user?.id]);

  const handleLike = (planId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleLike(planId);
  };

  const handleSave = (planId: string) => {
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
      onComment={() => navigation.navigate('PlanDetail', { planId: item.id })}
      onAuthorPress={() => navigation.navigate('OtherProfile', { userId: item.authorId })}
    />
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      <View style={[styles.header, { borderBottomColor: C.borderLight }]}>
        <Text style={[styles.logo, { color: C.black }]}>
          proof<Text style={{ color: C.primary }}>.</Text>
        </Text>
        <View style={styles.headerRight}>
          <PtsPill points={user?.xpPoints ? user.xpPoints % 1000 : 240} />
          <TouchableOpacity
            style={[styles.bellBtn, { backgroundColor: C.gray200 }]}
            onPress={() => navigation.navigate('Notifications')}
          >
            <Text style={styles.bellIcon}>🔔</Text>
            {unreadCount > 0 && <View style={styles.bellBadge} />}
          </TouchableOpacity>
        </View>
      </View>

      {isLoading && plans.length === 0 ? (
        <LoadingSkeleton count={3} />
      ) : (
        <FlatList
          data={plans}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refreshFeed}
              tintColor={C.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="🏙️"
              title={t.feed_empty_title}
              subtitle={t.feed_empty_subtitle}
              ctaLabel={t.feed_empty_cta}
              onCtaPress={() => navigation.navigate('ExploreTab')}
            />
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
    borderBottomWidth: 1,
  },
  logo: { fontSize: 26, fontWeight: '800', letterSpacing: -1.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bellBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  bellIcon: { fontSize: 16 },
  bellBadge: { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.error },
  list: { paddingTop: 10, paddingBottom: 20 },
});
