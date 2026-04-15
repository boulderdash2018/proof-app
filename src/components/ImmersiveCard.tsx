import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Image,
  TouchableOpacity,
  ScrollView,
  Easing,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Fonts, getRankForProofs } from '../constants';
import { FloatingAvatars } from './FloatingAvatars';
import { RankBadge } from './RankBadge';
import { Plan } from '../types';

/* ================================================================
   ImmersiveCard — swipe-down to reveal plan detail
   ================================================================
   Architecture:
   - Image layer behind everything (parallax via scrollY)
   - Animated.ScrollView on top (transparent spacer + detail)
   - Card UI (title, author, gradient) inside the spacer
   - All animations native-driven via scrollY interpolations
   ================================================================ */

interface ImmersiveCardProps {
  plan: Plan;
  width: number;
  height: number;
  isActive: boolean;
  isLiked: boolean;
  isSaved: boolean;
  onLike: () => void;
  onSave: () => void;
  onAuthorPress: () => void;
  onProfilePress: (userId: string) => void;
  onDetailStateChange: (isOpen: boolean) => void;
  onPlanPress: () => void;
}

const CARD_H_PAD = 14;
const CARD_RADIUS = 22;
const CARD_V_TOP = 6;
const CARD_V_BOTTOM = 8;
const BELOW_CARD_H = 64;
const COMMIT_THRESHOLD = 120;
const VEL_THRESHOLD = 0.4;
const IMAGE_HEADER_RATIO = 0.35;

