import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar } from './Avatar';
import { useLivePresence } from '../hooks/useLivePresence';
import { useGroupSessionStore } from '../store/groupSessionStore';
import { useAuthStore } from '../store';
import { loadGoogleMaps } from '../utils/loadGoogleMaps';
import {
  haversineKm,
  walkingMinutes,
  formatDistanceShort,
  formatRelativePresence,
} from './GroupLiveMapShared';

interface Props {
  visible: boolean;
  sessionId: string;
  myLocation?: { lat: number; lng: number } | null;
  onClose: () => void;
}

// Same warm/terracotta map style as the rest of the app for visual cohesion.
const MAP_STYLE = [
  {"featureType":"all","elementType":"labels.text.fill","stylers":[{"color":"#6B5D52"}]},
  {"featureType":"all","elementType":"labels.text.stroke","stylers":[{"color":"#FAF7F2"},{"weight":2}]},
  {"featureType":"all","elementType":"labels.icon","stylers":[{"visibility":"off"}]},
  {"featureType":"administrative","elementType":"geometry.fill","stylers":[{"color":"#EDE5D8"}]},
  {"featureType":"administrative","elementType":"geometry.stroke","stylers":[{"color":"#DDD4C8"},{"weight":1.2}]},
  {"featureType":"landscape","elementType":"geometry","stylers":[{"color":"#F5F0E8"}]},
  {"featureType":"poi","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"road.highway","elementType":"geometry.fill","stylers":[{"color":"#DDD4C8"}]},
  {"featureType":"road.arterial","elementType":"geometry","stylers":[{"color":"#EDE5D8"}]},
  {"featureType":"road.local","elementType":"geometry","stylers":[{"color":"#FAF7F2"}]},
  {"featureType":"transit","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"water","elementType":"geometry","stylers":[{"color":"#D4DEE6"}]},
];

interface Marker {
  userId: string;
  lat: number;
  lng: number;
  initials: string;
  avatarBg: string;
  avatarColor: string;
  avatarUrl?: string | null;
  ts: number;
}

/**
 * Web variant — embeds a real Google Map at the top of the sheet with
 * one terracotta-bordered avatar marker per opted-in participant.
 * Underneath, the same list as the native variant (name + distance +
 * "il y a N min" freshness).
 *
 * Markers update live without a full map redraw : we keep a refs map
 * of `userId → google.maps.Marker` and only mutate positions/icons.
 */
export const GroupLiveMapSheet: React.FC<Props> = ({ visible, sessionId, myLocation, onClose }) => {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const { presences, optInStatus, optIn, optOut } = useLivePresence(visible ? sessionId : undefined);
  const session = useGroupSessionStore((s) => s.activeSession);

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});

  // Build the marker list — pair presences with participant metadata.
  const markers: Marker[] = useMemo(() => {
    if (!session) return [];
    return presences.map((lp) => {
      const p = session.participants[lp.userId];
      return {
        userId: lp.userId,
        lat: lp.lat,
        lng: lp.lng,
        initials: p?.initials || '?',
        avatarBg: p?.avatarBg || Colors.primary,
        avatarColor: p?.avatarColor || Colors.textOnAccent,
        avatarUrl: p?.avatarUrl ?? null,
        ts: lp.ts,
      };
    });
  }, [presences, session]);

  // Initialise + update the map.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    loadGoogleMaps(() => {
      if (cancelled || !mapDivRef.current) return;
      const gm = (window as any).google?.maps;
      if (!gm) return;

      // First-time init.
      if (!mapRef.current) {
        const center = markers[0]
          ? { lat: markers[0].lat, lng: markers[0].lng }
          : myLocation
          ? { lat: myLocation.lat, lng: myLocation.lng }
          : { lat: 48.8566, lng: 2.3522 }; // Paris fallback
        mapRef.current = new gm.Map(mapDivRef.current, {
          styles: MAP_STYLE,
          disableDefaultUI: true,
          gestureHandling: 'greedy',
          backgroundColor: '#F5F0E8',
          center,
          zoom: 14,
        });
      }

      // Reconcile markers — add new, remove gone, update existing.
      const seen: Record<string, true> = {};
      markers.forEach((m) => {
        seen[m.userId] = true;
        const existing = markersRef.current[m.userId];
        const stale = Date.now() - m.ts > 120_000; // grey-out >2min
        const iconUrl = makeAvatarMarkerSvg(m, stale);
        const position = { lat: m.lat, lng: m.lng };
        if (existing) {
          existing.setPosition(position);
          existing.setIcon({
            url: iconUrl,
            scaledSize: new gm.Size(46, 46),
            anchor: new gm.Point(23, 23),
          });
        } else {
          markersRef.current[m.userId] = new gm.Marker({
            position,
            map: mapRef.current,
            icon: {
              url: iconUrl,
              scaledSize: new gm.Size(46, 46),
              anchor: new gm.Point(23, 23),
            },
            zIndex: 100,
          });
        }
      });
      // Clean up gone markers.
      Object.keys(markersRef.current).forEach((uid) => {
        if (!seen[uid]) {
          markersRef.current[uid].setMap(null);
          delete markersRef.current[uid];
        }
      });

      // Auto-fit when there are 2+ markers.
      if (markers.length >= 2) {
        const bounds = new gm.LatLngBounds();
        markers.forEach((m) => bounds.extend({ lat: m.lat, lng: m.lng }));
        if (myLocation) bounds.extend({ lat: myLocation.lat, lng: myLocation.lng });
        mapRef.current.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
      } else if (markers.length === 1) {
        mapRef.current.panTo({ lat: markers[0].lat, lng: markers[0].lng });
      }
    });
    return () => { cancelled = true; };
  }, [visible, markers, myLocation]);

  // Cleanup on unmount or close — let the next mount rebuild fresh.
  useEffect(() => {
    if (visible) return;
    Object.values(markersRef.current).forEach((m: any) => m.setMap?.(null));
    markersRef.current = {};
    mapRef.current = null;
  }, [visible]);

  // Pair each participant with their (optional) live presence — list view.
  const rows = useMemo(() => {
    if (!session) return [];
    return Object.values(session.participants).map((p) => {
      const live = presences.find((lp) => lp.userId === p.userId);
      const distKm = (live && myLocation)
        ? haversineKm(myLocation.lat, myLocation.lng, live.lat, live.lng)
        : null;
      return { participant: p, live, distKm };
    });
  }, [session, presences, myLocation]);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]} onPress={() => {}}>
          <View style={styles.grabber} />

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>LE GROUPE EN LIVE</Text>
              <Text style={styles.title}>{rows.length} {rows.length > 1 ? 'amis' : 'ami'} en route</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={Colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {/* Opt-in CTA */}
          {optInStatus === 'pending' && (
            <View style={styles.optInBox}>
              <Text style={styles.optInTitle}>Partager ta position avec le groupe ?</Text>
              <Text style={styles.optInBody}>
                Tes amis verront ton point sur la carte. Tu peux te retirer à tout moment.
              </Text>
              <View style={styles.optInRow}>
                <TouchableOpacity style={styles.optInGhost} onPress={optOut} activeOpacity={0.7}>
                  <Text style={styles.optInGhostText}>Pas maintenant</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.optInPrimary} onPress={optIn} activeOpacity={0.85}>
                  <Text style={styles.optInPrimaryText}>Partager</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Map — always rendered to preserve the gmaps instance */}
          <View style={styles.mapWrap}>
            <div ref={mapDivRef} style={{ width: '100%', height: '100%', borderRadius: 14 }} />
            {markers.length === 0 && (
              <View style={styles.mapEmpty} pointerEvents="none">
                <Ionicons name="location-outline" size={20} color={Colors.textTertiary} />
                <Text style={styles.mapEmptyText}>
                  Personne ne partage sa position pour l{'\u2019'}instant
                </Text>
              </View>
            )}
          </View>

          {/* List */}
          <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ paddingTop: 4 }}>
            {rows.map(({ participant: p, live, distKm }) => {
              const isMe = p.userId === user?.id;
              const distLabel = distKm !== null ? formatDistanceShort(distKm) : null;
              const minutes = distKm !== null ? walkingMinutes(distKm) : null;
              return (
                <View key={p.userId} style={styles.row}>
                  <Avatar
                    initials={p.initials}
                    bg={p.avatarBg}
                    color={p.avatarColor}
                    size="M"
                    avatarUrl={p.avatarUrl ?? undefined}
                  />
                  <View style={styles.rowText}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {isMe ? 'Toi' : p.displayName.split(' ')[0]}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {live ? (
                        isMe ? 'Tu partages ta position' :
                        distLabel ? `À ${minutes} min · ${distLabel}` :
                        `Position partagée · ${formatRelativePresence(live.ts)}`
                      ) : 'Position non partagée'}
                    </Text>
                  </View>
                  <View style={[styles.statusDot, live ? styles.statusDotLive : styles.statusDotOff]} />
                </View>
              );
            })}
          </ScrollView>

          {optInStatus === 'opted-in' && (
            <TouchableOpacity style={styles.optOutFooter} onPress={optOut} activeOpacity={0.7}>
              <Ionicons name="eye-off-outline" size={14} color={Colors.textTertiary} />
              <Text style={styles.optOutFooterText}>Arrêter de partager ma position</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════════════
// Avatar marker SVG — generated per-presence, returned as data: URL
// for `gm.Marker.icon.url`. Looks like an avatar with a terracotta
// border + a white outer ring to pop on the cream map.
// ══════════════════════════════════════════════════════════════

function makeAvatarMarkerSvg(m: Marker, stale: boolean): string {
  // SVG can't render <img> with arbitrary URLs cleanly across browsers
  // for `Marker.icon.url`; we keep it 100% SVG with initials. If we
  // want photo avatars later, we'll switch to a custom HTML overlay.
  const ringColor = stale ? '#A09181' : '#C4704B'; // taupe vs terracotta
  const fillColor = m.avatarBg || '#C4704B';
  const textColor = m.avatarColor || '#FFF8F0';
  const initials = (m.initials || '?').slice(0, 2).toUpperCase();
  const opacity = stale ? 0.6 : 1;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="46" height="46" viewBox="0 0 46 46">
      <circle cx="23" cy="23" r="22" fill="white" opacity="${opacity}"/>
      <circle cx="23" cy="23" r="20" fill="${fillColor}" opacity="${opacity}"/>
      <circle cx="23" cy="23" r="20" fill="none" stroke="${ringColor}" stroke-width="2.5" opacity="${opacity}"/>
      <text x="23" y="29" text-anchor="middle" font-size="15" font-weight="700"
        font-family="-apple-system,BlinkMacSystemFont,sans-serif" fill="${textColor}" opacity="${opacity}">
        ${initials}
      </text>
    </svg>
  `.replace(/\s+/g, ' ').trim();
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(44,36,32,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.bgSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 8,
    maxHeight: '90%',
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderMedium,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  eyebrow: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    color: Colors.primary,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  title: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  optInBox: {
    backgroundColor: Colors.terracotta50,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.terracotta200,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  optInTitle: {
    fontSize: 14,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.15,
    marginBottom: 6,
  },
  optInBody: {
    fontSize: 12.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginBottom: 12,
  },
  optInRow: { flexDirection: 'row', gap: 8 },
  optInGhost: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  optInGhostText: { fontSize: 13, fontFamily: Fonts.bodySemiBold, color: Colors.textSecondary },
  optInPrimary: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  optInPrimaryText: { fontSize: 13, fontFamily: Fonts.bodySemiBold, color: Colors.textOnAccent },
  mapWrap: {
    height: 240,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: Colors.bgPrimary,
  },
  mapEmpty: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(245,240,232,0.92)',
  },
  mapEmptyText: {
    fontSize: 12.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowName: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  rowMeta: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusDotLive: { backgroundColor: Colors.success },
  statusDotOff: { backgroundColor: Colors.borderMedium },
  optOutFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
  },
  optOutFooterText: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textTertiary,
  },
});
