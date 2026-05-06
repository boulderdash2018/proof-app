import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { useCity } from '../hooks/useCity';
import { useSocialProofStore } from '../store/socialProofStore';
import { useAuthStore, useSavedPlacesStore, useSavesStore, useFeedStore } from '../store';
import { fetchFriendsMapPlans } from '../services/plansService';
import { fetchMyPlansForMap } from '../services/myPlacesService';
import { Avatar } from '../components/Avatar';
import { Plan, Place } from '../types';
import { loadGoogleMaps } from '../utils/loadGoogleMaps';

import type { MinimalUser } from '../store/socialProofStore';

const { height: SCREEN_H } = Dimensions.get('window');

// ── Map region type (mirrors native FriendsMapView for shared helper logic) ──
interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

// ── Cream-terracotta map style — must stay in sync with native FriendsMapView ──
const MAP_STYLE = [
  {"featureType":"all","elementType":"labels.text.fill","stylers":[{"color":"#6B5D52"}]},
  {"featureType":"all","elementType":"labels.text.stroke","stylers":[{"color":"#FAF7F2"},{"weight":2}]},
  {"featureType":"all","elementType":"labels.icon","stylers":[{"visibility":"off"}]},
  {"featureType":"administrative","elementType":"geometry.fill","stylers":[{"color":"#EDE5D8"}]},
  {"featureType":"administrative","elementType":"geometry.stroke","stylers":[{"color":"#DDD4C8"},{"weight":1.2}]},
  {"featureType":"administrative.locality","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"administrative.neighborhood","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"landscape","elementType":"geometry","stylers":[{"color":"#F5F0E8"}]},
  {"featureType":"poi","elementType":"geometry","stylers":[{"color":"#EDE5D8"}]},
  {"featureType":"poi","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"road.highway","elementType":"geometry.fill","stylers":[{"color":"#DDD4C8"}]},
  {"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#C4B8AA"},{"weight":0.4}]},
  {"featureType":"road.arterial","elementType":"geometry","stylers":[{"color":"#E8E0D6"}]},
  {"featureType":"road.local","elementType":"geometry","stylers":[{"color":"#EDE5D8"}]},
  {"featureType":"transit","elementType":"geometry","stylers":[{"color":"#EDE5D8"}]},
  {"featureType":"transit.line","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"water","elementType":"geometry","stylers":[{"color":"#D4DEE6"}]},
];

// ────────────────────────────────────────────────────────────
// ── Domain types ──
// ────────────────────────────────────────────────────────────

/**
 * 3 modes de la map principale :
 *  - 'mine'     : mes plans (créés ou faits) — comportement historique
 *  - 'wishlist' : ma "to-do list" géographique — agrège les plans
 *                 saved !isDone, mes saved places, et mes spots savés.
 *                 C'est LA vue "qu'est-ce qu'il y a autour de moi à
 *                 faire" quand tu es dehors et tu cherches une idée.
 *  - 'friends'  : plans des amis suivis — comportement historique
 */
type MapMode = 'mine' | 'wishlist' | 'friends';

interface PlanRef {
  planId: string;
  planTitle: string;
  planCover?: string;
}

/** A unique place on the map, with all the plans that pass through it
 * (and the friends associated, in `friends` mode). */
interface MapPlace {
  placeId: string;
  name: string;
  latitude: number;
  longitude: number;
  photoUrl?: string;
  plans: PlanRef[];
  friends: MinimalUser[]; // empty in 'mine' mode
  isFavorite: boolean;
}

