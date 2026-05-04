import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Share,
  Image,
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
import { useSavedPlacesStore } from '../store/savedPlacesStore';
import { useDraftStore } from '../store/draftStore';
import { createPlan } from '../services/plansService';
import { useCity } from '../hooks/useCity';
import { TransportMode, TravelSegment, DoItNowSession, DoItNowTransport, Plan, CategoryTag, Place } from '../types';
import { getDirections } from '../services/directionsService';
import { ProofSurveyModal } from '../components/ProofSurveyModal';
import { LinearGradient } from 'expo-linear-gradient';
import { submitPlaceReviews } from '../services/placeReviewService';
import { useEffect } from 'react';

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

  // ── Favorites + ratings (UX alignée sur DoItNowCompleteScreen) ──
  // Le user peut noter chaque lieu et l'ajouter aux favoris depuis cet
  // écran de récap. Les ratings sont persistés au tap 'Ajouter à fait'
  // ou 'Publier' via submitPlaceReviews.
  const savedFavPlaces = useSavedPlacesStore((s) => s.places);
  const savePlace = useSavedPlacesStore((s) => s.savePlace);
  const unsavePlace = useSavedPlacesStore((s) => s.unsavePlace);

  const [ratings, setRatings] = useState<Record<string, number>>({});

  // Hydrate ratings depuis la session si déjà saisis pendant le DoItNow.
  useEffect(() => {
    if (!s) return;
    const r0: Record<string, number> = {};
    for (const v of s.placesVisited) {
      if (v.rating && v.rating > 0) r0[v.placeId] = v.rating;
    }
    if (Object.keys(r0).length > 0) setRatings(r0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const placeFavKey = (place: { googlePlaceId?: string; id: string }) =>
    place.googlePlaceId || place.id;

  const toggleFavorite = (place: Place) => {
    Haptics.selectionAsync().catch(() => {});
    const key = placeFavKey(place);
    const isFav = savedFavPlaces.some((sp) => sp.placeId === key);
    if (isFav) {
      unsavePlace(key);
    } else {
      savePlace({
        placeId: key,
        name: place.name,
        address: place.address || '',
        types: place.type ? [place.type] : [],
        rating: place.rating || 0,
        reviewCount: place.reviewCount || 0,
        photoUrl: place.photoUrls?.[0] || null,
        savedAt: Date.now(),
      });
    }
  };

  const setRating = (placeId: string, value: number) => {
    Haptics.selectionAsync().catch(() => {});
    setRatings((prev) => ({
      ...prev,
      [placeId]: prev[placeId] === value ? 0 : value,
    }));
  };

  /** Persiste les ratings posés sur cet écran via submitPlaceReviews.
   *  Best-effort : on n'attend pas le retour pour ne pas bloquer la nav. */
  const persistRatings = () => {
    if (!currentUser) return;
    const reviews = Object.entries(ratings)
      .filter(([, r]) => r > 0)
      .map(([placeId, rating]) => {
        const fullPlace = p.places.find((pl) => pl.id === placeId);
        return {
          placeId,
          googlePlaceId: fullPlace?.googlePlaceId,
          planId: p.id,
          rating,
        };
      });
    if (reviews.length === 0) return;
    submitPlaceReviews(reviews, currentUser, 'organize').catch((err) =>
      console.warn('[OrganizeCompleteScreen] reviews submit failed:', err),
    );
  };

  // Strip header — 1 à 3 photos top.
  const stripPlaces = p.places.slice(0, 3);
  const stripPhotoFor = (place: Place): string | null => {
    return place.customPhoto || place.photoUrls?.[0] || null;
  };

  // Date badge : "5 MAI · PARIS"
  const MONTHS_FR = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];
  const today = new Date();
  const dateBadge = `${today.getDate()} ${MONTHS_FR[today.getMonth()]} · ${(p.city || cityConfig.name).toUpperCase()}`;

  // Moyenne des ratings (Proof Place ratings + session) — pour la pull-quote.
  const ratedValues = Object.values(ratings).filter((r) => r > 0);
  const avgRating = ratedValues.length > 0
    ? Math.round((ratedValues.reduce((a, b) => a + b, 0) / ratedValues.length) * 10) / 10
    : null;

  // Render des étoiles cliquables (pattern DoItNow).
  const renderStars = (placeId: string) => {
    const value = ratings[placeId] ?? 0;
    return (
      <View style={hStyles.placeStars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity
            key={n}
            onPress={() => setRating(placeId, n)}
            hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
          >
            <Text style={{ fontSize: 14, color: n <= value ? Colors.gold : Colors.borderMedium }}>
              {n <= value ? '★' : '☆'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

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

      // Collect cover photos — one per place first, then fill remaining
      const firstPerPlace = enrichedPlaces
        .map((pl: any) => (pl.photoUrls && pl.photoUrls.length > 0 ? pl.photoUrls[0] : null))
        .filter(Boolean) as string[];
      const remaining = enrichedPlaces
        .flatMap((pl: any) => (pl.photoUrls || []).slice(1))
        .filter((url: string) => !firstPerPlace.includes(url));
      const coverPhotos = [...firstPerPlace, ...remaining].slice(0, 5);

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
      persistRatings();

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

  /**
   * "Ajouter à 'fait'" — crée le plan en visibility:'private' et l'ajoute
   * directement dans les saves du user (onglet 'Fait'), sans publication
   * sur le feed. L'user voit ensuite son plan dans son SavesScreen comme
   * un plan vécu, sans qu'il soit découvrable par les autres.
   *
   * Variant simplifiée de handlePublish — pas de cover photos custom,
   * pas de stats détaillées, pas de Proof It modal. Juste 'archiver
   * comme fait pour me souvenir'.
   */
  const handleAddToDone = async () => {
    if (!currentUser) return;
    setIsPublishing(true);
    setPublishError(null);
    try {
      const enrichedPlaces = p.places.map((place) => {
        const visit = s.placesVisited.find((v) => v.placeId === place.id);
        const cleaned: Record<string, any> = {};
        for (const [k, v] of Object.entries(place)) {
          if (v !== undefined) cleaned[k] = v;
        }
        cleaned.placePrice = visit?.pricePaid || 0;
        cleaned.placeDuration = visit?.timeSpentMinutes || 0;
        if (!cleaned.reviews) cleaned.reviews = [];
        if (!cleaned.ratingDistribution) cleaned.ratingDistribution = [0, 0, 0, 0, 0];
        return cleaned;
      });
      // Cover photos minimaux : 1ère photo de chaque lieu (pas de fetch
      // Google supplémentaire pour ne pas alourdir 'Ajouter à fait').
      const firstPerPlace = enrichedPlaces
        .map((pl: any) => (pl.photoUrls && pl.photoUrls.length > 0 ? pl.photoUrls[0] : null))
        .filter(Boolean) as string[];

      const createdPlan = await createPlan(
        {
          title: s.organizeTitle || s.planTitle,
          tags: s.organizeTags || [],
          places: enrichedPlaces as any,
          price: `${totalPrice}${cityConfig.currency}`,
          duration: formatDuration(totalMinutes || enrichedPlaces.reduce((sum: number, pl: any) => sum + (pl.placeDuration || 0), 0)),
          transport: mapTransport(s.transport),
          travelSegments: [],
          coverPhotos: firstPerPlace.slice(0, 3),
          visibility: 'private',
        },
        currentUser,
      );
      // addCreatedPlan : ajoute en saves avec isDone:true → l'apparaît
      // dans l'onglet 'Fait' du SavesScreen.
      addCreatedPlan(createdPlan);
      // Persist les ratings posés sur cet écran (best-effort, non
      // bloquant — la nav continue même si le submit traîne).
      persistRatings();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      clearSession();
      navigation.popToTop();
    } catch (err: any) {
      console.error('[OrganizeCompleteScreen] addToDone error:', err);
      setPublishError(`Erreur: ${err?.message || 'Impossible d\'ajouter le plan.'}`);
    } finally {
      setIsPublishing(false);
    }
  };

  /**
   * Partage natif simple — au stade 'fin organize', le plan n'est pas
   * encore créé en DB. On utilise donc Share.share avec un texte de
   * teaser plutôt qu'un deep-link vers PlanDetail. L'utilisateur peut
   * raconter à ses amis avant de décider si publier ou non.
   */
  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const title = s.organizeTitle || s.planTitle || 'Ma journée';
    const placesLabel = `${placesVisited} lieu${placesVisited > 1 ? 'x' : ''}`;
    const message = `Je viens de finir « ${title } » sur Proof — ${placesLabel}, ${timeString}.`;
    try {
      await Share.share({ title, message });
    } catch (err) {
      console.warn('[OrganizeCompleteScreen] share failed:', err);
    }
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
      // ⚠️ pricePaid === 0 ne veut PAS dire 'Gratuit', ça veut dire 'pas
      //   encore saisi' (default value du store organize). Mapper sur 0
      //   pré-remplirait la pill prix avec 'Gratuit ✓' alors que le user
      //   n'a rien validé. On laisse priceRangeIndex à -1 (= vide) tant
      //   que pricePaid n'est pas explicitement > 0. Idem pour duration.
      const price = visit?.pricePaid ?? 0;
      const priceRangeIndex = price > 0
        ? (price <= 15 ? 1 : price <= 30 ? 2 : price <= 60 ? 3 : price <= 100 ? 4 : 5)
        : -1;
      return {
        id: place.id,
        googlePlaceId: place.googlePlaceId || place.id,
        name: place.name,
        type: place.type || '',
        address: place.address || '',
        placeTypes: (place as any).placeTypes || [],
        priceRangeIndex,
        exactPrice: price > 0 ? String(price) : '',
        price: price > 0 ? String(price) : '',
        duration: visit?.timeSpentMinutes && visit.timeSpentMinutes > 0
          ? String(visit.timeSpentMinutes)
          : '',
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
            <Ionicons name="home-outline" size={18} color={Colors.textOnAccent} />
            <Text style={styles.publishBtnText}>Retour au feed</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Summary screen — pattern aligné sur DoItNowCompleteScreen ──
  // Photo strip top + titre éditorial + pull-quote + récap des lieux
  // (sans les 3 cards stats trompeuses, sans le prix par lieu).
  return (
    <View style={[hStyles.container, { backgroundColor: Colors.bgPrimary }]}>
      <ScrollView contentContainerStyle={hStyles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ═════════ TOP PHOTO STRIP ═════════ */}
        <View style={hStyles.photoStrip}>
          {stripPlaces.map((pl, i) => {
            const photo = stripPhotoFor(pl);
            return (
              <View key={pl.id || i} style={hStyles.photoTile}>
                {photo ? (
                  <Image source={{ uri: photo }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                ) : (
                  <LinearGradient
                    colors={[Colors.terracotta300, Colors.terracotta500]}
                    style={StyleSheet.absoluteFillObject}
                  />
                )}
              </View>
            );
          })}
          <LinearGradient
            colors={['transparent', 'rgba(44, 36, 32, 0.1)', 'rgba(245, 240, 232, 1)']}
            locations={[0, 0.6, 1]}
            style={hStyles.photoFade}
            pointerEvents="none"
          />
          {/* Close icon (top-left) */}
          <TouchableOpacity
            style={[hStyles.circleBtn, { top: insets.top + 8, left: 16 }]}
            onPress={handleGoHome}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={18} color="#FFF" />
          </TouchableOpacity>
          {/* Date badge */}
          <View style={[hStyles.dateBadge, { top: insets.top + 10 }]}>
            <Text style={hStyles.dateBadgeText}>{dateBadge}</Text>
          </View>
        </View>

        {/* ═════════ EDITORIAL TITLE ═════════ */}
        <View style={hStyles.titleBlock}>
          <Text style={hStyles.overline}>— PLAN VÉCU</Text>
          <Text style={hStyles.editorialTitle}>{s.organizeTitle || s.planTitle}.</Text>
        </View>

        {/* ═════════ PULL-QUOTE ═════════
            Phrase rapide qui résume la journée, sans les 3 cards
            trompeuses qui affichaient des stats brutes. */}
        <View style={[hStyles.pullQuote, { backgroundColor: Colors.bgSecondary, borderColor: Colors.borderSubtle }]}>
          <Text style={hStyles.pullQuoteText}>
            « — {timeString} de {p.city || cityConfig.name} à ton rythme.
            {avgRating !== null ? (
              <>
                {'\n'}Moyenne{' '}
                <Text style={hStyles.pullQuoteRating}>{avgRating}★</Text>
                {' '}— tu t'es fait du bien. »
              </>
            ) : (
              " Tu t'es fait du bien. »"
            )}
          </Text>
        </View>

        {/* ═════════ RECAP HEADER ═════════ */}
        <Text style={[hStyles.overline, { marginHorizontal: 20, marginTop: 18, marginBottom: 10 }]}>
          — RÉCAP · {p.places.length} ÉTAPE{p.places.length > 1 ? 'S' : ''}
        </Text>

        {/* ═════════ PLACES LIST ═════════
            Pas de prix/Gratuit affiché par lieu (l'info coût est
            désormais dans la pull-quote, sinon on encombre). À la place :
            étoiles cliquables + bouton FAVORI. */}
        {p.places.map((place, i) => {
          const photo = place.customPhoto || place.photoUrls?.[0];
          const isFav = savedFavPlaces.some((sp) => sp.placeId === placeFavKey(place));
          const visit = s.placesVisited.find((v) => v.placeId === place.id);
          const placeMinutes = visit?.timeSpentMinutes || place.placeDuration || 0;
          const durationText = placeMinutes > 0 ? formatDuration(placeMinutes) : '';
          return (
            <View key={place.id || i} style={[hStyles.placeCard, { backgroundColor: Colors.bgSecondary, borderColor: Colors.borderSubtle }]}>
              <View style={hStyles.placeRow}>
                <Text style={hStyles.placeIndex}>{(i + 1).toString().padStart(2, '0')}</Text>
                <View style={hStyles.placeThumb}>
                  {photo ? (
                    <Image source={{ uri: photo }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                  ) : (
                    <LinearGradient
                      colors={[Colors.terracotta300, Colors.terracotta500]}
                      style={StyleSheet.absoluteFillObject}
                    />
                  )}
                </View>
                <View style={hStyles.placeInfo}>
                  <Text style={hStyles.placeName} numberOfLines={2}>{place.name}</Text>
                  <Text style={hStyles.placeMeta} numberOfLines={1}>
                    {(place.type || 'LIEU').toUpperCase()}
                    {durationText ? ` · ${durationText}` : ''}
                  </Text>
                </View>
                <View style={hStyles.placeRight}>
                  {renderStars(place.id)}
                  <TouchableOpacity
                    onPress={() => toggleFavorite(place)}
                    style={hStyles.favBadge}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons
                      name={isFav ? 'star' : 'star-outline'}
                      size={11}
                      color={isFav ? Colors.gold : Colors.textTertiary}
                    />
                    <Text style={[hStyles.favBadgeText, { color: isFav ? Colors.gold : Colors.textTertiary }]}>
                      {isFav ? 'FAVORI' : 'FAVORI ?'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}

        {/* Error message */}
        {publishError && (
          <View style={[styles.errorBox, { backgroundColor: Colors.error + '15', marginHorizontal: 20 }]}>
            <Text style={[styles.errorText, { color: Colors.error }]}>{publishError}</Text>
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* ═════════ FOOTER — 3 actions (aligné DoItNowComplete) ═════════
          Partager   → partage natif (le plan n'est pas encore en DB)
          Sauvegarder uniquement → ferme sans publier (plan non créé,
                                  reste accessible via brouillons)
          Publier sur le feed   → handleCustomize, ouvre le wizard
                                  CreateScreen mode customize pour
                                  enrichir avant publication */}
      <View style={[footerStyles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={footerStyles.ghostBtn}
          onPress={handleShare}
          activeOpacity={0.7}
          disabled={isPublishing}
        >
          <Ionicons name="paper-plane-outline" size={14} color={Colors.textPrimary} />
          <Text style={footerStyles.ghostBtnText}>Partager</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={footerStyles.ghostBtn}
          onPress={handleAddToDone}
          activeOpacity={0.7}
          disabled={isPublishing}
        >
          <Ionicons name="checkmark-circle-outline" size={14} color={Colors.textPrimary} />
          <Text style={footerStyles.ghostBtnText}>Ajouter à « fait »</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[footerStyles.primaryBtn, { opacity: isPublishing ? 0.7 : 1 }]}
          onPress={handleCustomize}
          activeOpacity={0.85}
          disabled={isPublishing}
        >
          {isPublishing ? (
            <ActivityIndicator color={Colors.textOnAccent} size="small" />
          ) : (
            <>
              <Ionicons name="paper-plane" size={14} color={Colors.textOnAccent} />
              <Text style={footerStyles.primaryBtnText}>Publier</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

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
  title: { fontSize: 26, fontFamily: Fonts.displaySemiBold, marginBottom: 6 },
  subtitle: { fontSize: 15, fontFamily: Fonts.body, marginBottom: 20, textAlign: 'center' },

  // Success
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  successEmoji: { fontSize: 64, marginBottom: 16 },
  successTitle: { fontSize: 28, fontFamily: Fonts.displaySemiBold, marginBottom: 8 },
  successSubtitle: { fontSize: 15, fontFamily: Fonts.body, textAlign: 'center' },

  statsRow: { flexDirection: 'row', gap: 10, marginVertical: 20, width: '100%' },
  statCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', gap: 6 },
  statValue: { fontSize: 20, fontFamily: Fonts.displaySemiBold },
  statLabel: { fontSize: 11, fontFamily: Fonts.body },

  sectionTitle: { fontSize: 12, fontFamily: Fonts.bodySemiBold, letterSpacing: 1, alignSelf: 'flex-start', marginBottom: 12, marginTop: 8 },

  recapItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, width: '100%' },
  recapIndex: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  recapIndexText: { color: Colors.textOnAccent, fontSize: 12, fontWeight: '800' },
  recapInfo: { flex: 1 },
  recapName: { fontSize: 14, fontFamily: Fonts.bodySemiBold },
  recapMetaRow: { flexDirection: 'row', gap: 8, marginTop: 3 },
  recapMeta: { fontSize: 12, fontFamily: Fonts.body },
  priceBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  priceBadgeText: { fontSize: 13, fontFamily: Fonts.bodySemiBold },
  freeText: { fontSize: 12, fontFamily: Fonts.bodySemiBold },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16, alignSelf: 'flex-start' },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  tagText: { fontSize: 12, fontFamily: Fonts.bodySemiBold },

  errorBox: { width: '100%', padding: 12, borderRadius: 10, marginTop: 16 },
  errorText: { fontSize: 13, fontFamily: Fonts.body, textAlign: 'center' },

  publishBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', paddingVertical: 16, borderRadius: 14, marginTop: 28 },
  publishBtnText: { color: Colors.textOnAccent, fontSize: 16, fontFamily: Fonts.displaySemiBold },
  customizeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', paddingVertical: 14, borderRadius: 14, marginTop: 10, borderWidth: 1.5 },
  customizeBtnText: { fontSize: 14, fontFamily: Fonts.bodySemiBold },
  closeBtn: { width: '100%', paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 10, borderWidth: 1.5 },
  closeBtnText: { fontSize: 14, fontFamily: Fonts.bodySemiBold },
});

// ──────────────────────────────────────────────────────────────
// Hero styles — pattern éditorial aligné sur DoItNowCompleteScreen :
// photo strip top + titre Fraunces italique + pull-quote + places list.
// Même valeurs (PHOTO_STRIP_H, paddings, fontSizes) pour cohérence
// pixel-perfect entre les deux écrans de fin de plan.
// ──────────────────────────────────────────────────────────────
const PHOTO_STRIP_H = 270;
const hStyles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 16 },
  photoStrip: {
    width: '100%',
    height: PHOTO_STRIP_H,
    flexDirection: 'row',
    position: 'relative',
    backgroundColor: '#2C2420',
  },
  photoTile: {
    flex: 1,
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  photoFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 90,
  },
  circleBtn: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(44, 36, 32, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBadge: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(44, 36, 32, 0.72)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 99,
  },
  dateBadgeText: {
    fontSize: 10.5,
    fontFamily: Fonts.bodySemiBold,
    color: '#FFF',
    letterSpacing: 1.2,
  },
  titleBlock: {
    paddingHorizontal: 20,
    marginTop: -30,
  },
  overline: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  editorialTitle: {
    fontSize: 34,
    fontFamily: Fonts.displaySemiBoldItalic,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 38,
    marginTop: 4,
  },
  pullQuote: {
    marginHorizontal: 20,
    marginTop: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  pullQuoteText: {
    fontSize: 15,
    fontFamily: Fonts.displayItalic,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  pullQuoteRating: {
    color: Colors.primary,
    fontFamily: Fonts.displaySemiBoldItalic,
  },
  placeCard: {
    marginHorizontal: 20,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  placeIndex: {
    fontSize: 11,
    fontFamily: Fonts.bodyBold,
    color: Colors.primary,
    width: 22,
    letterSpacing: 0.5,
  },
  placeThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: Colors.bgTertiary,
  },
  placeInfo: { flex: 1, minWidth: 0 },
  placeName: {
    fontSize: 15,
    fontFamily: Fonts.displaySemiBoldItalic,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
    lineHeight: 19,
  },
  placeMeta: {
    fontSize: 10.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    letterSpacing: 1,
    marginTop: 3,
  },
  placeRight: {
    alignItems: 'flex-end',
    gap: 4,
    minWidth: 90,
  },
  placeStars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  favBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  favBadgeText: {
    fontSize: 9.5,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: 0.8,
  },
});

// Styles footer 3-boutons — alignés sur DoItNowCompleteScreen (mêmes
// proportions, même paddings, mêmes couleurs) pour cohérence UX entre
// 'fin organize solo' et 'fin do it now co-plan'.
const footerStyles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
    backgroundColor: Colors.bgPrimary,
  },
  ghostBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 11,
    borderRadius: 99,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.borderMedium,
  },
  ghostBtnText: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 11,
    borderRadius: 99,
    backgroundColor: Colors.primary,
  },
  primaryBtnText: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
  },
});
