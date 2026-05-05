import React, { useCallback } from 'react';
import {
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
  /** Width imposée par le feed (== ImmersiveCard pour cohérence).
   *  Optionnelle — si absent (cas profil / preview création), fallback
   *  sur 100% conteneur via flex/width style. */
  width?: number;
  /** Hauteur imposée. Optionnelle — fallback 520px si non fournie. */
  height?: number;
}

// ──────────────────────────────────────────────────────────────
// Constantes — alignées sur ImmersiveCard pour avoir EXACTEMENT le
// même format que les cards Plan dans le feed.
// ──────────────────────────────────────────────────────────────
const CARD_H_PAD = 14;
const CARD_V_TOP = 6;
const CARD_V_BOTTOM = 8;
const CARD_RADIUS = 22;
// Le contour terracotta est le SEUL différenciateur visuel d'avec
// les Plans (en plus du badge spot top-left). Volontairement
// discret — visible mais pas criard.
const SPOT_BORDER_COLOR = Colors.primary;
const SPOT_BORDER_WIDTH = 2.5;

/**
 * SpotCard — full-bleed dans le feed (même taille que ImmersiveCard).
 *
 * Le format précédent (carte 320px qui flippait) a été retiré :
 *   • Au feed level, 1 spot = 1 carte plein écran comme un plan, c'est
 *     l'esprit éditorial Proof (pas de format secondaire qui paraisse
 *     sous-traité).
 *   • Différenciation visuelle vs un Plan : contour terracotta 2.5px
 *     autour de la card + badge rond terracotta 'spot' top-left.
 *   • Tap sur la photo → PlaceDetail (pas de flip).
 *   • Tap sur ★ top-right → toggle favoris (idem ImmersiveCard).
 *
 * Le savedByIds Firestore + le SavedPlacesStore local sont liés :
 *   • savePlace local → arrayUnion sur le spot (signal social)
 *   • unsave local    → arrayRemove sur le spot
 */
