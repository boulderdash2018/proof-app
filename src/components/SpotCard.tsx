import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Linking,
  Platform,
  StyleSheet,
  View,
  Text,
  Image,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
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
import { getPlaceDetails, GooglePlaceDetails } from '../services/googlePlacesService';

interface Props {
  spot: Spot;
  /** Width imposée par le feed (== ImmersiveCard pour cohérence). */
  width?: number;
  /** Hauteur imposée. Default 520 hors-feed. */
  height?: number;
}

// ──────────────────────────────────────────────────────────────
// Constantes — alignées sur ImmersiveCard
// ──────────────────────────────────────────────────────────────
const CARD_H_PAD = 14;
const CARD_V_TOP = 6;
const CARD_V_BOTTOM = 8;
const CARD_RADIUS = 22;
const SPOT_BORDER_COLOR = Colors.primary;
const SPOT_BORDER_WIDTH = 2.5;

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';

/** Build une URL Google Static Maps avec un marker rouge centré sur lat/lng.
 *  Le DPI 2 garde la qualité retina sans doubler le coût (Google compte 1
 *  appel par fetch, peu importe scale). */
const buildStaticMapUrl = (lat: number, lng: number, w: number, h: number): string => {
  const size = `${Math.round(w)}x${Math.round(h)}`;
  return (
    `https://maps.googleapis.com/maps/api/staticmap?` +
    `center=${lat},${lng}` +
    `&zoom=15&size=${size}&scale=2` +
    `&markers=color:0xC4704B%7C${lat},${lng}` +
    `&style=feature:poi%7Cvisibility:simplified` +
    `&key=${GOOGLE_MAPS_API_KEY}`
  );
};

/**
 * SpotCard — full-bleed dans le feed (== taille ImmersiveCard) avec flip.
 *
 * FRONT : photo + auteur + quote + nom du lieu (look éditorial Proof).
 * BACK  : détails Google Places (rating, adresse, horaires, téléphone) +
 *         mini-map static + bouton "Voir le lieu" → PlaceDetail modal.
 *
 * Mécanique :
 *   • Tap zone neutre photo (front) → FLIP vers back
 *   • Tap ← (back top-left)         → FLIP retour vers front
 *   • Tap nom du lieu (front)       → ouvre PlaceDetail (sans flip)
 *   • Tap ★ (front top-right)       → toggle favoris
 *   • Tap badge SPOT (front top-left) — décoratif (pointerEvents:'none')
 *
 * Différenciation visuelle vs un Plan : contour terracotta 2.5px autour
 * de la card + badge rond 'SPOT' top-left. Pas de contour côté back
 * non plus — la frame avec border englobe les 2 faces.
 */