interface MarkerCluster {
  id: string;
  latitude: number;
  longitude: number;
  places: MapPlace[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

// ────────────────────────────────────────────────────────────
// ── Helpers ──
// ────────────────────────────────────────────────────────────

const placeKey = (p: Place): string => p.googlePlaceId || p.id;

/** Pick the best photo for a place. Prefer the user's customPhoto, then the
 * first Google photo, else fallback to the plan cover. */
const pickPhotoUrl = (place: Place, planCover?: string): string | undefined =>
  place.customPhoto || place.photoUrls?.[0] || planCover;

/** Build deduped MapPlace[] from a list of plans.
 *
 * In 'friends' mode we additionally attach the list of friends associated
 * with each plan (author + recreatedByIds intersected with friend set).
 */
const buildMapPlaces = (
  plans: Plan[],
  favoriteSet: Set<string>,
  mode: MapMode,
  friendIdSet?: Set<string>,
  getUser?: (id: string) => MinimalUser | undefined,
): MapPlace[] => {
  const byKey = new Map<string, MapPlace>();

  for (const plan of plans) {
    const planCover =
      plan.coverPhotos?.[0] ||
      plan.places?.find((p) => p.photoUrls?.length)?.photoUrls?.[0];

    // Friends linked to this plan (only in 'friends' mode)
    let planFriends: MinimalUser[] = [];
    if (mode === 'friends' && friendIdSet && getUser) {
      const ids = new Set<string>();
      if (friendIdSet.has(plan.authorId)) ids.add(plan.authorId);
      plan.recreatedByIds?.forEach((id) => { if (friendIdSet.has(id)) ids.add(id); });
      planFriends = Array.from(ids)
        .map((id) => getUser(id))
        .filter((u): u is MinimalUser => !!u);
      if (planFriends.length === 0) continue; // skip plans not actually associated with a known friend
    }

    const planRef: PlanRef = { planId: plan.id, planTitle: plan.title, planCover };

    for (const place of plan.places) {
      if (place.latitude == null || place.longitude == null) continue;
      const key = placeKey(place);
      const existing = byKey.get(key);
      if (existing) {
        // Merge — same place across multiple plans
        if (!existing.plans.some((p) => p.planId === plan.id)) existing.plans.push(planRef);
        if (mode === 'friends') {
          for (const f of planFriends) {
            if (!existing.friends.some((x) => x.id === f.id)) existing.friends.push(f);
          }
        }
        // Prefer a photo if we didn't have one
        if (!existing.photoUrl) existing.photoUrl = pickPhotoUrl(place, planCover);
      } else {
        byKey.set(key, {
          placeId: key,
          name: place.name,
          latitude: place.latitude,
          longitude: place.longitude,
          photoUrl: pickPhotoUrl(place, planCover),
          plans: [planRef],
          friends: mode === 'friends' ? [...planFriends] : [],
          isFavorite: favoriteSet.has(key),
        });
      }
    }
  }

  return Array.from(byKey.values());
};

/**
 * Build wishlist map places — agrège 3 sources de "lieux à faire" :
 *  1. Plans savés non-faits (`useSavesStore`, isDone === false) — pour
 *     chaque, on extrait les places ayant des coords. Le PlanRef pointe
 *     vers le plan source pour qu'un tap puisse rouvrir PlanDetail.
 *  2. Saved places solo (`useSavedPlacesStore`) — lieux bookmarkés sans
 *     plan associé. On les fait apparaître comme des "lieux orphelins"
 *     (plans:[] mais le marker les affiche quand même via la photo).
 *  3. Spots savés par le user (`useFeedStore.spots`, savedByIds inclut
 *     l'user) — same shape, treated comme des lieux orphelins aussi.
 *
 * Dédup par googlePlaceId : si un même lieu apparaît dans un saved plan
 * ET dans un saved place, il n'apparaîtra qu'une fois sur la map (les
 * planRefs sont fusionnés pour le sheet).
 */
const buildWishlistMapPlaces = (
  savedPlans: { plan: Plan; isDone: boolean }[],
  savedPlacesWithCoords: { placeId: string; name: string; latitude: number; longitude: number; photoUrl: string | null }[],
  savedSpots: { googlePlaceId: string; placeName: string; latitude: number; longitude: number; photoUrl?: string | null }[],
  favoriteSet: Set<string>,
): MapPlace[] => {
  const byKey = new Map<string, MapPlace>();

  // Source 1 : plans !isDone — explosés en places.
  for (const sp of savedPlans) {
    if (sp.isDone) continue;
    const planRef: PlanRef = {
      planId: sp.plan.id,
      planTitle: sp.plan.title,
      planCover: sp.plan.coverPhotos?.[0],
    };
    for (const place of sp.plan.places || []) {
      if (!place.latitude || !place.longitude) continue;
      const key = place.googlePlaceId || place.id;
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.plans.find((p) => p.planId === planRef.planId)) {
          existing.plans.push(planRef);
        }
      } else {
        byKey.set(key, {
          placeId: key,
          name: place.name,
          latitude: place.latitude,
          longitude: place.longitude,
          photoUrl: pickPhotoUrl(place, planRef.planCover),
          plans: [planRef],
          friends: [],
          isFavorite: favoriteSet.has(key),
        });
      }
    }
  }

