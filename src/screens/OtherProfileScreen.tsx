import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout, Fonts, getRankForProofs, shouldHideRankBadge } from '../constants';
import { Avatar, RankBadge, FounderBadge, PrimaryButton, SecondaryButton, LoadingSkeleton, SpotCard } from '../components';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { User, Plan, Spot } from '../types';
import { useAuthStore, useFriendsStore, useChatStore } from '../store';
import { getUserById, getFollowStatus, isFollowingUser, getFollowerIds, getFollowingIds, followUser, unfollowUser, sendFollowRequest, getPendingRequestId } from '../services/friendsService';
import { fetchUserPlans, fetchSavedPlans } from '../services/plansService';
import { fetchSpotsByUser } from '../services/spotsService';
import type { ConversationParticipant } from '../services/chatService';

type FollowStatus = 'none' | 'following' | 'requested';

const { width } = Dimensions.get('window');
const CARD_GAP = 8;
const CARD_WIDTH = (width - Layout.screenPadding * 2 - CARD_GAP) / 2;
const GRID_GAP = 2;
const GRID_COLS = 3;
const GRID_CELL = (width - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

const parseGradient = (g: string): string[] => {
  const m = g.match(/#[0-9A-Fa-f]{6}/g);
  return m && m.length >= 2 ? m : ['#FF6B35', '#C94520'];
};

const getPlanPhoto = (plan: { coverPhotos?: string[]; places: { photoUrls?: string[] }[] }): string | null => {
  if (plan.coverPhotos && plan.coverPhotos.length > 0) return plan.coverPhotos[0];
  for (const p of plan.places) {
    if (p.photoUrls && p.photoUrls.length > 0) return p.photoUrls[0];
  }
  return null;
};

export const OtherProfileScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const currentUser = useAuthStore(s => s.user);
  const startChat = useChatStore((s) => s.startChat);
  const { acceptRequest, declineRequest } = useFriendsStore();

  const [user, setUser] = useState<User | null>(null);
  const [followStatus, setFollowStatus] = useState<FollowStatus>('none');
  const [theyFollowMe, setTheyFollowMe] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [userPlans, setUserPlans] = useState<Plan[]>([]);
  const [userSpots, setUserSpots] = useState<Spot[]>([]);
  const [doneByUserPlans, setDoneByUserPlans] = useState<Plan[]>([]);
  const [activeTab, setActiveTab] = useState<'created' | 'spots' | 'done'>('created');
  const [otherFollowersCount, setOtherFollowersCount] = useState(0);
  const [otherFollowingCount, setOtherFollowingCount] = useState(0);
  const C = useColors();
  const { t } = useTranslation();
  const [actionLoading, setActionLoading] = useState(false);

  const userId = route.params?.userId;

  const refreshCounts = useCallback(() => {
    if (!userId) return;
    getFollowerIds(userId).then(ids => setOtherFollowersCount(ids.length));
    getFollowingIds(userId).then(ids => setOtherFollowingCount(ids.length));
  }, [userId]);

  useEffect(() => {
    if (!userId || !currentUser) return;
    getUserById(userId).then(setUser);
    getFollowStatus(currentUser.id, userId).then(async (status) => {
      setFollowStatus(status);
      // If we're not following but have a pending request from them, get request ID
      if (status === 'none') {
        const reqId = await getPendingRequestId(userId, currentUser.id);
        if (reqId) setPendingRequestId(reqId);
      }
    });
    // Check if they follow us (for "follow back" label)
    isFollowingUser(userId, currentUser.id).then(setTheyFollowMe);
    fetchUserPlans(userId).then(setUserPlans);
    fetchSpotsByUser(userId).then(setUserSpots).catch(() => setUserSpots([]));
    // "Plans faits" — saves with isDone, excluding their own plans
    fetchSavedPlans(userId)
      .then((saves) =>
        setDoneByUserPlans(
          saves
            .filter((sp) => sp.isDone && sp.plan && sp.plan.author?.id !== userId)
            .map((sp) => sp.plan),
        ),
      )
      .catch(() => setDoneByUserPlans([]));
    refreshCounts();
  }, [userId, currentUser]);

  useFocusEffect(
    useCallback(() => {
      refreshCounts();
    }, [refreshCounts])
  );

  const handleFollow = async () => {
    if (!currentUser || !userId || !user) return;
    setActionLoading(true);
    try {
      if (user.isPrivate) {
        await sendFollowRequest(currentUser.id, userId);
        setFollowStatus('requested');
      } else {
        await followUser(currentUser.id, userId, currentUser);
        setFollowStatus('following');
        refreshCounts();
      }
    } catch (e: any) {}
    setActionLoading(false);
  };

  const handleUnfollow = async () => {
    if (!currentUser || !userId) return;
    setActionLoading(true);
    await unfollowUser(currentUser.id, userId);
    setFollowStatus('none');
    refreshCounts();
    setActionLoading(false);
  };

  const handleAcceptFollowRequest = async () => {
    if (!pendingRequestId || !currentUser) return;
    setActionLoading(true);
    await acceptRequest(pendingRequestId, currentUser.id);
    setTheyFollowMe(true);
    setPendingRequestId(null);
    refreshCounts();
    setActionLoading(false);
  };

  const handleDeclineFollowRequest = async () => {
    if (!pendingRequestId || !currentUser) return;
    setActionLoading(true);
    await declineRequest(pendingRequestId, currentUser.id);
    setPendingRequestId(null);
    setActionLoading(false);
  };

  const handleSendMessage = async () => {
    if (!currentUser || !user) return;
    const me: ConversationParticipant = {
      userId: currentUser.id,
      displayName: currentUser.displayName,
      username: currentUser.username,
      avatarUrl: currentUser.avatarUrl || null,
      avatarBg: currentUser.avatarBg,
      avatarColor: currentUser.avatarColor,
      initials: currentUser.initials,
    };
    const other: ConversationParticipant = {
      userId: user.id,
      displayName: user.displayName,
      username: user.username,
      avatarUrl: user.avatarUrl || null,
      avatarBg: user.avatarBg,
      avatarColor: user.avatarColor,
      initials: user.initials,
    };
    try {
      const conversationId = await startChat(me, other);
      navigation.navigate('Conversation', { conversationId, otherUser: other });
    } catch (err) {
      console.error('[OtherProfile] startChat error:', err);
    }
  };

  if (!user) return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <Text style={[styles.back, { color: C.black }]} onPress={() => navigation.goBack()}>‹</Text>
        <Text style={[styles.headerTitle, { color: C.black }]}>{t.loading}</Text>
        <View style={{ width: 30 }} />
      </View>
      <LoadingSkeleton variant="profile" />
    </View>
  );

  const formatCount = (n: number) => n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : n.toString();
  const canSeeContent = !user.isPrivate || followStatus === 'following';

  // Compute real stats from fetched plans
  const realPlanCount = userPlans.length;
  const realLikesReceived = userPlans.reduce((sum, p) => sum + (p.likesCount || 0), 0);

  const renderFollowButton = () => {
    if (actionLoading) {
      return <ActivityIndicator color={C.primary} style={{ marginTop: 12 }} />;
    }

    // If they sent us a follow request (pending), show accept/decline
    if (pendingRequestId && followStatus !== 'following') {
      return (
        <View style={styles.buttonRow}>
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: C.primary, flex: 1, marginRight: 8 }]} onPress={handleAcceptFollowRequest}>
            <Text style={styles.primaryBtnText}>{t.other_profile_accept}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.outlineBtn, { borderColor: C.border }]} onPress={handleDeclineFollowRequest}>
            <Text style={[styles.outlineBtnText, { color: C.gray700 }]}>{t.other_profile_decline}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    switch (followStatus) {
      case 'none':
        return (
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: C.primary }]} onPress={handleFollow} activeOpacity={0.8}>
            <Text style={styles.primaryBtnText}>
              {theyFollowMe ? t.other_profile_follow_back : t.other_profile_add}
            </Text>
          </TouchableOpacity>
        );
      case 'requested':
        return (
          <View style={[styles.secondaryBtn, { backgroundColor: C.gray200 }]}>
            <Text style={[styles.secondaryBtnText, { color: C.gray700 }]}>{t.other_profile_request_sent}</Text>
          </View>
        );
      case 'following':
        return (
          <TouchableOpacity style={[styles.secondaryBtn, { backgroundColor: C.gray200 }]} onPress={handleUnfollow} activeOpacity={0.7}>
            <Text style={[styles.secondaryBtnText, { color: C.black }]}>✓ {t.other_profile_friends}</Text>
          </TouchableOpacity>
        );
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <Text style={[styles.back, { color: C.black }]} onPress={() => navigation.goBack()}>‹</Text>
        <Text style={[styles.headerTitle, { color: C.black }]}>{user.username}</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Profile header - always visible */}
        <View style={styles.profileHeader}>
          <Avatar initials={user.initials} bg={user.avatarBg} color={user.avatarColor} size="L" avatarUrl={user.avatarUrl ?? undefined} borderColor={C.primary} />
          <View style={styles.statsContainer}>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: C.black }]}>{formatCount(realPlanCount)}</Text>
                <Text style={[styles.statLabel, { color: C.gray700 }]}>{t.profile_plans}</Text>
              </View>
              <TouchableOpacity style={styles.stat} onPress={() => navigation.push('Followers', { userId: user.id })}>
                <Text style={[styles.statValue, { color: C.black }]}>{formatCount(otherFollowersCount)}</Text>
                <Text style={[styles.statLabel, { color: C.gray700 }]}>{t.profile_followers}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stat} onPress={() => navigation.push('Following', { userId: user.id })}>
                <Text style={[styles.statValue, { color: C.black }]}>{formatCount(otherFollowingCount)}</Text>
                <Text style={[styles.statLabel, { color: C.gray700 }]}>{t.profile_following}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Name, username, bio */}
        <View style={styles.infoSection}>
          <Text style={[styles.displayName, { color: C.black }]}>{user.displayName}</Text>
          <View style={styles.badgeRow}>
            {user.isFounder && <FounderBadge small />}
            {(() => {
              const rank = getRankForProofs(user.total_proof_validations ?? 0);
              if (shouldHideRankBadge(user.username, rank)) return null;
              return <RankBadge rank={rank} small />;
            })()}
          </View>
          {canSeeContent && user.bio ? (
            <Text style={[styles.bio, { color: C.gray800 }]}>{user.bio}</Text>
          ) : null}
        </View>

        {/* Action buttons — follow + message (Instagram-style) */}
        <View style={styles.actionSection}>
          <View style={styles.actionBtnRow}>
            <View style={{ flex: 1 }}>{renderFollowButton()}</View>
            {/* Hide the message button only if this is our own profile (shouldn't happen
                on OtherProfileScreen, but defensive). */}
            {currentUser?.id !== user.id && (
              <TouchableOpacity
                style={[styles.messageBtn, { backgroundColor: C.gray200 }]}
                onPress={handleSendMessage}
                activeOpacity={0.7}
              >
                <Ionicons name="chatbubble-outline" size={16} color={C.black} style={{ marginRight: 6 }} />
                <Text style={[styles.messageBtnText, { color: C.black }]}>Message</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Content area */}
        {canSeeContent ? (
          <>
            {/* Tabs — icons only, Instagram-style */}
            <View style={[styles.tabRow, { borderTopColor: C.border, borderBottomColor: C.border }]}>
              <TouchableOpacity
                style={styles.tabBtn}
                onPress={() => setActiveTab('created')}
                activeOpacity={0.7}
                accessibilityLabel="Plans créés"
              >
                <Ionicons
                  name="grid-outline"
                  size={22}
                  color={activeTab === 'created' ? C.black : C.gray500}
                />
                {activeTab === 'created' && (
                  <View style={[styles.tabUnderline, { backgroundColor: C.primary }]} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tabBtn}
                onPress={() => setActiveTab('spots')}
                activeOpacity={0.7}
                accessibilityLabel="Spots recommandés"
              >
                <Ionicons
                  name={activeTab === 'spots' ? 'sparkles' : 'sparkles-outline'}
                  size={22}
                  color={activeTab === 'spots' ? C.black : C.gray500}
                />
                {activeTab === 'spots' && (
                  <View style={[styles.tabUnderline, { backgroundColor: C.primary }]} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tabBtn}
                onPress={() => setActiveTab('done')}
                activeOpacity={0.7}
                accessibilityLabel="Plans faits"
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={24}
                  color={activeTab === 'done' ? C.black : C.gray500}
                />
                {activeTab === 'done' && (
                  <View style={[styles.tabUnderline, { backgroundColor: C.primary }]} />
                )}
              </TouchableOpacity>
            </View>

            {activeTab === 'spots' ? (
              userSpots.length > 0 ? (
                <View style={styles.spotsList}>
                  {userSpots.map((spot) => (
                    <View key={spot.id}>
                      <SpotCard spot={spot} />
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptySpots}>
                  <Ionicons name="sparkles-outline" size={36} color={C.gray500} />
                  <Text style={[styles.emptyPlansText, { color: C.gray600 }]}>
                    Aucun spot recommandé
                  </Text>
                </View>
              )
            ) : activeTab === 'created' ? (
              userPlans.length > 0 ? (
                <View style={styles.instaGrid}>
                  {(() => {
                    const otherPinnedIds = user?.pinnedPlanIds ?? [];
                    const sorted = [...userPlans].sort((a, b) => {
                      const aPin = otherPinnedIds.indexOf(a.id);
                      const bPin = otherPinnedIds.indexOf(b.id);
                      if (aPin !== -1 && bPin !== -1) return aPin - bPin;
                      if (aPin !== -1) return -1;
                      if (bPin !== -1) return 1;
                      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                    });
                    return sorted.map((plan) => {
                      const colors = parseGradient(plan.gradient);
                      const photo = getPlanPhoto(plan);
                      const isPinned = otherPinnedIds.includes(plan.id);
                      return (
                        <TouchableOpacity key={plan.id} activeOpacity={0.85} onPress={() => navigation.navigate('PlanDetail', { planId: plan.id })}>
                          <View style={styles.instaCell}>
                            {photo ? (
                              <Image source={{ uri: photo }} style={styles.instaCellImage} />
                            ) : (
                              <LinearGradient colors={colors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                            )}
                            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={styles.instaCellOverlay} />
                            {isPinned && (
                              <View style={styles.pinBadge}>
                                <Ionicons name="pin" size={12} color="#FFF" />
                              </View>
                            )}
                            <View style={styles.instaCellBottom}>
                              <Text style={styles.instaCellTitle} numberOfLines={2}>{plan.title}</Text>
                              <View style={styles.instaCellLikes}>
                                <Ionicons name="heart" size={11} color="#FFF" />
                                <Text style={styles.instaCellLikesText}>{plan.likesCount ?? 0}</Text>
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    });
                  })()}
                </View>
              ) : (
                <View style={styles.emptyPlans}>
                  <Text style={[styles.emptyPlansText, { color: C.gray600 }]}>{t.other_profile_no_plans}</Text>
                </View>
              )
            ) : doneByUserPlans.length > 0 ? (
              <View style={styles.instaGrid}>
                {doneByUserPlans.map((plan) => {
                  const colors = parseGradient(plan.gradient);
                  const photo = getPlanPhoto(plan);
                  return (
                    <TouchableOpacity key={plan.id} activeOpacity={0.85} onPress={() => navigation.navigate('PlanDetail', { planId: plan.id })}>
                      <View style={styles.instaCell}>
                        {photo ? (
                          <Image source={{ uri: photo }} style={styles.instaCellImage} />
                        ) : (
                          <LinearGradient colors={colors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                        )}
                        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={styles.instaCellOverlay} />
                        <View style={styles.instaCellBottom}>
                          <Text style={styles.instaCellTitle} numberOfLines={2}>{plan.title}</Text>
                          <View style={styles.instaCellLikes}>
                            <Ionicons name="heart" size={11} color="#FFF" />
                            <Text style={styles.instaCellLikesText}>{plan.likesCount ?? 0}</Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyPlans}>
                <Text style={[styles.emptyPlansText, { color: C.gray600 }]}>Pas encore de plans faits</Text>
              </View>
            )}
          </>
        ) : (
          /* Private account message */
          <View style={styles.privateSection}>
            <View style={[styles.lockCircle, { borderColor: C.gray400 }]}>
              <Ionicons name="lock-closed" size={28} color={C.gray600} />
            </View>
            <Text style={[styles.privateTitle, { color: C.black }]}>{t.other_profile_private_title}</Text>
            <Text style={[styles.privateSubtitle, { color: C.gray700 }]}>{t.other_profile_private_subtitle}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  back: { fontSize: 24, fontWeight: '600', width: 30 },
  headerTitle: { fontSize: 17, fontFamily: Fonts.bodySemiBold },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: 30 },

  // Profile header (Instagram-style horizontal layout)
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 20,
    paddingBottom: 12,
  },
  statsContainer: {
    flex: 1,
    marginLeft: 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 18, fontFamily: Fonts.bodyBold },
  statLabel: { fontSize: 11, marginTop: 2, textTransform: 'capitalize', letterSpacing: 0.3 },

  // Info section
  infoSection: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: 10,
  },
  displayName: { fontSize: 16, fontFamily: Fonts.bodyBold, marginBottom: 3 },
  badgeRow: { flexDirection: 'row', marginBottom: 4 },
  bio: { fontSize: 13, fontFamily: Fonts.body, lineHeight: 18, marginTop: 2 },

  // Action buttons
  actionSection: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: 16,
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  messageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
    minWidth: 120,
  },
  messageBtnText: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
  },
  primaryBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: Colors.textOnAccent, fontSize: 14, fontFamily: Fonts.bodySemiBold },
  secondaryBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  secondaryBtnText: { fontSize: 14, fontFamily: Fonts.bodySemiBold },
  outlineBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  outlineBtnText: { fontSize: 14, fontFamily: Fonts.bodySemiBold },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 4,
  },

  // Plans section
  plansSection: {
    paddingHorizontal: Layout.screenPadding,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    paddingTop: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  plansGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  planCard: {
    width: CARD_WIDTH,
    height: 110,
    borderRadius: 14,
    padding: 12,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  planCardImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  planCardOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 70,
  },
  planCardTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: Fonts.displaySemiBold,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    marginBottom: 4,
  },
  planCardMeta: {
    flexDirection: 'row',
    gap: 10,
  },
  planCardMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  planCardMetaText: {
    color: 'rgba(255,248,240,0.85)',
    fontSize: 11,
    fontWeight: '600',
  },
  // Tabs — plans créés / plans faits (au-dessus de la grille, style Instagram-like)
  tabRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  } as any,
  tabUnderline: {
    position: 'absolute',
    left: '40%',
    right: '40%',
    bottom: -StyleSheet.hairlineWidth,
    height: 2,
    borderRadius: 1,
  },
  emptyPlans: {
    paddingVertical: 40,
    alignItems: 'center',
    marginTop: 0,
  },
  emptyPlansText: {
    fontSize: 14,
  },
  // Spots tab — vertical stack of SpotCards with breathing room
  // for the flip mechanic.
  spotsList: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 14,
    gap: 16,
  } as any,
  emptySpots: {
    paddingVertical: 50,
    alignItems: 'center',
    gap: 10,
  },

  // Private section
  privateSection: {
    alignItems: 'center',
    paddingVertical: 50,
    paddingHorizontal: 40,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  lockCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  lockIcon: { fontSize: 28 },
  privateTitle: {
    fontSize: 17,
    fontFamily: Fonts.displaySemiBold,
    marginBottom: 8,
  },
  privateSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  // Instagram-style grid
  instaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  instaCell: { width: GRID_CELL, height: GRID_CELL, overflow: 'hidden' },
  instaCellImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', resizeMode: 'cover' } as any,
  instaCellOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%' } as any,
  instaCellBottom: { position: 'absolute', bottom: 8, left: 8, right: 8 },
  instaCellTitle: { color: '#FFF', fontSize: 12, fontFamily: Fonts.displaySemiBold, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  instaCellLikes: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 } as any,
  instaCellLikesText: { color: '#FFF', fontSize: 10, fontFamily: Fonts.bodySemiBold, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  pinBadge: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(44,36,32,0.55)', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
});
