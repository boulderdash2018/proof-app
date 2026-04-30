import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar } from './Avatar';
import { ChatMessage, ConversationParticipant } from '../services/chatService';
import { Plan } from '../types';
import { fetchPlanById } from '../services/plansService';
import { loadGoogleMaps } from '../utils/loadGoogleMaps';

interface Props {
  message: ChatMessage;
  participants?: Record<string, ConversationParticipant>;
  /** Linked plan id — fetched to render the inline map. */
  planId?: string | null;
  /** Plan title — used for the eyebrow line "X a confirmé Y". */
  planTitle?: string | null;
  /** Optional meetup ISO — surfaced in the meta line below the map. */
  meetupAt?: string | null;
  /** Tap → open Plan detail with the map sheet auto-shown. Different
   *  destination from the pinned plan card so the two widgets stop
   *  being redundant. */
  onPressMap?: () => void;
}

// ──────────────────────────────────────────────────────────────
// Google Maps style — same warm cream palette as PlanMapModal so
// the inline preview reads as a "miniature" of the fullscreen view.
// ──────────────────────────────────────────────────────────────
const PROOF_MAP_STYLE = [
  {"featureType":"all","elementType":"labels.text.fill","stylers":[{"color":"#6B5D52"}]},
  {"featureType":"all","elementType":"labels.text.stroke","stylers":[{"color":"#FAF7F2"},{"weight":2}]},
  {"featureType":"all","elementType":"labels.icon","stylers":[{"visibility":"off"}]},
  {"featureType":"administrative","elementType":"geometry.fill","stylers":[{"color":"#EDE5D8"}]},
  {"featureType":"administrative","elementType":"geometry.stroke","stylers":[{"color":"#DDD4C8"},{"weight":1.2}]},
  {"featureType":"administrative.locality","elementType":"labels.text.fill","stylers":[{"color":"#4A3F37"}]},
  {"featureType":"landscape","elementType":"geometry","stylers":[{"color":"#F5F0E8"}]},
  {"featureType":"poi","elementType":"geometry","stylers":[{"color":"#EDE5D8"}]},
  {"featureType":"poi","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"road.highway","elementType":"geometry.fill","stylers":[{"color":"#DDD4C8"}]},
  {"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#C4B8AA"},{"weight":0.2}]},
  {"featureType":"road.arterial","elementType":"geometry","stylers":[{"color":"#EDE5D8"}]},
  {"featureType":"road.local","elementType":"geometry","stylers":[{"color":"#FAF7F2"}]},
  {"featureType":"transit","elementType":"geometry","stylers":[{"color":"#EDE5D8"}]},
  {"featureType":"transit.line","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"water","elementType":"geometry","stylers":[{"color":"#D4DEE6"}]},
];

interface MiniMapProps {
  places: Array<{ name: string; latitude: number; longitude: number }>;
  /** Fired after the map fully loaded (markers + polyline drawn) so the
   *  parent can fade out the loading state. */
  onReady: () => void;
}

/**
 * MiniMap — read-only inline Google Map for the chat card preview.
 *
 * Differences from the fullscreen PlanMapModal :
 *   • All gestures disabled — the whole card is tappable to escalate
 *     to the fullscreen view, no need to handle pan/zoom in the chat
 *   • No zoom control, no street view, no map type toggle
 *   • Tighter padding on fitBounds (50px instead of 100) so the
 *     trajectory fills more of the small canvas
 *   • Polyline animation : draws progressively after the route resolves
 *     ("snake" from origin to destination) for an editorial reveal
 */
