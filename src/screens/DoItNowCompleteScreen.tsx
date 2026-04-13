import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Layout } from '../constants';
import { useColors } from '../hooks/useColors';
import { useDoItNowStore } from '../store/doItNowStore';
import { useAuthStore } from '../store/authStore';
import { useFeedStore } from '../store/feedStore';
import { saveSession, recordPlanCompletion } from '../services/doItNowService';
import { ProofSurveyModal } from '../components/ProofSurveyModal';

export const DoItNowCompleteScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const C = useColors();
  const { session, plan, clearSession } = useDoItNowStore();
  const currentUser = useAuthStore((s) => s.user);
  const [showSurvey, setShowSurvey] = useState(false);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Save to Firestore
    if (session && currentUser) {
      saveSession(session).catch(console.error);
      const photos = session.placesVisited.filter((v) => v.photoUrl).map((v) => v.photoUrl!);
      recordPlanCompletion(
        session.planId,
        currentUser.id,
        session.transport,
        session.totalDurationMinutes || 0,
        photos
      ).catch(console.error);
    }
  }, []);

  if (!session || !plan) {
    navigation.goBack();
    return null;
  }

  const totalMinutes = session.totalDurationMinutes || 0;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const timeString = hours > 0 ? `${hours}h${mins.toString().padStart(2, '0')}` : `${mins} min`;

  const placesVisited = session.placesVisited.length;
  const photosCount = session.placesVisited.filter((v) => v.photoUrl).length;
  const allPhotosGathered = photosCount === plan.places.length;

  // Parse plan duration to check speed run
  const planDuration = plan.duration;
  const durationMatch = planDuration.match(/(\d+)/);
  const estimatedMinutes = durationMatch ? parseInt(durationMatch[1], 10) * (planDuration.includes('h') ? 60 : 1) : 999;
  const isSpeedRun = totalMinutes < estimatedMinutes && totalMinutes > 0;

  const handleTerminer = () => {
    setShowSurvey(true);
  };

  const handleProofIt = () => {
    // Use existing proof system
    const { toggleSave } = useFeedStore.getState();
    const { savedPlanIds } = useFeedStore.getState();
    if (!savedPlanIds.has(plan.id)) {
      toggleSave(plan.id);
    }
    // Mark as done with proof
    const savesStore = require('../store').useSavesStore;
    savesStore.getState().markAsDone(plan.id, 'validated');

    // Update feed
    useFeedStore.setState((state) => ({
      plans: state.plans.map((p) =>
        p.id === plan.id ? { ...p, proofCount: (p.proofCount ?? 0) + 1 } : p
      ),
    }));

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowSurvey(false);
    clearSession();
    navigation.popToTop();
  };

  const handleDecline = () => {
    // Mark as done but declined
    const savesStore = require('../store').useSavesStore;
    savesStore.getState().markAsDone(plan.id, 'declined');

    setShowSurvey(false);
    clearSession();
    navigation.popToTop();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header celebration */}
        <Text style={styles.emoji}>🏁</Text>
        <Text style={[styles.title, { color: C.black }]}>Plan terminé !</Text>
        <Text style={[styles.subtitle, { color: C.gray600 }]}>{plan.title}</Text>

        {/* Badges */}
        {isSpeedRun && (
          <View style={[styles.badge, { backgroundColor: '#C9A84C20' }]}>
            <Text style={styles.badgeText}>Speed run ⚡</Text>
          </View>
        )}
        {allPhotosGathered && photosCount > 0 && (
          <View style={[styles.badge, { backgroundColor: C.primary + '20' }]}>
            <Text style={styles.badgeText}>Full coverage 📸</Text>
          </View>
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: C.gray200 }]}>
            <Ionicons name="hourglass-outline" size={20} color={C.primary} />
            <Text style={[styles.statValue, { color: C.black }]}>{timeString}</Text>
            <Text style={[styles.statLabel, { color: C.gray600 }]}>Durée totale</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: C.gray200 }]}>
            <Ionicons name="location-outline" size={20} color={C.primary} />
            <Text style={[styles.statValue, { color: C.black }]}>{placesVisited}</Text>
            <Text style={[styles.statLabel, { color: C.gray600 }]}>Lieux visités</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: C.gray200 }]}>
            <Ionicons name="star-outline" size={20} color={Colors.gold} />
            <Text style={[styles.statValue, { color: C.black }]}>+{plan.xpReward}</Text>
            <Text style={[styles.statLabel, { color: C.gray600 }]}>XP gagnés</Text>
          </View>
        </View>

        {/* Places recap */}
        <Text style={[styles.sectionTitle, { color: C.gray700 }]}>RÉCAP</Text>
        {plan.places.map((place, i) => {
          const visit = session.placesVisited.find((v) => v.placeId === place.id);
          return (
            <View key={place.id} style={[styles.recapItem, { borderColor: C.borderLight }]}>
              <View style={[styles.recapIndex, { backgroundColor: visit ? Colors.success : C.gray400 }]}>
                <Text style={styles.recapIndexText}>{i + 1}</Text>
              </View>
              <View style={styles.recapInfo}>
                <Text style={[styles.recapName, { color: C.black }]}>{place.name}</Text>
                {visit?.timeSpentMinutes !== undefined && (
                  <Text style={[styles.recapMeta, { color: C.gray600 }]}>
                    {visit.timeSpentMinutes} min sur place
                    {visit.rating ? ` · ${'★'.repeat(visit.rating)}` : ''}
                  </Text>
                )}
              </View>
              {visit ? (
                <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
              ) : (
                <Ionicons name="close-circle-outline" size={20} color={C.gray500} />
              )}
            </View>
          );
        })}

        {/* Actions */}
        <TouchableOpacity
          style={[styles.proofBtn, { backgroundColor: C.primary }]}
          onPress={handleTerminer}
          activeOpacity={0.8}
        >
          <Text style={styles.proofBtnText}>Terminer</Text>
        </TouchableOpacity>

        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>

      <ProofSurveyModal
        visible={showSurvey}
        plan={plan}
        onProof={handleProofIt}
        onDecline={handleDecline}
        initialRatings={
          session.placesVisited
            .filter((v) => v.rating && v.rating > 0)
            .map((v) => ({
              placeId: v.placeId,
              rating: v.rating!,
              comment: v.reviewText || '',
            }))
        }
        source="do_it_now"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: Layout.screenPadding, alignItems: 'center' },
  emoji: { fontSize: 56, marginTop: 20, marginBottom: 12 },
  title: { fontSize: 26, fontFamily: Fonts.serifBold, marginBottom: 6 },
  subtitle: { fontSize: 15, fontFamily: Fonts.serif, marginBottom: 20 },

  badge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10, marginBottom: 8 },
  badgeText: { fontSize: 13, fontFamily: Fonts.serifBold, color: Colors.gold },

  statsRow: { flexDirection: 'row', gap: 10, marginVertical: 20, width: '100%' },
  statCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', gap: 6 },
  statValue: { fontSize: 20, fontFamily: Fonts.serifBold },
  statLabel: { fontSize: 11, fontFamily: Fonts.serif },

  sectionTitle: { fontSize: 12, fontFamily: Fonts.serifBold, letterSpacing: 1, alignSelf: 'flex-start', marginBottom: 12, marginTop: 8 },

  recapItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, width: '100%' },
  recapIndex: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  recapIndexText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  recapInfo: { flex: 1 },
  recapName: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
  recapMeta: { fontSize: 12, fontFamily: Fonts.serif, marginTop: 2 },

  proofBtn: { width: '100%', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 24 },
  proofBtnText: { color: '#FFF', fontSize: 16, fontFamily: Fonts.serifBold },
});
