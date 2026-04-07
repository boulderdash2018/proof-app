import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Layout } from '../constants';
import { useColors } from '../hooks/useColors';
import { useDoItNowStore } from '../store/doItNowStore';
import { getDirections, decodePolyline, RouteResult } from '../services/directionsService';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';

const MAP_STYLE = [
  {"featureType":"all","elementType":"geometry","stylers":[{"color":"#E8DDD0"}]},
  {"featureType":"all","elementType":"labels.text.fill","stylers":[{"color":"#8C7A6B"}]},
  {"featureType":"all","elementType":"labels.text.stroke","stylers":[{"color":"#F2EBE2"},{"weight":3}]},
  {"featureType":"all","elementType":"labels.icon","stylers":[{"visibility":"off"}]},
  {"featureType":"poi","stylers":[{"visibility":"off"}]},
  {"featureType":"transit","stylers":[{"visibility":"off"}]},
  {"featureType":"road","elementType":"geometry","stylers":[{"color":"#DED2C3"}]},
  {"featureType":"water","elementType":"geometry.fill","stylers":[{"color":"#B8CAC0"}]},
  {"featureType":"park","elementType":"geometry.fill","stylers":[{"color":"#C8D4AB"}]},
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
  const routeLineRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [placeMode, setPlaceMode] = useState<{ placeIndex: number; arrivedAt: Date; rating: number } | null>(null);
  const [timer, setTimer] = useState(0);
  const [arrived, setArrived] = useState<string | null>(null);

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

  // Fetch route
  useEffect(() => {
    if (!userLoc || !currentPlace?.latitude || !currentPlace?.longitude || placeMode) return;
    getDirections(userLoc, { lat: currentPlace.latitude, lng: currentPlace.longitude }, session.transport).then((r) => {
      setRoute(r);
      if (r && mapObjRef.current) {
        const gm = (window as any).google.maps;
        if (routeLineRef.current) routeLineRef.current.setMap(null);
        const coords = decodePolyline(r.overviewPolyline).map((c) => ({ lat: c.latitude, lng: c.longitude }));
        routeLineRef.current = new gm.Polyline({
          path: coords,
          strokeColor: '#D4845A',
          strokeOpacity: 0.85,
          strokeWeight: 4,
          map: mapObjRef.current,
        });

        const bounds = new gm.LatLngBounds();
        bounds.extend(userLoc);
        bounds.extend({ lat: currentPlace.latitude, lng: currentPlace.longitude });
        mapObjRef.current.fitBounds(bounds, { top: 80, right: 60, bottom: 200, left: 60 });
      }
    });
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

  // Timer
  useEffect(() => {
    if (!placeMode) { setTimer(0); return; }
    const iv = setInterval(() => setTimer(Math.floor((Date.now() - placeMode.arrivedAt.getTime()) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [placeMode]);

  const formatTimer = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const handleNext = () => {
    setPlaceMode(null);
    setRoute(null);
    if (routeLineRef.current) { routeLineRef.current.setMap(null); routeLineRef.current = null; }
    if (isLastPlace) {
      completeSession();
      navigation.replace('DoItNowComplete');
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
        <TouchableOpacity onPress={() => { useDoItNowStore.getState().pauseSession(); navigation.goBack(); }} style={styles.iconBtn}>
          <Ionicons name="pause" size={18} color={C.gray600} />
        </TouchableOpacity>
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
          <View style={[styles.timerBox, { borderColor: C.borderLight }]}>
            <Text style={[styles.timerLabel, { color: C.gray600 }]}>Temps sur place</Text>
            <Text style={[styles.timerValue, { color: C.primary }]}>{formatTimer(timer)}</Text>
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
            <View style={styles.routeInfo}>
              <Ionicons name="navigate-outline" size={14} color={C.primary} />
              <Text style={[styles.routeText, { color: C.gray700 }]}>{route.distanceText} · {route.durationText}</Text>
            </View>
          )}
          <TouchableOpacity style={[styles.arrivedBtn, { backgroundColor: C.primary + '15', borderColor: C.primary }]} onPress={handleManualArrive}>
            <Text style={[styles.arrivedBtnText, { color: C.primary }]}>Je suis arrivé(e)</Text>
          </TouchableOpacity>
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
  timerBox: { borderWidth: 1, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 30, alignItems: 'center', marginTop: 8 },
  timerLabel: { fontSize: 11, fontFamily: Fonts.serif, marginBottom: 4 },
  timerValue: { fontSize: 36, fontFamily: Fonts.serifBold },
  ratingRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  nextBtn: { width: '100%', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 16 },
  nextBtnText: { color: '#FFF', fontSize: 16, fontFamily: Fonts.serifBold },
  bottomCard: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 18, borderTopWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  bottomHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  bottomIndex: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  bottomIndexText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  bottomName: { fontSize: 16, fontFamily: Fonts.serifBold },
  bottomType: { fontSize: 12, fontFamily: Fonts.serif },
  routeInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  routeText: { fontSize: 13, fontFamily: Fonts.serifSemiBold },
  arrivedBtn: { paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', marginBottom: 8 },
  arrivedBtnText: { fontSize: 14, fontFamily: Fonts.serifBold },
  quote: { fontSize: 11, fontFamily: Fonts.serif, textAlign: 'center', fontStyle: 'italic' },
});
