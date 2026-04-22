import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput as RNTextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Layout } from '../constants';
import { useColors } from '../hooks/useColors';
import { useCity } from '../hooks/useCity';
import { useDoItNowStore } from '../store/doItNowStore';
import { useSavedPlacesStore } from '../store/savedPlacesStore';
import { RouteResult } from '../services/directionsService';

// Quick-word chips shown on the editorial review screen.
const QUICK_WORDS: { key: string; label: string }[] = [
  { key: 'ambiance',  label: 'Ambiance ✨' },
  { key: 'service',   label: 'Service' },
  { key: 'qp',        label: 'Bon rapport qualité-prix' },
  { key: 'intimiste', label: 'Intimiste' },
  { key: 'revenir',   label: 'À revenir' },
  { key: 'insta',     label: 'Instagrammable' },
  { key: 'insolite',  label: 'Insolite' },
];

const RATING_LABELS: Record<number, string> = {
  1: 'Décevant',
  2: 'Moyen',
  3: 'Correct',
  4: 'Top',
  5: 'Inoubliable',
};

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

// ── Custom user overlay: 🚶 in a pulsing terracotta circle ──

function injectPulseCSS() {
  if (document.getElementById('proof-pulse-css')) return;
  const style = document.createElement('style');
  style.id = 'proof-pulse-css';
  style.textContent = `@keyframes proofPulse{0%{transform:scale(1);opacity:.45}100%{transform:scale(2.4);opacity:0}}`;
  document.head.appendChild(style);
}

function createUserOverlayClass(gm: any) {
  class ProofUserOverlay extends gm.OverlayView {
    private position_: any;
    private div_: HTMLDivElement | null;
    constructor(position: any, map: any) {
      super();
      this.position_ = position;
      this.div_ = null;
      this.setMap(map);
    }
    onAdd() {
      this.div_ = document.createElement('div');
      this.div_.style.position = 'absolute';
      this.div_.style.pointerEvents = 'none';
      this.div_.innerHTML =
        '<div style="position:relative;width:44px;height:44px;margin:-22px 0 0 -22px;">' +
          '<div style="position:absolute;inset:0;border-radius:50%;background:rgba(196,112,75,0.3);animation:proofPulse 2s ease-out infinite;"></div>' +
          '<div style="position:absolute;top:6px;left:6px;width:32px;height:32px;border-radius:50%;background:#C4704B;border:2.5px solid #FAF7F2;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 8px rgba(44,36,32,0.35);z-index:1;">🚶</div>' +
        '</div>';
      const panes = this.getPanes();
      panes.overlayMouseTarget.appendChild(this.div_);
    }
    draw() {
      if (!this.div_) return;
      const proj = this.getProjection();
      if (!proj) return;
      const px = proj.fromLatLngToDivPixel(this.position_);
      if (px) { this.div_.style.left = px.x + 'px'; this.div_.style.top = px.y + 'px'; }
    }
    setPosition(pos: any) { this.position_ = pos; this.draw(); }
    getPosition() { return this.position_; }
    onRemove() { if (this.div_?.parentNode) this.div_.parentNode.removeChild(this.div_); this.div_ = null; }
  }
  return ProofUserOverlay;
}

