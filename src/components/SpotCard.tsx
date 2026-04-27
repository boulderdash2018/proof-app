import React, { useRef, useState, useCallback } from 'react';
import {
  Animated,
  StyleSheet,
  View,
  Text,
  Image,
  Pressable,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Colors, Fonts } from '../constants';
import { Avatar } from './Avatar';
import { Spot } from '../types';
import { useAuthStore } from '../store';
import { useSavedPlacesStore } from '../store/savedPlacesStore';
import { toggleSaveSpot } from '../services/spotsService';

interface Props {
  spot: Spot;
}

/**
 * SpotCard — la carte qui se retourne.
 *
 * Format secondaire au Plan, plus petit visuellement (~220 px de haut),
 * tonalité crème claire au lieu du hero plein-format des Plans.
 *
 * Mécanique d'interaction (très précise pour ne pas se marcher dessus) :
 *   • Tap sur la zone neutre du card (photo, footer, fond)  → FLIP
 *   • Tap sur le titre du lieu                              → PlaceDetail modal
 *   • Tap sur le bouton ★ (front, top-right)                → toggle save (UN tap)
 *   • Tap sur "+ Ajouter aux favoris" (back)                → toggle save (UN tap)
 *   • Tap sur "Voir le lieu →" (back)                       → PlaceDetail modal
 *
 * Le save fait DEUX choses en une action :
 *   1. arrayUnion/Remove dans `savedByIds` du Spot (signal social)
 *   2. add/remove dans SavedPlacesStore (favoris du user)
 *
 * Cohérent avec l'intent : "j'aime sa reco, je veux y aller".
 *
 * Animation : rotateY 0→180° avec spring. opacity de chaque face
 * croise au mid-flip (RN-Web n'a pas de backfaceVisibility fiable).
 */