  // Source 2 : saved places solo (avec coords).
  for (const sp of savedPlacesWithCoords) {
    const existing = byKey.get(sp.placeId);
    if (existing) continue; // déjà présent via un saved plan
    byKey.set(sp.placeId, {
      placeId: sp.placeId,
      name: sp.name,
      latitude: sp.latitude,
      longitude: sp.longitude,
      photoUrl: sp.photoUrl ?? undefined,
      plans: [], // lieu orphelin — pas de plan associé
      friends: [],
      isFavorite: true, // par définition, c'est un saved place = favori
    });
  }

  // Source 3 : spots savés par l'user.
  for (const spot of savedSpots) {
    const existing = byKey.get(spot.googlePlaceId);
    if (existing) continue;
    byKey.set(spot.googlePlaceId, {
      placeId: spot.googlePlaceId,
      name: spot.placeName,
      latitude: spot.latitude,
      longitude: spot.longitude,
      photoUrl: spot.photoUrl ?? undefined,
      plans: [],
      friends: [],
      isFavorite: favoriteSet.has(spot.googlePlaceId),
    });
  }

  return Array.from(byKey.values());
};

const filterByBounds = (places: MapPlace[], region: MapRegion): MapPlace[] => {
  const latH = region.latitudeDelta / 2;
  const lngH = region.longitudeDelta / 2;
  return places.filter(
    (p) =>
      p.latitude >= region.latitude - latH &&
      p.latitude <= region.latitude + latH &&
      p.longitude >= region.longitude - lngH &&
      p.longitude <= region.longitude + lngH,
  );
};

