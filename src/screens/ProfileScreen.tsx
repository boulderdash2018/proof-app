import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout, Fonts, getRankForProofs } from '../constants';
import { Avatar, RankBadge, RankProgressBar, BadgeGrid, FounderBadge } from '../components';
import { useAuthStore, useFriendsStore, useSavesStore } from '../store';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { getFollowerIds, getFollowingIds, migrateToFollows } from '../services/friendsService';
import { fetchUserPlans } from '../services/plansService';
import { checkAndUnlockBadges } from '../services/badgeService';
import { useLanguageStore } from '../store/languageStore';

const { width } = Dimensions.get('window');
const MINI_CARD_W = (width - Layout.screenPadding * 2 - 8) / 2;

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

export const ProfileScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { incomingRequests, fetchIncomingRequests } = useFriendsStore();
  const { savedPlans, fetchSaves } = useSavesStore();
  const C = useColors();
  const { t } = useTranslation();
  const [userPlans, setUserPlans] = useState<any[]>([]);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([]);
  const [totalProofs, setTotalProofs] = useState(0);
  const lang = useLanguageStore((s) => s.language) as 'fr' | 'en';

  useEffect(() => {
    if (user) {
      migrateToFollows(user.id).catch(() => {});
      fetchUserPlans(user.id).then(setUserPlans);
      fetchIncomingRequests(user.id);
      getFollowerIds(user.id).then(ids => setFollowersCount(ids.length));
      getFollowingIds(user.id).then(ids => setFollowingCount(ids.length));
      fetchSaves(user.id);
      // Check badges
      checkAndUnlockBadges(user.id, user).then(({ allBadges, totalProofs: tp }) => {
        setUnlockedAchievements(allBadges);
        setTotalProofs(tp);
      }).catch(() => {});
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        getFollowerIds(user.id).then(ids => setFollowersCount(ids.length));
        getFollowingIds(user.id).then(ids => setFollowingCount(ids.length));
        fetchIncomingRequests(user.id);
        fetchUserPlans(user.id).then(setUserPlans);
        fetchSaves(user.id);
        checkAndUnlockBadges(user.id, user).then(({ allBadges, totalProofs: tp }) => {
          setUnlockedAchievements(allBadges);
          setTotalProofs(tp);
        }).catch(() => {});
      }
    }, [user])
  );

  const donePlans = savedPlans.filter((sp) => sp.isDone);
  const todoPlans = savedPlans.filter((sp) => !sp.isDone);

  // Compute real stats from fetched plans
  const realPlanCount = userPlans.length;
  const realLikesReceived = userPlans.reduce((sum: number, p: any) => sum + (p.likesCount || 0), 0);

  if (!user) return null;

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
            <Ionicons name="people-outline" size={22} color={C.gray800} />
            {incomingRequests.length > 0 && (
              <View style={[styles.badge, { backgroundColor: C.primary }]}>
                <Text style={styles.badgeText}>{incomingRequests.length}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="settings-outline" size={22} color={C.gray800} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={[styles.hero, { borderBottomColor: C.border }]}>
          <Avatar initials={user.initials} bg={user.avatarBg} color={user.avatarColor} size="L" avatarUrl={user.avatarUrl} borderColor={C.primary} />
          <Text style={[styles.displayName, { color: C.black }]}>{user.displayName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            {user.isFounder && <FounderBadge />}
            <RankBadge rank={getRankForProofs(totalProofs)} />
          </View>
          {user.bio ? <Text style={[styles.bio, { color: C.gray800 }]}>{user.bio}</Text> : null}
        </View>

        <View style={[styles.statsRow, { borderBottomColor: C.border }]}>
          <TouchableOpacity style={styles.stat} onPress={() => navigation.navigate('Following', { userId: user.id })}>
            <Text style={[styles.statValue, { color: C.black }]}>{formatCount(followingCount)}</Text>
            <Text style={[styles.statLabel, { color: C.gray700 }]}>{t.profile_following}</Text>
          </TouchableOpacity>
          <View style={[styles.statDivider, { backgroundColor: C.border }]} />
          <TouchableOpacity style={styles.stat} onPress={() => navigation.navigate('Followers', { userId: user.id })}>
            <Text style={[styles.statValue, { color: C.black }]}>{formatCount(followersCount)}</Text>
            <Text style={[styles.statLabel, { color: C.gray700 }]}>{t.profile_followers}</Text>
          </TouchableOpacity>
          <View style={[styles.statDivider, { backgroundColor: C.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: C.black }]}>{formatCount(realLikesReceived)}</Text>
            <Text style={[styles.statLabel, { color: C.gray700 }]}>{t.profile_likes_received}</Text>
          </View>
        </View>

        {/* Rank Progress */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: C.gray700 }]}>RANK</Text>
          <RankProgressBar totalProofs={totalProofs} />
        </View>

        {/* Achievements / Badges */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: C.gray700 }]}>{t.profile_badges}</Text>
          <BadgeGrid unlockedIds={unlockedAchievements} lang={lang} />
        </View>

        {userPlans.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: C.gray700 }]}>{t.profile_recent_plans}</Text>
            <View style={styles.plansGrid}>
              {userPlans.map((plan) => {
                const colors = parseGradient(plan.gradient);
                const photo = getPlanPhoto(plan);
                return (
                  <TouchableOpacity key={plan.id} activeOpacity={0.85} onPress={() => navigation.navigate('PlanDetail', { planId: plan.id })}>
                    <View style={styles.miniCard}>
                      {photo ? (
                        <Image source={{ uri: photo }} style={styles.miniCardImage} />
                      ) : (
                        <LinearGradient colors={colors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                      )}
                      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={styles.miniCardOverlay} />
                      <Text style={styles.miniCardTitle} numberOfLines={2}>{plan.title}</Text>
                    </View>
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
                const photo = getPlanPhoto(sp.plan);
                return (
                  <TouchableOpacity key={sp.planId} activeOpacity={0.85} onPress={() => navigation.navigate('PlanDetail', { planId: sp.planId })}>
                    <View style={styles.miniCard}>
                      {photo ? (
                        <Image source={{ uri: photo }} style={styles.miniCardImage} />
                      ) : (
                        <LinearGradient colors={colors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                      )}
                      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={styles.miniCardOverlay} />
                      <View style={styles.doneCheck}><Text style={styles.doneCheckText}>✓</Text></View>
                      <Text style={styles.miniCardTitle} numberOfLines={2}>{sp.plan.title}</Text>
                    </View>
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
                const photo = getPlanPhoto(sp.plan);
                return (
                  <TouchableOpacity key={sp.planId} activeOpacity={0.85} onPress={() => navigation.navigate('PlanDetail', { planId: sp.planId })}>
                    <View style={styles.miniCard}>
                      {photo ? (
                        <Image source={{ uri: photo }} style={styles.miniCardImage} />
                      ) : (
                        <LinearGradient colors={colors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                      )}
                      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={styles.miniCardOverlay} />
                      <Text style={styles.miniCardTitle} numberOfLines={2}>{sp.plan.title}</Text>
                    </View>
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
  headerTitle: { fontSize: 22, fontFamily: Fonts.serifBold, letterSpacing: -0.3 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  friendReqBtn: { marginRight: 16, position: 'relative' },
  friendReqIcon: { fontSize: 22 },
  badge: { position: 'absolute', top: -4, right: -6, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  settingsIcon: { fontSize: 22 },
  scroll: { paddingBottom: 30 },
  hero: { alignItems: 'center', paddingVertical: 20, borderBottomWidth: 1 },
  displayName: { fontSize: 20, fontFamily: Fonts.serifBold, marginTop: 10 },
  bio: { fontSize: 13, fontFamily: Fonts.serif, lineHeight: 18, marginTop: 8, textAlign: 'center', paddingHorizontal: 20 },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderBottomWidth: 1, marginHorizontal: Layout.screenPadding },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontFamily: Fonts.serifBold },
  statLabel: { fontSize: 11, marginTop: 2, textTransform: 'capitalize', letterSpacing: 0.3 },
  statDivider: { width: 1, height: 28 },
  section: { paddingHorizontal: Layout.screenPadding, paddingTop: 18 },
  sectionLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12 },
  plansGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  miniCard: { width: MINI_CARD_W, height: 76, borderRadius: 14, padding: 10, justifyContent: 'flex-end', overflow: 'hidden' },
  miniCardImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', resizeMode: 'cover' },
  miniCardOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 50 },
  miniCardTitle: { color: '#FFFFFF', fontSize: 12, fontFamily: Fonts.serifBold, textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  doneCheck: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.success, alignItems: 'center', justifyContent: 'center' },
  doneCheckText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
});
