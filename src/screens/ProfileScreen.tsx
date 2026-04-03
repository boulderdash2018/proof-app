import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Layout } from '../constants';
import { Avatar } from '../components';
import { useAuthStore, useFriendsStore, useSavesStore } from '../store';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { Badge, BadgeId } from '../types';
import mockApi from '../services/mockApi';
import { getFriendIds } from '../services/friendsService';
import { fetchUserPlans } from '../services/plansService';

const { width } = Dimensions.get('window');
const MINI_CARD_W = (width - Layout.screenPadding * 2 - 8) / 2;

const parseGradient = (g: string): string[] => {
  const m = g.match(/#[0-9A-Fa-f]{6}/g);
  return m && m.length >= 2 ? m : ['#FF6B35', '#C94520'];
};

export const ProfileScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { incomingRequests, fetchIncomingRequests } = useFriendsStore();
  const { savedPlans, fetchSaves } = useSavesStore();
  const C = useColors();
  const { t } = useTranslation();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [userPlans, setUserPlans] = useState<any[]>([]);
  const [friendCount, setFriendCount] = useState<number>(0);

  useEffect(() => {
    if (user) {
      mockApi.getBadges(user.unlockedBadges).then(setBadges);
      fetchUserPlans(user.id).then(setUserPlans);
      fetchIncomingRequests(user.id);
      getFriendIds(user.id).then(ids => setFriendCount(ids.length));
      fetchSaves(user.id);
    }
  }, [user]);

  // Refresh data every time the profile tab is focused
  useFocusEffect(
    useCallback(() => {
      if (user) {
        getFriendIds(user.id).then(ids => setFriendCount(ids.length));
        fetchIncomingRequests(user.id);
        fetchUserPlans(user.id).then(setUserPlans);
        fetchSaves(user.id);
      }
    }, [user])
  );

  const donePlans = savedPlans.filter((sp) => sp.isDone);
  const todoPlans = savedPlans.filter((sp) => !sp.isDone);

  if (!user) return null;

  const xpProgress = user.xpPoints / user.xpForNextLevel;
  const displayXp = user.xpPoints % 1000 || user.xpPoints;

  const formatCount = (n: number): string => {
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k';
    return n.toString();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      <View style={[styles.header, { borderBottomColor: C.borderLight }]}>
        <Text style={[styles.headerTitle, { color: C.black }]}>{t.profile_title}</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => navigation.navigate('FriendRequests')} style={styles.friendReqBtn}>
            <Text style={styles.friendReqIcon}>👥</Text>
            {incomingRequests.length > 0 && (
              <View style={[styles.badge, { backgroundColor: C.primary }]}>
                <Text style={styles.badgeText}>{incomingRequests.length}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
            <Text style={styles.settingsIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={[styles.hero, { borderBottomColor: C.border }]}>
          <Avatar initials={user.initials} bg={user.avatarBg} color={user.avatarColor} size="L" avatarUrl={user.avatarUrl} borderColor={C.primary} />
          <Text style={[styles.displayName, { color: C.black }]}>{user.displayName}</Text>
          <View style={styles.rankBadge}>
            <Text style={[styles.rankText, { color: C.primary }]}>{user.rank} · Lv. {user.level}</Text>
          </View>
        </View>

        <View style={styles.xpSection}>
          <View style={styles.xpLabels}>
            <Text style={[styles.xpLabel, { color: C.gray700 }]}>XP {user.xpPoints} / {user.xpForNextLevel}</Text>
            <Text style={[styles.xpLabel, { color: C.gray700 }]}>→ Lv. {user.level + 1}</Text>
          </View>
          <View style={[styles.xpBarBg, { backgroundColor: C.gray300 }]}>
            <View style={[styles.xpBarFill, { width: `${Math.min(xpProgress * 100, 100)}%`, backgroundColor: C.primary }]} />
          </View>
        </View>

        <View style={styles.currencyRow}>
          <View style={[styles.xpPill, { backgroundColor: C.goldBg, borderColor: C.goldBorder }]}>
            <Text style={[styles.xpPillText, { color: C.gold }]}>⭐ {displayXp} XP pts</Text>
          </View>
          <View style={[styles.coinsPill, { backgroundColor: C.successBg, borderColor: C.successBorder }]}>
            <Text style={[styles.coinsPillText, { color: C.success }]}>+ {user.coins} coins</Text>
          </View>
        </View>

        <View style={[styles.statsRow, { borderBottomColor: C.border }]}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: C.black }]}>{user.planCount}</Text>
            <Text style={[styles.statLabel, { color: C.gray700 }]}>{t.profile_plans}</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: C.border }]} />
          <TouchableOpacity style={styles.stat} onPress={() => navigation.navigate('Followers', { userId: user.id })}>
            <Text style={[styles.statValue, { color: C.black }]}>{formatCount(friendCount)}</Text>
            <Text style={[styles.statLabel, { color: C.gray700 }]}>{t.profile_friends}</Text>
          </TouchableOpacity>
          <View style={[styles.statDivider, { backgroundColor: C.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: C.black }]}>{formatCount(user.likesReceived)}</Text>
            <Text style={[styles.statLabel, { color: C.gray700 }]}>{t.profile_likes_received}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: C.gray700 }]}>{t.profile_badges}</Text>
          <View style={styles.badgesGrid}>
            {badges.map((b) => (
              <View key={b.id} style={[styles.badgeItem, !b.isUnlocked && { opacity: 0.3 }]}>
                <View style={[styles.badgeIcon, { backgroundColor: C.gray200 }]}>
                  <Text style={styles.badgeEmoji}>{b.isUnlocked ? b.emoji : '🔒'}</Text>
                </View>
                <Text style={[styles.badgeName, { color: C.gray800 }]} numberOfLines={1}>{b.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {userPlans.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: C.gray700 }]}>{t.profile_recent_plans}</Text>
            <View style={styles.plansGrid}>
              {userPlans.map((plan) => {
                const colors = parseGradient(plan.gradient);
                return (
                  <TouchableOpacity key={plan.id} activeOpacity={0.85} onPress={() => navigation.navigate('PlanDetail', { planId: plan.id })}>
                    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.miniCard}>
                      <Text style={styles.miniCardTitle} numberOfLines={2}>{plan.title}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {donePlans.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: C.gray700 }]}>{t.profile_done_plans}</Text>
            <View style={styles.plansGrid}>
              {donePlans.map((sp) => {
                const colors = parseGradient(sp.plan.gradient);
                return (
                  <TouchableOpacity key={sp.planId} activeOpacity={0.85} onPress={() => navigation.navigate('PlanDetail', { planId: sp.planId })}>
                    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.miniCard}>
                      <View style={styles.doneCheck}><Text style={styles.doneCheckText}>✓</Text></View>
                      <Text style={styles.miniCardTitle} numberOfLines={2}>{sp.plan.title}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {todoPlans.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: C.gray700 }]}>{t.profile_saved_plans}</Text>
            <View style={styles.plansGrid}>
              {todoPlans.map((sp) => {
                const colors = parseGradient(sp.plan.gradient);
                return (
                  <TouchableOpacity key={sp.planId} activeOpacity={0.85} onPress={() => navigation.navigate('PlanDetail', { planId: sp.planId })}>
                    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.miniCard}>
                      <Text style={styles.miniCardTitle} numberOfLines={2}>{sp.plan.title}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingVertical: 10, borderBottomWidth: 1 },
  headerTitle: { fontSize: 21, fontWeight: '800', letterSpacing: -0.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  friendReqBtn: { marginRight: 16, position: 'relative' },
  friendReqIcon: { fontSize: 22 },
  badge: { position: 'absolute', top: -4, right: -6, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  settingsIcon: { fontSize: 22 },
  scroll: { paddingBottom: 30 },
  hero: { alignItems: 'center', paddingVertical: 20, borderBottomWidth: 1 },
  displayName: { fontSize: 19, fontWeight: '800', marginTop: 10 },
  rankBadge: { backgroundColor: '#FFF0EB', borderWidth: 1, borderColor: '#FFE0D0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, marginTop: 6 },
  rankText: { fontSize: 11, fontWeight: '700' },
  xpSection: { paddingHorizontal: Layout.screenPadding, paddingTop: 14 },
  xpLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  xpLabel: { fontSize: 10 },
  xpBarBg: { height: 5, borderRadius: 3, overflow: 'hidden' },
  xpBarFill: { height: 5, borderRadius: 3 },
  currencyRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingVertical: 14 },
  xpPill: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },
  xpPillText: { fontSize: 12, fontWeight: '700' },
  coinsPill: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },
  coinsPillText: { fontSize: 12, fontWeight: '700' },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderBottomWidth: 1, marginHorizontal: Layout.screenPadding },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 17, fontWeight: '800' },
  statLabel: { fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: 28 },
  section: { paddingHorizontal: Layout.screenPadding, paddingTop: 18 },
  sectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 },
  badgesGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  badgeItem: { width: '25%', alignItems: 'center', marginBottom: 14 },
  badgeIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  badgeEmoji: { fontSize: 20 },
  badgeName: { fontSize: 9, marginTop: 4, textAlign: 'center' },
  plansGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  miniCard: { width: MINI_CARD_W, height: 76, borderRadius: 14, padding: 10, justifyContent: 'flex-end' },
  miniCardTitle: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  doneCheck: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: '#4CAF50', alignItems: 'center', justifyContent: 'center' },
  doneCheckText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
});
