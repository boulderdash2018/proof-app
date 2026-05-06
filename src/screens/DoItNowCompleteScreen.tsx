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
import { savePlan as savePlanFS } from '../services/plansService';
import { submitPlaceReviews } from '../services/placeReviewService';
import { SavedPlan } from '../types';
import { SharePlanSheet } from '../components/SharePlanSheet';
import { ProofSurveyModal } from '../components/ProofSurveyModal';
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

  // Saved plans — used to enforce one-proof-per-plan
  const savedPlans = useSavesStore((s) => s.savedPlans);

  // Inline review state (per place): rating + comment, keyed by placeId
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [commentOpenFor, setCommentOpenFor] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showProofModal, setShowProofModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Co-plan publish card state ──
  // Affichée quand on termine un co-plan privé (sourceDraftId set,
  // visibility:'private') — propose à l'utilisateur de PUBLIER le plan
  // sur le feed via la page dédiée, ou de juste SAUVEGARDER (= ne rien
  // faire de plus, le plan reste dans ses saves via le Proof It standard).
  // Maintenant intégré dans le footer (plus de carte intermédiaire) :
  // les 2 boutons remplacent 'Refaire' et 'Fin' du footer historique.
  const isCoPlan = !!(plan?.sourceDraftId && plan?.visibility === 'private');

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

  // Note : `handleRedo` (= "Refaire le plan") a été retiré du nouveau
  // design — la fin de plan se concentre maintenant sur partager /
  // publier / terminer. Si on veut le réintroduire un jour, on peut
  // le caser dans une troisième actionCard ou un menu contextuel.

  // Already-proofed guard : a plan can only be Proof-It'd once.
  // When a saved entry exists with isDone + proofStatus='validated', the user
  // has already proofed this plan in a previous session.
  const savedEntry = savedPlans.find((sp) => sp.planId === plan.id);
  const isAlreadyProofed = !!savedEntry?.isDone && savedEntry.proofStatus === 'validated';

  /**
   * Co-plan only — "Ajouter à 'fait'" : marque le plan comme fait dans
   * les saves (isDone:true) SANS passer par le Proof It modal. Le co-plan
   * est un plan que le groupe vient de créer ensemble — il n'y a pas de
   * 'validation' à faire (le Proof It valide qu'on a bien refait le plan
   * d'un autre, ce qui ne s'applique pas ici).
   *
   * Submit aussi les reviews/photos saisies pendant la session si le
   * user en a posé, comme handleFinalize le fait.
   */
  const handleAddToDone = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      // Submit reviews seulement si le user en a saisi (sinon no-op).
      const reviewsToSubmit = Object.entries(ratings).filter(([, r]) => r > 0);
      if (currentUser && reviewsToSubmit.length > 0) {
        const sessionPlaces = (session?.placesVisited || []).map((v) => {
          const fullPlace = plan.places.find((p) => p.id === v.placeId);
          return {
            placeId: v.placeId,
            googlePlaceId: fullPlace?.googlePlaceId,
            planId: plan.id,
            rating: ratings[v.placeId] || 0,
            text: comments[v.placeId] || undefined,
          };
        }).filter((r) => r.rating > 0);
        if (sessionPlaces.length > 0) {
          submitPlaceReviews(sessionPlaces, currentUser, 'do_it_now').catch(
            (err) => console.warn('[DoItNowCompleteScreen] reviews submit:', err),
          );
        }
      }
      // Marquer done sans proofStatus — c'est juste 'ajouté à fait',
      // pas une validation Proof It.
      useSavesStore.getState().markAsDone(plan.id);
      clearSession();
      navigation.popToTop();
    } finally {
      setIsSubmitting(false);
    }
  };

  // "Fin" = submit reviews, then open the Proof It stamp ceremony modal.
  // The actual markAsDone + proofCount bump happens in `handleProofConfirmed`
  // after the user confirms the stamp. Enforces one-proof-per-plan.
  const handleFinalize = async () => {
    if (isSubmitting) return;

    // Already proofed in a past session → just go back without re-submitting.
    if (isAlreadyProofed) {
      clearSession();
      navigation.popToTop();
      return;
    }

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

      // Open the Proof It stamp ceremony. The visual "you did it" moment.
      setShowProofModal(true);
      setIsSubmitting(false);
    } catch (err) {
      console.error('[DoItNowComplete] submit error:', err);
      setIsSubmitting(false);
    }
  };

  // Called after the user taps "Proof. it ✓" inside the stamp modal.
  // Does the actual proof business — one time only.
  //
  // IMPORTANT : savesStore.markAsDone ne crée pas l'entrée si elle n'existe
  // pas (elle ne fait que muter les entrées présentes). Si le plan n'a jamais
  // été saved avant, il faut d'abord garantir qu'une entrée locale existe +
  // qu'elle est persistée en Firestore, sinon la proof n'est pas enregistrée
  // et l'user peut re-proof indéfiniment.
  const handleProofConfirmed = async () => {
    try {
      if (!currentUser) {
        console.warn('[DoItNowComplete] no current user, skipping proof');
        setShowProofModal(false);
        navigation.popToTop();
        return;
      }

      const savesState = useSavesStore.getState();
      const feedState = useFeedStore.getState();
      const existingEntry = savesState.savedPlans.find((sp) => sp.planId === plan.id);

      // Step 1 — Garantir l'existence d'une entrée saved (local + Firestore).
      if (!existingEntry) {
        // Local state — ajoute l'entrée avec isDone=false (on bascule à true juste après).
        const entry: SavedPlan = {
          planId: plan.id,
          plan,
          isDone: false,
          savedAt: new Date().toISOString(),
        };
        useSavesStore.setState((state) => ({
          savedPlans: [entry, ...state.savedPlans],
        }));
        // Aligne aussi le savedPlanIds du feedStore (même source de vérité pour le bookmark).
        const newSet = new Set(feedState.savedPlanIds);
        newSet.add(plan.id);
        useFeedStore.setState({ savedPlanIds: newSet });
        // Persist en Firestore — AWAIT pour éviter la race avec markPlanAsDone qui vient après.
        try {
          await savePlanFS(currentUser.id, plan.id, currentUser, plan);
        } catch (err) {
          console.error('[DoItNowComplete] savePlan FS failed:', err);
        }
      }

      // Step 2 — Marque le plan comme done + validated (local state + Firestore via markPlanAsDone).
      // À ce stade l'entrée existe forcément, donc le map() dans markAsDone va la muter.
      useSavesStore.getState().markAsDone(plan.id, 'validated');

      // Step 3 — Optimistic bump du proofCount + ajout au recreatedByIds pour
      // que les écrans liés (PlanDetail) voient immédiatement l'user dans les
      // proofers et lockent le bouton 'Do it now'.
      useFeedStore.setState((state) => ({
        plans: state.plans.map((p) => {
          if (p.id !== plan.id) return p;
          const alreadyInList = (p.recreatedByIds ?? []).includes(currentUser.id);
          return {
            ...p,
            proofCount: alreadyInList ? (p.proofCount ?? 0) : (p.proofCount ?? 0) + 1,
            recreatedByIds: alreadyInList
              ? p.recreatedByIds
              : [...(p.recreatedByIds ?? []), currentUser.id],
          };
        }),
      }));

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setShowProofModal(false);
      clearSession();
      navigation.popToTop();
    } catch (err) {
      console.error('[DoItNowComplete] proof confirm error:', err);
      setShowProofModal(false);
    }
  };

  // "Pas cette fois" — l'user termine le plan SANS le proof it.
  // On marque le plan comme 'fait' (isDone=true) mais sans proofStatus.
  // → pas de bump du proofCount, pas d'ajout dans recreatedByIds.
  // Le bouton 'Do it now' sur PlanDetail sera désactivé via isDone (déjà
  // garanti par le flag local + Firestore via savesStore.markAsDone).
  const handleProofDeclined = () => {
    try {
      const savesState = useSavesStore.getState();
      const feedState = useFeedStore.getState();
      const existingEntry = savesState.savedPlans.find((sp) => sp.planId === plan.id);

      if (!existingEntry && currentUser) {
        const entry: SavedPlan = {
          planId: plan.id,
          plan,
          isDone: false,
          savedAt: new Date().toISOString(),
        };
        useSavesStore.setState((state) => ({
          savedPlans: [entry, ...state.savedPlans],
        }));
        const newSet = new Set(feedState.savedPlanIds);
        newSet.add(plan.id);
        useFeedStore.setState({ savedPlanIds: newSet });
        try {
          savePlanFS(currentUser.id, plan.id, currentUser, plan).catch((err) =>
            console.error('[DoItNowComplete] savePlan FS failed (decline):', err),
          );
        } catch (err) {
          console.error('[DoItNowComplete] savePlan FS sync error:', err);
        }
      }

      // Mark done WITHOUT proofStatus — no proof emitted, count untouched
      useSavesStore.getState().markAsDone(plan.id);

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setShowProofModal(false);
      clearSession();
      navigation.popToTop();
    } catch (err) {
      console.error('[DoItNowComplete] proof decline error:', err);
      setShowProofModal(false);
    }
  };

  const handleClose = () => {
    clearSession();
    navigation.popToTop();
  };

  /**
   * "Publier sur le feed" — secondary action card in the body.
   * Sémantique adaptée selon le mode :
   *  - co-plan (mon plan) → ouvre la page de publication enrichie où
   *    l'utilisateur ajoute cover/tags/tip avant de rendre le plan
   *    visible dans le feed public.
   *  - solo (plan de quelqu'un d'autre, je le refais) → ouvre la
   *    cérémonie Proof It qui injecte ma proof dans le feed
   *    (proofCount + recreatedByIds).
   */
  const handlePublish = () => {
    if (!plan) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (isCoPlan) {
      navigation.navigate('CoPlanPublish', { planId: plan.id });
    } else {
      handleFinalize();
    }
  };

  /**
   * "Terminer" — sticky CTA en bas de la page, action de sortie.
   * Sémantique : marquer le plan comme fait dans les saves (sans
   * publier ni proof, l'user choisira ces actions explicitement via
   * les cartes "Et après ?"), puis fermer.
   *  - co-plan → handleAddToDone (markAsDone simple, sans status).
   *  - solo → handleProofDeclined (markAsDone sans proofStatus).
   * Les deux valident silencieusement l'expérience sans la pousser
   * sur le feed — l'user a explicitement choisi de "juste finir".
   */
  const handleTerminer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (isCoPlan) {
      handleAddToDone();
    } else {
      handleProofDeclined();
    }
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
  // Hero photo : on prend la cover du plan en priorité, fallback sur la
  // photo du premier lieu (custom > Google), fallback dégradé terracotta.
  const heroPhoto = plan.coverPhotos?.[0]
    || plan.places[0]?.customPhoto
    || plan.places[0]?.photoUrls?.[0];

  return (
    <View style={[styles.container, { backgroundColor: Colors.bgPrimary }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ═════════ HERO — single cover photo with title overlay ═════════ */}
        <View style={styles.hero}>
          {heroPhoto ? (
            <Image source={{ uri: heroPhoto }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={[Colors.terracotta300, Colors.terracotta500]}
              style={StyleSheet.absoluteFillObject}
            />
          )}

          {/* Bottom→top dark gradient pour la lisibilité du titre. */}
          <LinearGradient
            colors={['transparent', 'rgba(44, 36, 32, 0.55)', 'rgba(44, 36, 32, 0.85)']}
            locations={[0.4, 0.78, 1]}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          {/* × — close top-left */}
          <TouchableOpacity
            style={[styles.heroCloseBtn, { top: insets.top + 12 }]}
            onPress={handleClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={18} color="#FFF" />
          </TouchableOpacity>

          {/* Title block — eyebrow (date · ville · PLAN VÉCU) + grand titre. */}
          <View style={styles.heroText}>
            <Text style={styles.heroEyebrow}>{dateBadge} · PLAN VÉCU</Text>
            <Text style={styles.heroTitle} numberOfLines={2}>{plan.title}</Text>
          </View>
        </View>

        {/* ═════════ STATS CARD ═════════ */}
        <View style={[styles.statsCard, { backgroundColor: Colors.bgSecondary, borderColor: Colors.borderSubtle }]}>
          <View style={styles.statBlock}>
            <Text style={styles.statValue}>{plan.places.length}</Text>
            <Text style={styles.statLabel}>ÉTAPES</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: Colors.borderSubtle }]} />
          <View style={styles.statBlock}>
            <Text style={[styles.statValue, { color: Colors.terracotta700 }]}>
              {avgRating !== null ? `${avgRating}★` : '—'}
            </Text>
            <Text style={styles.statLabel}>MOYENNE</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: Colors.borderSubtle }]} />
          <View style={styles.statBlock}>
            <Text style={styles.statValue}>{totalCreatorDuration}</Text>
            <Text style={styles.statLabel}>DURÉE</Text>
          </View>
        </View>

        {/* ═════════ TES ÉTAPES ═════════ */}
        <Text style={styles.sectionEyebrow}>— TES ÉTAPES</Text>

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

        {/* ═════════ ET APRÈS ? — secondary actions in body ═════════ */}
        <Text style={[styles.sectionEyebrow, { marginTop: 22 }]}>— ET APRÈS ?</Text>

        {/* Partager à des amis — toujours visible (solo + co-plan). */}
        <TouchableOpacity
          style={[styles.actionCard, { backgroundColor: Colors.bgSecondary, borderColor: Colors.borderSubtle }]}
          onPress={handleShare}
          activeOpacity={0.85}
        >
          <View style={[styles.actionIcon, { backgroundColor: Colors.bgPrimary }]}>
            <Ionicons name="paper-plane" size={16} color={Colors.textPrimary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.actionTitle}>Partager à des amis</Text>
            <Text style={styles.actionSub}>iMessage, WhatsApp, lien direct</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
        </TouchableOpacity>

        {/* Publier sur le feed — sémantique adaptée au mode :
            co-plan → CoPlanPublish (enrichir avant publication)
            solo    → Proof It modal (publier ma proof sur le plan).
            Cf. doc de handlePublish plus haut.
            Caché en solo si déjà proofed (action terminée). */}
        {(isCoPlan || !isAlreadyProofed) && (
          <TouchableOpacity
            style={[
              styles.actionCard,
              {
                backgroundColor: Colors.bgSecondary,
                borderColor: Colors.borderSubtle,
                opacity: isSubmitting ? 0.7 : 1,
              },
            ]}
            onPress={handlePublish}
            activeOpacity={0.85}
            disabled={isSubmitting}
          >
            <View style={[styles.actionIcon, { backgroundColor: Colors.terracotta50 }]}>
              <Ionicons name="share-social" size={16} color={Colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.actionTitle}>Publier sur le feed</Text>
              <Text style={styles.actionSub}>
                {isCoPlan
                  ? 'Visible par toute la communauté Proof'
                  : 'Confirme avoir fait ce plan et apparais dans les Proof'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
          </TouchableOpacity>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* ═════════ STICKY FOOTER — single primary CTA "Terminer" ═════════
          Action de sortie discrète : marque le plan fait dans les saves
          sans le pousser sur le feed (= l'user a déjà eu l'opportunité
          via la carte "Publier sur le feed" au-dessus s'il le voulait).
          En mode solo + déjà proofed, l'action ferme simplement. */}
      <View style={[styles.footerSticky, { paddingBottom: insets.bottom + 12, borderTopColor: Colors.borderSubtle }]}>
        <TouchableOpacity
          style={[
            styles.terminerBtn,
            {
              backgroundColor: Colors.primary,
              opacity: isSubmitting ? 0.7 : 1,
            },
          ]}
          onPress={isAlreadyProofed && !isCoPlan ? handleClose : handleTerminer}
          activeOpacity={0.85}
          disabled={isSubmitting}
        >
          <Text style={styles.terminerText}>
            {isAlreadyProofed && !isCoPlan ? 'Fermer' : 'Terminer'}
          </Text>
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

      {/* Proof It stamp ceremony — opens on 'Fin' tap, plays the stamp animation,
          and fires handleProofConfirmed when the user taps "Proof. it ✓". */}
      <ProofSurveyModal
        visible={showProofModal}
        plan={plan}
        onProof={handleProofConfirmed}
        onDecline={handleProofDeclined}
        skipRating
        source="do_it_now"
      />
    </View>
  );
};

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────
const HERO_H = 320;

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 16 },

  // Hero — single big cover photo with title overlay
  hero: {
    width: '100%',
    height: HERO_H,
    position: 'relative',
    backgroundColor: '#2C2420',
    overflow: 'hidden',
  },
  heroCloseBtn: {
    position: 'absolute',
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(44, 36, 32, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 22,
  },
  heroEyebrow: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 32,
    fontFamily: Fonts.displaySemiBoldItalic,
    color: '#FFF',
    letterSpacing: -0.5,
    lineHeight: 36,
  },

  // Stats card — 3 colonnes (étapes / moyenne / durée) sous le hero
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 20,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    letterSpacing: 1.4,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
  },

  // Section eyebrows ("— TES ÉTAPES", "— ET APRÈS ?")
  sectionEyebrow: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    marginHorizontal: 20,
    marginTop: 22,
    marginBottom: 12,
  },

  // Action cards (Partager / Publier) dans la section "ET APRÈS ?"
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: {
    fontSize: 14.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  actionSub: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginTop: 2,
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

  // Sticky footer — un seul gros CTA "Terminer" en bas de page,
  // au-dessus de la zone safe. Le reste des actions (Partager,
  // Publier) est dans le corps via les actionCards.
  footerSticky: {
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    backgroundColor: Colors.bgPrimary,
  },
  terminerBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 3,
  },
  terminerText: {
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
    letterSpacing: 0.1,
  },
});
