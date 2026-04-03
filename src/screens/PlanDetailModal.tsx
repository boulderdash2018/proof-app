import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Colors, Layout } from '../constants';
import { Avatar, Chip, UserBadge, XpBadge } from '../components';
import { useAuthStore, useFeedStore, useSavesStore } from '../store';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { Plan } from '../types';
import { fetchPlanById } from '../services/plansService';

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
  const C = useColors();
  const { t } = useTranslation();

  const user = useAuthStore((s) => s.user);
  const feedPlans = useFeedStore((s) => s.plans);
  const { likedPlanIds, savedPlanIds, toggleLike, toggleSave } = useFeedStore();
  const { savedPlans, markAsDone, fetchSaves } = useSavesStore();

  const [plan, setPlan] = useState<Plan | null>(
    feedPlans.find((p) => p.id === planId) || null
  );

  const savedPlan = savedPlans.find((sp) => sp.planId === planId);
  const isDone = savedPlan?.isDone ?? false;

  useEffect(() => {
    if (!plan) {
      fetchPlanById(planId).then((result) => {
        if (result) setPlan(result);
      });
    }
    // Ensure saved plans are loaded so we can check isDone
    if (savedPlans.length === 0 && user) fetchSaves(user.id);
  }, [planId]);

  const isLiked = likedPlanIds.has(planId);
  const isSaved = savedPlanIds.has(planId);

  const handleMarkDone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    markAsDone(planId);
  };

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
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
        <View style={[styles.header, { borderBottomColor: C.borderLight }]}>
          <TouchableOpacity style={[styles.backBtn, { backgroundColor: C.gray200 }]} onPress={() => navigation.goBack()}>
            <Text style={[styles.backChevron, { color: C.black }]}>&#8249;</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: C.gray700 }]}>{t.plan_loading}</Text>
        </View>
      </View>
    );
  }

  const gradientColors = parseGradient(plan.gradient);

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      <View style={[styles.header, { borderBottomColor: C.borderLight }]}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: C.gray200 }]} onPress={() => navigation.goBack()}>
          <Text style={[styles.backChevron, { color: C.black }]}>&#8249;</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: C.black }]} numberOfLines={1}>{plan.title}</Text>
        {isSaved ? (
          <TouchableOpacity
            style={[
              styles.doneBtn,
              isDone
                ? { backgroundColor: '#E8F5E9', borderColor: '#4CAF50' }
                : { backgroundColor: C.primary + '15', borderColor: C.primary },
            ]}
            onPress={!isDone ? handleMarkDone : undefined}
            activeOpacity={isDone ? 1 : 0.7}
          >
            <Text
              style={[
                styles.doneBtnText,
                { color: isDone ? '#4CAF50' : C.primary },
              ]}
            >
              {isDone ? t.plan_already_done : t.plan_mark_done}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 34 }} />
        )}
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={gradientColors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
          <Text style={styles.bannerTitle}>{plan.title}</Text>
          <Text style={styles.bannerSubtitle}>{t.plan_by} {plan.author.displayName}</Text>
        </LinearGradient>

        <View style={[styles.infoSection, { borderBottomColor: C.border }]}>
          <View style={styles.tagsRow}>
            {plan.tags.map((tag) => (<Chip key={tag} label={tag} small />))}
          </View>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}><Text style={styles.metaEmoji}>💰</Text><Text style={[styles.metaText, { color: C.gray800 }]}>{plan.price}</Text></View>
            <View style={[styles.metaDot, { backgroundColor: C.gray500 }]} />
            <View style={styles.metaItem}><Text style={styles.metaEmoji}>⏱️</Text><Text style={[styles.metaText, { color: C.gray800 }]}>{plan.duration}</Text></View>
            <View style={[styles.metaDot, { backgroundColor: C.gray500 }]} />
            <View style={styles.metaItem}><Text style={styles.metaEmoji}>{getTransportEmoji(plan.transport)}</Text><Text style={[styles.metaText, { color: C.gray800 }]}>{plan.transport}</Text></View>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: C.gray700 }]}>{t.plan_full}</Text>

        {plan.places.map((place, index) => (
          <TouchableOpacity
            key={place.id}
            style={[styles.placeRow, { borderBottomColor: C.borderLight }]}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('PlaceDetail', { placeId: place.id, planId: plan.id })}
          >
            <View style={[styles.placeNumber, { backgroundColor: C.primary }]}>
              <Text style={styles.placeNumberText}>{index + 1}</Text>
            </View>
            <View style={styles.placeInfo}>
              <Text style={[styles.placeName, { color: C.black }]}>{place.name}</Text>
              <Text style={[styles.placeType, { color: C.gray700 }]}>{place.type} &middot; {place.address.split(',')[0]}</Text>
              <View style={styles.ratingRow}>
                <Text style={[styles.ratingStar, { color: C.primary }]}>★</Text>
                <Text style={[styles.ratingNumber, { color: C.black }]}>{place.rating}</Text>
                <Text style={[styles.ratingCount, { color: C.gray700 }]}>({place.reviewCount} {t.plan_reviews})</Text>
              </View>
            </View>
            <Text style={[styles.placeChevron, { color: C.gray600 }]}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 10, backgroundColor: C.white, borderTopColor: C.border }]}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
          <Text style={styles.actionIcon}>{isLiked ? '❤️' : '🤍'}</Text>
          <Text style={[styles.actionText, { color: isLiked ? C.primary : C.gray800 }]}>{plan.likesCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={[styles.actionText, { color: C.gray800 }]}>{plan.commentsCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleSave}>
          <Text style={styles.actionIcon}>{isSaved ? '🔖' : '📑'}</Text>
          <Text style={[styles.actionText, { color: isSaved ? C.primary : C.gray800 }]}>{isSaved ? t.plan_saved : t.plan_save}</Text>
        </TouchableOpacity>
        <XpBadge xp={plan.xpReward} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  backBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  backChevron: { fontSize: 20, fontWeight: '700', marginTop: -2 },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: '700', textAlign: 'center', marginHorizontal: 10 },
  doneBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1.5 },
  doneBtnText: { fontSize: 12, fontWeight: '700' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 14 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  banner: { height: 160, justifyContent: 'flex-end', paddingHorizontal: 18, paddingBottom: 18 },
  bannerTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 4 },
  bannerSubtitle: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.7)' },
  infoSection: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  metaItem: { flexDirection: 'row', alignItems: 'center' },
  metaEmoji: { fontSize: 14, marginRight: 4 },
  metaText: { fontSize: 13, fontWeight: '600' },
  metaDot: { width: 4, height: 4, borderRadius: 2, marginHorizontal: 10 },
  sectionLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1, paddingHorizontal: 18, marginTop: 18, marginBottom: 10 },
  placeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1 },
  placeNumber: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  placeNumberText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  placeInfo: { flex: 1 },
  placeName: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  placeType: { fontSize: 12, marginBottom: 3 },
  ratingRow: { flexDirection: 'row', alignItems: 'center' },
  ratingStar: { fontSize: 12, marginRight: 3 },
  ratingNumber: { fontSize: 12, fontWeight: '600', marginRight: 4 },
  ratingCount: { fontSize: 11 },
  placeChevron: { fontSize: 18, marginLeft: 8 },
  actionBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 18, paddingTop: 10, borderTopWidth: 1 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionIcon: { fontSize: 18 },
  actionText: { fontSize: 13, fontWeight: '600' },
});
