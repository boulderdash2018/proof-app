import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Platform,
  ActivityIndicator,
  Linking,
  TextInput as RNTextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Layout } from '../constants';
import { useColors } from '../hooks/useColors';
import { useDoItNowStore } from '../store/doItNowStore';
import { useSavedPlacesStore } from '../store/savedPlacesStore';
import { getDirections, decodePolyline, RouteResult } from '../services/directionsService';
import { Plan, DoItNowTransport } from '../types';
import { useCity } from '../hooks/useCity';

// Quick-word chips shown on the editorial review screen.
const QUICK_WORDS: { key: string; label: string }[] = [
  { key: 'ambiance',    label: 'Ambiance ✨' },
  { key: 'service',     label: 'Service' },
  { key: 'qp',          label: 'Bon rapport qualité-prix' },
  { key: 'intimiste',   label: 'Intimiste' },
  { key: 'revenir',     label: 'À revenir' },
  { key: 'insta',       label: 'Instagrammable' },
  { key: 'insolite',    label: 'Insolite' },
];

const RATING_LABELS: Record<number, string> = {
  1: 'Décevant',
  2: 'Moyen',
  3: 'Correct',
  4: 'Top',
  5: 'Inoubliable',
};

const { width: SCREEN_W } = Dimensions.get('window');

// Light cream/terracotta map style
const MAP_STYLE = [
  {"featureType":"all","elementType":"labels.text.fill","stylers":[{"color":"#6B5D52"}]},
  {"featureType":"all","elementType":"labels.text.stroke","stylers":[{"color":"#FAF7F2"},{"weight":2}]},
  {"featureType":"all","elementType":"labels.icon","stylers":[{"visibility":"off"}]},
  {"featureType":"administrative","elementType":"geometry.fill","stylers":[{"color":"#EDE5D8"}]},
  {"featureType":"administrative","elementType":"geometry.stroke","stylers":[{"color":"#A09181"},{"weight":1.2}]},
  {"featureType":"administrative.locality","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"administrative.neighborhood","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"landscape","elementType":"geometry","stylers":[{"color":"#F5F0E8"}]},
  {"featureType":"poi","elementType":"geometry","stylers":[{"color":"#EDE5D8"}]},
  {"featureType":"poi","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"road.highway","elementType":"geometry.fill","stylers":[{"color":"#FAF7F2"}]},
  {"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#EDE5D8"},{"weight":0.5}]},
  {"featureType":"road.arterial","elementType":"geometry","stylers":[{"color":"#FAF7F2"}]},
  {"featureType":"road.local","elementType":"geometry","stylers":[{"color":"#FAF7F2"}]},
  {"featureType":"transit","elementType":"geometry","stylers":[{"color":"#EDE5D8"}]},
  {"featureType":"transit.line","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"water","elementType":"geometry","stylers":[{"color":"#D4C9BB"}]},
];

const ARRIVAL_THRESHOLD = 50; // meters

