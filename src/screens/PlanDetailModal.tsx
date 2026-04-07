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
import { useAuthStore, useFeedStore, useSavesStore } from '../store';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { Plan, Comment, TravelSegment, TransportMode } from '../types';
import { fetchPlanById, fetchComments, addComment } from '../services/plansService';

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

  const isLiked = likedPlanIds.has(planId);
  const isSaved = savedPlanIds.has(planId);

  const handleMarkDone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    markAsDone(planId);
  };

  const handleLike = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLocalLikesCount((prev) => prev + (isLiked ? -1 : 1));
    toggleLike(planId);
  };

  const handleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleSave(planId);
  };

  const handleSendComment = async () => {
    if (!commentText.trim() || !currentUser || isSending) return;
    setIsSending(true);
    try {
      const newComment = await addComment(planId, currentUser, commentText.trim());
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
          {isSaved ? (
            <TouchableOpacity
              style={[
                styles.doneBtn,
                isDone
                  ? { backgroundColor: Colors.successBg, borderColor: Colors.successBorder }
                  : { backgroundColor: C.primary + '15', borderColor: C.primary },
              ]}
              onPress={!isDone ? handleMarkDone : undefined}
              activeOpacity={isDone ? 1 : 0.7}
            >
              <Text style={[styles.doneBtnText, { color: isDone ? Colors.success : C.primary }]}>
                {isDone ? t.plan_already_done : t.plan_mark_done}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 34 }} />
          )}
        </View>

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
              <View style={styles.metaItem}><Ionicons name="time-outline" size={14} color={C.gold} /><Text style={[styles.metaText, { color: C.gray800 }]}>{plan.duration}</Text></View>
              <View style={[styles.metaDot, { backgroundColor: C.gray500 }]} />
              <View style={styles.metaItem}><Ionicons name={(TRANSPORT_ICONS[plan.transport] || 'walk-outline') as any} size={14} color={C.gold} /><Text style={[styles.metaText, { color: C.gray800 }]}>{plan.transport}</Text></View>
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
                            <Ionicons name="time-outline" size={11} color={C.gold} style={{ marginRight: 3 }} />
                            <Text style={[styles.placeMetaText, { color: C.gray800 }]}>{place.placeDuration}min</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.gray600} />
                </TouchableOpacity>

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
            <TouchableOpacity style={styles.actionBtn} onPress={handleSave}>
              <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={18} color={isSaved ? C.primary : C.gray600} />
              <Text style={[styles.actionText, { color: isSaved ? C.primary : C.gray800 }]}>{isSaved ? t.plan_saved : t.plan_save}</Text>
            </TouchableOpacity>
          </View>

          {/* Comment input */}
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
        </View>
      </View>
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
  actionIcon: { fontSize: 18 },
  actionText: { fontSize: 13, fontFamily: Fonts.serifSemiBold },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, minHeight: 38 },
  commentInput: { flex: 1, fontSize: 13, maxHeight: 60, paddingVertical: 0 },
  sendBtn: { marginLeft: 8, paddingHorizontal: 4 },
  sendBtnText: { fontSize: 13, fontFamily: Fonts.serifBold },
});
