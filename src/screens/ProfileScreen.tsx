import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Image,
  Animated,
  Platform,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout, Fonts, getRankForProofs } from '../constants';
import { Avatar, RankBadge, RankProgressBar, BadgeGrid, FounderBadge } from '../components';
import { useAuthStore, useFriendsStore, useSavesStore, useDraftStore } from '../store';
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
  const drafts = useDraftStore((s) => s.drafts);
  const deleteDraft = useDraftStore((s) => s.deleteDraft);
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

  // Profile tabs
  const [profileTab, setProfileTab] = useState<'plans' | 'drafts' | 'badges'>('plans');

  // Compute real stats from fetched plans
  const realPlanCount = userPlans.length;
  const realLikesReceived = userPlans.reduce((sum: number, p: any) => sum + (p.likesCount || 0), 0);

  // ========== PROFILE COMPLETION ==========
  const hasAvatar = !!(user?.avatarUrl);
  const hasPublished = realPlanCount > 0;
  const placesRated = user?.places_rated_count ?? 0;
  const hasRated3 = placesRated >= 3;

  const completionPct = (hasAvatar ? 30 : 0) + (hasPublished ? 40 : 0) + (hasRated3 ? 30 : 0);
  const isProfileComplete = completionPct >= 100;

  const [profileDismissed, setProfileDismissed] = useState(false);
  const barAnim = useRef(new Animated.Value(0)).current;
  const checklistOpacity = useRef(new Animated.Value(1)).current;
  const completeOpacity = useRef(new Animated.Value(0)).current;
  const prevPctRef = useRef(0);

  useEffect(() => {
    const target = completionPct / 100;
    if (completionPct > prevPctRef.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    prevPctRef.current = completionPct;
    Animated.timing(barAnim, { toValue: target, duration: 500, useNativeDriver: false }).start();

    if (isProfileComplete && !profileDismissed) {
      Animated.sequence([
        Animated.timing(completeOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(1500),
        Animated.parallel([
          Animated.timing(checklistOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
          Animated.timing(completeOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
      ]).start(() => setProfileDismissed(true));
    }
  }, [completionPct, isProfileComplete]);

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

        {/* Profile Completion */}
        {!profileDismissed && !isProfileComplete && (
          <View style={styles.completionSection}>
            {/* Progress bar */}
            <View style={styles.completionBarBg}>
              <Animated.View style={[styles.completionBarFill, {
                width: barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              }]}>
                <LinearGradient
                  colors={['#FF9A60', '#C8571A', '#8B3A10']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFillObject}
                />
              </Animated.View>
            </View>

            {/* Label */}
            {isProfileComplete ? (
              <Animated.Text style={[styles.completionLabel, { color: Colors.primary, opacity: completeOpacity }]}>
                Profile complete ✦
              </Animated.Text>
            ) : (
              <Text style={[styles.completionLabel, { color: C.gray700 }]}>Complete your profile</Text>
            )}

            {/* Checklist */}
            <Animated.View style={{ opacity: checklistOpacity }}>
              {/* Avatar */}
              <TouchableOpacity
                style={styles.checkItem}
                onPress={() => !hasAvatar && navigation.navigate('EditProfile')}
                activeOpacity={hasAvatar ? 1 : 0.7}
              >
                <Ionicons name={hasAvatar ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={hasAvatar ? Colors.primary : C.gray600} />
                <Text style={[styles.checkText, hasAvatar && styles.checkTextDone, { color: hasAvatar ? C.gray600 : C.black }]}>Add a profile photo</Text>
                {!hasAvatar && <Ionicons name="chevron-forward" size={14} color={C.gray600} />}
              </TouchableOpacity>

              {/* First plan */}
              <TouchableOpacity
                style={styles.checkItem}
                onPress={() => !hasPublished && navigation.navigate('CreateTab', { screen: 'Create' })}
                activeOpacity={hasPublished ? 1 : 0.7}
              >
                <Ionicons name={hasPublished ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={hasPublished ? Colors.primary : C.gray600} />
                <Text style={[styles.checkText, hasPublished && styles.checkTextDone, { color: hasPublished ? C.gray600 : C.black }]}>Post your first plan</Text>
                {!hasPublished && <Ionicons name="chevron-forward" size={14} color={C.gray600} />}
              </TouchableOpacity>

              {/* Rate 3 places */}
              <TouchableOpacity
                style={styles.checkItem}
                onPress={() => !hasRated3 && navigation.navigate('ExploreTab', { screen: 'Explore' })}
                activeOpacity={hasRated3 ? 1 : 0.7}
              >
                <Ionicons name={hasRated3 ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={hasRated3 ? Colors.primary : C.gray600} />
                <Text style={[styles.checkText, hasRated3 && styles.checkTextDone, { color: hasRated3 ? C.gray600 : C.black }]}>Rate 3 places ({Math.min(placesRated, 3)}/3)</Text>
                {!hasRated3 && <Ionicons name="chevron-forward" size={14} color={C.gray600} />}
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}

        {/* ═══ Tab bar ═══ */}
        <View style={[styles.profileTabBar, { borderBottomColor: C.borderLight }]}>
          {(['plans', 'drafts', 'badges'] as const).map((tab) => {
            const isActive = profileTab === tab;
            const labels: Record<string, string> = { plans: 'Plans', drafts: 'Brouillons', badges: 'Badges' };
            const counts: Record<string, number> = { plans: userPlans.length + donePlans.length + todoPlans.length, drafts: drafts.length, badges: unlockedAchievements.length };
            return (
              <TouchableOpacity key={tab} style={[styles.profileTabItem, isActive && { borderBottomColor: C.primary }]} onPress={() => setProfileTab(tab)} activeOpacity={0.7}>
                <Text style={[styles.profileTabText, { color: isActive ? C.primary : C.gray600 }]}>{labels[tab]}</Text>
                <Text style={[styles.profileTabCount, { color: isActive ? C.primary : C.gray600 }]}>{counts[tab]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ═══ Tab content ═══ */}
        {profileTab === 'plans' && (
          <>
            {/* Rank Progress */}
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: C.gray700 }]}>RANK</Text>
              <RankProgressBar totalProofs={totalProofs} />
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

            {userPlans.length === 0 && donePlans.length === 0 && todoPlans.length === 0 && (
              <View style={styles.emptyTab}>
                <Ionicons name="map-outline" size={36} color={C.gray500} />
                <Text style={[styles.emptyTabText, { color: C.gray600 }]}>Aucun plan pour le moment</Text>
              </View>
            )}
          </>
        )}

        {profileTab === 'drafts' && (
          <>
            {drafts.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.plansGrid}>
                  {[...drafts].sort((a, b) => b.updatedAt - a.updatedAt).map((d) => {
                    const draftPhoto = d.coverPhotos?.[0];
                    const timeAgo = (() => {
                      const mins = Math.floor((Date.now() - d.updatedAt) / 60000);
                      if (mins < 1) return 'just now';
                      if (mins < 60) return `${mins}min ago`;
                      const hrs = Math.floor(mins / 60);
                      if (hrs < 24) return `${hrs}h ago`;
                      return `${Math.floor(hrs / 24)}d ago`;
                    })();
                    return (
                      <TouchableOpacity
                        key={d.id}
                        activeOpacity={0.85}
                        onPress={() => navigation.navigate('CreateTab', { screen: 'Create', params: { draftId: d.id } })}
                      >
                        <View style={[styles.miniCard, styles.draftCard]}>
                          {draftPhoto ? (
                            <Image source={{ uri: draftPhoto }} style={styles.miniCardImage} />
                          ) : (
                            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#EDE8E0' }]} />
                          )}
                          {!draftPhoto && (
                            <Ionicons name="document-text-outline" size={18} color="#B5A998" style={styles.draftIcon} />
                          )}
                          {draftPhoto && <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={styles.miniCardOverlay} />}
                          <Text style={[styles.miniCardTitle, !draftPhoto && styles.draftCardTitle]} numberOfLines={1}>
                            {d.title || 'Untitled plan'}
                          </Text>
                          <Text style={[styles.draftMeta, !draftPhoto && styles.draftMetaDark]}>
                            {d.places.length} {d.places.length === 1 ? 'place' : 'places'} · {timeAgo}
                          </Text>
                          <TouchableOpacity
                            style={styles.draftDeleteBtn}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={(e) => {
                              e.stopPropagation?.();
                              if (Platform.OS === 'web') {
                                if (window.confirm('Delete draft?')) deleteDraft(d.id);
                              } else {
                                Alert.alert('Delete draft?', '', [
                                  { text: 'Cancel', style: 'cancel' },
                                  { text: 'Delete', style: 'destructive', onPress: () => deleteDraft(d.id) },
                                ]);
                              }
                            }}
                          >
                            <Ionicons name="close-circle" size={18} color="rgba(0,0,0,0.4)" />
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View style={styles.emptyTab}>
                <Ionicons name="document-text-outline" size={36} color={C.gray500} />
                <Text style={[styles.emptyTabText, { color: C.gray600 }]}>Aucun brouillon</Text>
              </View>
            )}
          </>
        )}

        {profileTab === 'badges' && (
          <View style={styles.section}>
            <BadgeGrid unlockedIds={unlockedAchievements} lang={lang} />
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
  // Profile tabs
  profileTabBar: { flexDirection: 'row', borderBottomWidth: 1, marginTop: 4 },
  profileTabItem: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  profileTabText: { fontSize: 13, fontFamily: Fonts.serifBold },
  profileTabCount: { fontSize: 11, fontFamily: Fonts.serif, marginTop: 2 },
  emptyTab: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50, gap: 10 },
  emptyTabText: { fontSize: 14, fontFamily: Fonts.serif },
  section: { paddingHorizontal: Layout.screenPadding, paddingTop: 18 },
  sectionLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12 },
  completionSection: { paddingHorizontal: Layout.screenPadding, paddingTop: 16, paddingBottom: 4 },
  completionBarBg: { height: 5, borderRadius: 3, backgroundColor: '#EDE8E0', overflow: 'hidden' },
  completionBarFill: { height: '100%', borderRadius: 3, overflow: 'hidden' },
  completionLabel: { fontSize: 11, fontWeight: '600', marginTop: 8, marginBottom: 8, letterSpacing: 0.3 },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  checkText: { flex: 1, fontSize: 13, fontWeight: '500' },
  checkTextDone: { textDecorationLine: 'line-through', opacity: 0.6 },
  plansGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  miniCard: { width: MINI_CARD_W, height: 76, borderRadius: 14, padding: 10, justifyContent: 'flex-end', overflow: 'hidden' },
  miniCardImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', resizeMode: 'cover' },
  miniCardOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 50 },
  miniCardTitle: { color: '#FFFFFF', fontSize: 12, fontFamily: Fonts.serifBold, textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  doneCheck: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.success, alignItems: 'center', justifyContent: 'center' },
  doneCheckText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  // Drafts
  draftCard: { borderWidth: 1, borderColor: '#D6CEC4' },
  draftIcon: { position: 'absolute', top: 8, right: 8 },
  draftCardTitle: { color: '#6B5E50', textShadowColor: 'transparent', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 0 },
  draftMeta: { fontSize: 9, fontFamily: Fonts.serif, color: 'rgba(255,255,255,0.7)', marginTop: 1 },
  draftMetaDark: { color: '#9A8E80' },
  draftDeleteBtn: { position: 'absolute', top: 4, right: 4 },
});
