import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, ScrollView, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar } from './Avatar';
import { useLivePresence } from '../hooks/useLivePresence';
import { useGroupSessionStore } from '../store/groupSessionStore';
import { useDoItNowStore } from '../store/doItNowStore';
import { useAuthStore } from '../store';
import { loadGoogleMaps } from '../utils/loadGoogleMaps';
import {
  computeParticipantProgress,
  formatProgressLine,
  formatStepChip,
  ParticipantStatus,
} from '../utils/groupSessionProgress';

interface Props {
  visible: boolean;
  sessionId: string;
  myLocation?: { lat: number; lng: number } | null;
  onClose: () => void;
}

/**
 * Unified group-session map — replaces the old split between the
 * "places" preview map and the "friends live position" sheet.
 *
 * Single map shows :
 *   • numbered terracotta markers + walking polyline for the plan route
 *   • avatar overlays for each opted-in participant (live position)
 *
 * Filter chips at top swap visibility :
 *   • "Tous"  — places + people, fitBounds(both).
 *   • "Lieux" — places only, fitBounds(places), zoom max 15.
 *   • "Amis"  — people only, fitBounds(presences), zoom min 13.
 *
 * Bottom drawer lists every participant with :
 *   • avatar + name + step chip (e.g. "2/4")
 *   • "À 230m du Café X" / "Sur place — Café X" / "✓ a fini"
 *   • Tap → flyTo their position + zoom 16. Single-source map = no
 *     cognitive context-switch between two surfaces.
 *
 * Engagement hook : the drawer makes the group LIVE. You can see at a
 * glance who's ahead, who's lingering, who just arrived — turning the
 * shared session into a soft race.
 */
