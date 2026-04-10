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

  const bannerWidth = Dimensions.get('window').width - Layout.screenPadding * 2 - 24; // card padding

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

  // Emil: scale(0.98) on press — instant feedback, card feels alive
  const onCardPressIn = () => {
    Animated.timing(cardScale, { toValue: 0.98, duration: 120, useNativeDriver: true }).start();
  };
  const onCardPressOut = () => {
    Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 200 }).start();
  };

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
    <Animated.View
      style={[styles.card, { backgroundColor: C.gray200, borderColor: C.border, transform: [{ scale: cardScale }] }]}
    >
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
              <Text style={styles.bannerTitle}>{plan.title}</Text>
            </View>
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
            <Text style={styles.bannerTitle}>{plan.title}</Text>
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

      <TouchableOpacity activeOpacity={0.92} onPress={onPress} onPressIn={onCardPressIn} onPressOut={onCardPressOut}>
        {plan.tags.length > 0 && (
          <View style={styles.tagsRow}>
            {isTrending && (
              <View style={styles.trendingBadge}>
                <Text style={styles.trendingBadgeText}>🔥 Trending</Text>
              </View>
            )}
            {plan.tags.map((tag, index) => (
              <Chip key={tag} label={tag} variant={index === 0 ? 'filled-black' : 'filled-gray'} small />
            ))}
          </View>
        )}

        {plan.places.length > 0 && (
          <View style={styles.placesList}>
            {plan.places.map((place, index) => (
              <React.Fragment key={place.id}>
                {index > 0 && <View style={[styles.placeSeparator, { backgroundColor: C.border }]} />}
                <View style={styles.placeRow}>
                  <View style={[styles.placeIndex, { backgroundColor: C.primary + '18' }]}>
                    <Text style={[styles.placeIndexText, { color: C.primary }]}>{index + 1}</Text>
                  </View>
                  <View style={styles.placeInfo}>
                    <Text style={[styles.placeName, { color: C.black }]}>{place.name}</Text>
                    <Text style={[styles.placeType, { color: C.gray600 }]}>{place.type}</Text>
                  </View>
                </View>
              </React.Fragment>
            ))}
          </View>
        )}

        <View style={[styles.metaRow, { borderTopColor: C.border }]}>
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
        </View>
      </TouchableOpacity>

      <View style={[styles.actionBar, { borderTopColor: C.border }]}>
        <TouchableOpacity style={styles.actionButton} onPress={handleLikePress} activeOpacity={0.7}>
          <Animated.View style={{ transform: [{ scale: likeScale }] }}>
            <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={18} color={isLiked ? C.primary : C.gray600} />
          </Animated.View>
          <Text style={[styles.actionCount, { color: isLiked ? C.primary : C.gray700 }]}>{plan.likesCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={onComment} activeOpacity={0.7}>
          <Ionicons name="chatbubble-outline" size={16} color={C.gray600} />
          <Text style={[styles.actionCount, { color: C.gray700 }]}>{plan.commentsCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleSavePress} activeOpacity={0.7}>
          <View style={styles.saveIconWrap}>
            <Animated.View pointerEvents="none" style={[styles.saveFlash, { backgroundColor: C.primary, opacity: saveFlashOpacity }]} />
            <Animated.View style={{ transform: [{ scale: saveScale }] }}>
              <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={16} color={isSaved ? C.primary : C.gray600} />
            </Animated.View>
          </View>
          {showSaveLabel && (
            <Animated.Text style={[styles.saveLabel, { color: C.primary, opacity: saveLabelOpacity }]}>
              Sauvegardé !
            </Animated.Text>
          )}
        </TouchableOpacity>
        <View style={styles.actionSpacer} />
        {((plan.proofCount ?? 0) > 0 || (plan.declinedCount ?? 0) > 0) && (
          <View style={styles.proofStats}>
            <MiniStampIcon type="proof" size={14} />
            <Text style={styles.proofCountText}>{plan.proofCount ?? 0}</Text>
            <MiniStampIcon type="declined" size={14} />
            <Text style={styles.declinedCountText}>{plan.declinedCount ?? 0}</Text>
          </View>
        )}
      </View>
    </Animated.View>
    </ReAnimated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: Layout.cardRadius,
    marginHorizontal: Layout.screenPadding,
    marginBottom: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  userInfo: { flex: 1, marginLeft: 10, marginRight: 8 },
  displayName: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
  timeAgo: { fontSize: 11, marginTop: 1 },
  bannerWrap: { marginHorizontal: 12, borderRadius: 14, overflow: 'hidden', position: 'relative' } as any,
  doubleTapHeart: { position: 'absolute', width: 70, height: 70, alignItems: 'center', justifyContent: 'center' },
  banner: { height: 180, justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 16 },
  bannerTitle: { fontSize: 20, fontFamily: Fonts.serifBold, color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  photoBanner: { height: 180 },
  photoSlide: { height: 180 },
  photoImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 },
  photoTitleWrap: { position: 'absolute', bottom: 14, left: 16, right: 16 },
  photoDots: { position: 'absolute', bottom: 8, alignSelf: 'center', flexDirection: 'row', gap: 5 },
  photoDot: { width: 6, height: 6, borderRadius: 3 },
  trendingBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF6B3520', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginRight: 6, marginBottom: 4 },
  trendingBadgeText: { fontSize: 11, fontFamily: Fonts.serifBold, color: '#FF6B35' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingTop: 12 },
  placesList: { paddingHorizontal: 16, paddingTop: 12 },
  placeSeparator: { height: 1, marginVertical: 6, marginLeft: 36 },
  placeRow: { flexDirection: 'row', alignItems: 'center' },
  placeIndex: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  placeIndexText: { fontSize: 11, fontWeight: '700' },
  placeInfo: { flex: 1 },
  placeName: { fontSize: 13, fontFamily: Fonts.serifSemiBold },
  placeType: { fontSize: 11, fontFamily: Fonts.serif, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 8, borderTopWidth: 1 },
  metaPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  metaItem: { fontSize: 11, fontFamily: Fonts.serifMedium },
  actionBar: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
  actionButton: { flexDirection: 'row', alignItems: 'center', marginRight: 18 },
  saveIconWrap: { position: 'relative', width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  saveFlash: { position: 'absolute', width: 28, height: 28, borderRadius: 14 },
  saveLabel: { fontSize: 11, fontFamily: Fonts.serifBold, marginLeft: 4 },
  actionCount: { fontSize: 12, fontFamily: Fonts.serifSemiBold, marginLeft: 5 },
  actionSpacer: { flex: 1 },
  proofStats: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  proofCountText: { fontSize: 11, fontFamily: Fonts.serifSemiBold, color: '#C8571A' },
  declinedCountText: { fontSize: 11, fontFamily: Fonts.serifSemiBold, color: '#6B7A8D' },
});
