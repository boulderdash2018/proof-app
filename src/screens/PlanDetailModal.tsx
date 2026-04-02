import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Colors, Layout } from '../constants';
import { Avatar, Chip, UserBadge, XpBadge } from '../components';
import { useFeedStore } from '../store';
import { Plan } from '../types';
import mockApi from '../services/mockApi';

// Helper to parse gradient
const parseGradient = (g: string): string[] => {
  const m = g.match(/#[0-9A-Fa-f]{6}/g);
  return m && m.length >= 2 ? m : ['#FF6B35', '#C94520'];
};

const getTransportEmoji = (mode: string): string => {
  const map: Record<string, string> = { 'Métro': '🚇', 'Vélo': '🚲', 'À pied': '🚶', 'Voiture': '🚗', 'Trottinette': '🛴' };
  return map[mode] || '🚇';
};

export const PlanDetailModal: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { planId } = route.params as { planId: string };

  const feedPlans = useFeedStore((s) => s.plans);
  const { likedPlanIds, savedPlanIds, toggleLike, toggleSave } = useFeedStore();

  const [plan, setPlan] = useState<Plan | null>(
    feedPlans.find((p) => p.id === planId) || null
  );

  useEffect(() => {
    if (!plan) {
      mockApi.getPlanById(planId).then((result) => {
        if (result) setPlan(result);
      });
    }
  }, [planId]);

  const isLiked = likedPlanIds.has(planId);
  const isSaved = savedPlanIds.has(planId);

  const handleLike = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleLike(planId);
  };

  const handleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleSave(planId);
  };

  if (!plan) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backChevron}>&#8249;</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </View>
    );
  }

  const gradientColors = parseGradient(plan.gradient);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backChevron}>&#8249;</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {plan.title}
        </Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Gradient Banner */}
        <LinearGradient
          colors={gradientColors as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.banner}
        >
          <Text style={styles.bannerTitle}>{plan.title}</Text>
          <Text style={styles.bannerSubtitle}>par {plan.author.displayName}</Text>
        </LinearGradient>

        {/* Info Section */}
        <View style={styles.infoSection}>
          {/* Tags Row */}
          <View style={styles.tagsRow}>
            {plan.tags.map((tag) => (
              <Chip key={tag} label={tag} small />
            ))}
          </View>

          {/* Meta Row */}
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Text style={styles.metaEmoji}>💰</Text>
              <Text style={styles.metaText}>{plan.price}</Text>
            </View>
            <View style={styles.metaDot} />
            <View style={styles.metaItem}>
              <Text style={styles.metaEmoji}>⏱️</Text>
              <Text style={styles.metaText}>{plan.duration}</Text>
            </View>
            <View style={styles.metaDot} />
            <View style={styles.metaItem}>
              <Text style={styles.metaEmoji}>{getTransportEmoji(plan.transport)}</Text>
              <Text style={styles.metaText}>{plan.transport}</Text>
            </View>
          </View>
        </View>

        {/* Places Section */}
        <Text style={styles.sectionLabel}>LE PLAN COMPLET</Text>

        {plan.places.map((place, index) => (
          <TouchableOpacity
            key={place.id}
            style={styles.placeRow}
            activeOpacity={0.7}
            onPress={() =>
              navigation.navigate('PlaceDetail', {
                placeId: place.id,
                planId: plan.id,
              })
            }
          >
            <View style={styles.placeNumber}>
              <Text style={styles.placeNumberText}>{index + 1}</Text>
            </View>
            <View style={styles.placeInfo}>
              <Text style={styles.placeName}>{place.name}</Text>
              <Text style={styles.placeType}>
                {place.type} &middot; {place.address.split(',')[0]}
              </Text>
              <View style={styles.ratingRow}>
                <Text style={styles.ratingStar}>★</Text>
                <Text style={styles.ratingNumber}>{place.rating}</Text>
                <Text style={styles.ratingCount}>({place.reviewCount} avis)</Text>
              </View>
            </View>
            <Text style={styles.placeChevron}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Action Bar */}
      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
          <Text style={styles.actionIcon}>{isLiked ? '❤️' : '🤍'}</Text>
          <Text style={[styles.actionText, isLiked && styles.actionTextActive]}>
            {plan.likesCount + (isLiked && !likedPlanIds.has(planId) ? 0 : 0)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionText}>{plan.commentsCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={handleSave}>
          <Text style={styles.actionIcon}>{isSaved ? '🔖' : '📑'}</Text>
          <Text style={[styles.actionText, isSaved && styles.actionTextActive]}>
            {isSaved ? 'Sauvé' : 'Sauver'}
          </Text>
        </TouchableOpacity>

        <XpBadge xp={plan.xpReward} />
      </View>
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
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backChevron: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.black,
    marginTop: -2,
  },
  headerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.black,
    textAlign: 'center',
    marginHorizontal: 10,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: Colors.gray700,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  banner: {
    height: 160,
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  bannerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.white,
    marginBottom: 4,
  },
  bannerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
  },
  infoSection: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaEmoji: {
    fontSize: 14,
    marginRight: 4,
  },
  metaText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.gray800,
  },
  metaDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray500,
    marginHorizontal: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.gray700,
    letterSpacing: 1,
    paddingHorizontal: 18,
    marginTop: 18,
    marginBottom: 10,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  placeNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  placeNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.white,
  },
  placeInfo: {
    flex: 1,
  },
  placeName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.black,
    marginBottom: 2,
  },
  placeType: {
    fontSize: 12,
    color: Colors.gray700,
    marginBottom: 3,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingStar: {
    fontSize: 12,
    color: Colors.primary,
    marginRight: 3,
  },
  ratingNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.black,
    marginRight: 4,
  },
  ratingCount: {
    fontSize: 11,
    color: Colors.gray700,
  },
  placeChevron: {
    fontSize: 18,
    color: Colors.gray600,
    marginLeft: 8,
  },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 18,
    paddingTop: 10,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionIcon: {
    fontSize: 18,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.gray800,
  },
  actionTextActive: {
    color: Colors.primary,
  },
});
