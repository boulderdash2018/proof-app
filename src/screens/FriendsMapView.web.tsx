import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
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
import { fetchFriendsMapPlans } from '../services/plansService';
import { Avatar } from '../components/Avatar';
import { Plan } from '../types';
import { loadGoogleMaps } from '../utils/loadGoogleMaps';

import type { MinimalUser } from '../store/socialProofStore';

const { height: SCREEN_H } = Dimensions.get('window');

// ── Map region type (kept identical to the native version so the helpers
// stay consistent — easy future de-duplication) ──
interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

// ── Warm cream map style — must match native FriendsMapView so the visual
// feel is consistent across platforms ──
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

// ── Types (mirrored from native) ──

interface FriendPlace {
  friendId: string;
  friend: MinimalUser;
  placeName: string;
  latitude: number;
  longitude: number;
  planId: string;
  planTitle: string;
  planCover?: string;
}

interface MarkerCluster {
  id: string;
  latitude: number;
  longitude: number;
  items: FriendPlace[];
  uniqueFriends: MinimalUser[];
}

interface SheetFriendEntry {
  friend: MinimalUser;
  plans: { planId: string; planTitle: string; planCover?: string }[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

// ── Helpers (mirrored from native FriendsMapView; intentionally duplicated
// for Phase 0. Will be lifted to a shared module when Phase 1 lands.) ──

const extractFriendPlaces = (
  plans: Plan[],
  friendIdSet: Set<string>,
  getUser: (id: string) => MinimalUser | undefined,
): FriendPlace[] => {
  const result: FriendPlace[] = [];
  for (const plan of plans) {
    const associated = new Set<string>();
    if (friendIdSet.has(plan.authorId)) associated.add(plan.authorId);
    plan.recreatedByIds?.forEach((id) => {
      if (friendIdSet.has(id)) associated.add(id);
    });
    const planCover =
      plan.coverPhotos?.[0] ||
      plan.places?.find((p) => p.photoUrls?.length)?.photoUrls?.[0];
    for (const friendId of associated) {
      const friend = getUser(friendId);
      if (!friend) continue;
      for (const place of plan.places) {
        if (place.latitude == null || place.longitude == null) continue;
        result.push({
          friendId,
          friend,
          placeName: place.name,
          latitude: place.latitude,
          longitude: place.longitude,
          planId: plan.id,
          planTitle: plan.title,
          planCover,
        });
      }
    }
  }
  return result;
};

const filterByBounds = (places: FriendPlace[], region: MapRegion): FriendPlace[] => {
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

const clusterMarkers = (places: FriendPlace[], region: MapRegion): MarkerCluster[] => {
  const cellSize = Math.max(region.latitudeDelta, region.longitudeDelta) * 0.06;
  if (cellSize <= 0) return [];
  const grid = new Map<string, FriendPlace[]>();
  for (const p of places) {
    const key = `${Math.floor(p.latitude / cellSize)}_${Math.floor(p.longitude / cellSize)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(p);
  }
  return Array.from(grid.entries()).map(([key, items]) => {
    const lat = items.reduce((s, i) => s + i.latitude, 0) / items.length;
    const lng = items.reduce((s, i) => s + i.longitude, 0) / items.length;
    const friendMap = new Map<string, MinimalUser>();
    items.forEach((i) => friendMap.set(i.friendId, i.friend));
    return {
      id: key,
      latitude: lat,
      longitude: lng,
      items,
      uniqueFriends: Array.from(friendMap.values()),
    };
  });
};

const buildSheetData = (cluster: MarkerCluster): SheetFriendEntry[] => {
  const map = new Map<
    string,
    { friend: MinimalUser; plans: Map<string, { planId: string; planTitle: string; planCover?: string }> }
  >();
  for (const item of cluster.items) {
    if (!map.has(item.friendId)) {
      map.set(item.friendId, { friend: item.friend, plans: new Map() });
    }
    const e = map.get(item.friendId)!;
    if (!e.plans.has(item.planId)) {
      e.plans.set(item.planId, {
        planId: item.planId,
        planTitle: item.planTitle,
        planCover: item.planCover,
      });
    }
  }
  return Array.from(map.values()).map(({ friend, plans }) => ({
    friend,
    plans: Array.from(plans.values()),
  }));
};

// ── Zoom ↔ region delta heuristic. Google Maps gives us a zoom level (0-21);
// the helpers above expect a latitudeDelta/longitudeDelta. We approximate.
const zoomToDelta = (zoom: number): number => 360 / Math.pow(2, zoom);

// ══════════════════════════════════════════════════════════
// ── Map renderer (imperative Google Maps JS) ──
// ══════════════════════════════════════════════════════════

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
  const markersRef = useRef<any[]>([]);
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

      // Bridge Google's `idle` event back to React-land as a region change.
      map.addListener('idle', () => {
        const center = map.getCenter();
        const bounds = map.getBounds();
        if (!center || !bounds) return;
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const region: MapRegion = {
          latitude: center.lat(),
          longitude: center.lng(),
          latitudeDelta: Math.abs(ne.lat() - sw.lat()),
          longitudeDelta: Math.abs(ne.lng() - sw.lng()),
        };
        onRegionChangeRef.current(region);
      });
    });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync markers when clusters change
  useEffect(() => {
    if (!mapRef.current || !(window as any).google?.maps) return;
    const gm = (window as any).google.maps;

    // Tear down previous markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    // Create new markers
    for (const cluster of clusters) {
      const count = cluster.uniqueFriends.length;
      const marker = new gm.Marker({
        position: { lat: cluster.latitude, lng: cluster.longitude },
        map: mapRef.current,
        icon: {
          path: gm.SymbolPath.CIRCLE,
          fillColor: Colors.primary,
          fillOpacity: 1,
          strokeColor: '#FFF',
          strokeWeight: 2,
          scale: count > 1 ? 14 : 10,
        },
        label: count > 1
          ? {
              text: String(count),
              color: '#FFF',
              fontFamily: 'Inter',
              fontSize: '11px',
              fontWeight: '700',
            }
          : undefined,
      });
      marker.addListener('click', () => onClusterClickRef.current(cluster));
      markersRef.current.push(marker);
    }
  }, [clusters]);

  return (
    <div
      ref={mapDivRef}
      style={{ width: '100%', height: '100%', backgroundColor: Colors.bgPrimary } as any}
    />
  );
};

// ══════════════════════════════════════════════════════════
// ── Main component ──
// ══════════════════════════════════════════════════════════

export const FriendsMapView: React.FC<Props> = ({ visible, onClose }) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const cityConfig = useCity();

  const followingIds = useSocialProofStore((s) => s.followingIds);
  const ensureUsers = useSocialProofStore((s) => s.ensureUsers);

  const [isLoading, setIsLoading] = useState(true);
  const [allPlaces, setAllPlaces] = useState<FriendPlace[]>([]);
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

  // ── Fetch friend plans ──
  useEffect(() => {
    if (!visible) return;
    if (followingIds.length === 0) {
      setIsLoading(false);
      setAllPlaces([]);
      setClusters([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const plans = await fetchFriendsMapPlans(followingIds, cityConfig.name);
        if (cancelled) return;

        const idsNeeded = new Set<string>();
        for (const plan of plans) {
          if (followingIds.includes(plan.authorId)) idsNeeded.add(plan.authorId);
          plan.recreatedByIds?.forEach((id) => {
            if (followingIds.includes(id)) idsNeeded.add(id);
          });
        }
        await ensureUsers(Array.from(idsNeeded));
        if (cancelled) return;

        const friendIdSet = new Set(followingIds);
        const places = extractFriendPlaces(
          plans,
          friendIdSet,
          useSocialProofStore.getState().getUser,
        );
        setAllPlaces(places);
        const vis = filterByBounds(places, regionRef.current);
        setClusters(clusterMarkers(vis, regionRef.current));
      } catch (err) {
        console.error('[FriendsMapView.web] fetch error:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, followingIds.length, cityConfig.name]);

  const handleRegionChange = useCallback(
    (region: MapRegion) => {
      regionRef.current = region;
      if (allPlaces.length > 0) {
        const vis = filterByBounds(allPlaces, region);
        setClusters(clusterMarkers(vis, region));
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

  const sheetData = useMemo(
    () => (selectedCluster ? buildSheetData(selectedCluster) : []),
    [selectedCluster],
  );

  const clusterTitle = useMemo(() => {
    if (!selectedCluster) return '';
    const names = new Set(selectedCluster.items.map((i) => i.placeName));
    return names.size === 1 ? Array.from(names)[0] : `${names.size} lieux`;
  }, [selectedCluster]);

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

        {/* Close button */}
        <TouchableOpacity
          style={[styles.closeBtn, { top: insets.top + 12 }]}
          onPress={onClose}
          activeOpacity={0.8}
        >
          <Ionicons name="close" size={18} color={Colors.textOnAccent} />
        </TouchableOpacity>

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
              <Text style={styles.emptyText}>
                Tes amis n'ont pas encore exploré {cityConfig.name}. Invite-les. ✦
              </Text>
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
                <Text style={styles.sheetTitle} numberOfLines={1}>{clusterTitle}</Text>
              </View>
              <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
                {sheetData.map((entry, idx) => (
                  <View
                    key={entry.friend.id}
                    style={[styles.sheetFriendBlock, idx < sheetData.length - 1 && styles.sheetFriendDivider]}
                  >
                    <TouchableOpacity
                      style={styles.sheetFriendRow}
                      onPress={() => handleViewProfile(entry.friend.id)}
                      activeOpacity={0.7}
                    >
                      <Avatar
                        initials={entry.friend.initials}
                        bg={entry.friend.avatarBg}
                        color={entry.friend.avatarColor}
                        size="S"
                        avatarUrl={entry.friend.avatarUrl ?? undefined}
                      />
                      <Text style={styles.sheetFriendName}>{entry.friend.displayName}</Text>
                    </TouchableOpacity>
                    {entry.plans.map((plan) => (
                      <TouchableOpacity
                        key={plan.planId}
                        style={styles.sheetPlanRow}
                        onPress={() => handleViewPlan(plan.planId)}
                        activeOpacity={0.7}
                      >
                        {plan.planCover ? (
                          <Image source={{ uri: plan.planCover }} style={styles.sheetPlanThumb} />
                        ) : (
                          <View style={[styles.sheetPlanThumb, styles.sheetPlanThumbEmpty]}>
                            <Ionicons name="map-outline" size={14} color={Colors.textTertiary} />
                          </View>
                        )}
                        <Text style={styles.sheetPlanTitle} numberOfLines={1}>{plan.planTitle}</Text>
                        <View style={styles.sheetPlanBtn}>
                          <Text style={styles.sheetPlanBtnText}>Voir</Text>
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

// ══════════════════════════════════════════════════════════
// ── Styles (mirror native; small loading-card variant since we can't
// stack a spinner & text over the map div the same way) ──
// ══════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  map: { flex: 1 } as any,

  closeBtn: {
    position: 'absolute',
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
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
    maxWidth: 280,
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

  // Bottom sheet — same layout as native
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
    maxHeight: SCREEN_H * 0.45,
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
  sheetScroll: { paddingHorizontal: 20 },
  sheetFriendBlock: { paddingBottom: 16 },
  sheetFriendDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    marginBottom: 16,
  },
  sheetFriendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  } as any,
  sheetFriendName: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },
  sheetPlanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 42,
    marginBottom: 8,
  } as any,
  sheetPlanThumb: {
    width: 38,
    height: 38,
    borderRadius: 8,
    overflow: 'hidden',
  },
  sheetPlanThumbEmpty: {
    backgroundColor: Colors.bgTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetPlanTitle: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
  },
  sheetPlanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: Colors.primary + '18',
  } as any,
  sheetPlanBtnText: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },
});
