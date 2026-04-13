import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput as RNTextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Dimensions,
  Animated,
  Modal,
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
import { useAuthStore, useFeedStore, useSavesStore, useGuestStore, useDraftStore, useSocialProofStore } from '../store';
import type { MinimalUser } from '../store';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { Plan, Comment, TravelSegment, TransportMode } from '../types';
import { fetchPlanById, fetchComments, addComment, deletePlan, archivePlan } from '../services/plansService';
import { getPlaceDetails, computeTravelDuration, checkPlaceOpenStatus, PlaceOpenStatus } from '../services/googlePlacesService';
import { useCity } from '../hooks/useCity';
import { ProofSurveyModal } from '../components/ProofSurveyModal';
import { MiniStampIcon } from '../components/MiniStampIcon';
import { PlanMapModal } from '../components/PlanMapModal';
import { TransportChooser } from '../components/TransportChooser';
import { ClosedPlacesSheet } from '../components/ClosedPlacesSheet';
import { SharePlanSheet } from '../components/SharePlanSheet';
import { useDoItNowStore } from '../store/doItNowStore';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const HERO_H = SCREEN_H * 0.46;

const TRANSPORT_ICONS: Record<TransportMode, string> = {
  'Métro': 'train-outline', 'Vélo': 'bicycle-outline', 'À pied': 'walk-outline', 'Voiture': 'car-outline', 'Trottinette': 'flash-outline',
};

