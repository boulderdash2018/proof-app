import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  FlatList,
  Image,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  GestureResponderEvent,
} from 'react-native';
import ReAnimated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Plan, TransportMode } from '../types';
import { Colors, Layout, Fonts, getRankForProofs } from '../constants';
import { useColors } from '../hooks/useColors';
import { useTrendingStore } from '../store/trendingStore';
import { Avatar } from './Avatar';
import { RankBadge } from './RankBadge';
import { FounderBadge } from './FounderBadge';
import { Chip } from './Chip';
import { MiniStampIcon } from './MiniStampIcon';
import { FriendActivity } from './FriendActivity';
import * as Haptics from 'expo-haptics';

export function parseGradient(gradient: string): string[] {
  const matches = gradient.match(/#[0-9A-Fa-f]{3,8}/g);
  return matches ?? [Colors.primary, Colors.black];
}

const TRANSPORT_ICONS: Record<TransportMode, string> = {
  'Métro': 'train-outline',
  'Vélo': 'bicycle-outline',
  'À pied': 'walk-outline',
  'Voiture': 'car-outline',
  'Trottinette': 'flash-outline',
};

function getTransportIcon(mode: TransportMode): string {
  return TRANSPORT_ICONS[mode] ?? 'walk-outline';
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const BANNER_HEIGHT = Math.round(SCREEN_WIDTH * 0.76); // ~4:5 aspect

interface PlanCardProps {
  plan: Plan;
  isLiked: boolean;
  isSaved: boolean;
  index?: number;
  onPress: () => void;
  onLike: () => void;
  onSave: () => void;
  onComment: () => void;
  onAuthorPress: () => void;
}

export const PlanCard: React.FC<PlanCardProps> = ({
  plan,
  isLiked,
  isSaved,
  index = 0,
  onPress,
  onLike,
  onSave,
  onComment,
  onAuthorPress,
}) => {
  const C = useColors();
  const topTrendingTags = useTrendingStore((s) => s.topTags);
  const isTrending = plan.tags.some((t) => topTrendingTags.includes(t));
  const isNew = plan.createdAt ? (Date.now() - new Date(plan.createdAt).getTime()) < 6 * 60 * 60 * 1000 : false;
  const gradientColors = parseGradient(plan.gradient);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  // Collect photos: custom cover photos first, then Google Places photos as fallback
  const allPhotos: string[] = (() => {
    if (plan.coverPhotos && plan.coverPhotos.length > 0) return plan.coverPhotos;
    // Fallback: collect photos from places
    const placePhotos: string[] = [];
    for (const place of plan.places) {
      if (place.photoUrls) {
        for (const url of place.photoUrls) {
          placePhotos.push(url);
          if (placePhotos.length >= 7) break;
        }
      }
      if (placePhotos.length >= 7) break;
    }
    return placePhotos;
  })();

  const bannerWidth = SCREEN_WIDTH; // full-width edge-to-edge

  const handlePhotoScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / bannerWidth);
    setActivePhotoIndex(idx);
  };

  const likeScale = useRef(new Animated.Value(1)).current;
  const saveScale = useRef(new Animated.Value(1)).current;
  const cardScale = useRef(new Animated.Value(1)).current;
  const doubleTapHeartScale = useRef(new Animated.Value(0)).current;
  const doubleTapHeartOpacity = useRef(new Animated.Value(0)).current;
  const lastTapRef = useRef<number>(0);
  const [heartPos, setHeartPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const tapPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // ── Save flash + inline label ──
  const saveFlashOpacity = useRef(new Animated.Value(0)).current;
  const saveLabelOpacity = useRef(new Animated.Value(0)).current;
  const [showSaveLabel, setShowSaveLabel] = useState(false);

  // Emil: snappy spring — fast attack (high tension), quick settle (high friction)
  const animateBounce = (scale: Animated.Value) => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.25, useNativeDriver: true, friction: 4, tension: 300 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 200 }),
    ]).start();
  };

  // No card scale — flat feed, no card feel
  const onCardPressIn = () => {};
  const onCardPressOut = () => {};

  const handleBannerPressIn = (e: GestureResponderEvent) => {
    tapPosRef.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
  };

  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (!isLiked) onLike();
      animateBounce(likeScale);
      setHeartPos(tapPosRef.current);
      doubleTapHeartScale.setValue(0);
      doubleTapHeartOpacity.setValue(1);
      Animated.parallel([
        Animated.spring(doubleTapHeartScale, { toValue: 1, friction: 3, tension: 150, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(600),
          Animated.timing(doubleTapHeartOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      ]).start();
    }
    lastTapRef.current = now;
  };

  const handleLikePress = () => {
    animateBounce(likeScale);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onLike();
  };

  const handleSavePress = () => {
    // Pop + haptic
    Animated.sequence([
      Animated.spring(saveScale, { toValue: 1.4, useNativeDriver: true, friction: 3, tension: 400 }),
      Animated.spring(saveScale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 200 }),
    ]).start();
    Haptics.impactAsync(
      isSaved ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium
    );

    // Flash + inline label on save (not unsave)
    if (!isSaved) {
      // Flash circle behind icon
      saveFlashOpacity.setValue(0.45);
      Animated.timing(saveFlashOpacity, { toValue: 0, duration: 600, useNativeDriver: true }).start();

      // Inline "Sauvegardé !" label
      setShowSaveLabel(true);
      saveLabelOpacity.setValue(1);
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(saveLabelOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setShowSaveLabel(false));
    }

    onSave();
  };

  return (
    <ReAnimated.View entering={index < 6 ? FadeInUp.delay(index * 60).duration(400) : undefined}>
    <View style={[styles.card, { backgroundColor: C.white }]}>
      <View style={[styles.postSeparator, { backgroundColor: C.border }]} />
      <TouchableOpacity style={styles.userRow} activeOpacity={0.7} onPress={onAuthorPress}>
        <Avatar initials={plan.author.initials} bg={plan.author.avatarBg} color={plan.author.avatarColor} size="M" avatarUrl={plan.author.avatarUrl} />
        <View style={styles.userInfo}>
          <Text style={[styles.displayName, { color: C.black }]}>{plan.author.displayName}</Text>
          <Text style={[styles.timeAgo, { color: C.gray600 }]}>{plan.timeAgo}</Text>
        </View>
        {plan.author.isFounder && <FounderBadge small />}
        <RankBadge rank={getRankForProofs(plan.author.total_proof_validations ?? 0)} small />
      </TouchableOpacity>

      <TouchableOpacity style={styles.bannerWrap} activeOpacity={1} onPressIn={handleBannerPressIn} onPress={handleDoubleTap}>
        {allPhotos.length > 0 ? (
          <>
            <FlatList
              data={allPhotos}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handlePhotoScroll}
              scrollEventThrottle={16}
              keyExtractor={(_, i) => String(i)}
              style={styles.photoBanner}
              nestedScrollEnabled
              renderItem={({ item }) => (
                <View style={[styles.photoSlide, { width: bannerWidth }]}>
                  <Image source={{ uri: item }} style={styles.photoImage} />
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.55)']}
                    style={styles.photoOverlay}
                  />
                </View>
              )}
            />
            <View style={styles.photoTitleWrap} pointerEvents="none">
              <Text style={styles.bannerTitle} numberOfLines={2}>{plan.title}</Text>
            </View>
            {isNew && (
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>New</Text>
              </View>
            )}
            {allPhotos.length > 1 && (
              <View style={styles.photoDots} pointerEvents="none">
                {allPhotos.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.photoDot,
                      { backgroundColor: i === activePhotoIndex ? '#FFF' : 'rgba(255,255,255,0.4)' },
                    ]}
                  />
                ))}
              </View>
            )}
          </>
        ) : (
          <LinearGradient colors={gradientColors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
            <Text style={styles.bannerTitle} numberOfLines={2}>{plan.title}</Text>
            {isNew && (
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>New</Text>
              </View>
            )}
          </LinearGradient>
        )}
        {/* Double-tap heart overlay */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.doubleTapHeart,
            {
              left: heartPos.x - 35,
              top: heartPos.y - 35,
              opacity: doubleTapHeartOpacity,
              transform: [{ scale: doubleTapHeartScale }],
            },
          ]}
        >
          <Ionicons name="heart" size={70} color={Colors.primary} />
        </Animated.View>
      </TouchableOpacity>

      <TouchableOpacity activeOpacity={0.92} onPress={onPress} onPressIn={onCardPressIn} onPressOut={onCardPressOut} style={styles.contentArea}>
        {plan.tags.length > 0 && (
          <View style={styles.tagsRow}>
            {isTrending && (
              <View style={styles.trendingBadge}>
                <Text style={styles.trendingBadgeText}>🔥 Trending</Text>
              </View>
            )}
            {plan.tags.slice(0, 3).map((tag, index) => (
              <Chip key={tag} label={tag} variant={index === 0 ? 'filled-black' : 'filled-gray'} small />
            ))}
            {plan.places.some((p) => p.reservationRecommended) && (
              <Text style={styles.resvHint}>﹡ Réservation conseillée</Text>
            )}
          </View>
        )}

        {(plan.proofCount ?? 0) > 0 && (
          <View style={styles.proofRow}>
            <MiniStampIcon type="proof" size={16} />
            <Text style={styles.proofMainText}>+{plan.proofCount} proof</Text>
          </View>
        )}

        {plan.places.length > 0 && (
          <View style={styles.placesList}>
            {plan.places.slice(0, 3).map((place, index) => (
              <React.Fragment key={place.id}>
                {index > 0 && <View style={[styles.placeSeparator, { backgroundColor: C.border }]} />}
                <View style={styles.placeRow}>
                  <View style={[styles.placeIndex, { backgroundColor: C.primary + '18' }]}>
                    <Text style={[styles.placeIndexText, { color: C.primary }]}>{index === 2 && plan.places.length > 3 ? '3+' : index + 1}</Text>
                  </View>
                  <View style={styles.placeInfo}>
                    <Text style={[styles.placeName, { color: C.black }]} numberOfLines={1}>
                      {place.name}
                      {place.reservationRecommended && (
                        <Text style={{ color: Colors.primary, fontFamily: Fonts.serifBold }}> *</Text>
                      )}
                    </Text>
                    <Text style={[styles.placeType, { color: C.gray600 }]} numberOfLines={1}>{place.type}</Text>
                  </View>
                </View>
              </React.Fragment>
            ))}
          </View>
        )}

        <View style={styles.metaRow}>
          {plan.price.includes('Free') ? (
            <View style={[styles.metaPill, { backgroundColor: '#16a34a18' }]}>
              <Text style={[styles.metaItem, { color: '#16a34a', fontWeight: '700' }]}>Free ✦</Text>
            </View>
          ) : (
            <View style={[styles.metaPill, { backgroundColor: C.gray300 }]}>
              <Ionicons name="cash-outline" size={13} color={C.gold} style={{ marginRight: 4 }} />
              <Text style={[styles.metaItem, { color: C.gray800 }]}>{plan.price}</Text>
            </View>
          )}
          <View style={[styles.metaPill, { backgroundColor: C.gray300 }]}>
            <Ionicons name="hourglass-outline" size={13} color={C.gold} style={{ marginRight: 4 }} />
            <Text style={[styles.metaItem, { color: C.gray800 }]}>{plan.duration}</Text>
          </View>
          <View style={[styles.metaPill, { backgroundColor: C.gray300 }]}>
            <Ionicons name={getTransportIcon(plan.transport) as any} size={13} color={C.gold} style={{ marginRight: 4 }} />
            <Text style={[styles.metaItem, { color: C.gray800 }]}>{plan.transport}</Text>
          </View>
          <View style={[styles.metaPill, { backgroundColor: C.gray300 }]}>
            <Ionicons name="location-outline" size={13} color={C.gold} style={{ marginRight: 4 }} />
            <Text style={[styles.metaItem, { color: C.gray800 }]}>{plan.places.length} étapes</Text>
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.actionBar}>
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionButton} onPress={handleLikePress} activeOpacity={0.7}>
            <Animated.View style={{ transform: [{ scale: likeScale }] }}>
              <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={22} color={isLiked ? C.primary : C.gray600} />
            </Animated.View>
            <Text style={[styles.actionCount, { color: isLiked ? C.primary : C.gray700 }]}>{plan.likesCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={onComment} activeOpacity={0.7}>
            <Ionicons name="chatbubble-outline" size={20} color={C.gray600} />
            <Text style={[styles.actionCount, { color: C.gray700 }]}>{plan.commentsCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleSavePress} activeOpacity={0.7}>
            <View style={styles.saveIconWrap}>
              <Animated.View pointerEvents="none" style={[styles.saveFlash, { backgroundColor: C.primary, opacity: saveFlashOpacity }]} />
              <Animated.View style={{ transform: [{ scale: saveScale }] }}>
                <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={20} color={isSaved ? C.primary : C.gray600} />
              </Animated.View>
            </View>
            {showSaveLabel && (
              <Animated.Text style={[styles.saveLabel, { color: C.primary, opacity: saveLabelOpacity }]}>
                Sauvegardé !
              </Animated.Text>
            )}
          </TouchableOpacity>
          <View style={styles.actionSpacer} />
        </View>
        <FriendActivity plan={plan} />
      </View>
    </View>
    </ReAnimated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  postSeparator: { height: 1, marginTop: 4 },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 },
  userInfo: { flex: 1, marginLeft: 10, marginRight: 8 },
  displayName: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
  timeAgo: { fontSize: 11, marginTop: 1 },
  contentArea: { overflow: 'hidden' },
  bannerWrap: { overflow: 'hidden', position: 'relative' } as any,
  doubleTapHeart: { position: 'absolute', width: 70, height: 70, alignItems: 'center', justifyContent: 'center' },
  banner: { height: BANNER_HEIGHT, justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 18 },
  bannerTitle: { fontSize: 22, fontFamily: Fonts.serifBold, color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  photoBanner: { height: BANNER_HEIGHT },
  photoSlide: { height: BANNER_HEIGHT },
  photoImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 },
  photoTitleWrap: { position: 'absolute', bottom: 16, left: 16, right: 16 },
  photoDots: { position: 'absolute', bottom: 10, alignSelf: 'center', flexDirection: 'row', gap: 5 },
  photoDot: { width: 6, height: 6, borderRadius: 3 },
  newBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: Colors.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  newBadgeText: { fontSize: 11, fontFamily: Fonts.serifBold, color: '#FFF', letterSpacing: 0.5 },
  trendingBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF6B3520', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginRight: 6, marginBottom: 4 },
  trendingBadgeText: { fontSize: 11, fontFamily: Fonts.serifBold, color: '#FF6B35' },
  resvHint: { fontSize: 10, fontFamily: Fonts.serifMedium, color: '#C0392B', marginLeft: 4, alignSelf: 'center' },
  tagsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, overflow: 'hidden' },
  placesList: { paddingHorizontal: 14, paddingTop: 10 },
  placeSeparator: { height: 1, marginVertical: 6, marginLeft: 36 },
  placeRow: { flexDirection: 'row', alignItems: 'center' },
  placeIndex: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  placeIndexText: { fontSize: 11, fontWeight: '700' },
  placeInfo: { flex: 1 },
  placeName: { fontSize: 13, fontFamily: Fonts.serifSemiBold },
  placeType: { fontSize: 11, fontFamily: Fonts.serif, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, gap: 8 },
  metaPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  metaItem: { fontSize: 11, fontFamily: Fonts.serifMedium },
  actionBar: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10 },
  actionRow: { flexDirection: 'row', alignItems: 'center' },
  actionButton: { flexDirection: 'row', alignItems: 'center', marginRight: 20 },
  saveIconWrap: { position: 'relative', width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  saveFlash: { position: 'absolute', width: 32, height: 32, borderRadius: 16 },
  saveLabel: { fontSize: 12, fontFamily: Fonts.serifBold, marginLeft: 4 },
  actionCount: { fontSize: 14, fontFamily: Fonts.serifSemiBold, marginLeft: 6 },
  actionSpacer: { flex: 1 },
  proofRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, gap: 6 },
  proofMainText: { fontSize: 13, fontFamily: Fonts.serifBold, color: '#C8571A', letterSpacing: 0.2 },
});
