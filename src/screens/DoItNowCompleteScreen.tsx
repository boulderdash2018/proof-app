import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput as RNTextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { useColors } from '../hooks/useColors';
import { useCity } from '../hooks/useCity';
import { useDoItNowStore } from '../store/doItNowStore';
import { useAuthStore } from '../store/authStore';
import { useFeedStore, useSavesStore, useSavedPlacesStore } from '../store';
import { saveSession, recordPlanCompletion } from '../services/doItNowService';
import { submitPlaceReviews } from '../services/placeReviewService';
import { SharePlanSheet } from '../components/SharePlanSheet';
import { Place } from '../types';

// ── Format helpers ────────────────────────────────────────────
const formatDuration = (totalMinutes: number): string => {
  if (totalMinutes <= 0) return '—';
  if (totalMinutes < 60) return `${totalMinutes} MIN`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}H${m.toString().padStart(2, '0')}` : `${h}H`;
};

const formatDurationReadable = (minutes: number): string => {
  if (minutes <= 0) return '—';
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
};

const MONTHS_FR = ['JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN', 'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE'];
const formatDateBadge = (d: Date, city: string): string => {
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]} · ${city.toUpperCase()}`;
};

// Sum the creator's per-place durations (minutes). Falls back to 0 if unset.
const creatorTotalMinutes = (places: Place[]): number => {
  return places.reduce((sum, p) => sum + (p.placeDuration || 0), 0);
};

// Rating shown in the pull-quote: use each place's rating (Google-derived) and
// average across those that have one. In the future, prefer Proof reviews when
// the count is >= 5 — for now we surface Google by default since Proof review
// counts aren't tracked client-side.
const averageRating = (places: Place[]): number | null => {
  const rated = places.filter((p) => p.rating && p.rating > 0);
  if (rated.length === 0) return null;
  const sum = rated.reduce((s, p) => s + p.rating, 0);
  return Math.round((sum / rated.length) * 10) / 10;
};

// Place key for favorites
const placeFavKey = (p: { googlePlaceId?: string; id: string }) => p.googlePlaceId || p.id;