export const SpotCard: React.FC<Props> = ({ spot, width, height = 520 }) => {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);

  const savedPlaces = useSavedPlacesStore((s) => s.places);
  const savePlaceToFavs = useSavedPlacesStore((s) => s.savePlace);
  const unsavePlaceFromFavs = useSavedPlacesStore((s) => s.unsavePlace);

  const isSaved = savedPlaces.some((p) => p.placeId === spot.googlePlaceId);

  // ── Flip animation ──
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

  // ── Lazy fetch des détails Google quand on flippe la 1ère fois ──
  const [details, setDetails] = useState<GooglePlaceDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  useEffect(() => {
    if (!flipped || details || loadingDetails || !spot.googlePlaceId) return;
    setLoadingDetails(true);
    getPlaceDetails(spot.googlePlaceId)
      .then((d) => setDetails(d))
      .catch((err) => console.warn('[SpotCard] getPlaceDetails error:', err))
      .finally(() => setLoadingDetails(false));
  }, [flipped, details, loadingDetails, spot.googlePlaceId]);

  // ── Save toggle ──
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
        rating: details?.rating || 0,
        reviewCount: details?.reviewCount || 0,
        photoUrl: spot.photoUrl || null,
        savedAt: Date.now(),
      });
      toggleSaveSpot(spot.id, user.id, true).catch(() => {});
    }
  }, [user?.id, isSaved, spot, details, savePlaceToFavs, unsavePlaceFromFavs]);

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
  // Crossfade au mid-flip — RN-Web n'honore pas backfaceVisibility de
  // manière fiable, on utilise opacity pour cacher la face de derrière.
  const frontOpacity = flip.interpolate({
    inputRange: [0, 0.49, 0.5, 1],
    outputRange: [1, 1, 0, 0],
  });
  const backOpacity = flip.interpolate({
    inputRange: [0, 0.5, 0.51, 1],
    outputRange: [0, 0, 1, 1],
  });

  const cardH = height - CARD_V_TOP - CARD_V_BOTTOM;
  const meta = formatPlaceMeta(spot.placeCategory, spot.placeAddress);
  const recommenderFirstName =
    (spot.recommenderName || spot.recommenderUsername || '').split(' ')[0] || 'Quelqu\'un';

  return (
    <View style={[styles.frame, width != null ? { width, height } : { width: '100%', height }]}>
      <View style={[styles.card, { height: cardH }]}>
        {/* ╔═══════════════════════════════════════════════════
            FRONT — photo + quote + nom du lieu
            ═══════════════════════════════════════════════════ */}
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              transform: [{ perspective: 1000 }, { rotateY: frontRotate }],
              opacity: frontOpacity,
              backfaceVisibility: 'hidden',
            },
          ]}
          pointerEvents={flipped ? 'none' : 'auto'}
        >
          {/* Photo + tap pour flipper */}
          <Pressable onPress={toggleFlip} style={StyleSheet.absoluteFillObject}>
            {spot.photoUrl ? (
              <Image source={{ uri: spot.photoUrl }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
            ) : (
              <LinearGradient
                colors={[Colors.terracotta300, Colors.terracotta500]}
                style={StyleSheet.absoluteFillObject}
              />
            )}
            <LinearGradient
              colors={['transparent', 'rgba(44, 36, 32, 0.0)', 'rgba(44, 36, 32, 0.85)']}
              locations={[0, 0.45, 1]}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
            <LinearGradient
              colors={['rgba(44, 36, 32, 0.45)', 'transparent']}
              locations={[0, 0.5]}
              style={styles.topFade}
              pointerEvents="none"
            />
          </Pressable>

          {/* Badge SPOT — top-left */}
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

          {/* Hint flip — bas centre, discret, indique qu'on peut retourner */}
          <View style={styles.flipHint} pointerEvents="none">
            <Ionicons name="sync-outline" size={11} color="rgba(255,255,255,0.65)" />
            <Text style={styles.flipHintText}>Tape pour voir les détails</Text>
          </View>

          {/* Bottom overlay */}
          <View style={styles.bottomOverlay} pointerEvents="box-none">
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

            {!!spot.quote && (
              <View style={styles.quoteWrap}>
                <Text style={styles.quoteMark}>&ldquo;</Text>
                <Text style={styles.quoteText} numberOfLines={3}>
                  {spot.quote}
                </Text>
              </View>
            )}

            <Pressable onPress={handleOpenPlace} style={styles.placeBlock}>
              <Text style={styles.placeName} numberOfLines={1}>{spot.placeName}</Text>
              {!!meta && (
                <Text style={styles.placeMeta} numberOfLines={1}>{meta}</Text>
              )}
            </Pressable>
          </View>
        </Animated.View>

        {/* ╔═══════════════════════════════════════════════════
            BACK — détails Google Places + mini-map
            ═══════════════════════════════════════════════════ */}
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              transform: [{ perspective: 1000 }, { rotateY: backRotate }],
              opacity: backOpacity,
              backfaceVisibility: 'hidden',
              backgroundColor: Colors.bgSecondary,
            },
          ]}
          pointerEvents={flipped ? 'auto' : 'none'}
        >
          <BackFace
            spot={spot}
            details={details}
            loading={loadingDetails}
            cardH={cardH}
            onFlipBack={toggleFlip}
            onOpenPlace={handleOpenPlace}
            isSaved={isSaved}
            onToggleSave={handleToggleSave}
          />
        </Animated.View>
      </View>
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// BACK FACE — sub-component (lisibilité)
// ══════════════════════════════════════════════════════════════

interface BackFaceProps {
  spot: Spot;
  details: GooglePlaceDetails | null;
  loading: boolean;
  cardH: number;
  onFlipBack: () => void;
  onOpenPlace: () => void;
  isSaved: boolean;
  onToggleSave: () => void;
}

