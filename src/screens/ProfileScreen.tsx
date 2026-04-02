import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Layout } from '../constants';
import { Avatar } from '../components';
import { useAuthStore, useFriendsStore } from '../store';
import { Badge, BadgeId } from '../types';
import mockApi from '../services/mockApi';

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
  const [badges, setBadges] = useState<Badge[]>([]);
  const [userPlans, setUserPlans] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      mockApi.getBadges(user.unlockedBadges).then(setBadges);
      mockApi.getUserPlans(user.id).then(setUserPlans);
      fetchIncomingRequests(user.id);
    }
  }, [user]);

  if (!user) return null;

  const xpProgress = user.xpPoints / user.xpForNextLevel;
  const displayXp = user.xpPoints % 1000 || user.xpPoints;

  const formatCount = (n: number): string => {
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k';
    return n.toString();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mon profil</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => navigation.navigate('FriendRequests')} style={styles.friendReqBtn}>
            <Text style={styles.friendReqIcon}>👥</Text>
            {incomingRequests.length > 0 && (
              <View style={styles.badge}>
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
        {/* Hero */}
        <View style={styles.hero}>
          <Avatar
            initials={user.initials}
            bg={user.avatarBg}
            color={user.avatarColor}
            size="L"
            avatarUrl={user.avatarUrl}
            borderColor={Colors.primary}
          />
          <Text style={styles.displayName}>{user.displayName}</Text>
          <View style={styles.rankBadge}>
            <Text style={styles.rankText}>{user.rank} · Lv. {user.level}</Text>
          </View>
        </View>

        {/* XP Bar */}
        <View style={styles.xpSection}>
          <View style={styles.xpLabels}>
            <Text style={styles.xpLabel}>XP {user.xpPoints} / {user.xpForNextLevel}</Text>
            <Text style={styles.xpLabel}>→ Lv. {user.level + 1}</Text>
          </View>
          <View style={styles.xpBarBg}>
            <View style={[styles.xpBarFill, { width: `${Math.min(xpProgress * 100, 100)}%` }]} />
          </View>
        </View>

        {/* Currencies */}
        <View style={styles.currencyRow}>
          <View style={styles.xpPill}>
            <Text style={styles.xpPillText}>⭐ {displayXp} XP pts</Text>
          </View>
          <View style={styles.coinsPill}>
            <Text style={styles.coinsPillText}>+ {user.coins} coins</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{user.planCount}</Text>
            <Text style={styles.statLabel}>plans</Text>
          </View>
          <View style={styles.statDivider} />
          <TouchableOpacity
            style={styles.stat}
            onPress={() => navigation.navigate('Followers', { userId: user.id })}
          >
            <Text style={styles.statValue}>{formatCount(user.followersCount)}</Text>
            <Text style={styles.statLabel}>followers</Text>
          </TouchableOpacity>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatCount(user.likesReceived)}</Text>
            <Text style={styles.statLabel}>likes reçus</Text>
          </View>
        </View>

        {/* Badges */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>BADGES</Text>
          <View style={styles.badgesGrid}>
            {badges.map((badge) => (
              <View
                key={badge.id}
                style={[styles.badgeItem, !badge.isUnlocked && { opacity: 0.3 }]}
              >
                <View style={styles.badgeIcon}>
                  <Text style={styles.badgeEmoji}>
                    {badge.isUnlocked ? badge.emoji : '🔒'}
                  </Text>
                </View>
                <Text style={styles.badgeName} numberOfLines={1}>{badge.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Recent Plans */}
        {userPlans.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>MES PLANS RÉCENTS</Text>
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
                      colors={colors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.miniCard}
                    >
                      <Text style={styles.miniCardTitle} numberOfLines={2}>
                        {plan.title}
                      </Text>
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
  container: { flex: 1, backgroundColor: Colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  headerTitle: { fontSize: 21, fontWeight: '800', color: Colors.black, letterSpacing: -0.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  friendReqBtn: { marginRight: 16, position: 'relative' },
  friendReqIcon: { fontSize: 22 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: Colors.white, fontSize: 9, fontWeight: '800' },
  settingsIcon: { fontSize: 22 },
  scroll: { paddingBottom: 30 },
  hero: {
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  displayName: { fontSize: 19, fontWeight: '800', color: Colors.black, marginTop: 10 },
  rankBadge: {
    backgroundColor: '#FFF0EB',
    borderWidth: 1,
    borderColor: '#FFE0D0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 6,
  },
  rankText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  xpSection: { paddingHorizontal: Layout.screenPadding, paddingTop: 14 },
  xpLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  xpLabel: { fontSize: 10, color: Colors.gray700 },
  xpBarBg: {
    height: 5,
    backgroundColor: Colors.gray300,
    borderRadius: 3,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: 5,
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  currencyRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  xpPill: {
    backgroundColor: Colors.goldBg,
    borderWidth: 1,
    borderColor: Colors.goldBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  xpPillText: { fontSize: 12, fontWeight: '700', color: Colors.gold },
  coinsPill: {
    backgroundColor: Colors.successBg,
    borderWidth: 1,
    borderColor: Colors.successBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  coinsPillText: { fontSize: 12, fontWeight: '700', color: Colors.success },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginHorizontal: Layout.screenPadding,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 17, fontWeight: '800', color: Colors.black },
  statLabel: { fontSize: 11, color: Colors.gray700, marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: Colors.border },
  section: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 18,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: Colors.gray700,
    marginBottom: 12,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  badgeItem: {
    width: '25%',
    alignItems: 'center',
    marginBottom: 14,
  },
  badgeIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: Colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeEmoji: { fontSize: 20 },
  badgeName: { fontSize: 9, color: Colors.gray800, marginTop: 4, textAlign: 'center' },
  plansGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  miniCard: {
    width: MINI_CARD_W,
    height: 76,
    borderRadius: 14,
    padding: 10,
    justifyContent: 'flex-end',
  },
  miniCardTitle: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
