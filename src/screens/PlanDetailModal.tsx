import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput as RNTextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout, Fonts } from '../constants';
import { Avatar, Chip, UserBadge } from '../components';
import { useAuthStore, useFeedStore, useSavesStore, useGuestStore } from '../store';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { Plan, Comment, TravelSegment, TransportMode } from '../types';
import { fetchPlanById, fetchComments, addComment, deletePlan, archivePlan } from '../services/plansService';
import { getPlaceDetails } from '../services/googlePlacesService';
import { ProofSurveyModal } from '../components/ProofSurveyModal';
import { MiniStampIcon } from '../components/MiniStampIcon';
import { PlanMapModal } from '../components/PlanMapModal';
import { TransportChooser } from '../components/TransportChooser';
import { useDoItNowStore } from '../store/doItNowStore';

const TRANSPORT_ICONS: Record<TransportMode, string> = {
  'Métro': 'train-outline', 'Vélo': 'bicycle-outline', 'À pied': 'walk-outline', 'Voiture': 'car-outline', 'Trottinette': 'flash-outline',
};

const parseGradient = (g: string): string[] => {
  const m = g.match(/#[0-9A-Fa-f]{6}/g);
  return m && m.length >= 2 ? m : ['#FF6B35', '#C94520'];
};

const getTransportEmoji = (mode: string): string => {
  const map: Record<string, string> = { 'Métro': '🚇', 'Vélo': '🚲', 'À pied': '🚶', 'Voiture': '🚗', 'Trottinette': '🛴' };
  return map[mode] || '🚇';
};

const getCommentTimeAgo = (dateStr: string): string => {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}j`;
};

export const PlanDetailModal: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { planId } = route.params as { planId: string };
  const C = useColors();
  const { t } = useTranslation();

  const currentUser = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setShowAccountPrompt = useGuestStore((s) => s.setShowAccountPrompt);
  const isGuest = !isAuthenticated;
  const feedPlans = useFeedStore((s) => s.plans);
  const { likedPlanIds, savedPlanIds, toggleLike, toggleSave } = useFeedStore();
  const { savedPlans, markAsDone, fetchSaves } = useSavesStore();

  const [plan, setPlan] = useState<Plan | null>(
    feedPlans.find((p) => p.id === planId) || null
  );
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [localLikesCount, setLocalLikesCount] = useState(plan?.likesCount ?? 0);
  const [localCommentsCount, setLocalCommentsCount] = useState(plan?.commentsCount ?? 0);

  const savedPlan = savedPlans.find((sp) => sp.planId === planId);
  const isDone = savedPlan?.isDone ?? false;
  const [showProofSurvey, setShowProofSurvey] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showPlanMenu, setShowPlanMenu] = useState(false);
  const [showTransportChooser, setShowTransportChooser] = useState(false);

  const isOwner = currentUser && plan && plan.authorId === currentUser.id;

  const handleDeletePlan = () => {
    setShowPlanMenu(false);
    if (Platform.OS === 'web') {
      if (window.confirm('Supprimer ce plan définitivement ?')) {
        deletePlan(planId).then(() => {
          useFeedStore.setState((s) => ({ plans: s.plans.filter((p) => p.id !== planId) }));
          navigation.goBack();
        });
      }
    } else {
      const { Alert } = require('react-native');
      Alert.alert('Supprimer ce plan', 'Cette action est irréversible.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => {
          deletePlan(planId).then(() => {
            useFeedStore.setState((s) => ({ plans: s.plans.filter((p) => p.id !== planId) }));
            navigation.goBack();
          });
        }},
      ]);
    }
  };

  const handleArchivePlan = () => {
    setShowPlanMenu(false);
    archivePlan(planId).then(() => {
      useFeedStore.setState((s) => ({ plans: s.plans.filter((p) => p.id !== planId) }));
      navigation.goBack();
    });
  };

  // Sync likes count from feed store
  useEffect(() => {
    const feedPlan = feedPlans.find((p) => p.id === planId);
    if (feedPlan) {
      setLocalLikesCount(feedPlan.likesCount);
      setLocalCommentsCount(feedPlan.commentsCount);
    }
  }, [feedPlans, planId]);

  useEffect(() => {
    if (!plan) {
      fetchPlanById(planId).then((result) => {
        if (result) {
          setPlan(result);
          setLocalLikesCount(result.likesCount);
          setLocalCommentsCount(result.commentsCount);
        }
      });
    }
    // Load comments
    fetchComments(planId).then(setComments);
    // Ensure saved plans are loaded
    if (savedPlans.length === 0 && currentUser) fetchSaves(currentUser.id);
  }, [planId]);

  // Backfill missing coordinates from Google Places
  useEffect(() => {
    if (!plan) return;
    const missing = plan.places.filter((p) => !p.latitude && p.googlePlaceId);
    if (missing.length === 0) return;

    Promise.all(
      plan.places.map(async (p) => {
        if (p.latitude && p.longitude) return p;
        if (!p.googlePlaceId) return p;
        try {
          const details = await getPlaceDetails(p.googlePlaceId);
          if (details?.latitude && details?.longitude) {
            return { ...p, latitude: details.latitude, longitude: details.longitude };
          }
        } catch {}
        return p;
      })
    ).then((updatedPlaces) => {
      setPlan({ ...plan, places: updatedPlaces });
    });
  }, [plan?.id]);

  const isLiked = likedPlanIds.has(planId);
  const isSaved = savedPlanIds.has(planId);

  const handleMarkDone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowProofSurvey(true);
  };

  const handleProof = () => {
    markAsDone(planId, 'validated');
    setShowProofSurvey(false);
    if (plan) setPlan({ ...plan, proofCount: (plan.proofCount ?? 0) + 1 });
    useFeedStore.setState((state) => ({
      plans: state.plans.map((p) =>
        p.id === planId ? { ...p, proofCount: (p.proofCount ?? 0) + 1 } : p
      ),
    }));
  };

  const handleDeclineProof = () => {
    markAsDone(planId, 'declined');
    setShowProofSurvey(false);
    if (plan) setPlan({ ...plan, declinedCount: (plan.declinedCount ?? 0) + 1 });
    useFeedStore.setState((state) => ({
      plans: state.plans.map((p) =>
        p.id === planId ? { ...p, declinedCount: (p.declinedCount ?? 0) + 1 } : p
      ),
    }));
  };

  const handleLike = () => {
    if (isGuest) { setShowAccountPrompt(true); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLocalLikesCount((prev) => prev + (isLiked ? -1 : 1));
    toggleLike(planId);
  };

  const handleSave = () => {
    if (isGuest) { setShowAccountPrompt(true); return; }
    // Block unsave if user already submitted a proof
    if (isSaved && isDone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleSave(planId);
  };

  const handleSendComment = async () => {
    if (!commentText.trim() || !currentUser || isSending) return;
    setIsSending(true);
    try {
      const newComment = await addComment(planId, currentUser, commentText.trim(), plan || undefined);
      setComments((prev) => [newComment, ...prev]);
      setLocalCommentsCount((prev) => prev + 1);
      // Also update feed store plan
      useFeedStore.setState((state) => ({
        plans: state.plans.map((p) =>
          p.id === planId ? { ...p, commentsCount: p.commentsCount + 1 } : p
        ),
      }));
      setCommentText('');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      console.error('Failed to send comment:', err);
    } finally {
      setIsSending(false);
    }
  };

  if (!plan) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
        <View style={[styles.header, { borderBottomColor: C.borderLight }]}>
          <TouchableOpacity style={[styles.backBtn, { backgroundColor: C.gray200 }]} onPress={() => navigation.goBack()}>
            <Text style={[styles.backChevron, { color: C.black }]}>&#8249;</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: C.gray700 }]}>{t.plan_loading}</Text>
        </View>
      </View>
    );
  }

  const gradientColors = parseGradient(plan.gradient);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  // Collect photos: custom cover photos first, then Google Places photos as fallback
  const allPhotos: string[] = (() => {
    if (plan.coverPhotos && plan.coverPhotos.length > 0) return plan.coverPhotos;
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

  const detailBannerWidth = Dimensions.get('window').width;

  const handleDetailPhotoScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    setActivePhotoIndex(Math.round(x / detailBannerWidth));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
        <View style={[styles.header, { borderBottomColor: C.borderLight }]}>
          <TouchableOpacity style={[styles.backBtn, { backgroundColor: C.gray200 }]} onPress={() => navigation.goBack()}>
            <Text style={[styles.backChevron, { color: C.black }]}>&#8249;</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: C.black }]} numberOfLines={1}>{plan.title}</Text>
          <View style={styles.headerRight}>
            {isSaved && (
              <TouchableOpacity
                style={[
                  styles.doneBtn,
                  isDone
                    ? savedPlan?.proofStatus === 'validated'
                      ? { backgroundColor: '#C8571A20', borderColor: '#C8571A' }
                      : { backgroundColor: Colors.successBg, borderColor: Colors.successBorder }
                    : { backgroundColor: C.primary + '15', borderColor: C.primary },
                ]}
                onPress={!isDone ? handleMarkDone : undefined}
                activeOpacity={isDone ? 1 : 0.7}
              >
                <Text style={[styles.doneBtnText, { color: isDone ? (savedPlan?.proofStatus === 'validated' ? '#C8571A' : Colors.success) : C.primary }]}>
                  {isDone
                    ? savedPlan?.proofStatus === 'validated' ? 'Proof ✓' : t.plan_already_done
                    : t.plan_mark_done}
                </Text>
              </TouchableOpacity>
            )}
            {isOwner && (
              <TouchableOpacity onPress={() => setShowPlanMenu(!showPlanMenu)} style={styles.menuBtn}>
                <Ionicons name="ellipsis-horizontal" size={20} color={C.gray700} />
              </TouchableOpacity>
            )}
            {!isSaved && !isOwner && <View style={{ width: 34 }} />}
          </View>
        </View>

        {/* Plan owner menu dropdown */}
        {showPlanMenu && (
          <View style={[styles.planMenu, { backgroundColor: C.white, borderColor: C.borderLight }]}>
            <TouchableOpacity style={styles.planMenuItem} onPress={handleArchivePlan}>
              <Ionicons name="archive-outline" size={18} color={C.gray700} />
              <Text style={[styles.planMenuText, { color: C.black }]}>Archiver</Text>
            </TouchableOpacity>
            <View style={[styles.planMenuDivider, { backgroundColor: C.borderLight }]} />
            <TouchableOpacity style={styles.planMenuItem} onPress={handleDeletePlan}>
              <Ionicons name="trash-outline" size={18} color={Colors.error} />
              <Text style={[styles.planMenuText, { color: Colors.error }]}>Supprimer</Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 140 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {allPhotos.length > 0 ? (
            <View style={styles.bannerWrap}>
              <FlatList
                data={allPhotos}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={handleDetailPhotoScroll}
                scrollEventThrottle={16}
                keyExtractor={(_, i) => String(i)}
                style={{ height: 200 }}
                nestedScrollEnabled
                renderItem={({ item }) => (
                  <View style={{ width: detailBannerWidth, height: 200 }}>
                    <Image source={{ uri: item }} style={{ width: '100%', height: '100%', resizeMode: 'cover' }} />
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 90 }} />
                  </View>
                )}
              />
              <View style={{ position: 'absolute', bottom: 16, left: 18, right: 18 }} pointerEvents="none">
                <Text style={styles.bannerTitle}>{plan.title}</Text>
                <Text style={styles.bannerSubtitle}>{t.plan_by} {plan.author.displayName}</Text>
              </View>
              {allPhotos.length > 1 && (
                <View style={{ position: 'absolute', bottom: 8, alignSelf: 'center', flexDirection: 'row', gap: 5 }} pointerEvents="none">
                  {allPhotos.map((_, i) => (
                    <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === activePhotoIndex ? '#FFF' : 'rgba(255,255,255,0.4)' }} />
                  ))}
                </View>
              )}
            </View>
          ) : (
            <LinearGradient colors={gradientColors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
              <Text style={styles.bannerTitle}>{plan.title}</Text>
              <Text style={styles.bannerSubtitle}>{t.plan_by} {plan.author.displayName}</Text>
            </LinearGradient>
          )}

          <View style={[styles.infoSection, { borderBottomColor: C.border }]}>
            <View style={styles.tagsRow}>
              {plan.tags.map((tag) => (<Chip key={tag} label={tag} small />))}
            </View>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}><Ionicons name="cash-outline" size={14} color={C.gold} /><Text style={[styles.metaText, { color: C.gray800 }]}>{plan.price}</Text></View>
              <View style={[styles.metaDot, { backgroundColor: C.gray500 }]} />
              <View style={styles.metaItem}><Ionicons name="hourglass-outline" size={14} color={C.gold} /><Text style={[styles.metaText, { color: C.gray800 }]}>{plan.duration}</Text></View>
              <View style={[styles.metaDot, { backgroundColor: C.gray500 }]} />
              <View style={styles.metaItem}><Ionicons name={(TRANSPORT_ICONS[plan.transport] || 'walk-outline') as any} size={14} color={C.gold} /><Text style={[styles.metaText, { color: C.gray800 }]}>{plan.transport}</Text></View>
              {plan.places.some((p) => p.latitude && p.longitude) && (
                <>
                  <View style={[styles.metaDot, { backgroundColor: C.gray500 }]} />
                  <TouchableOpacity style={styles.mapBtn} onPress={() => setShowMap(true)} activeOpacity={0.7}>
                    <Ionicons name="map-outline" size={14} color={C.primary} />
                    <Text style={[styles.mapBtnText, { color: C.primary }]}>Voir map</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          <Text style={[styles.sectionLabel, { color: C.gray700 }]}>{t.plan_full}</Text>

          {plan.places.map((place, index) => {
            // Find travel segment to next place
            const travelToNext: TravelSegment | undefined = plan.travelSegments?.find(
              (ts) => ts.fromPlaceId === place.id
            ) || (plan.travelSegments && plan.travelSegments[index]);
            const isLast = index === plan.places.length - 1;

            return (
              <View key={place.id}>
                <TouchableOpacity
                  style={[styles.placeRow, !isLast && !travelToNext ? { borderBottomColor: C.borderLight, borderBottomWidth: 1 } : {}]}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('PlaceDetail', { placeId: place.id, planId: plan.id })}
                >
                  {/* Left column: number + dashed line */}
                  <View style={styles.placeLeftCol}>
                    <View style={[styles.placeNumber, { backgroundColor: C.primary }]}>
                      <Text style={styles.placeNumberText}>{index + 1}</Text>
                    </View>
                  </View>

                  {/* Right column: info */}
                  <View style={styles.placeInfo}>
                    <Text style={[styles.placeName, { color: C.black }]}>{place.name}</Text>
                    <Text style={[styles.placeType, { color: C.gray700 }]}>{place.type} &middot; {place.address.split(',')[0]}</Text>
                    <View style={styles.ratingRow}>
                      <Ionicons name="star" size={12} color={C.primary} style={{ marginRight: 3 }} />
                      <Text style={[styles.ratingNumber, { color: C.black }]}>{place.rating}</Text>
                      <Text style={[styles.ratingCount, { color: C.gray700 }]}>({place.reviewCount} {t.plan_reviews})</Text>
                    </View>
                    {/* Per-place price & duration */}
                    {(place.placePrice != null || place.placeDuration != null) && (
                      <View style={styles.placeMeta}>
                        {place.placePrice != null && place.placePrice > 0 && (
                          <View style={[styles.placeMetaTag, { backgroundColor: C.gray200 }]}>
                            <Ionicons name="cash-outline" size={11} color={C.gold} style={{ marginRight: 3 }} />
                            <Text style={[styles.placeMetaText, { color: C.gray800 }]}>{place.placePrice}€</Text>
                          </View>
                        )}
                        {place.placeDuration != null && place.placeDuration > 0 && (
                          <View style={[styles.placeMetaTag, { backgroundColor: C.gray200 }]}>
                            <Ionicons name="hourglass-outline" size={11} color={C.gold} style={{ marginRight: 3 }} />
                            <Text style={[styles.placeMetaText, { color: C.gray800 }]}>{place.placeDuration}min</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.gray600} />
                </TouchableOpacity>

                {/* Hinge-style customization cards */}
                {(place.customPhoto || place.comment || place.questionAnswer) && (
                  <View style={styles.hingeCards}>
                    {place.customPhoto && (
                      <View style={[styles.hingeCard, { backgroundColor: C.white, borderColor: C.borderLight }]}>
                        <Image source={{ uri: place.customPhoto }} style={styles.hingeCardPhoto} />
                      </View>
                    )}
                    {place.comment && (
                      <View style={[styles.hingeCard, { backgroundColor: C.white, borderColor: C.borderLight }]}>
                        <Text style={[styles.hingeCardLabel, { color: C.gray600 }]}>Mon avis</Text>
                        <Text style={[styles.hingeCardText, { color: C.black }]}>{place.comment}</Text>
                      </View>
                    )}
                    {place.questionAnswer && place.question && (
                      <View style={[styles.hingeCard, { backgroundColor: C.white, borderColor: C.borderLight }]}>
                        <Text style={[styles.hingeCardLabel, { color: C.gray600 }]}>{place.question}</Text>
                        <Text style={[styles.hingeCardText, { color: C.black }]}>{place.questionAnswer}</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Dashed line + travel segment between places */}
                {!isLast && (
                  <View style={styles.travelSegment}>
                    <View style={styles.travelDashedCol}>
                      <View style={[styles.dashedLine, { borderLeftColor: C.primary + '50' }]} />
                    </View>
                    <View style={[styles.travelInfo, { backgroundColor: C.gray200 + '80' }]}>
                      {travelToNext ? (
                        <>
                          <Ionicons name={(TRANSPORT_ICONS[travelToNext.transport] || 'walk-outline') as any} size={13} color={C.gold} style={{ marginRight: 4 }} />
                          <Text style={[styles.travelText, { color: C.gray700 }]}>
                            {travelToNext.transport}
                          </Text>
                          <View style={[styles.travelDot, { backgroundColor: C.gray500 }]} />
                          <Text style={[styles.travelText, { color: C.gray700 }]}>
                            {travelToNext.duration}min
                          </Text>
                        </>
                      ) : (
                        <Text style={[styles.travelText, { color: C.gray500 }]}>⋯</Text>
                      )}
                    </View>
                  </View>
                )}
              </View>
            );
          })}

          {/* ========== COMMENTS SECTION ========== */}
          <Text style={[styles.sectionLabel, { color: C.gray700, marginTop: 24 }]}>
            {t.plan_comments_title} ({localCommentsCount})
          </Text>

          {comments.length === 0 ? (
            <View style={styles.emptyComments}>
              <Text style={[styles.emptyCommentsText, { color: C.gray600 }]}>{t.plan_no_comments}</Text>
              <Text style={[styles.emptyCommentsSub, { color: C.gray500 }]}>{t.plan_no_comments_sub}</Text>
            </View>
          ) : (
            comments.map((comment) => (
              <View key={comment.id} style={[styles.commentRow, { borderBottomColor: C.borderLight }]}>
                <Avatar
                  initials={comment.authorInitials}
                  bg={comment.authorAvatarBg}
                  color={comment.authorAvatarColor}
                  size="S"
                  avatarUrl={comment.authorAvatarUrl}
                />
                <View style={styles.commentContent}>
                  <View style={styles.commentHeader}>
                    <Text style={[styles.commentAuthor, { color: C.black }]}>{comment.authorName}</Text>
                    <Text style={[styles.commentTime, { color: C.gray600 }]}>{getCommentTimeAgo(comment.createdAt)}</Text>
                  </View>
                  <Text style={[styles.commentText, { color: C.gray800 }]}>{comment.text}</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>

        {/* ========== BOTTOM BAR: Actions + Comment Input ========== */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8, backgroundColor: C.white, borderTopColor: C.border }]}>
          {/* Do it now button */}
          {!isGuest && plan.places.some((p) => p.latitude && p.longitude) && (
            <TouchableOpacity
              style={[styles.doItNowBtn, { backgroundColor: isDone ? C.gray300 : C.primary }]}
              onPress={isDone ? undefined : () => setShowTransportChooser(true)}
              activeOpacity={isDone ? 1 : 0.8}
              disabled={isDone}
            >
              <Text style={[styles.doItNowText, isDone && { color: C.gray600 }]}>
                {isDone ? 'Already done it ✓' : 'Do it now ?'}
              </Text>
              {!isDone && <Text style={styles.doItNowEmoji}>🗺</Text>}
            </TouchableOpacity>
          )}
          {/* Action buttons */}
          <View style={styles.actionBar}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
              <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={20} color={isLiked ? C.primary : C.gray600} />
              <Text style={[styles.actionText, { color: isLiked ? C.primary : C.gray800 }]}>{localLikesCount}</Text>
            </TouchableOpacity>
            <View style={styles.actionBtn}>
              <Ionicons name="chatbubble-outline" size={18} color={C.gray600} />
              <Text style={[styles.actionText, { color: C.gray800 }]}>{localCommentsCount}</Text>
            </View>
            <TouchableOpacity style={styles.actionBtn} onPress={handleSave} activeOpacity={isSaved && isDone ? 1 : 0.2}>
              <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={18} color={isSaved ? C.primary : C.gray600} />
              <Text style={[styles.actionText, { color: isSaved ? C.primary : C.gray800 }]}>{isSaved ? t.plan_saved : t.plan_save}</Text>
              {isSaved && isDone && <Ionicons name="lock-closed" size={10} color={C.gray500} style={{ marginLeft: 2 }} />}
            </TouchableOpacity>
            {((plan.proofCount ?? 0) > 0 || (plan.declinedCount ?? 0) > 0) && (
              <View style={styles.proofStatsRow}>
                <MiniStampIcon type="proof" size={16} />
                <Text style={styles.proofStatText}>{plan.proofCount ?? 0}</Text>
                <MiniStampIcon type="declined" size={16} />
                <Text style={styles.declinedStatText}>{plan.declinedCount ?? 0}</Text>
              </View>
            )}
          </View>

          {/* Comment input */}
          {isGuest ? (
            <TouchableOpacity
              style={[styles.commentInputRow, { backgroundColor: C.gray200 }]}
              onPress={() => setShowAccountPrompt(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.commentInput, { color: C.gray600 }]}>{t.plan_comment_placeholder}</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.commentInputRow, { backgroundColor: C.gray200 }]}>
              <RNTextInput
                style={[styles.commentInput, { color: C.black }]}
                placeholder={t.plan_comment_placeholder}
                placeholderTextColor={C.gray600}
                value={commentText}
                onChangeText={setCommentText}
                multiline
                maxLength={500}
              />
              <TouchableOpacity
                onPress={handleSendComment}
                disabled={!commentText.trim() || isSending}
                style={[styles.sendBtn, { opacity: commentText.trim() ? 1 : 0.4 }]}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color={C.primary} />
                ) : (
                  <Text style={[styles.sendBtnText, { color: C.primary }]}>{t.plan_comment_send}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {plan && (
        <>
          <ProofSurveyModal
            visible={showProofSurvey}
            plan={plan}
            onProof={handleProof}
            onDecline={handleDeclineProof}
          />
          <PlanMapModal
            visible={showMap}
            onClose={() => setShowMap(false)}
            title={plan.title}
            places={plan.places
              .filter((p) => p.latitude && p.longitude)
              .map((p) => ({ name: p.name, latitude: p.latitude!, longitude: p.longitude! }))}
          />
          <TransportChooser
            visible={showTransportChooser}
            onClose={() => setShowTransportChooser(false)}
            recommendedTransport={plan.transport}
            authorName={plan.author.username}
            onSelect={(transport) => {
              setShowTransportChooser(false);
              useDoItNowStore.getState().startSession(plan, transport, currentUser!.id);
              navigation.navigate('DoItNow', { planId: plan.id });
              // Notify plan author
              if (currentUser && plan) {
                import('../services/notificationsService').then(({ notifyDoItNow }) => {
                  notifyDoItNow(currentUser, plan).catch((e) => console.error('[notif trigger]', e));
                });
              }
            }}
          />
        </>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  backBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  backChevron: { fontSize: 20, fontWeight: '700', marginTop: -2 },
  headerTitle: { flex: 1, fontSize: 15, fontFamily: Fonts.serifBold, textAlign: 'center', marginHorizontal: 10 },
  doneBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1.5 },
  doneBtnText: { fontSize: 12, fontFamily: Fonts.serifBold },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 14 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 160 },
  bannerWrap: { position: 'relative', overflow: 'hidden' },
  banner: { height: 200, justifyContent: 'flex-end', paddingHorizontal: 18, paddingBottom: 18 },
  bannerTitle: { fontSize: 22, fontFamily: Fonts.serifBold, color: '#FFFFFF', marginBottom: 4 },
  bannerSubtitle: { fontSize: 13, fontFamily: Fonts.serifMedium, color: 'rgba(255,255,255,0.7)' },
  infoSection: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  metaItem: { flexDirection: 'row', alignItems: 'center' },
  metaEmoji: { fontSize: 14, marginRight: 4 },
  metaText: { fontSize: 13, fontFamily: Fonts.serifSemiBold },
  metaDot: { width: 4, height: 4, borderRadius: 2, marginHorizontal: 10 },
  mapBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mapBtnText: { fontSize: 13, fontFamily: Fonts.serifBold },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  planMenu: { position: 'absolute', top: 90, right: 14, borderRadius: 12, borderWidth: 1, paddingVertical: 4, zIndex: 999, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, minWidth: 160 },
  planMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  planMenuText: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
  planMenuDivider: { height: 1, marginHorizontal: 10 },
  doItNowBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 18, marginBottom: 10, paddingVertical: 12, borderRadius: 12 },
  doItNowText: { color: '#FFF', fontSize: 15, fontFamily: Fonts.serifBold },
  doItNowEmoji: { fontSize: 16 },
  sectionLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', paddingHorizontal: 18, marginTop: 18, marginBottom: 10 },
  placeRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10 },
  placeLeftCol: { alignItems: 'center', marginRight: 12 },
  placeNumber: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  placeNumberText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  placeInfo: { flex: 1 },
  placeName: { fontSize: 13, fontFamily: Fonts.serifBold, marginBottom: 2 },
  placeType: { fontSize: 12, fontFamily: Fonts.serif, marginBottom: 3 },
  ratingRow: { flexDirection: 'row', alignItems: 'center' },
  ratingStar: { fontSize: 12, marginRight: 3 },
  ratingNumber: { fontSize: 12, fontFamily: Fonts.serifSemiBold, marginRight: 4 },
  ratingCount: { fontSize: 11 },
  placeMeta: { flexDirection: 'row', marginTop: 6, gap: 6 },
  placeMetaTag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  placeMetaText: { fontSize: 11, fontFamily: Fonts.serifSemiBold },
  placeChevron: { fontSize: 18, marginLeft: 8, marginTop: 6 },

  // Hinge-style customization cards
  hingeCards: { paddingHorizontal: 18, paddingBottom: 6, gap: 10, marginTop: 2 },
  hingeCard: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  hingeCardPhoto: { width: '100%', height: 200, resizeMode: 'cover' },
  hingeCardLabel: { fontSize: 12, fontFamily: Fonts.serif, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  hingeCardText: { fontSize: 20, fontFamily: Fonts.serifBold, paddingHorizontal: 16, paddingBottom: 16, lineHeight: 28 },

  // Travel segment between places
  travelSegment: { flexDirection: 'row', paddingHorizontal: 18, paddingVertical: 2 },
  travelDashedCol: { width: 30, alignItems: 'center' },
  dashedLine: { height: 32, borderLeftWidth: 2, borderStyle: 'dashed' },
  travelInfo: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, marginLeft: 12 },
  travelText: { fontSize: 11, fontFamily: Fonts.serifSemiBold },
  travelDot: { width: 3, height: 3, borderRadius: 1.5, marginHorizontal: 6 },

  // Comments
  emptyComments: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 18 },
  emptyCommentsText: { fontSize: 13, fontFamily: Fonts.serifSemiBold },
  emptyCommentsSub: { fontSize: 12, fontFamily: Fonts.serif, marginTop: 4 },
  commentRow: { flexDirection: 'row', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1 },
  commentContent: { flex: 1, marginLeft: 10 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  commentAuthor: { fontSize: 13, fontFamily: Fonts.serifBold },
  commentTime: { fontSize: 11 },
  commentText: { fontSize: 13, fontFamily: Fonts.serif, lineHeight: 18 },

  // Bottom bar
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopWidth: 1, paddingTop: 8 },
  actionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 18, marginBottom: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  proofStatsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  proofStatText: { fontSize: 13, fontFamily: Fonts.serifSemiBold, color: '#C8571A' },
  declinedStatText: { fontSize: 13, fontFamily: Fonts.serifSemiBold, color: '#6B7A8D' },
  actionIcon: { fontSize: 18 },
  actionText: { fontSize: 13, fontFamily: Fonts.serifSemiBold },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, minHeight: 38 },
  commentInput: { flex: 1, fontSize: 13, maxHeight: 60, paddingVertical: 0 },
  sendBtn: { marginLeft: 8, paddingHorizontal: 4 },
  sendBtnText: { fontSize: 13, fontFamily: Fonts.serifBold },
});
