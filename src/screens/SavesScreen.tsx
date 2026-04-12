import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Layout, Fonts } from '../constants';
import { Chip, EmptyState, LoadingSkeleton } from '../components';
import { Plan } from '../types';
import { useAuthStore, useSavesStore, useSavedPlacesStore } from '../store';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { SavedPlan } from '../types';
import { SavedPlace } from '../store/savedPlacesStore';

export const SavesScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { savedPlans, isLoading, fetchSaves, markAsDone, unsave } = useSavesStore();
  const { places: savedPlaces, unsavePlace } = useSavedPlacesStore();
  const [topTab, setTopTab] = useState<'plans' | 'lieux'>('plans');
  const [activeTab, setActiveTab] = useState<'todo' | 'done'>('todo');
  const C = useColors();
  const { t } = useTranslation();

  useEffect(() => {
    if (user) fetchSaves(user.id);
  }, [user?.id]);

  const filteredPlans = savedPlans.filter((sp) =>
    activeTab === 'todo' ? !sp.isDone : sp.isDone
  );

  const getPlanPhoto = (plan: Plan): string | null => {
    if (plan.coverPhotos && plan.coverPhotos.length > 0) return plan.coverPhotos[0];
    for (const place of plan.places) {
      if (place.photoUrls && place.photoUrls.length > 0) return place.photoUrls[0];
    }
    return null;
  };

  const parseGradient = (g: string): [string, string] => {
    const m = g.match(/#[0-9A-Fa-f]{6}/g);
    return m && m.length >= 2 ? [m[0], m[1]] : ['#8B6A50', '#5C4030'];
  };

  const renderItem = ({ item }: { item: SavedPlan }) => {
    const photo = getPlanPhoto(item.plan);
    const gradientColors = parseGradient(item.plan.gradient);
    return (
      <TouchableOpacity
        style={[styles.saveItem, { backgroundColor: C.white, borderColor: C.border }]}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('PlanDetail', { planId: item.planId })}
      >
        {/* Photo banner */}
        <View style={styles.banner}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.bannerImage} />
          ) : (
            <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={styles.bannerOverlay} />
          <Text style={styles.bannerTitle} numberOfLines={2}>{item.plan.title}</Text>
          <View style={[
            styles.statusBadge,
            item.isDone
              ? item.proofStatus === 'validated'
                ? styles.statusProof
                : styles.statusDone
              : styles.statusTodo,
          ]}>
            <Text style={[styles.statusText, {
              color: item.isDone
                ? item.proofStatus === 'validated' ? '#C8571A' : C.success
                : C.primary
            }]}>
              {item.isDone
                ? item.proofStatus === 'validated' ? t.proof_validated : t.saves_status_done
                : t.saves_status_todo}
            </Text>
          </View>
        </View>

        <View style={styles.saveItemBody}>
          <View style={styles.saveItemMeta}>
            <Text style={[styles.saveItemAuthor, { color: C.gray700 }]}>{t.saves_by} {item.plan.author.username}</Text>
            <Text style={[styles.saveItemDot, { color: C.gray500 }]}>·</Text>
            <Text style={[styles.saveItemPrice, { color: C.gray800 }]}>{item.plan.price}</Text>
            <Text style={[styles.saveItemDot, { color: C.gray500 }]}>·</Text>
            <Text style={[styles.saveItemDuration, { color: C.gray800 }]}>{item.plan.duration}</Text>
          </View>
          <View style={styles.tagsRow}>
            {item.plan.tags.slice(0, 3).map((tag, i) => (
              <Chip key={tag} label={tag} small variant={i === 0 ? 'filled-black' : 'filled-gray'} />
            ))}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderPlaceItem = ({ item }: { item: SavedPlace }) => (
    <View style={[styles.placeRow, { borderBottomColor: C.borderLight }]}>
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('PlaceDetail', { googlePlaceId: item.placeId })}
      >
        {item.photoUrl ? (
          <Image source={{ uri: item.photoUrl }} style={styles.placeThumb} />
        ) : (
          <View style={[styles.placeThumb, { backgroundColor: C.gray300, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="location" size={20} color={C.gray600} />
          </View>
        )}
        <View style={styles.placeInfo}>
          <Text style={[styles.placeName, { color: C.black }]} numberOfLines={1}>{item.name}</Text>
          {item.rating > 0 && (
            <View style={styles.placeRating}>
              <Ionicons name="star" size={11} color={Colors.primary} />
              <Text style={[styles.placeRatingText, { color: C.black }]}>{item.rating.toFixed(1)}</Text>
              <Text style={[styles.placeReviewCount, { color: C.gray600 }]}>({item.reviewCount})</Text>
            </View>
          )}
          <Text style={[styles.placeAddress, { color: C.gray600 }]} numberOfLines={1}>{item.address}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => unsavePlace(item.placeId)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={0.6}
      >
        <Ionicons name="star" size={20} color={Colors.gold} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      <Text style={[styles.pageTitle, { color: C.black }]}>{t.saves_title}</Text>

      {/* ── Top-level tabs: Plans / Lieux ── */}
      <View style={[styles.topTabBar, { borderBottomColor: C.borderLight }]}>
        {(['plans', 'lieux'] as const).map((tab) => {
          const isActive = topTab === tab;
          const labels: Record<string, string> = { plans: 'Plans', lieux: 'Lieux' };
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.topTabItem, isActive && { borderBottomColor: Colors.primary }]}
              onPress={() => setTopTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[styles.topTabText, { color: isActive ? C.black : C.gray600 }]}>{labels[tab]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {topTab === 'plans' ? (
        <>
          <View style={[styles.tabBar, { backgroundColor: C.gray300 }]}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'todo' && [styles.tabActive, { backgroundColor: C.white }]]}
              onPress={() => setActiveTab('todo')}
            >
              <Text style={[styles.tabText, { color: C.gray700 }, activeTab === 'todo' && { color: C.black }]}>
                {t.saves_tab_todo}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'done' && [styles.tabActive, { backgroundColor: C.white }]]}
              onPress={() => setActiveTab('done')}
            >
              <Text style={[styles.tabText, { color: C.gray700 }, activeTab === 'done' && { color: C.black }]}>
                {t.saves_tab_done}
              </Text>
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <LoadingSkeleton variant="saves" />
          ) : (
            <FlatList
              data={filteredPlans}
              renderItem={renderItem}
              keyExtractor={(item) => item.planId}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                activeTab === 'todo' ? (
                  <EmptyState icon="🔖" title={t.saves_empty_todo_title} subtitle={t.saves_empty_todo_sub} />
                ) : (
                  <EmptyState icon="🗺️" title={t.saves_empty_done_title} subtitle={t.saves_empty_done_sub} />
                )
              }
            />
          )}
        </>
      ) : (
        <FlatList
          data={savedPlaces}
          renderItem={renderPlaceItem}
          keyExtractor={(item) => item.placeId}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState icon="📍" title="Aucun lieu sauvegardé" subtitle="Sauvegarde des lieux depuis Explorer avec ⭐" />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageTitle: { fontSize: 22, fontFamily: Fonts.serifBold, letterSpacing: -0.3, paddingHorizontal: Layout.screenPadding, paddingTop: 10, paddingBottom: 12 },
  topTabBar: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 14 },
  topTabItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  topTabText: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
  tabBar: { flexDirection: 'row', marginHorizontal: Layout.screenPadding, borderRadius: 14, padding: 3, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center' },
  tabActive: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 13, fontFamily: Fonts.serifSemiBold },
  list: { paddingHorizontal: Layout.screenPadding, paddingBottom: 20 },
  saveItem: { borderRadius: 16, marginBottom: 12, borderWidth: 1, overflow: 'hidden', shadowColor: Colors.accentLine, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  banner: { height: 100, justifyContent: 'flex-end', padding: 12, position: 'relative' },
  bannerImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', resizeMode: 'cover' },
  bannerOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 70 },
  bannerTitle: { color: '#FFF', fontSize: 16, fontFamily: Fonts.serifBold, textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  statusBadge: { position: 'absolute', top: 10, right: 10, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  statusTodo: { backgroundColor: '#2D2118', borderColor: '#3D2E22' },
  statusDone: { backgroundColor: Colors.successBg, borderColor: Colors.successBorder },
  statusProof: { backgroundColor: '#C8571A20', borderColor: '#C8571A' },
  statusText: { fontSize: 10, fontWeight: '700' },
  saveItemBody: { padding: 12 },
  saveItemMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 4 },
  saveItemAuthor: { fontSize: 11 },
  saveItemDot: { fontSize: 11 },
  saveItemPrice: { fontSize: 11 },
  saveItemDuration: { fontSize: 11 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap' },

  // Saved places (Lieux tab)
  placeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: Layout.screenPadding, borderBottomWidth: 1, gap: 12 },
  placeThumb: { width: 52, height: 52, borderRadius: 12 },
  placeInfo: { flex: 1 },
  placeName: { fontSize: 14, fontFamily: Fonts.serifBold, marginBottom: 2 },
  placeRating: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 },
  placeRatingText: { fontSize: 12, fontFamily: Fonts.serifSemiBold },
  placeReviewCount: { fontSize: 11 },
  placeAddress: { fontSize: 11 },
});