export const GroupSessionMap: React.FC<Props> = ({ visible, sessionId, myLocation, onClose }) => {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const { presences, optInStatus, optIn, optOut } = useLivePresence(visible ? sessionId : undefined);
  const session = useGroupSessionStore((s) => s.activeSession);
  const plan = useDoItNowStore((s) => s.plan);

  // Filter state — drives both visibility on the map AND fitBounds behavior.
  const [filter, setFilter] = useState<'all' | 'places' | 'people'>('all');

  // Imperative refs — Google Maps lives outside the React tree.
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const placeMarkersRef = useRef<any[]>([]);
  const polylineRef = useRef<any>(null);
  const avatarOverlaysRef = useRef<Record<string, any>>({});

  // ── Derived data ──
  const placesById = useMemo(() => {
    const out: Record<string, { id: string; name: string; latitude?: number; longitude?: number }> = {};
    plan?.places.forEach((p) => { out[p.id] = p; });
    return out;
  }, [plan]);

  const validPlaces = useMemo(
    () => (plan?.places || []).filter((p) => p.latitude && p.longitude),
    [plan],
  );

  // Marker list — pair presences with participant metadata.
  const friendMarkers = useMemo(() => {
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

  // Per-participant progress — drives the drawer rows.
  const participantRows = useMemo(() => {
    if (!session || !plan) return [];
    return Object.values(session.participants).map((p) => {
      const live = presences.find((lp) => lp.userId === p.userId) || null;
      const progress = computeParticipantProgress(p, session.placeOrder, placesById, live);
      return { participant: p, live, progress };
    });
  }, [session, plan, presences, placesById]);

  // ── Map lifecycle ──
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    loadGoogleMaps(() => {
      if (cancelled || !mapDivRef.current) return;
      const gm = (window as any).google?.maps;
      if (!gm) return;

      // First-time init — seed center on the first place / friend / Paris.
      if (!mapRef.current) {
        const seed = validPlaces[0]
          ? { lat: validPlaces[0].latitude!, lng: validPlaces[0].longitude! }
          : friendMarkers[0]
            ? { lat: friendMarkers[0].lat, lng: friendMarkers[0].lng }
            : { lat: 48.8566, lng: 2.3522 };
        mapRef.current = new gm.Map(mapDivRef.current, {
          styles: MAP_STYLE,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          backgroundColor: '#F5F0E8',
          center: seed,
          zoom: 14,
        });
      }
      const map = mapRef.current;

      // ── Reconcile place markers ──
      placeMarkersRef.current.forEach((m) => m.setMap(null));
      placeMarkersRef.current = [];
      polylineRef.current?.setMap(null);
      polylineRef.current = null;

      const showPlaces = filter !== 'people';
      if (showPlaces) {
        validPlaces.forEach((p, i) => {
          const svg = buildNumberedPinSVG(i + 1, 28, '#C4704B');
          const marker = new gm.Marker({
            position: { lat: p.latitude!, lng: p.longitude! },
            map,
            icon: {
              url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
              scaledSize: new gm.Size(28, 28),
              anchor: new gm.Point(14, 14),
            },
            zIndex: 100 + i,
            cursor: 'pointer',
          });
          marker.addListener('click', () => {
            map.panTo({ lat: p.latitude!, lng: p.longitude! });
            map.setZoom(17);
          });
          placeMarkersRef.current.push(marker);
        });

        if (validPlaces.length >= 2) {
          // Straight polyline — fast + reliable. The DirectionsService
          // path was nice but added latency + flakiness on flow opening.
          // For the unified map we prioritize instant visual feedback.
          polylineRef.current = new gm.Polyline({
            path: validPlaces.map((p) => ({ lat: p.latitude!, lng: p.longitude! })),
            strokeColor: '#C4704B',
            strokeOpacity: 0.85,
            strokeWeight: 4,
            geodesic: true,
            map,
            zIndex: 50,
          });
        }
      }

      // ── Reconcile friend overlays ──
      const showPeople = filter !== 'places';
      const AvatarOverlayClass = getAvatarOverlayClass(gm);
      const seen: Record<string, true> = {};
      if (showPeople) {
        friendMarkers.forEach((m) => {
          seen[m.userId] = true;
          const stale = Date.now() - m.ts > 120_000;
          const html = makeAvatarMarkerHtml(m, stale);
          const position = new gm.LatLng(m.lat, m.lng);
          const existing = avatarOverlaysRef.current[m.userId];
          if (existing) {
            existing.update(position, html);
          } else {
            const overlay = new AvatarOverlayClass(position, html);
            overlay.setMap(map);
            avatarOverlaysRef.current[m.userId] = overlay;
          }
        });
      }
      // Tear down overlays that shouldn't be visible (filter-hidden OR gone).
      Object.keys(avatarOverlaysRef.current).forEach((uid) => {
        if (!seen[uid]) {
          avatarOverlaysRef.current[uid].setMap(null);
          delete avatarOverlaysRef.current[uid];
        }
      });

      // ── Smart fit-bounds based on filter ──
      const bounds = new gm.LatLngBounds();
      let any = false;
      if (showPlaces) {
        validPlaces.forEach((p) => {
          bounds.extend({ lat: p.latitude!, lng: p.longitude! });
          any = true;
        });
      }
      if (showPeople) {
        friendMarkers.forEach((m) => {
          bounds.extend({ lat: m.lat, lng: m.lng });
          any = true;
        });
      }
      if (any) {
        map.fitBounds(bounds, { top: 80, right: 60, bottom: 240, left: 60 });
        // Zoom caps depending on filter — "Amis" should stay neighborhood-
        // level even if everyone is a few meters apart, "Lieux" shouldn't
        // crash into street-level on a tight cluster.
        gm.event.addListenerOnce(map, 'bounds_changed', () => {
          const zoom = map.getZoom();
          const maxZoom = filter === 'places' ? 15 : filter === 'people' ? 17 : 16;
          const minZoom = filter === 'people' ? 13 : 11;
          if (zoom > maxZoom) map.setZoom(maxZoom);
          if (zoom < minZoom) map.setZoom(minZoom);
        });
      }
    });
    return () => { cancelled = true; };
  }, [visible, filter, validPlaces, friendMarkers]);

  // Cleanup on close.
  useEffect(() => {
    if (visible) return;
    placeMarkersRef.current.forEach((m) => m.setMap?.(null));
    placeMarkersRef.current = [];
    polylineRef.current?.setMap?.(null);
    polylineRef.current = null;
    Object.values(avatarOverlaysRef.current).forEach((o: any) => o.setMap?.(null));
    avatarOverlaysRef.current = {};
    mapRef.current = null;
  }, [visible]);

  // Tap a participant row → fly the map to their live position.
  const flyToParticipant = (userId: string) => {
    const lp = presences.find((p) => p.userId === userId);
    if (!lp || !mapRef.current) return;
    const gm = (window as any).google?.maps;
    if (!gm) return;
    mapRef.current.panTo(new gm.LatLng(lp.lat, lp.lng));
    mapRef.current.setZoom(16);
    // If we were on "places", pivot to "all" so the avatar is visible.
    if (filter === 'places') setFilter('all');
  };

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>EN GROUPE</Text>
            <Text style={styles.title}>{plan?.title || 'Plan'}</Text>
          </View>
          <View style={{ width: 34 }} />
        </View>

        {/* ── Filter chips ── */}
        <View style={styles.filterRow}>
          {([
            { key: 'all',    label: 'Tous',  icon: 'apps-outline'      as const },
            { key: 'places', label: 'Lieux', icon: 'location-outline'  as const },
            { key: 'people', label: 'Amis',  icon: 'people-outline'    as const },
          ]).map((opt) => {
            const active = filter === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setFilter(opt.key as any)}
                activeOpacity={0.85}
              >
                <Ionicons name={opt.icon} size={13} color={active ? Colors.textOnAccent : Colors.textSecondary} />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Map ── */}
        <View style={styles.mapWrap}>
          <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />
          {filter === 'people' && friendMarkers.length === 0 && (
            <View style={styles.mapEmpty} pointerEvents="none">
              <Ionicons name="location-outline" size={20} color={Colors.textTertiary} />
              <Text style={styles.mapEmptyText}>
                Personne ne partage sa position pour l{'’'}instant
              </Text>
            </View>
          )}
        </View>

        {/* ── Bottom drawer : participants + progress ── */}
        <View style={[styles.drawer, { paddingBottom: insets.bottom + 10 }]}>
          {optInStatus === 'pending' && (
            <View style={styles.optInBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.optInTitle}>Partager ta position ?</Text>
                <Text style={styles.optInBody}>
                  Tes amis te verront sur la carte, et tu pourras les suivre en temps réel.
                </Text>
              </View>
              <TouchableOpacity style={styles.optInPrimary} onPress={optIn} activeOpacity={0.85}>
                <Text style={styles.optInPrimaryText}>Partager</Text>
              </TouchableOpacity>
            </View>
          )}

          <ScrollView
            style={{ maxHeight: 280 }}
            contentContainerStyle={{ paddingTop: 4 }}
            showsVerticalScrollIndicator={false}
          >
            {participantRows.map(({ participant: p, live, progress }) => {
              const isMe = p.userId === user?.id;
              const tappable = !!live;
              const statusBadgeStyle = badgeStyleFor(progress.status);
              return (
                <Pressable
                  key={p.userId}
                  onPress={() => tappable && flyToParticipant(p.userId)}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && tappable && { backgroundColor: Colors.bgPrimary },
                  ]}
                >
                  <Avatar
                    initials={p.initials}
                    bg={p.avatarBg}
                    color={p.avatarColor}
                    size="M"
                    avatarUrl={p.avatarUrl ?? undefined}
                  />
                  <View style={styles.rowText}>
                    <View style={styles.rowNameLine}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {isMe ? 'Toi' : p.displayName.split(' ')[0]}
                      </Text>
                      <View style={[styles.stepChip, statusBadgeStyle.chip]}>
                        <Text style={[styles.stepChipText, statusBadgeStyle.text]}>
                          {formatStepChip(progress)}
                        </Text>
                      </View>
                      {progress.status === 'on_site' && (
                        <View style={styles.liveDot} />
                      )}
                    </View>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {formatProgressLine(progress)}
                    </Text>
                  </View>
                  {tappable && (
                    <Ionicons name="locate" size={16} color={Colors.primary} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          {optInStatus === 'opted-in' && (
            <TouchableOpacity style={styles.optOutFooter} onPress={optOut} activeOpacity={0.7}>
              <Ionicons name="eye-off-outline" size={13} color={Colors.textTertiary} />
              <Text style={styles.optOutFooterText}>Arrêter de partager ma position</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════════════
// Status badge styling (chip background + text color)
// ══════════════════════════════════════════════════════════════

function badgeStyleFor(status: ParticipantStatus): { chip: any; text: any } {
  switch (status) {
    case 'finished':
      return {
        chip:  { backgroundColor: Colors.success ? `${Colors.success}1A` : '#E8F2EC', borderColor: Colors.success || '#3F9D6F' },
        text:  { color: Colors.success || '#3F9D6F' },
      };
    case 'on_site':
      return {
        chip:  { backgroundColor: Colors.terracotta100, borderColor: Colors.terracotta300 },
        text:  { color: Colors.terracotta700 },
      };
    case 'in_transit':
    default:
      return {
        chip:  { backgroundColor: Colors.bgSecondary, borderColor: Colors.borderMedium },
        text:  { color: Colors.textSecondary },
      };
  }
}

// ══════════════════════════════════════════════════════════════
// Numbered place marker SVG (matches GroupLiveMapSheet + PlanMapModal style).
// ══════════════════════════════════════════════════════════════

function buildNumberedPinSVG(num: number, size: number, fill: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 28 28">
    <circle cx="14" cy="14" r="13" fill="${fill}" stroke="white" stroke-width="2"/>
    <text x="14" y="18.5" text-anchor="middle" fill="white" font-size="12" font-weight="700" font-family="-apple-system,sans-serif">${num}</text>
  </svg>`;
}

// ══════════════════════════════════════════════════════════════
// Avatar overlay — same pattern as GroupLiveMapSheet.web.
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
      this.div.style.pointerEvents = 'none';
      this.div.innerHTML = this.html;
      this.getPanes().overlayMouseTarget.appendChild(this.div);
    }
    draw() {
      const proj = this.getProjection();
      if (!proj || !this.div) return;
      const point = proj.fromLatLngToDivPixel(this.position);
      if (point) {
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

interface FriendMarker {
  userId: string;
  lat: number;
  lng: number;
  initials: string;
  avatarBg: string;
  avatarColor: string;
  avatarUrl?: string | null;
  ts: number;
}

function makeAvatarMarkerHtml(m: FriendMarker, stale: boolean): string {
  const ringColor = stale ? '#A09181' : '#C4704B';
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
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ══════════════════════════════════════════════════════════════
// Map style — terracotta/cream, identical to PlanMapModal +
// GroupLiveMapSheet for visual cohesion.
// ══════════════════════════════════════════════════════════════
const MAP_STYLE = [
  {"featureType":"all","elementType":"labels.text.fill","stylers":[{"color":"#6B5D52"}]},
  {"featureType":"all","elementType":"labels.text.stroke","stylers":[{"color":"#FAF7F2"},{"weight":2}]},
  {"featureType":"all","elementType":"labels.icon","stylers":[{"visibility":"off"}]},
  {"featureType":"administrative","elementType":"geometry.fill","stylers":[{"color":"#EDE5D8"}]},
  {"featureType":"administrative","elementType":"geometry.stroke","stylers":[{"color":"#DDD4C8"},{"weight":1.2}]},
  {"featureType":"administrative.locality","elementType":"labels.text.fill","stylers":[{"color":"#4A3F37"}]},
  {"featureType":"landscape","elementType":"geometry","stylers":[{"color":"#F5F0E8"}]},
  {"featureType":"poi","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"road.highway","elementType":"geometry.fill","stylers":[{"color":"#DDD4C8"}]},
  {"featureType":"road.arterial","elementType":"geometry","stylers":[{"color":"#EDE5D8"}]},
  {"featureType":"road.local","elementType":"geometry","stylers":[{"color":"#FAF7F2"}]},
  {"featureType":"transit","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"water","elementType":"geometry","stylers":[{"color":"#D4DEE6"}]},
];

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.bgPrimary,
  },
  eyebrow: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    color: Colors.primary,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  title: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.bgPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 12.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
    letterSpacing: -0.05,
  },
  chipTextActive: { color: Colors.textOnAccent },
  mapWrap: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  mapEmpty: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(245,240,232,0.9)',
  },
  mapEmptyText: {
    fontSize: 12.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  drawer: {
    backgroundColor: Colors.bgSecondary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  optInBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.terracotta50,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.terracotta200,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  optInTitle: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  optInBody: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    lineHeight: 15,
  },
  optInPrimary: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  optInPrimaryText: {
    fontSize: 12.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
    borderRadius: 8,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowName: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  stepChip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stepChipText: {
    fontSize: 10.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 0.2,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success || '#3F9D6F',
  },
  rowMeta: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  optOutFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 12,
    paddingBottom: 6,
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
  },
  optOutFooterText: {
    fontSize: 11.5,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textTertiary,
  },
});