export const SpotCard: React.FC<Props> = ({ spot, width, height = 520 }) => {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);

  const savedPlaces = useSavedPlacesStore((s) => s.places);
  const savePlaceToFavs = useSavedPlacesStore((s) => s.savePlace);
  const unsavePlaceFromFavs = useSavedPlacesStore((s) => s.unsavePlace);

  const isSaved = savedPlaces.some((p) => p.placeId === spot.googlePlaceId);

  const handleToggleSave = useCallback(async () => {
    if (!user?.id) return;
    if (isSaved) {
      unsavePlaceFromFavs(spot.googlePlaceId);
      toggleSaveSpot(spot.id, user.id, false).catch(() => {});
    } else {
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

  // Card height = available - paddings (mêmes valeurs que ImmersiveCard
  // pour qu'un Plan et un Spot fassent rigoureusement la même surface).
  const cardH = height - CARD_V_TOP - CARD_V_BOTTOM;
  const meta = formatPlaceMeta(spot.placeCategory, spot.placeAddress);
  const recommenderFirstName =
    (spot.recommenderName || spot.recommenderUsername || '').split(' ')[0] || 'Quelqu\'un';

  return (
    <View style={[styles.frame, width != null ? { width, height } : { width: '100%', height }]}>
      <View style={[styles.card, { height: cardH }]}>
        {/* Photo full-bleed */}
        <Pressable onPress={handleOpenPlace} style={StyleSheet.absoluteFillObject}>
          {spot.photoUrl ? (
            <Image source={{ uri: spot.photoUrl }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={[Colors.terracotta300, Colors.terracotta500]}
              style={StyleSheet.absoluteFillObject}
            />
          )}
          {/* Gradient bas pour lisibilité du texte */}
          <LinearGradient
            colors={['transparent', 'rgba(44, 36, 32, 0.0)', 'rgba(44, 36, 32, 0.85)']}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          {/* Mini gradient haut pour lisibilité du badge spot */}
          <LinearGradient
            colors={['rgba(44, 36, 32, 0.45)', 'transparent']}
            locations={[0, 0.5]}
            style={styles.topFade}
            pointerEvents="none"
          />
        </Pressable>

        {/* Badge type "spot" — terracotta rond, top-left, discret */}
        <View style={styles.typeBadge} pointerEvents="none">
          <Ionicons name="location" size={11} color={Colors.textOnAccent} />
          <Text style={styles.typeBadgeText}>SPOT</Text>
        </View>

        {/* Bouton ★ favoris — top-right */}
        <TouchableOpacity
          onPress={handleToggleSave}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.starBtn}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isSaved ? 'star' : 'star-outline'}
            size={18}
            color={isSaved ? Colors.gold : '#FFF'}
          />
        </TouchableOpacity>

        {/* Bottom content overlay — auteur + quote + nom du lieu */}
        <View style={styles.bottomOverlay} pointerEvents="box-none">
          {/* Auteur */}
          <TouchableOpacity
            style={styles.authorRow}
            onPress={() => navigation.navigate('OtherProfile', { userId: spot.recommenderId })}
            activeOpacity={0.8}
          >
            <Avatar
              avatarUrl={spot.recommenderAvatarUrl ?? undefined}
              bg={spot.recommenderAvatarBg}
              color={spot.recommenderAvatarColor}
              initials={spot.recommenderInitials}
              size="S"
            />
            <Text style={styles.authorText}>
              recommandé par <Text style={styles.authorName}>{recommenderFirstName}</Text>
            </Text>
          </TouchableOpacity>

          {/* Quote — la phrase qui rend le spot unique */}
          {!!spot.quote && (
            <View style={styles.quoteWrap}>
              <Text style={styles.quoteMark}>&ldquo;</Text>
              <Text style={styles.quoteText} numberOfLines={3}>
                {spot.quote}
              </Text>
            </View>
          )}

          {/* Nom du lieu cliquable — ouvre PlaceDetail */}
          <Pressable onPress={handleOpenPlace} style={styles.placeBlock}>
            <Text style={styles.placeName} numberOfLines={1}>{spot.placeName}</Text>
            {!!meta && (
              <Text style={styles.placeMeta} numberOfLines={1}>{meta}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// Helpers — réutilisés des anciennes versions
// ══════════════════════════════════════════════════════════════

const CATEGORIES_FR: Record<string, string> = {
  restaurant: 'Restaurant',
  cafe: 'Café',
  bar: 'Bar',
  bakery: 'Boulangerie',
  museum: 'Musée',
  art_gallery: 'Galerie',
  park: 'Parc',
  night_club: 'Club',
  movie_theater: 'Cinéma',
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

// ══════════════════════════════════════════════════════════════
// Styles — alignés sur ImmersiveCard (mêmes paddings, mêmes radius)
// + contour terracotta + badge spot.
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  frame: {
    paddingHorizontal: CARD_H_PAD,
    paddingTop: CARD_V_TOP,
    paddingBottom: CARD_V_BOTTOM,
  },
  card: {
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: '#000',
    // Le contour terracotta — différenciateur visuel des Spots vs Plans
    borderWidth: SPOT_BORDER_WIDTH,
    borderColor: SPOT_BORDER_COLOR,
  },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
  },

  // Badge type "spot" — top-left, rond, discret
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
    backgroundColor: Colors.primary,
  },
  typeBadgeText: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    color: Colors.textOnAccent,
  },

  // Bouton ★ favoris — top-right
  starBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(44, 36, 32, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Bottom content
  bottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 22,
    paddingBottom: 26,
    paddingTop: 40,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  authorText: {
    fontSize: 12.5,
    fontFamily: Fonts.body,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  authorName: {
    fontFamily: Fonts.bodySemiBold,
    color: '#FFF',
  },

  quoteWrap: {
    marginBottom: 14,
  },
  quoteMark: {
    fontSize: 38,
    lineHeight: 32,
    fontFamily: Fonts.displaySemiBoldItalic,
    color: Colors.primary,
    marginBottom: -8,
  },
  quoteText: {
    fontSize: 18,
    fontFamily: Fonts.displayItalic,
    color: '#FFF',
    lineHeight: 25,
    letterSpacing: -0.1,
  },

  placeBlock: {
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.25)',
  },
  placeName: {
    fontSize: 22,
    fontFamily: Fonts.displaySemiBold,
    color: '#FFF',
    letterSpacing: -0.4,
  },
  placeMeta: {
    fontSize: 11.5,
    fontFamily: Fonts.bodySemiBold,
    color: 'rgba(255, 255, 255, 0.75)',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: 3,
  },
});
