import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Image, StyleSheet, TouchableOpacity, Animated, Easing, ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';

interface Props {
  /** Place name — used in the call-to-action copy. */
  placeName: string;
  /** 0-based index of the current place in the plan. */
  stepIndex: number;
  /** Total number of places — drives the "first / mid / last" copy variant. */
  totalSteps: number;
  /**
   * How many photos this user has already added to the album in this
   * session. Drives the "photographe officiel" badge after 3+. Optional —
   * pass 0 (or skip) when the count isn't tracked yet.
   */
  contributionCount?: number;
  /** Tap → opens the picker. The handler returns the captured photo's
   *  data URL when successful, or null if the user cancelled. The card
   *  uses the data URL to render the polaroid thumb in the confirmation
   *  state. */
  onCapture: () => Promise<string | null>;
}

/**
 * Inline gamified call-to-action that surfaces on the review screen of
 * each step, encouraging (but not forcing) the user to drop a photo
 * into the shared group album.
 *
 * Design decisions :
 *
 *   • POLAROID FRAME — distinct visual artefact vs the rest of the
 *     review (which is plain editorial). Cream paper inside a slightly
 *     tilted frame ; signals "this is a memory moment, not a form".
 *
 *   • PULSING CAMERA EMOJI — the 📸 gently scales + rotates on idle,
 *     pulling the eye without nagging. Stops once the user has
 *     captured.
 *
 *   • COPY VARIES BY STEP — first place gets "Le tout premier souvenir",
 *     mid-trip gets "L'album prend forme", last gets "Le dernier
 *     souvenir...". Makes each prompt feel intentional, not mechanical.
 *
 *   • PHOTOGRAPHER BADGE — after 3 contributions, a small "📸
 *     Photographe officiel" tag appears under the title. Cheap reward
 *     loop that doesn't lock anyone out.
 *
 *   • SKIP IS DISCREET BUT VISIBLE — small "Pas cette fois" ghost link
 *     under the primary CTA. Never blocks the next step ; the parent
 *     footer still has its own "Passer / Étape suivante" buttons.
 *
 *   • POST-CAPTURE STATE — collapses into a soft confirmation row with
 *     a polaroid thumb of the just-shot photo + "Ajouté à l'album"
 *     line + the option to add another. Confetti emoji burst is timed
 *     once on transition for the small dopamine hit.
 */
