import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
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
import { useSavesStore } from '../store/savesStore';
import { createPlan } from '../services/plansService';
import { TransportMode } from '../types';

// Map DoItNow transport to Plan transport
const mapTransport = (t: string): TransportMode => {
  switch (t) {
    case 'transit': return 'Métro';
    case 'bicycling': return 'Vélo';
    case 'driving': return 'Voiture';
    default: return 'À pied';
  }
};

const formatDuration = (totalMinutes: number): string => {
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
};

export const OrganizeCompleteScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const C = useColors();
  const { session, plan, clearSession } = useDoItNowStore();
  const currentUser = useAuthStore((s) => s.user);
  const addPlan = useFeedStore((s) => s.addPlan);
  const addCreatedPlan = useSavesStore((s) => s.addCreatedPlan);
  const [isPublishing, setIsPublishing] = useState(false);

  if (!session || !plan) {
    navigation.goBack();
    return null;
  }

  const totalMinutes = session.totalDurationMinutes || 0;
  const timeString = formatDuration(totalMinutes);
  const placesVisited = session.placesVisited.length;

  // Calculate total price from all visited places
  const totalPrice = session.placesVisited.reduce((sum, v) => sum + (v.pricePaid || 0), 0);

  const handlePublish = async () => {
    if (!currentUser) return;
    setIsPublishing(true);

    try {
      // Build places with prices and durations from session
      const enrichedPlaces = plan.places.map((place) => {
        const visit = session.placesVisited.find((v) => v.placeId === place.id);
        return {
          ...place,
          placePrice: visit?.pricePaid || 0,
          placeDuration: visit?.timeSpentMinutes || 0,
        };
      });

      // Collect cover photos from places
      const coverPhotos = enrichedPlaces
        .flatMap((p) => p.photoUrls || [])
        .slice(0, 5);

      const createdPlan = await createPlan(
        {
          title: session.organizeTitle || session.planTitle,
          tags: session.organizeTags || [],
          places: enrichedPlaces,
          price: `${totalPrice}€`,
          duration: formatDuration(totalMinutes),
          transport: mapTransport(session.transport),
          coverPhotos,
        },
        currentUser
      );

      // Update stores
      addPlan(createdPlan);
      addCreatedPlan(createdPlan);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      clearSession();

      Alert.alert('Plan publié !', 'Ta journée a été partagée avec la communauté.', [
        { text: 'OK', onPress: () => navigation.popToTop() },
      ]);
    } catch (err) {
      console.error('Publish error:', err);
      Alert.alert('Erreur', 'Impossible de publier le plan. Réessaie.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleClose = () => {
    clearSession();
    navigation.popToTop();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Text style={styles.emoji}>🎉</Text>
        <Text style={[styles.title, { color: C.black }]}>Journée terminée !</Text>
        <Text style={[styles.subtitle, { color: C.gray600 }]}>{session.organizeTitle || session.planTitle}</Text>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: C.gray200 }]}>
            <Ionicons name="time-outline" size={20} color={C.primary} />
            <Text style={[styles.statValue, { color: C.black }]}>{timeString}</Text>
            <Text style={[styles.statLabel, { color: C.gray600 }]}>Durée</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: C.gray200 }]}>
            <Ionicons name="location-outline" size={20} color={C.primary} />
            <Text style={[styles.statValue, { color: C.black }]}>{placesVisited}</Text>
            <Text style={[styles.statLabel, { color: C.gray600 }]}>Lieux</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: C.gray200 }]}>
            <Ionicons name="wallet-outline" size={20} color={Colors.gold} />
            <Text style={[styles.statValue, { color: C.black }]}>{totalPrice}€</Text>
            <Text style={[styles.statLabel, { color: C.gray600 }]}>Total</Text>
          </View>
        </View>

        {/* Places recap */}
        <Text style={[styles.sectionTitle, { color: C.gray700 }]}>RÉCAP DE TA JOURNÉE</Text>
        {plan.places.map((place, i) => {
          const visit = session.placesVisited.find((v) => v.placeId === place.id);
          return (
            <View key={place.id} style={[styles.recapItem, { borderColor: C.borderLight }]}>
              <View style={[styles.recapIndex, { backgroundColor: visit ? C.primary : C.gray400 }]}>
                <Text style={styles.recapIndexText}>{i + 1}</Text>
              </View>
              <View style={styles.recapInfo}>
                <Text style={[styles.recapName, { color: C.black }]}>{place.name}</Text>
                <View style={styles.recapMetaRow}>
                  {visit?.timeSpentMinutes !== undefined && (
                    <Text style={[styles.recapMeta, { color: C.gray600 }]}>
                      {visit.timeSpentMinutes} min
                    </Text>
                  )}
                  {visit?.rating ? (
                    <Text style={[styles.recapMeta, { color: Colors.gold }]}>
                      {'★'.repeat(visit.rating)}{'☆'.repeat(5 - visit.rating)}
                    </Text>
                  ) : null}
                </View>
              </View>
              {visit?.pricePaid !== undefined && visit.pricePaid > 0 ? (
                <View style={[styles.priceBadge, { backgroundColor: C.primary + '15' }]}>
                  <Text style={[styles.priceBadgeText, { color: C.primary }]}>{visit.pricePaid}€</Text>
                </View>
              ) : (
                <Text style={[styles.freeText, { color: Colors.success }]}>Gratuit</Text>
              )}
            </View>
          );
        })}

        {/* Categories */}
        {session.organizeTags && session.organizeTags.length > 0 && (
          <View style={styles.tagsRow}>
            {session.organizeTags.map((tag) => (
              <View key={tag} style={[styles.tag, { backgroundColor: C.primary + '15' }]}>
                <Text style={[styles.tagText, { color: C.primary }]}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Actions */}
        <TouchableOpacity
          style={[styles.publishBtn, { backgroundColor: C.primary }]}
          onPress={handlePublish}
          activeOpacity={0.8}
          disabled={isPublishing}
        >
          {isPublishing ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="share-outline" size={18} color="#FFF" />
              <Text style={styles.publishBtnText}>Publier le plan</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.closeBtn, { borderColor: C.borderLight }]}
          onPress={handleClose}
          activeOpacity={0.7}
        >
          <Text style={[styles.closeBtnText, { color: C.gray600 }]}>Fermer sans publier</Text>
        </TouchableOpacity>

        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: Layout.screenPadding, alignItems: 'center' },
  emoji: { fontSize: 56, marginTop: 20, marginBottom: 12 },
  title: { fontSize: 26, fontFamily: Fonts.serifBold, marginBottom: 6 },
  subtitle: { fontSize: 15, fontFamily: Fonts.serif, marginBottom: 20, textAlign: 'center' },

  statsRow: { flexDirection: 'row', gap: 10, marginVertical: 20, width: '100%' },
  statCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', gap: 6 },
  statValue: { fontSize: 20, fontFamily: Fonts.serifBold },
  statLabel: { fontSize: 11, fontFamily: Fonts.serif },

  sectionTitle: { fontSize: 12, fontFamily: Fonts.serifBold, letterSpacing: 1, alignSelf: 'flex-start', marginBottom: 12, marginTop: 8 },

  recapItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, width: '100%' },
  recapIndex: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  recapIndexText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  recapInfo: { flex: 1 },
  recapName: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
  recapMetaRow: { flexDirection: 'row', gap: 8, marginTop: 3 },
  recapMeta: { fontSize: 12, fontFamily: Fonts.serif },
  priceBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  priceBadgeText: { fontSize: 13, fontFamily: Fonts.serifBold },
  freeText: { fontSize: 12, fontFamily: Fonts.serifSemiBold },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16, alignSelf: 'flex-start' },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  tagText: { fontSize: 12, fontFamily: Fonts.serifSemiBold },

  publishBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', paddingVertical: 16, borderRadius: 14, marginTop: 28 },
  publishBtnText: { color: '#FFF', fontSize: 16, fontFamily: Fonts.serifBold },
  closeBtn: { width: '100%', paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 10, borderWidth: 1.5 },
  closeBtnText: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
});
