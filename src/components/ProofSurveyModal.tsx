import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Image,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Fonts } from '../constants';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { Plan } from '../types';
import Svg, { Circle, Line, G, Defs, ClipPath } from 'react-native-svg';

const STAMP_PROOF = '#C8571A';
const STAMP_DECLINE = '#6B7A8D';
const CARD_WIDTH = Dimensions.get('window').width - 64;
const STAMP_SVG_SIZE = 146;
const STAMP_CTR = STAMP_SVG_SIZE / 2;
const MAIN_R = 55;
const STROKE_W = 5;
const TICK_INNER = MAIN_R + STROKE_W / 2 + 2;
const TICK_OUTER = TICK_INNER + 10;
const TICK_COUNT = 30;

const parseGradient = (g: string): string[] => {
  const m = g.match(/#[0-9A-Fa-f]{6}/g);
  return m && m.length >= 2 ? m : ['#FF6B35', '#C94520'];
};

interface Props {
  visible: boolean;
  plan: Plan;
  onProof: () => void;
  onDecline: () => void;
}

export const ProofSurveyModal: React.FC<Props> = ({ visible, plan, onProof, onDecline }) => {
  const C = useColors();
  const { t } = useTranslation();
  const [stampType, setStampType] = useState<'none' | 'proof' | 'declined'>('none');
  const stampScale = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const playStamp = (type: 'proof' | 'declined') => {
    setStampType(type);
    Haptics.impactAsync(
      type === 'proof' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light
    );

    stampScale.setValue(0);
    overlayOpacity.setValue(0);

    Animated.parallel([
      Animated.spring(stampScale, {
        toValue: 1,
        friction: 3,
        tension: 200,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(() => {
        if (type === 'proof') onProof();
        else onDecline();
        setStampType('none');
        stampScale.setValue(0);
        overlayOpacity.setValue(0);
      }, 900);
    });
  };

  // Get first available photo
  const coverPhoto = (() => {
    if (plan.coverPhotos && plan.coverPhotos.length > 0) return plan.coverPhotos[0];
    for (const place of plan.places) {
      if (place.photoUrls && place.photoUrls.length > 0) return place.photoUrls[0];
    }
    return null;
  })();

  const gradientColors = parseGradient(plan.gradient);
  const stampColor = stampType === 'proof' ? STAMP_PROOF : STAMP_DECLINE;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={[styles.container, { backgroundColor: C.gray200 }]}>
          {/* Header */}
          <Text style={[styles.title, { color: C.black }]}>{t.proof_survey_title}</Text>
          <Text style={[styles.subtitle, { color: C.gray600 }]}>{t.proof_survey_subtitle}</Text>

          {/* Card Preview */}
          <View style={[styles.card, { width: CARD_WIDTH }]}>
            {coverPhoto ? (
              <Image source={{ uri: coverPhoto }} style={styles.cardImage} />
            ) : (
              <LinearGradient
                colors={gradientColors as [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cardImage}
              />
            )}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.6)']}
              style={styles.cardOverlay}
            />
            <View style={styles.cardTitleWrap}>
              <Text style={styles.cardTitle}>{plan.title}</Text>
              {plan.tags.length > 0 && (
                <View style={[styles.cardTag, { backgroundColor: STAMP_PROOF }]}>
                  <Text style={styles.cardTagText}>{plan.tags[0]}</Text>
                </View>
              )}
            </View>
            <View style={styles.cardMeta}>
              <Text style={styles.cardMetaText}>💰 {plan.price}</Text>
              <Text style={styles.cardMetaText}>⏱ {plan.duration}</Text>
              <Text style={styles.cardMetaText}>{plan.transport}</Text>
            </View>

            {/* Stamp Overlay */}
            {stampType !== 'none' && (
              <Animated.View
                style={[
                  styles.stampWrap,
                  {
                    opacity: overlayOpacity,
                    transform: [{ scale: stampScale }, { rotate: '-18deg' }],
                  },
                ]}
              >
                <View style={[styles.stampContainer, { shadowColor: stampColor }]}>
                  <Svg width={STAMP_SVG_SIZE} height={STAMP_SVG_SIZE} viewBox={`0 0 ${STAMP_SVG_SIZE} ${STAMP_SVG_SIZE}`}>
                    <Defs>
                      <ClipPath id="hatchClip">
                        <Circle cx={STAMP_CTR} cy={STAMP_CTR} r={MAIN_R - STROKE_W / 2} />
                      </ClipPath>
                    </Defs>
                    {/* Serrated edge ticks */}
                    <G opacity={0.25}>
                      {Array.from({ length: TICK_COUNT }).map((_, i) => {
                        const angleRad = (i * 360 / TICK_COUNT) * Math.PI / 180;
                        return (
                          <Line
                            key={i}
                            x1={STAMP_CTR + Math.cos(angleRad) * TICK_INNER}
                            y1={STAMP_CTR + Math.sin(angleRad) * TICK_INNER}
                            x2={STAMP_CTR + Math.cos(angleRad) * TICK_OUTER}
                            y2={STAMP_CTR + Math.sin(angleRad) * TICK_OUTER}
                            stroke={stampColor}
                            strokeWidth={4}
                          />
                        );
                      })}
                    </G>
                    {/* Main circle ring */}
                    <Circle
                      cx={STAMP_CTR}
                      cy={STAMP_CTR}
                      r={MAIN_R}
                      fill={stampColor + '18'}
                      stroke={stampColor}
                      strokeWidth={STROKE_W}
                    />
                    {/* Diagonal hatching for declined */}
                    {stampType === 'declined' && (
                      <G clipPath="url(#hatchClip)" opacity={0.12}>
                        {Array.from({ length: 25 }).map((_, i) => {
                          const offset = (i - 12) * 7;
                          return (
                            <Line
                              key={`h${i}`}
                              x1={STAMP_CTR + offset - MAIN_R}
                              y1={STAMP_CTR - MAIN_R}
                              x2={STAMP_CTR + offset + MAIN_R}
                              y2={STAMP_CTR + MAIN_R}
                              stroke={stampColor}
                              strokeWidth={1}
                            />
                          );
                        })}
                      </G>
                    )}
                  </Svg>
                  {/* Text overlay */}
                  <View style={styles.stampTextOverlay}>
                    <Text style={[styles.stampWord, { color: stampColor }]}>proof</Text>
                    <Text
                      style={[
                        stampType === 'proof' ? styles.stampCheck : styles.stampX,
                        { color: stampColor },
                      ]}
                    >
                      {stampType === 'proof' ? '✓' : '✗'}
                    </Text>
                    <Text style={[styles.stampSub, { color: stampColor }]}>
                      {stampType === 'proof' ? 'VERIFIED' : 'DECLINED'}
                    </Text>
                  </View>
                </View>
              </Animated.View>
            )}
          </View>

          {/* Buttons */}
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.btnProof, { backgroundColor: STAMP_PROOF }]}
              onPress={() => playStamp('proof')}
              activeOpacity={0.8}
              disabled={stampType !== 'none'}
            >
              <Text style={styles.btnProofText}>Proof it ✓</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnDecline, { backgroundColor: C.gray300, borderColor: C.border }]}
              onPress={() => playStamp('declined')}
              activeOpacity={0.8}
              disabled={stampType !== 'none'}
            >
              <Text style={[styles.btnDeclineText, { color: STAMP_DECLINE }]}>Not for me ✗</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.hint, { color: C.gray500 }]}>{t.proof_survey_hint}</Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  title: {
    fontSize: 20,
    fontFamily: Fonts.serifBold,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: Fonts.serif,
    marginBottom: 20,
  },

  // Card
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 24,
  },
  cardImage: {
    width: '100%',
    height: 180,
    resizeMode: 'cover',
  },
  cardOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  cardTitleWrap: {
    position: 'absolute',
    bottom: 36,
    left: 16,
    right: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: Fonts.serifBold,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
    marginBottom: 6,
  },
  cardTag: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  cardTagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  cardMeta: {
    position: 'absolute',
    bottom: 10,
    left: 16,
    flexDirection: 'row',
    gap: 12,
  },
  cardMetaText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '600',
  },

  // Stamp
  stampWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampContainer: {
    width: STAMP_SVG_SIZE,
    height: STAMP_SVG_SIZE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  stampTextOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampWord: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 28,
  },
  stampCheck: {
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  stampX: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24,
    textDecorationLine: 'line-through',
  },
  stampSub: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 2,
  },

  // Buttons
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginBottom: 12,
  },
  btnProof: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  btnProofText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: Fonts.serifBold,
    letterSpacing: 0.3,
  },
  btnDecline: {
    flex: 0.7,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  btnDeclineText: {
    fontSize: 13,
    fontFamily: Fonts.serifSemiBold,
  },
  hint: {
    fontSize: 10,
    fontFamily: Fonts.serif,
    letterSpacing: 0.3,
  },
});
