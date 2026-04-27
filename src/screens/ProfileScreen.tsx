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
import { Avatar, RankBadge, BadgeGrid, FounderBadge, SpotCard } from '../components';
import { useAuthStore, useFriendsStore, useSavesStore, useDraftStore } from '../store';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { getFollowerIds, getFollowingIds, migrateToFollows } from '../services/friendsService';
import { fetchUserPlans } from '../services/plansService';
import { fetchSpotsByUser } from '../services/spotsService';
import { Spot } from '../types';
import { checkAndUnlockBadges } from '../services/badgeService';
import { useLanguageStore } from '../store/languageStore';

const { width } = Dimensions.get('window');
const GRID_GAP = 2;
const GRID_COLS = 3;
const GRID_CELL = (width - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
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
  // fetchIncomingRequests is still called below to keep the store warm —
  // the badge/icon UI moved to ExploreScreen but the data is shared.
  const fetchIncomingRequests = useFriendsStore((s) => s.fetchIncomingRequests);
  const { savedPlans, fetchSaves } = useSavesStore();
  const drafts = useDraftStore((s) => s.drafts);
  const deleteDraft = useDraftStore((s) => s.deleteDraft);
  const C = useColors();
  const { t } = useTranslation();
  const [userPlans, setUserPlans] = useState<any[]>([]);
  const [userSpots, setUserSpots] = useState<Spot[]>([]);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([]);
  const [totalProofs, setTotalProofs] = useState(0);
  const lang = useLanguageStore((s) => s.language) as 'fr' | 'en';

  useEffect(() => {
    if (user) {
      migrateToFollows(user.id).catch(() => {});
      fetchUserPlans(user.id).then(setUserPlans);
      fetchSpotsByUser(user.id).then(setUserSpots).catch(() => {});
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
        fetchSpotsByUser(user.id).then(setUserSpots).catch(() => {});
        fetchSaves(user.id);
        checkAndUnlockBadges(user.id, user).then(({ allBadges, totalProofs: tp }) => {
          setUnlockedAchievements(allBadges);
          setTotalProofs(tp);
        }).catch(() => {});
      }
    }, [user])
  );

  const donePlans = savedPlans.filter((sp) => sp.isDone && sp.plan?.author?.id !== user?.id);
  const todoPlans = savedPlans.filter((sp) => !sp.isDone);

  // Profile tabs — "spots" is the lightweight format alongside plans (premium content)
  const [profileTab, setProfileTab] = useState<'plans' | 'spots' | 'drafts' | 'badges'>('plans');
  const [draftCategory, setDraftCategory] = useState<'publish' | 'organize' | null>(null);

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

  // ========== PINNED PLANS ==========
  const pinnedIds = user?.pinnedPlanIds ?? [];

  const sortedPlans = [...userPlans].sort((a, b) => {
    const aPin = pinnedIds.indexOf(a.id);
    const bPin = pinnedIds.indexOf(b.id);
    if (aPin !== -1 && bPin !== -1) return aPin - bPin;
    if (aPin !== -1) return -1;
    if (bPin !== -1) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  if (!user) return null;

  const formatCount = (n: number): string => {
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k';
    return n.toString();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: Colors.bgPrimary }]}>
      <View style={[styles.header, { borderBottomColor: Colors.borderSubtle }]}>
        <Text style={[styles.headerTitle, { color: Colors.textPrimary }]}>{t.profile_title}</Text>
        <View style={styles.headerRight}>
          {/* Friend requests icon moved to ExploreScreen header — discovery
              and connections live there now. */}
          <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="settings-outline" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={[styles.hero, { borderBottomColor: Colors.borderSubtle }]}>
          <Avatar initials={user.initials} bg={user.avatarBg} color={user.avatarColor} size="L" avatarUrl={user.avatarUrl ?? undefined} borderColor={Colors.primary} />
          <Text style={[styles.displayName, { color: Colors.textPrimary }]}>{user.displayName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            {user.isFounder && <FounderBadge />}
            <RankBadge rank={getRankForProofs(totalProofs)} />
          </View>
          {user.bio ? <Text style={[styles.bio, { color: Colors.textSecondary }]}>{user.bio}</Text> : null}
        </View>

        <View style={[styles.statsRow, { borderBottomColor: Colors.borderSubtle }]}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: Colors.textPrimary }]}>{formatCount(realPlanCount)}</Text>
            <Text style={[styles.statLabel, { color: Colors.textSecondary }]}>{t.profile_plans}</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: Colors.borderSubtle }]} />
          <TouchableOpacity style={styles.stat} onPress={() => navigation.navigate('Followers', { userId: user.id })}>
            <Text style={[styles.statValue, { color: Colors.textPrimary }]}>{formatCount(followersCount)}</Text>
            <Text style={[styles.statLabel, { color: Colors.textSecondary }]}>{t.profile_followers}</Text>
          </TouchableOpacity>
          <View style={[styles.statDivider, { backgroundColor: Colors.borderSubtle }]} />
          <TouchableOpacity style={styles.stat} onPress={() => navigation.navigate('Following', { userId: user.id })}>
            <Text style={[styles.statValue, { color: Colors.textPrimary }]}>{formatCount(followingCount)}</Text>
            <Text style={[styles.statLabel, { color: Colors.textSecondary }]}>{t.profile_following}</Text>
          </TouchableOpacity>
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
                  colors={[Colors.terracotta300, Colors.primary, Colors.terracotta800]}
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
              <Text style={[styles.completionLabel, { color: Colors.textSecondary }]}>Complete your profile</Text>
            )}

            {/* Checklist */}
            <Animated.View style={{ opacity: checklistOpacity }}>
              {/* Avatar */}
              <TouchableOpacity
                style={styles.checkItem}
                onPress={() => !hasAvatar && navigation.navigate('EditProfile')}
                activeOpacity={hasAvatar ? 1 : 0.7}
              >
                <Ionicons name={hasAvatar ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={hasAvatar ? Colors.primary : Colors.textTertiary} />
                <Text style={[styles.checkText, hasAvatar && styles.checkTextDone, { color: hasAvatar ? Colors.textTertiary : Colors.textPrimary }]}>Add a profile photo</Text>
                {!hasAvatar && <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />}
              </TouchableOpacity>

              {/* First plan */}
              <TouchableOpacity
                style={styles.checkItem}
                onPress={() => !hasPublished && navigation.navigate('CreateTab', { screen: 'Create' })}
                activeOpacity={hasPublished ? 1 : 0.7}
              >
                <Ionicons name={hasPublished ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={hasPublished ? Colors.primary : Colors.textTertiary} />
                <Text style={[styles.checkText, hasPublished && styles.checkTextDone, { color: hasPublished ? Colors.textTertiary : Colors.textPrimary }]}>Post your first plan</Text>
                {!hasPublished && <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />}
              </TouchableOpacity>

              {/* Rate 3 places */}
              <TouchableOpacity
                style={styles.checkItem}
                onPress={() => !hasRated3 && navigation.navigate('ExploreTab', { screen: 'Explore' })}
                activeOpacity={hasRated3 ? 1 : 0.7}
              >
                <Ionicons name={hasRated3 ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={hasRated3 ? Colors.primary : Colors.textTertiary} />
                <Text style={[styles.checkText, hasRated3 && styles.checkTextDone, { color: hasRated3 ? Colors.textTertiary : Colors.textPrimary }]}>Rate 3 places ({Math.min(placesRated, 3)}/3)</Text>
                {!hasRated3 && <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />}
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}

        {/* ═══ Tab bar ═══ */}
        <View style={[styles.profileTabBar, { borderBottomColor: Colors.borderSubtle }]}>
          {(['plans', 'spots', 'drafts', 'badges'] as const).map((tab) => {
            const isActive = profileTab === tab;
            const iconMap: Record<string, { active: string; inactive: string }> = {
              plans: { active: 'map', inactive: 'map-outline' },
              spots: { active: 'sparkles', inactive: 'sparkles-outline' },
              drafts: { active: 'document-text', inactive: 'document-text-outline' },
              badges: { active: 'ribbon', inactive: 'ribbon-outline' },
            };
            const icon = iconMap[tab];
            return (
              <TouchableOpacity key={tab} style={[styles.profileTabItem, isActive && { borderBottomColor: Colors.primary }]} onPress={() => { setProfileTab(tab); if (tab !== 'drafts') setDraftCategory(null); }} activeOpacity={0.7}>
                <Ionicons name={(isActive ? icon.active : icon.inactive) as any} size={22} color={isActive ? Colors.primary : Colors.textTertiary} />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ═══ Tab content ═══ */}
        {profileTab === 'plans' && (
          <>
            {sortedPlans.length > 0 ? (
              <View style={styles.instaGrid}>
                {sortedPlans.map((plan) => {
                  const colors = parseGradient(plan.gradient);
                  const photo = getPlanPhoto(plan);
                  const isPinned = pinnedIds.includes(plan.id);
                  return (
                    <TouchableOpacity
                      key={plan.id}
                      activeOpacity={0.85}
                      onPress={() => navigation.navigate('PlanDetail', { planId: plan.id })}
                    >
                      <View style={styles.instaCell}>
                        {photo ? (
                          <Image source={{ uri: photo }} style={styles.instaCellImage} />
                        ) : (
                          <LinearGradient colors={colors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                        )}
                        <LinearGradient colors={['transparent', 'rgba(44,36,32,0.65)']} style={styles.instaCellOverlay} />
                        {isPinned && (
                          <View style={styles.pinBadge}>
                            <Ionicons name="pin" size={12} color={Colors.textOnAccent} />
                          </View>
                        )}
                        <View style={styles.instaCellBottom}>
                          <Text style={styles.instaCellTitle} numberOfLines={2}>{plan.title}</Text>
                          <View style={styles.instaCellLikes}>
                            <Ionicons name="heart" size={11} color={Colors.textOnAccent} />
                            <Text style={styles.instaCellLikesText}>{plan.likesCount ?? 0}</Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyTab}>
                <Ionicons name="map-outline" size={36} color={Colors.textTertiary} />
                <Text style={[styles.emptyTabText, { color: Colors.textSecondary }]}>Aucun plan pour le moment</Text>
              </View>
            )}
          </>
        )}

        {profileTab === 'spots' && (
          <>
            {userSpots.length > 0 ? (
              <View style={styles.spotsList}>
                {userSpots.map((spot) => (
                  <View key={spot.id} style={styles.spotsListItem}>
                    <SpotCard spot={spot} />
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyTab}>
                <Ionicons name="sparkles-outline" size={36} color={Colors.textTertiary} />
                <Text style={[styles.emptyTabText, { color: Colors.textSecondary }]}>
                  Aucun spot recommandé pour le moment
                </Text>
                <TouchableOpacity
                  style={styles.emptyTabCta}
                  onPress={() => navigation.navigate('CreateSpot')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add" size={16} color={Colors.textOnAccent} />
                  <Text style={styles.emptyTabCtaText}>Recommander un spot</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {profileTab === 'drafts' && (
          <>
            {draftCategory === null ? (
              /* ── Category picker ── */
              (() => {
                const publishDrafts = drafts.filter((d) => d.type !== 'organize' && !d.id.startsWith('edit-') && !d.id.endsWith('-fresh'));
                const organizeDrafts = drafts.filter((d) => d.type === 'organize');
                const publishPhoto = publishDrafts.sort((a, b) => b.updatedAt - a.updatedAt).find((d) => d.coverPhotos?.[0] || d.places?.find((p) => p.customPhoto))?.coverPhotos?.[0] || null;
                const organizePhoto = organizeDrafts.sort((a, b) => b.updatedAt - a.updatedAt).find((d) => d.coverPhotos?.[0] || d.places?.find((p) => p.customPhoto))?.coverPhotos?.[0] || null;
                return drafts.filter((d) => !d.id.startsWith('edit-') && !d.id.endsWith('-fresh')).length > 0 ? (
                  <View style={styles.draftCategoryRow}>
                    {/* Publier un plan */}
                    <TouchableOpacity activeOpacity={0.85} onPress={() => setDraftCategory('publish')}>
                      <View style={styles.instaCell}>
                        {publishPhoto ? (
                          <Image source={{ uri: publishPhoto }} style={styles.instaCellImage} />
                        ) : (
                          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: Colors.bgTertiary }]} />
                        )}
                        <LinearGradient colors={['transparent', 'rgba(44,36,32,0.65)']} style={styles.instaCellOverlay} />
                        <View style={styles.instaCellBottom}>
                          <Ionicons name="create-outline" size={16} color={Colors.textOnAccent} />
                          <Text style={styles.instaCellTitle}>Publier un plan</Text>
                          <Text style={styles.draftCategoryCount}>{publishDrafts.length} brouillon{publishDrafts.length !== 1 ? 's' : ''}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                    {/* Organiser une journée */}
                    <TouchableOpacity activeOpacity={0.85} onPress={() => setDraftCategory('organize')}>
                      <View style={styles.instaCell}>
                        {organizePhoto ? (
                          <Image source={{ uri: organizePhoto }} style={styles.instaCellImage} />
                        ) : (
                          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: Colors.bgTertiary }]} />
                        )}
                        <LinearGradient colors={['transparent', 'rgba(44,36,32,0.65)']} style={styles.instaCellOverlay} />
                        <View style={styles.instaCellBottom}>
                          <Ionicons name="calendar-outline" size={16} color={Colors.textOnAccent} />
                          <Text style={styles.instaCellTitle}>Organiser une journée</Text>
                          <Text style={styles.draftCategoryCount}>{organizeDrafts.length} brouillon{organizeDrafts.length !== 1 ? 's' : ''}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.emptyTab}>
                    <Ionicons name="document-text-outline" size={36} color={Colors.textTertiary} />
                    <Text style={[styles.emptyTabText, { color: Colors.textSecondary }]}>Aucun brouillon</Text>
                  </View>
                );
              })()
            ) : (
              /* ── Filtered drafts grid (same style as published plans) ── */
              (() => {
                const filtered = [...drafts]
                  .filter((d) => !d.id.startsWith('edit-') && !d.id.endsWith('-fresh'))
                  .filter((d) => draftCategory === 'organize' ? d.type === 'organize' : d.type !== 'organize')
                  .sort((a, b) => b.updatedAt - a.updatedAt);
                return (
                  <>
                    {/* Back row */}
                    <TouchableOpacity style={styles.draftBackRow} onPress={() => setDraftCategory(null)} activeOpacity={0.7}>
                      <Ionicons name="chevron-back" size={18} color={Colors.primary} />
                      <Text style={[styles.draftBackText, { color: Colors.primary }]}>
                        {draftCategory === 'organize' ? 'Organiser une journée' : 'Publier un plan'}
                      </Text>
                    </TouchableOpacity>
                    {filtered.length > 0 ? (
                      <View style={styles.instaGrid}>
                        {filtered.map((d) => {
                          const draftPhoto = d.coverPhotos?.[0]
                            || d.places?.find((p) => p.customPhoto)?.customPhoto
                            || null;
                          const hasPhoto = !!draftPhoto;
                          const timeAgo = (() => {
                            const mins = Math.floor((Date.now() - d.updatedAt) / 60000);
                            if (mins < 1) return 'now';
                            if (mins < 60) return `${mins}min`;
                            const hrs = Math.floor(mins / 60);
                            if (hrs < 24) return `${hrs}h`;
                            return `${Math.floor(hrs / 24)}d`;
                          })();
                          return (
                            <TouchableOpacity
                              key={d.id}
                              activeOpacity={0.85}
                              onPress={() => {
                                if (draftCategory === 'organize') {
                                  navigation.navigate('CreateTab', { screen: 'Organize', params: { draftId: d.id } });
                                } else {
                                  navigation.navigate('CreateTab', { screen: 'Create', params: { draftId: d.id } });
                                }
                              }}
                            >
                              <View style={styles.instaCell}>
                                {hasPhoto ? (
                                  <Image source={{ uri: draftPhoto! }} style={styles.instaCellImage} />
                                ) : (
                                  <View style={[StyleSheet.absoluteFillObject, { backgroundColor: Colors.bgTertiary }]} />
                                )}
                                <LinearGradient
                                  colors={hasPhoto ? ['transparent', 'rgba(44,36,32,0.65)'] : ['transparent', 'rgba(44,36,32,0.25)']}
                                  style={styles.instaCellOverlay}
                                />
                                {/* Draft badge */}
                                <View style={styles.draftBadge}>
                                  <Text style={styles.draftBadgeText}>{timeAgo}</Text>
                                </View>
                                {/* Delete icon */}
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
                                  <Ionicons name="close-circle" size={18} color="rgba(44,36,32,0.5)" />
                                </TouchableOpacity>
                                <View style={styles.instaCellBottom}>
                                  <Text style={[styles.instaCellTitle, !hasPhoto && { color: Colors.textSecondary }]} numberOfLines={2}>{d.title || 'Untitled plan'}</Text>
                                  <Text style={styles.draftCellMeta}>{d.places.length} {d.places.length === 1 ? 'place' : 'places'}</Text>
                                </View>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : (
                      <View style={styles.emptyTab}>
                        <Ionicons name="document-text-outline" size={36} color={Colors.textTertiary} />
                        <Text style={[styles.emptyTabText, { color: Colors.textSecondary }]}>Aucun brouillon</Text>
                      </View>
                    )}
                  </>
                );
              })()
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
  headerTitle: { fontSize: 22, fontFamily: Fonts.displaySemiBold, letterSpacing: -0.3 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  friendReqBtn: { marginRight: 16, position: 'relative' },
  friendReqIcon: { fontSize: 22 },
  badge: { position: 'absolute', top: -4, right: -6, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: Colors.textOnAccent, fontSize: 9, fontWeight: '800' },
  settingsIcon: { fontSize: 22 },
  scroll: { paddingBottom: 30 },
  hero: { alignItems: 'center', paddingVertical: 20, borderBottomWidth: 1 },
  displayName: { fontSize: 20, fontFamily: Fonts.bodyBold, marginTop: 10 },
  bio: { fontSize: 13, fontFamily: Fonts.body, lineHeight: 18, marginTop: 8, textAlign: 'center', paddingHorizontal: 20 },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderBottomWidth: 1, marginHorizontal: Layout.screenPadding },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontFamily: Fonts.bodyBold },
  statLabel: { fontSize: 11, fontFamily: Fonts.body, marginTop: 2, textTransform: 'capitalize', letterSpacing: 0.3 },
  statDivider: { width: 1, height: 28 },
  // Profile tabs
  profileTabBar: { flexDirection: 'row', borderBottomWidth: 1, marginTop: 4 },
  profileTabItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  emptyTab: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50, gap: 10 },
  emptyTabText: { fontSize: 14, fontFamily: Fonts.body },
  emptyTabCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: Colors.primary,
  } as any,
  emptyTabCtaText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
    letterSpacing: 0.1,
  },
  // Spots tab — vertical stack of SpotCards, each in a full-width container
  // with comfortable padding so the flip mechanic has room to breathe.
  spotsList: { paddingHorizontal: Layout.screenPadding, paddingTop: 14, gap: 16 } as any,
  spotsListItem: {},
  section: { paddingHorizontal: Layout.screenPadding, paddingTop: 18 },
  sectionLabel: { fontSize: 10, fontFamily: Fonts.bodySemiBold, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12 },
  completionSection: { paddingHorizontal: Layout.screenPadding, paddingTop: 16, paddingBottom: 4 },
  completionBarBg: { height: 5, borderRadius: 3, backgroundColor: Colors.bgTertiary, overflow: 'hidden' },
  completionBarFill: { height: '100%', borderRadius: 3, overflow: 'hidden' },
  completionLabel: { fontSize: 11, fontFamily: Fonts.bodySemiBold, marginTop: 8, marginBottom: 8, letterSpacing: 0.3 },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  checkText: { flex: 1, fontSize: 13, fontFamily: Fonts.bodyMedium },
  checkTextDone: { textDecorationLine: 'line-through', opacity: 0.6 },
  plansGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  miniCard: { width: MINI_CARD_W, height: 76, borderRadius: 14, padding: 10, justifyContent: 'flex-end', overflow: 'hidden' },
  miniCardImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', resizeMode: 'cover' },
  miniCardOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 50 },
  miniCardTitle: { color: Colors.textOnAccent, fontSize: 12, fontFamily: Fonts.displaySemiBold, textShadowColor: 'rgba(44,36,32,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  doneCheck: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.success, alignItems: 'center', justifyContent: 'center' },
  doneCheckText: { color: Colors.textOnAccent, fontSize: 11, fontWeight: '800' },
  // Drafts
  draftCategoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  draftCategoryCount: { fontSize: 10, fontFamily: Fonts.body, color: 'rgba(255,248,240,0.7)', marginTop: 1 },
  draftBackRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Layout.screenPadding, paddingVertical: 10 },
  draftBackText: { fontSize: 14, fontFamily: Fonts.bodySemiBold },
  draftBadge: { position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(44,36,32,0.5)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, zIndex: 2 },
  draftBadgeText: { fontSize: 9, fontFamily: Fonts.bodySemiBold, color: 'rgba(255,248,240,0.85)', letterSpacing: 0.3 },
  draftDeleteBtn: { position: 'absolute', top: 4, right: 4, zIndex: 3 },
  draftCellMeta: { fontSize: 10, fontFamily: Fonts.body, color: 'rgba(255,248,240,0.7)', marginTop: 1 },
  // Instagram-style grid
  instaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  instaCell: { width: GRID_CELL, height: GRID_CELL, overflow: 'hidden' },
  instaCellImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', resizeMode: 'cover' },
  instaCellOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%' },
  instaCellBottom: { position: 'absolute', bottom: 8, left: 8, right: 8 },
  instaCellTitle: { color: Colors.textOnAccent, fontSize: 12, fontFamily: Fonts.displaySemiBold, textShadowColor: 'rgba(44,36,32,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  instaCellLikes: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  instaCellLikesText: { color: Colors.textOnAccent, fontSize: 10, fontFamily: Fonts.bodySemiBold, textShadowColor: 'rgba(44,36,32,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  pinBadge: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(44,36,32,0.55)', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
});