const parseGradient = (g: string): string[] => {
  const m = g.match(/#[0-9A-Fa-f]{6}/g);
  return m && m.length >= 2 ? m : ['#FF6B35', '#C94520'];
};

// Reverse-map a stored placePrice to a PRICE_RANGES index (CreateScreen brackets)
const inferPriceRangeIndex = (price: number): number => {
  if (price <= 0) return 0;  // Gratuit
  if (price <= 15) return 1; // < 15
  if (price <= 30) return 2; // 15–30
  if (price <= 60) return 3; // 30–60
  if (price <= 100) return 4; // 60–100
  return 5;                   // 100+
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

// ==================== COMPONENT ====================

export const PlanDetailModal: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { planId } = route.params as { planId: string };
  const C = useColors();
  const cityConfig = useCity();
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
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);

  const savedPlan = savedPlans.find((sp) => sp.planId === planId);
  const isDone = savedPlan?.isDone ?? false;
  const [showProofSurvey, setShowProofSurvey] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showPlanMenu, setShowPlanMenu] = useState(false);
  const [showTransportChooser, setShowTransportChooser] = useState(false);
  const [showClosedSheet, setShowClosedSheet] = useState(false);
  const [closedPlaces, setClosedPlaces] = useState<PlaceOpenStatus[]>([]);
  const [pendingTransport, setPendingTransport] = useState<any>(null);
  const [checkingPlaces, setCheckingPlaces] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);

  const launchDoItNow = useCallback((targetPlan: Plan, transport: any) => {
    useDoItNowStore.getState().startSession(targetPlan, transport, currentUser!.id);
    navigation.navigate('DoItNow', { planId: plan?.id });
    if (currentUser && plan) {
      import('../services/notificationsService').then(({ notifyDoItNow }) => {
        notifyDoItNow(currentUser, plan).catch((e: any) => console.error('[notif trigger]', e));
      });
    }
  }, [currentUser, plan, navigation]);

  const [showLikersSheet, setShowLikersSheet] = useState(false);
  const [likerUsers, setLikerUsers] = useState<MinimalUser[]>([]);

  // Auto-compute missing travel segments
  const [computedSegments, setComputedSegments] = useState<Record<string, TravelSegment>>({});

  useEffect(() => {
    if (!plan || plan.places.length < 2) return;
    const hasTravelData = plan.travelSegments && plan.travelSegments.length > 0;

    plan.places.forEach((place, idx) => {
      if (idx >= plan.places.length - 1) return; // skip last place
      const nextPlace = plan.places[idx + 1];

      // Check if a segment already exists for this pair
      const existing = hasTravelData && plan.travelSegments!.find(
        (ts) => ts.fromPlaceId === place.id || ts.fromPlaceId === place.googlePlaceId
      );
      if (existing && existing.duration > 0) return; // already have valid data
      if (computedSegments[place.id]) return; // already computed

      const originId = place.googlePlaceId || place.id;
      const destId = nextPlace.googlePlaceId || nextPlace.id;
      const transport = plan.transport || 'À pied';

      computeTravelDuration(originId, destId, transport).then((mins) => {
        if (mins !== null) {
          setComputedSegments((prev) => ({
            ...prev,
            [place.id]: { fromPlaceId: place.id, toPlaceId: nextPlace.id, duration: mins, transport },
          }));
        }
      }).catch(() => {});
    });
  }, [plan?.id]);

  // Fetch liker profiles
  useEffect(() => {
    if (!plan || !plan.likedByIds || plan.likedByIds.length === 0) return;
    useSocialProofStore.getState().ensureUsers(plan.likedByIds).then(() => {
      const users = plan.likedByIds!
        .map((id) => useSocialProofStore.getState().getUser(id))
        .filter(Boolean) as MinimalUser[];
      setLikerUsers(users);
    });
  }, [plan?.id, plan?.likedByIds?.length]);

  // Redesign state
  const [showCommentSheet, setShowCommentSheet] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  const isOwner = currentUser && plan && plan.authorId === currentUser.id;

  // ==================== HANDLERS ====================

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

  const handleEditPlan = () => {
    if (!plan) return;
    setShowPlanMenu(false);
    const draftId = 'edit-' + plan.id;
    const existingDraft = useDraftStore.getState().getDraft(draftId);

    // Convert plan places to draft format (fresh copy from published plan)
    const draftPlaces = plan.places.map((p) => ({
      id: p.id,
      googlePlaceId: p.googlePlaceId,
      name: p.name,
      type: p.type,
      address: p.address,
      priceRangeIndex: inferPriceRangeIndex(p.placePrice ?? 0),
      exactPrice: p.placePrice ? String(p.placePrice) : '',
      price: p.placePrice != null ? String(p.placePrice) : '0',
      duration: p.placeDuration != null ? String(p.placeDuration) : '30',
      customPhoto: p.customPhoto,
      comment: p.comment,
      questionAnswer: p.questionAnswer,
      question: p.question,
      questions: p.questions,
      reservationRecommended: p.reservationRecommended,
    }));
    const draftTravels = (plan.travelSegments || []).map((ts) => ({
      fromId: ts.fromPlaceId,
      toId: ts.toPlaceId,
      duration: String(ts.duration),
      transport: ts.transport,
    }));
    const freshData = {
      title: plan.title,
      coverPhotos: plan.coverPhotos || [],
      selectedTags: plan.tags,
      places: draftPlaces,
      travels: draftTravels,
    };

    // Always save a fresh copy so "Annuler les modifications" can reset
    useDraftStore.getState().saveDraft(draftId + '-fresh', freshData);

    // Only save as main draft if no existing partial edit
    if (!existingDraft) {
      useDraftStore.getState().saveDraft(draftId, freshData);
    }

    navigation.goBack();
    setTimeout(() => {
      (navigation as any).navigate('CreateTab', { screen: 'Create', params: { draftId, editPlanId: plan.id, resumeDraft: !!existingDraft } });
    }, 100);
  };

  const pinnedIds = currentUser?.pinnedPlanIds ?? [];
  const isPinned = plan ? pinnedIds.includes(plan.id) : false;

  const handleTogglePin = () => {
    if (!currentUser || !plan) return;
    setShowPlanMenu(false);
    const current = [...pinnedIds];
    const idx = current.indexOf(plan.id);
    if (idx !== -1) {
      current.splice(idx, 1);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      if (current.length >= 3) {
        if (Platform.OS === 'web') {
          window.alert('Maximum 3 plans épinglés — désépingle un plan pour en épingler un autre.');
        } else {
          const { Alert } = require('react-native');
          Alert.alert('Maximum 3 plans épinglés', 'Désépingle un plan pour en épingler un autre.');
        }
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      current.push(plan.id);
    }
    useAuthStore.getState().updateProfile({ pinnedPlanIds: current });
  };

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
    fetchComments(planId).then(setComments);
    if (savedPlans.length === 0 && currentUser) fetchSaves(currentUser.id);
  }, [planId]);

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


  // ==================== DERIVED DATA ====================

  const allPhotos: string[] = plan ? (() => {
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
  })() : [];

  const gradientColors = plan ? parseGradient(plan.gradient) : ['#FF6B35', '#C94520'];

  const creatorTip = plan?.places.find((p) => p.comment)?.comment || null;

  const similarPlans = plan ? feedPlans.filter(
    (p) => p.id !== planId && p.tags.some((tag) => plan.tags.includes(tag))
  ).slice(0, 6) : [];

  const hasMapPlaces = plan?.places.some((p) => p.latitude && p.longitude) ?? false;

  // Parallax
  const heroTranslateY = scrollY.interpolate({
    inputRange: [-HERO_H, 0, HERO_H],
    outputRange: [-HERO_H * 0.5, 0, HERO_H * 0.3],
    extrapolate: 'clamp',
  });
  const heroScale = scrollY.interpolate({
    inputRange: [-200, 0],
    outputRange: [1.4, 1],
    extrapolate: 'clamp',
  });

  const handleDetailPhotoScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    setActivePhotoIndex(Math.round(x / SCREEN_W));
  };

  // ==================== LOADING ====================

  if (!plan) {
    return (
      <View style={[st.container, { backgroundColor: C.white }]}>
        <View style={st.loadingWrap}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={[st.loadingText, { color: C.gray700 }]}>{t.plan_loading}</Text>
        </View>
      </View>
    );
  }

  // ==================== RENDER ====================

  return (
    <View style={[st.container, { backgroundColor: C.white }]}>
      {/* Floating header over hero */}
      <View style={[st.floatingHeader, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity style={st.floatingBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="#FFF" />
        </TouchableOpacity>
        <View style={st.floatingRight}>
          {isOwner && (
            <TouchableOpacity style={st.floatingBtn} onPress={() => setShowPlanMenu(!showPlanMenu)}>
              <Ionicons name="ellipsis-horizontal" size={20} color="#FFF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Owner menu dropdown */}
      {showPlanMenu && (
        <View style={[st.planMenu, { backgroundColor: C.gray200, borderColor: C.border, top: insets.top + 52 }]}>
          <TouchableOpacity style={st.planMenuItem} onPress={handleTogglePin}>
            <Ionicons name={isPinned ? 'pin-outline' : 'pin'} size={18} color={isPinned ? C.gray700 : C.primary} />
            <Text style={[st.planMenuText, { color: isPinned ? C.black : C.primary }]}>
              {isPinned ? 'Désépingler' : 'Épingler'}
            </Text>
          </TouchableOpacity>
          <View style={[st.planMenuDivider, { backgroundColor: C.border }]} />
          <TouchableOpacity style={st.planMenuItem} onPress={handleEditPlan}>
            <Ionicons name="create-outline" size={18} color={C.gray700} />
            <Text style={[st.planMenuText, { color: C.black }]}>Modifier</Text>
          </TouchableOpacity>
          <View style={[st.planMenuDivider, { backgroundColor: C.border }]} />
          <TouchableOpacity style={st.planMenuItem} onPress={handleArchivePlan}>
            <Ionicons name="archive-outline" size={18} color={C.gray700} />
            <Text style={[st.planMenuText, { color: C.black }]}>Archiver</Text>
          </TouchableOpacity>
          <View style={[st.planMenuDivider, { backgroundColor: C.border }]} />
          <TouchableOpacity style={st.planMenuItem} onPress={handleDeletePlan}>
            <Ionicons name="trash-outline" size={18} color={Colors.error} />
            <Text style={[st.planMenuText, { color: Colors.error }]}>Supprimer</Text>
          </TouchableOpacity>
        </View>
      )}

      <Animated.ScrollView
        style={st.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 130 }}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
      >
        {/* ===== HERO ===== */}
        <View style={st.heroWrap}>
          <Animated.View style={[st.heroImageWrap, { transform: [{ translateY: heroTranslateY }, { scale: heroScale }] }]}>
            {allPhotos.length > 0 ? (
              <FlatList
                data={allPhotos}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={handleDetailPhotoScroll}
                scrollEventThrottle={16}
                keyExtractor={(_, i) => String(i)}
                nestedScrollEnabled
                renderItem={({ item }) => (
                  <Image source={{ uri: item }} style={{ width: SCREEN_W, height: HERO_H }} resizeMode="cover" />
                )}
              />
            ) : (
              <LinearGradient colors={gradientColors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: SCREEN_W, height: HERO_H }} />
            )}
          </Animated.View>
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.8)']}
            locations={[0, 0.4, 1]}
            style={st.heroGradient}
            pointerEvents="none"
          />
          <View style={st.heroContent} pointerEvents="none">
            {plan.tags[0] && (
              <View style={st.heroBadge}>
                <Text style={st.heroBadgeText}>{plan.tags[0]}</Text>
              </View>
            )}
            <Text style={st.heroTitle}>{plan.title}</Text>
          </View>
          {allPhotos.length > 1 && (
            <View style={st.heroDots} pointerEvents="none">
              {allPhotos.map((_, i) => (
                <View key={i} style={[st.heroDot, i === activePhotoIndex && st.heroDotActive]} />
              ))}
            </View>
          )}
        </View>

        {/* ===== IDENTITY CARD ===== */}
        <View style={[st.idCard, { backgroundColor: C.gray200, borderColor: C.border }]}>
          <View style={st.idTop}>
            <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: plan.author.id })} activeOpacity={0.7}>
              <Avatar initials={plan.author.initials} bg={plan.author.avatarBg} color={plan.author.avatarColor} size="M" avatarUrl={plan.author.avatarUrl} />
            </TouchableOpacity>
            <View style={st.idInfo}>
              <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: plan.author.id })} activeOpacity={0.7}>
                <Text style={[st.idName, { color: C.black }]}>{plan.author.displayName}</Text>
              </TouchableOpacity>
              <View style={st.idMeta}>
                <UserBadge type={plan.author.badgeType} small />
                <Text style={[st.idRank, { color: C.gray600 }]}>{plan.author.rank}</Text>
                <View style={[st.idDot, { backgroundColor: C.gray500 }]} />
                <Text style={[st.idTime, { color: C.gray600 }]}>{plan.timeAgo}</Text>
              </View>
            </View>
          </View>
          <View style={st.pillsRow}>
            <View style={[st.pill, { backgroundColor: C.gray300 }]}>
              <Ionicons name="cash-outline" size={13} color={C.primary} />
              <Text style={[st.pillText, { color: C.gray800 }]}>{plan.price}</Text>
            </View>
            <View style={[st.pill, { backgroundColor: C.gray300 }]}>
              <Ionicons name="hourglass-outline" size={13} color={C.primary} />
              <Text style={[st.pillText, { color: C.gray800 }]}>{plan.duration}</Text>
            </View>
            <View style={[st.pill, { backgroundColor: C.gray300 }]}>
              <Ionicons name={(TRANSPORT_ICONS[plan.transport] || 'walk-outline') as any} size={13} color={C.primary} />
              <Text style={[st.pillText, { color: C.gray800 }]}>{plan.transport}</Text>
            </View>
            {hasMapPlaces && (
              <TouchableOpacity style={[st.pill, { backgroundColor: C.primary + '20' }]} onPress={() => setShowMap(true)} activeOpacity={0.7}>
                <Ionicons name="map-outline" size={13} color={C.primary} />
                <Text style={[st.pillText, { color: C.primary }]}>Map</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ===== LIKED BY ===== */}
        {likerUsers.length > 0 && (
          <TouchableOpacity style={st.likesRow} onPress={() => setShowLikersSheet(true)} activeOpacity={0.7}>
            <View style={st.likesAvatars}>
              {likerUsers.slice(0, 5).map((u, i) => (
                <View key={u.id} style={[st.likerAvatarWrap, i > 0 && { marginLeft: -6 }]}>
                  <Avatar initials={u.initials} bg={u.avatarBg} color={u.avatarColor} size="SS" avatarUrl={u.avatarUrl ?? undefined} borderColor={C.white} />
                </View>
              ))}
            </View>
            <Text style={[st.likesText, { color: C.gray800 }]} numberOfLines={1}>
              Liked by <Text style={st.likesName}>{likerUsers[0].displayName.split(' ')[0]}</Text>
              {(plan.likedByIds?.length ?? 0) > 1 && (
                <Text> and <Text style={st.likesName}>{(plan.likedByIds!.length - 1)} other{(plan.likedByIds!.length - 1) > 1 ? 's' : ''}</Text></Text>
              )}
            </Text>
          </TouchableOpacity>
        )}

        {/* ===== EXTRA TAGS ===== */}
        {plan.tags.length > 1 && (
          <View style={st.tagsRow}>
            {plan.tags.slice(1).map((tag) => (<Chip key={tag} label={tag} small />))}
          </View>
        )}

        {/* ===== PROOF STATUS BANNER ===== */}
        {isSaved && (
          <TouchableOpacity
            style={[st.proofBanner, {
              backgroundColor: isDone
                ? savedPlan?.proofStatus === 'validated' ? '#C8571A15' : Colors.successBg
                : C.primary + '15',
              borderColor: isDone
                ? savedPlan?.proofStatus === 'validated' ? '#C8571A' : Colors.successBorder
                : C.primary,
            }]}
            onPress={!isDone ? handleMarkDone : undefined}
            activeOpacity={isDone ? 1 : 0.7}
          >
            <Ionicons
              name={isDone ? 'checkmark-circle' : 'flag-outline'}
              size={18}
              color={isDone ? (savedPlan?.proofStatus === 'validated' ? '#C8571A' : Colors.success) : C.primary}
            />
            <Text style={[st.proofBannerText, {
              color: isDone ? (savedPlan?.proofStatus === 'validated' ? '#C8571A' : Colors.success) : C.primary,
            }]}>
              {isDone
                ? savedPlan?.proofStatus === 'validated' ? 'Proof ✓' : t.plan_already_done
                : t.plan_mark_done}
            </Text>
          </TouchableOpacity>
        )}

        {/* ===== CREATOR'S TIP ===== */}
        {creatorTip && (
          <View style={st.tipWrap}>
            <View style={st.tipBar} />
            <View style={st.tipBody}>
              <Text style={[st.tipLabel, { color: C.gray600 }]}>Conseil du créateur</Text>
              <Text style={[st.tipText, { color: C.gray800 }]}>"{creatorTip}"</Text>
            </View>
          </View>
        )}

        {/* ===== ITINERARY ===== */}
        <Text style={[st.sectionLabel, { color: C.gray700 }]}>{t.plan_full}</Text>

        <View style={st.itinerary}>
          {plan.places.map((place, index) => {
            const travelToNext: TravelSegment | undefined =
              plan.travelSegments?.find((ts) => ts.fromPlaceId === place.id || ts.fromPlaceId === place.googlePlaceId) ||
              (plan.travelSegments && plan.travelSegments[index]) ||
              computedSegments[place.id];
            const isLast = index === plan.places.length - 1;
            const placePhoto = place.customPhoto || place.photoUrls?.[0];
            const hasExtras = !!(place.address || place.comment || (place.questionAnswer && place.question) || (place.questions && place.questions.length > 0) || place.customPhoto);

            return (
              <View key={place.id}>
                {/* Place row */}
                <View style={st.placeRow}>
                  <View style={st.tlCol}>
                    <View style={[st.tlLineTop, index === 0 && { backgroundColor: 'transparent' }]} />
                    <View style={[st.tlCircle, { backgroundColor: C.primary }]}>
                      <Text style={st.tlNum}>{index + 1}</Text>
                    </View>
                    <View style={[st.tlLineBot, isLast && !travelToNext && { backgroundColor: 'transparent' }]} />
                  </View>

                  <TouchableOpacity
                    style={[st.placeCard, { backgroundColor: C.gray200, borderColor: C.border }]}
                    onPress={() => navigation.navigate('PlaceDetail', { placeId: place.id, planId: plan.id })}
                    activeOpacity={0.7}
                  >
                    {placePhoto && <Image source={{ uri: placePhoto }} style={st.placeCardImg} />}
                    <View style={st.placeCardBody}>
                      <View style={st.placeCardHead}>
                        <View style={{ flex: 1 }}>
                          <Text style={[st.placeName, { color: C.black }]} numberOfLines={1}>{place.name}{place.reservationRecommended ? <Text style={st.reservationAsterisk}>{' ﹡'}</Text> : null}</Text>
                          <Text style={[st.placeType, { color: C.gray600 }]}>{place.type}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={C.gray500} />
                      </View>
                      <View style={st.ratingRow}>
                        <Ionicons name="star" size={12} color="#F5A623" style={{ marginRight: 3 }} />
                        <Text style={[st.ratingNum, { color: C.black }]}>{place.rating}</Text>
                        <Text style={[st.ratingCnt, { color: C.gray600 }]}>({place.reviewCount} {t.plan_reviews})</Text>
                      </View>
                      {(place.placePrice != null || place.placeDuration != null) && (
                        <View style={st.placeMetaRow}>
                          {place.placePrice != null && place.placePrice > 0 && (
                            <View style={[st.placeMetaPill, { backgroundColor: C.gray300 }]}>
                              <Text style={[st.placeMetaText, { color: C.gray700 }]}>{place.placePrice}{cityConfig.currency}</Text>
                            </View>
                          )}
                          {place.placeDuration != null && place.placeDuration > 0 && (
                            <View style={[st.placeMetaPill, { backgroundColor: C.gray300 }]}>
                              <Text style={[st.placeMetaText, { color: C.gray700 }]}>{place.placeDuration}min</Text>
                            </View>
                          )}
                        </View>
                      )}
                      {/* Inline widgets */}
                      {place.address ? (
                        <View style={st.inlineAddr}>
                          <Ionicons name="location-outline" size={13} color={C.gray600} />
                          <Text style={[st.inlineAddrText, { color: C.gray700 }]} numberOfLines={1}>{place.address.split(',')[0]}</Text>
                        </View>
                      ) : null}
                      {place.comment ? (
                        <View style={[st.inlineQuote, { borderLeftColor: C.primary }]}>
                          <Text style={[st.inlineQuoteText, { color: C.gray800 }]} numberOfLines={2}>"{place.comment}"</Text>
                        </View>
                      ) : null}
                      {(place.questions && place.questions.length > 0 ? place.questions : (place.questionAnswer && place.question ? [{ question: place.question, answer: place.questionAnswer }] : [])).map((qa, qIdx) => (
                        <View key={qIdx} style={[st.inlineQa, { backgroundColor: C.gray300 }]}>
                          <Text style={[st.inlineQaLabel, { color: C.gray600 }]}>{qa.question}</Text>
                          <Text style={[st.inlineQaAnswer, { color: C.black }]} numberOfLines={2}>{qa.answer}</Text>
                        </View>
                      ))}
                    </View>
                    {place.customPhoto && !placePhoto ? (
                      <Image source={{ uri: place.customPhoto }} style={st.placeCardImg} />
                    ) : null}
                  </TouchableOpacity>
                </View>

                {/* Travel segment */}
                {!isLast && (
                  <View style={st.travelRow}>
                    <View style={st.tlCol}>
                      <View style={st.tlLineFull} />
                    </View>
                    <View style={[st.travelBubble, { backgroundColor: C.gray200, borderColor: C.border }]}>
                      {travelToNext ? (
                        <>
                          <Ionicons name={(TRANSPORT_ICONS[travelToNext.transport] || 'walk-outline') as any} size={13} color={C.primary} />
                          <Text style={[st.travelText, { color: C.gray700 }]}>{travelToNext.transport}</Text>
                          <View style={[st.travelDot, { backgroundColor: C.gray500 }]} />
                          <Text style={[st.travelText, { color: C.gray700 }]}>{travelToNext.duration}min</Text>
                        </>
                      ) : (
                        <ActivityIndicator size="small" color={C.gray500} />
                      )}
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Reservation legend */}
        {plan.places.some((p) => p.reservationRecommended) && (
          <Text style={[st.reservationLegend, { color: C.gray600 }]}>﹡ Reservation recommended</Text>
        )}

        {/* ===== SOCIAL PROOF ===== */}
        {((plan.proofCount ?? 0) > 0 || (plan.declinedCount ?? 0) > 0) && (
          <View style={[st.socialProof, { backgroundColor: C.gray200, borderColor: C.border }]}>
            <MiniStampIcon type="proof" size={18} />
            <Text style={[st.socialProofText, { color: C.gray800 }]}>
              {plan.proofCount ?? 0} {(plan.proofCount ?? 0) === 1 ? 'personne' : 'personnes'} l'ont Proof'd
            </Text>
            {(plan.declinedCount ?? 0) > 0 && (
              <>
                <View style={[st.socialDot, { backgroundColor: C.gray500 }]} />
                <MiniStampIcon type="declined" size={18} />
                <Text style={[st.socialDeclined, { color: C.gray600 }]}>{plan.declinedCount}</Text>
              </>
            )}
          </View>
        )}

        {/* ===== SIMILAR PLANS ===== */}
        {similarPlans.length > 0 && (
          <>
            <Text style={[st.sectionLabel, { color: C.gray700, marginTop: 24 }]}>PLANS SIMILAIRES</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.similarScroll}>
              {similarPlans.map((sp) => {
                const spPhoto = sp.coverPhotos?.[0] || sp.places[0]?.photoUrls?.[0];
                const spGrad = parseGradient(sp.gradient);
                return (
                  <TouchableOpacity
                    key={sp.id}
                    style={[st.similarCard, { backgroundColor: C.gray200, borderColor: C.border }]}
                    onPress={() => navigation.push('PlanDetail', { planId: sp.id })}
                    activeOpacity={0.7}
                  >
                    {spPhoto ? (
                      <Image source={{ uri: spPhoto }} style={st.similarImg} />
                    ) : (
                      <LinearGradient colors={spGrad as [string, string, ...string[]]} style={st.similarImg} />
                    )}
                    <View style={st.similarBody}>
                      <Text style={[st.similarTitle, { color: C.black }]} numberOfLines={2}>{sp.title}</Text>
                      <Text style={[st.similarAuthor, { color: C.gray600 }]}>{sp.author.displayName}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}
      </Animated.ScrollView>

      {/* ===== STICKY BOTTOM BAR ===== */}
      <View style={[st.bottomBar, { paddingBottom: insets.bottom + 6, backgroundColor: C.white, borderTopColor: C.border }]}>
        {!isGuest && hasMapPlaces && (
          <TouchableOpacity
            style={[st.doItNowBtn, { backgroundColor: isDone ? C.gray300 : C.primary }]}
            onPress={isDone ? undefined : () => setShowTransportChooser(true)}
            activeOpacity={isDone ? 1 : 0.8}
            disabled={isDone}
          >
            <Ionicons name={isDone ? 'checkmark-circle' : 'navigate'} size={18} color={isDone ? C.gray600 : '#FFF'} />
            <Text style={[st.doItNowText, isDone && { color: C.gray600 }]}>
              {isDone ? 'Déjà fait ✓' : 'Do it now'}
            </Text>
          </TouchableOpacity>
        )}
        <View style={st.actionsRow}>
          <TouchableOpacity style={st.actionBtn} onPress={handleLike} activeOpacity={0.7}>
            <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={22} color={isLiked ? C.primary : C.gray600} />
            <Text style={[st.actionText, { color: isLiked ? C.primary : C.gray800 }]}>{localLikesCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.actionBtn} onPress={() => setShowCommentSheet(true)} activeOpacity={0.7}>
            <Ionicons name="chatbubble-outline" size={20} color={C.gray600} />
            <Text style={[st.actionText, { color: C.gray800 }]}>{localCommentsCount}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={st.actionBtn} onPress={handleSave} activeOpacity={isSaved && isDone ? 1 : 0.7}>
            <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={20} color={isSaved ? C.primary : C.gray600} />
            <Text style={[st.actionText, { color: isSaved ? C.primary : C.gray800 }]}>{isSaved ? t.plan_saved : t.plan_save}</Text>
            {isSaved && isDone && <Ionicons name="lock-closed" size={10} color={C.gray500} style={{ marginLeft: 2 }} />}
          </TouchableOpacity>
          <TouchableOpacity style={st.actionBtn} onPress={() => { if (isGuest) { setShowAccountPrompt(true); return; } setShowShareSheet(true); }} activeOpacity={0.7}>
            <Ionicons name="paper-plane-outline" size={20} color={C.gray600} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ===== COMMENT SHEET ===== */}
      <Modal visible={showCommentSheet} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowCommentSheet(false)}>
          <View style={st.sheetBackdrop}>
            <TouchableWithoutFeedback>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.sheetKav}>
                <View style={[st.sheet, { backgroundColor: C.gray100, paddingBottom: insets.bottom + 8 }]}>
                  <View style={[st.sheetHandle, { backgroundColor: C.gray500 }]} />
                  <Text style={[st.sheetTitle, { color: C.black }]}>{t.plan_comments_title} ({localCommentsCount})</Text>

                  <ScrollView style={st.sheetScroll} keyboardShouldPersistTaps="handled">
                    {comments.length === 0 ? (
                      <View style={st.emptyComments}>
                        <Text style={[st.emptyText, { color: C.gray600 }]}>{t.plan_no_comments}</Text>
                        <Text style={[st.emptySub, { color: C.gray500 }]}>{t.plan_no_comments_sub}</Text>
                      </View>
                    ) : (
                      comments.map((comment) => (
                        <View key={comment.id} style={[st.commentRow, { borderBottomColor: C.border }]}>
                          <Avatar initials={comment.authorInitials} bg={comment.authorAvatarBg} color={comment.authorAvatarColor} size="S" avatarUrl={comment.authorAvatarUrl} />
                          <View style={st.commentBody}>
                            <View style={st.commentHead}>
                              <Text style={[st.commentAuthor, { color: C.black }]}>{comment.authorName}</Text>
                              <Text style={[st.commentTime, { color: C.gray600 }]}>{getCommentTimeAgo(comment.createdAt)}</Text>
                            </View>
                            <Text style={[st.commentText, { color: C.gray800 }]}>{comment.text}</Text>
                          </View>
                        </View>
                      ))
                    )}
                  </ScrollView>

                  {isGuest ? (
                    <TouchableOpacity
                      style={[st.commentInputRow, { backgroundColor: C.gray200 }]}
                      onPress={() => { setShowCommentSheet(false); setShowAccountPrompt(true); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[st.commentPlaceholder, { color: C.gray600 }]}>{t.plan_comment_placeholder}</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={[st.commentInputRow, { backgroundColor: C.gray200 }]}>
                      <RNTextInput
                        style={[st.commentInput, { color: C.black }]}
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
                        style={[st.sendBtn, { opacity: commentText.trim() ? 1 : 0.4 }]}
                      >
                        {isSending ? (
                          <ActivityIndicator size="small" color={C.primary} />
                        ) : (
                          <Ionicons name="send" size={18} color={C.primary} />
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ===== LIKERS SHEET ===== */}
      <Modal visible={showLikersSheet} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setShowLikersSheet(false)}>
          <View style={st.sheetBackdrop}>
            <TouchableWithoutFeedback>
              <View style={[st.sheet, { backgroundColor: C.gray100, paddingBottom: insets.bottom + 8 }]}>
                <View style={[st.sheetHandle, { backgroundColor: C.gray500 }]} />
                <Text style={[st.sheetTitle, { color: C.black }]}>Likes</Text>
                <ScrollView style={st.likersScroll}>
                  {likerUsers.map((u) => (
                    <TouchableOpacity
                      key={u.id}
                      style={st.likerRow}
                      onPress={() => {
                        setShowLikersSheet(false);
                        if (u.id !== currentUser?.id) {
                          navigation.navigate('OtherProfile', { userId: u.id });
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Avatar initials={u.initials} bg={u.avatarBg} color={u.avatarColor} size="S" avatarUrl={u.avatarUrl ?? undefined} />
                      <Text style={[st.likerName, { color: C.black }]}>{u.displayName}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ===== EXISTING MODALS ===== */}
      {plan && (
        <>
          <ProofSurveyModal visible={showProofSurvey} plan={plan} onProof={handleProof} onDecline={handleDeclineProof} />
          <PlanMapModal
            visible={showMap}
            onClose={() => setShowMap(false)}
            title={plan.title}
            places={plan.places.filter((p) => p.latitude && p.longitude).map((p) => ({ name: p.name, latitude: p.latitude!, longitude: p.longitude! }))}
          />
          <TransportChooser
            visible={showTransportChooser}
            onClose={() => { setShowTransportChooser(false); setCheckingPlaces(false); }}
            recommendedTransport={plan.transport}
            authorName={plan.author.username}
            loading={checkingPlaces}
            onSelect={async (transport) => {
              setCheckingPlaces(true);
              // Check open status for all places with a googlePlaceId
              const placesToCheck = plan.places.filter(p => p.googlePlaceId);
              const statuses = await Promise.all(
                placesToCheck.map(p => checkPlaceOpenStatus(p.googlePlaceId!, p.name))
              );
              const closed = statuses.filter(s => s.isPermanentlyClosed || s.isOpen === false);
              setCheckingPlaces(false);
              setShowTransportChooser(false);

              if (closed.length > 0) {
                setClosedPlaces(closed);
                setPendingTransport(transport);
                setShowClosedSheet(true);
              } else {
                // All open — launch directly
                launchDoItNow(plan, transport);
              }
            }}
          />
          <ClosedPlacesSheet
            visible={showClosedSheet}
            closedPlaces={closedPlaces}
            allClosed={closedPlaces.length === plan.places.length}
            onSkipClosed={() => {
              setShowClosedSheet(false);
              const closedIds = new Set(closedPlaces.map(cp => cp.placeId));
              const filteredPlan = { ...plan, places: plan.places.filter(p => !closedIds.has(p.googlePlaceId || '')) };
              launchDoItNow(filteredPlan, pendingTransport);
            }}
            onContinue={() => {
              setShowClosedSheet(false);
              launchDoItNow(plan, pendingTransport);
            }}
            onCancel={() => {
              setShowClosedSheet(false);
              setPendingTransport(null);
              setClosedPlaces([]);
            }}
          />
        </>
      )}

      {/* ===== SHARE PLAN SHEET ===== */}
      {plan && (
        <SharePlanSheet
          visible={showShareSheet}
          onClose={() => setShowShareSheet(false)}
          planId={plan.id}
          planTitle={plan.title}
          planCover={plan.coverPhotos?.[0]}
          planAuthorName={plan.author.displayName}
        />
      )}
    </View>
  );
};

// ==================== STYLES ====================

const st = StyleSheet.create({
  container: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, fontFamily: Fonts.serif },

  // Floating header
  floatingHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  floatingBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  floatingRight: { flexDirection: 'row', gap: 8 },

  // Owner menu
  planMenu: { position: 'absolute', right: 16, borderRadius: 14, borderWidth: 1, paddingVertical: 4, zIndex: 999, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12, minWidth: 160 },
  planMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  planMenuText: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
  planMenuDivider: { height: 1, marginHorizontal: 10 },

  // Scroll
  scroll: { flex: 1 },

  // Hero
  heroWrap: { height: HERO_H, width: SCREEN_W, overflow: 'hidden' },
  heroImageWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  heroGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: HERO_H * 0.65 },
  heroContent: { position: 'absolute', bottom: 28, left: 20, right: 20 },
  heroBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 8 },
  heroBadgeText: { fontSize: 11, fontFamily: Fonts.serifSemiBold, color: '#FFF', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroTitle: { fontSize: 26, fontFamily: Fonts.serifBold, color: '#FFF', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  heroDots: { position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', gap: 5 },
  heroDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  heroDotActive: { backgroundColor: '#FFF', width: 18 },

  // Identity card
  idCard: { marginTop: -30, marginHorizontal: 16, borderRadius: 16, borderWidth: 1, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 },
  idTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  idInfo: { flex: 1 },
  idName: { fontSize: 15, fontFamily: Fonts.serifBold, marginBottom: 2 },
  idMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  idRank: { fontSize: 11, fontFamily: Fonts.serifSemiBold },
  idDot: { width: 3, height: 3, borderRadius: 1.5 },
  idTime: { fontSize: 11, fontFamily: Fonts.serif },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  pillText: { fontSize: 12, fontFamily: Fonts.serifSemiBold },

  // Tags
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 18, marginTop: 14, gap: 6 },

  // Proof banner
  proofBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 14, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  proofBannerText: { fontSize: 13, fontFamily: Fonts.serifBold },

  // Creator tip
  tipWrap: { flexDirection: 'row', marginHorizontal: 18, marginTop: 18 },
  tipBar: { width: 3, borderRadius: 1.5, backgroundColor: Colors.primary, marginRight: 12 },
  tipBody: { flex: 1 },
  tipLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  tipText: { fontSize: 14, fontFamily: Fonts.serif, fontStyle: 'italic', lineHeight: 20 },

  // Section label
  sectionLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', paddingHorizontal: 18, marginTop: 22, marginBottom: 12 },

  // Itinerary
  itinerary: { paddingHorizontal: 10 },

  // Timeline
  tlCol: { width: 40, alignItems: 'center' },
  tlLineTop: { width: 2, height: 16, backgroundColor: Colors.primary + '40' },
  tlLineBot: { width: 2, flex: 1, backgroundColor: Colors.primary + '40' },
  tlLineFull: { width: 2, flex: 1, minHeight: 20, backgroundColor: Colors.primary + '40' },
  tlCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tlNum: { fontSize: 13, fontWeight: '700', color: '#FFF' },

  // Place card
  placeRow: { flexDirection: 'row' },
  placeCard: { flex: 1, borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginLeft: 8, marginBottom: 4 },
  placeCardImg: { width: '100%', height: 140, resizeMode: 'cover' },
  placeCardBody: { padding: 12 },
  placeCardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  placeName: { fontSize: 14, fontFamily: Fonts.serifBold, marginBottom: 2 },
  reservationAsterisk: { fontSize: 10, color: '#C8571A' },
  reservationLegend: { fontSize: 10, fontStyle: 'italic', paddingHorizontal: 20, marginTop: 8, marginBottom: 4 },
  placeType: { fontSize: 12, fontFamily: Fonts.serif, marginBottom: 4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  ratingNum: { fontSize: 12, fontFamily: Fonts.serifSemiBold, marginRight: 4 },
  ratingCnt: { fontSize: 11, fontFamily: Fonts.serif },
  placeMetaRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  placeMetaPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  placeMetaText: { fontSize: 11, fontFamily: Fonts.serifSemiBold },

  // Inline widgets inside place card
  inlineAddr: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  inlineAddrText: { fontSize: 11, fontFamily: Fonts.serif, flex: 1 },
  inlineQuote: { borderLeftWidth: 3, paddingLeft: 8, marginTop: 8 },
  inlineQuoteText: { fontSize: 12, fontFamily: Fonts.serif, fontStyle: 'italic', lineHeight: 17 },
  inlineQa: { marginTop: 8, borderRadius: 8, padding: 8 },
  inlineQaLabel: { fontSize: 10, fontFamily: Fonts.serif, marginBottom: 2 },
  inlineQaAnswer: { fontSize: 12, fontFamily: Fonts.serifSemiBold, lineHeight: 17 },

  // Travel
  travelRow: { flexDirection: 'row', paddingVertical: 2 },
  travelBubble: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  travelText: { fontSize: 11, fontFamily: Fonts.serifSemiBold },
  travelDot: { width: 3, height: 3, borderRadius: 1.5 },

  // Social proof
  socialProof: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 20, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  socialProofText: { fontSize: 13, fontFamily: Fonts.serifSemiBold },
  socialDot: { width: 3, height: 3, borderRadius: 1.5 },
  socialDeclined: { fontSize: 13, fontFamily: Fonts.serifSemiBold },

  // Similar plans
  similarScroll: { paddingHorizontal: 16, gap: 12, paddingBottom: 8 },
  similarCard: { width: 160, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  similarImg: { width: 160, height: 100, resizeMode: 'cover' },
  similarBody: { padding: 10 },
  similarTitle: { fontSize: 13, fontFamily: Fonts.serifBold, marginBottom: 2 },
  similarAuthor: { fontSize: 11, fontFamily: Fonts.serif },

  // Bottom bar
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, borderTopWidth: 1, paddingTop: 8, paddingHorizontal: 16 },
  doItNowBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, marginBottom: 8 },
  doItNowText: { color: '#FFF', fontSize: 15, fontFamily: Fonts.serifBold },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 8 },
  actionText: { fontSize: 13, fontFamily: Fonts.serifSemiBold },

  // Comment sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetKav: { maxHeight: '80%' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontFamily: Fonts.serifBold, marginBottom: 12 },
  sheetScroll: { maxHeight: SCREEN_H * 0.45 },
  emptyComments: { alignItems: 'center', paddingVertical: 30, paddingHorizontal: 18 },
  emptyText: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
  emptySub: { fontSize: 12, fontFamily: Fonts.serif, marginTop: 4 },
  commentRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1 },
  commentBody: { flex: 1, marginLeft: 10 },
  commentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  commentAuthor: { fontSize: 13, fontFamily: Fonts.serifBold },
  commentTime: { fontSize: 11 },
  commentText: { fontSize: 13, fontFamily: Fonts.serif, lineHeight: 18 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, minHeight: 38, marginTop: 8 },
  commentPlaceholder: { fontSize: 13, fontFamily: Fonts.serif },
  commentInput: { flex: 1, fontSize: 13, maxHeight: 60, paddingVertical: 0 },
  sendBtn: { marginLeft: 8, paddingHorizontal: 4 },

  // Likes row (Instagram-style)
  likesRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, marginTop: 14 },
  likesAvatars: { flexDirection: 'row', alignItems: 'center' },
  likerAvatarWrap: { zIndex: 1 },
  likesText: { flex: 1, fontSize: 12, fontFamily: Fonts.serif },
  likesName: { fontFamily: Fonts.serifBold },

  // Likers sheet
  likersScroll: { maxHeight: SCREEN_H * 0.45 },
  likerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4 },
  likerName: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
});
