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
import { Platform } from 'react-native';
import { Colors, Fonts, getRankForProofs, shouldHideRankBadge } from '../constants';
import { FloatingAvatars } from './FloatingAvatars';
import { RankBadge } from './RankBadge';
import { MiniStampIcon } from './MiniStampIcon';
import { CoAuthorAvatarStack } from './CoAuthorAvatarStack';
import { CollaboratorsSheet } from './CollaboratorsSheet';
import { Plan, TravelSegment, TransportMode, Place } from '../types';
import { formatAuthorByline } from './PlanCard';
import { useSavedPlacesStore } from '../store';

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
  onHeaderHideChange?: (hide: boolean) => void;
  onPlacePress: (placeId: string) => void;
  onComment: () => void;
  onShare: () => void;
  onDoItNow: () => void;
  onGroupPlan?: () => void;
  onMapPress: () => void;
  /** Fires on every detail scroll frame. Parent can use this to drive pixel-accurate header fades. */
  onDetailScrollY?: (y: number) => void;
  /** Tap "..." → "Pas intéressé". Optionnel — si non passé, le bouton
   *  est caché (pour les contextes où le menu n'a pas de sens, ex.
   *  preview de partage). */
  onNotInterested?: () => void;
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
const CARD_V_BOTTOM = 0;  // Minimized — card goes all the way down
const BELOW_CARD_H = 0;   // Removed — no more meta/tags below the card
const IMAGE_HEADER_RATIO = 0.35;
// Extra vertical growth of the frame when detail panel opens (feed mode = 0)
const FRAME_EXTRA_DETAIL = 80;
// Sticky action bar height — frame is permanently extended by this amount so
// the bar can be positioned absolutely at `bottom: ACTION_BAR_H` (covering the
// bottom 64px of the visible card area when detail is open). The +64 of frame
// height beyond the visible area is hidden behind the tab bar.
const ACTION_BAR_H = 64;

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
  onHeaderHideChange,
  onPlacePress,
  onComment,
  onShare,
  onDoItNow,
  onGroupPlan,
  onDetailScrollY,
  onMapPress,
  onNotInterested,
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
  // Bottom sheet listing all collaborators when the plan has co-authors.
  // Opens on tap of the avatar stack / byline (instead of the single
  // "navigate to author profile" path used for solo plans).
  const [collaboratorsSheetOpen, setCollaboratorsSheetOpen] = useState(false);
  const hasCoAuthors = !!(plan.coAuthors && plan.coAuthors.length > 0);
  const headerHiddenRef = useRef(false);
  const HEADER_HIDE_THRESHOLD = 30; // px — past this, header starts its hide animation

  // ── Favorites (saved places) ────────────────────────────────
  // Subscribe to the array for reactivity so the star toggles visually.
  const savedPlaces = useSavedPlacesStore((s) => s.places);
  const savePlace = useSavedPlacesStore((s) => s.savePlace);
  const unsavePlace = useSavedPlacesStore((s) => s.unsavePlace);

  const placeFavKey = (place: Place) => place.googlePlaceId || place.id;
  const isPlaceFav = (place: Place) =>
    savedPlaces.some((p) => p.placeId === placeFavKey(place));

  const togglePlaceFavorite = (place: Place) => {
    const key = placeFavKey(place);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    if (isPlaceFav(place)) {
      unsavePlace(key);
    } else {
      savePlace({
        placeId: key,
        name: place.name,
        address: place.address || '',
        types: place.type ? [place.type] : [],
        rating: place.rating || 0,
        reviewCount: place.reviewCount || 0,
        photoUrl: place.customPhoto || place.photoUrls?.[0] || null,
        savedAt: Date.now(),
        ...(place.latitude && place.longitude ? { latitude: place.latitude, longitude: place.longitude } : {}),
      });
    }
  };

  // ── Cover photo & rank ─────────────────────────────────────
  const coverUrl =
    plan.coverPhotos?.[0] ||
    plan.places?.find((p) => p.photoUrls?.length)?.photoUrls?.[0];
  const rawRank = getRankForProofs(plan.author?.total_proof_validations || 0);
  // null = ne pas afficher le RankBadge (ex: 'newcomer' caché pour @leo_trann)
  const rank = shouldHideRankBadge(plan.author?.username, rawRank) ? null : rawRank;

  // ── Chevron pulse (2.5 s loop) ─────────────────────────────
  const chevronBounce = useRef(new Animated.Value(0)).current;

  // ── Frame height ─────────────────────────────────────────────
  // The frame is permanently extended by ACTION_BAR_H so we have stable
  // 64px of vertical real estate to position the sticky bar with
  // `bottom: ACTION_BAR_H`. The +64 lives below the visible area (under the
  // tab bar) — pure layout allocation, never rendered to the user.
  // We keep `frameExtra` as a no-op to preserve the existing call-sites in
  // commitToDetail / returnToFeed (kept for future re-enable of dynamic
  // growth without re-touching those code paths).
  const frameExtra = useRef(new Animated.Value(0)).current;
  const frameHeight = height + ACTION_BAR_H;

  // ── Sticky action bar (fades in when detail panel opens) ────────────────
  // useNativeDriver:false to keep touch recognizers responsive on Android
  // when the bar fades from 0→1 (some Android builds lose tap targets when
  // opacity is animated on the native thread).
  const barOpacity = useRef(new Animated.Value(0)).current;
  // Per-button micro-interactions
  const likeScale = useRef(new Animated.Value(1)).current;
  const saveScale = useRef(new Animated.Value(1)).current;
  const commentScale = useRef(new Animated.Value(1)).current;
  const shareTransX = useRef(new Animated.Value(0)).current;
  const shareRot = useRef(new Animated.Value(0)).current;

  // ── Card-level heart anim (separate from detail action bar heart) ──
  const cardLikeScale = useRef(new Animated.Value(1)).current;

  const animPop = useCallback((scale: Animated.Value, peak = 1.3) => {
    Animated.sequence([
      Animated.timing(scale, { toValue: peak, duration: 150, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 150, easing: Easing.bezier(0.34, 1.56, 0.64, 1), useNativeDriver: true }),
    ]).start();
  }, []);

  // Heart animation : bigger overshoot when LIKING (outline -> filled),
  // softer squeeze when UN-LIKING (filled -> outline). The distinction gives
  // liking a celebratory feel without being cartoonish.
  const animHeart = useCallback((willLike: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (willLike) {
      Animated.sequence([
        Animated.timing(cardLikeScale, { toValue: 0.8, duration: 70, useNativeDriver: true }),
        Animated.spring(cardLikeScale, { toValue: 1, useNativeDriver: true, friction: 3.5, tension: 180 }),
      ]).start();
    } else {
      Animated.sequence([
        Animated.timing(cardLikeScale, { toValue: 0.85, duration: 90, useNativeDriver: true }),
        Animated.spring(cardLikeScale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 160 }),
      ]).start();
    }
  }, [cardLikeScale]);

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

    // Enlarge frame to reveal extra room below the classic card area
    Animated.timing(frameExtra, {
      toValue: FRAME_EXTRA_DETAIL,
      duration: 320,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
    }).start();

    // Fade the sticky action bar in (slight delay so it lands once the panel
    // has begun opening — feels like the bar is anchoring the new context
    // rather than appearing out of thin air).
    Animated.timing(barOpacity, {
      toValue: 1,
      duration: 350,
      delay: 200,
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
    if (headerHiddenRef.current) {
      headerHiddenRef.current = false;
      onHeaderHideChange?.(false);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Fade the sticky action bar out FIRST (faster than the scroll return so
    // the bar disappears before the card image fully reclaims the bottom).
    Animated.timing(barOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();

    // Shrink frame back to classic feed size
    Animated.timing(frameExtra, {
      toValue: 0,
      duration: 280,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
    }).start();

    (scrollRef.current as any)?.scrollTo({ y: 0, animated: true });
    setTimeout(() => {
      isCommitting.current = false;
    }, 500);
  }, [onDetailStateChange, onHeaderHideChange]);

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

  // Continuous scroll listener — detect overscroll for return + early header hide +
  // emit raw scroll Y so the parent can drive a pixel-accurate header fade.
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      if (isDetailRef.current && y < -75 && !isCommitting.current) {
        returnToFeed();
      }
      if (!isActive) return;
      // Emit raw scroll Y on the active card — parent interpolates over 0..80 for header.
      onDetailScrollY?.(y);
      // Toggle header visibility as soon as the user begins the pull (kept for legacy pointerEvents).
      const shouldHide = y > HEADER_HIDE_THRESHOLD;
      if (shouldHide !== headerHiddenRef.current) {
        headerHiddenRef.current = shouldHide;
        onHeaderHideChange?.(shouldHide);
      }
    },
    [returnToFeed, isActive, onHeaderHideChange, onDetailScrollY],
  );

  // Reset when card becomes inactive
  useEffect(() => {
    if (!isActive) {
      if (headerHiddenRef.current) {
        headerHiddenRef.current = false;
        onHeaderHideChange?.(false);
      }
      if (isDetailRef.current) {
        setIsDetailOpen(false);
        isDetailRef.current = false;
        onDetailStateChange(false);
        frameExtra.setValue(0);
        (scrollRef.current as any)?.scrollTo({ y: 0, animated: false });
      }
      // Always reset the sticky bar — guarantees a clean state if the user
      // swipes horizontally mid-animation.
      barOpacity.setValue(0);
    }
  }, [isActive]);

  // ══════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════
  const d0 = makeDetailAnim(0);
  const d1 = makeDetailAnim(1);
  const d2 = makeDetailAnim(2);
  const d3 = makeDetailAnim(3);
  const d5 = makeDetailAnim(5);

  return (
    <View style={[styles.frame, { width, height: frameHeight }]}>
      {/* ── Card container ── */}
      {/* Explicit height so the card always covers the visible area; the
          extra ACTION_BAR_H of frame below is purely for the sticky bar's
          absolute positioning, never visible content. */}
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

              {(plan.tags?.length > 0 || (plan.proofCount ?? 0) > 0) && (
                <View style={styles.metaRow}>
                  {plan.tags?.length > 0 && (
                    <Text style={styles.categoryLabel}>
                      {plan.tags[0].toUpperCase()}
                    </Text>
                  )}
                  {(plan.proofCount ?? 0) > 0 && (
                    <View style={styles.proofBadgePill}>
                      <MiniStampIcon type="proof" size={11} />
                      <Text style={styles.proofBadgeCount}>{plan.proofCount}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Title — NOT tappable (swipe is the only entry) */}
              <Text style={styles.planTitle} numberOfLines={2}>
                {plan.title}
              </Text>

              <TouchableOpacity
                style={styles.authorRow}
                activeOpacity={0.7}
                onPress={hasCoAuthors ? () => setCollaboratorsSheetOpen(true) : onAuthorPress}
              >
                {hasCoAuthors && plan.author ? (
                  <CoAuthorAvatarStack
                    mainAuthor={{
                      avatarUrl: plan.author.avatarUrl ?? null,
                      initials: plan.author.initials,
                      avatarBg: plan.author.avatarBg,
                      avatarColor: plan.author.avatarColor,
                    }}
                    coAuthors={plan.coAuthors}
                    size={20}
                    borderColor={'rgba(0,0,0,0.7)'}
                  />
                ) : (
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
                )}
                <Text style={styles.authorName} numberOfLines={1}>
                  {formatAuthorByline(plan.author?.displayName || 'Inconnu', plan.coAuthors)}
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
                onPress={() => {
                  animHeart(!isLiked);
                  onLike();
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Animated.View style={{ transform: [{ scale: cardLikeScale }] }}>
                  <Ionicons
                    name={isLiked ? 'heart' : 'heart-outline'}
                    size={24}
                    color={isLiked ? '#FF4D67' : '#FFF'}
                    style={styles.iconShadow}
                  />
                </Animated.View>
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
              {/* "..." menu — pour l'instant juste une option : "Pas
                  intéressé" qui informe l'algo de cacher ce post +
                  mettre un malus sur la catégorie. Visible top-right
                  à côté des like/save pour rester discrète. */}
              {onNotInterested && (
                <TouchableOpacity
                  onPress={onNotInterested}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="ellipsis-horizontal"
                    size={22}
                    color="#FFF"
                    style={styles.iconShadow}
                  />
                </TouchableOpacity>
              )}
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

          {/* ══ DETAIL CONTENT — editorial layout (hero → metrics → pull-quote → timeline → tags → comments → CTA) ══ */}
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

            {/* ═══════ SECTION 1 — Hero immersif ═══════ */}
            <Animated.View
              style={[styles.heroSection, { opacity: d0.opacity, transform: [{ translateY: d0.translateY }] }]}
            >
              <View style={styles.heroImageWrap}>
                {coverUrl ? (
                  <Image source={{ uri: coverUrl }} style={styles.heroImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.heroImage, { backgroundColor: Colors.gray300 }]} />
                )}
                <LinearGradient
                  colors={['transparent', 'rgba(44,36,32,0.2)', 'rgba(44,36,32,0.78)']}
                  locations={[0, 0.5, 1]}
                  style={StyleSheet.absoluteFillObject}
                />
                <View style={styles.heroTextOverlay}>
                  {plan.tags && plan.tags.length > 0 ? (
                    <Text style={styles.heroOverline}>
                      {plan.tags.slice(0, 2).map((t) => t.toUpperCase()).join(' · ')}
                    </Text>
                  ) : null}
                  <Text style={styles.heroTitle} numberOfLines={3}>{plan.title}</Text>
                  <TouchableOpacity
                    style={styles.heroAuthorRow}
                    onPress={hasCoAuthors ? () => setCollaboratorsSheetOpen(true) : onAuthorPress}
                    activeOpacity={0.7}
                  >
                    {hasCoAuthors && plan.author ? (
                      <CoAuthorAvatarStack
                        mainAuthor={{
                          avatarUrl: plan.author.avatarUrl ?? null,
                          initials: plan.author.initials,
                          avatarBg: plan.author.avatarBg,
                          avatarColor: plan.author.avatarColor,
                        }}
                        coAuthors={plan.coAuthors}
                        size={24}
                        borderColor={'rgba(0,0,0,0.5)'}
                      />
                    ) : (
                      <View style={[styles.heroAuthorAvatar, { backgroundColor: plan.author?.avatarBg || '#444' }]}>
                        {plan.author?.avatarUrl ? (
                          <Image source={{ uri: plan.author.avatarUrl }} style={styles.heroAuthorAvatarImg} />
                        ) : (
                          <Text style={[styles.heroAuthorInitials, { color: plan.author?.avatarColor || '#FFF' }]}>
                            {plan.author?.initials || '?'}
                          </Text>
                        )}
                      </View>
                    )}
                    <Text style={styles.heroAuthorText}>
                      par {formatAuthorByline(plan.author?.displayName || 'Inconnu', plan.coAuthors)}
                      {plan.city ? ` · ${plan.city}` : ''}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>

            {/* Actions row (like / comment / save / share) was moved out of
                the scroll into a sticky bar at the bottom of the frame — see
                the <Animated.View style={styles.actionBar}> at the very end
                of this component. The bar is always visible while the detail
                panel is open, regardless of scroll position. */}

            {/* ═══════ SECTION 2 — Metrics (horizontal line with fine separators) ═══════ */}
            <Animated.View
              style={[styles.metricsRow, { opacity: d1.opacity, transform: [{ translateY: d1.translateY }] }]}
            >
              {plan.price ? (
                <View style={styles.metricItem}>
                  <Ionicons name="wallet-outline" size={16} color={Colors.primary} />
                  <Text style={styles.metricText}>{plan.price}</Text>
                </View>
              ) : null}
              {plan.price && plan.duration ? <View style={styles.metricSep} /> : null}
              {plan.duration ? (
                <View style={styles.metricItem}>
                  <Ionicons name="time-outline" size={16} color={Colors.primary} />
                  <Text style={styles.metricText}>{plan.duration}</Text>
                </View>
              ) : null}
              {(plan.price || plan.duration) && plan.places?.length > 0 ? <View style={styles.metricSep} /> : null}
              {plan.places?.length > 0 ? (
                <View style={styles.metricItem}>
                  <Ionicons name="location-outline" size={16} color={Colors.primary} />
                  <Text style={styles.metricText}>{plan.places.length} lieu{plan.places.length > 1 ? 'x' : ''}</Text>
                </View>
              ) : null}
              {plan.transport ? <View style={styles.metricSep} /> : null}
              {plan.transport ? (
                <View style={styles.metricItem}>
                  <Ionicons name={(TRANSPORT_ICONS[plan.transport] || 'walk-outline') as any} size={16} color={Colors.primary} />
                  <Text style={styles.metricText}>{plan.transport}</Text>
                </View>
              ) : null}
              {plan.places?.some((p: any) => p.latitude && p.longitude) ? (
                <>
                  <View style={styles.metricSep} />
                  <TouchableOpacity style={styles.metricItem} onPress={onMapPress} activeOpacity={0.7}>
                    <Ionicons name="map-outline" size={16} color={Colors.primary} />
                    <Text style={[styles.metricText, { color: Colors.primary }]}>Map</Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </Animated.View>

            {/* ═══════ Social proof — total "ont fait" + validation count ═══════
                Identique à PlanDetailModal : petite phrase italique tertiary qui
                donne le total (proof + déclinés), suivie de la ligne validation
                avec stamps. La proximité visuelle des deux nombres permet la
                comparaison instantanée "fait" ↔ "proof". */}
            {(plan.proofCount ?? 0) > 0 && (
              <Animated.View
                style={[styles.socialProofRow, { opacity: d1.opacity, transform: [{ translateY: d1.translateY }] }]}
              >
                {(() => {
                  const totalDid = (plan.proofCount ?? 0) + (plan.declinedCount ?? 0);
                  if (totalDid === 0) return null;
                  return (
                    <Text style={styles.socialProofTotal}>
                      {totalDid} {totalDid === 1 ? 'personne a fait' : 'personnes ont fait'} ce plan
                    </Text>
                  );
                })()}
                <View style={styles.socialProofMain}>
                  <MiniStampIcon type="proof" size={16} />
                  <Text style={styles.socialProofText}>
                    {plan.proofCount} {plan.proofCount === 1 ? "personne l'a" : "personnes l'ont"} vérifié sur Proof.
                  </Text>
                  {(plan.declinedCount ?? 0) > 0 && (
                    <>
                      <View style={styles.socialProofDot} />
                      <MiniStampIcon type="declined" size={16} />
                      <Text style={styles.socialProofDeclined}>{plan.declinedCount}</Text>
                    </>
                  )}
                </View>
              </Animated.View>
            )}

            {/* ═══════ Tags (moved here — shown right after metrics for instant glance) ═══════ */}
            {plan.tags && plan.tags.length > 0 ? (
              <Animated.View
                style={[styles.tagsSectionTop, { opacity: d1.opacity, transform: [{ translateY: d1.translateY }] }]}
              >
                <View style={styles.tagsList}>
                  {plan.tags.map((tag, i) => (
                    <View key={i} style={styles.tagPill}>
                      <Text style={styles.tagPillText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </Animated.View>
            ) : null}

            {/* ═══════ SECTION 3 — Creator tip as editorial pull-quote ═══════ */}
            {(() => {
              // Prefer the dedicated authorTip (mandatory from step 5 of wizard).
              // Fallback to the first place comment for legacy plans created before the tip step existed.
              const creatorTip = plan.authorTip?.trim() || plan.places?.find((p) => p.comment)?.comment;
              if (!creatorTip) return null;
              return (
                <Animated.View
                  style={[styles.tipSection, { opacity: d1.opacity, transform: [{ translateY: d1.translateY }] }]}
                >
                  <Text style={styles.tipQuoteMark}>&ldquo;</Text>
                  <Text style={styles.tipQuote}>{creatorTip}</Text>
                  <Text style={styles.tipAttribution}>— {plan.author?.displayName || 'Créateur'}, créateur</Text>
                </Animated.View>
              );
            })()}

            {/* ═══════ SECTION 4 — Itinerary timeline (Citymapper × Airbnb) ═══════ */}
            <Animated.View
              style={[styles.itinerarySection, { opacity: d2.opacity, transform: [{ translateY: d2.translateY }] }]}
            >
              <View style={styles.itineraryHeader}>
                <Text style={styles.itineraryTitle}>Itinéraire</Text>
                {plan.duration ? (
                  <Text style={styles.itineraryMeta}>{plan.places?.length || 0} étapes · {plan.duration}</Text>
                ) : null}
              </View>
              {plan.places?.map((place, i) => {
                const isLast = i === (plan.places?.length ?? 0) - 1;
                const placePhoto = place.customPhoto || place.photoUrls?.[0];
                const travelToNext: TravelSegment | undefined =
                  plan.travelSegments?.find(
                    (ts) => ts.fromPlaceId === place.id || ts.fromPlaceId === place.googlePlaceId,
                  ) || (plan.travelSegments && plan.travelSegments[i]);

                return (
                  <React.Fragment key={place.id || i}>
                    <TouchableOpacity
                      style={styles.timelineStep}
                      activeOpacity={0.7}
                      // Préfère le googlePlaceId pour que PlaceDetailModal
                      // puisse hit l'API Google direct ; fallback sur l'UUID
                      // interne pour les plans legacy (mockApi). Sans ça,
                      // le modal affichait "lieu introuvable" sur tous les
                      // plans Firestore.
                      onPress={() => onPlacePress(place.googlePlaceId || place.id)}
                    >
                      <View style={styles.timelineLeft}>
                        <View style={styles.timelineNodeHalo}>
                          <View style={styles.timelineNode} />
                        </View>
                        {!isLast && <View style={styles.timelineLine} />}
                      </View>
                      <View style={styles.timelineContent}>
                        <View style={styles.timelinePlaceHead}>
                          <View style={styles.timelinePlaceTitleRow}>
                            <Text style={styles.timelinePlaceName}>
                              {place.name}
                              {place.reservationRecommended ? (
                                <Text style={styles.reservationAsterisk}>{' ﹡'}</Text>
                              ) : null}
                            </Text>
                            {/* Favorite star — right next to the place title */}
                            <TouchableOpacity
                              style={styles.timelineFavBtn}
                              onPress={(e) => { e.stopPropagation?.(); togglePlaceFavorite(place); }}
                              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                              activeOpacity={0.7}
                            >
                              <Ionicons
                                name={isPlaceFav(place) ? 'star' : 'star-outline'}
                                size={18}
                                color={isPlaceFav(place) ? Colors.gold : Colors.textTertiary}
                              />
                            </TouchableOpacity>
                          </View>
                          <Text style={styles.timelinePlaceType}>{place.type}</Text>
                        </View>
                        {place.rating > 0 ? (
                          <View style={styles.timelineRating}>
                            <Ionicons name="star" size={11} color="#F5A623" />
                            <Text style={styles.timelineRatingText}>{place.rating}</Text>
                            {place.reviewCount > 0 ? (
                              <Text style={styles.timelineRatingCount}> ({place.reviewCount})</Text>
                            ) : null}
                          </View>
                        ) : null}
                        {place.comment ? (
                          <Text style={styles.timelineDesc} numberOfLines={3}>{place.comment}</Text>
                        ) : null}
                        {placePhoto ? (
                          <Image source={{ uri: placePhoto }} style={styles.timelinePhoto} resizeMode="cover" />
                        ) : null}
                        {(place.questions && place.questions.length > 0
                          ? place.questions
                          : place.questionAnswer && place.question
                            ? [{ question: place.question, answer: place.questionAnswer }]
                            : []
                        ).map((qa, qIdx) => (
                          <View key={qIdx} style={styles.timelineQa}>
                            <Text style={styles.timelineQaLabel}>{qa.question}</Text>
                            <Text style={styles.timelineQaAnswer}>{qa.answer}</Text>
                          </View>
                        ))}
                      </View>
                    </TouchableOpacity>

                    {/* Travel pill between steps (pill sits ON the line) */}
                    {!isLast ? (
                      <View style={styles.travelPillWrap}>
                        <View style={styles.travelPillLineVert} />
                        <View style={styles.travelPill}>
                          <Ionicons
                            name={(TRANSPORT_ICONS[travelToNext?.transport || plan.transport] || 'walk-outline') as any}
                            size={12}
                            color={Colors.textSecondary}
                          />
                          <Text style={styles.travelPillText}>
                            {travelToNext
                              ? `${travelToNext.transport} · ${fmtMin(travelToNext.duration)}`
                              : (plan.transport || 'À pied')}
                          </Text>
                        </View>
                        <View style={styles.travelPillLineVert} />
                      </View>
                    ) : null}
                  </React.Fragment>
                );
              })}
              {plan.places?.some((p) => p.reservationRecommended) ? (
                <Text style={styles.reservationLegend}>﹡ Réservation recommandée</Text>
              ) : null}
            </Animated.View>

            {/* ═══════ SECTION 7 — Final CTA "Do it now" (emotional climax) ═══════ */}
            <Animated.View
              style={[styles.ctaSection, { opacity: d5.opacity, transform: [{ translateY: d5.translateY }] }]}
            >
              <Text style={styles.ctaHook}>Prêt à vivre ce plan ?</Text>
              <TouchableOpacity style={styles.ctaButton} onPress={onDoItNow} activeOpacity={0.85}>
                <Ionicons name="compass" size={18} color={Colors.textOnAccent} />
                <Text style={styles.ctaButtonText}>Do it now</Text>
              </TouchableOpacity>
              {/* Secondary CTA — invite friends (creates a group bound to this plan) */}
              {onGroupPlan ? (
                <TouchableOpacity
                  style={styles.ctaGroupButton}
                  onPress={onGroupPlan}
                  activeOpacity={0.85}
                >
                  <Ionicons name="people-outline" size={17} color={Colors.primary} />
                  <Text style={styles.ctaGroupButtonText}>Le faire à plusieurs</Text>
                </TouchableOpacity>
              ) : null}
              {plan.duration ? (
                <Text style={styles.ctaSubtext}>⏱ Ce plan prend environ {plan.duration}</Text>
              ) : null}
            </Animated.View>

            <View style={{ height: 140 }} />
          </View>
        </Animated.ScrollView>
        {/* Sticky "Do it now" CTA was moved to FeedScreen — it lives at the
            screen level so it can sit above the bottom tab bar without being
            clipped by the card's overflow:hidden. */}

        {/* ── Type badge "PLAN" — top-left, vert sauge, discret ──
            Pendant du badge "SPOT" terracotta dans SpotCard. Visible
            uniquement en mode feed (scroll = 0) — fade out dès que
            l'utilisateur commence à tirer le détail (même rythme que
            le chevron "Glisse pour voir le plan"). En détail ouvert,
            le badge n'a plus de raison d'être visible : on est déjà
            dans le contenu du plan, le contexte est implicite.
            pointerEvents:'none' pour ne pas bloquer les taps sur le
            ScrollView en dessous. */}
        <Animated.View style={[styles.typeBadge, { opacity: chevronOpacity }]} pointerEvents="none">
          <Ionicons name="map" size={11} color={Colors.textOnAccent} />
          <Text style={styles.typeBadgeText}>PLAN</Text>
        </Animated.View>
      </View>

      {/* ════════════════════════════════════════════════════════════════
          STICKY ACTION BAR — sits at bottom of the frame, NOT inside the
          card. Why outside the card? The card has `overflow: hidden` (for
          its rounded corners), so anything inside it would be clipped or
          its tap recognizer intercepted by the ScrollView. Putting the
          bar in the frame (which has no overflow:hidden) lets it remain
          tappable while still rendering above the card visually.

          Position: bottom: ACTION_BAR_H means the bar sits 64px from the
          bottom of the frame — and since the frame is `height + 64` tall,
          this puts the bar's bottom edge exactly at `height` (i.e. at the
          bottom of the visible area, just above the system tab bar). The
          bar therefore occupies [height-64, height], a 64px slice at the
          very bottom of the visible card area.

          Visibility: the bar fades in via `barOpacity` (commitToDetail
          drives it 0→1 with a 200 ms delay) and fades out faster on
          returnToFeed (200 ms). pointerEvents toggle prevents stray taps
          while the bar is invisible / animating in.
          ════════════════════════════════════════════════════════════════ */}
      <Animated.View
        style={[styles.actionBar, { opacity: barOpacity }]}
        pointerEvents={isDetailOpen ? 'auto' : 'none'}
      >
        {/* Like */}
        <TouchableOpacity
          style={styles.abBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => {
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            }
            animPop(likeScale, 1.3);
            onLike();
          }}
        >
          <Animated.View style={{ transform: [{ scale: likeScale }] }}>
            <Ionicons
              name={isLiked ? 'heart' : 'heart-outline'}
              size={22}
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
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => {
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            }
            animPop(commentScale, 0.9);
            onComment();
          }}
        >
          <Animated.View style={{ transform: [{ scale: commentScale }] }}>
            <Ionicons name="chatbubble-outline" size={21} color={Colors.textSecondary} />
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
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => {
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            }
            animPop(saveScale, 1.25);
            onSave();
          }}
        >
          <Animated.View style={{ transform: [{ scale: saveScale }] }}>
            <Ionicons
              name={isSaved ? 'bookmark' : 'bookmark-outline'}
              size={21}
              color={isSaved ? Colors.primary : Colors.textSecondary}
            />
          </Animated.View>
        </TouchableOpacity>

        {/* Share — paper-plane "envoi" animation: translate right + slight rotate */}
        <TouchableOpacity
          style={styles.abBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={() => {
            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            }
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
            <Ionicons name="paper-plane-outline" size={21} color={Colors.textSecondary} />
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>

      {/* ── Collaborators sheet — opens when the byline is tapped on a
            co-authored plan. Lists every author with avatar + username,
            tap any row → that user's profile (handled by onProfilePress
            from the parent screen which has navigation). */}
      {hasCoAuthors && plan.author && (
        <CollaboratorsSheet
          visible={collaboratorsSheetOpen}
          onClose={() => setCollaboratorsSheetOpen(false)}
          mainAuthor={{
            id: plan.author.id,
            displayName: plan.author.displayName,
            username: plan.author.username,
            avatarUrl: plan.author.avatarUrl ?? null,
            initials: plan.author.initials,
            avatarBg: plan.author.avatarBg,
            avatarColor: plan.author.avatarColor,
          }}
          coAuthors={plan.coAuthors}
          onProfilePress={onProfilePress}
        />
      )}
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
    // Height is set inline (cardH). Do NOT use flex:1 — the frame grows
    // dynamically and we want the card to stay the same (feed) size.
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: '#000',
  },

  // ── Type badge "PLAN" — top-left, vert sauge ──
  // Pendant du badge "SPOT" terracotta dans SpotCard. La couleur vert
  // sauge (Colors.success) reste discrète vs la palette terracotta
  // dominante de l'app — pas de risque de confusion avec un Spot.
  typeBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: Colors.success,
  },
  typeBadgeText: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    color: Colors.textOnAccent,
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
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  proofBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 99,
    backgroundColor: 'rgba(196, 112, 75, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(196, 112, 75, 0.4)',
  },
  proofBadgeCount: {
    fontSize: 11,
    fontFamily: Fonts.bodyBold,
    color: '#FFF',
    letterSpacing: 0.3,
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

  // ── Detail content (editorial) ─────────────────────────────
  // NOTE: no `paddingHorizontal` — the hero is full-bleed. Each inner
  // section below owns its own horizontal padding (typically 24px).
  detail: {
    backgroundColor: Colors.bgPrimary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 14,
    minHeight: 400,
  },
  returnHint: {
    alignItems: 'center',
    marginBottom: 10,
  },
  returnText: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  // ══════════════════════════════════════════════════════════
  //  EDITORIAL DETAIL LAYOUT
  // ══════════════════════════════════════════════════════════

  // ── SECTION 1: Hero ──
  heroSection: {
    marginBottom: 26,
  },
  heroImageWrap: {
    height: 320,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    backgroundColor: Colors.gray300,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroTextOverlay: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 24,
  },
  heroOverline: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.terracotta200,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  heroTitle: {
    fontSize: 32,
    lineHeight: 36,
    fontFamily: Fonts.displayBold,
    color: Colors.textOnAccent,
    letterSpacing: -0.5,
    marginBottom: 14,
    maxWidth: '92%',
  },
  heroAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  } as any,
  heroAuthorAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroAuthorAvatarImg: { width: 24, height: 24, borderRadius: 12 },
  heroAuthorInitials: { fontSize: 10, fontFamily: Fonts.bodyBold },
  heroAuthorText: {
    fontSize: 13,
    fontFamily: Fonts.bodyMedium,
    color: 'rgba(255,248,240,0.88)',
  },

  // ── SECTION 2: Metrics row ──
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 24,
    paddingBottom: 28,
    flexWrap: 'wrap',
    gap: 8,
  } as any,
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  } as any,
  metricText: {
    fontSize: 13,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textPrimary,
  },
  metricSep: {
    width: 1,
    height: 18,
    backgroundColor: Colors.borderSubtle,
  },

  // ── Social proof block (entre metrics et tags) ──
  // Aligné sur le padding horizontal des métriques pour rester dans la grille.
  socialProofRow: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  // Petite phrase éditoriale "X personnes ont fait ce plan" — italique tertiary,
  // posée juste au-dessus de la ligne validation pour la comparaison visuelle.
  socialProofTotal: {
    fontSize: 11,
    fontFamily: Fonts.bodyMedium,
    fontStyle: 'italic',
    color: Colors.textTertiary,
    letterSpacing: 0.05,
    marginBottom: 6,
  },
  socialProofMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  } as any,
  socialProofText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    flex: 1,
  },
  socialProofDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.textTertiary,
  },
  socialProofDeclined: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
  },

  // ── SECTION 3: Tip pull-quote ──
  tipSection: {
    paddingHorizontal: 28,
    paddingBottom: 36,
    position: 'relative',
  },
  tipQuoteMark: {
    position: 'absolute',
    top: -18,
    left: 14,
    fontSize: 72,
    lineHeight: 72,
    fontFamily: Fonts.displayBold,
    color: Colors.terracotta300,
    opacity: 0.5,
  },
  tipQuote: {
    fontSize: 20,
    lineHeight: 28,
    fontFamily: Fonts.displayItalic,
    color: Colors.textPrimary,
    paddingLeft: 8,
  },
  tipAttribution: {
    marginTop: 14,
    fontSize: 11,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textTertiary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingLeft: 8,
  },

  // ── SECTION 4: Itinerary timeline ──
  itinerarySection: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  itineraryHeader: {
    marginBottom: 18,
  },
  itineraryTitle: {
    fontSize: 22,
    lineHeight: 26,
    fontFamily: Fonts.displayBold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  itineraryMeta: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
  },
  timelineStep: {
    flexDirection: 'row',
    paddingBottom: 0,
  },
  timelineLeft: {
    width: 28,
    alignItems: 'center',
    paddingTop: 6,
  },
  timelineNodeHalo: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(196,112,75,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  timelineNode: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.primary,
    borderWidth: 3,
    borderColor: Colors.bgPrimary,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: Colors.terracotta200,
    marginTop: 2,
    minHeight: 12,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: 20,
    paddingBottom: 4,
  },
  timelinePlaceHead: {
    marginBottom: 4,
  },
  timelinePlaceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  timelineFavBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelinePlaceName: {
    fontSize: 18,
    lineHeight: 22,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  reservationAsterisk: {
    fontSize: 10,
    color: Colors.primary,
  },
  timelinePlaceType: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textTertiary,
    textTransform: 'capitalize',
    marginTop: 2,
  },
  timelineRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  } as any,
  timelineRatingText: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },
  timelineRatingCount: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
  },
  timelineDesc: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
  },
  timelinePhoto: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    marginTop: 12,
    backgroundColor: Colors.gray300,
  },
  timelineQa: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: Colors.terracotta50,
  },
  timelineQaLabel: {
    fontSize: 10,
    fontFamily: Fonts.bodyMedium,
    color: Colors.terracotta600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  timelineQaAnswer: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.body,
    color: Colors.textPrimary,
  },
  travelPillWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 7,
    paddingVertical: 4,
    gap: 8,
  } as any,
  travelPillLineVert: {
    width: 2,
    height: 16,
    backgroundColor: Colors.terracotta200,
    marginLeft: 6,
  },
  travelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  } as any,
  travelPillText: {
    fontSize: 11,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
  },
  reservationLegend: {
    marginTop: 10,
    paddingLeft: 48,
    fontSize: 11,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    color: Colors.textTertiary,
  },

  // ── Tags (after metrics — quick-glance specificities) ──
  tagsSectionTop: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 4,
  },
  // ── SECTION 5: Tags (legacy — kept for backward compat, no longer rendered) ──
  tagsSection: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  overline: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  tagsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  } as any,
  tagPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: Colors.terracotta100,
  },
  tagPillText: {
    fontSize: 13,
    fontFamily: Fonts.bodyMedium,
    color: Colors.terracotta700,
  },

  // ── SECTION 7: Final CTA ──
  ctaSection: {
    paddingHorizontal: 24,
    paddingBottom: 48,
    paddingTop: 12,
    alignItems: 'center',
  },
  ctaHook: {
    fontSize: 17,
    lineHeight: 24,
    fontFamily: Fonts.displayItalic,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  } as any,
  // (sticky CTA styles moved to FeedScreen — see feedStickyCta*)
  ctaButtonText: {
    fontSize: 16,
    fontFamily: Fonts.bodyBold,
    color: Colors.textOnAccent,
    letterSpacing: 0.2,
  },
  // Secondary "à plusieurs" CTA — outline terracotta, lives below the primary Do it now
  ctaGroupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    height: 48,
    borderRadius: 14,
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth + 0.5,
    borderColor: Colors.primary,
    marginTop: 10,
  } as any,
  ctaGroupButtonText: {
    fontSize: 14.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
    letterSpacing: -0.1,
  },
  ctaSubtext: {
    marginTop: 14,
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    textAlign: 'center',
  },

  // ── Sticky action bar ─────────────────────────────────────
  // Lives as a direct child of the frame (not the card). Position is
  // `bottom: ACTION_BAR_H` so the bar's bottom edge coincides with the
  // bottom of the visible card area — the +ACTION_BAR_H of frame height
  // below sits behind the system tab bar. Rounded bottom corners match
  // the card so the visual seam disappears when the bar overlays the
  // card's bottom 64px.
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
  } as any,
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
