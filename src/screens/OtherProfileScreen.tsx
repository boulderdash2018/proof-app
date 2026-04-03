import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Layout } from '../constants';
import { Avatar, UserBadge, PrimaryButton, SecondaryButton } from '../components';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { User, Plan } from '../types';
import { useAuthStore, useFriendsStore } from '../store';
import { getUserById, getFriendshipStatus, getPendingRequestId } from '../services/friendsService';
import mockApi from '../services/mockApi';

type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends';

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
  const { sendRequest, acceptRequest, declineRequest, removeFriend } = useFriendsStore();

  const [user, setUser] = useState<User | null>(null);
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('none');
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [userPlans, setUserPlans] = useState<Plan[]>([]);
  const C = useColors();
  const { t } = useTranslation();
  const [actionLoading, setActionLoading] = useState(false);

  const userId = route.params?.userId;

  useEffect(() => {
    if (!userId || !currentUser) return;
    getUserById(userId).then(setUser);
    getFriendshipStatus(currentUser.id, userId).then(async (status) => {
      setFriendStatus(status);
      if (status === 'pending_received') {
        const reqId = await getPendingRequestId(userId, currentUser.id);
        setPendingRequestId(reqId);
      }
    });
    mockApi.getUserPlans(userId).then(setUserPlans);
  }, [userId, currentUser]);

  const handleAddFriend = async () => {
    if (!currentUser || !userId) return;
    setActionLoading(true);
    try {
      await sendRequest(currentUser.id, userId);
      setFriendStatus('pending_sent');
    } catch (e: any) {}
    setActionLoading(false);
  };

  const handleAccept = async () => {
    if (!pendingRequestId || !currentUser) return;
    setActionLoading(true);
    await acceptRequest(pendingRequestId, currentUser.id);
    setFriendStatus('friends');
    setActionLoading(false);
  };

  const handleDecline = async () => {
    if (!pendingRequestId || !currentUser) return;
    setActionLoading(true);
    await declineRequest(pendingRequestId, currentUser.id);
    setFriendStatus('none');
    setActionLoading(false);
  };

  const handleRemoveFriend = async () => {
    if (!currentUser || !userId) return;
    setActionLoading(true);
    await removeFriend(currentUser.id, userId);
    setFriendStatus('none');
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
  const canSeeContent = !user.isPrivate || friendStatus === 'friends';

  const renderFriendButton = () => {
    if (actionLoading) {
      return <ActivityIndicator color={C.primary} style={{ marginTop: 12 }} />;
    }
    switch (friendStatus) {
      case 'none':
        return (
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: C.primary }]} onPress={handleAddFriend} activeOpacity={0.8}>
            <Text style={styles.primaryBtnText}>{t.other_profile_add}</Text>
          </TouchableOpacity>
        );
      case 'pending_sent':
        return (
          <View style={[styles.secondaryBtn, { backgroundColor: C.gray200 }]}>
            <Text style={[styles.secondaryBtnText, { color: C.gray700 }]}>{t.other_profile_request_sent}</Text>
          </View>
        );
      case 'pending_received':
        return (
          <View style={styles.buttonRow}>
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: C.primary, flex: 1, marginRight: 8 }]} onPress={handleAccept}>
              <Text style={styles.primaryBtnText}>{t.other_profile_accept}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.outlineBtn, { borderColor: C.border }]} onPress={handleDecline}>
              <Text style={[styles.outlineBtnText, { color: C.gray700 }]}>{t.other_profile_decline}</Text>
            </TouchableOpacity>
          </View>
        );
      case 'friends':
        return (
          <TouchableOpacity style={[styles.secondaryBtn, { backgroundColor: C.gray200 }]} onPress={handleRemoveFriend} activeOpacity={0.7}>
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
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: C.black }]}>{user.planCount}</Text>
                <Text style={[styles.statLabel, { color: C.gray700 }]}>{t.profile_plans}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: C.black }]}>{formatCount(user.followersCount)}</Text>
                <Text style={[styles.statLabel, { color: C.gray700 }]}>{t.profile_friends}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: C.black }]}>{formatCount(user.likesReceived)}</Text>
                <Text style={[styles.statLabel, { color: C.gray700 }]}>likes</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Name, username, bio */}
        <View style={styles.infoSection}>
          <Text style={[styles.displayName, { color: C.black }]}>{user.displayName}</Text>
          <View style={styles.badgeRow}>
            <UserBadge type={user.badgeType} small />
          </View>
          {canSeeContent && user.bio ? (
            <Text style={[styles.bio, { color: C.gray800 }]}>{user.bio}</Text>
          ) : null}
        </View>

        {/* Action button */}
        <View style={styles.actionSection}>
          {renderFriendButton()}
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
                            <Text style={styles.planCardMetaText}>❤️ {plan.likesCount}</Text>
                            <Text style={styles.planCardMetaText}>💰 {plan.price}</Text>
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
              <Text style={styles.lockIcon}>🔒</Text>
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
  headerTitle: { fontSize: 17, fontWeight: '700' },
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
  statValue: { fontSize: 17, fontWeight: '800' },
  statLabel: { fontSize: 11, marginTop: 2 },

  // Info section
  infoSection: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: 10,
  },
  displayName: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  badgeRow: { flexDirection: 'row', marginBottom: 4 },
  bio: { fontSize: 13, lineHeight: 18, marginTop: 2 },

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
  primaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  secondaryBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600' },
  outlineBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  outlineBtnText: { fontSize: 14, fontWeight: '600' },
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
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    marginBottom: 4,
  },
  planCardMeta: {
    flexDirection: 'row',
    gap: 10,
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
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  privateSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
