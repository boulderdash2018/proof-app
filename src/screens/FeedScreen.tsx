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
import { Plan } from '../types';

export const FeedScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { plans, isLoading, isRefreshing, likedPlanIds, savedPlanIds, fetchFeed, refreshFeed, toggleLike, toggleSave } =
    useFeedStore();
  const { unreadCount, fetchNotifications } = useNotifStore();

  useEffect(() => {
    fetchFeed();
    fetchNotifications();
  }, []);

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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>
          proof<Text style={styles.logoDot}>.</Text>
        </Text>
        <View style={styles.headerRight}>
          <PtsPill points={user?.xpPoints ? user.xpPoints % 1000 : 240} />
          <TouchableOpacity
            style={styles.bellBtn}
            onPress={() => navigation.navigate('Notifications')}
          >
            <Text style={styles.bellIcon}>🔔</Text>
            {unreadCount > 0 && <View style={styles.bellBadge} />}
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
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
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="🏙️"
              title="Aucun plan pour l'instant"
              subtitle="Découvre des plans partagés par la communauté"
              ctaLabel="Explorer"
              onCtaPress={() => navigation.navigate('ExploreTab')}
            />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  logo: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.black,
    letterSpacing: -1.5,
  },
  logoDot: {
    color: Colors.primary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bellBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellIcon: {
    fontSize: 16,
  },
  bellBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  list: {
    paddingTop: 10,
    paddingBottom: 20,
  },
});
