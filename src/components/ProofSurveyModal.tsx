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
  ScrollView,
  TextInput as RNTextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Fonts } from '../constants';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { Plan } from '../types';
import { useAuthStore } from '../store';
import { submitPlaceReviews } from '../services/placeReviewService';
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

interface PlaceRating {
  placeId: string;
  googlePlaceId?: string;
  rating: number;
  comment: string;
}

interface Props {
  visible: boolean;
  plan: Plan;
  onProof: () => void;
  onDecline?: () => void;
  skipRating?: boolean;
}

export const ProofSurveyModal: React.FC<Props> = ({ visible, plan, onProof, skipRating }) => {
  const C = useColors();
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.user);
  const [stampType, setStampType] = useState<'none' | 'proof'>('none');
  const [step, setStep] = useState<'vote' | 'rate'>('vote');
  const [placeRatings, setPlaceRatings] = useState<PlaceRating[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const stampScale = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const initPlaceRatings = () => {
    setPlaceRatings(
      plan.places.map((p) => ({
        placeId: p.id,
        googlePlaceId: p.googlePlaceId,
        rating: 0,
        comment: '',
      }))
    );
  };

  const playStamp = () => {
    setStampType('proof');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

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
        if (skipRating) {
          setStampType('none');
          stampScale.setValue(0);
          overlayOpacity.setValue(0);
          finishAndClose();
        } else {
          // Transition to rating step instead of closing
          setStampType('none');
          stampScale.setValue(0);
          overlayOpacity.setValue(0);
          initPlaceRatings();
          setStep('rate');
        }
      }, 900);
    });
  };

  const setRating = (placeId: string, rating: number) => {
    setPlaceRatings((prev) =>
      prev.map((pr) => (pr.placeId === placeId ? { ...pr, rating } : pr))
    );
  };

  const setComment = (placeId: string, comment: string) => {
    setPlaceRatings((prev) =>
      prev.map((pr) => (pr.placeId === placeId ? { ...pr, comment } : pr))
    );
  };

  const handleSubmitReviews = async () => {
    const hasAnyRating = placeRatings.some((pr) => pr.rating > 0);
    if (hasAnyRating && currentUser) {
      setSubmitting(true);
      try {
        await submitPlaceReviews(
          placeRatings
            .filter((pr) => pr.rating > 0)
            .map((pr) => ({
              placeId: pr.placeId,
              googlePlaceId: pr.googlePlaceId,
              planId: plan.id,
              rating: pr.rating,
              text: pr.comment.trim() || undefined,
            })),
          currentUser
        );
      } catch (err) {
        console.error('[ProofSurvey] submit reviews error:', err);
      } finally {
        setSubmitting(false);
      }
    }
    finishAndClose();
  };

  const handleSkipReviews = () => {
    finishAndClose();
  };

  const finishAndClose = () => {
    setStep('vote');
    setPlaceRatings([]);
    onProof();
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
  const stampColor = STAMP_PROOF;

  const renderStars = (placeId: string, currentRating: number) => {
    return (
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity key={star} onPress={() => setRating(placeId, star)} activeOpacity={0.7}>
            <Ionicons
              name={star <= currentRating ? 'star' : 'star-outline'}
              size={22}
              color={star <= currentRating ? STAMP_PROOF : C.gray400}
            />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.backdrop}>
          {step === 'vote' ? (
            /* ========== STEP 1: Vote ========== */
            <View style={[styles.container, { backgroundColor: C.gray200 }]}>
              <Text style={[styles.title, { color: C.black }]}>{t.proof_survey_title}</Text>
              <Text style={[styles.subtitle, { color: C.gray600 }]}>{t.proof_survey_subtitle}</Text>

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
                  <Text style={styles.cardMetaText}>{plan.price}</Text>
                  <Text style={styles.cardMetaText}>{plan.duration}</Text>
                  <Text style={styles.cardMetaText}>{plan.transport}</Text>
                </View>

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
                        <Circle
                          cx={STAMP_CTR}
                          cy={STAMP_CTR}
                          r={MAIN_R}
                          fill={stampColor + '18'}
                          stroke={stampColor}
                          strokeWidth={STROKE_W}
                        />
                      </Svg>
                      <View style={styles.stampTextOverlay}>
                        <Text style={[styles.stampWord, { color: stampColor }]}>proof</Text>
                        <Text style={[styles.stampCheck, { color: stampColor }]}>✓</Text>
                        <Text style={[styles.stampSub, { color: stampColor }]}>VERIFIED</Text>
                      </View>
                    </View>
                  </Animated.View>
                )}
              </View>

              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={[styles.btnProof, { backgroundColor: STAMP_PROOF, flex: 1 }]}
                  onPress={playStamp}
                  activeOpacity={0.8}
                  disabled={stampType !== 'none'}
                >
                  <Text style={styles.btnProofText}>Proof it ✓</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.hint, { color: C.gray500 }]}>{t.proof_survey_hint}</Text>
            </View>
          ) : (
            /* ========== STEP 2: Rate Places ========== */
            <View style={[styles.container, styles.rateContainer, { backgroundColor: C.gray200 }]}>
              <Text style={[styles.title, { color: C.black }]}>{t.proof_rate_title}</Text>
              <Text style={[styles.subtitle, { color: C.gray600 }]}>{t.proof_rate_subtitle}</Text>

              <ScrollView
                style={styles.rateScroll}
                contentContainerStyle={styles.rateScrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {plan.places.map((place, index) => {
                  const pr = placeRatings.find((r) => r.placeId === place.id);
                  return (
                    <View key={place.id} style={[styles.ratePlaceCard, { backgroundColor: C.white, borderColor: C.border }]}>
                      <View style={styles.ratePlaceHeader}>
                        <View style={[styles.ratePlaceIndex, { backgroundColor: STAMP_PROOF + '18' }]}>
                          <Text style={[styles.ratePlaceIndexText, { color: STAMP_PROOF }]}>{index + 1}</Text>
                        </View>
                        <View style={styles.ratePlaceInfo}>
                          <Text style={[styles.ratePlaceName, { color: C.black }]} numberOfLines={1}>{place.name}</Text>
                          <Text style={[styles.ratePlaceType, { color: C.gray600 }]} numberOfLines={1}>{place.type}</Text>
                        </View>
                      </View>
                      {renderStars(place.id, pr?.rating ?? 0)}
                      {(pr?.rating ?? 0) > 0 && (
                        <RNTextInput
                          style={[styles.rateComment, { color: C.black, backgroundColor: C.gray200, borderColor: C.border }]}
                          placeholder={t.proof_rate_comment_placeholder}
                          placeholderTextColor={C.gray500}
                          value={pr?.comment ?? ''}
                          onChangeText={(text) => setComment(place.id, text)}
                          multiline
                          maxLength={300}
                        />
                      )}
                    </View>
                  );
                })}
              </ScrollView>

              <View style={styles.rateBtnRow}>
                <TouchableOpacity
                  style={[styles.btnProof, { backgroundColor: STAMP_PROOF, opacity: submitting ? 0.6 : 1 }]}
                  onPress={handleSubmitReviews}
                  activeOpacity={0.8}
                  disabled={submitting}
                >
                  <Text style={styles.btnProofText}>{t.proof_rate_submit}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnSkip]}
                  onPress={handleSkipReviews}
                  activeOpacity={0.7}
                  disabled={submitting}
                >
                  <Text style={[styles.btnSkipText, { color: C.gray600 }]}>{t.proof_rate_skip}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
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
  rateContainer: {
    maxHeight: '85%',
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

  // Card (step 1)
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
  stampSub: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 2,
  },

  // Buttons (step 1)
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
  hint: {
    fontSize: 10,
    fontFamily: Fonts.serif,
    letterSpacing: 0.3,
  },

  // Step 2: Rate places
  rateScroll: {
    width: '100%',
    flexGrow: 0,
  },
  rateScrollContent: {
    gap: 10,
    paddingBottom: 4,
  },
  ratePlaceCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  ratePlaceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  ratePlaceIndex: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  ratePlaceIndexText: {
    fontSize: 12,
    fontWeight: '700',
  },
  ratePlaceInfo: {
    flex: 1,
  },
  ratePlaceName: {
    fontSize: 13,
    fontFamily: Fonts.serifBold,
  },
  ratePlaceType: {
    fontSize: 11,
    fontFamily: Fonts.serif,
    marginTop: 1,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  rateComment: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: Fonts.serif,
    maxHeight: 80,
    minHeight: 36,
  },
  rateBtnRow: {
    width: '100%',
    marginTop: 16,
    gap: 8,
    alignItems: 'center',
  },
  btnSkip: {
    paddingVertical: 8,
  },
  btnSkipText: {
    fontSize: 13,
    fontFamily: Fonts.serifSemiBold,
  },
});