export const SpotCard: React.FC<Props> = ({ spot }) => {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);

  const savedPlaces = useSavedPlacesStore((s) => s.places);
  const savePlaceToFavs = useSavedPlacesStore((s) => s.savePlace);
  const unsavePlaceFromFavs = useSavedPlacesStore((s) => s.unsavePlace);

  // ── Local state : "are we showing the back face right now?" ──
  // Source-of-truth pour le rendu ; flip est la valeur animée.
  const [flipped, setFlipped] = useState(false);
  const flip = useRef(new Animated.Value(0)).current;

  const toggleFlip = useCallback(() => {
    const next = !flipped;
    setFlipped(next);
    Animated.spring(flip, {
      toValue: next ? 1 : 0,
      friction: 9,
      tension: 70,
      useNativeDriver: true,
    }).start();
  }, [flipped, flip]);

  // ── Save state — dérivé de SavedPlacesStore (la source qui compte
  //    pour l'utilisateur). Le savedByIds du spot est un signal global
  //    mais le store local reste la vérité pour l'état "★ filled". ──
  const isSaved = savedPlaces.some(
    (p) => p.placeId === spot.googlePlaceId,
  );

  const handleToggleSave = useCallback(async () => {
    if (!user?.id) return;
    if (isSaved) {
      // Off : on retire des favoris locaux ET on dé-incrémente le spot.
      unsavePlaceFromFavs(spot.googlePlaceId);
      toggleSaveSpot(spot.id, user.id, false).catch(() => {});
    } else {
      // On : ajoute aux favoris (avec les métadonnées Google) ET incrémente le spot.
      savePlaceToFavs({
        placeId: spot.googlePlaceId,
        name: spot.placeName,
        address: spot.placeAddress || '',
        types: spot.placeCategory ? [spot.placeCategory] : [],
        rating: 0,
        reviewCount: 0,
        photoUrl: spot.photoUrl || null,
        savedAt: Date.now(),
      });
      toggleSaveSpot(spot.id, user.id, true).catch(() => {});
    }
  }, [user?.id, isSaved, spot, savePlaceToFavs, unsavePlaceFromFavs]);

  const handleOpenPlace = useCallback(() => {
    navigation.navigate('PlaceDetail', { googlePlaceId: spot.googlePlaceId });
  }, [navigation, spot.googlePlaceId]);

  // ── Animated values ──
  const frontRotate = flip.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const backRotate = flip.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });
  // Crossfade trick au mid-flip — RN-Web n'honore pas backfaceVisibility.
  const frontOpacity = flip.interpolate({
    inputRange: [0, 0.49, 0.5, 1],
    outputRange: [1, 1, 0, 0],
  });
  const backOpacity = flip.interpolate({
    inputRange: [0, 0.5, 0.51, 1],
    outputRange: [0, 0, 1, 1],
  });

  // ── Display helpers ──
  const meta = formatPlaceMeta(spot.placeCategory, spot.placeAddress);
  const recommenderFirstName =
    (spot.recommenderName || spot.recommenderUsername || '').split(' ')[0] || 'Quelqu\'un';
  const savedCount = (spot.savedByIds?.length || 0)
    + (isSaved && !spot.savedByIds?.includes(user?.id || '') ? 1 : 0);

  return (
    <View style={styles.wrap}>
      {/* ╔═══════════════════════════════════════════════════════════
          FRONT FACE — photo + titre overlay + actions
          ═══════════════════════════════════════════════════════════ */}
      <Animated.View
        style={[
          styles.face,
          {
            transform: [{ perspective: 1000 }, { rotateY: frontRotate }],
            opacity: frontOpacity,
          },
        ]}
        pointerEvents={flipped ? 'none' : 'auto'}
      >
        <Pressable onPress={toggleFlip} style={styles.cardInner}>
          {/* Eyebrow strip — distingue clairement Spot vs Plan */}
          <View style={styles.eyebrowStrip}>
            <View style={styles.dotLive} />
            <Text style={styles.eyebrowLabel}>SPOT · recommandé par {recommenderFirstName}</Text>
            <TouchableOpacity
              onPress={handleToggleSave}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.starBtn}
            >
              <Ionicons
                name={isSaved ? 'star' : 'star-outline'}
                size={18}
                color={isSaved ? Colors.gold : Colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {/* Hero image */}
          <View style={styles.hero}>
            {spot.photoUrl ? (
              <Image source={{ uri: spot.photoUrl }} style={styles.heroImage} />
            ) : (
              <LinearGradient
                colors={[Colors.terracotta300, Colors.terracotta700]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            )}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.78)']}
              locations={[0, 0.45, 1]}
              style={styles.heroFade}
            />

            {/* Tap zone DÉDIÉE pour le titre — propage pas au flip */}
            <Pressable
              onPress={handleOpenPlace}
              style={styles.heroTitleZone}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.heroTitle} numberOfLines={1}>
                {spot.placeName}
              </Text>
              {meta && (
                <Text style={styles.heroMeta} numberOfLines={1}>
                  {meta}
                </Text>
              )}
            </Pressable>
          </View>

          {/* Footer — saved count + flip hint */}
          <View style={styles.footer}>
            <Text style={styles.footerSaved}>
              {savedCount > 0
                ? `${savedCount} ${savedCount > 1 ? 'ont' : 'a'} sauvegardé`
                : 'Sois le premier à sauvegarder'}
            </Text>
            <View style={styles.flipHintRow}>
              <Text style={styles.flipHint}>la phrase de {recommenderFirstName}</Text>
              <Ionicons name="sync" size={12} color={Colors.primary} />
            </View>
          </View>
        </Pressable>
      </Animated.View>

      {/* ╔═══════════════════════════════════════════════════════════
          BACK FACE — quote + actions
          ═══════════════════════════════════════════════════════════ */}
      <Animated.View
        style={[
          styles.face,
          styles.faceAbsolute,
          {
            transform: [{ perspective: 1000 }, { rotateY: backRotate }],
            opacity: backOpacity,
          },
        ]}
        pointerEvents={flipped ? 'auto' : 'none'}
      >
        <Pressable onPress={toggleFlip} style={[styles.cardInner, styles.backInner]}>
          {/* Header — recommandeur + close × */}
          <View style={styles.backHeader}>
            <View style={styles.backHeaderActor}>
              <Avatar
                initials={spot.recommenderInitials}
                bg={spot.recommenderAvatarBg}
                color={spot.recommenderAvatarColor}
                size="S"
                avatarUrl={spot.recommenderAvatarUrl ?? undefined}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.backHeaderName} numberOfLines={1}>
                  {spot.recommenderName || `@${spot.recommenderUsername}`}
                </Text>
                <Text style={styles.backHeaderTime} numberOfLines={1}>
                  {spot.timeAgo}
                </Text>
              </View>
            </View>
            <View style={styles.flipBack}>
              <Ionicons name="sync" size={14} color={Colors.textTertiary} />
            </View>
          </View>

          {/* Quote — l'élément éditorial fort */}
          <View style={styles.quoteWrap}>
            <Text style={styles.quoteOpen}>“</Text>
            <Text style={styles.quoteText}>{spot.quote}</Text>
          </View>

          {/* Actions — favoris + voir le lieu */}
          <View style={styles.backActions}>
            <TouchableOpacity
              onPress={handleToggleSave}
              activeOpacity={0.85}
              style={[styles.btnPrimary, isSaved && styles.btnPrimarySaved]}
            >
              <Ionicons
                name={isSaved ? 'star' : 'star-outline'}
                size={15}
                color={isSaved ? Colors.gold : Colors.textOnAccent}
              />
              <Text style={styles.btnPrimaryText}>
                {isSaved
                  ? 'Retirer des favoris'
                  : `Ajouter ${truncate(spot.placeName, 18)} aux favoris`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleOpenPlace}
              activeOpacity={0.7}
              style={styles.btnGhost}
            >
              <Text style={styles.btnGhostText}>Voir le lieu en détail</Text>
              <Ionicons name="arrow-forward" size={13} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// Helpers — format meta + truncate
