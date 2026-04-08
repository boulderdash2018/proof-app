import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
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
import { TransportMode, DoItNowSession, Plan } from '../types';

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
  const [published, setPublished] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Snapshot session/plan data so it survives clearSession
  const sessionRef = useRef<DoItNowSession | null>(session);
  const planRef = useRef<Plan | null>(plan);
  if (session && !sessionRef.current) sessionRef.current = session;
  if (plan && !planRef.current) planRef.current = plan;

  const s = sessionRef.current;
  const p = planRef.current;

  if (!s || !p) {
    navigation.goBack();
    return null;
  }

  const totalMinutes = s.totalDurationMinutes || 0;
  const timeString = formatDuration(totalMinutes);
  const placesVisited = s.placesVisited.length;
  const totalPrice = s.placesVisited.reduce((sum, v) => sum + (v.pricePaid || 0), 0);

  const handlePublish = async () => {
    if (!currentUser) return;
    setIsPublishing(true);
    setPublishError(null);

    try {
      // Build places with prices and durations from session
      const enrichedPlaces = p.places.map((place) => {
        const visit = s.placesVisited.find((v) => v.placeId === place.id);
        return {
          ...place,
          placePrice: visit?.pricePaid || 0,
          placeDuration: visit?.timeSpentMinutes || 0,
        };
      });

      // Collect cover photos from places
      const coverPhotos = enrichedPlaces
        .flatMap((pl) => pl.photoUrls || [])
        .slice(0, 5);

      const createdPlan = await createPlan(
        {
          title: s.organizeTitle || s.planTitle,
          tags: s.organizeTags || [],
          places: enrichedPlaces,
          price: `${totalPrice}€`,
          duration: formatDuration(totalMinutes),
          transport: mapTransport(s.transport),
          coverPhotos,
        },
        currentUser
      );

      // Update stores
      addPlan(createdPlan);
      addCreatedPlan(createdPlan);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPublished(true);
    } catch (err) {
      console.error('Publish error:', err);
      setPublishError('Impossible de publier le plan. Réessaie.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleGoHome = () => {
    clearSession();
    navigation.popToTop();
  };

  // ── Success screen ──
  if (published) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
        <View style={styles.successContainer}>
          <Text style={styles.successEmoji}>🎊</Text>
          <Text style={[styles.successTitle, { color: C.black }]}>Plan publié !</Text>
          <Text style={[styles.successSubtitle, { color: C.gray600 }]}>
            Ta journée a été partagée avec la communauté
          </Text>
          <TouchableOpacity
            style={[styles.publishBtn, { backgroundColor: C.primary, marginTop: 32 }]}
            onPress={handleGoHome}
            activeOpacity={0.8}
          >
            <Ionicons name="home-outline" size={18} color="#FFF" />
            <Text style={styles.publishBtnText}>Retour au feed</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Summary screen ──
  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Text style={styles.emoji}>🎉</Text>
        <Text style={[styles.title, { color: C.black }]}>Journée terminée !</Text>
        <Text style={[styles.subtitle, { color: C.gray600 }]}>{s.organizeTitle || s.planTitle}</Text>

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
        {p.places.map((place, i) => {
          const visit = s.placesVisited.find((v) => v.placeId === place.id);
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
        {s.organizeTags && s.organizeTags.length > 0 && (
          <View style={styles.tagsRow}>
            {s.organizeTags.map((tag) => (
              <View key={tag} style={[styles.tag, { backgroundColor: C.primary + '15' }]}>
                <Text style={[styles.tagText, { color: C.primary }]}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Error message */}
        {publishError && (
          <View style={[styles.errorBox, { backgroundColor: Colors.error + '15' }]}>
            <Text style={[styles.errorText, { color: Colors.error }]}>{publishError}</Text>
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
          onPress={handleGoHome}
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

  // Success
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  successEmoji: { fontSize: 64, marginBottom: 16 },
  successTitle: { fontSize: 28, fontFamily: Fonts.serifBold, marginBottom: 8 },
  successSubtitle: { fontSize: 15, fontFamily: Fonts.serif, textAlign: 'center' },

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

  errorBox: { width: '100%', padding: 12, borderRadius: 10, marginTop: 16 },
  errorText: { fontSize: 13, fontFamily: Fonts.serif, textAlign: 'center' },

  publishBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', paddingVertical: 16, borderRadius: 14, marginTop: 28 },
  publishBtnText: { color: '#FFF', fontSize: 16, fontFamily: Fonts.serifBold },
  closeBtn: { width: '100%', paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 10, borderWidth: 1.5 },
  closeBtnText: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
});