export const DoItNowCompleteScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const C = useColors();
  const cityConfig = useCity();
  const { session, plan, clearSession } = useDoItNowStore();
  const currentUser = useAuthStore((s) => s.user);

  // Favorites
  const savedPlaces = useSavedPlacesStore((s) => s.places);
  const savePlace = useSavedPlacesStore((s) => s.savePlace);
  const unsavePlace = useSavedPlacesStore((s) => s.unsavePlace);

  // Inline review state (per place): rating + comment, keyed by placeId
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [commentOpenFor, setCommentOpenFor] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Hydrate from existing session rating/reviews (from DoItNowScreen inline review screen)
  useEffect(() => {
    if (!session) return;
    const r0: Record<string, number> = {};
    const c0: Record<string, string> = {};
    for (const v of session.placesVisited) {
      if (v.rating && v.rating > 0) r0[v.placeId] = v.rating;
      if (v.reviewText) c0[v.placeId] = v.reviewText;
    }
    setRatings(r0);
    setComments(c0);
  }, []);

  // Save session stats on mount
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (session && currentUser) {
      saveSession(session).catch(console.error);
      const photos = session.placesVisited.filter((v) => v.photoUrl).map((v) => v.photoUrl!);
      recordPlanCompletion(
        session.planId,
        currentUser.id,
        session.transport,
        session.totalDurationMinutes || 0,
        photos,
      ).catch(console.error);
    }
  }, []);

  if (!session || !plan) {
    navigation.goBack();
    return null;
  }

  // ── Stats (NOT the measured time — the creator's authored duration) ────
  const creatorMinutes = creatorTotalMinutes(plan.places);
  const totalCreatorDuration = formatDurationReadable(creatorMinutes);
  const avgRating = averageRating(plan.places);
  const dateBadge = formatDateBadge(new Date(), plan.city || cityConfig.name);

  // ── Top photo strip — first 3 (or 2) places ────────────────────────────
  const stripPlaces = plan.places.slice(0, Math.min(3, plan.places.length));
  const stripPhotoFor = (p: Place): string | undefined =>
    p.customPhoto || p.photoUrls?.[0];

  // ── Handlers ───────────────────────────────────────────────────────────
  const setRating = (placeId: string, rating: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setRatings((prev) => ({ ...prev, [placeId]: prev[placeId] === rating ? 0 : rating }));
  };

  const toggleCommentOpen = (placeId: string) => {
    setCommentOpenFor((prev) => (prev === placeId ? null : placeId));
  };

  const toggleFavorite = (place: Place) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const key = placeFavKey(place);
    const isFav = savedPlaces.some((sp) => sp.placeId === key);
    if (isFav) {
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
      });
    }
  };

  const handleShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setShowShare(true);
  };

  const handleRedo = () => {
    // Navigate back to the plan detail — user can re-launch Do-It-Now from there.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    clearSession();
    navigation.replace('PlanDetail', { planId: plan.id });
  };

  // "Retour" = submit reviews + mark plan validated + go back to feed
  const handleReturn = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      // Submit inline ratings + comments to Proof's review system
      if (currentUser) {
        const reviews = plan.places
          .filter((p) => (ratings[p.id] ?? 0) > 0)
          .map((p) => ({
            placeId: p.id,
            googlePlaceId: p.googlePlaceId,
            planId: plan.id,
            rating: ratings[p.id],
            text: (comments[p.id] || '').trim() || undefined,
          }));
        if (reviews.length > 0) {
          await submitPlaceReviews(reviews, currentUser, 'do_it_now');
        }
      }

      // Mark as done + validated (standard Proof action)
      const savesStore = useSavesStore.getState();
      const { toggleSave, savedPlanIds } = useFeedStore.getState();
      if (!savedPlanIds.has(plan.id)) toggleSave(plan.id);
      savesStore.markAsDone(plan.id, 'validated');

      // Bump proof count in feed
      useFeedStore.setState((state) => ({
        plans: state.plans.map((p) =>
          p.id === plan.id ? { ...p, proofCount: (p.proofCount ?? 0) + 1 } : p,
        ),
      }));

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      clearSession();
      navigation.popToTop();
    } catch (err) {
      console.error('[DoItNowComplete] submit error:', err);
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    clearSession();
    navigation.popToTop();
  };

  // ── Render stars row for a place ───────────────────────────────────────
  const renderStars = (placeId: string) => {
    const currentRating = ratings[placeId] ?? 0;
    return (
      <View style={styles.placeStars}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => setRating(placeId, star)}
            hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
          >
            <Ionicons
              name={star <= currentRating ? 'star' : 'star-outline'}
              size={18}
              color={star <= currentRating ? Colors.primary : Colors.borderMedium}
              style={{ marginHorizontal: 1 }}
            />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  // ── Main render ────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: Colors.bgPrimary }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ═════════ TOP PHOTO STRIP ═════════ */}
        <View style={styles.photoStrip}>
          {stripPlaces.map((p, i) => {
            const photo = stripPhotoFor(p);
            return (
              <View key={p.id || i} style={styles.photoTile}>
                {photo ? (
                  <Image source={{ uri: photo }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                ) : (
                  <LinearGradient
                    colors={[Colors.terracotta300, Colors.terracotta500]}
                    style={StyleSheet.absoluteFillObject}
                  />
                )}
              </View>
            );
          })}

          {/* Dark gradient fade at the bottom */}
          <LinearGradient
            colors={['transparent', 'rgba(44, 36, 32, 0.1)', 'rgba(245, 240, 232, 1)']}
            locations={[0, 0.6, 1]}
            style={styles.photoFade}
            pointerEvents="none"
          />

          {/* Close icon (top-left) */}
          <TouchableOpacity
            style={[styles.circleBtn, { top: insets.top + 8, left: 16 }]}
            onPress={handleClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={18} color="#FFF" />
          </TouchableOpacity>

          {/* Share icon (top-right) */}
          <TouchableOpacity
            style={[styles.circleBtn, { top: insets.top + 8, right: 16 }]}
            onPress={handleShare}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="paper-plane-outline" size={17} color="#FFF" />
          </TouchableOpacity>

          {/* Date badge overlay (top-center) */}
          <View style={[styles.dateBadge, { top: insets.top + 10 }]}>
            <Text style={styles.dateBadgeText}>{dateBadge}</Text>
          </View>
        </View>

        {/* ═════════ EDITORIAL TITLE ═════════ */}
        <View style={styles.titleBlock}>
          <Text style={styles.overline}>— PLAN VÉCU</Text>
          <Text style={styles.editorialTitle}>{plan.title}.</Text>
        </View>

        {/* ═════════ PULL-QUOTE ═════════ */}
        <View style={[styles.pullQuote, { backgroundColor: Colors.bgSecondary, borderColor: Colors.borderSubtle }]}>
          <Text style={styles.pullQuoteText}>
            « {totalCreatorDuration} de {plan.city || cityConfig.name} à ton rythme.
            {avgRating !== null ? (
              <>
                {'\n'}Moyenne{' '}
                <Text style={styles.pullQuoteRating}>{avgRating}★</Text>
                {' '}— tu t'es fait du bien. »
              </>
            ) : (
              " Tu t'es fait du bien. »"
            )}
          </Text>
        </View>

        {/* ═════════ RECAP HEADER ═════════ */}
        <Text style={[styles.overline, { marginTop: 18, marginBottom: 10 }]}>
          — RÉCAP · {plan.places.length} ÉTAPE{plan.places.length > 1 ? 'S' : ''}
        </Text>

        {/* ═════════ PLACES LIST ═════════ */}
        {plan.places.map((place, i) => {
          const photo = place.customPhoto || place.photoUrls?.[0];
          const isFav = savedPlaces.some((sp) => sp.placeId === placeFavKey(place));
          const placeMinutes = place.placeDuration || 0;
          const durationText = formatDuration(placeMinutes);
          const commentOpen = commentOpenFor === place.id;
          const rating = ratings[place.id] ?? 0;

          return (
            <View key={place.id || i} style={[styles.placeCard, { backgroundColor: Colors.bgSecondary, borderColor: Colors.borderSubtle }]}>
              <View style={styles.placeRow}>
                {/* Index */}
                <Text style={styles.placeIndex}>{(i + 1).toString().padStart(2, '0')}</Text>

                {/* Thumb */}
                <View style={styles.placeThumb}>
                  {photo ? (
                    <Image source={{ uri: photo }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                  ) : (
                    <LinearGradient
                      colors={[Colors.terracotta300, Colors.terracotta500]}
                      style={StyleSheet.absoluteFillObject}
                    />
                  )}
                </View>

                {/* Info */}
                <View style={styles.placeInfo}>
                  <Text style={styles.placeName} numberOfLines={2}>{place.name}</Text>
                  <Text style={styles.placeMeta} numberOfLines={1}>
                    {(place.type || 'LIEU').toUpperCase()}
                    {placeMinutes > 0 ? ` · ${durationText}` : ''}
                  </Text>
                </View>

                {/* Right side: stars + favori */}
                <View style={styles.placeRight}>
                  {renderStars(place.id)}
                  <TouchableOpacity
                    onPress={() => toggleFavorite(place)}
                    style={styles.favBadge}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons
                      name={isFav ? 'star' : 'star-outline'}
                      size={11}
                      color={isFav ? Colors.gold : Colors.textTertiary}
                    />
                    <Text style={[styles.favBadgeText, { color: isFav ? Colors.gold : Colors.textTertiary }]}>
                      {isFav ? 'FAVORI' : 'FAVORI ?'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Expandable comment — appears when user tapped the + below OR already has a comment */}
              {(rating > 0 || commentOpen || (comments[place.id] && comments[place.id].length > 0)) && (
                <View style={styles.commentWrap}>
                  {!commentOpen && !(comments[place.id] && comments[place.id].length > 0) ? (
                    <TouchableOpacity onPress={() => toggleCommentOpen(place.id)} style={styles.commentAddBtn}>
                      <Ionicons name="chatbubble-outline" size={12} color={Colors.textTertiary} />
                      <Text style={styles.commentAddText}>Ajouter un commentaire</Text>
                    </TouchableOpacity>
                  ) : (
                    <RNTextInput
                      style={[
                        styles.commentInput,
                        { backgroundColor: Colors.bgPrimary, borderColor: (comments[place.id] || '').length > 0 ? Colors.primary : Colors.borderSubtle, color: Colors.textPrimary },
                      ]}
                      placeholder="Un commentaire, une anecdote ?"
                      placeholderTextColor={Colors.textTertiary}
                      value={comments[place.id] || ''}
                      onChangeText={(v) => setComments((prev) => ({ ...prev, [place.id]: v }))}
                      multiline
                      maxLength={300}
                      textAlignVertical="top"
                      autoFocus={commentOpen}
                    />
                  )}
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* ═════════ FOOTER — 3 actions ═════════ */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, borderTopColor: Colors.borderSubtle }]}>
        <TouchableOpacity style={[styles.ghostBtn, { borderColor: Colors.borderMedium }]} onPress={handleShare} activeOpacity={0.7}>
          <Ionicons name="paper-plane-outline" size={14} color={Colors.textPrimary} />
          <Text style={[styles.ghostBtnText, { color: Colors.textPrimary }]}>Partager</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.ghostBtn, { borderColor: Colors.borderMedium }]} onPress={handleRedo} activeOpacity={0.7}>
          <Ionicons name="bookmark-outline" size={14} color={Colors.textPrimary} />
          <Text style={[styles.ghostBtnText, { color: Colors.textPrimary }]}>Refaire</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: Colors.primary, opacity: isSubmitting ? 0.7 : 1 }]}
          onPress={handleReturn}
          activeOpacity={0.85}
          disabled={isSubmitting}
        >
          <Text style={styles.primaryBtnText}>Retour</Text>
          <Ionicons name="sparkles" size={14} color={Colors.textOnAccent} />
        </TouchableOpacity>
      </View>

      {/* Share sheet */}
      {showShare && (
        <SharePlanSheet
          visible={showShare}
          onClose={() => setShowShare(false)}
          planId={plan.id}
          planTitle={plan.title}
          planCover={plan.coverPhotos?.[0] || plan.places[0]?.photoUrls?.[0]}
          planAuthorName={plan.author?.displayName || 'Créateur'}
        />
      )}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────
const PHOTO_STRIP_H = 270;

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 16 },

  // Photo strip top
  photoStrip: {
    width: '100%',
    height: PHOTO_STRIP_H,
    flexDirection: 'row',
    position: 'relative',
    backgroundColor: '#2C2420',
  },
  photoTile: {
    flex: 1,
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  photoFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 90,
  },
  circleBtn: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(44, 36, 32, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBadge: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(44, 36, 32, 0.72)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 99,
  },
  dateBadgeText: {
    fontSize: 10.5,
    fontFamily: Fonts.bodySemiBold,
    color: '#FFF',
    letterSpacing: 1.2,
  },

  // Editorial title under the strip
  titleBlock: {
    paddingHorizontal: 20,
    marginTop: -30,
  },
  overline: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  editorialTitle: {
    fontSize: 34,
    fontFamily: Fonts.displaySemiBoldItalic,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 38,
    marginTop: 4,
  },

  // Pull-quote card
  pullQuote: {
    marginHorizontal: 20,
    marginTop: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  pullQuoteText: {
    fontSize: 15,
    fontFamily: Fonts.displayItalic,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  pullQuoteRating: {
    color: Colors.primary,
    fontFamily: Fonts.displaySemiBoldItalic,
  },

  // Place card
  placeCard: {
    marginHorizontal: 20,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  placeIndex: {
    fontSize: 11,
    fontFamily: Fonts.bodyBold,
    color: Colors.primary,
    width: 22,
    letterSpacing: 0.5,
  },
  placeThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: Colors.bgTertiary,
  },
  placeInfo: {
    flex: 1,
    minWidth: 0,
  },
  placeName: {
    fontSize: 15,
    fontFamily: Fonts.displaySemiBoldItalic,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
    lineHeight: 19,
  },
  placeMeta: {
    fontSize: 10.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    letterSpacing: 1,
    marginTop: 3,
  },
  placeRight: {
    alignItems: 'flex-end',
    gap: 4,
    minWidth: 90,
  },
  placeStars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  favBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  favBadgeText: {
    fontSize: 9.5,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: 0.8,
  },

  // Comment expand
  commentWrap: {
    marginTop: 8,
    marginLeft: 32,
  },
  commentAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  commentAddText: {
    fontSize: 11,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textTertiary,
  },
  commentInput: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 13,
    fontFamily: Fonts.body,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    backgroundColor: Colors.bgPrimary,
  },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  ghostBtnText: {
    fontSize: 12.5,
    fontFamily: Fonts.bodySemiBold,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 12,
  },
  primaryBtnText: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
  },
});
