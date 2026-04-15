import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Image,
  TouchableOpacity,
  ScrollView,
  Easing,
  PanResponder,
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
   ImmersiveCard — pull-down to reveal plan detail
   ================================================================
   Two-mode card with rubber-band drag physics:

   Feed mode:
   - PanResponder captures vertical downward drags
   - Rubber-band resistance: visual offset lags behind finger
   - Micro-animations: image scale, overlay, title parallax
   - Commit / bounce with spring physics

   Detail mode:
   - Choreographed panel entrance (550 ms, staggered elements)
   - ScrollView for detail content + "Do it now" CTA
   - Overscroll-to-return gesture (400 ms snappy exit)
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

// ── Layout ───────────────────────────────────────────────────
const CARD_H_PAD = 14;
const CARD_RADIUS = 22;
const CARD_V_TOP = 6;
const CARD_V_BOTTOM = 8;
const BELOW_CARD_H = 64;

// ── Gesture thresholds ───────────────────────────────────────
const DRAG_DEAD_ZONE = 12;
const DIRECTION_RATIO = 1.8;
const COMMIT_RATIO = 0.25;
const VEL_THRESHOLD = 0.5;
const RETURN_OVERSCROLL = -60;

// ── Easing curves ────────────────────────────────────────────
const commitEasing = Easing.bezier(0.34, 1.56, 0.64, 1);
const staggerEasing = Easing.bezier(0.22, 1, 0.36, 1);
const returnEasing = Easing.bezier(0.32, 0.72, 0, 1);

// ── Timing (ms) ──────────────────────────────────────────────
const COMMIT_DURATION = 550;
const RETURN_DURATION = 400;
const STAGGER_DELAY = 200;
const STAGGER_INTERVAL = 60;
const ELEMENT_DURATION = 300;
const NUM_SECTIONS = 5;

