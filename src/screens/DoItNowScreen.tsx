import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
import { getDirections, decodePolyline, RouteResult } from '../services/directionsService';
import { Plan, DoItNowTransport } from '../types';
import { useCity } from '../hooks/useCity';

const { width: SCREEN_W } = Dimensions.get('window');

// Enegry by Schloesser David — dark mode, gold labels
const MAP_STYLE = [
  {"featureType":"all","elementType":"labels.text.fill","stylers":[{"saturation":36},{"color":"#ffa600"},{"lightness":40}]},
  {"featureType":"all","elementType":"labels.text.stroke","stylers":[{"visibility":"off"},{"lightness":16},{"hue":"#ff0000"}]},
  {"featureType":"all","elementType":"labels.icon","stylers":[{"visibility":"off"}]},
  {"featureType":"administrative","elementType":"geometry.fill","stylers":[{"color":"#000000"},{"lightness":20}]},
  {"featureType":"administrative","elementType":"geometry.stroke","stylers":[{"color":"#000000"},{"lightness":17},{"weight":1.2}]},
  {"featureType":"administrative.locality","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"administrative.neighborhood","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"landscape","elementType":"geometry","stylers":[{"color":"#000000"},{"lightness":20}]},
  {"featureType":"poi","elementType":"geometry","stylers":[{"color":"#000000"},{"lightness":21}]},
  {"featureType":"poi","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"road.highway","elementType":"geometry.fill","stylers":[{"color":"#000000"},{"lightness":17}]},
  {"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#000000"},{"lightness":29},{"weight":0.2}]},
  {"featureType":"road.arterial","elementType":"geometry","stylers":[{"color":"#000000"},{"lightness":18}]},
  {"featureType":"road.local","elementType":"geometry","stylers":[{"color":"#000000"},{"lightness":16}]},
  {"featureType":"transit","elementType":"geometry","stylers":[{"color":"#000000"},{"lightness":19}]},
  {"featureType":"transit.line","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"water","elementType":"geometry","stylers":[{"color":"#000000"},{"lightness":17}]},
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
  const [placeMode, setPlaceMode] = useState<PlaceModeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [arrivedMessage, setArrivedMessage] = useState<string | null>(null);
  const [placePrice, setPlacePrice] = useState('');
  const [placeTime, setPlaceTime] = useState('');
  const [placeComment, setPlaceComment] = useState('');
  const [timeMode, setTimeMode] = useState<'none' | 'manual' | 'auto'>('none');
  const locationSub = useRef<Location.LocationSubscription | null>(null);

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

  const handleNextStop = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Save price if in organize mode
    if (session.isOrganizeMode && placePrice) {
      useDoItNowStore.getState().setPriceForPlace(currentIndex, parseFloat(placePrice) || 0);
    }
    // Save time spent
    if (placeTime) {
      useDoItNowStore.getState().setTimeForPlace(currentIndex, parseInt(placeTime, 10) || 0);
    }
    // Save comment with rating
    if (placeMode && placeMode.rating > 0) {
      useDoItNowStore.getState().ratePlace(currentIndex, placeMode.rating, placeComment.trim() || undefined);
    }

    setPlaceMode(null);
    setPlacePrice('');
    setPlaceTime('');
    setPlaceComment('');
    setTimeMode('none');
    setRoute(null);
    setRouteCoords([]);

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

  // Fit map to show user + destination
  useEffect(() => {
    if (!userLocation || !currentPlace?.latitude || placeMode) return;
    mapRef.current?.fitToCoordinates(
      [
        userLocation,
        { latitude: currentPlace.latitude!, longitude: currentPlace.longitude! },
      ],
      { edgePadding: { top: 120, right: 60, bottom: 250, left: 60 }, animated: true }
    );
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
                    backgroundColor: isCur ? Colors.gold : isDone ? Colors.gold : 'rgba(255,255,255,0.25)',
                    opacity: isCur ? 1 : isDone ? 0.55 : 1,
                  }}
                />
              );
            })}
          </View>
        </View>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Ionicons name="close" size={20} color={C.gray600} />
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
            const isVisited = session.placesVisited.some((v) => v.placeId === place.id);
            return (
              <Marker
                key={place.id}
                coordinate={{ latitude: place.latitude, longitude: place.longitude }}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={[
                  styles.marker,
                  {
                    backgroundColor: isCurrent ? Colors.gold : isVisited ? Colors.gold + '80' : Colors.gray500,
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

          {/* Route polyline */}
          {routeCoords.length > 0 && (
            <Polyline
              coordinates={routeCoords}
              strokeColor={Colors.primary}
              strokeWidth={4}
            />
          )}
      </MapView>

      {/* Place mode */}
      {placeMode && currentPlace && (
        <View style={[styles.placeModeContainer, { backgroundColor: C.white }]}>
          <View style={[styles.placeModeIcon, { backgroundColor: C.primary + '15' }]}>
            <Ionicons name="location" size={32} color={C.primary} />
          </View>
          <Text style={[styles.placeModeName, { color: C.black }]}>{currentPlace.name}</Text>
          <Text style={[styles.placeModeType, { color: C.gray600 }]}>{currentPlace.type}</Text>

          {/* Time spent section */}
          <View style={styles.timeSection}>
            <Text style={[styles.timeLabel, { color: C.gray600 }]}>Temps sur place</Text>
            {timeMode === 'none' ? (
              <View style={styles.timeBtnRow}>
                <TouchableOpacity
                  style={[styles.timeBtn, { backgroundColor: C.gray200, borderColor: C.borderLight }]}
                  onPress={() => setTimeMode('manual')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="pencil-outline" size={16} color={C.gray700} />
                  <Text style={[styles.timeBtnText, { color: C.gray800 }]}>Remplir</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.timeBtn, { backgroundColor: C.primary + '15', borderColor: C.primary + '30' }]}
                  onPress={() => {
                    const mins = getHiddenTimerMinutes();
                    setPlaceTime(String(mins));
                    setTimeMode('auto');
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="timer-outline" size={16} color={C.primary} />
                  <Text style={[styles.timeBtnText, { color: C.primary }]}>Calculer</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <View style={styles.durationChipsRow}>
                  {['15', '30', '45', '60', '90', '120', '180'].map((preset) => {
                    const isSelected = placeTime === preset;
                    const n = parseInt(preset, 10);
                    const label = n < 60 ? `${n}min` : n % 60 === 0 ? `${n / 60}h` : `${Math.floor(n / 60)}h${(n % 60).toString().padStart(2, '0')}`;
                    return (
                      <TouchableOpacity
                        key={preset}
                        style={[styles.durationChip, { backgroundColor: isSelected ? C.primary : C.gray200 }]}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPlaceTime(preset); setTimeMode('manual'); }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.durationChipText, { color: isSelected ? '#FFF' : C.gray800 }]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity onPress={() => { setTimeMode('none'); setPlaceTime(''); }} style={{ alignSelf: 'flex-end', marginTop: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={C.gray500} />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Rating */}
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => {
                  useDoItNowStore.getState().ratePlace(currentIndex, star);
                  setPlaceMode({ ...placeMode, rating: star });
                }}
              >
                <Ionicons
                  name={star <= placeMode.rating ? 'star' : 'star-outline'}
                  size={32}
                  color={star <= placeMode.rating ? C.gold : C.gray500}
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* Comment (appears when rated) */}
          {placeMode.rating > 0 && (
            <RNTextInput
              style={[styles.commentInput, { color: C.black, backgroundColor: C.gray200, borderColor: C.borderLight }]}
              placeholder="Un commentaire ? (optionnel)"
              placeholderTextColor={C.gray500}
              value={placeComment}
              onChangeText={setPlaceComment}
              multiline
              maxLength={300}
            />
          )}

          {/* Price input — organize mode only */}
          {session.isOrganizeMode && (
            <View style={styles.priceSection}>
              <Text style={[styles.priceLabel, { color: C.gray600 }]}>Prix payé</Text>
              <View style={styles.durationChipsRow}>
                {[
                  { label: 'Gratuit', value: '0' },
                  { label: `< 15${cityConfig.currency}`, value: '10' },
                  { label: `15–30${cityConfig.currency}`, value: '22' },
                  { label: `30–60${cityConfig.currency}`, value: '45' },
                  { label: `60–100${cityConfig.currency}`, value: '80' },
                  { label: `100${cityConfig.currency}+`, value: '120' },
                ].map((chip) => {
                  const isSelected = placePrice === chip.value;
                  return (
                    <TouchableOpacity
                      key={chip.value}
                      style={[styles.durationChip, { backgroundColor: isSelected ? C.primary : C.gray200 }]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPlacePrice(chip.value); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.durationChipText, { color: isSelected ? '#FFF' : C.gray800 }]}>{chip.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: C.primary }]}
            onPress={handleNextStop}
            activeOpacity={0.8}
          >
            <Text style={styles.nextBtnText}>
              {isLastPlace ? 'Terminer le plan 🏁' : 'Prochain arrêt →'}
            </Text>
          </TouchableOpacity>
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
              <Ionicons name="navigate" size={16} color="#FFF" />
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
  loadingText: { fontSize: 14, fontFamily: Fonts.serif },

  // Progress bar
  progressBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 10, gap: 10, backgroundColor: 'rgba(28,25,23,0.85)' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  progressInfo: { flex: 1, gap: 4 },
  progressText: { fontSize: 13, fontFamily: Fonts.serifBold, textAlign: 'center' },
  progressDots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },

  // Arrived banner
  arrivedBanner: { position: 'absolute', top: 100, left: 20, right: 20, zIndex: 20, paddingVertical: 12, borderRadius: 14, alignItems: 'center' },
  arrivedText: { color: '#FFF', fontSize: 15, fontFamily: Fonts.serifBold },

  // Map
  map: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as any,
  mapHidden: { position: 'absolute', width: 1, height: 1, opacity: 0 } as any,

  // Markers
  marker: { borderWidth: 2.5, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
  markerText: { color: '#FFF', fontWeight: '800' },

  // Place mode
  placeModeContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 16 },
  placeModeIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  placeModeName: { fontSize: 22, fontFamily: Fonts.serifBold, textAlign: 'center' },
  placeModeType: { fontSize: 14, fontFamily: Fonts.serif },
  timeSection: { width: '100%', marginTop: 8 },
  timeLabel: { fontSize: 11, fontFamily: Fonts.serif, marginBottom: 8, textAlign: 'center' },
  timeBtnRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  timeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1.5 },
  timeBtnText: { fontSize: 13, fontFamily: Fonts.serifSemiBold },
  timeInputBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, height: 46 },
  timeInput: { flex: 1, fontSize: 20, fontFamily: Fonts.serifBold, textAlign: 'center', paddingVertical: 0 },
  timeUnit: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
  ratingRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  commentInput: {
    width: '100%', marginTop: 10, borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, fontFamily: Fonts.serif, maxHeight: 80, minHeight: 40,
  },
  durationChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  durationChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  durationChipText: { fontSize: 12, fontWeight: '600' },
  priceSection: { width: '100%', marginTop: 12, gap: 6 },
  priceLabel: { fontSize: 11, fontFamily: Fonts.serif, textAlign: 'center' },
  nextBtn: { width: '100%', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 16 },
  nextBtnText: { color: '#FFF', fontSize: 16, fontFamily: Fonts.serifBold },

  // Bottom card
  bottomCard: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 18, borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 8 },
  bottomCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  bottomCardIndex: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  bottomCardIndexText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  bottomCardInfo: { flex: 1 },
  bottomCardName: { fontSize: 16, fontFamily: Fonts.serifBold },
  bottomCardType: { fontSize: 12, fontFamily: Fonts.serif },
  routeSection: { marginBottom: 12, gap: 8 },
  bottomCardRoute: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bottomCardRouteText: { fontSize: 13, fontFamily: Fonts.serifSemiBold },
  nextStepBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  nextStepText: { flex: 1, fontSize: 12, fontFamily: Fonts.serif },
  nextStepDist: { fontSize: 11, fontFamily: Fonts.serifSemiBold },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  navBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 12 },
  navBtnText: { color: '#FFF', fontSize: 14, fontFamily: Fonts.serifBold },
  arrivedBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  arrivedBtnText: { fontSize: 14, fontFamily: Fonts.serifBold },
  quoteText: { fontSize: 11, fontFamily: Fonts.serif, textAlign: 'center', fontStyle: 'italic' },
});
