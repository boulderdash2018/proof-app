import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Layout } from '../constants';
import { RootStackParamList } from '../navigation/types';
import { Plan } from '../types';
import { fetchPlanById } from '../services/plansService';
import { createGroupSession } from '../services/planSessionService';
import { useAuthStore } from '../store/authStore';
import { useDoItNowStore } from '../store/doItNowStore';
import { ConversationParticipant } from '../services/chatService';

/**
 * Pre-meeting holding screen — shown when a participant tries to launch
 * the live session before the meetupAt time. Displays a friendly
 * "Pas si vite !" message, a live countdown, the plan preview, and a
 * dev-only override "Commencer maintenant" so we don't have to wait
 * during development.
 *
 * Auto-redirect : when the countdown hits zero, we navigate to DoItNow
 * (creating the session if it doesn't exist yet).
 *
 * If meetupAt is null/missing, we treat the plan as "always ready" and
 * skip straight to the override CTA at the bottom (no countdown).
 *
 * Visual language : crème background + Fraunces big number + tiny
 * terracotta accents — same DA as the rest of the workspace.
 */

type Route = RouteProp<RootStackParamList, 'WaitingRoom'>;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface CountdownParts {
  totalMs: number;
  /** Display variants : far ("Dans 3 jours"), close ("HH:MM:SS"), now ("0"). */
  variant: 'far' | 'close' | 'now';
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Pre-formatted long line for the "far" variant. */
  farLabel: string;
}