export const ImmersiveCard: React.FC<ImmersiveCardProps> = ({
  plan,
  width,
  height,
  isActive,
  isLiked,
  isSaved,
  onLike,
  onSave,
  onAuthorPress,
  onProfilePress,
  onDetailStateChange,
  onPlanPress,
}) => {
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const isCommitting = useRef(false);
  const isDetailRef = useRef(false);

  // Card dimensions
  const cardH = height - CARD_V_TOP - CARD_V_BOTTOM - BELOW_CARD_H;
  const DETAIL_SNAP = cardH * (1 - IMAGE_HEADER_RATIO);

  // Cover photo + rank
  const coverUrl =
    plan.coverPhotos?.[0] ||
    plan.places?.find((p) => p.photoUrls?.length)?.photoUrls?.[0];
  const rank = getRankForProofs(plan.author?.total_proof_validations || 0);

  // ── Chevron pulse ──────────────────────────────────────────
  const chevronBounce = useRef(new Animated.Value(0)).current;
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    if (hasScrolled || !isActive) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(chevronBounce, {
          toValue: 6,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(chevronBounce, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [hasScrolled, isActive]);

  // ── Scroll-driven interpolations (native thread) ───────────

  // Image parallax
  const imageTranslateY = scrollY.interpolate({
    inputRange: [-100, 0, DETAIL_SNAP],
    outputRange: [25, 0, -70],
    extrapolate: 'clamp',
  });
  const imageScale = scrollY.interpolate({
    inputRange: [-50, 0, DETAIL_SNAP],
    outputRange: [1.04, 1, 0.92],
    extrapolate: 'clamp',
  });
  const imageDimOpacity = scrollY.interpolate({
    inputRange: [0, DETAIL_SNAP],
    outputRange: [0, 0.45],
    extrapolate: 'clamp',
  });

  // Card gradient
  const gradientOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Title + author parallax (counteract 40% of scroll → moves at 0.6×)
  const titleCounterY = scrollY.interpolate({
    inputRange: [0, DETAIL_SNAP],
    outputRange: [0, DETAIL_SNAP * 0.35],
    extrapolate: 'clamp',
  });
  const titleOpacity = scrollY.interpolate({
    inputRange: [0, 160],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Actions (like/save) — stay in place then fade
  const actionsCounterY = scrollY.interpolate({
    inputRange: [0, 150],
    outputRange: [0, 150],
    extrapolate: 'clamp',
  });
  const actionsOpacity = scrollY.interpolate({
    inputRange: [0, 80],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Chevron
  const chevronOpacity = scrollY.interpolate({
    inputRange: [0, 60],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const chevronRotation = scrollY.interpolate({
    inputRange: [0, COMMIT_THRESHOLD],
    outputRange: ['0deg', '180deg'],
    extrapolate: 'clamp',
  });

  // Below-card (meta + tags)
  const belowCardOpacity = scrollY.interpolate({
    inputRange: [0, 60],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Detail content entrance (stagger via different ranges)
  const makeDetailAnim = (order: number) => {
    const start = DETAIL_SNAP * 0.5 + order * DETAIL_SNAP * 0.06;
    const end = start + DETAIL_SNAP * 0.2;
    return {
      opacity: scrollY.interpolate({
        inputRange: [start, end],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
      translateY: scrollY.interpolate({
        inputRange: [start, end],
        outputRange: [30, 0],
        extrapolate: 'clamp',
      }),
    };
  };

  // ── Scroll handlers ────────────────────────────────────────

  const handleScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isDetailRef.current || isCommitting.current) return;
      const y = e.nativeEvent.contentOffset.y;
      const vy = e.nativeEvent.velocity?.y ?? 0;

      if (y > COMMIT_THRESHOLD || vy > VEL_THRESHOLD) {
        commitToDetail();
      } else if (y > 0) {
        bounceBack();
      }
    },
    [cardH],
  );

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isDetailRef.current || isCommitting.current) return;
      const y = e.nativeEvent.contentOffset.y;
      if (y > COMMIT_THRESHOLD) {
        commitToDetail();
      } else if (y > 0) {
        bounceBack();
      }
    },
    [cardH],
  );

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      // Return to feed on overscroll at top while in detail
      if (isDetailRef.current && y < -75 && !isCommitting.current) {
        returnToFeed();
      }
    },
    [],
  );

  const commitToDetail = () => {
    if (isCommitting.current) return;
    isCommitting.current = true;
    setIsDetailOpen(true);
    isDetailRef.current = true;
    setHasScrolled(true);
    onDetailStateChange(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    (scrollRef.current as any)?.scrollTo({ y: DETAIL_SNAP, animated: true });
    setTimeout(() => {
      isCommitting.current = false;
    }, 500);
  };

  const bounceBack = () => {
    (scrollRef.current as any)?.scrollTo({ y: 0, animated: true });
  };

  const returnToFeed = () => {
    if (isCommitting.current) return;
    isCommitting.current = true;
    setIsDetailOpen(false);
    isDetailRef.current = false;
    onDetailStateChange(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    (scrollRef.current as any)?.scrollTo({ y: 0, animated: true });
    setTimeout(() => {
      isCommitting.current = false;
    }, 500);
  };

  // Reset when card becomes inactive
  useEffect(() => {
    if (!isActive && isDetailRef.current) {
      setIsDetailOpen(false);
      isDetailRef.current = false;
      onDetailStateChange(false);
      (scrollRef.current as any)?.scrollTo({ y: 0, animated: false });
    }
  }, [isActive]);

  // ══════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════
  const d1 = makeDetailAnim(0);
  const d2 = makeDetailAnim(1);
  const d3 = makeDetailAnim(2);
  const d4 = makeDetailAnim(3);

  return (
    <View style={[styles.frame, { width, height }]}>
      {/* ── Card container (rounded, clips everything) ── */}
      <View style={styles.card}>
        {/* ─── Image layer (behind scroll, parallax) ─── */}
        <Animated.View
          style={[
            styles.imageWrap,
            {
              transform: [{ translateY: imageTranslateY }, { scale: imageScale }],
            },
          ]}
        >
          {coverUrl ? (
            <Image
              source={{ uri: coverUrl }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
          ) : (
            <View
              style={[StyleSheet.absoluteFillObject, { backgroundColor: '#1C1917' }]}
            />
          )}
          {/* Dim overlay */}
          <Animated.View style={[styles.imageDim, { opacity: imageDimOpacity }]} />
        </Animated.View>

        {/* ─── Scrollable content ─── */}
        <Animated.ScrollView
          ref={scrollRef as any}
          style={StyleSheet.absoluteFillObject}
          contentContainerStyle={{ minHeight: cardH * 2.5 }}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          bounces
          scrollEnabled={isActive}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true, listener: handleScroll },
          )}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollEnd={handleMomentumEnd}
        >
          {/* ── Spacer (transparent — image shows through) ── */}
          <View style={{ height: cardH }}>
            {/* Bottom gradient */}
            <Animated.View
              style={[styles.gradientWrap, { opacity: gradientOpacity }]}
            >
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.94)']}
                locations={[0.3, 0.6, 1]}
                style={StyleSheet.absoluteFillObject}
              />
            </Animated.View>

            {/* Card info (title, author) — parallax */}
            <Animated.View
              style={[
                styles.cardInfo,
                {
                  transform: [{ translateY: titleCounterY }],
                  opacity: titleOpacity,
                },
              ]}
            >
              <FloatingAvatars
                plan={plan}
                onProfilePress={onProfilePress}
                containerStyle={styles.avatarsInline}
              />

              {plan.tags?.length > 0 && (
                <Text style={styles.categoryLabel}>
                  {plan.tags[0].toUpperCase()}
                </Text>
              )}

              <TouchableOpacity activeOpacity={0.85} onPress={onPlanPress}>
                <Text style={styles.planTitle} numberOfLines={2}>
                  {plan.title}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.authorRow}
                activeOpacity={0.7}
                onPress={onAuthorPress}
              >
                <View
                  style={[
                    styles.authorAvatar,
                    { backgroundColor: plan.author?.avatarBg || '#444' },
                  ]}
                >
                  {plan.author?.avatarUrl ? (
                    <Image
                      source={{ uri: plan.author.avatarUrl }}
                      style={styles.authorAvatarImg}
                    />
                  ) : (
                    <Text
                      style={[
                        styles.authorInitials,
                        { color: plan.author?.avatarColor || '#FFF' },
                      ]}
                    >
                      {plan.author?.initials || '?'}
                    </Text>
                  )}
                </View>
                <Text style={styles.authorName} numberOfLines={1}>
                  {plan.author?.displayName || 'Inconnu'}
                </Text>
                {rank && <RankBadge rank={rank} small />}
              </TouchableOpacity>
            </Animated.View>

            {/* Chevron hint */}
            <Animated.View
              style={[
                styles.chevronWrap,
                {
                  opacity: chevronOpacity,
                  transform: [
                    { translateY: chevronBounce },
                    { rotate: chevronRotation },
                  ],
                },
              ]}
            >
              <Ionicons
                name="chevron-down"
                size={18}
                color="rgba(255,255,255,0.55)"
              />
            </Animated.View>

            {/* Actions (like/save) — counteract scroll to stay in place */}
            <Animated.View
              style={[
                styles.cardActions,
                {
                  transform: [{ translateY: actionsCounterY }],
                  opacity: actionsOpacity,
                },
              ]}
              pointerEvents={isDetailOpen ? 'none' : 'auto'}
            >
              <TouchableOpacity
                onPress={onLike}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={isLiked ? 'heart' : 'heart-outline'}
                  size={24}
                  color={isLiked ? '#FF4D67' : '#FFF'}
                  style={styles.iconShadow}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onSave}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={isSaved ? 'bookmark' : 'bookmark-outline'}
                  size={22}
                  color={isSaved ? Colors.primary : '#FFF'}
                  style={styles.iconShadow}
                />
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* ══ DETAIL CONTENT (below fold) ══ */}
          <View style={styles.detail}>
            {/* Return indicator */}
            {isDetailOpen && (
              <View style={styles.returnHint}>
                <Ionicons
                  name="chevron-up"
                  size={16}
                  color="rgba(255,255,255,0.4)"
                />
                <Text style={styles.returnText}>Tirer pour revenir</Text>
              </View>
            )}

            {/* Detail header */}
            <Animated.View
              style={{
                opacity: d1.opacity,
                transform: [{ translateY: d1.translateY }],
              }}
            >
              <Text style={styles.detailTitle}>{plan.title}</Text>
              <View style={styles.detailMeta}>
                {plan.price ? (
                  <View style={styles.metaPill}>
                    <Ionicons
                      name="wallet-outline"
                      size={13}
                      color="rgba(255,255,255,0.6)"
                    />
                    <Text style={styles.metaPillText}>{plan.price}</Text>
                  </View>
                ) : null}
                {plan.duration ? (
                  <View style={styles.metaPill}>
                    <Ionicons
                      name="time-outline"
                      size={13}
                      color="rgba(255,255,255,0.6)"
                    />
                    <Text style={styles.metaPillText}>{plan.duration}</Text>
                  </View>
                ) : null}
                {plan.places?.length > 0 ? (
                  <View style={styles.metaPill}>
                    <Ionicons
                      name="location-outline"
                      size={13}
                      color="rgba(255,255,255,0.6)"
                    />
                    <Text style={styles.metaPillText}>
                      {plan.places.length} lieu
                      {plan.places.length > 1 ? 'x' : ''}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Animated.View>

            {/* Tags */}
            {plan.tags?.length > 0 && (
              <Animated.View
                style={[
                  styles.detailTags,
                  {
                    opacity: d2.opacity,
                    transform: [{ translateY: d2.translateY }],
                  },
                ]}
              >
                {plan.tags.map((tag, i) => (
                  <View key={i} style={styles.detailTagChip}>
                    <Text style={styles.detailTagText}>{tag}</Text>
                  </View>
                ))}
              </Animated.View>
            )}

            {/* Itinerary */}
            <Animated.View
              style={{
                opacity: d3.opacity,
                transform: [{ translateY: d3.translateY }],
              }}
            >
              <Text style={styles.sectionTitle}>Itinéraire</Text>
              {plan.places?.map((place, i) => (
                <View key={place.id || i} style={styles.placeCard}>
                  <View style={styles.placeIndex}>
                    <Text style={styles.placeIndexText}>{i + 1}</Text>
                  </View>
                  <View style={styles.placeBody}>
                    {place.photoUrls?.[0] && (
                      <Image
                        source={{ uri: place.photoUrls[0] }}
                        style={styles.placePhoto}
                        resizeMode="cover"
                      />
                    )}
                    <View style={styles.placeInfo}>
                      <Text style={styles.placeName}>{place.name}</Text>
                      <Text style={styles.placeType}>{place.type}</Text>
                      {place.address ? (
                        <Text style={styles.placeAddress} numberOfLines={1}>
                          {place.address}
                        </Text>
                      ) : null}
                      {place.comment ? (
                        <Text style={styles.placeComment} numberOfLines={2}>
                          « {place.comment} »
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              ))}
            </Animated.View>

            {/* Author section */}
            <Animated.View
              style={{
                opacity: d4.opacity,
                transform: [{ translateY: d4.translateY }],
              }}
            >
              <Text style={styles.sectionTitle}>Publié par</Text>
              <TouchableOpacity
                style={styles.authorCard}
                activeOpacity={0.7}
                onPress={onAuthorPress}
              >
                <View
                  style={[
                    styles.authorCardAvatar,
                    { backgroundColor: plan.author?.avatarBg || '#444' },
                  ]}
                >
                  {plan.author?.avatarUrl ? (
                    <Image
                      source={{ uri: plan.author.avatarUrl }}
                      style={styles.authorCardImg}
                    />
                  ) : (
                    <Text
                      style={[
                        styles.authorCardInitials,
                        { color: plan.author?.avatarColor || '#FFF' },
                      ]}
                    >
                      {plan.author?.initials || '?'}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.authorCardName}>
                    {plan.author?.displayName}
                  </Text>
                  {rank && (
                    <View style={{ marginTop: 4 }}>
                      <RankBadge rank={rank} small />
                    </View>
                  )}
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color="rgba(255,255,255,0.3)"
                />
              </TouchableOpacity>
            </Animated.View>

            {/* Bottom safe padding */}
            <View style={{ height: 120 }} />
          </View>
        </Animated.ScrollView>
      </View>

      {/* ── Below card (meta + tags, fades on scroll) ── */}
      <Animated.View style={[styles.belowCard, { opacity: belowCardOpacity }]}>
        <View style={styles.belowMeta}>
          {plan.price ? (
            <Text style={styles.belowMetaText}>{plan.price}</Text>
          ) : null}
          {plan.price && plan.duration ? (
            <Text style={styles.belowDot}>·</Text>
          ) : null}
          {plan.duration ? (
            <Text style={styles.belowMetaText}>{plan.duration}</Text>
          ) : null}
          {(plan.price || plan.duration) && plan.places?.length > 0 ? (
            <Text style={styles.belowDot}>·</Text>
          ) : null}
          {plan.places?.length > 0 ? (
            <Text style={styles.belowMetaText}>
              {plan.places.length} lieu{plan.places.length > 1 ? 'x' : ''}
            </Text>
          ) : null}
        </View>
        {plan.tags && plan.tags.length > 1 && (
          <View style={styles.belowTags}>
            {plan.tags.slice(0, 4).map((tag, i) => (
              <View key={i} style={styles.belowTagChip}>
                <Text style={styles.belowTagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </Animated.View>
    </View>
  );
};

// ════════════════════════════════════════════════════════════════
//  STYLES
// ════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  frame: {
    paddingHorizontal: CARD_H_PAD,
    paddingTop: CARD_V_TOP,
    paddingBottom: CARD_V_BOTTOM,
  },

  // ── Card ───────────────────────────────────────────────────
  card: {
    flex: 1,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: '#000',
  },

  // ── Image layer ────────────────────────────────────────────
  imageWrap: {
    position: 'absolute',
    top: -40,
    left: 0,
    right: 0,
    bottom: -100,
    zIndex: 0,
  },
  imageDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },

  // ── Card gradient ──────────────────────────────────────────
  gradientWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '55%',
    zIndex: 2,
  },

  // ── Card info ──────────────────────────────────────────────
  cardInfo: {
    position: 'absolute',
    bottom: 50,
    left: 18,
    right: 18,
    zIndex: 3,
  },
  avatarsInline: {
    position: 'relative',
    bottom: 0,
    left: 0,
    marginBottom: 8,
  },
  categoryLabel: {
    fontSize: 11,
    fontFamily: Fonts.serifSemiBold,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  planTitle: {
    fontSize: 22,
    fontFamily: Fonts.serifBold,
    color: '#FFF',
    lineHeight: 28,
    marginBottom: 6,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  } as any,
  authorAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  authorAvatarImg: { width: 20, height: 20, borderRadius: 10 },
  authorInitials: { fontSize: 8, fontWeight: '700' },
  authorName: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontFamily: Fonts.serifSemiBold,
  },

  // ── Chevron ────────────────────────────────────────────────
  chevronWrap: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    alignItems: 'center',
    zIndex: 3,
  },

  // ── Card actions (like/save) ───────────────────────────────
  cardActions: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    zIndex: 5,
  } as any,
  iconShadow: {
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },

  // ── Detail content ─────────────────────────────────────────
  detail: {
    backgroundColor: '#0D0D0D',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 24,
    minHeight: 400,
  },
  returnHint: {
    alignItems: 'center',
    marginBottom: 16,
  },
  returnText: {
    fontSize: 11,
    fontFamily: Fonts.serif,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
  },
  detailTitle: {
    fontSize: 24,
    fontFamily: Fonts.serifBold,
    color: '#FFF',
    lineHeight: 30,
    marginBottom: 12,
  },
  detailMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  } as any,
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  } as any,
  metaPillText: {
    fontSize: 12,
    fontFamily: Fonts.serifSemiBold,
    color: 'rgba(255,255,255,0.65)',
  },
  detailTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 24,
  } as any,
  detailTagChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  detailTagText: {
    fontSize: 12,
    fontFamily: Fonts.serifSemiBold,
    color: 'rgba(255,255,255,0.6)',
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: Fonts.serifBold,
    color: '#FFF',
    marginBottom: 14,
    marginTop: 8,
  },

  // ── Place card ─────────────────────────────────────────────
  placeCard: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  } as any,
  placeIndex: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  placeIndexText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
  },
  placeBody: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  placePhoto: {
    width: '100%',
    height: 140,
  },
  placeInfo: {
    padding: 14,
  },
  placeName: {
    fontSize: 15,
    fontFamily: Fonts.serifBold,
    color: '#FFF',
    marginBottom: 2,
  },
  placeType: {
    fontSize: 11,
    fontFamily: Fonts.serifSemiBold,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'capitalize',
    marginBottom: 4,
  },
  placeAddress: {
    fontSize: 12,
    fontFamily: Fonts.serif,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 4,
  },
  placeComment: {
    fontSize: 12,
    fontFamily: Fonts.serif,
    color: 'rgba(255,255,255,0.55)',
    fontStyle: 'italic',
    marginTop: 4,
  },

  // ── Author card ────────────────────────────────────────────
  authorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  } as any,
  authorCardAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  authorCardImg: { width: 44, height: 44, borderRadius: 22 },
  authorCardInitials: { fontSize: 16, fontWeight: '700' },
  authorCardName: {
    fontSize: 15,
    fontFamily: Fonts.serifBold,
    color: '#FFF',
  },

  // ── Below card ─────────────────────────────────────────────
  belowCard: {
    paddingHorizontal: 4,
    paddingTop: 10,
  },
  belowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  } as any,
  belowMetaText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontFamily: Fonts.serif,
  },
  belowDot: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
  },
  belowTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  } as any,
  belowTagChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  belowTagText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontFamily: Fonts.serifSemiBold,
  },
});