type ViewMode = 'feed' | 'detail';

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
  // ── Dimensions ─────────────────────────────────────────────
  const cardH = Math.max(1, height - CARD_V_TOP - CARD_V_BOTTOM - BELOW_CARD_H);
  const cardHRef = useRef(cardH);
  useEffect(() => {
    cardHRef.current = cardH;
  }, [cardH]);

  // ── State & refs ───────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('feed');
  const viewModeRef = useRef<ViewMode>('feed');
  const isAnimatingRef = useRef(false);
  const detailScrollRef = useRef<ScrollView>(null);
  const isTouchingDetailRef = useRef(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  // ── Animated values ────────────────────────────────────────
  const progress = useRef(new Animated.Value(0)).current;

  const detailAnims = useRef(
    Array.from({ length: NUM_SECTIONS }, () => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(24),
    })),
  ).current;

  const chevronBounce = useRef(new Animated.Value(0)).current;
  const chevronTextOpacity = useRef(new Animated.Value(1)).current;

  // ── Cover photo & rank ─────────────────────────────────────
  const coverUrl =
    plan.coverPhotos?.[0] ||
    plan.places?.find((p) => p.photoUrls?.length)?.photoUrls?.[0];
  const rank = getRankForProofs(plan.author?.total_proof_validations || 0);

  // ── Chevron pulse (2.5 s loop, feed mode only) ─────────────
  useEffect(() => {
    if (viewMode !== 'feed' || !isActive) {
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
  }, [viewMode, isActive]);

  // ══════════════════════════════════════════════════════════════
  //  COMMIT / BOUNCE / RETURN
  // ══════════════════════════════════════════════════════════════

  const commitToDetail = useCallback(() => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDetailStateChange(true);

    Animated.timing(progress, {
      toValue: 1,
      duration: COMMIT_DURATION,
      easing: commitEasing,
      useNativeDriver: true,
    }).start(() => {
      viewModeRef.current = 'detail';
      setViewMode('detail');
    });

    setTimeout(() => {
      Animated.stagger(
        STAGGER_INTERVAL,
        detailAnims.map((a) =>
          Animated.parallel([
            Animated.timing(a.opacity, {
              toValue: 1,
              duration: ELEMENT_DURATION,
              easing: staggerEasing,
              useNativeDriver: true,
            }),
            Animated.timing(a.translateY, {
              toValue: 0,
              duration: ELEMENT_DURATION,
              easing: staggerEasing,
              useNativeDriver: true,
            }),
          ]),
        ),
      ).start(() => {
        isAnimatingRef.current = false;
      });
    }, STAGGER_DELAY);
  }, [onDetailStateChange]);

  const bounceBack = useCallback(() => {
    isAnimatingRef.current = true;
    Animated.spring(progress, {
      toValue: 0,
      stiffness: 400,
      damping: 30,
      mass: 1,
      useNativeDriver: true,
    }).start(() => {
      viewModeRef.current = 'feed';
      isAnimatingRef.current = false;
    });
    Animated.sequence([
      Animated.delay(300),
      Animated.timing(chevronTextOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const returnToFeed = useCallback(() => {
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDetailStateChange(false);

    detailAnims.forEach((a) => {
      a.opacity.setValue(0);
      a.translateY.setValue(24);
    });

    Animated.timing(progress, {
      toValue: 0,
      duration: RETURN_DURATION,
      easing: returnEasing,
      useNativeDriver: true,
    }).start(() => {
      viewModeRef.current = 'feed';
      setViewMode('feed');
      isAnimatingRef.current = false;
      detailScrollRef.current?.scrollTo({ y: 0, animated: false });
      chevronTextOpacity.setValue(1);
    });
  }, [onDetailStateChange]);

  // Store latest refs for PanResponder closures
  const commitRef = useRef(commitToDetail);
  const bounceRef = useRef(bounceBack);
  useEffect(() => {
    commitRef.current = commitToDetail;
  }, [commitToDetail]);
  useEffect(() => {
    bounceRef.current = bounceBack;
  }, [bounceBack]);

  // ══════════════════════════════════════════════════════════════
  //  PAN RESPONDER — rubber-band drag
  // ══════════════════════════════════════════════════════════════

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gs) => {
          if (viewModeRef.current !== 'feed') return false;
          if (isAnimatingRef.current) return false;
          return (
            gs.dy > DRAG_DEAD_ZONE &&
            Math.abs(gs.dy) > Math.abs(gs.dx) * DIRECTION_RATIO
          );
        },
        onPanResponderGrant: () => {
          setHasInteracted(true);
          Animated.timing(chevronTextOpacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start();
        },
        onPanResponderMove: (_, gs) => {
          const raw = Math.max(0, gs.dy);
          const maxD = cardHRef.current;
          const resisted = raw * (1 - raw / (maxD * 2));
          const p = Math.min(resisted / (maxD * 0.625), 0.4);
          progress.setValue(p);
        },
        onPanResponderRelease: (_, gs) => {
          const raw = Math.max(0, gs.dy);
          const threshold = cardHRef.current * COMMIT_RATIO;
          if (raw > threshold || gs.vy > VEL_THRESHOLD) {
            commitRef.current();
          } else {
            bounceRef.current();
          }
        },
        onPanResponderTerminate: () => {
          bounceRef.current();
        },
      }),
    [],
  );

  // ══════════════════════════════════════════════════════════════
  //  DETAIL SCROLL HANDLERS (overscroll → return)
  // ══════════════════════════════════════════════════════════════

  const handleDetailScrollBeginDrag = useCallback(() => {
    isTouchingDetailRef.current = true;
  }, []);
  const handleDetailScrollEndDrag = useCallback(() => {
    isTouchingDetailRef.current = false;
  }, []);
  const handleDetailScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      if (
        isTouchingDetailRef.current &&
        y < RETURN_OVERSCROLL &&
        viewModeRef.current === 'detail' &&
        !isAnimatingRef.current
      ) {
        returnToFeed();
      }
    },
    [returnToFeed],
  );

  // ── Reset when card becomes inactive ───────────────────────
  useEffect(() => {
    if (!isActive) {
      progress.setValue(0);
      detailAnims.forEach((a) => {
        a.opacity.setValue(0);
        a.translateY.setValue(24);
      });
      if (viewModeRef.current !== 'feed') {
        viewModeRef.current = 'feed';
        setViewMode('feed');
        onDetailStateChange(false);
      }
      isAnimatingRef.current = false;
      chevronTextOpacity.setValue(1);
      detailScrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [isActive]);

  // ══════════════════════════════════════════════════════════════
  //  INTERPOLATIONS — all driven by `progress` (0 → 1)
  // ══════════════════════════════════════════════════════════════

  // Image parallax + scale
  const imageScale = progress.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [1, 0.92, 0.82],
    extrapolate: 'clamp',
  });
  const imageTranslateY = progress.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, -20, -60],
    extrapolate: 'clamp',
  });

  // Dark overlay on image
  const overlayOpacity = progress.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0.3, 0.55],
    extrapolate: 'clamp',
  });

  // Card UI layer (title, author, gradient, actions)
  const cardUIOpacity = progress.interpolate({
    inputRange: [0, 0.25],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const titleTranslateY = progress.interpolate({
    inputRange: [0, 0.4],
    outputRange: [0, -50],
    extrapolate: 'clamp',
  });
  const titleScale = progress.interpolate({
    inputRange: [0, 0.4],
    outputRange: [1, 0.9],
    extrapolate: 'clamp',
  });

  // Actions (like / save)
  const actionsOpacity = progress.interpolate({
    inputRange: [0, 0.15],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Bottom gradient
  const gradientOpacity = progress.interpolate({
    inputRange: [0, 0.2],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Chevron
  const chevronOpacity = progress.interpolate({
    inputRange: [0, 0.1],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Below-card meta
  const belowCardOpacity = progress.interpolate({
    inputRange: [0, 0.15],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  // Detail panel — stays off-screen during drag, slides up on commit
  const detailTranslateY = progress.interpolate({
    inputRange: [0, 0.35, 1, 1.15],
    outputRange: [cardH, cardH, 0, -15],
    extrapolate: 'clamp',
  });
  const detailOpacity = progress.interpolate({
    inputRange: [0, 0.35, 0.5],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  });

  // ══════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════
  const d = detailAnims;

  return (
    <View style={[styles.frame, { width, height }]}>
      {/* ── Card container ── */}
      <View
        style={styles.card}
        {...(viewMode === 'feed' ? panResponder.panHandlers : {})}
      >
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
          <Animated.View style={[styles.imageDim, { opacity: overlayOpacity }]} />
        </Animated.View>

        {/* ─── Card UI layer (feed-mode content) ─── */}
        <Animated.View
          style={[StyleSheet.absoluteFillObject, { opacity: cardUIOpacity }]}
          pointerEvents={viewMode === 'feed' ? 'auto' : 'none'}
        >
          {/* Top vignette */}
          <LinearGradient
            colors={['rgba(0,0,0,0.35)', 'transparent']}
            style={styles.topGradient}
          />

          {/* Bottom gradient */}
          <Animated.View
            style={[styles.bottomGradientWrap, { opacity: gradientOpacity }]}
          >
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.94)']}
              locations={[0.3, 0.6, 1]}
              style={StyleSheet.absoluteFillObject}
            />
          </Animated.View>

          {/* Actions (like / save) top-right */}
          <Animated.View style={[styles.cardActions, { opacity: actionsOpacity }]}>
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

          {/* Card info (bottom — title, author, avatars) */}
          <Animated.View
            style={[
              styles.cardInfo,
              {
                transform: [
                  { translateY: titleTranslateY },
                  { scale: titleScale },
                ],
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

          {/* Chevron hint + text */}
          <Animated.View style={[styles.chevronWrap, { opacity: chevronOpacity }]}>
            <Animated.View style={{ transform: [{ translateY: chevronBounce }] }}>
              <Ionicons
                name="chevron-down"
                size={18}
                color="rgba(255,255,255,0.55)"
              />
            </Animated.View>
            <Animated.Text
              style={[styles.chevronText, { opacity: chevronTextOpacity }]}
            >
              Glisse pour voir le plan
            </Animated.Text>
          </Animated.View>
        </Animated.View>

        {/* ─── Detail panel (slides up from bottom) ─── */}
        <Animated.View
          style={[
            styles.detailPanel,
            {
              height: cardH,
              transform: [{ translateY: detailTranslateY }],
              opacity: detailOpacity,
            },
          ]}
          pointerEvents={viewMode === 'detail' ? 'auto' : 'none'}
        >
          <ScrollView
            ref={detailScrollRef}
            style={styles.detailScroll}
            contentContainerStyle={styles.detailScrollContent}
            showsVerticalScrollIndicator={false}
            bounces
            scrollEnabled={viewMode === 'detail'}
            scrollEventThrottle={16}
            onScroll={handleDetailScroll}
            onScrollBeginDrag={handleDetailScrollBeginDrag}
            onScrollEndDrag={handleDetailScrollEndDrag}
          >
            {/* Return indicator */}
            <View style={styles.returnHint}>
              <Ionicons
                name="chevron-up"
                size={16}
                color="rgba(255,255,255,0.4)"
              />
              <Text style={styles.returnText}>Tirer pour revenir</Text>
            </View>

            {/* 0 — Title & meta */}
            <Animated.View
              style={{
                opacity: d[0].opacity,
                transform: [{ translateY: d[0].translateY }],
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

            {/* 1 — Tags */}
            {plan.tags?.length > 0 && (
              <Animated.View
                style={[
                  styles.detailTags,
                  {
                    opacity: d[1].opacity,
                    transform: [{ translateY: d[1].translateY }],
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

            {/* 2 — "Do it now" CTA */}
            <Animated.View
              style={{
                opacity: d[2].opacity,
                transform: [{ translateY: d[2].translateY }],
              }}
            >
              <TouchableOpacity
                style={styles.doItNowBtn}
                activeOpacity={0.8}
                onPress={onPlanPress}
              >
                <Text style={styles.doItNowText}>Do it now</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFF" />
              </TouchableOpacity>
            </Animated.View>

            {/* 3 — Itinerary */}
            <Animated.View
              style={{
                opacity: d[3].opacity,
                transform: [{ translateY: d[3].translateY }],
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

            {/* 4 — Author */}
            <Animated.View
              style={{
                opacity: d[4].opacity,
                transform: [{ translateY: d[4].translateY }],
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

            <View style={{ height: 120 }} />
          </ScrollView>
        </Animated.View>
      </View>

      {/* ── Below card (meta + tags — fades during drag) ── */}
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

  // ── Gradients ──────────────────────────────────────────────
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '25%',
    zIndex: 1,
  },
  bottomGradientWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '55%',
    zIndex: 1,
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

  // ── Chevron hint ───────────────────────────────────────────
  chevronWrap: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    alignItems: 'center',
    zIndex: 3,
  },
  chevronText: {
    fontSize: 12,
    fontFamily: Fonts.serif,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },

  // ── Detail panel ───────────────────────────────────────────
  detailPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: '#0D0D0D',
    overflow: 'hidden',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15,
    shadowRadius: 30,
    elevation: 20,
  },
  detailScroll: {
    flex: 1,
  },
  detailScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },

  // ── Return hint ────────────────────────────────────────────
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

  // ── Detail content ─────────────────────────────────────────
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
    marginBottom: 20,
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
    fontFamily: Fonts.serifBold,
    color: '#FFF',
  },

  // ── Section titles ─────────────────────────────────────────
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