// ══════════════════════════════════════════════════════════════

const CATEGORIES_FR: Record<string, string> = {
  restaurant: 'Restaurant',
  cafe: 'Café',
  bar: 'Bar',
  bakery: 'Boulangerie',
  pastry_shop: 'Pâtisserie',
  museum: 'Musée',
  art_gallery: 'Galerie',
  park: 'Parc',
  bookstore: 'Librairie',
  movie_theater: 'Cinéma',
  night_club: 'Club',
  food: 'Restaurant',
  meal_takeaway: 'Restaurant',
  meal_delivery: 'Restaurant',
  point_of_interest: 'Lieu',
  tourist_attraction: 'Attraction',
  store: 'Boutique',
  clothing_store: 'Boutique',
  shopping_mall: 'Centre commercial',
  spa: 'Spa',
  gym: 'Salle de sport',
  library: 'Bibliothèque',
  church: 'Église',
};

function formatPlaceCategory(raw?: string): string | null {
  if (!raw) return null;
  const fr = CATEGORIES_FR[raw.toLowerCase()];
  if (fr) return fr;
  const cleaned = raw.replace(/_/g, ' ').toLowerCase();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function extractArrondissement(address?: string): string | null {
  if (!address) return null;
  const m = address.match(/\b75(\d{3})\b/);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  if (num < 1 || num > 20) return null;
  return num === 1 ? '1er' : `${num}e`;
}

function formatPlaceMeta(category?: string, address?: string): string | null {
  const cat = formatPlaceCategory(category);
  const arr = extractArrondissement(address);
  const parts = [cat, arr].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(' · ') : null;
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1).trimEnd() + '…';
}

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

// Hauteur alignée sur les Plans dans le feed (~même poids visuel) —
// la différenciation vient du flip mechanic, du strip eyebrow "SPOT"
// et du footer custom, PAS d'être plus petit.
const CARD_HEIGHT = 320;

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 14,
    marginVertical: 8,
    height: CARD_HEIGHT,
    // perspective parent — donne une vraie profondeur 3D au flip
  },
  face: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Colors.bgSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  faceAbsolute: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  cardInner: {
    flex: 1,
  },

  // ── Front face ──
  eyebrowStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: Colors.terracotta50,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.terracotta200,
  },
  dotLive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  eyebrowLabel: {
    flex: 1,
    fontSize: 10.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: Colors.primary,
  },
  starBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -4, // visual recenter into the strip
  },

  hero: {
    flex: 1,
    backgroundColor: Colors.bgTertiary,
    position: 'relative',
    justifyContent: 'flex-end',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  heroFade: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: 110,
  },
  heroTitleZone: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  heroTitle: {
    fontSize: 19,
    fontFamily: Fonts.displaySemiBold,
    color: '#FFF',
    letterSpacing: -0.3,
    lineHeight: 22,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  heroMeta: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 3,
    letterSpacing: 0.1,
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: Colors.bgSecondary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
  },
  footerSaved: {
    fontSize: 11.5,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
    letterSpacing: 0.05,
  },
  flipHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  flipHint: {
    fontSize: 11,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    color: Colors.primary,
    letterSpacing: 0.1,
  },

  // ── Back face ──
  backInner: {
    padding: 16,
    justifyContent: 'space-between',
  },
  backHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  backHeaderActor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
    minWidth: 0,
  },
  backHeaderName: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.05,
  },
  backHeaderTime: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  flipBack: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgTertiary,
  },

  quoteWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  quoteOpen: {
    position: 'absolute',
    top: -10,
    left: -4,
    fontSize: 72,
    lineHeight: 72,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.terracotta200,
  },
  quoteText: {
    paddingLeft: 28,
    paddingTop: 6,
    fontSize: 19,
    lineHeight: 27,
    fontFamily: Fonts.displayItalic,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },

  backActions: {
    gap: 8,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primaryDeep,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 3,
  },
  btnPrimarySaved: {
    backgroundColor: Colors.textPrimary,
  },
  btnPrimaryText: {
    fontSize: 13.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
    letterSpacing: -0.05,
  },
  btnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
  },
  btnGhostText: {
    fontSize: 12.5,
    fontFamily: Fonts.bodyMedium,
    color: Colors.primary,
    letterSpacing: 0.05,
  },
});