function animateOverlayTo(overlay: any, target: any, gm: any, duration = 800) {
  const start = overlay.getPosition();
  if (!start) return;
  const sLat = start.lat(), sLng = start.lng();
  const eLat = target.lat(), eLng = target.lng();
  const t0 = performance.now();
  function step(now: number) {
    const t = Math.min((now - t0) / duration, 1);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    overlay.setPosition(new gm.LatLng(sLat + (eLat - sLat) * ease, sLng + (eLng - sLng) * ease));
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── Marker SVG builder (terracotta, numbered — matches PlanMapModal) ──

function buildPinSVG(index: number, size: number, fill: string): string {
  const r = size / 2 - 1.5;
  const fs = size >= 32 ? 14 : 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="${fill}" stroke="white" stroke-width="2.5"/><text x="${size/2}" y="${size/2 + 4.5}" text-anchor="middle" fill="white" font-size="${fs}" font-weight="700" font-family="-apple-system,sans-serif">${index + 1}</text></svg>`;
}

export const DoItNowScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const C = useColors();
  const cityConfig = useCity();

  const { session, plan, arriveAtPlace, nextStop, completeSession } = useDoItNowStore();
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapObjRef = useRef<any>(null);
  const directionsServiceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const userOverlayRef = useRef<any>(null);
  const justAdvancedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [placeMode, setPlaceMode] = useState<{ placeIndex: number; arrivedAt: Date; rating: number } | null>(null);
  const [arrived, setArrived] = useState<string | null>(null);
  const [placePrice, setPlacePrice] = useState('');
  const [placeTime, setPlaceTime] = useState('');
  const [placeComment, setPlaceComment] = useState('');
  const [timeMode, setTimeMode] = useState<'none' | 'manual' | 'auto'>('none');
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());

  // Favorites — live subscribe to the store so the toggle re-renders instantly.
  const savedPlaces = useSavedPlacesStore((s) => s.places);
  const savePlace = useSavedPlacesStore((s) => s.savePlace);
  const unsavePlace = useSavedPlacesStore((s) => s.unsavePlace);

  if (!session || !plan) return null;

  const currentIndex = session.currentPlaceIndex;
  const currentPlace = plan.places[currentIndex];
  const isLastPlace = currentIndex === plan.places.length - 1;

  // ── Init map: terracotta pins + plan route polyline ──
  useEffect(() => {
    injectPulseCSS();

    loadGM(() => {
      if (!mapDivRef.current) return;
      const gm = (window as any).google.maps;
      const validPlaces = plan.places.filter(p => p.latitude && p.longitude);

      const map = new gm.Map(mapDivRef.current, {
        styles: MAP_STYLE,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
        backgroundColor: '#F5F0E8',
        center: { lat: cityConfig.coordinates.lat, lng: cityConfig.coordinates.lng },
        zoom: 13,
      });
      mapObjRef.current = map;

      // Numbered terracotta markers — same style as PlanMapModal
      markersRef.current = [];
      plan.places.forEach((p, i) => {
        if (!p.latitude || !p.longitude) return;
        const isCurrent = i === currentIndex;
        const size = isCurrent ? 32 : 26;
        const svg = buildPinSVG(i, size, isCurrent ? '#C4704B' : '#D4845A');
        const marker = new gm.Marker({
          position: { lat: p.latitude, lng: p.longitude },
          map,
          icon: { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg), scaledSize: new gm.Size(size, size), anchor: new gm.Point(size / 2, size / 2) },
          zIndex: isCurrent ? 200 : 100 + i,
          clickable: false,
        });
        markersRef.current.push(marker);
      });

      // Plan route polyline via DirectionsService (terracotta, all places connected)
      if (validPlaces.length >= 2) {
        const ds = new gm.DirectionsService();
        const origin = { lat: validPlaces[0].latitude, lng: validPlaces[0].longitude };
        const dest = { lat: validPlaces[validPlaces.length - 1].latitude, lng: validPlaces[validPlaces.length - 1].longitude };
        const waypoints = validPlaces.slice(1, -1).map((p: any) => ({
          location: { lat: p.latitude, lng: p.longitude },
          stopover: true,
        }));
        ds.route({
          origin, destination: dest, waypoints,
          travelMode: gm.TravelMode.WALKING,
          optimizeWaypoints: false,
        }, (result: any, status: string) => {
          if (status === 'OK' && result) {
            result.routes[0].legs.forEach((leg: any) => {
              const path = leg.steps.reduce((acc: any[], step: any) => acc.concat(step.path), []);
              new gm.Polyline({ path, strokeColor: '#C4704B', strokeOpacity: 0.85, strokeWeight: 4, geodesic: true, map, zIndex: 50 });
            });
          } else {
            // Fallback: straight lines
            new gm.Polyline({
              path: validPlaces.map((p: any) => ({ lat: p.latitude, lng: p.longitude })),
              strokeColor: '#C4704B', strokeOpacity: 0.85, strokeWeight: 4, geodesic: true, map, zIndex: 50,
            });
          }
        });
      }

      // Fit bounds to all places
      const bounds = new gm.LatLngBounds();
      validPlaces.forEach((p: any) => bounds.extend({ lat: p.latitude, lng: p.longitude }));
      map.fitBounds(bounds, { top: 80, right: 60, bottom: 250, left: 60 });
      gm.event.addListenerOnce(map, 'bounds_changed', () => { if (map.getZoom() > 15) map.setZoom(15); });

      // DirectionsService for route info (data only, no visual renderer)
      directionsServiceRef.current = new gm.DirectionsService();

      setLoading(false);
    });
  }, []);

  // ── Watch GPS — custom 🚶 overlay ──
  useEffect(() => {
    if (!navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLoc(loc);

        const gm = (window as any).google?.maps;
        if (gm && mapObjRef.current) {
          if (!userOverlayRef.current) {
            const Cls = createUserOverlayClass(gm);
            userOverlayRef.current = new Cls(new gm.LatLng(loc.lat, loc.lng), mapObjRef.current);
          } else {
            userOverlayRef.current.setPosition(new gm.LatLng(loc.lat, loc.lng));
          }
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, []);

  // ── Fetch route info for bottom card (data only — no visual on map) ──
  useEffect(() => {
    if (!userLoc || !currentPlace?.latitude || !currentPlace?.longitude || placeMode) return;
    if (!directionsServiceRef.current) return;
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

          // Pan to show user + destination
          const bounds = new gm.LatLngBounds();
          bounds.extend(userLoc);
          bounds.extend({ lat: currentPlace.latitude, lng: currentPlace.longitude });
          mapObjRef.current?.fitBounds(bounds, { top: 80, right: 60, bottom: 250, left: 60 });
        }
      }
    );
  }, [userLoc?.lat, currentIndex, placeMode]);

  // ── Arrival detection ──
  useEffect(() => {
    if (!userLoc || !currentPlace?.latitude || !currentPlace?.longitude || placeMode) return;
    const dist = distBetween(userLoc.lat, userLoc.lng, currentPlace.latitude, currentPlace.longitude);
    if (dist < ARRIVAL_THRESHOLD) {
      arriveAtPlace(currentIndex);
      // Snap user marker to the place
      const gm = (window as any).google?.maps;
      if (gm && userOverlayRef.current) {
        animateOverlayTo(userOverlayRef.current, new gm.LatLng(currentPlace.latitude, currentPlace.longitude), gm, 500);
      }
      setPlaceMode({ placeIndex: currentIndex, arrivedAt: new Date(), rating: 0 });
      setArrived(`Bienvenue chez ${currentPlace.name} !`);
      setTimeout(() => setArrived(null), 3000);
    }
  }, [userLoc]);

  // ── Update markers when step changes + animate user marker to next destination ──
  useEffect(() => {
    const gm = (window as any).google?.maps;
    if (!gm || markersRef.current.length === 0) return;

    plan.places.forEach((p, i) => {
      if (!p.latitude || !p.longitude || i >= markersRef.current.length) return;
      const isCurrent = i === currentIndex;
      const isVisited = i < currentIndex;
      const size = isCurrent ? 32 : 26;
      const fill = isCurrent ? '#C4704B' : isVisited ? '#A85A38' : '#D4845A';
      const svg = buildPinSVG(i, size, fill);
      markersRef.current[i].setIcon({
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
        scaledSize: new gm.Size(size, size),
        anchor: new gm.Point(size / 2, size / 2),
      });
      markersRef.current[i].setZIndex(isCurrent ? 200 : 100 + i);
    });

    // Animate user marker to the new destination when advancing
    if (justAdvancedRef.current && userOverlayRef.current) {
      const dest = plan.places[currentIndex];
      if (dest?.latitude && dest?.longitude) {
        animateOverlayTo(userOverlayRef.current, new gm.LatLng(dest.latitude, dest.longitude), gm);
      }
      justAdvancedRef.current = false;
    }
  }, [currentIndex]);

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
  };

  const handleNext = () => {
    if (placeMode && placeMode.rating > 0) {
      useDoItNowStore.getState().ratePlace(currentIndex, placeMode.rating, buildCommentWithTags());
    }

    resetPlaceModeUi();

    if (isLastPlace) {
      completeSession();
      navigation.replace(session.isOrganizeMode ? 'OrganizeComplete' : 'DoItNowComplete');
    } else {
      justAdvancedRef.current = true;
      nextStop();
    }
  };

  // "Passer" — skip review entirely (no rating, no comment).
  const handleSkipReview = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    resetPlaceModeUi();
    if (isLastPlace) {
      completeSession();
      navigation.replace(session.isOrganizeMode ? 'OrganizeComplete' : 'DoItNowComplete');
    } else {
      justAdvancedRef.current = true;
      nextStop();
    }
  };

  const handleManualArrive = () => {
    arriveAtPlace(currentIndex);
    // Snap user marker to the place with a smooth animation
    const gm = (window as any).google?.maps;
    if (gm && userOverlayRef.current && currentPlace?.latitude && currentPlace?.longitude) {
      animateOverlayTo(userOverlayRef.current, new gm.LatLng(currentPlace.latitude, currentPlace.longitude), gm, 500);
    }
    setPlaceMode({ placeIndex: currentIndex, arrivedAt: new Date(), rating: 0 });
  };

  return (
    <View style={[styles.container, { backgroundColor: C.white }]}>
      {/* Progress */}
      <View style={[styles.progressBar, { paddingTop: insets.top + 6 }]}>
        <View style={styles.progressInfo}>
          <Text style={[styles.progressText, { color: C.primary }]}>Lieu {currentIndex + 1} / {plan.places.length}</Text>
          <View style={styles.progressDots}>
            {plan.places.map((place, i) => {
              const isCur = i === currentIndex;
              const isDone = i < currentIndex || session.placesVisited.some((v: any) => v.placeId === place.id);
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

      {/* Map — always rendered to preserve instance */}
      <View style={[styles.mapContainer, placeMode ? { position: 'absolute' as any, width: 1, height: 1, overflow: 'hidden' as any } : undefined]}>
        {loading && <ActivityIndicator style={styles.mapLoading} size="large" color={C.primary} />}
        <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />
      </View>

      {/* ═════════════════ Place review mode — editorial layout ═════════════════ */}
      {placeMode && currentPlace ? (
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
              onPress={handleNext}
              activeOpacity={0.85}
            >
              <Text style={styles.reviewNextText}>
                {isLastPlace ? 'Terminer 🏁' : 'Étape suivante →'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

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
              <Ionicons name="navigate" size={16} color={Colors.textOnAccent} />
              <Text style={styles.navBtnText}>Itinéraire</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.arrivedBtn, { backgroundColor: C.primary + '15', borderColor: C.primary }]}
              onPress={handleManualArrive}
              activeOpacity={0.7}
            >
              <Text style={[styles.arrivedBtnText, { color: C.primary }]}>J'y suis ✓</Text>
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
  progressBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 10, gap: 10, backgroundColor: 'rgba(245,240,232,0.92)' },
  iconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(44,36,32,0.08)', alignItems: 'center', justifyContent: 'center' },
  progressInfo: { flex: 1, gap: 4 },
  progressText: { fontSize: 13, fontFamily: Fonts.displaySemiBold, textAlign: 'center' },
  progressDots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  arrivedBanner: { position: 'absolute', top: 100, left: 20, right: 20, zIndex: 20, paddingVertical: 12, borderRadius: 14, alignItems: 'center' },
  arrivedText: { color: Colors.textOnAccent, fontSize: 15, fontFamily: Fonts.displaySemiBold },
  mapContainer: { flex: 1 },
  mapLoading: { position: 'absolute', top: '50%', left: '50%', zIndex: 5 },
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
  // Editorial review screen (web — matches native DoItNowScreen.tsx)
  // ─────────────────────────────────────────────────────────────
  reviewContainer: { flex: 1 },
  reviewScroll: { paddingHorizontal: 24, paddingBottom: 24 },
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
  bottomCard: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 18, borderTopWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  bottomHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  bottomIndex: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  bottomIndexText: { color: Colors.textOnAccent, fontSize: 14, fontWeight: '800' },
  bottomName: { fontSize: 16, fontFamily: Fonts.displaySemiBold },
  bottomType: { fontSize: 12, fontFamily: Fonts.body },
  routeSection: { marginBottom: 12, gap: 8 },
  routeInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  routeText: { fontSize: 13, fontFamily: Fonts.bodySemiBold },
  nextStepBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1 },
  nextStepText: { flex: 1, fontSize: 12, fontFamily: Fonts.body },
  nextStepDist: { fontSize: 11, fontFamily: Fonts.bodySemiBold },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  navBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 12 },
  navBtnText: { color: Colors.textOnAccent, fontSize: 14, fontFamily: Fonts.displaySemiBold },
  arrivedBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  arrivedBtnText: { fontSize: 14, fontFamily: Fonts.displaySemiBold },
  quote: { fontSize: 11, fontFamily: Fonts.displayItalic, textAlign: 'center' },
});
