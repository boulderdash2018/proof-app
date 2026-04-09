import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput as RNTextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Layout } from '../constants';
import { useColors } from '../hooks/useColors';
import { useDoItNowStore } from '../store/doItNowStore';
import { RouteResult } from '../services/directionsService';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';

// Map transport mode to Google Maps JS API TravelMode
function getTravelMode(mode: string): string {
  switch (mode) {
    case 'driving': return 'DRIVING';
    case 'transit': return 'TRANSIT';
    case 'bicycling': return 'BICYCLING';
    default: return 'WALKING';
  }
}

// Map transport mode for Google Maps URL
function getUrlTravelMode(mode: string): string {
  switch (mode) {
    case 'driving': return 'driving';
    case 'transit': return 'transit';
    case 'bicycling': return 'bicycling';
    default: return 'walking';
  }
}

// halilibrahimbayındır 3 — warm vintage map style
const MAP_STYLE = [
  {"featureType":"all","elementType":"all","stylers":[{"lightness":"69"},{"saturation":"100"},{"weight":"1.17"},{"gamma":"2.04"}]},
  {"featureType":"all","elementType":"geometry.stroke","stylers":[{"visibility":"on"},{"color":"#000000"}]},
  {"featureType":"all","elementType":"labels","stylers":[{"lightness":"66"},{"saturation":"100"},{"visibility":"on"}]},
  {"featureType":"all","elementType":"labels.text","stylers":[{"visibility":"off"}]},
  {"featureType":"all","elementType":"labels.text.fill","stylers":[{"gamma":0.01},{"lightness":20},{"color":"#98290e"}]},
  {"featureType":"all","elementType":"labels.text.stroke","stylers":[{"weight":2},{"visibility":"on"},{"color":"#d4b78f"}]},
  {"featureType":"all","elementType":"labels.icon","stylers":[{"visibility":"off"}]},
  {"featureType":"administrative.province","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"administrative.locality","elementType":"labels.text.fill","stylers":[{"visibility":"on"},{"color":"#98290e"}]},
  {"featureType":"administrative.locality","elementType":"labels.text.stroke","stylers":[{"visibility":"off"},{"color":"#d4b78f"}]},
  {"featureType":"administrative.locality","elementType":"labels.icon","stylers":[{"visibility":"off"}]},
  {"featureType":"administrative.neighborhood","elementType":"all","stylers":[{"visibility":"on"}]},
  {"featureType":"administrative.neighborhood","elementType":"labels.icon","stylers":[{"visibility":"off"}]},
  {"featureType":"landscape","elementType":"all","stylers":[{"weight":"2.45"},{"visibility":"on"},{"color":"#d4b78f"}]},
  {"featureType":"landscape","elementType":"labels.icon","stylers":[{"visibility":"off"}]},
  {"featureType":"poi","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"poi.park","elementType":"geometry.fill","stylers":[{"visibility":"on"},{"color":"#908d5c"}]},
  {"featureType":"road.highway","elementType":"geometry.fill","stylers":[{"visibility":"on"},{"color":"#684e2a"}]},
  {"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"visibility":"on"},{"color":"#684e2a"}]},
  {"featureType":"road.arterial","elementType":"geometry","stylers":[{"visibility":"on"},{"color":"#684e2a"}]},
  {"featureType":"road.local","elementType":"geometry.fill","stylers":[{"visibility":"on"},{"color":"#967f5e"}]},
  {"featureType":"road.local","elementType":"geometry.stroke","stylers":[{"visibility":"on"},{"color":"#967f5e"}]},
  {"featureType":"transit","elementType":"geometry","stylers":[{"visibility":"on"},{"color":"#807676"}]},
  {"featureType":"transit","elementType":"geometry.stroke","stylers":[{"visibility":"off"}]},
  {"featureType":"transit","elementType":"labels.icon","stylers":[{"visibility":"off"}]},
  {"featureType":"water","elementType":"all","stylers":[{"lightness":-20},{"color":"#a8ac91"}]},
];

let gmLoaded = false;
let gmLoading = false;
const gmCallbacks: (() => void)[] = [];

function loadGM(cb: () => void) {
  if (gmLoaded && (window as any).google?.maps) { cb(); return; }
  gmCallbacks.push(cb);
  if (gmLoading) return;
  gmLoading = true;
  (window as any).__dinGmCb = () => { gmLoaded = true; gmLoading = false; gmCallbacks.forEach(c => c()); gmCallbacks.length = 0; };
  const s = document.createElement('script');
  s.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&callback=__dinGmCb`;
  s.async = true; s.defer = true;
  document.head.appendChild(s);
}

const ARRIVAL_THRESHOLD = 50;

function distBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const DoItNowScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const C = useColors();

  const { session, plan, arriveAtPlace, nextStop, completeSession } = useDoItNowStore();
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapObjRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const directionsServiceRef = useRef<any>(null);
  const directionsRendererRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [placeMode, setPlaceMode] = useState<{ placeIndex: number; arrivedAt: Date; rating: number } | null>(null);
  const [arrived, setArrived] = useState<string | null>(null);
  const [placePrice, setPlacePrice] = useState('');
  const [placeTime, setPlaceTime] = useState('');
  const [timeMode, setTimeMode] = useState<'none' | 'manual' | 'auto'>('none');

  if (!session || !plan) return null;

  const currentIndex = session.currentPlaceIndex;
  const currentPlace = plan.places[currentIndex];
  const isLastPlace = currentIndex === plan.places.length - 1;

  // Init map
  useEffect(() => {
    loadGM(() => {
      if (!mapDivRef.current) return;
      const gm = (window as any).google.maps;
      const map = new gm.Map(mapDivRef.current, {
        styles: MAP_STYLE,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
        backgroundColor: '#E8DDD0',
        center: { lat: 48.8566, lng: 2.3522 },
        zoom: 13,
      });
      mapObjRef.current = map;

      // Place markers
      plan.places.forEach((p, i) => {
        if (!p.latitude || !p.longitude) return;
        const isCurrent = i === currentIndex;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="13" fill="${isCurrent ? '%23D4845A' : '%235A5249'}" stroke="white" stroke-width="2"/><text x="14" y="18.5" text-anchor="middle" fill="white" font-size="12" font-weight="700" font-family="sans-serif">${i + 1}</text></svg>`;
        new gm.Marker({
          position: { lat: p.latitude, lng: p.longitude },
          map,
          icon: { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg), scaledSize: new gm.Size(isCurrent ? 32 : 26, isCurrent ? 32 : 26), anchor: new gm.Point(isCurrent ? 16 : 13, isCurrent ? 16 : 13) },
          zIndex: isCurrent ? 200 : 100 + i,
        });
      });

      // Initialize DirectionsService & DirectionsRenderer for route display
      directionsServiceRef.current = new gm.DirectionsService();
      directionsRendererRef.current = new gm.DirectionsRenderer({
        map,
        suppressMarkers: true, // We use our own numbered markers
        polylineOptions: {
          strokeColor: '#D4845A',
          strokeOpacity: 0.9,
          strokeWeight: 5,
        },
        preserveViewport: true,
      });

      setLoading(false);
    });
  }, []);

  // Watch GPS
  useEffect(() => {
    if (!navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLoc(loc);

        // Update user marker on map
        const gm = (window as any).google?.maps;
        if (gm && mapObjRef.current) {
          if (!userMarkerRef.current) {
            userMarkerRef.current = new gm.Marker({
              position: loc,
              map: mapObjRef.current,
              icon: {
                path: gm.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#4A90D9',
                fillOpacity: 1,
                strokeColor: '#FFF',
                strokeWeight: 3,
              },
              zIndex: 999,
            });
          } else {
            userMarkerRef.current.setPosition(loc);
          }
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, []);

  // Fetch route using Google Maps JS API DirectionsService (avoids CORS issues)
  useEffect(() => {
    if (!userLoc || !currentPlace?.latitude || !currentPlace?.longitude || placeMode) return;
    if (!directionsServiceRef.current || !directionsRendererRef.current) return;

    const gm = (window as any).google?.maps;
    if (!gm) return;

    directionsServiceRef.current.route(
      {
        origin: userLoc,
        destination: { lat: currentPlace.latitude, lng: currentPlace.longitude },
        travelMode: gm.TravelMode[getTravelMode(session.transport)],
      },
      (result: any, status: any) => {
        if (status === 'OK' && result) {
          directionsRendererRef.current.setDirections(result);
          const leg = result.routes[0].legs[0];
          setRoute({
            distanceText: leg.distance.text,
            durationText: leg.duration.text,
            distanceMeters: leg.distance.value,
            durationSeconds: leg.duration.value,
            overviewPolyline: '',
            steps: leg.steps.map((s: any) => ({
              startLocation: { lat: s.start_location.lat(), lng: s.start_location.lng() },
              endLocation: { lat: s.end_location.lat(), lng: s.end_location.lng() },
              polyline: '',
              distance: s.distance.text,
              duration: s.duration.text,
              instruction: s.instructions?.replace(/<[^>]+>/g, '') || '',
            })),
          });

          // Fit bounds to show user + destination
          const bounds = new gm.LatLngBounds();
          bounds.extend(userLoc);
          bounds.extend({ lat: currentPlace.latitude, lng: currentPlace.longitude });
          mapObjRef.current?.fitBounds(bounds, { top: 80, right: 60, bottom: 250, left: 60 });
        }
      }
    );
  }, [userLoc?.lat, currentIndex, placeMode]);

  // Arrival detection
  useEffect(() => {
    if (!userLoc || !currentPlace?.latitude || !currentPlace?.longitude || placeMode) return;
    const dist = distBetween(userLoc.lat, userLoc.lng, currentPlace.latitude, currentPlace.longitude);
    if (dist < ARRIVAL_THRESHOLD) {
      arriveAtPlace(currentIndex);
      setPlaceMode({ placeIndex: currentIndex, arrivedAt: new Date(), rating: 0 });
      setArrived(`Bienvenue chez ${currentPlace.name} !`);
      setTimeout(() => setArrived(null), 3000);
    }
  }, [userLoc]);

  // Hidden timer helper — snapshot, not live
  const getHiddenTimerMinutes = (): number => {
    if (!placeMode) return 0;
    return Math.max(1, Math.round((Date.now() - placeMode.arrivedAt.getTime()) / 60000));
  };

  // Open Google Maps with turn-by-turn navigation
  const openGoogleMapsNav = () => {
    if (!userLoc || !currentPlace?.latitude || !currentPlace?.longitude) return;
    const mode = getUrlTravelMode(session.transport);
    const url = `https://www.google.com/maps/dir/?api=1&origin=${userLoc.lat},${userLoc.lng}&destination=${currentPlace.latitude},${currentPlace.longitude}&travelmode=${mode}`;
    window.open(url, '_blank');
  };

  const handleNext = () => {
    // Save price if in organize mode
    if (session.isOrganizeMode && placePrice) {
      useDoItNowStore.getState().setPriceForPlace(currentIndex, parseFloat(placePrice) || 0);
    }
    // Save time spent
    if (placeTime) {
      useDoItNowStore.getState().setTimeForPlace(currentIndex, parseInt(placeTime, 10) || 0);
    }

    setPlaceMode(null);
    setPlacePrice('');
    setPlaceTime('');
    setTimeMode('none');
    setRoute(null);
    if (directionsRendererRef.current) directionsRendererRef.current.setDirections({ routes: [] });
    if (isLastPlace) {
      completeSession();
      navigation.replace(session.isOrganizeMode ? 'OrganizeComplete' : 'DoItNowComplete');
    } else {
      nextStop();
    }
  };

  const handleManualArrive = () => {
    arriveAtPlace(currentIndex);
    setPlaceMode({ placeIndex: currentIndex, arrivedAt: new Date(), rating: 0 });
  };

  return (
    <View style={[styles.container, { backgroundColor: C.white }]}>
      {/* Progress */}
      <View style={[styles.progressBar, { paddingTop: insets.top + 6 }]}>
        <View style={styles.progressInfo}>
          <Text style={[styles.progressText, { color: C.primary }]}>Lieu {currentIndex + 1} / {plan.places.length}</Text>
          <View style={[styles.progressTrack, { backgroundColor: C.gray300 }]}>
            <View style={[styles.progressFill, { width: `${((currentIndex + (placeMode ? 1 : 0)) / plan.places.length) * 100}%`, backgroundColor: C.primary }]} />
          </View>
        </View>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Ionicons name="close" size={20} color={C.gray600} />
        </TouchableOpacity>
      </View>

      {/* Arrived banner */}
      {arrived && (
        <View style={[styles.arrivedBanner, { backgroundColor: C.primary }]}>
          <Text style={styles.arrivedText}>{arrived} 🎉</Text>
        </View>
      )}

      {/* Map or Place Mode */}
      {placeMode && currentPlace ? (
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
              <View style={[styles.timeInputBox, { backgroundColor: C.gray200, borderColor: C.borderLight }]}>
                <RNTextInput
                  style={[styles.timeInput, { color: C.black }]}
                  placeholder="0"
                  placeholderTextColor={C.gray500}
                  keyboardType="numeric"
                  value={placeTime}
                  onChangeText={setPlaceTime}
                  autoFocus={timeMode === 'manual'}
                />
                <Text style={[styles.timeUnit, { color: C.gray600 }]}>min</Text>
                <TouchableOpacity onPress={() => { setTimeMode('none'); setPlaceTime(''); }}>
                  <Ionicons name="close-circle" size={18} color={C.gray500} />
                </TouchableOpacity>
              </View>
            )}
          </View>
          <View style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity key={star} onPress={() => {
                useDoItNowStore.getState().ratePlace(currentIndex, star);
                setPlaceMode({ ...placeMode, rating: star });
              }}>
                <Ionicons name={star <= placeMode.rating ? 'star' : 'star-outline'} size={32} color={star <= placeMode.rating ? Colors.gold : C.gray500} />
              </TouchableOpacity>
            ))}
          </View>
          {session.isOrganizeMode && (
            <View style={styles.priceSection}>
              <Text style={[styles.priceLabel, { color: C.gray600 }]}>Prix payé</Text>
              <View style={[styles.priceInputBox, { backgroundColor: C.gray200, borderColor: C.borderLight }]}>
                <RNTextInput
                  style={[styles.priceInput, { color: C.black }]}
                  placeholder="0"
                  placeholderTextColor={C.gray500}
                  keyboardType="numeric"
                  value={placePrice}
                  onChangeText={setPlacePrice}
                />
                <Text style={[styles.priceUnit, { color: C.gray600 }]}>€</Text>
              </View>
            </View>
          )}
          <TouchableOpacity style={[styles.nextBtn, { backgroundColor: C.primary }]} onPress={handleNext}>
            <Text style={styles.nextBtnText}>{isLastPlace ? 'Terminer le plan 🏁' : 'Prochain arrêt →'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.mapContainer}>
          {loading && <ActivityIndicator style={styles.mapLoading} size="large" color={C.primary} />}
          <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />
        </View>
      )}

      {/* Bottom card */}
      {!placeMode && currentPlace && (
        <View style={[styles.bottomCard, { backgroundColor: C.white, borderTopColor: C.borderLight }]}>
          <View style={styles.bottomHeader}>
            <View style={[styles.bottomIndex, { backgroundColor: C.primary }]}>
              <Text style={styles.bottomIndexText}>{currentIndex + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bottomName, { color: C.black }]} numberOfLines={1}>{currentPlace.name}</Text>
              <Text style={[styles.bottomType, { color: C.gray600 }]}>{currentPlace.type}</Text>
            </View>
          </View>
          {route && (
            <View style={styles.routeSection}>
              <View style={styles.routeInfo}>
                <Ionicons name="navigate-outline" size={14} color={C.primary} />
                <Text style={[styles.routeText, { color: C.gray700 }]}>{route.distanceText} · {route.durationText}</Text>
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
              onPress={openGoogleMapsNav}
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
          <Text style={[styles.quote, { color: C.gray500 }]}>proof. — discover your city</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  progressBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 10, gap: 10, backgroundColor: 'rgba(28,25,23,0.85)' },
  iconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  progressInfo: { flex: 1, gap: 4 },
  progressText: { fontSize: 13, fontFamily: Fonts.serifBold, textAlign: 'center' },
  progressTrack: { height: 4, borderRadius: 2 },
  progressFill: { height: 4, borderRadius: 2 },
  arrivedBanner: { position: 'absolute', top: 100, left: 20, right: 20, zIndex: 20, paddingVertical: 12, borderRadius: 14, alignItems: 'center' },
  arrivedText: { color: '#FFF', fontSize: 15, fontFamily: Fonts.serifBold },
  mapContainer: { flex: 1 },
  mapLoading: { position: 'absolute', top: '50%', left: '50%', zIndex: 5 },
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
  priceSection: { alignItems: 'center', marginTop: 12, gap: 6 },
  priceLabel: { fontSize: 11, fontFamily: Fonts.serif },
  priceInputBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 16, height: 44, minWidth: 120 },
  priceInput: { flex: 1, fontSize: 18, fontFamily: Fonts.serifBold, textAlign: 'center', paddingVertical: 0 },
  priceUnit: { fontSize: 16, fontFamily: Fonts.serifBold, marginLeft: 4 },
  nextBtn: { width: '100%', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 16 },
  nextBtnText: { color: '#FFF', fontSize: 16, fontFamily: Fonts.serifBold },
  bottomCard: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 18, borderTopWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  bottomHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  bottomIndex: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  bottomIndexText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  bottomName: { fontSize: 16, fontFamily: Fonts.serifBold },
  bottomType: { fontSize: 12, fontFamily: Fonts.serif },
  routeSection: { marginBottom: 12, gap: 8 },
  routeInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  routeText: { fontSize: 13, fontFamily: Fonts.serifSemiBold },
  nextStepBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  nextStepText: { flex: 1, fontSize: 12, fontFamily: Fonts.serif },
  nextStepDist: { fontSize: 11, fontFamily: Fonts.serifSemiBold },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  navBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 12 },
  navBtnText: { color: '#FFF', fontSize: 14, fontFamily: Fonts.serifBold },
  arrivedBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  arrivedBtnText: { fontSize: 14, fontFamily: Fonts.serifBold },
  quote: { fontSize: 11, fontFamily: Fonts.serif, textAlign: 'center', fontStyle: 'italic' },
});
