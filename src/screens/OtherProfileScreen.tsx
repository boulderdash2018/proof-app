import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout, Fonts, getRankForProofs } from '../constants';
import { Avatar, RankBadge, PrimaryButton, SecondaryButton } from '../components';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { User, Plan } from '../types';
import { useAuthStore, useFriendsStore } from '../store';
import { getUserById, getFollowStatus, isFollowingUser, getFollowerIds, getFollowingIds, followUser, unfollowUser, sendFollowRequest, getPendingRequestId } from '../services/friendsService';
import { fetchUserPlans } from '../services/plansService';

type FollowStatus = 'none' | 'following' | 'requested';

const { width } = Dimensions.get('window');
const CARD_GAP = 8;
const CARD_WIDTH = (width - Layout.screenPadding * 2 - CARD_GAP) / 2;

const parseGradient = (g: string): string[] => {
  const m = g.match(/#[0-9A-Fa-f]{6}/g);
  return m && m.length >= 2 ? m : ['#FF6B35', '#C94520'];
};

export const OtherProfileScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const currentUser = useAuthStore(s => s.user);
  const { acceptRequest, declineRequest } = useFriendsStore();

  const [user, setUser] = useState<User | null>(null);
  const [followStatus, setFollowStatus] = useState<FollowStatus>('none');
  const [theyFollowMe, setTheyFollowMe] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [userPlans, setUserPlans] = useState<Plan[]>([]);
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
        await followUser(currentUser.id, userId);
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

  if (!user) return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <Text style={[styles.back, { color: C.black }]} onPress={() => navigation.goBack()}>‹</Text>
        <Text style={[styles.headerTitle, { color: C.black }]}>{t.loading}</Text>
        <View style={{ width: 30 }} />
      </View>
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={C.primary} />
      </View>
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
          <Avatar initials={user.initials} bg={user.avatarBg} color={user.avatarColor} size="L" avatarUrl={user.avatarUrl} borderColor={C.primary} />
          <View style={styles.statsContainer}>
            <View style={styles.statsRow}>
              <TouchableOpacity style={styles.stat} onPress={() => navigation.push('Following', { userId: user.id })}>
                <Text style={[styles.statValue, { color: C.black }]}>{formatCount(otherFollowingCount)}</Text>
                <Text style={[styles.statLabel, { color: C.gray700 }]}>{t.profile_following}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.stat} onPress={() => navigation.push('Followers', { userId: user.id })}>
                <Text style={[styles.statValue, { color: C.black }]}>{formatCount(otherFollowersCount)}</Text>
                <Text style={[styles.statLabel, { color: C.gray700 }]}>{t.profile_followers}</Text>
              </TouchableOpacity>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: C.black }]}>{formatCount(realLikesReceived)}</Text>
                <Text style={[styles.statLabel, { color: C.gray700 }]}>{t.profile_likes_received}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Name, username, bio */}
        <View style={styles.infoSection}>
          <Text style={[styles.displayName, { color: C.black }]}>{user.displayName}</Text>
          <View style={styles.badgeRow}>
            <RankBadge rank={getRankForProofs(user.total_proof_validations ?? 0)} small />
          </View>
          {canSeeContent && user.bio ? (
            <Text style={[styles.bio, { color: C.gray800 }]}>{user.bio}</Text>
          ) : null}
        </View>

        {/* Action button */}
        <View style={styles.actionSection}>
          {renderFollowButton()}
        </View>

        {/* Content area */}
        {canSeeContent ? (
          <>
            {/* Plans grid */}
            {userPlans.length > 0 ? (
              <View style={styles.plansSection}>
                <Text style={[styles.sectionLabel, { color: C.gray700 }]}>{t.other_profile_plans_section}</Text>
                <View style={styles.plansGrid}>
                  {userPlans.map((plan) => {
                    const colors = parseGradient(plan.gradient);
                    return (
                      <TouchableOpacity
                        key={plan.id}
                        activeOpacity={0.85}
                        onPress={() => navigation.navigate('PlanDetail', { planId: plan.id })}
                      >
                        <LinearGradient
                          colors={colors as [string, string, ...string[]]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.planCard}
                        >
                          <Text style={styles.planCardTitle} numberOfLines={2}>{plan.title}</Text>
                          <View style={styles.planCardMeta}>
                            <View style={styles.planCardMetaItem}>
                              <Ionicons name="heart" size={11} color="rgba(255,255,255,0.85)" />
                              <Text style={styles.planCardMetaText}>{plan.likesCount}</Text>
                            </View>
                            <View style={styles.planCardMetaItem}>
                              <Ionicons name="cash-outline" size={11} color="rgba(255,255,255,0.85)" />
                              <Text style={styles.planCardMetaText}>{plan.price}</Text>
                            </View>
                          </View>
                        </LinearGradient>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View style={styles.emptyPlans}>
                <Text style={[styles.emptyPlansText, { color: C.gray600 }]}>{t.other_profile_no_plans}</Text>
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
  headerTitle: { fontSize: 17, fontFamily: Fonts.serifBold },
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
  statValue: { fontSize: 18, fontFamily: Fonts.serifBold },
  statLabel: { fontSize: 11, marginTop: 2, textTransform: 'capitalize', letterSpacing: 0.3 },

  // Info section
  infoSection: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: 10,
  },
  displayName: { fontSize: 16, fontFamily: Fonts.serifBold, marginBottom: 3 },
  badgeRow: { flexDirection: 'row', marginBottom: 4 },
  bio: { fontSize: 13, fontFamily: Fonts.serif, lineHeight: 18, marginTop: 2 },

  // Action buttons
  actionSection: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: 16,
  },
  primaryBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14, fontFamily: Fonts.serifBold },
  secondaryBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  secondaryBtnText: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
  outlineBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  outlineBtnText: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 4,
  },

  // Plans section
  plansSection: {
    paddingHorizontal: Layout.screenPadding,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
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
  },
  planCardTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: Fonts.serifBold,
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
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
  },
  emptyPlans: {
    paddingVertical: 40,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: 0,
  },
  emptyPlansText: {
    fontSize: 14,
  },

  // Private section
  privateSection: {
    alignItems: 'center',
    paddingVertical: 50,
    paddingHorizontal: 40,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
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
    fontFamily: Fonts.serifBold,
    marginBottom: 8,
  },
  privateSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