export const SouvenirCaptureCard: React.FC<Props> = ({
  placeName, stepIndex, totalSteps, contributionCount = 0, onCapture,
}) => {
  type Status = 'idle' | 'capturing' | 'captured';
  const [status, setStatus] = useState<Status>('idle');
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  // ── Pulse animation on the camera emoji (idle only) ──
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (status !== 'idle') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(900),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [status, pulse]);
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const pulseRotate = pulse.interpolate({ inputRange: [0, 1], outputRange: ['-2deg', '2deg'] });

  // ── Slide-up + fade-in entry ──
  const enterY = useRef(new Animated.Value(12)).current;
  const enterOp = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(enterY, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      Animated.timing(enterOp, { toValue: 1, duration: 360, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Confetti burst — 3 emojis floating up + fading on success ──
  const confetti = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const burstConfetti = () => {
    const anims = confetti.map((v, i) =>
      Animated.sequence([
        Animated.delay(i * 80),
        Animated.timing(v, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    Animated.parallel(anims).start(() => {
      confetti.forEach((v) => v.setValue(0));
    });
  };

  const handleTap = async () => {
    if (status !== 'idle') return;
    setStatus('capturing');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const dataUrl = await onCapture();
      if (dataUrl) {
        setThumbUrl(dataUrl);
        setStatus('captured');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        burstConfetti();
      } else {
        setStatus('idle');
      }
    } catch (err) {
      console.warn('[SouvenirCaptureCard] capture failed:', err);
      setStatus('idle');
    }
  };

  // Reset to idle if the user wants to add another photo from the
  // confirmation state.
  const handleAddAnother = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setStatus('idle');
    setThumbUrl(null);
  };

  // ── Encouragement copy — adapts to where we are in the trip ──
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === totalSteps - 1;
  const encouragement = (() => {
    if (isFirstStep) return 'Le tout premier souvenir de la journée. L’album démarre 🎉';
    if (isLastStep) return 'Dernier moment du parcours — fais qu’il compte 📸';
    return 'L’album prend forme. Tes amis verront ton coup d’œil dans la galerie commune.';
  })();

  const isPhotographer = contributionCount >= 3;

  // ──────────────────────────────────────────────────────────────
  //  CAPTURED STATE
  // ──────────────────────────────────────────────────────────────
  if (status === 'captured') {
    return (
      <Animated.View style={[styles.wrap, { opacity: enterOp, transform: [{ translateY: enterY }] }]}>
        <View style={[styles.card, styles.cardCaptured]}>
          <View style={styles.eyebrowRow}>
            <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
            <Text style={[styles.eyebrow, { color: Colors.success }]}>AJOUTÉ À L’ALBUM</Text>
          </View>

          <View style={styles.capturedRow}>
            {/* Polaroid thumbnail of the just-captured photo */}
            {thumbUrl ? (
              <View style={styles.polaroidThumb}>
                <Image source={{ uri: thumbUrl }} style={styles.polaroidImg} />
              </View>
            ) : (
              <View style={[styles.polaroidThumb, { alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="image-outline" size={20} color={Colors.textTertiary} />
              </View>
            )}

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.capturedTitle}>Souvenir capturé 🎉</Text>
              <Text style={styles.capturedSub}>
                Tes amis le retrouveront dans l’album du groupe.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.addAnotherBtn}
            onPress={handleAddAnother}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={14} color={Colors.primary} />
            <Text style={styles.addAnotherText}>Ajouter une autre photo</Text>
          </TouchableOpacity>

          {/* Confetti burst — 3 emojis float up briefly on capture */}
          {confetti.map((v, i) => {
            const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, -60] });
            const opacity = v.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0] });
            const left = ['25%', '50%', '75%'][i] as any;
            const emoji = ['📸', '✨', '🎉'][i];
            return (
              <Animated.View
                key={i}
                pointerEvents="none"
                style={[styles.confetti, { left, opacity, transform: [{ translateY }] }]}
              >
                <Text style={styles.confettiEmoji}>{emoji}</Text>
              </Animated.View>
            );
          })}
        </View>
      </Animated.View>
    );
  }

  // ──────────────────────────────────────────────────────────────
  //  IDLE / CAPTURING STATE
  // ──────────────────────────────────────────────────────────────
  return (
    <Animated.View style={[styles.wrap, { opacity: enterOp, transform: [{ translateY: enterY }] }]}>
      <View style={styles.card}>
        <View style={styles.eyebrowRow}>
          <View style={styles.eyebrowDot} />
          <Text style={styles.eyebrow}>SOUVENIR COLLECTIF</Text>
          {isPhotographer && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>📸 PHOTOGRAPHE OFFICIEL</Text>
            </View>
          )}
        </View>

        <View style={styles.heroRow}>
          <Animated.View style={{ transform: [{ scale: pulseScale }, { rotate: pulseRotate }] }}>
            <Text style={styles.cameraEmoji}>📸</Text>
          </Animated.View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={2}>
              Capture cet instant à <Text style={styles.titleAccent}>{placeName}</Text>
            </Text>
            <Text style={styles.encouragement} numberOfLines={2}>
              {encouragement}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, status === 'capturing' && { opacity: 0.7 }]}
          onPress={handleTap}
          disabled={status !== 'idle'}
          activeOpacity={0.85}
        >
          {status === 'capturing' ? (
            <ActivityIndicator size="small" color={Colors.textOnAccent} />
          ) : (
            <>
              <Ionicons name="camera" size={16} color={Colors.textOnAccent} />
              <Text style={styles.primaryBtnText}>Prendre une photo</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  wrap: {
    marginVertical: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    paddingBottom: 14,
    shadowColor: 'rgba(44,36,32,0.18)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.7,
    shadowRadius: 14,
    elevation: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.terracotta100,
    position: 'relative',
    overflow: 'visible',
  },
  cardCaptured: {
    borderColor: 'rgba(123,153,113,0.4)',
    backgroundColor: Colors.bgSecondary,
  },

  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
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
  badge: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    backgroundColor: Colors.terracotta50,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.terracotta200,
  },
  badgeText: {
    fontSize: 9,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 0.6,
    color: Colors.primary,
  },

  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  cameraEmoji: {
    fontSize: 32,
  },
  title: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  titleAccent: {
    color: Colors.primary,
  },
  encouragement: {
    marginTop: 4,
    fontSize: 11.5,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    color: Colors.textSecondary,
    lineHeight: 16,
    letterSpacing: 0.05,
  },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primaryDeep,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryBtnText: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
    letterSpacing: -0.05,
  },

  // ── Captured state ──
  capturedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  polaroidThumb: {
    width: 56,
    height: 56,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    padding: 3,
    overflow: 'hidden',
    shadowColor: 'rgba(44,36,32,0.25)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 2,
  },
  polaroidImg: {
    flex: 1,
    width: '100%',
    height: '100%',
    borderRadius: 2,
    resizeMode: 'cover',
  },
  capturedTitle: {
    fontSize: 14,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.15,
  },
  capturedSub: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  addAnotherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.terracotta200,
    backgroundColor: Colors.bgPrimary,
    alignSelf: 'flex-start',
  },
  addAnotherText: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
    letterSpacing: -0.05,
  },

  // ── Confetti ──
  confetti: {
    position: 'absolute',
    bottom: 60,
  },
  confettiEmoji: {
    fontSize: 22,
  },
});
