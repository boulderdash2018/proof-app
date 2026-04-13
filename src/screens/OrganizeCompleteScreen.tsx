import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
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
import { useDraftStore } from '../store/draftStore';
import { createPlan } from '../services/plansService';
import { useCity } from '../hooks/useCity';
import { TransportMode, TravelSegment, DoItNowSession, DoItNowTransport, Plan, CategoryTag } from '../types';
import { getDirections } from '../services/directionsService';
import { ProofSurveyModal } from '../components/ProofSurveyModal';

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
  const cityConfig = useCity();
  const { session, plan, clearSession } = useDoItNowStore();
  const currentUser = useAuthStore((s) => s.user);
  const addPlan = useFeedStore((s) => s.addPlan);
  const addCreatedPlan = useSavesStore((s) => s.addCreatedPlan);

  const [isPublishing, setIsPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [showRating, setShowRating] = useState(false);
  const publishedPlanRef = useRef<Plan | null>(null);

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
      // Strip undefined values (Firestore rejects them)
      const enrichedPlaces = p.places.map((place) => {
        const visit = s.placesVisited.find((v) => v.placeId === place.id);
        const cleaned: Record<string, any> = {};
        for (const [k, v] of Object.entries(place)) {
          if (v !== undefined) cleaned[k] = v;
        }
        cleaned.placePrice = visit?.pricePaid || 0;
        cleaned.placeDuration = visit?.timeSpentMinutes || 0;
        // Ensure reviews is always an array
        if (!cleaned.reviews) cleaned.reviews = [];
        if (!cleaned.ratingDistribution) cleaned.ratingDistribution = [0, 0, 0, 0, 0];
        return cleaned;
      });

      // Build travel segments using Google Directions API for real travel times
      const travelSegments: TravelSegment[] = [];
      for (let i = 0; i < enrichedPlaces.length - 1; i++) {
        const from = enrichedPlaces[i];
        const to = enrichedPlaces[i + 1];
        let travelMinutes = 10; // fallback

        if (from.latitude && from.longitude && to.latitude && to.longitude) {
          if (Platform.OS === 'web' && typeof window !== 'undefined' && (window as any).google?.maps) {
            // Web: use Google Maps JS API DirectionsService (REST API has CORS issues)
            const gmTransport: Record<string, string> = {
              walking: 'WALKING', driving: 'DRIVING', transit: 'TRANSIT', bicycling: 'BICYCLING',
            };
            try {
              const result = await new Promise<number>((resolve) => {
                const svc = new (window as any).google.maps.DirectionsService();
                svc.route({
                  origin: { lat: from.latitude, lng: from.longitude },
                  destination: { lat: to.latitude, lng: to.longitude },
                  travelMode: gmTransport[s.transport] || 'WALKING',
                }, (res: any, status: string) => {
                  if (status === 'OK' && res?.routes?.[0]?.legs?.[0]) {
                    resolve(Math.max(1, Math.round(res.routes[0].legs[0].duration.value / 60)));
                  } else {
                    resolve(10);
                  }
                });
              });
              travelMinutes = result;
            } catch { /* fallback */ }
          } else {
            // Native: use REST API
            const directions = await getDirections(
              { lat: from.latitude, lng: from.longitude },
              { lat: to.latitude, lng: to.longitude },
              s.transport as DoItNowTransport
            );
            if (directions) {
              travelMinutes = Math.max(1, Math.round(directions.durationSeconds / 60));
            }
          }
        }

        travelSegments.push({
          fromPlaceId: from.id,
          toPlaceId: to.id,
          transport: mapTransport(s.transport),
          duration: travelMinutes,
        });
      }

      // Collect cover photos from places
      const coverPhotos = enrichedPlaces
        .flatMap((pl: any) => pl.photoUrls || [])
        .slice(0, 5);

      // Compute real duration: sum of place times + travel times
      const placeTime = enrichedPlaces.reduce((sum: number, pl: any) => sum + (pl.placeDuration || 0), 0);
      const travelTime = travelSegments.reduce((sum, seg) => sum + seg.duration, 0);
      const realDuration = totalMinutes > 0 ? totalMinutes : placeTime + travelTime;

      const createdPlan = await createPlan(
        {
          title: s.organizeTitle || s.planTitle,
          tags: s.organizeTags || [],
          places: enrichedPlaces as any,
          price: `${totalPrice}${cityConfig.currency}`,
          duration: formatDuration(realDuration),
          transport: mapTransport(s.transport),
          travelSegments,
          coverPhotos,
        },
        currentUser
      );

      // Update stores
      addPlan(createdPlan);
      addCreatedPlan(createdPlan);
      publishedPlanRef.current = createdPlan;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Check if any places were unrated — propose rating
      const hasUnrated = s.placesVisited.some((v) => !v.rating || v.rating === 0);
      if (hasUnrated) {
        setShowRating(true);
      } else {
        setPublished(true);
      }
    } catch (err: any) {
      console.error('Publish error:', err);
      setPublishError(`Erreur: ${err?.message || 'Impossible de publier le plan.'}`);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleGoHome = () => {
    clearSession();
    navigation.popToTop();
  };

  const handleRatingDone = () => {
    setShowRating(false);
    setPublished(true);
  };

  const handleCustomize = () => {
    // Save organize data as a draft and navigate to CreateScreen
    const draftId = 'organize-' + Date.now();
    const draftPlaces = p.places.map((place) => {
      const visit = s.placesVisited.find((v) => v.placeId === place.id);
      const price = visit?.pricePaid || 0;
      return {
        id: place.id,
        googlePlaceId: place.googlePlaceId || place.id,
        name: place.name,
        type: place.type || '',
        address: place.address || '',
        placeTypes: (place as any).placeTypes || [],
        priceRangeIndex: price === 0 ? 0 : price <= 15 ? 1 : price <= 30 ? 2 : price <= 60 ? 3 : price <= 100 ? 4 : 5,
        exactPrice: price > 0 ? String(price) : '',
        price: String(price),
        duration: String(visit?.timeSpentMinutes || ''),
        comment: visit?.reviewText || '',
      };
    });
    const draftTravels = draftPlaces.slice(0, -1).map((pl, i) => ({
      fromId: pl.id,
      toId: draftPlaces[i + 1].id,
      duration: '',
      transport: mapTransport(s.transport),
    }));

    useDraftStore.getState().saveDraft(draftId, {
      title: s.organizeTitle || s.planTitle,
      coverPhotos: [],
      selectedTags: (s.organizeTags || []) as string[],
      places: draftPlaces,
      travels: draftTravels,
    });

    clearSession();
    navigation.navigate('CreateTab', { screen: 'Create', params: { draftId } });
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
            <Ionicons name="hourglass-outline" size={20} color={C.primary} />
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
            <Text style={[styles.statValue, { color: C.black }]}>{totalPrice}{cityConfig.currency}</Text>
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
                  <Text style={[styles.priceBadgeText, { color: C.primary }]}>{visit.pricePaid}{cityConfig.currency}</Text>
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
          style={[styles.customizeBtn, { borderColor: C.primary }]}
          onPress={handleCustomize}
          activeOpacity={0.7}
          disabled={isPublishing}
        >
          <Ionicons name="create-outline" size={18} color={C.primary} />
          <Text style={[styles.customizeBtnText, { color: C.primary }]}>Personnaliser ce plan</Text>
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

      {publishedPlanRef.current && (
        <ProofSurveyModal
          visible={showRating}
          plan={publishedPlanRef.current}
          onProof={handleRatingDone}
          rateOnly
          initialRatings={
            s.placesVisited
              .filter((v) => v.rating && v.rating > 0)
              .map((v) => ({
                placeId: v.placeId,
                rating: v.rating!,
                comment: v.reviewText || '',
              }))
          }
          source="organize"
        />
      )}
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
  customizeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', paddingVertical: 14, borderRadius: 14, marginTop: 10, borderWidth: 1.5 },
  customizeBtnText: { fontSize: 14, fontFamily: Fonts.serifBold },
  closeBtn: { width: '100%', paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 10, borderWidth: 1.5 },
  closeBtnText: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
});
