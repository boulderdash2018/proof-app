import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  Dimensions,
  StatusBar,
  ViewToken,
  Modal,
  TextInput as RNTextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { ImmersiveCard } from '../components/ImmersiveCard';
import { LoadingSkeleton, EmptyState, Avatar } from '../components';
import { SharePlanSheet } from '../components/SharePlanSheet';
import { TransportChooser } from '../components/TransportChooser';
import { ClosedPlacesSheet } from '../components/ClosedPlacesSheet';
import { PlanMapModal } from '../components/PlanMapModal';
import {
  useAuthStore, useFeedStore, useNotifStore,
  useTrendingStore, useSocialProofStore, useChatStore,
} from '../store';
import { useGuestStore } from '../store/guestStore';
import { useDoItNowStore } from '../store/doItNowStore';
import { useCity } from '../hooks/useCity';
import { useTranslation } from '../hooks/useTranslation';
import { Plan, Comment, User } from '../types';
import { fetchComments, addComment } from '../services/plansService';
import { checkPlaceOpenStatus, PlaceOpenStatus } from '../services/googlePlacesService';
import { searchUsers } from '../services/friendsService';
import { detectActiveMention, insertMention, tokenizeComment } from '../utils';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
type FeedTab = 'reco' | 'friends';

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

/* ================================================================
   IMMERSIVE FEED — Creme-style rounded card, horizontal swipe
   ================================================================ */

