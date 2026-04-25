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
      // We use a custom OverlayView (defined lazily after gm is loaded)
      // so that markers can render REAL profile photos via <img> with
      // a graceful initials fallback. The native gm.Marker only takes
      // a single image URL which can't carry both photo + circular
      // border + initials fallback in one go.
      const AvatarOverlayClass = getAvatarOverlayClass(gm);
      const seen: Record<string, true> = {};
      markers.forEach((m) => {
        seen[m.userId] = true;
        const stale = Date.now() - m.ts > 120_000; // grey-out >2min
        const html = makeAvatarMarkerHtml(m, stale);
        const position = new gm.LatLng(m.lat, m.lng);
        const existing = markersRef.current[m.userId];
        if (existing) {
          existing.update(position, html);
        } else {
          const overlay = new AvatarOverlayClass(position, html);
          overlay.setMap(mapRef.current);
          markersRef.current[m.userId] = overlay;
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
// Avatar marker — HTML-based for real profile photos.
//
// gm.Marker only accepts a single image URL via `icon.url`, which
// can't carry both a photo + a circular border + an initials
// fallback if the photo fails to load. We use a custom
// `gm.OverlayView` subclass that renders an HTML <div> with an
// <img> (photo) wrapped in a circular border, with onerror →
// fallback to an initials block.
//
// The class is created lazily once `google.maps` is available
// (we can't subclass at module top-level — gm isn't loaded yet).
// ══════════════════════════════════════════════════════════════

let _AvatarOverlayCache: any = null;

function getAvatarOverlayClass(gm: any): any {
  if (_AvatarOverlayCache) return _AvatarOverlayCache;
  class AvatarOverlay extends gm.OverlayView {
    position: any;
    html: string;
    div: HTMLDivElement | null = null;
    constructor(position: any, html: string) {
      super();
      this.position = position;
      this.html = html;
    }
    onAdd() {
      this.div = document.createElement('div');
      this.div.style.position = 'absolute';
      this.div.style.cursor = 'default';
      this.div.style.pointerEvents = 'none'; // taps pass through to the map
      this.div.innerHTML = this.html;
      this.getPanes().overlayMouseTarget.appendChild(this.div);
    }
    draw() {
      const proj = this.getProjection();
      if (!proj || !this.div) return;
      const point = proj.fromLatLngToDivPixel(this.position);
      if (point) {
        // 23px = half the marker's 46px width — anchors at center.
        this.div.style.left = `${point.x - 23}px`;
        this.div.style.top = `${point.y - 23}px`;
      }
    }
    onRemove() {
      this.div?.parentNode?.removeChild(this.div);
      this.div = null;
    }
    update(newPosition: any, newHtml: string) {
      this.position = newPosition;
      if (newHtml !== this.html) {
        this.html = newHtml;
        if (this.div) this.div.innerHTML = newHtml;
      }
      this.draw();
    }
  }
  _AvatarOverlayCache = AvatarOverlay;
  return AvatarOverlay;
}

/**
 * HTML for one avatar marker. Renders :
 *   • A circular wrapper with terracotta (or taupe if stale) border
 *   • The user's photo if avatarUrl is set, with onerror → fallback
 *   • Otherwise an initials block on the user's avatarBg color
 *
 * Uses inline styles to avoid needing a stylesheet — the wrapper
 * node lives outside the React tree.
 */
function makeAvatarMarkerHtml(m: Marker, stale: boolean): string {
  const ringColor = stale ? '#A09181' : '#C4704B'; // taupe vs terracotta
  const opacity = stale ? '0.65' : '1';
  const initials = escapeHtml((m.initials || '?').slice(0, 2).toUpperCase());
  const safeUrl = m.avatarUrl ? escapeAttr(m.avatarUrl) : '';
  const fillColor = escapeAttr(m.avatarBg || '#C4704B');
  const textColor = escapeAttr(m.avatarColor || '#FFF8F0');

  const fallbackHtml = `
    <div style="
      width:100%; height:100%;
      display:flex; align-items:center; justify-content:center;
      background:${fillColor};
      color:${textColor};
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      font-weight:700; font-size:15px; letter-spacing:0.2px;
    ">${initials}</div>
  `.replace(/\s+/g, ' ').trim();

  // The img onerror swaps the parent's contents with the initials fallback.
  // Note: encodeURIComponent the inner HTML so it survives an attribute.
  const imgHtml = safeUrl
    ? `<img src="${safeUrl}" alt=""
        style="width:100%; height:100%; object-fit:cover; display:block;"
        onerror="this.parentElement.innerHTML = decodeURIComponent('${encodeURIComponent(fallbackHtml)}');"
      />`
    : fallbackHtml;

  return `
    <div style="
      width:46px; height:46px; border-radius:50%;
      background:#FAF7F2;
      border:3px solid ${ringColor};
      box-shadow: 0 2px 10px rgba(44,36,32,0.22);
      overflow:hidden;
      opacity:${opacity};
    ">${imgHtml}</div>
  `.replace(/\s+/g, ' ').trim();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
