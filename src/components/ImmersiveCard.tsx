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
import { Plan, TravelSegment, TransportMode } from '../types';

/* ================================================================
   ImmersiveCard — pull-down to reveal plan detail
   ================================================================
   Uses Animated.ScrollView for native-level gesture cooperation
   with the horizontal FlatList.  All visual effects are driven
   by scrollY interpolations with non-linear (rubber-band) curves
   so that early drag is responsive and later drag plateaus.

   Feed mode  → vertical scroll in spacer, micro-animations
   Detail mode → scroll past snap point to browse itinerary
   Return      → overscroll at top snaps back to feed
   ================================================================ */

interface ImmersiveCardProps {
  plan: Plan;
  width: number;
  height: number;
  isActive: boolean;
  isLiked: boolean;
  isSaved: boolean;
  likesCount: number;
  commentsCount: number;
  onLike: () => void;
  onSave: () => void;
  onAuthorPress: () => void;
  onProfilePress: (userId: string) => void;
  onDetailStateChange: (isOpen: boolean) => void;
  onPlacePress: (placeId: string) => void;
  onComment: () => void;
  onShare: () => void;
  onDoItNow: () => void;
  onMapPress: () => void;
}

// ── Transport helpers (same as PlanDetailModal) ─────────────
const TRANSPORT_ICONS: Record<TransportMode, string> = {
  'Métro': 'train-outline', 'Vélo': 'bicycle-outline', 'À pied': 'walk-outline',
  'Voiture': 'car-outline', 'Trottinette': 'flash-outline',
};
const fmtMin = (m: number): string => {
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}h${r.toString().padStart(2, '0')}` : `${h}h`;
};

// ── Layout ───────────────────────────────────────────────────
const CARD_H_PAD = 14;
const CARD_RADIUS = 22;
const CARD_V_TOP = 6;
const CARD_V_BOTTOM = 8;
const BELOW_CARD_H = 64;
const ACTION_BAR_H = 64;
const IMAGE_HEADER_RATIO = 0.35;

// ── Gesture thresholds ───────────────────────────────────────
const VEL_THRESHOLD = 0.4;

export const ImmersiveCard: React.FC<ImmersiveCardProps> = ({
  plan,
  width,
  height,
  isActive,
  isLiked,
  isSaved,
  likesCount,
  commentsCount,
  onLike,
  onSave,
  onAuthorPress,
  onProfilePress,
  onDetailStateChange,
  onPlacePress,
  onComment,
  onShare,
  onDoItNow,
  onMapPress,
}) => {
  // ── Dimensions ─────────────────────────────────────────────
  const cardH = Math.max(1, height - CARD_V_TOP - CARD_V_BOTTOM - BELOW_CARD_H);
  const DETAIL_SNAP = cardH * (1 - IMAGE_HEADER_RATIO);
  const COMMIT_THRESHOLD = cardH * 0.25;

  // ── State & refs ───────────────────────────────────────────
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const isDetailRef = useRef(false);
  const isCommitting = useRef(false);
  const [hasScrolled, setHasScrolled] = useState(false);

  // ── Cover photo & rank ─────────────────────────────────────
  const coverUrl =
    plan.coverPhotos?.[0] ||
    plan.places?.find((p) => p.photoUrls?.length)?.photoUrls?.[0];
  const rank = getRankForProofs(plan.author?.total_proof_validations || 0);

  // ── Chevron pulse (2.5 s loop) ─────────────────────────────
  const chevronBounce = useRef(new Animated.Value(0)).current;

  // ── Sticky action bar animations (JS-driven opacity, native micro-interactions) ──
  const barOpacity = useRef(new Animated.Value(0)).current;
  const likeScale = useRef(new Animated.Value(1)).current;
  const saveScale = useRef(new Animated.Value(1)).current;
  const commentScale = useRef(new Animated.Value(1)).current;
  const shareTransX = useRef(new Animated.Value(0)).current;
  const shareRot = useRef(new Animated.Value(0)).current;

  const animPop = useCallback((scale: Animated.Value, peak = 1.3) => {
    Animated.sequence([
      Animated.timing(scale, { toValue: peak, duration: 150, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 150, easing: Easing.bezier(0.34, 1.56, 0.64, 1), useNativeDriver: true }),
    ]).start();
  }, []);

  const shareRotStr = shareRot.interpolate({
    inputRange: [0, 15], outputRange: ['0deg', '15deg'],
  });

  useEffect(() => {
    if (hasScrolled || !isActive) {
      chevronBounce.setValue(0);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(chevronBounce, {
          toValue: 8,
          duration: 1250,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(chevronBounce, {
          toValue: 0,
          duration: 1250,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [hasScrolled, isActive]);

  // ══════════════════════════════════════════════════════════════
  //  SCROLL-DRIVEN INTERPOLATIONS (native thread)
  //  Non-linear curves → rubber-band visual feel
  // ══════════════════════════════════════════════════════════════

  // Image parallax — starts responsive, then plateaus
  const imageTranslateY = scrollY.interpolate({
    inputRange: [-100, 0, DETAIL_SNAP * 0.3, DETAIL_SNAP],
    outputRange: [25, 0, -25, -70],
    extrapolate: 'clamp',
  });
  const imageScale = scrollY.interpolate({
    inputRange: [-50, 0, DETAIL_SNAP * 0.3, DETAIL_SNAP],
    outputRange: [1.04, 1, 0.94, 0.82],
    extrapolate: 'clamp',
  });

  // Dark overlay — quick initial darkening, then slower
  const imageDimOpacity = scrollY.interpolate({
    inputRange: [0, DETAIL_SNAP * 0.25, DETAIL_SNAP],
    outputRange: [0, 0.28, 0.55],
    extrapolate: 'clamp',
  });

  // Bottom gradient
  const gradientOpacity = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Title + author — parallax at 0.65× speed + scale down
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
  const titleScale = scrollY.interpolate({
    inputRange: [0, DETAIL_SNAP * 0.4],
    outputRange: [1, 0.9],
    extrapolate: 'clamp',
  });

  // Actions (like / save)
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

  // Below-card meta
  const belowCardOpacity = scrollY.interpolate({
    inputRange: [0, 60],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Detail element stagger (scroll-driven, all native thread)
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

  // ══════════════════════════════════════════════════════════════
  //  SCROLL HANDLERS — commit / bounce / return
  // ══════════════════════════════════════════════════════════════

  const commitToDetail = useCallback(() => {
    if (isCommitting.current) return;
    isCommitting.current = true;
    setIsDetailOpen(true);
    isDetailRef.current = true;
    setHasScrolled(true);
    onDetailStateChange(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Sticky action bar: fade in with slight delay (after panel settles)
    Animated.timing(barOpacity, {
      toValue: 1, duration: 350, delay: 200,
      useNativeDriver: false,
    }).start();

    (scrollRef.current as any)?.scrollTo({ y: DETAIL_SNAP, animated: true });
    setTimeout(() => {
      isCommitting.current = false;
    }, 500);
  }, [DETAIL_SNAP, onDetailStateChange]);

  const bounceBack = useCallback(() => {
    (scrollRef.current as any)?.scrollTo({ y: 0, animated: true });
  }, []);

  const returnToFeed = useCallback(() => {
    if (isCommitting.current) return;
    isCommitting.current = true;
    setIsDetailOpen(false);
    isDetailRef.current = false;
    onDetailStateChange(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Sticky action bar: fade out quickly (before panel returns)
    Animated.timing(barOpacity, {
      toValue: 0, duration: 200,
      useNativeDriver: false,
    }).start();

    (scrollRef.current as any)?.scrollTo({ y: 0, animated: true });
    setTimeout(() => {
      isCommitting.current = false;
    }, 500);
  }, [onDetailStateChange]);

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
    [COMMIT_THRESHOLD, commitToDetail, bounceBack],
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
    [COMMIT_THRESHOLD, commitToDetail, bounceBack],
  );

  // Continuous scroll listener — detect overscroll for return
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      if (isDetailRef.current && y < -75 && !isCommitting.current) {
        returnToFeed();
      }
    },
    [returnToFeed],
  );

  // Reset when card becomes inactive
  useEffect(() => {
    if (!isActive && isDetailRef.current) {
      setIsDetailOpen(false);
      isDetailRef.current = false;
      onDetailStateChange(false);
      barOpacity.setValue(0);
      (scrollRef.current as any)?.scrollTo({ y: 0, animated: false });
    }
  }, [isActive]);

  // ══════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════
  const d0 = makeDetailAnim(0);
  const d1 = makeDetailAnim(1);
  const d2 = makeDetailAnim(2);
  const d3 = makeDetailAnim(3);
  const d4 = makeDetailAnim(4);
  const d5 = makeDetailAnim(5);

  return (
    <View style={[styles.frame, { width, height: height + ACTION_BAR_H }]}>
      {/* ── Card container ── */}
      <View style={[styles.card, { height: cardH }]}>
        {/* ─── Image layer (parallax + scale + dim) ─── */}
        <Animated.View
          style={[
            styles.imageWrap,
            {
              transform: [
                { translateY: imageTranslateY },
                { scale: imageScale },
              ],
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
          decelerationRate="fast"
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

            {/* Card info (title, author) — parallax + scale */}
            <Animated.View
              style={[
                styles.cardInfo,
                {
                  transform: [
                    { translateY: titleCounterY },
                    { scale: titleScale },
                  ],
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

              {/* Title — NOT tappable (swipe is the only entry) */}
              <Text style={styles.planTitle} numberOfLines={2}>
                {plan.title}
              </Text>

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

            {/* Actions (like / save) — counteract scroll */}
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

            {/* Chevron hint + text */}
            <Animated.View
              style={[styles.chevronWrap, { opacity: chevronOpacity }]}
            >
              <Animated.View style={{ transform: [{ translateY: chevronBounce }] }}>
                <Ionicons
                  name="chevron-down"
                  size={18}
                  color="rgba(255,255,255,0.55)"
                />
              </Animated.View>
              <Text style={styles.chevronText}>Glisse pour voir le plan</Text>
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
                  color={Colors.textTertiary}
                />
                <Text style={styles.returnText}>Tirer pour revenir</Text>
              </View>
            )}

            {/* 0 — Title & meta */}
            <Animated.View
              style={{
                opacity: d0.opacity,
                transform: [{ translateY: d0.translateY }],
              }}
            >
              <View style={styles.detailTitleRow}>
                <Text style={styles.detailTitle}>{plan.title}</Text>
                {plan.timeAgo ? (
                  <Text style={styles.detailTimeAgo}>{plan.timeAgo}</Text>
                ) : null}
              </View>
              <View style={styles.detailMeta}>
                {plan.price ? (
                  <View style={styles.metaPill}>
                    <Ionicons
                      name="wallet-outline"
                      size={13}
                      color={Colors.textSecondary}
                    />
                    <Text style={styles.metaPillText}>{plan.price}</Text>
                  </View>
                ) : null}
                {plan.duration ? (
                  <View style={styles.metaPill}>
                    <Ionicons
                      name="time-outline"
                      size={13}
                      color={Colors.textSecondary}
                    />
                    <Text style={styles.metaPillText}>{plan.duration}</Text>
                  </View>
                ) : null}
                {plan.places?.length > 0 ? (
                  <View style={styles.metaPill}>
                    <Ionicons
                      name="location-outline"
                      size={13}
                      color={Colors.textSecondary}
                    />
                    <Text style={styles.metaPillText}>
                      {plan.places.length} lieu
                      {plan.places.length > 1 ? 'x' : ''}
                    </Text>
                  </View>
                ) : null}
                {plan.transport ? (
                  <View style={styles.metaPill}>
                    <Ionicons
                      name={(TRANSPORT_ICONS[plan.transport] || 'walk-outline') as any}
                      size={13}
                      color={Colors.textSecondary}
                    />
                    <Text style={styles.metaPillText}>{plan.transport}</Text>
                  </View>
                ) : null}
                {plan.places?.some((p: any) => p.latitude && p.longitude) && (
                  <TouchableOpacity style={styles.mapPill} onPress={onMapPress} activeOpacity={0.7}>
                    <Ionicons name="map-outline" size={13} color={Colors.primary} />
                    <Text style={styles.mapPillText}>Map</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Animated.View>

            {/* 1 — Tags */}
            {plan.tags?.length > 0 && (
              <Animated.View
                style={[
                  styles.detailTags,
                  {
                    opacity: d1.opacity,
                    transform: [{ translateY: d1.translateY }],
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

            {/* 3 — Creator's tip */}
            {(() => {
              const creatorTip = plan.places?.find((p) => p.comment)?.comment;
              if (!creatorTip) return null;
              return (
                <Animated.View
                  style={{
                    opacity: d2.opacity,
                    transform: [{ translateY: d2.translateY }],
                  }}
                >
                  <View style={styles.tipWrap}>
                    <View style={styles.tipBar} />
                    <View style={styles.tipBody}>
                      <Text style={styles.tipLabel}>Conseil du créateur</Text>
                      <Text style={styles.tipText}>"{creatorTip}"</Text>
                    </View>
                  </View>
                </Animated.View>
              );
            })()}

            {/* 4 — "Do it now" CTA — launches plan directly */}
            <Animated.View
              style={{
                opacity: d2.opacity,
                transform: [{ translateY: d2.translateY }],
              }}
            >
              <TouchableOpacity
                style={styles.doItNowBtn}
                activeOpacity={0.8}
                onPress={onDoItNow}
              >
                <Ionicons name="navigate" size={18} color={Colors.textOnAccent} />
                <Text style={styles.doItNowText}>Do it now</Text>
              </TouchableOpacity>
            </Animated.View>

            {/* 5 — Itinerary (enriched: travel segments, ratings, pills, Q&A) */}
            <Animated.View
              style={{
                opacity: d4.opacity,
                transform: [{ translateY: d4.translateY }],
              }}
            >
              <Text style={styles.sectionTitle}>Itinéraire</Text>
              {plan.places?.map((place, i) => {
                const isLast = i === (plan.places?.length ?? 0) - 1;
                const placePhoto = place.customPhoto || place.photoUrls?.[0];

                // Find travel segment to next place
                const travelToNext: TravelSegment | undefined =
                  plan.travelSegments?.find(
                    (ts) => ts.fromPlaceId === place.id || ts.fromPlaceId === place.googlePlaceId,
                  ) || (plan.travelSegments && plan.travelSegments[i]);

                return (
                  <View key={place.id || i}>
                    {/* Place card */}
                    <View style={styles.placeRow}>
                      {/* Timeline column */}
                      <View style={styles.tlCol}>
                        <View style={[styles.tlLineTop, i === 0 && { backgroundColor: 'transparent' }]} />
                        <View style={styles.tlCircle}>
                          <Text style={styles.tlNum}>{i + 1}</Text>
                        </View>
                        <View style={[styles.tlLineBot, isLast && !travelToNext && { backgroundColor: 'transparent' }]} />
                      </View>

                      {/* Card body — tappable */}
                      <TouchableOpacity
                        style={styles.placeBody}
                        activeOpacity={0.7}
                        onPress={() => onPlacePress(place.id)}
                      >
                        {placePhoto && (
                          <Image
                            source={{ uri: placePhoto }}
                            style={styles.placePhoto}
                            resizeMode="cover"
                          />
                        )}
                        <View style={styles.placeInfo}>
                          {/* Name + reservation + chevron */}
                          <View style={styles.placeHead}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.placeName}>
                                {place.name}
                                {place.reservationRecommended ? (
                                  <Text style={styles.reservationAsterisk}>{' ﹡'}</Text>
                                ) : null}
                              </Text>
                              <Text style={styles.placeType}>{place.type}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={15} color={Colors.textTertiary} />
                          </View>

                          {/* Rating */}
                          {place.rating > 0 && (
                            <View style={styles.ratingRow}>
                              <Ionicons name="star" size={11} color="#F5A623" style={{ marginRight: 3 }} />
                              <Text style={styles.ratingNum}>{place.rating}</Text>
                              {place.reviewCount > 0 && (
                                <Text style={styles.ratingCnt}>({place.reviewCount} avis)</Text>
                              )}
                            </View>
                          )}

                          {/* Price / Duration pills */}
                          {(place.placePrice != null || place.placeDuration != null) && (
                            <View style={styles.placeMetaRow}>
                              {place.placePrice != null && place.placePrice > 0 && (
                                <View style={styles.placeMetaPill}>
                                  <Text style={styles.placeMetaText}>{place.placePrice}€</Text>
                                </View>
                              )}
                              {place.placeDuration != null && place.placeDuration > 0 && (
                                <View style={styles.placeMetaPill}>
                                  <Text style={styles.placeMetaText}>{fmtMin(place.placeDuration)}</Text>
                                </View>
                              )}
                            </View>
                          )}

                          {/* Address */}
                          {place.address ? (
                            <View style={styles.inlineAddr}>
                              <Ionicons name="location-outline" size={12} color={Colors.textTertiary} />
                              <Text style={styles.placeAddress} numberOfLines={1}>
                                {place.address.split(',')[0]}
                              </Text>
                            </View>
                          ) : null}

                          {/* Creator's comment */}
                          {place.comment ? (
                            <View style={styles.inlineQuote}>
                              <Text style={styles.placeComment} numberOfLines={2}>
                                "{place.comment}"
                              </Text>
                            </View>
                          ) : null}

                          {/* Q&A answers */}
                          {(place.questions && place.questions.length > 0
                            ? place.questions
                            : place.questionAnswer && place.question
                              ? [{ question: place.question, answer: place.questionAnswer }]
                              : []
                          ).map((qa, qIdx) => (
                            <View key={qIdx} style={styles.inlineQa}>
                              <Text style={styles.inlineQaLabel}>{qa.question}</Text>
                              <Text style={styles.inlineQaAnswer} numberOfLines={2}>{qa.answer}</Text>
                            </View>
                          ))}
                        </View>
                      </TouchableOpacity>
                    </View>

                    {/* Travel segment to next place */}
                    {!isLast && (
                      <View style={styles.travelRow}>
                        <View style={styles.tlCol}>
                          <View style={styles.tlLineFull} />
                        </View>
                        <View style={styles.travelBubble}>
                          {travelToNext ? (
                            <>
                              <Ionicons
                                name={(TRANSPORT_ICONS[travelToNext.transport] || 'walk-outline') as any}
                                size={13}
                                color={Colors.primary}
                              />
                              <Text style={styles.travelText}>{travelToNext.transport}</Text>
                              <View style={styles.travelDot} />
                              <Text style={styles.travelText}>{fmtMin(travelToNext.duration)}</Text>
                            </>
                          ) : (
                            <>
                              <Ionicons
                                name={(TRANSPORT_ICONS[plan.transport] || 'walk-outline') as any}
                                size={13}
                                color={Colors.textTertiary}
                              />
                              <Text style={[styles.travelText, { color: Colors.textTertiary }]}>{plan.transport || 'À pied'}</Text>
                            </>
                          )}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}

              {/* Reservation legend */}
              {plan.places?.some((p) => p.reservationRecommended) && (
                <Text style={styles.reservationLegend}>﹡ Réservation recommandée</Text>
              )}
            </Animated.View>

            {/* 6 — Author */}
            <Animated.View
              style={{
                opacity: d5.opacity,
                transform: [{ translateY: d5.translateY }],
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
                  color={Colors.textTertiary}
                />
              </TouchableOpacity>
            </Animated.View>

            <View style={{ height: 120 }} />
          </View>
        </Animated.ScrollView>
      </View>

      {/* ── Below card (meta + tags — fades on scroll) ── */}
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

      {/* ── Sticky action bar (absolute in frame, outside card's overflow) ── */}
      <Animated.View
        style={[styles.actionBar, { opacity: barOpacity }]}
        pointerEvents={isDetailOpen ? 'auto' : 'none'}
      >
        {/* Like */}
        <TouchableOpacity
          style={styles.abBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            animPop(likeScale, 1.3);
            onLike();
          }}
        >
          <Animated.View style={{ transform: [{ scale: likeScale }] }}>
            <Ionicons
              name={isLiked ? 'heart' : 'heart-outline'}
              size={24}
              color={isLiked ? Colors.primary : Colors.textSecondary}
            />
          </Animated.View>
          {likesCount > 0 && (
            <Text style={[styles.abCount, isLiked && styles.abCountActive]}>
              {likesCount >= 1000 ? `${(likesCount / 1000).toFixed(1).replace('.0', '')}k` : likesCount}
            </Text>
          )}
        </TouchableOpacity>

        {/* Comment */}
        <TouchableOpacity
          style={styles.abBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            animPop(commentScale, 0.9);
            onComment();
          }}
        >
          <Animated.View style={{ transform: [{ scale: commentScale }] }}>
            <Ionicons name="chatbubble-outline" size={22} color={Colors.textSecondary} />
          </Animated.View>
          {commentsCount > 0 && (
            <Text style={styles.abCount}>
              {commentsCount >= 1000 ? `${(commentsCount / 1000).toFixed(1).replace('.0', '')}k` : commentsCount}
            </Text>
          )}
        </TouchableOpacity>

        {/* Save */}
        <TouchableOpacity
          style={styles.abBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            animPop(saveScale, 1.25);
            onSave();
          }}
        >
          <Animated.View style={{ transform: [{ scale: saveScale }] }}>
            <Ionicons
              name={isSaved ? 'bookmark' : 'bookmark-outline'}
              size={22}
              color={isSaved ? Colors.primary : Colors.textSecondary}
            />
          </Animated.View>
        </TouchableOpacity>

        {/* Share — "send" micro-animation: nudge right + rotate, then back */}
        <TouchableOpacity
          style={styles.abBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            Animated.sequence([
              Animated.parallel([
                Animated.timing(shareTransX, { toValue: 4, duration: 200, useNativeDriver: true }),
                Animated.timing(shareRot, { toValue: 15, duration: 200, useNativeDriver: true }),
              ]),
              Animated.parallel([
                Animated.timing(shareTransX, { toValue: 0, duration: 200, useNativeDriver: true }),
                Animated.timing(shareRot, { toValue: 0, duration: 200, useNativeDriver: true }),
              ]),
            ]).start();
            onShare();
          }}
        >
          <Animated.View style={{ transform: [{ translateX: shareTransX }, { rotate: shareRotStr }] }}>
            <Ionicons name="paper-plane-outline" size={22} color={Colors.textSecondary} />
          </Animated.View>
        </TouchableOpacity>
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
    // height is set inline (cardH) — do NOT use flex:1 here, otherwise it'd
    // expand to fill the enlarged frame and push the action bar off-screen
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

  // ── Gradient ───────────────────────────────────────────────
  gradientWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '55%',
    zIndex: 2,
  },

  // ── Card info (bottom) ─────────────────────────────────────
  cardInfo: {
    position: 'absolute',
    bottom: 56,
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
    fontFamily: Fonts.bodySemiBold,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  planTitle: {
    fontSize: 22,
    fontFamily: Fonts.displayBold,
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
    fontFamily: Fonts.bodySemiBold,
  },

  // ── Card actions (like / save) ─────────────────────────────
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

  // ── Chevron hint ───────────────────────────────────────────
  chevronWrap: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    alignItems: 'center',
    zIndex: 3,
  },
  chevronText: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },

  // ── Detail content ─────────────────────────────────────────
  detail: {
    backgroundColor: Colors.bgSecondary,
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
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  detailTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  } as any,
  detailTitle: {
    flex: 1,
    fontSize: 24,
    fontFamily: Fonts.displayBold,
    color: Colors.textPrimary,
    lineHeight: 30,
    marginBottom: 12,
  },
  detailTimeAgo: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    marginTop: 6,
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
    backgroundColor: Colors.bgTertiary,
  } as any,
  metaPillText: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
  },
  mapPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.primary + '20',
  } as any,
  mapPillText: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },
  detailTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 20,
  } as any,
  detailTagChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: Colors.terracotta100,
    borderWidth: 1,
    borderColor: Colors.terracotta200,
  },
  detailTagText: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.terracotta700,
  },

  // ── Do-it-now CTA ──────────────────────────────────────────
  doItNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 24,
  } as any,
  doItNowText: {
    fontSize: 16,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
  },

  // ── Section titles ─────────────────────────────────────────
  sectionTitle: {
    fontSize: 17,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    marginBottom: 14,
    marginTop: 8,
  },

  // ── Creator's tip ───────────────────────────────────────────
  tipWrap: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  tipBar: {
    width: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.primary,
    marginRight: 12,
  },
  tipBody: { flex: 1 },
  tipLabel: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Colors.textTertiary,
    marginBottom: 4,
  },
  tipText: {
    fontSize: 13,
    fontFamily: Fonts.displayItalic,
    color: Colors.textSecondary,
    lineHeight: 19,
  },

  // ── Timeline ──────────────────────────────────────────────
  tlCol: {
    width: 36,
    alignItems: 'center',
  },
  tlLineTop: {
    width: 2,
    height: 14,
    backgroundColor: Colors.borderMedium,
  },
  tlLineBot: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.borderMedium,
  },
  tlLineFull: {
    width: 2,
    flex: 1,
    minHeight: 18,
    backgroundColor: Colors.borderMedium,
  },
  tlCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tlNum: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textOnAccent,
  },

  // ── Place card (timeline layout) ──────────────────────────
  placeRow: {
    flexDirection: 'row',
  },
  placeBody: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
    borderRadius: 14,
    overflow: 'hidden',
    marginLeft: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  placePhoto: {
    width: '100%',
    height: 130,
  },
  placeInfo: {
    padding: 12,
  },
  placeHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  placeName: {
    fontSize: 14,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  reservationAsterisk: {
    fontSize: 10,
    color: '#C8571A',
  },
  placeType: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    textTransform: 'capitalize',
    marginBottom: 4,
  },

  // Rating
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  ratingNum: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    marginRight: 4,
  },
  ratingCnt: {
    fontSize: 10,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
  },

  // Price / Duration pills
  placeMetaRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    marginBottom: 4,
  } as any,
  placeMetaPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: Colors.bgTertiary,
  },
  placeMetaText: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
  },

  // Inline address
  inlineAddr: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  } as any,
  placeAddress: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    flex: 1,
  },

  // Inline quote (creator's comment on place)
  inlineQuote: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    paddingLeft: 8,
    marginTop: 6,
  },
  placeComment: {
    fontSize: 11,
    fontFamily: Fonts.displayItalic,
    color: Colors.textSecondary,
    lineHeight: 16,
  },

  // Inline Q&A
  inlineQa: {
    marginTop: 6,
    borderRadius: 8,
    padding: 8,
    backgroundColor: 'rgba(44,36,32,0.04)',
  },
  inlineQaLabel: {
    fontSize: 9,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    marginBottom: 2,
  },
  inlineQaAnswer: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
    lineHeight: 16,
  },

  // Reservation legend
  reservationLegend: {
    fontSize: 10,
    fontFamily: Fonts.displayItalic,
    color: Colors.textTertiary,
    marginTop: 6,
    marginBottom: 4,
  },

  // ── Travel segment ────────────────────────────────────────
  travelRow: {
    flexDirection: 'row',
    paddingVertical: 2,
  },
  travelBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: Colors.bgPrimary,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  } as any,
  travelText: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
  },
  travelDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.textTertiary,
  },

  // ── Author card ────────────────────────────────────────────
  authorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.bgTertiary,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
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
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
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
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: Fonts.body,
  },
  belowDot: {
    color: Colors.textTertiary,
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
    backgroundColor: Colors.bgTertiary,
    borderWidth: 1,
    borderColor: Colors.borderMedium,
  },
  belowTagText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
  },

  // ── Sticky action bar (inside enlarged frame, outside card overflow) ──
  // Positioned at bottom:ACTION_BAR_H so the bar occupies [height-64, height]
  // of the frame — entirely within the visible listH area, above the tab bar.
  actionBar: {
    position: 'absolute',
    bottom: ACTION_BAR_H,
    left: CARD_H_PAD,
    right: CARD_H_PAD,
    height: ACTION_BAR_H,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    backgroundColor: Colors.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    borderBottomLeftRadius: CARD_RADIUS,
    borderBottomRightRadius: CARD_RADIUS,
    zIndex: 50,
    shadowColor: '#2C2420',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 12,
  },
  abBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 44,
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 8,
  } as any,
  abCount: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
  },
  abCountActive: {
    color: Colors.primary,
  },
});