const BackFace: React.FC<BackFaceProps> = ({
  spot, details, loading, cardH, onFlipBack, onOpenPlace, isSaved, onToggleSave,
}) => {
  // Map dimensions — calculées sur la largeur dispo (cardH ratio 4:3 max)
  const mapW = 600; // logique pour static map (px réels après scale=2)
  const mapH = 360;

  const lat = details?.latitude ?? spot.latitude;
  const lng = details?.longitude ?? spot.longitude;

  const handleOpenMaps = () => {
    if (!lat || !lng) return;
    const url = Platform.select({
      ios: `maps://?ll=${lat},${lng}&q=${encodeURIComponent(spot.placeName)}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(spot.placeName)})`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    });
    if (url) Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Header : ← back + nom du lieu */}
      <View style={backStyles.header}>
        <TouchableOpacity
          onPress={onFlipBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={backStyles.headerBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={backStyles.headerEyebrow}>DÉTAILS DU LIEU</Text>
          <Text style={backStyles.headerTitle} numberOfLines={1}>{spot.placeName}</Text>
        </View>
        <TouchableOpacity
          onPress={onToggleSave}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={backStyles.headerBtn}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isSaved ? 'star' : 'star-outline'}
            size={18}
            color={isSaved ? Colors.gold : Colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={backStyles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {loading && !details ? (
          <View style={backStyles.loadingWrap}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : (
          <>
            {/* Rating + reviewCount Google */}
            {details && details.rating > 0 && (
              <View style={backStyles.ratingRow}>
                <Ionicons name="star" size={14} color={Colors.gold} />
                <Text style={backStyles.ratingValue}>{details.rating.toFixed(1)}</Text>
                <Text style={backStyles.ratingCount}>({details.reviewCount} avis Google)</Text>
              </View>
            )}

            {/* Adresse */}
            {(details?.address || spot.placeAddress) && (
              <InfoRow
                icon="location-outline"
                label={details?.address || spot.placeAddress || ''}
              />
            )}

            {/* Téléphone */}
            {details?.phoneNumber && (
              <Pressable onPress={() => Linking.openURL(`tel:${details.phoneNumber!.replace(/\s/g, '')}`)}>
                <InfoRow icon="call-outline" label={details.phoneNumber} linkable />
              </Pressable>
            )}

            {/* Site web */}
            {details?.website && (
              <Pressable onPress={() => Linking.openURL(details.website!)}>
                <InfoRow icon="globe-outline" label={cleanWebsite(details.website)} linkable />
              </Pressable>
            )}

            {/* Horaires */}
            {details?.openingHours && details.openingHours.length > 0 && (
              <View style={backStyles.hoursWrap}>
                <Text style={backStyles.sectionLabel}>HORAIRES</Text>
                {details.openingHours.map((line, i) => (
                  <Text key={i} style={backStyles.hoursLine}>{line}</Text>
                ))}
              </View>
            )}

            {/* Mini-map */}
            {lat != null && lng != null && GOOGLE_MAPS_API_KEY && (
              <Pressable onPress={handleOpenMaps} style={backStyles.mapWrap}>
                <Image
                  source={{ uri: buildStaticMapUrl(lat, lng, mapW, mapH) }}
                  style={backStyles.mapImg}
                  resizeMode="cover"
                />
                <View style={backStyles.mapOverlay} pointerEvents="none">
                  <Ionicons name="navigate-outline" size={13} color={Colors.textOnAccent} />
                  <Text style={backStyles.mapOverlayText}>Ouvrir dans Maps</Text>
                </View>
              </Pressable>
            )}

            {/* CTA Voir le lieu (PlaceDetail full) */}
            <TouchableOpacity
              style={backStyles.openBtn}
              onPress={onOpenPlace}
              activeOpacity={0.85}
            >
              <Text style={backStyles.openBtnText}>Voir le lieu en détail</Text>
              <Ionicons name="chevron-forward" size={15} color={Colors.textOnAccent} />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const InfoRow: React.FC<{ icon: any; label: string; linkable?: boolean }> = ({ icon, label, linkable }) => (
  <View style={backStyles.infoRow}>
    <Ionicons name={icon} size={14} color={Colors.textSecondary} />
    <Text
      style={[backStyles.infoText, linkable && backStyles.infoLink]}
      numberOfLines={2}
    >
      {label}
    </Text>
  </View>
);

const cleanWebsite = (url: string): string => {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

// ══════════════════════════════════════════════════════════════
// Helpers — formatage place meta (réutilisé du code historique)
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
// Styles
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

  // Type badge "SPOT"
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

  // Bouton ★
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

  // Hint flip — discret, sous la quote
  flipHint: {
    position: 'absolute',
    alignSelf: 'center',
    top: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  flipHintText: {
    fontSize: 10,
    fontFamily: Fonts.bodyMedium,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.4,
  },

  // Bottom overlay
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

const backStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSubtle,
  },
  headerBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: Colors.bgPrimary,
  },
  headerEyebrow: {
    fontSize: 9,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.primary,
    marginBottom: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  scroll: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 20,
  },
  loadingWrap: {
    paddingVertical: 32,
    alignItems: 'center',
  },

  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 14,
  },
  ratingValue: {
    fontSize: 14,
    fontFamily: Fonts.bodyBold,
    color: Colors.textPrimary,
  },
  ratingCount: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSubtle,
  },
  infoText: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: Fonts.body,
    color: Colors.textPrimary,
    lineHeight: 17,
  },
  infoLink: {
    color: Colors.primary,
  },

  hoursWrap: {
    marginTop: 14,
  },
  sectionLabel: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.textTertiary,
    marginBottom: 6,
  },
  hoursLine: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    lineHeight: 18,
  },

  // Static map
  mapWrap: {
    marginTop: 16,
    height: 140,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.bgPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  mapImg: { width: '100%', height: '100%' },
  mapOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 99,
    backgroundColor: 'rgba(44,36,32,0.7)',
  },
  mapOverlayText: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
    letterSpacing: 0.3,
  },

  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 99,
    backgroundColor: Colors.primary,
    marginTop: 18,
  },
  openBtnText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
  },
});