const computeCountdown = (meetupAtISO: string | null): CountdownParts | null => {
  if (!meetupAtISO) return null;
  const targetMs = new Date(meetupAtISO).getTime();
  if (!Number.isFinite(targetMs)) return null;
  const totalMs = Math.max(0, targetMs - Date.now());

  if (totalMs === 0) {
    return { totalMs: 0, variant: 'now', days: 0, hours: 0, minutes: 0, seconds: 0, farLabel: '' };
  }

  const days = Math.floor(totalMs / DAY_MS);
  const hours = Math.floor((totalMs % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((totalMs % HOUR_MS) / (60 * 1000));
  const seconds = Math.floor((totalMs % (60 * 1000)) / 1000);

  // > 24h : friendly long-form line ("Dans 3 jours et 2 heures").
  if (days >= 1) {
    const dayPart = days === 1 ? 'demain' : `dans ${days} jours`;
    let farLabel = dayPart;
    if (days < 7 && hours > 0) {
      farLabel = `${dayPart}${days >= 1 ? ` · ${hours}h` : ''}`;
    }
    return { totalMs, variant: 'far', days, hours, minutes, seconds, farLabel };
  }

  return { totalMs, variant: 'close', days: 0, hours, minutes, seconds, farLabel: '' };
};

const pad2 = (n: number): string => n.toString().padStart(2, '0');

export const WaitingRoomScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<Route>();
  const { planId, conversationId, meetupAt } = route.params;

  const user = useAuthStore((s) => s.user);

  // ── Plan fetch (for preview) ──
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetchPlanById(planId)
      .then((p) => { if (!cancelled) setPlan(p); })
      .catch((err) => console.warn('[WaitingRoom] fetchPlanById:', err))
      .finally(() => { if (!cancelled) setLoadingPlan(false); });
    return () => { cancelled = true; };
  }, [planId]);

  // ── Live countdown — re-runs every second ──
  const [countdown, setCountdown] = useState<CountdownParts | null>(() => computeCountdown(meetupAt));
  useEffect(() => {
    if (!meetupAt) return;
    const tick = () => setCountdown(computeCountdown(meetupAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [meetupAt]);

  // ── Auto-redirect when countdown reaches zero ──
  // The user might leave the screen open. When the meetup time hits, we
  // promote them to the live session automatically (best UX : no need to
  // tap anything, the wait just resolves itself).
  const autoRedirectFiredRef = useRef(false);
  useEffect(() => {
    if (!countdown || autoRedirectFiredRef.current) return;
    if (countdown.variant === 'now') {
      autoRedirectFiredRef.current = true;
      // Small delay so the user notices the transition.
      const t = setTimeout(() => handleStartNow(true), 600);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  // ── Pulse animation on the hourglass icon ──
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });

  // ── Slide-in on mount for the body ──
  const enterY = useRef(new Animated.Value(24)).current;
  const enterOp = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(enterY, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      Animated.timing(enterOp, { toValue: 1, duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Start NOW (override) — creates session + navigates to DoItNow ──
  // `auto` = countdown reached zero, so no spinner+haptic gate.
  const [starting, setStarting] = useState(false);
  const handleStartNow = async (auto = false) => {
    if (starting || !user || !plan) return;
    setStarting(true);
    try {
      const creator: ConversationParticipant = {
        userId: user.id,
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl || null,
        avatarBg: user.avatarBg,
        avatarColor: user.avatarColor,
        initials: user.initials,
      };
      const sessionId = await createGroupSession({
        plan: {
          id: plan.id,
          title: plan.title,
          coverPhoto: plan.coverPhotos?.[0] ?? null,
          placeIds: plan.places.map((p) => p.id),
        },
        conversationId,
        creator,
      });
      // Pre-populate local DoItNowStore so the screen mounts ready.
      useDoItNowStore.getState().startSession(plan, 'walking', user.id);
      navigation.replace('DoItNow', { planId: plan.id, sessionId, conversationId });
    } catch (err) {
      console.warn('[WaitingRoom] startNow failed:', err);
      setStarting(false);
    }
  };

  const handleBackToChat = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('Conversation', { conversationId, otherUser: null });
    }
  };

  // ── Headline copy adapts to how far the countdown is ──
  const headlineSub = useMemo(() => {
    if (!countdown) return 'Le plan démarrera quand vous serez prêts.';
    if (countdown.variant === 'far') return `Le plan démarre ${countdown.farLabel}.`;
    if (countdown.variant === 'close') return 'Plus que quelques instants…';
    return 'C’est l’heure !';
  }, [countdown]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleBackToChat} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>SALLE D{'’'}ATTENTE</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: enterOp, transform: [{ translateY: enterY }] }}>
          {/* ── Hero : pulsing hourglass + headline ── */}
          <View style={styles.hero}>
            <Animated.View
              style={[styles.iconWrap, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]}
            >
              <Ionicons name="hourglass-outline" size={32} color={Colors.primary} />
            </Animated.View>
            <Text style={styles.headline}>Pas si vite !</Text>
            <Text style={styles.headlineSub}>{headlineSub}</Text>
          </View>

          {/* ── Countdown ── */}
          {countdown && countdown.variant !== 'now' && (
            <View style={styles.countdownCard}>
              <Text style={styles.countdownLabel}>RENDEZ-VOUS DANS</Text>
              {countdown.variant === 'far' ? (
                <Text style={styles.countdownBig}>{countdown.farLabel}</Text>
              ) : (
                <View style={styles.countdownRow}>
                  {countdown.hours > 0 && (
                    <>
                      <CountdownUnit value={pad2(countdown.hours)} label="h" />
                      <Text style={styles.countdownSep}>:</Text>
                    </>
                  )}
                  <CountdownUnit value={pad2(countdown.minutes)} label="min" />
                  <Text style={styles.countdownSep}>:</Text>
                  <CountdownUnit value={pad2(countdown.seconds)} label="s" />
                </View>
              )}
            </View>
          )}

          {/* ── Plan preview ── */}
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Ionicons name="map-outline" size={14} color={Colors.primary} />
              <Text style={styles.previewLabel}>L{'’'}APERÇU DU PLAN</Text>
            </View>

            {loadingPlan ? (
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 18 }} />
            ) : plan ? (
              <>
                <Text style={styles.previewTitle} numberOfLines={2}>{plan.title}</Text>
                <View style={styles.previewPlaces}>
                  {plan.places.slice(0, 5).map((p, i) => (
                    <View key={p.id} style={styles.previewPlaceRow}>
                      <View style={styles.previewPin}>
                        <Text style={styles.previewPinText}>{i + 1}</Text>
                      </View>
                      <Text style={styles.previewPlaceName} numberOfLines={1}>{p.name}</Text>
                      {p.type ? (
                        <Text style={styles.previewPlaceType} numberOfLines={1}>{p.type}</Text>
                      ) : null}
                    </View>
                  ))}
                  {plan.places.length > 5 && (
                    <Text style={styles.previewMore}>
                      + {plan.places.length - 5} autre{plan.places.length - 5 > 1 ? 's' : ''} étape{plan.places.length - 5 > 1 ? 's' : ''}
                    </Text>
                  )}
                </View>
              </>
            ) : (
              <Text style={styles.previewError}>Impossible de charger l{'’'}aperçu.</Text>
            )}
          </View>

          {/* ── Soft hint ── */}
          <Text style={styles.hint}>
            En attendant, suis les échanges dans la conversation. Le plan démarrera tout seul à l{'’'}heure prévue.
          </Text>
        </Animated.View>
      </ScrollView>

      {/* ── Sticky bottom CTAs ── */}
      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={handleBackToChat}
          activeOpacity={0.85}
        >
          <Ionicons name="chatbubble-outline" size={16} color={Colors.textOnAccent} />
          <Text style={styles.btnPrimaryText}>Voir le chat</Text>
        </TouchableOpacity>

        {/* Dev override — visible le temps qu'on développe. À retirer (ou
            cacher derrière un flag) quand le timing sera respecté en prod. */}
        <TouchableOpacity
          style={styles.btnGhost}
          onPress={() => handleStartNow(false)}
          disabled={starting || !plan}
          activeOpacity={0.7}
        >
          {starting ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={styles.btnGhostText}>
              Commencer maintenant {' '}
              <Text style={styles.btnGhostHint}>(dev)</Text>
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// Sub-component — single countdown unit (HH or MM or SS)
// ══════════════════════════════════════════════════════════════

const CountdownUnit: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <View style={styles.countdownUnit}>
    <Text style={styles.countdownUnitValue}>{value}</Text>
    <Text style={styles.countdownUnitLabel}>{label}</Text>
  </View>
);

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 8,
    paddingBottom: 8,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: {
    fontSize: 11,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: Colors.textTertiary,
  },

  scroll: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 8,
  },

  // Hero
  hero: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 24,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.terracotta50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    borderWidth: 1.5,
    borderColor: Colors.terracotta100,
  },
  headline: {
    fontSize: 36,
    lineHeight: 40,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  headlineSub: {
    marginTop: 8,
    fontSize: 14,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
    letterSpacing: -0.05,
    textAlign: 'center',
    maxWidth: 280,
  },

  // Countdown
  countdownCard: {
    marginTop: 8,
    marginBottom: 22,
    paddingVertical: 22,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: Colors.bgSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
  },
  countdownLabel: {
    fontSize: 10,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.4,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  countdownBig: {
    fontSize: 28,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  countdownSep: {
    fontSize: 30,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textTertiary,
    letterSpacing: -0.4,
    paddingBottom: 14,
  },
  countdownUnit: {
    alignItems: 'center',
    minWidth: 56,
  },
  countdownUnitValue: {
    fontSize: 38,
    lineHeight: 42,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.7,
    fontVariant: ['tabular-nums'],
  },
  countdownUnitLabel: {
    fontSize: 11,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textTertiary,
    letterSpacing: 0.6,
    marginTop: 2,
    textTransform: 'lowercase',
  },

  // Plan preview
  previewCard: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: 18,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
    marginBottom: 18,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  previewLabel: {
    fontSize: 10,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    color: Colors.primary,
    textTransform: 'uppercase',
  },
  previewTitle: {
    fontSize: 19,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 14,
  },
  previewPlaces: { gap: 10 },
  previewPlaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewPin: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPinText: {
    fontSize: 11,
    fontFamily: Fonts.bodyBold,
    color: Colors.textOnAccent,
    letterSpacing: -0.05,
  },
  previewPlaceName: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  previewPlaceType: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    fontStyle: 'italic',
    maxWidth: 90,
  },
  previewMore: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textTertiary,
    fontStyle: 'italic',
    marginTop: 4,
    paddingLeft: 32,
  },
  previewError: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    fontStyle: 'italic',
    paddingVertical: 10,
  },

  // Hint
  hint: {
    fontSize: 12,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    color: Colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 17,
  },

  // CTAs
  ctaBar: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 12,
    backgroundColor: Colors.bgPrimary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
    gap: 8,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
  },
  btnPrimaryText: {
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
    letterSpacing: -0.1,
  },
  btnGhost: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  btnGhostText: {
    fontSize: 13,
    fontFamily: Fonts.bodyMedium,
    color: Colors.primary,
    letterSpacing: -0.05,
  },
  btnGhostHint: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    fontStyle: 'italic',
  },
});