const clusterPlaces = (places: MapPlace[], region: MapRegion): MarkerCluster[] => {
  // Smaller cell than friend-cluster — we want each photo marker to feel
  // distinct unless they're truly on top of each other.
  const cellSize = Math.max(region.latitudeDelta, region.longitudeDelta) * 0.035;
  if (cellSize <= 0) return [];
  const grid = new Map<string, MapPlace[]>();
  for (const p of places) {
    const key = `${Math.floor(p.latitude / cellSize)}_${Math.floor(p.longitude / cellSize)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(p);
  }
  return Array.from(grid.entries()).map(([key, items]) => {
    const lat = items.reduce((s, i) => s + i.latitude, 0) / items.length;
    const lng = items.reduce((s, i) => s + i.longitude, 0) / items.length;
    return { id: key, latitude: lat, longitude: lng, places: items };
  });
};

const zoomToDelta = (zoom: number): number => 360 / Math.pow(2, zoom);

// ────────────────────────────────────────────────────────────
// ── HTML marker (Google Maps OverlayView) ──
// ────────────────────────────────────────────────────────────

/** Build an HTMLDivElement that renders a Zenly-style photo marker.
 *  The DOM is hand-rolled (not React) because OverlayView appends raw
 *  elements to the map's pane — using React here would require a portal
 *  per marker which adds far more complexity than the gain. */
function buildMarkerNode(
  cluster: MarkerCluster,
  onClick: () => void,
): HTMLDivElement {
  // Use the most-favorited or simply the first place to source the visual.
  const lead = cluster.places.find((p) => p.isFavorite) || cluster.places[0];
  const totalPlanCount = cluster.places.reduce((sum, p) => sum + p.plans.length, 0);
  const isFavorite = cluster.places.some((p) => p.isFavorite);

  const root = document.createElement('div');
  root.style.cssText = `
    position: absolute;
    width: 52px;
    height: 52px;
    transform: translate(-50%, -50%);
    cursor: pointer;
    transition: transform 160ms cubic-bezier(0.22,1,0.36,1);
    will-change: transform;
  `;
  root.onmouseenter = () => { root.style.transform = 'translate(-50%, -50%) scale(1.08)'; };
  root.onmouseleave = () => { root.style.transform = 'translate(-50%, -50%) scale(1)'; };
  root.onclick = (e) => { e.stopPropagation(); onClick(); };

  // Outer frame — gold for favorites, cream otherwise
  const frame = document.createElement('div');
  frame.style.cssText = `
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: ${isFavorite ? Colors.gold : Colors.bgSecondary};
    padding: 3px;
    box-shadow: 0 4px 12px rgba(44, 36, 32, 0.2), 0 1px 2px rgba(44, 36, 32, 0.12);
    box-sizing: border-box;
  `;

  // Inner photo or fallback
  if (lead.photoUrl) {
    const img = document.createElement('img');
    img.src = lead.photoUrl;
    img.alt = lead.name;
    img.style.cssText = `
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
      display: block;
      background: ${Colors.bgTertiary};
    `;
    img.onerror = () => { img.style.display = 'none'; };
    frame.appendChild(img);
  } else {
    const fallback = document.createElement('div');
    fallback.style.cssText = `
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: ${Colors.terracotta100};
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      color: ${Colors.terracotta700};
      font-family: -apple-system, system-ui, sans-serif;
    `;
    fallback.textContent = '◌';
    frame.appendChild(fallback);
  }
  root.appendChild(frame);

  // Favorite star — top right corner
  if (isFavorite) {
    const star = document.createElement('div');
    star.style.cssText = `
      position: absolute;
      top: -2px;
      right: -2px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: ${Colors.gold};
      color: white;
      font-size: 11px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 3px rgba(44, 36, 32, 0.25);
      font-family: -apple-system, system-ui, sans-serif;
      line-height: 1;
    `;
    star.textContent = '★';
    root.appendChild(star);
  }

  // Plan count badge — bottom right
  if (totalPlanCount > 1) {
    const badge = document.createElement('div');
    badge.style.cssText = `
      position: absolute;
      bottom: -2px;
      right: -2px;
      min-width: 20px;
      height: 20px;
      border-radius: 10px;
      background: ${Colors.primary};
      color: ${Colors.textOnAccent};
      padding: 0 6px;
      font-size: 11px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 3px rgba(44, 36, 32, 0.2);
      font-family: 'Inter', -apple-system, system-ui, sans-serif;
      line-height: 1;
      box-sizing: border-box;
    `;
    badge.textContent = String(totalPlanCount);
    root.appendChild(badge);
  }

  return root;
}

/** Factory that builds an OverlayView subclass at runtime — needed because
 *  google.maps.OverlayView only exists once the script is loaded. */
function createHtmlMarker(gm: any, position: any, node: HTMLDivElement): any {
  const Overlay = class extends gm.OverlayView {
    private node: HTMLDivElement;
    private pos: any;
    constructor(p: any, n: HTMLDivElement) {
      super();
      this.pos = p;
      this.node = n;
    }
    onAdd() {
      const panes = this.getPanes();
      if (panes) panes.overlayMouseTarget.appendChild(this.node);
    }
    draw() {
      const projection = this.getProjection();
      if (!projection) return;
      const point = projection.fromLatLngToDivPixel(this.pos);
      if (point) {
        this.node.style.left = `${point.x}px`;
        this.node.style.top = `${point.y}px`;
      }
    }
    onRemove() {
      if (this.node.parentNode) this.node.parentNode.removeChild(this.node);
    }
  };
  return new Overlay(position, node);
}

// ────────────────────────────────────────────────────────────
// ── Map renderer (imperative Google Maps JS) ──
// ────────────────────────────────────────────────────────────

interface MapRendererProps {
  initialRegion: MapRegion;
  clusters: MarkerCluster[];
  onClusterClick: (cluster: MarkerCluster) => void;
  onRegionChange: (region: MapRegion) => void;
}

const MapRenderer: React.FC<MapRendererProps> = ({
  initialRegion,
  clusters,
  onClusterClick,
  onRegionChange,
}) => {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const onClusterClickRef = useRef(onClusterClick);
  const onRegionChangeRef = useRef(onRegionChange);
  onClusterClickRef.current = onClusterClick;
  onRegionChangeRef.current = onRegionChange;

  // Init map once
  useEffect(() => {
    let mounted = true;
    loadGoogleMaps(() => {
      if (!mounted || !mapDivRef.current) return;
      const gm = (window as any).google.maps;
      const map = new gm.Map(mapDivRef.current, {
        center: { lat: initialRegion.latitude, lng: initialRegion.longitude },
        zoom: 13,
        styles: MAP_STYLE,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
        clickableIcons: false,
      });
      mapRef.current = map;
      map.addListener('idle', () => {
        const center = map.getCenter();
        const bounds = map.getBounds();
        if (!center || !bounds) return;
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        onRegionChangeRef.current({
          latitude: center.lat(),
          longitude: center.lng(),
          latitudeDelta: Math.abs(ne.lat() - sw.lat()),
          longitudeDelta: Math.abs(ne.lng() - sw.lng()),
        });
      });
    });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync markers on cluster change
  useEffect(() => {
    if (!mapRef.current || !(window as any).google?.maps) return;
    const gm = (window as any).google.maps;
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    for (const cluster of clusters) {
      const node = buildMarkerNode(cluster, () => onClusterClickRef.current(cluster));
      const overlay = createHtmlMarker(
        gm,
        new gm.LatLng(cluster.latitude, cluster.longitude),
        node,
      );
      overlay.setMap(mapRef.current);
      overlaysRef.current.push(overlay);
    }
  }, [clusters]);

  return (
    <div
      ref={mapDivRef}
      style={{ width: '100%', height: '100%', backgroundColor: Colors.bgPrimary } as any}
    />
  );
};

// ────────────────────────────────────────────────────────────
// ── Main component ──
// ────────────────────────────────────────────────────────────

export const FriendsMapView: React.FC<Props> = ({ visible, onClose }) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const cityConfig = useCity();
  const currentUser = useAuthStore((s) => s.user);

  const followingIds = useSocialProofStore((s) => s.followingIds);
  const ensureUsers = useSocialProofStore((s) => s.ensureUsers);
  const savedPlaces = useSavedPlacesStore((s) => s.places);

  const favoriteSet = useMemo(
    () => new Set(savedPlaces.map((p) => p.placeId)),
    [savedPlaces],
  );

  const [mode, setMode] = useState<MapMode>('mine');
  const [isLoading, setIsLoading] = useState(true);
  const [allPlaces, setAllPlaces] = useState<MapPlace[]>([]);
  const [clusters, setClusters] = useState<MarkerCluster[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<MarkerCluster | null>(null);

  const initialRegion: MapRegion = useMemo(
    () => ({
      latitude: cityConfig.coordinates.lat,
      longitude: cityConfig.coordinates.lng,
      latitudeDelta: zoomToDelta(13),
      longitudeDelta: zoomToDelta(13),
    }),
    [cityConfig.name],
  );

  const regionRef = useRef<MapRegion>(initialRegion);
  const sheetAnim = useRef(new Animated.Value(SCREEN_H)).current;

  // ── Fetch on visibility / mode / city change ──
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        // ── Mode 'wishlist' ── purement local : pas de fetch réseau,
        // tout vient des stores existants. C'est instantané, parfait
        // pour le use-case "je suis dehors, je cherche une idée".
        if (mode === 'wishlist') {
          if (!currentUser?.id) {
            if (!cancelled) {
              setAllPlaces([]);
              setClusters([]);
              setIsLoading(false);
            }
            return;
          }
          const savedPlansLocal = useSavesStore.getState().savedPlans;
          const savedPlacesAll = useSavedPlacesStore.getState().places;
          const spotsAll = useFeedStore.getState().spots;

          // Saved places ne sont gardés que s'ils ont des coords (les
          // entrées créées avant l'ajout de lat/lng sont skippées —
          // dégradation gracieuse, pas d'erreur visible).
          const savedPlacesWithCoords = savedPlacesAll
            .filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number')
            .map((p) => ({
              placeId: p.placeId,
              name: p.name,
              latitude: p.latitude as number,
              longitude: p.longitude as number,
              photoUrl: p.photoUrl,
            }));

          // Spots savés par le user — filtrés par savedByIds. On garde
          // les spots qui ont des coords ET qui sont dans la ville
          // courante (le store ne charge déjà que la ville courante,
          // donc city filter est implicite mais on reste safe).
          const savedSpots = spotsAll
            .filter((s) => s.savedByIds.includes(currentUser.id))
            .filter((s) => typeof s.latitude === 'number' && typeof s.longitude === 'number')
            .map((s) => ({
              googlePlaceId: s.googlePlaceId,
              placeName: s.placeName,
              latitude: s.latitude as number,
              longitude: s.longitude as number,
              photoUrl: s.photoUrl ?? null,
            }));

          const places = buildWishlistMapPlaces(
            savedPlansLocal,
            savedPlacesWithCoords,
            savedSpots,
            favoriteSet,
          );
          if (cancelled) return;
          setAllPlaces(places);
          const vis = filterByBounds(places, regionRef.current);
          setClusters(clusterPlaces(vis, regionRef.current));
          setIsLoading(false);
          return;
        }

        let plans: Plan[] = [];

        if (mode === 'friends') {
          if (followingIds.length === 0) {
            if (!cancelled) {
              setAllPlaces([]);
              setClusters([]);
              setIsLoading(false);
            }
            return;
          }
          plans = await fetchFriendsMapPlans(followingIds, cityConfig.name);
          // Cache friend profiles for marker rendering
          const ids = new Set<string>();
          for (const p of plans) {
            if (followingIds.includes(p.authorId)) ids.add(p.authorId);
            p.recreatedByIds?.forEach((id) => { if (followingIds.includes(id)) ids.add(id); });
          }
          await ensureUsers(Array.from(ids));
        } else {
          if (!currentUser?.id) {
            if (!cancelled) {
              setAllPlaces([]);
              setClusters([]);
              setIsLoading(false);
            }
            return;
          }
          plans = await fetchMyPlansForMap(currentUser.id);
        }

        if (cancelled) return;

        const friendIdSet = new Set(followingIds);
        const places = buildMapPlaces(
          plans,
          favoriteSet,
          mode,
          mode === 'friends' ? friendIdSet : undefined,
          mode === 'friends' ? useSocialProofStore.getState().getUser : undefined,
        );
        setAllPlaces(places);
        const vis = filterByBounds(places, regionRef.current);
        setClusters(clusterPlaces(vis, regionRef.current));
      } catch (err) {
        console.error('[FriendsMapView.web] fetch error:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mode, followingIds.length, cityConfig.name, currentUser?.id, favoriteSet]);

  const handleRegionChange = useCallback(
    (region: MapRegion) => {
      regionRef.current = region;
      if (allPlaces.length > 0) {
        const vis = filterByBounds(allPlaces, region);
        setClusters(clusterPlaces(vis, region));
      }
    },
    [allPlaces],
  );

  const openSheet = useCallback(
    (cluster: MarkerCluster) => {
      setSelectedCluster(cluster);
      sheetAnim.setValue(SCREEN_H);
      Animated.spring(sheetAnim, {
        toValue: 0,
        friction: 10,
        tension: 60,
        useNativeDriver: true,
      }).start();
    },
    [sheetAnim],
  );

  const closeSheet = useCallback(() => {
    Animated.timing(sheetAnim, {
      toValue: SCREEN_H,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setSelectedCluster(null));
  }, [sheetAnim]);

  const handleViewPlan = useCallback(
    (planId: string) => {
      closeSheet();
      onClose();
      setTimeout(() => navigation.navigate('PlanDetail', { planId }), 300);
    },
    [navigation, onClose, closeSheet],
  );

  const handleViewProfile = useCallback(
    (userId: string) => {
      closeSheet();
      onClose();
      setTimeout(() => navigation.navigate('OtherProfile', { userId }), 300);
    },
    [navigation, onClose, closeSheet],
  );

  /**
   * "Itinéraire" — ouvre Google Maps avec une route pré-rentrée vers
   * le lieu sélectionné. La position actuelle de l'user est utilisée
   * automatiquement comme origine par Google Maps (l'API URL ne
   * spécifie pas d'origine → fallback sur "Ma position").
   *
   * On passe à la fois `destination=LAT,LNG` (précis, marche toujours)
   * ET `destination_place_id` (active la fiche Google Places riche
   * avec photos / horaires / reviews côté Maps). Si le placeId n'est
   * pas un Google Place ID valide (= cas où on a fallback sur
   * place.id en interne), Maps ignore juste ce paramètre.
   *
   * Sur web : ouvre maps.google.com dans un nouvel onglet.
   * Sur natif iOS / Android : ouvre directement l'app Google Maps si
   * elle est installée, sinon le navigateur sur maps.google.com.
   */
  const handleOpenItinerary = useCallback((place: MapPlace) => {
    const dest = `${place.latitude},${place.longitude}`;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${dest}&destination_place_id=${encodeURIComponent(place.placeId)}`;
    Linking.openURL(url).catch((err) => {
      console.warn('[FriendsMapView.web] openURL failed:', err);
    });
  }, []);

  const sheetTitle = useMemo(() => {
    if (!selectedCluster) return '';
    if (selectedCluster.places.length === 1) return selectedCluster.places[0].name;
    return `${selectedCluster.places.length} lieux`;
  }, [selectedCluster]);

  const emptyMessage = useMemo(() => {
    if (mode === 'friends') {
      return followingIds.length === 0
        ? 'Suis des amis pour voir leurs lieux apparaître ici.'
        : `Tes amis n'ont pas encore exploré ${cityConfig.name}.`;
    }
    if (mode === 'wishlist') {
      return 'Sauvegarde des lieux, des plans ou des spots pour les retrouver ici. ✦';
    }
    return `Tu n'as pas encore exploré ${cityConfig.name}. Lance ton premier plan. ✦`;
  }, [mode, followingIds.length, cityConfig.name]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Map */}
        <View style={styles.map}>
          <MapRenderer
            initialRegion={initialRegion}
            clusters={clusters}
            onClusterClick={openSheet}
            onRegionChange={handleRegionChange}
          />
        </View>

        {/* Top toolbar — toggle (left) + close (right) */}
        <View style={[styles.topBar, { top: insets.top + 12 }]} pointerEvents="box-none">
          <View style={styles.toggle} pointerEvents="auto">
            <ToggleSegment
              icon="person"
              label="Mes lieux"
              active={mode === 'mine'}
              onPress={() => setMode('mine')}
            />
            <ToggleSegment
              icon="bookmark"
              label="À faire"
              active={mode === 'wishlist'}
              onPress={() => setMode('wishlist')}
            />
            <ToggleSegment
              icon="people"
              label="Amis"
              active={mode === 'friends'}
              onPress={() => setMode('friends')}
            />
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Ionicons name="close" size={18} color={Colors.textOnAccent} />
          </TouchableOpacity>
        </View>

        {/* Loading overlay */}
        {isLoading && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <View style={styles.loadingCard}>
              <Text style={styles.loadingText}>Chargement…</Text>
            </View>
          </View>
        )}

        {/* Empty state */}
        {!isLoading && allPlaces.length === 0 && (
          <View style={styles.emptyOverlay} pointerEvents="none">
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>{emptyMessage}</Text>
            </View>
          </View>
        )}

        {/* Bottom sheet */}
        {selectedCluster && (
          <>
            <TouchableOpacity
              style={styles.sheetBackdrop}
              activeOpacity={1}
              onPress={closeSheet}
            />
            <Animated.View
              style={[
                styles.sheet,
                { paddingBottom: insets.bottom + 16, transform: [{ translateY: sheetAnim }] },
              ]}
            >
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <Ionicons name="location" size={15} color={Colors.primary} />
                <Text style={styles.sheetTitle} numberOfLines={1}>{sheetTitle}</Text>
                {selectedCluster.places.some((p) => p.isFavorite) && (
                  <View style={styles.favBadge}>
                    <Text style={styles.favBadgeStar}>★</Text>
                    <Text style={styles.favBadgeText}>Favori</Text>
                  </View>
                )}
              </View>
              <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
                {selectedCluster.places.map((place, pIdx) => (
                  <View
                    key={place.placeId}
                    style={[
                      styles.placeBlock,
                      pIdx < selectedCluster.places.length - 1 && styles.placeDivider,
                    ]}
                  >
                    {/* Place header — nom (si cluster multi-lieux) +
                        bouton "Itinéraire" qui ouvre Google Maps avec
                        l'itinéraire pré-rentré depuis ma position
                        actuelle. Visible dans tous les modes (Mes
                        lieux / À faire / Amis) — utile partout. */}
                    <View style={styles.placeHeaderRow}>
                      {selectedCluster.places.length > 1 ? (
                        <Text style={styles.placeName} numberOfLines={1}>
                          {place.isFavorite ? '★ ' : ''}{place.name}
                        </Text>
                      ) : (
                        <View style={{ flex: 1 }} />
                      )}
                      <TouchableOpacity
                        style={styles.itineraryBtn}
                        onPress={() => handleOpenItinerary(place)}
                        activeOpacity={0.85}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="navigate" size={12} color={Colors.textOnAccent} />
                        <Text style={styles.itineraryBtnText}>Itinéraire</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Friends row (amis mode only) */}
                    {mode === 'friends' && place.friends.length > 0 && (
                      <View style={styles.friendsRow}>
                        {place.friends.slice(0, 4).map((f) => (
                          <TouchableOpacity
                            key={f.id}
                            onPress={() => handleViewProfile(f.id)}
                            activeOpacity={0.7}
                            style={styles.friendChip}
                          >
                            <Avatar
                              initials={f.initials}
                              bg={f.avatarBg}
                              color={f.avatarColor}
                              size="XS"
                              avatarUrl={f.avatarUrl ?? undefined}
                            />
                            <Text style={styles.friendName} numberOfLines={1}>
                              {f.displayName.split(' ')[0]}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {/* Plans at this place */}
                    {place.plans.map((plan) => (
                      <TouchableOpacity
                        key={plan.planId}
                        style={styles.planRow}
                        onPress={() => handleViewPlan(plan.planId)}
                        activeOpacity={0.7}
                      >
                        {plan.planCover ? (
                          <Image source={{ uri: plan.planCover }} style={styles.planThumb} />
                        ) : (
                          <View style={[styles.planThumb, styles.planThumbEmpty]}>
                            <Ionicons name="map-outline" size={14} color={Colors.textTertiary} />
                          </View>
                        )}
                        <Text style={styles.planTitle} numberOfLines={1}>{plan.planTitle}</Text>
                        <View style={styles.planBtn}>
                          <Text style={styles.planBtnText}>Voir</Text>
                          <Ionicons name="chevron-forward" size={12} color={Colors.primary} />
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
                <View style={{ height: 8 }} />
              </ScrollView>
            </Animated.View>
          </>
        )}
      </View>
    </Modal>
  );
};

// ── Toggle segment sub-component ──
const ToggleSegment: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}> = ({ icon, label, active, onPress }) => (
  <TouchableOpacity
    style={[styles.toggleSeg, active && styles.toggleSegActive]}
    onPress={onPress}
    activeOpacity={0.85}
  >
    <Ionicons
      name={icon}
      size={14}
      color={active ? Colors.textOnAccent : Colors.textSecondary}
    />
    <Text style={[styles.toggleSegText, active && styles.toggleSegTextActive]}>
      {label}
    </Text>
  </TouchableOpacity>
);

// ────────────────────────────────────────────────────────────
// ── Styles ──
// ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  map: { flex: 1 } as any,

  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    zIndex: 10,
  } as any,

  // Toggle pill
  toggle: {
    flexDirection: 'row',
    backgroundColor: Colors.bgSecondary,
    borderRadius: 24,
    padding: 4,
    gap: 2,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: '#2C2420',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  } as any,
  toggleSeg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  } as any,
  toggleSegActive: {
    backgroundColor: Colors.primary,
  },
  toggleSegText: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
    letterSpacing: 0.2,
  },
  toggleSegTextActive: {
    color: Colors.textOnAccent,
  },

  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2C2420',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  loadingCard: {
    backgroundColor: Colors.bgSecondary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  loadingText: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
  },

  emptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  emptyCard: {
    backgroundColor: Colors.bgSecondary,
    paddingHorizontal: 26,
    paddingVertical: 20,
    borderRadius: 16,
    maxWidth: 320,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    shadowColor: '#2C2420',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: Fonts.body,
    textAlign: 'center',
    lineHeight: 21,
  },

  // Bottom sheet
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 15,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.bgSecondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    maxHeight: SCREEN_H * 0.5,
    zIndex: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderBottomWidth: 0,
    shadowColor: '#2C2420',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderMedium,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 16,
  } as any,
  sheetTitle: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    flex: 1,
  },
  favBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: Colors.gold + '22',
  } as any,
  favBadgeStar: {
    fontSize: 10,
    color: Colors.gold,
  },
  favBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.gold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  sheetScroll: { paddingHorizontal: 20 },

  placeBlock: { paddingBottom: 14 },
  placeDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    marginBottom: 14,
  },
  // Header row : nom du lieu (gauche) + bouton Itinéraire (droite).
  // Aligné center pour que le bouton compact pill soit toujours
  // vertically-centered avec le nom même quand celui-ci wrap.
  placeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  placeName: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },
  // Bouton "Itinéraire" — pill compacte terracotta, icône + label.
  // Volontairement court visuellement pour que la sheet reste
  // dense (multi-lieux par cluster). Le tap déclenche
  // handleOpenItinerary qui ouvre Google Maps direction.
  itineraryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: Colors.primary,
  },
  itineraryBtnText: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
    letterSpacing: 0.1,
  },

  friendsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  } as any,
  friendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: Colors.bgPrimary,
  } as any,
  friendName: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textPrimary,
    maxWidth: 80,
  },

  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  } as any,
  planThumb: {
    width: 38,
    height: 38,
    borderRadius: 8,
    overflow: 'hidden',
  },
  planThumbEmpty: {
    backgroundColor: Colors.bgTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTitle: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
  },
  planBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: Colors.primary + '18',
  } as any,
  planBtnText: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },
});