export const FeedScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const guestInterests = useGuestStore((s) => s.interests);
  const setShowAccountPrompt = useGuestStore((s) => s.setShowAccountPrompt);
  const isGuest = !isAuthenticated;
  const cityConfig = useCity();
  const { t } = useTranslation();

  const {
    plans, friendsPlans,
    isLoading, isFriendsLoading,
    likedPlanIds, savedPlanIds,
    fetchFeed, fetchFriendsFeed,
    toggleLike, toggleSave,
  } = useFeedStore();
  const { unreadCount, subscribe: subscribeNotifs } = useNotifStore();
  const { totalUnread: chatUnread, subscribe: subscribeChat } = useChatStore();

  // ── State ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<FeedTab>('reco');
  const [listH, setListH] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [friendsFetched, setFriendsFetched] = useState(false);
  const [sharePlan, setSharePlan] = useState<Plan | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const flatListRef = useRef<FlatList<Plan>>(null);

  // ── Comment sheet ─────────────────────────────────────────────
  const [commentPlan, setCommentPlan] = useState<Plan | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentCursor, setCommentCursor] = useState(0);
  const [mentionSuggestions, setMentionSuggestions] = useState<User[]>([]);
  const mentionSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSending, setIsSending] = useState(false);

  // ── Do It Now flow ────────────────────────────────────────────
  const [doItNowPlan, setDoItNowPlan] = useState<Plan | null>(null);
  const [showTransportChooser, setShowTransportChooser] = useState(false);
  const [showClosedSheet, setShowClosedSheet] = useState(false);
  const [closedPlaces, setClosedPlaces] = useState<PlaceOpenStatus[]>([]);
  const [pendingTransport, setPendingTransport] = useState<any>(null);
  const [checkingPlaces, setCheckingPlaces] = useState(false);

  // ── Map modal ─────────────────────────────────────────────────
  const [mapPlan, setMapPlan] = useState<Plan | null>(null);

  // ── Animations ─────────────────────────────────────────────────
  const tabIndicatorLeft = useRef(new Animated.Value(0)).current;
  const tabIndicatorWidth = useRef(new Animated.Value(0)).current;
  const recoLayout = useRef({ x: 0, width: 0 });
  const friendsLayout = useRef({ x: 0, width: 0 });
  const bellPulse = useRef(new Animated.Value(1)).current;
  const prevUnreadRef = useRef(unreadCount);

  // ── Status bar — dark on cream ────────────────────────────────
  useFocusEffect(useCallback(() => { StatusBar.setBarStyle('dark-content'); }, []));

  // ── Data fetching ─────────────────────────────────────────────
  useEffect(() => {
    fetchFeed(user?.id, isGuest ? guestInterests : undefined, cityConfig.name);
    if (!isGuest && user?.id) {
      subscribeNotifs(user.id);
      subscribeChat(user.id);
      useSocialProofStore.getState().init(user.id);
    }
    useTrendingStore.getState().fetchTrending(cityConfig.name);
  }, [user?.id, isGuest, cityConfig.name]);

  // ── Bell pulse on new notification ────────────────────────────
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Animated.sequence([
        Animated.timing(bellPulse, { toValue: 1.25, duration: 150, useNativeDriver: true }),
        Animated.timing(bellPulse, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  // ── Tab switching ─────────────────────────────────────────────
  const switchTab = useCallback(
    (tab: FeedTab) => {
      if (tab === activeTab) return;
      if (tab === 'friends' && isGuest) { setShowAccountPrompt(true); return; }
      const target = tab === 'reco' ? recoLayout.current : friendsLayout.current;
      Animated.parallel([
        Animated.spring(tabIndicatorLeft, { toValue: target.x, useNativeDriver: false, friction: 8, tension: 80 }),
        Animated.spring(tabIndicatorWidth, { toValue: target.width, useNativeDriver: false, friction: 8, tension: 80 }),
      ]).start();
      setActiveTab(tab);
      setCurrentIndex(0);
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      if (tab === 'friends' && !friendsFetched) {
        fetchFriendsFeed(cityConfig.name);
        setFriendsFetched(true);
      }
    },
    [activeTab, isGuest, friendsFetched, cityConfig.name],
  );

  // ── Auth guard ────────────────────────────────────────────────
  const requireAuth = useCallback((): boolean => {
    if (isGuest) { setShowAccountPrompt(true); return true; }
    return false;
  }, [isGuest]);

  // ── Actions ───────────────────────────────────────────────────
  const handleLike = useCallback((planId: string) => {
    if (requireAuth()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleLike(planId);
  }, [requireAuth]);

  const handleSave = useCallback((planId: string) => {
    if (requireAuth()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleSave(planId);
  }, [requireAuth]);

  // ── Comment handlers ──────────────────────────────────────────
  const handleOpenComment = useCallback((plan: Plan) => {
    if (requireAuth()) return;
    setCommentPlan(plan);
    setComments([]);
    fetchComments(plan.id).then(setComments);
  }, [requireAuth]);

  const handleSendComment = useCallback(async () => {
    if (!commentText.trim() || !user || isSending || !commentPlan) return;
    setIsSending(true);
    try {
      const newComment = await addComment(commentPlan.id, user, commentText.trim(), commentPlan);
      setComments((prev) => [newComment, ...prev]);
      useFeedStore.setState((state) => ({
        plans: state.plans.map((p) =>
          p.id === commentPlan.id ? { ...p, commentsCount: p.commentsCount + 1 } : p
        ),
      }));
      setCommentText('');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      console.error('Failed to send comment:', err);
    } finally {
      setIsSending(false);
    }
  }, [commentText, user, isSending, commentPlan]);

  const closeCommentSheet = useCallback(() => {
    setCommentPlan(null);
    setCommentText('');
    setMentionSuggestions([]);
  }, []);

  // ── @mention autocomplete ─────────────────────────────────────
  const handleCommentTextChange = useCallback((text: string) => {
    setCommentText(text);
    // Run mention detection on the portion up to the current cursor.
    // RN TextInput doesn't expose cursor directly — we use the onSelectionChange callback
    // to keep commentCursor up to date. We run detection based on latest cursor value.
    const active = detectActiveMention(text, commentCursor > text.length ? text.length : commentCursor);
    if (!active) {
      setMentionSuggestions([]);
      if (mentionSearchTimerRef.current) clearTimeout(mentionSearchTimerRef.current);
      return;
    }
    // Debounce Firestore search
    if (mentionSearchTimerRef.current) clearTimeout(mentionSearchTimerRef.current);
    mentionSearchTimerRef.current = setTimeout(async () => {
      if (active.query.length === 0) {
        // Empty query — don't hit Firestore yet, wait for the user to type at least 1 char
        setMentionSuggestions([]);
        return;
      }
      try {
        const results = await searchUsers(active.query, user?.id || '');
        setMentionSuggestions(results.slice(0, 5));
      } catch (e) {
        console.error('[mention search]', e);
        setMentionSuggestions([]);
      }
    }, 200);
  }, [commentCursor, user?.id]);

  const handleMentionSelect = useCallback((mentioned: User) => {
    const { newText, newCursor } = insertMention(commentText, commentCursor, mentioned.username);
    setCommentText(newText);
    setCommentCursor(newCursor);
    setMentionSuggestions([]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [commentText, commentCursor]);

  // ── Share handler ─────────────────────────────────────────────
  const handleShare = useCallback((plan: Plan) => {
    if (requireAuth()) return;
    setSharePlan(plan);
  }, [requireAuth]);

  // ── Do It Now flow ────────────────────────────────────────────
  const launchDoItNow = useCallback((targetPlan: Plan, transport: any) => {
    useDoItNowStore.getState().startSession(targetPlan, transport, user!.id);
    navigation.navigate('DoItNow', { planId: targetPlan.id });
    if (user && targetPlan) {
      import('../services/notificationsService').then(({ notifyDoItNow }) => {
        notifyDoItNow(user, targetPlan).catch((e: any) => console.error('[notif trigger]', e));
      });
    }
  }, [user, navigation]);

  const handleDoItNow = useCallback((plan: Plan) => {
    if (requireAuth()) return;
    setDoItNowPlan(plan);
    setShowTransportChooser(true);
  }, [requireAuth]);

  const handleTransportSelect = useCallback(async (transport: any) => {
    if (!doItNowPlan) return;
    setCheckingPlaces(true);
    const placesToCheck = doItNowPlan.places.filter((p: any) => p.googlePlaceId);
    const statuses = await Promise.all(
      placesToCheck.map((p: any) => checkPlaceOpenStatus(p.googlePlaceId!, p.name))
    );
    const closed = statuses.filter((s) => s.isPermanentlyClosed || s.isOpen === false);
    setCheckingPlaces(false);
    setShowTransportChooser(false);

    if (closed.length > 0) {
      setClosedPlaces(closed);
      setPendingTransport(transport);
      setShowClosedSheet(true);
    } else {
      launchDoItNow(doItNowPlan, transport);
    }
  }, [doItNowPlan, launchDoItNow]);

  // ── Map handler ───────────────────────────────────────────────
  const handleMapPress = useCallback((plan: Plan) => {
    setMapPlan(plan);
  }, []);

  // ── Viewability tracking for progress ─────────────────────────
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
  ).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  // ── Derived ───────────────────────────────────────────────────
  const currentPlans = activeTab === 'reco' ? plans : friendsPlans;
  const currentLoading = activeTab === 'reco' ? isLoading : isFriendsLoading;
  const progressPercent =
    currentPlans.length > 1 ? ((currentIndex + 1) / currentPlans.length) * 100 : 100;

  const getCoverPhoto = useCallback((plan: Plan): string | undefined => {
    return (
      plan.coverPhotos?.[0] ||
      plan.places?.find((p) => p.photoUrls?.length)?.photoUrls?.[0]
    );
  }, []);

  // ═══════════════════════════════════════════════════════════════
  //  RENDER ITEM — ImmersiveCard with swipe-to-reveal detail
  // ═══════════════════════════════════════════════════════════════
  const renderItem = useCallback(
    ({ item, index }: { item: Plan; index: number }) => (
      <ImmersiveCard
        plan={item}
        width={SCREEN_W}
        height={listH}
        isActive={index === currentIndex}
        isLiked={likedPlanIds.has(item.id)}
        isSaved={savedPlanIds.has(item.id)}
        likesCount={item.likesCount ?? 0}
        commentsCount={item.commentsCount ?? 0}
        onLike={() => handleLike(item.id)}
        onSave={() => handleSave(item.id)}
        onAuthorPress={() => {
          if (!requireAuth())
            navigation.navigate('OtherProfile', { userId: item.authorId });
        }}
        onProfilePress={(userId) => {
          if (!requireAuth()) navigation.navigate('OtherProfile', { userId });
        }}
        onDetailStateChange={setIsDetailOpen}
        onPlacePress={(placeId) => navigation.navigate('PlaceDetail', { placeId, planId: item.id })}
        onComment={() => handleOpenComment(item)}
        onShare={() => handleShare(item)}
        onDoItNow={() => handleDoItNow(item)}
        onMapPress={() => handleMapPress(item)}
      />
    ),
    [listH, currentIndex, likedPlanIds, savedPlanIds, requireAuth, handleLike, handleSave, handleOpenComment, handleShare, handleDoItNow, handleMapPress],
  );

  // ══════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <View style={styles.container}>
      {/* ─── Header (normal flow on cream bg) ─── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.logo}>
            proof<Text style={{ color: Colors.primary }}>.</Text>
          </Text>
          <View style={styles.headerIcons}>
            {isGuest ? (
              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={() => setShowAccountPrompt(true)}
              >
                <Ionicons name="person-add-outline" size={18} color={Colors.textPrimary} />
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.headerIconBtn}
                  onPress={() => navigation.navigate('ChatList')}
                >
                  <Ionicons
                    name={chatUnread > 0 ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
                    size={18}
                    color={Colors.textPrimary}
                  />
                  {chatUnread > 0 && (
                    <View style={styles.headerBadge}>
                      <Text style={styles.headerBadgeText}>
                        {chatUnread > 9 ? '9+' : chatUnread}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.headerIconBtn}
                  onPress={() => navigation.navigate('Notifications')}
                >
                  <Animated.View style={{ transform: [{ scale: bellPulse }] }}>
                    <Ionicons
                      name={unreadCount > 0 ? 'notifications' : 'notifications-outline'}
                      size={19}
                      color={Colors.textPrimary}
                    />
                  </Animated.View>
                  {unreadCount > 0 && (
                    <View style={styles.headerBadge}>
                      <Text style={styles.headerBadgeText}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Tabs: Feed / Amis */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            onLayout={(e: any) => {
              const { x, width } = e.nativeEvent.layout;
              recoLayout.current = { x, width };
              if (activeTab === 'reco') {
                tabIndicatorLeft.setValue(x);
                tabIndicatorWidth.setValue(width);
              }
            }}
            onPress={() => switchTab('reco')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, { opacity: activeTab === 'reco' ? 1 : 0.5 }]}>
              Feed
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onLayout={(e: any) => {
              const { x, width } = e.nativeEvent.layout;
              friendsLayout.current = { x, width };
              if (activeTab === 'friends') {
                tabIndicatorLeft.setValue(x);
                tabIndicatorWidth.setValue(width);
              }
            }}
            onPress={() => switchTab('friends')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, { opacity: activeTab === 'friends' ? 1 : 0.5 }]}>
              Amis
            </Text>
          </TouchableOpacity>
          <Animated.View
            style={[styles.tabIndicator, { left: tabIndicatorLeft, width: tabIndicatorWidth }]}
          />
        </View>
      </View>

      {/* ─── FlatList area ─── */}
      <View style={styles.listArea} onLayout={(e) => setListH(e.nativeEvent.layout.height)}>
        {listH === 0 ? null : currentLoading && currentPlans.length === 0 ? (
          <View style={styles.centeredWrap}>
            <LoadingSkeleton count={1} />
          </View>
        ) : currentPlans.length === 0 ? (
          <View style={styles.centeredWrap}>
            <EmptyState
              icon={activeTab === 'reco' ? '🏙️' : '👥'}
              title={activeTab === 'reco' ? t.feed_empty_title : "Aucun plan d'amis"}
              subtitle={
                activeTab === 'reco'
                  ? t.feed_empty_subtitle
                  : 'Suivez des personnes pour voir leurs plans ici'
              }
              ctaLabel={activeTab === 'reco' ? t.feed_empty_cta : 'Trouver des amis'}
              onCtaPress={() => {
                if (activeTab === 'reco') {
                  if (isGuest) { setShowAccountPrompt(true); return; }
                  navigation.navigate('ExploreTab');
                } else {
                  navigation.navigate('ProfileTab', { screen: 'FriendRequests' });
                }
              }}
            />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            horizontal
            pagingEnabled
            scrollEnabled={!isDetailOpen}
            data={currentPlans}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            windowSize={3}
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            getItemLayout={(_, index) => ({
              length: SCREEN_W,
              offset: SCREEN_W * index,
              index,
            })}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            decelerationRate="fast"
          />
        )}
      </View>

      {/* ─── Progress bar ─── */}
      {currentPlans.length > 1 && (
        <View style={[styles.progressBar, { top: insets.top + 4 }]} pointerEvents="none">
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
          </View>
        </View>
      )}

      {/* ─── Share plan sheet ─── */}
      {sharePlan && (
        <SharePlanSheet
          visible={!!sharePlan}
          onClose={() => setSharePlan(null)}
          planId={sharePlan.id}
          planTitle={sharePlan.title}
          planCover={getCoverPhoto(sharePlan)}
          planAuthorName={sharePlan.author.displayName}
        />
      )}

      {/* ─── Comment sheet ─── */}
      <Modal visible={!!commentPlan} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={closeCommentSheet}>
          <View style={styles.sheetBackdrop}>
            <TouchableWithoutFeedback>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetKav}>
                <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
                  <View style={styles.sheetHandle} />
                  <Text style={styles.sheetTitle}>
                    Commentaires ({commentPlan?.commentsCount ?? 0})
                  </Text>

                  <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
                    {comments.length === 0 ? (
                      <View style={styles.emptyComments}>
                        <Text style={styles.emptyText}>Aucun commentaire</Text>
                        <Text style={styles.emptySub}>Sois le premier à commenter</Text>
                      </View>
                    ) : (
                      comments.map((comment) => (
                        <View key={comment.id} style={styles.commentRow}>
                          <Avatar
                            initials={comment.authorInitials}
                            bg={comment.authorAvatarBg}
                            color={comment.authorAvatarColor}
                            size="S"
                            avatarUrl={comment.authorAvatarUrl ?? undefined}
                          />
                          <View style={styles.commentBody}>
                            <View style={styles.commentHead}>
                              <Text style={styles.commentAuthor}>{comment.authorName}</Text>
                              <Text style={styles.commentTime}>{getCommentTimeAgo(comment.createdAt)}</Text>
                            </View>
                            <Text style={styles.commentText}>
                              {tokenizeComment(comment.text).map((seg, idx) =>
                                seg.type === 'mention' ? (
                                  <Text
                                    key={idx}
                                    style={styles.mentionInText}
                                    onPress={() => {
                                      // Navigate to that user's profile
                                      closeCommentSheet();
                                      navigation.navigate('OtherProfile', { username: seg.value });
                                    }}
                                  >
                                    {seg.raw}
                                  </Text>
                                ) : (
                                  <Text key={idx}>{seg.value}</Text>
                                ),
                              )}
                            </Text>
                          </View>
                        </View>
                      ))
                    )}
                  </ScrollView>

                  {isGuest ? (
                    <TouchableOpacity
                      style={styles.commentInputRow}
                      onPress={() => { closeCommentSheet(); setShowAccountPrompt(true); }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.commentPlaceholder}>Connectez-vous pour commenter</Text>
                    </TouchableOpacity>
                  ) : (
                    <View>
                      {/* Mention autocomplete suggestions — pinned above the input */}
                      {mentionSuggestions.length > 0 && (
                        <View style={styles.mentionSuggestions}>
                          {mentionSuggestions.map((u) => (
                            <TouchableOpacity
                              key={u.id}
                              style={styles.mentionRow}
                              onPress={() => handleMentionSelect(u)}
                              activeOpacity={0.7}
                            >
                              <Avatar
                                initials={u.initials}
                                bg={u.avatarBg}
                                color={u.avatarColor}
                                size="S"
                                avatarUrl={u.avatarUrl || undefined}
                              />
                              <View style={styles.mentionRowText}>
                                <Text style={styles.mentionDisplayName} numberOfLines={1}>
                                  {u.displayName}
                                </Text>
                                <Text style={styles.mentionUsername} numberOfLines={1}>
                                  @{u.username}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}

                      <View style={styles.commentInputRow}>
                        <RNTextInput
                          style={styles.commentInput}
                          placeholder="Ajouter un commentaire…  (tape @ pour mentionner)"
                          placeholderTextColor={Colors.textTertiary}
                          value={commentText}
                          onChangeText={handleCommentTextChange}
                          onSelectionChange={(e) => setCommentCursor(e.nativeEvent.selection.end)}
                          multiline
                          maxLength={500}
                        />
                        <TouchableOpacity
                          onPress={handleSendComment}
                          disabled={!commentText.trim() || isSending}
                          style={[styles.sendBtn, { opacity: commentText.trim() ? 1 : 0.4 }]}
                        >
                          {isSending ? (
                            <ActivityIndicator size="small" color={Colors.primary} />
                          ) : (
                            <Ionicons name="send" size={18} color={Colors.primary} />
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ─── Transport chooser (Do It Now flow) ─── */}
      {doItNowPlan && (
        <TransportChooser
          visible={showTransportChooser}
          onClose={() => { setShowTransportChooser(false); setCheckingPlaces(false); }}
          recommendedTransport={doItNowPlan.transport}
          authorName={doItNowPlan.author?.username}
          loading={checkingPlaces}
          onSelect={handleTransportSelect}
        />
      )}

      {/* ─── Closed places sheet ─── */}
      {doItNowPlan && (
        <ClosedPlacesSheet
          visible={showClosedSheet}
          closedPlaces={closedPlaces}
          allClosed={closedPlaces.length === doItNowPlan.places.length}
          onSkipClosed={() => {
            setShowClosedSheet(false);
            const closedIds = new Set(closedPlaces.map((cp) => cp.placeId));
            const filteredPlan = {
              ...doItNowPlan,
              places: doItNowPlan.places.filter((p: any) => !closedIds.has(p.googlePlaceId || '')),
            };
            launchDoItNow(filteredPlan, pendingTransport);
          }}
          onContinue={() => {
            setShowClosedSheet(false);
            launchDoItNow(doItNowPlan, pendingTransport);
          }}
          onCancel={() => {
            setShowClosedSheet(false);
            setPendingTransport(null);
            setClosedPlaces([]);
          }}
        />
      )}

      {/* ─── Map modal ─── */}
      {mapPlan && (
        <PlanMapModal
          visible={!!mapPlan}
          onClose={() => setMapPlan(null)}
          title={mapPlan.title}
          places={mapPlan.places
            .filter((p: any) => p.latitude && p.longitude)
            .map((p: any) => ({ name: p.name, latitude: p.latitude!, longitude: p.longitude! }))}
        />
      )}
    </View>
  );
};

// ════════════════════════════════════════════════════════════════
//  STYLES
// ════════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },

  // ── Header (normal flow) ───────────────────────────────────
  header: {
    paddingBottom: 4,
    backgroundColor: Colors.bgPrimary,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  logo: {
    fontSize: 30,
    fontFamily: Fonts.logo,
    color: Colors.textPrimary,
    letterSpacing: -1.2,
    lineHeight: 36,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  } as any,
  headerIconBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  headerBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.textOnAccent,
  },

  // ── Tabs ───────────────────────────────────────────────────
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingBottom: 8,
    paddingHorizontal: 16,
  } as any,
  tabText: {
    fontSize: 15,
    fontFamily: Fonts.displayBold,
    color: Colors.textPrimary,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },

  // ── FlatList area ──────────────────────────────────────────
  listArea: {
    flex: 1,
  },

  // ── Progress bar ───────────────────────────────────────────
  progressBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 15,
  },
  progressTrack: {
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(44,36,32,0.15)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1,
    backgroundColor: 'rgba(44,36,32,0.5)',
  },

  // ── Loading / Empty ────────────────────────────────────────
  centeredWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  // ── Comment sheet ─────────────────────────────────────────
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheetKav: {
    maxHeight: '80%',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    backgroundColor: Colors.bgSecondary,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 12,
    backgroundColor: 'rgba(44,36,32,0.15)',
  },
  sheetTitle: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  sheetScroll: {
    maxHeight: SCREEN_H * 0.45,
  },
  emptyComments: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 18,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
  },
  emptySub: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  commentRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  commentBody: {
    flex: 1,
    marginLeft: 10,
  },
  commentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  commentAuthor: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },
  commentTime: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
  },
  commentText: {
    fontSize: 13,
    fontFamily: Fonts.body,
    lineHeight: 18,
    color: Colors.textSecondary,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minHeight: 38,
    marginTop: 8,
    backgroundColor: Colors.bgTertiary,
  },
  commentPlaceholder: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
  },
  commentInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.body,
    maxHeight: 60,
    paddingVertical: 0,
    color: Colors.textPrimary,
  },
  sendBtn: {
    marginLeft: 8,
    paddingHorizontal: 4,
  },

  // ── @mention autocomplete + highlight ──
  mentionSuggestions: {
    marginHorizontal: 0,
    marginBottom: 4,
    maxHeight: 220,
    backgroundColor: Colors.bgSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingVertical: 6,
    shadowColor: 'rgba(44, 36, 32, 1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  mentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  mentionRowText: {
    flex: 1,
    minWidth: 0,
  },
  mentionDisplayName: {
    fontSize: 13.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },
  mentionUsername: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  mentionInText: {
    color: Colors.primary,
    fontFamily: Fonts.bodySemiBold,
  },
});