const MiniMap: React.FC<MiniMapProps> = ({ places, onReady }) => {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const polylineAnimRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    loadGoogleMaps(() => {
      if (!mapDivRef.current || !places.length) return;
      const gm = (window as any).google.maps;

      const map = new gm.Map(mapDivRef.current, {
        styles: PROOF_MAP_STYLE,
        disableDefaultUI: true,
        zoomControl: false,
        gestureHandling: 'none',          // ← read-only, parent handles tap
        keyboardShortcuts: false,
        clickableIcons: false,
        backgroundColor: '#F5F0E8',
      });

      // Fit bounds — tighter padding so the route fills the card
      const bounds = new gm.LatLngBounds();
      places.forEach((p) => bounds.extend({ lat: p.latitude, lng: p.longitude }));
      map.fitBounds(bounds, { top: 28, right: 28, bottom: 28, left: 28 });
      gm.event.addListenerOnce(map, 'bounds_changed', () => {
        if (map.getZoom() > 14) map.setZoom(14);
      });

      // Markers — terracotta numbered dots (same SVG as fullscreen map)
      places.forEach((p, i) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="13" fill="%23D4845A" stroke="white" stroke-width="2"/><text x="14" y="18.5" text-anchor="middle" fill="white" font-size="12" font-weight="700" font-family="-apple-system,sans-serif">${i + 1}</text></svg>`;
        new gm.Marker({
          position: { lat: p.latitude, lng: p.longitude },
          map,
          icon: {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
            scaledSize: new gm.Size(24, 24),
            anchor: new gm.Point(12, 12),
          },
          clickable: false,
          zIndex: 100 + i,
        });
      });

      // Polyline — pulled from Directions Service (real walking path).
      // Animated reveal : draw progressively from origin → destination
      // for an editorial "telling the story" feel. Runs over ~900ms.
      if (places.length >= 2) {
        const ds = new gm.DirectionsService();
        const origin = { lat: places[0].latitude, lng: places[0].longitude };
        const dest = { lat: places[places.length - 1].latitude, lng: places[places.length - 1].longitude };
        const waypoints = places.slice(1, -1).map((p) => ({
          location: { lat: p.latitude, lng: p.longitude },
          stopover: true,
        }));

        ds.route(
          {
            origin,
            destination: dest,
            waypoints,
            travelMode: gm.TravelMode.WALKING,
            optimizeWaypoints: false,
          },
          (result: any, status: string) => {
            // Build the full path (or fallback to straight lines if Directions failed).
            let fullPath: any[] = [];
            if (status === 'OK' && result) {
              result.routes[0].legs.forEach((leg: any) => {
                leg.steps.forEach((step: any) => {
                  fullPath = fullPath.concat(step.path);
                });
              });
            } else {
              fullPath = places.map((p) => ({ lat: p.latitude, lng: p.longitude }));
            }

            // Animated reveal — incrementally extend the polyline path
            // each frame. Cancellable so unmount during animation
            // doesn't leak setInterval.
            const polyline = new gm.Polyline({
              path: [],
              strokeColor: '#D4845A',
              strokeOpacity: 0.9,
              strokeWeight: 4,
              geodesic: true,
              map,
              zIndex: 50,
            });

            const totalSteps = fullPath.length;
            const durationMs = 900;
            const stepDelayMs = Math.max(8, durationMs / Math.max(totalSteps, 1));
            let i = 0;
            const tick = setInterval(() => {
              i = Math.min(totalSteps, i + Math.max(1, Math.ceil(totalSteps / (durationMs / stepDelayMs))));
              polyline.setPath(fullPath.slice(0, i));
              if (i >= totalSteps) {
                clearInterval(tick);
                onReady();
              }
            }, stepDelayMs);

            polylineAnimRef.current = { stop: () => clearInterval(tick) };
          },
        );
      } else {
        // Single place — no polyline, just signal ready.
        onReady();
      }
    });

    return () => {
      polylineAnimRef.current?.stop?.();
    };
  }, [places, onReady]);

  // Inline div — RN-Web preserves it as a real DOM element so Google
  // Maps can attach to it. No wrapping View ; the parent's overflow:
  // hidden + border-radius gives the rounded corners.
  return (
    <div
      ref={mapDivRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
};

/**
 * Animated "PLAN PRÊT" card with an inline Google Map preview.
 *
 * Layout :
 *   • Header — actor avatar + "● PLAN PRÊT" eyebrow + verb + plan title
 *   • Inline mini map — read-only, fits the route bounds, animates the
 *     polyline reveal on load. Subtle opacity fade-in once ready.
 *   • Meta line under the map — "N étapes · le 1 mai à 18h"
 *   • CTA bar — "Voir le trajet sur la map →" with shimmering arrow
 *
 * Tap target = the entire card → onPressMap() → PlanDetail with
 * `openMap: true`. Distinct from the pinned plan card's destination
 * (which lands on the overview without the map).
 */
export const CoPlanDetailsConfirmedCard: React.FC<Props> = ({
  message,
  participants,
  planId,
  planTitle,
  meetupAt,
  onPressMap,
}) => {
  const ev = message.systemEvent;
  if (!ev) return null;

  const actorId = ev.actorId || message.senderId;
  const actor = participants?.[actorId];
  const actorName = actor?.displayName?.split(' ')[0] || 'Quelqu’un';

  // ── Plan fetch (places + coords) ──
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(!!planId);
  useEffect(() => {
    if (!planId) {
      setPlan(null);
      setLoadingPlan(false);
      return;
    }
    let cancelled = false;
    setLoadingPlan(true);
    fetchPlanById(planId)
      .then((p) => { if (!cancelled) setPlan(p); })
      .catch((err) => console.warn('[CoPlanDetailsConfirmedCard.web] fetchPlanById:', err))
      .finally(() => { if (!cancelled) setLoadingPlan(false); });
    return () => { cancelled = true; };
  }, [planId]);

  // ── Map ready opacity (fade in once the polyline reveal completes) ──
  const mapOpacity = useRef(new Animated.Value(0)).current;
  const handleMapReady = React.useCallback(() => {
    Animated.timing(mapOpacity, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [mapOpacity]);

  // ── Slide-up + fade-in for the whole card ──
  const enterY = useRef(new Animated.Value(14)).current;
  const enterOp = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(enterY, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      Animated.timing(enterOp, { toValue: 1, duration: 360, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Soft shimmer on the CTA arrow ──
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(800),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);
  const shimmerX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0, 4] });

  // ── Filter places to those with valid coords (the map can't render
  //    invalid LatLngLiterals — see the InvalidValueError fix earlier) ──
  const placeCoords = (plan?.places || [])
    .filter((p) => typeof p.latitude === 'number' && typeof p.longitude === 'number' && p.latitude !== 0 && p.longitude !== 0)
    .map((p) => ({ name: p.name, latitude: p.latitude as number, longitude: p.longitude as number }));

  const totalPlaces = plan?.places.length || 0;
  const meetupLabel = meetupAt ? formatMeetupLabel(meetupAt) : null;
  const metaLine = [
    totalPlaces > 0 ? `${totalPlaces} étape${totalPlaces > 1 ? 's' : ''}` : null,
    meetupLabel,
  ].filter(Boolean).join('  ·  ');

  return (
    <Animated.View
      style={[
        styles.wrap,
        { opacity: enterOp, transform: [{ translateY: enterY }] },
      ]}
    >
      <TouchableOpacity
        style={styles.card}
        activeOpacity={onPressMap ? 0.9 : 1}
        onPress={onPressMap}
        disabled={!onPressMap}
      >
        {/* ── Header — actor + eyebrow + title ── */}
        <View style={styles.header}>
          {actor ? (
            <Avatar
              initials={actor.initials}
              bg={actor.avatarBg}
              color={actor.avatarColor}
              size="S"
              avatarUrl={actor.avatarUrl ?? undefined}
            />
          ) : (
            <View style={styles.actorFallback} />
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.eyebrowRow}>
              <View style={styles.eyebrowDot} />
              <Text style={styles.eyebrow}>PLAN PRÊT</Text>
            </View>
            <Text style={styles.verb} numberOfLines={1}>
              {actorName} a confirmé{planTitle ? ' ' : ' la journée'}
              {planTitle ? <Text style={styles.title}>{planTitle}</Text> : null}
            </Text>
          </View>
        </View>

        {/* ── Mini map ── */}
        <View style={styles.mapFrame}>
          {loadingPlan || placeCoords.length === 0 ? (
            <View style={styles.mapLoading}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          ) : (
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: mapOpacity }]}>
              <MiniMap places={placeCoords} onReady={handleMapReady} />
            </Animated.View>
          )}
        </View>

        {/* ── Meta line — "3 étapes · le 1 mai à 18h" ── */}
        {!!metaLine && (
          <Text style={styles.metaLine} numberOfLines={1}>
            {metaLine}
          </Text>
        )}

        {/* ── CTA bar ── */}
        {onPressMap && (
          <View style={styles.ctaBar}>
            <Ionicons name="map-outline" size={14} color={Colors.primary} />
            <Text style={styles.ctaText}>Voir le trajet sur la map</Text>
            <Animated.View style={{ transform: [{ translateX: shimmerX }] }}>
              <Ionicons name="arrow-forward" size={14} color={Colors.primary} />
            </Animated.View>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function formatMeetupLabel(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const dayLabel = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const h = d.getHours();
    const m = d.getMinutes();
    const timeLabel = m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, '0')}`;
    return `le ${dayLabel} · ${timeLabel}`;
  } catch {
    return '';
  }
}

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  card: {
    backgroundColor: Colors.bgSecondary,
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 0,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.terracotta100,
    overflow: 'hidden',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  actorFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  eyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  eyebrow: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.primary,
  },
  verb: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    letterSpacing: -0.05,
  },
  title: {
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },

  // Mini map frame
  mapFrame: {
    height: 180,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F5F0E8',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  mapLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Meta line under the map
  metaLine: {
    marginTop: 10,
    fontSize: 11.5,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
    letterSpacing: 0.05,
  },

  // CTA bar
  ctaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 12,
    marginHorizontal: -14,
    backgroundColor: Colors.terracotta50,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.terracotta100,
  },
  ctaText: {
    fontSize: 12.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
    letterSpacing: -0.05,
  },
});