function distanceBetween(
  lat1: number, lon1: number, lat2: number, lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface PlaceModeState {
  active: boolean;
  placeIndex: number;
  arrivedAt: Date;
  rating: number;
}

export const DoItNowScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const C = useColors();
  const cityConfig = useCity();

  const { session, plan, arriveAtPlace, nextStop, completeSession } = useDoItNowStore();

  const mapRef = useRef<MapView>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  // Progressive segment polyline state
  const [segmentCoords, setSegmentCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [prevSegmentCoords, setPrevSegmentCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [segmentAlpha, setSegmentAlpha] = useState(1);
  const [prevSegmentAlpha, setPrevSegmentAlpha] = useState(0);
  const [characterPosition, setCharacterPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const prevIndexRef = useRef(0);
  const characterPosRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const segmentCoordsRef = useRef<{ latitude: number; longitude: number }[]>([]);
  const [placeMode, setPlaceMode] = useState<PlaceModeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [arrivedMessage, setArrivedMessage] = useState<string | null>(null);
  // price / time states kept for backward compat with existing handleNextStop,
  // but no longer surfaced in the UI (per editorial review redesign).
  const [placePrice, setPlacePrice] = useState('');
  const [placeTime, setPlaceTime] = useState('');
  const [placeComment, setPlaceComment] = useState('');
  const [timeMode, setTimeMode] = useState<'none' | 'manual' | 'auto'>('none');
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const locationSub = useRef<Location.LocationSubscription | null>(null);

  // Favorites — live subscribe to the store so the toggle re-renders instantly.
  const savedPlaces = useSavedPlacesStore((s) => s.places);
  const savePlace = useSavedPlacesStore((s) => s.savePlace);
  const unsavePlace = useSavedPlacesStore((s) => s.unsavePlace);

  if (!session || !plan) return null;

  const currentIndex = session.currentPlaceIndex;
  const currentPlace = plan.places[currentIndex];
  const isLastPlace = currentIndex === plan.places.length - 1;
  const totalPlaces = plan.places.length;

  // Start location tracking
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      locationSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 3000 },
        (loc) => {
          setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          setLoading(false);
        }
      );
    })();

    return () => {
      locationSub.current?.remove();
    };
  }, []);

  // Fetch initial segment directions + initialize proof character
  useEffect(() => {
    const places = plan.places.filter(p => p.latitude && p.longitude);
    if (places.length < 2) return;

    // Initialize proof character at first place
    const startPos = { latitude: places[0].latitude!, longitude: places[0].longitude! };
    setCharacterPosition(startPos);
    characterPosRef.current = startPos;

    // Fetch directions for first segment (place[0] → place[1])
    const from = { lat: places[0].latitude!, lng: places[0].longitude! };
    const to = { lat: places[1].latitude!, lng: places[1].longitude! };

    getDirections(from, to, 'walking').then((result) => {
      if (result?.overviewPolyline) {
        const coords = decodePolyline(result.overviewPolyline);
        setSegmentCoords(coords);
        segmentCoordsRef.current = coords;
      } else {
        const coords = [startPos, { latitude: places[1].latitude!, longitude: places[1].longitude! }];
        setSegmentCoords(coords);
        segmentCoordsRef.current = coords;
      }
      setSegmentAlpha(1);
    }).catch(() => {
      const coords = [startPos, { latitude: places[1].latitude!, longitude: places[1].longitude! }];
      setSegmentCoords(coords);
      segmentCoordsRef.current = coords;
      setSegmentAlpha(1);
    });

    prevIndexRef.current = 0;
  }, []);

  // Animate segment transition when currentIndex advances
  useEffect(() => {
    const prev = prevIndexRef.current;
    if (currentIndex === prev) return;

    const places = plan.places.filter(p => p.latitude && p.longitude);

    // Move current segment → prev segment (to fade out)
    setPrevSegmentCoords(segmentCoordsRef.current);
    setPrevSegmentAlpha(1);
    setSegmentAlpha(0);

    // Character animation: from place[prev] to place[currentIndex]
    const fromPos = characterPosRef.current || {
      latitude: places[prev]?.latitude || 0,
      longitude: places[prev]?.longitude || 0,
    };
    const toPos = {
      latitude: places[currentIndex]?.latitude || 0,
      longitude: places[currentIndex]?.longitude || 0,
    };

    // 10 discrete steps over 300ms with ease-out quadratic
    const steps = 10;
    const stepDuration = 30;

    for (let i = 1; i <= steps; i++) {
      setTimeout(() => {
        const t = i / steps;
        const ease = 1 - (1 - t) * (1 - t); // ease-out quadratic

        setPrevSegmentAlpha(1 - ease);
        setSegmentAlpha(ease);

        // Interpolate character position
        const lat = fromPos.latitude + (toPos.latitude - fromPos.latitude) * ease;
        const lng = fromPos.longitude + (toPos.longitude - fromPos.longitude) * ease;
        setCharacterPosition({ latitude: lat, longitude: lng });

        if (i === steps) {
          characterPosRef.current = toPos;
          setPrevSegmentCoords([]);
          setPrevSegmentAlpha(0);
        }
      }, i * stepDuration);
    }

    // Fetch new segment route (currentIndex → currentIndex + 1)
    if (currentIndex < places.length - 1) {
      const from = { lat: places[currentIndex].latitude!, lng: places[currentIndex].longitude! };
      const to = { lat: places[currentIndex + 1].latitude!, lng: places[currentIndex + 1].longitude! };

      getDirections(from, to, 'walking').then((result) => {
        if (result?.overviewPolyline) {
          const coords = decodePolyline(result.overviewPolyline);
          segmentCoordsRef.current = coords;
          setSegmentCoords(coords);
        } else {
          const coords = [
            { latitude: places[currentIndex].latitude!, longitude: places[currentIndex].longitude! },
            { latitude: places[currentIndex + 1].latitude!, longitude: places[currentIndex + 1].longitude! },
          ];
          segmentCoordsRef.current = coords;
          setSegmentCoords(coords);
        }
      }).catch(() => {
        const coords = [
          { latitude: places[currentIndex].latitude!, longitude: places[currentIndex].longitude! },
          { latitude: places[currentIndex + 1].latitude!, longitude: places[currentIndex + 1].longitude! },
        ];
        segmentCoordsRef.current = coords;
        setSegmentCoords(coords);
      });
    } else {
      // Last place — clear segment
      setSegmentCoords([]);
      segmentCoordsRef.current = [];
    }

    // Recenter map on new segment after animation completes
    if (currentIndex < places.length - 1) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(
          [
            { latitude: places[currentIndex].latitude!, longitude: places[currentIndex].longitude! },
            { latitude: places[currentIndex + 1].latitude!, longitude: places[currentIndex + 1].longitude! },
          ],
          { edgePadding: { top: 120, right: 60, bottom: 250, left: 60 }, animated: true }
        );
      }, 350);
    }

    prevIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Fetch directions when user location or destination changes
  useEffect(() => {
    if (!userLocation || !currentPlace?.latitude || !currentPlace?.longitude || placeMode) return;

    getDirections(
      { lat: userLocation.latitude, lng: userLocation.longitude },
      { lat: currentPlace.latitude, lng: currentPlace.longitude },
      session.transport
    ).then((result) => {
      if (result) {
        setRoute(result);
        setRouteCoords(decodePolyline(result.overviewPolyline));
      }
    });
  }, [userLocation?.latitude, userLocation?.longitude, currentIndex, placeMode]);

  // Check for arrival
  useEffect(() => {
    if (!userLocation || !currentPlace?.latitude || !currentPlace?.longitude || placeMode) return;

    const dist = distanceBetween(
      userLocation.latitude, userLocation.longitude,
      currentPlace.latitude, currentPlace.longitude
    );

    if (dist < ARRIVAL_THRESHOLD) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      arriveAtPlace(currentIndex);
      setPlaceMode({ active: true, placeIndex: currentIndex, arrivedAt: new Date(), rating: 0 });
      setArrivedMessage(`Bienvenue chez ${currentPlace.name} !`);
      setTimeout(() => setArrivedMessage(null), 3000);
    }
  }, [userLocation]);

  // Hidden timer helper — computes minutes since arrival (snapshot, not live)
  const getHiddenTimerMinutes = (): number => {
    if (!placeMode) return 0;
    return Math.max(1, Math.round((Date.now() - placeMode.arrivedAt.getTime()) / 60000));
  };

  // ── Favorites + quick word helpers for the editorial review screen ──
  const placeFavKey = (p: { googlePlaceId?: string; id: string }) => p.googlePlaceId || p.id;
  const isCurrentPlaceFavorite =
    !!currentPlace && savedPlaces.some((sp) => sp.placeId === placeFavKey(currentPlace));

  const toggleCurrentPlaceFavorite = () => {
    if (!currentPlace) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const key = placeFavKey(currentPlace);
    if (isCurrentPlaceFavorite) {
      unsavePlace(key);
    } else {
      savePlace({
        placeId: key,
        name: currentPlace.name,
        address: currentPlace.address || '',
        types: currentPlace.type ? [currentPlace.type] : [],
        rating: currentPlace.rating || 0,
        reviewCount: currentPlace.reviewCount || 0,
        photoUrl: currentPlace.customPhoto || currentPlace.photoUrls?.[0] || null,
        savedAt: Date.now(),
      });
    }
  };

  const toggleWord = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedWords((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const buildCommentWithTags = (): string | undefined => {
    const tagLabels = QUICK_WORDS
      .filter((w) => selectedWords.has(w.key))
      .map((w) => w.label);
    const rawComment = placeComment.trim();
    if (tagLabels.length === 0 && !rawComment) return undefined;
    const prefix = tagLabels.length > 0 ? tagLabels.join(' · ') : '';
    if (prefix && rawComment) return `${prefix}\n${rawComment}`;
    return prefix || rawComment;
  };

  const resetPlaceModeUi = () => {
    setPlaceMode(null);
    setPlacePrice('');
    setPlaceTime('');
    setPlaceComment('');
    setSelectedWords(new Set());
    setTimeMode('none');
    setRoute(null);
    setRouteCoords([]);
  };

  const handleNextStop = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Save comment (with prepended quick word tags) + rating if rated.
    if (placeMode && placeMode.rating > 0) {
      useDoItNowStore.getState().ratePlace(currentIndex, placeMode.rating, buildCommentWithTags());
    }

    resetPlaceModeUi();

    if (isLastPlace) {
      completeSession();
      navigation.replace(session.isOrganizeMode ? 'OrganizeComplete' : 'DoItNowComplete');
    } else {
      nextStop();
    }
  };

  // "Passer" — skip review entirely (no rating, no comment).
  const handleSkipReview = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetPlaceModeUi();
    if (isLastPlace) {
      completeSession();
      navigation.replace(session.isOrganizeMode ? 'OrganizeComplete' : 'DoItNowComplete');
    } else {
      nextStop();
    }
  };

  const handleManualArrive = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    arriveAtPlace(currentIndex);
    setPlaceMode({ active: true, placeIndex: currentIndex, arrivedAt: new Date(), rating: 0 });
  };



  // Open Google Maps / Apple Maps with turn-by-turn directions
  const openMapsNavigation = () => {
    if (!userLocation || !currentPlace?.latitude || !currentPlace?.longitude) return;
    const mode = session.transport === 'driving' ? 'driving' : session.transport === 'transit' ? 'transit' : session.transport === 'bicycling' ? 'bicycling' : 'walking';

    if (Platform.OS === 'ios') {
      // Try Google Maps first, fallback to Apple Maps
      const gmUrl = `comgooglemaps://?saddr=${userLocation.latitude},${userLocation.longitude}&daddr=${currentPlace.latitude},${currentPlace.longitude}&directionsmode=${mode}`;
      Linking.canOpenURL(gmUrl).then((supported) => {
        if (supported) {
          Linking.openURL(gmUrl);
        } else {
          const amMode = mode === 'driving' ? 'd' : mode === 'transit' ? 'r' : 'w';
          Linking.openURL(`maps://?saddr=${userLocation.latitude},${userLocation.longitude}&daddr=${currentPlace.latitude},${currentPlace.longitude}&dirflg=${amMode}`);
        }
      });
    } else {
      // Android: use Google Maps navigation intent
      const navMode = mode === 'walking' ? 'w' : mode === 'bicycling' ? 'b' : mode === 'transit' ? 'r' : 'd';
      Linking.openURL(`google.navigation:q=${currentPlace.latitude},${currentPlace.longitude}&mode=${navMode}`);
    }
  };

  // Fit map to all places on mount
  useEffect(() => {
    const valid = plan.places.filter(p => p.latitude && p.longitude);
    if (valid.length === 0) return;
    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(
        valid.map(p => ({ latitude: p.latitude!, longitude: p.longitude! })),
        { edgePadding: { top: 120, right: 60, bottom: 250, left: 60 }, animated: false }
      );
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  // Fit map to show user + current segment endpoints
  useEffect(() => {
    if (!userLocation || !currentPlace?.latitude || placeMode) return;
    const coords = [
      userLocation,
      { latitude: currentPlace.latitude!, longitude: currentPlace.longitude! },
    ];
    // Include next place in segment for better framing
    const nextPlace = plan.places[currentIndex + 1];
    if (nextPlace?.latitude && nextPlace?.longitude) {
      coords.push({ latitude: nextPlace.latitude, longitude: nextPlace.longitude });
    }
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 120, right: 60, bottom: 250, left: 60 },
      animated: true,
    });
  }, [userLocation, currentIndex, placeMode]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: C.white }]}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={[styles.loadingText, { color: C.gray600 }]}>Localisation en cours...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: C.white }]}>
      {/* Progress bar */}
      <View style={[styles.progressBar, { paddingTop: insets.top + 6 }]}>
        <View style={styles.progressInfo}>
          <Text style={[styles.progressText, { color: C.primary }]}>
            Lieu {currentIndex + 1} / {totalPlaces}
          </Text>
          <View style={styles.progressDots}>
            {plan.places.map((place, i) => {
              const isCur = i === currentIndex;
              const isDone = i < currentIndex || session.placesVisited.some((v) => v.placeId === place.id);
              return (
                <View
                  key={i}
                  style={{
                    width: isCur ? 12 : 8,
                    height: isCur ? 12 : 8,
                    borderRadius: isCur ? 6 : 4,
                    backgroundColor: isCur ? Colors.primary : isDone ? Colors.primary : Colors.borderMedium,
                    opacity: isCur ? 1 : isDone ? 0.55 : 1,
                  }}
                />
              );
            })}
          </View>
        </View>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Ionicons name="close" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Arrived notification */}
      {arrivedMessage && (
        <View style={[styles.arrivedBanner, { backgroundColor: C.primary }]}>
          <Text style={styles.arrivedText}>{arrivedMessage} 🎉</Text>
        </View>
      )}

      {/* Map — always mounted to preserve tiles between steps */}
      <MapView
        ref={mapRef}
        style={placeMode ? styles.mapHidden : styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        customMapStyle={MAP_STYLE}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterest={false}
        toolbarEnabled={false}
        pointerEvents={placeMode ? 'none' : 'auto'}
      >
          {/* All place markers */}
          {plan.places.map((place, i) => {
            if (!place.latitude || !place.longitude) return null;
            const isCurrent = i === currentIndex;
            const isVisited = i < currentIndex || session.placesVisited.some((v) => v.placeId === place.id);
            return (
              <Marker
                key={`${place.id}-${isCurrent ? 'c' : isVisited ? 'v' : 'f'}`}
                coordinate={{ latitude: place.latitude, longitude: place.longitude }}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges
              >
                <View style={[
                  styles.marker,
                  {
                    backgroundColor: isCurrent ? Colors.primary : isVisited ? Colors.primaryDeep : Colors.terracotta400,
                    borderColor: Colors.white,
                    width: isCurrent ? 32 : 26,
                    height: isCurrent ? 32 : 26,
                    borderRadius: isCurrent ? 16 : 13,
                  },
                ]}>
                  <Text style={[styles.markerText, { fontSize: isCurrent ? 14 : 11 }]}>{i + 1}</Text>
                </View>
              </Marker>
            );
          })}

          {/* Previous segment (fading out during transition) */}
          {prevSegmentCoords.length > 0 && prevSegmentAlpha > 0 && (
            <Polyline
              coordinates={prevSegmentCoords}
              strokeColor={`rgba(196,112,75,${prevSegmentAlpha})`}
              strokeWidth={4}
              lineDashPattern={[0]}
            />
          )}

          {/* Current active segment */}
          {segmentCoords.length > 0 && segmentAlpha > 0 && (
            <Polyline
              coordinates={segmentCoords}
              strokeColor={`rgba(196,112,75,${segmentAlpha})`}
              strokeWidth={4}
              lineDashPattern={[0]}
            />
          )}

          {/* User-to-destination route polyline (dashed) */}
          {routeCoords.length > 0 && (
            <Polyline
              coordinates={routeCoords}
              strokeColor={Colors.primary}
              strokeWidth={3}
              lineDashPattern={[8, 6]}
            />
          )}

          {/* Proof character — animated walker on plan route */}
          {characterPosition && !placeMode && (
            <Marker
              coordinate={characterPosition}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges
            >
              <View style={styles.proofCharacter}>
                <Ionicons name="walk" size={16} color={Colors.textOnAccent} />
              </View>
            </Marker>
          )}
      </MapView>

      {/* ═════════════════ Place review mode — editorial layout ═════════════════ */}
      {placeMode && currentPlace && (
        <View style={[styles.reviewContainer, { backgroundColor: Colors.bgPrimary, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.reviewScroll}
            keyboardShouldPersistTaps="handled"
          >
            {/* Overline */}
            <Text style={styles.reviewOverline}>
              ÉTAPE {currentIndex + 1} / {plan.places.length} TERMINÉE
            </Text>

            {/* Editorial title */}
            <Text style={styles.reviewTitle}>
              Alors,{'\n'}
              <Text style={styles.reviewTitleQuote}>« {currentPlace.name} »</Text> ?
            </Text>

            {/* Subtitle */}
            <Text style={styles.reviewSubtitle}>
              Ton retour aide la communauté à découvrir le vrai {cityConfig.name}.
              {'\n'}Optionnel · tu peux passer.
            </Text>

            {/* Big stars */}
            <View style={styles.reviewStars}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    useDoItNowStore.getState().ratePlace(currentIndex, star);
                    setPlaceMode({ ...placeMode, rating: star });
                  }}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                >
                  <Ionicons
                    name={star <= placeMode.rating ? 'star' : 'star-outline'}
                    size={36}
                    color={star <= placeMode.rating ? Colors.primary : Colors.borderMedium}
                    style={{ marginHorizontal: 4 }}
                  />
                </TouchableOpacity>
              ))}
            </View>
            {placeMode.rating > 0 ? (
              <Text style={styles.reviewRatingLabel}>{RATING_LABELS[placeMode.rating]}</Text>
            ) : (
              <Text style={styles.reviewRatingHint}>Note ton expérience</Text>
            )}

            {/* Favorite card (dark when active) */}
            <TouchableOpacity
              style={[
                styles.favCard,
                isCurrentPlaceFavorite
                  ? { backgroundColor: '#2C2420' }
                  : { backgroundColor: Colors.bgSecondary, borderWidth: 1, borderColor: Colors.borderMedium },
              ]}
              onPress={toggleCurrentPlaceFavorite}
              activeOpacity={0.8}
            >
              <Ionicons
                name="star"
                size={16}
                color={isCurrentPlaceFavorite ? '#F2CF7A' : Colors.textPrimary}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.favCardTitle,
                    { color: isCurrentPlaceFavorite ? Colors.textOnAccent : Colors.textPrimary },
                  ]}
                >
                  {isCurrentPlaceFavorite ? 'Ajouté à tes favoris' : 'Ajouter aux favoris'}
                </Text>
                <Text
                  style={[
                    styles.favCardHint,
                    { color: isCurrentPlaceFavorite ? 'rgba(255, 248, 240, 0.65)' : Colors.textSecondary },
                  ]}
                >
                  Retrouve-le dans Plans → Lieux favoris
                </Text>
              </View>
              {isCurrentPlaceFavorite && (
                <Ionicons name="checkmark" size={16} color="#F2CF7A" />
              )}
            </TouchableOpacity>

            {/* Quick words */}
            <Text style={[styles.reviewOverline, { marginTop: 22, marginBottom: 10 }]}>
              UN MOT RAPIDE ?
            </Text>
            <View style={styles.quickWordsWrap}>
              {QUICK_WORDS.map((word) => {
                const isSelected = selectedWords.has(word.key);
                return (
                  <TouchableOpacity
                    key={word.key}
                    style={[
                      styles.quickWordChip,
                      isSelected
                        ? { backgroundColor: Colors.terracotta100, borderColor: Colors.primary }
                        : { backgroundColor: Colors.bgSecondary, borderColor: Colors.borderSubtle },
                    ]}
                    onPress={() => toggleWord(word.key)}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.quickWordText,
                        { color: isSelected ? Colors.terracotta700 : Colors.textPrimary },
                      ]}
                    >
                      {word.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Comment */}
            <RNTextInput
              style={[styles.reviewCommentInput, { backgroundColor: Colors.bgSecondary, borderColor: placeComment.length > 0 ? Colors.primary : Colors.borderSubtle, color: Colors.textPrimary }]}
              placeholder="Un commentaire, une anecdote ? (optionnel)"
              placeholderTextColor={Colors.textTertiary}
              value={placeComment}
              onChangeText={setPlaceComment}
              multiline
              maxLength={300}
              textAlignVertical="top"
            />
          </ScrollView>

          {/* Footer — Passer / Étape suivante */}
          <View style={[styles.reviewFooter, { borderTopColor: Colors.borderSubtle }]}>
            <TouchableOpacity
              style={styles.reviewSkipBtn}
              onPress={handleSkipReview}
              activeOpacity={0.7}
            >
              <Text style={[styles.reviewSkipText, { color: Colors.textSecondary }]}>Passer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.reviewNextBtn, { backgroundColor: Colors.primary }]}
              onPress={handleNextStop}
              activeOpacity={0.85}
            >
              <Text style={styles.reviewNextText}>
                {isLastPlace ? 'Terminer 🏁' : 'Étape suivante →'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Bottom card (navigation mode) */}
      {!placeMode && currentPlace && (
        <View style={[styles.bottomCard, { backgroundColor: C.white, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.bottomCardHeader}>
            <View style={[styles.bottomCardIndex, { backgroundColor: C.primary }]}>
              <Text style={styles.bottomCardIndexText}>{currentIndex + 1}</Text>
            </View>
            <View style={styles.bottomCardInfo}>
              <Text style={[styles.bottomCardName, { color: C.black }]} numberOfLines={1}>{currentPlace.name}</Text>
              <Text style={[styles.bottomCardType, { color: C.gray600 }]}>{currentPlace.type}</Text>
            </View>
          </View>

          {route && (
            <View style={styles.routeSection}>
              <View style={styles.bottomCardRoute}>
                <Ionicons name="navigate-outline" size={14} color={C.primary} />
                <Text style={[styles.bottomCardRouteText, { color: C.gray700 }]}>
                  {route.distanceText} · {route.durationText}
                </Text>
              </View>
              {route.steps.length > 0 && (
                <View style={[styles.nextStepBox, { backgroundColor: C.gray200, borderColor: C.borderLight }]}>
                  <Ionicons name="arrow-forward-circle" size={16} color={C.primary} />
                  <Text style={[styles.nextStepText, { color: C.gray800 }]} numberOfLines={2}>
                    {route.steps[0].instruction}
                  </Text>
                  <Text style={[styles.nextStepDist, { color: C.gray600 }]}>{route.steps[0].distance}</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.navBtn, { backgroundColor: C.primary }]}
              onPress={openMapsNavigation}
              activeOpacity={0.7}
            >
              <Ionicons name="navigate" size={16} color={Colors.textOnAccent} />
              <Text style={styles.navBtnText}>Itinéraire</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.arrivedBtn, { backgroundColor: C.primary + '15', borderColor: C.primary }]}
              onPress={handleManualArrive}
              activeOpacity={0.7}
            >
              <Text style={[styles.arrivedBtnText, { color: C.primary }]}>Je suis arrivé(e)</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.quoteText, { color: C.gray500 }]}>proof. — discover your city</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, fontFamily: Fonts.body },

  // Progress bar
  progressBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 10, gap: 10, backgroundColor: 'rgba(245,240,232,0.92)' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(44,36,32,0.08)', alignItems: 'center', justifyContent: 'center' },
  progressInfo: { flex: 1, gap: 4 },
  progressText: { fontSize: 13, fontFamily: Fonts.displaySemiBold, textAlign: 'center' },
  progressDots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },

  // Arrived banner
  arrivedBanner: { position: 'absolute', top: 100, left: 20, right: 20, zIndex: 20, paddingVertical: 12, borderRadius: 14, alignItems: 'center' },
  arrivedText: { color: Colors.textOnAccent, fontSize: 15, fontFamily: Fonts.displaySemiBold },

  // Map
  map: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as any,
  mapHidden: { position: 'absolute', width: 1, height: 1, opacity: 0 } as any,

  // Markers
  marker: { borderWidth: 2.5, borderColor: Colors.white, alignItems: 'center', justifyContent: 'center', elevation: 5, shadowColor: 'rgba(44,36,32,1)', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
  markerText: { color: Colors.textOnAccent, fontWeight: '800' },
  proofCharacter: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primary, borderWidth: 2.5, borderColor: Colors.white, alignItems: 'center' as const, justifyContent: 'center' as const, shadowColor: 'rgba(44,36,32,1)', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },

  // Place mode
  placeModeContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 16 },
  placeModeIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  placeModeName: { fontSize: 22, fontFamily: Fonts.displaySemiBold, textAlign: 'center' },
  placeModeType: { fontSize: 14, fontFamily: Fonts.body },
  timeSection: { width: '100%', marginTop: 8 },
  timeLabel: { fontSize: 11, fontFamily: Fonts.body, marginBottom: 8, textAlign: 'center' },
  timeBtnRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  timeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1.5 },
  timeBtnText: { fontSize: 13, fontFamily: Fonts.bodySemiBold },
  timeInputBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, height: 46 },
  timeInput: { flex: 1, fontSize: 20, fontFamily: Fonts.displaySemiBold, textAlign: 'center', paddingVertical: 0 },
  timeUnit: { fontSize: 14, fontFamily: Fonts.bodySemiBold },
  ratingRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  commentInput: {
    width: '100%', marginTop: 10, borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, fontFamily: Fonts.body, maxHeight: 80, minHeight: 40,
  },
  durationChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  durationChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  durationChipText: { fontSize: 12, fontWeight: '600' },
  priceSection: { width: '100%', marginTop: 12, gap: 6 },
  priceLabel: { fontSize: 11, fontFamily: Fonts.body, textAlign: 'center' },
  nextBtn: { width: '100%', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 16 },
  nextBtnText: { color: Colors.textOnAccent, fontSize: 16, fontFamily: Fonts.displaySemiBold },

  // ─────────────────────────────────────────────────────────────
  // Editorial review screen (after arriving at a place)
  // ─────────────────────────────────────────────────────────────
  reviewContainer: {
    flex: 1,
  },
  reviewScroll: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  reviewOverline: {
    fontSize: 10.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  reviewTitle: {
    fontSize: 32,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.6,
    lineHeight: 38,
    marginTop: 10,
  },
  reviewTitleQuote: {
    fontFamily: Fonts.displaySemiBoldItalic,
    color: Colors.textPrimary,
  },
  reviewSubtitle: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    lineHeight: 19,
    marginTop: 14,
  },
  reviewStars: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 30,
  },
  reviewRatingLabel: {
    fontSize: 14,
    fontFamily: Fonts.displayItalic,
    color: Colors.primary,
    textAlign: 'center',
    marginTop: 10,
  },
  reviewRatingHint: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
  favCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 22,
    padding: 14,
    borderRadius: 14,
  },
  favCardTitle: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
  },
  favCardHint: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    marginTop: 2,
  },
  quickWordsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickWordChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: 1.5,
  },
  quickWordText: {
    fontSize: 13,
    fontFamily: Fonts.bodyMedium,
  },
  reviewCommentInput: {
    marginTop: 14,
    minHeight: 88,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    fontSize: 14,
    fontFamily: Fonts.body,
  },
  reviewFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  reviewSkipBtn: {
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  reviewSkipText: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
  },
  reviewNextBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewNextText: {
    color: Colors.textOnAccent,
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
  },

  // Bottom card
  bottomCard: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 18, borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: 'rgba(44,36,32,1)', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 8 },
  bottomCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  bottomCardIndex: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  bottomCardIndexText: { color: Colors.textOnAccent, fontSize: 14, fontWeight: '800' },
  bottomCardInfo: { flex: 1 },
  bottomCardName: { fontSize: 16, fontFamily: Fonts.displaySemiBold },
  bottomCardType: { fontSize: 12, fontFamily: Fonts.body },
  routeSection: { marginBottom: 12, gap: 8 },
  bottomCardRoute: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bottomCardRouteText: { fontSize: 13, fontFamily: Fonts.bodySemiBold },
  nextStepBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  nextStepText: { flex: 1, fontSize: 12, fontFamily: Fonts.body },
  nextStepDist: { fontSize: 11, fontFamily: Fonts.bodySemiBold },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  navBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 12 },
  navBtnText: { color: Colors.textOnAccent, fontSize: 14, fontFamily: Fonts.displaySemiBold },
  arrivedBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  arrivedBtnText: { fontSize: 14, fontFamily: Fonts.displaySemiBold },
  quoteText: { fontSize: 11, fontFamily: Fonts.displayItalic, textAlign: 'center' },
});
