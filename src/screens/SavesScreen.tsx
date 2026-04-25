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
import { EmptyState, LoadingSkeleton } from '../components';
import { Plan } from '../types';
import { useAuthStore, useSavesStore } from '../store';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { SavedPlan } from '../types';

export const SavesScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { savedPlans, isLoading, fetchSaves, markAsDone, unsave } = useSavesStore();
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

  /**
   * Item immersif :
   *   • image plein largeur ~240px de haut, qui domine le visuel
   *   • titre overlay bottom-left en Fraunces blanc, halo gradient
   *     pour la lisibilité quelle que soit la photo
   *   • status pill discret en haut-droite (Proof. ✓ / Faite / À faire)
   *   • stats row SOUS l'image (sans fond, juste de l'air autour)
   *     avec icônes ambrées : trophée prix, sablier durée, cœur likes
   *
   * Plus de chips de tags ni de byline auteur — tout est concentré
   * sur ce qui se LIT en un coup d'œil (photo + titre + 3 stats).
   */
  const renderItem = ({ item }: { item: SavedPlan }) => {
    const photo = getPlanPhoto(item.plan);
    const gradientColors = parseGradient(item.plan.gradient);
    const isProof = item.proofStatus === 'validated';
    const statusVariant = item.isDone
      ? (isProof ? 'proof' : 'done')
      : 'todo';
    const statusLabel = isProof
      ? t.proof_validated
      : item.isDone
        ? t.saves_status_done
        : t.saves_status_todo;

    return (
      <TouchableOpacity
        style={styles.item}
        activeOpacity={0.92}
        onPress={() => navigation.navigate('PlanDetail', { planId: item.planId })}
      >
        {/* ── Hero image (full bleed, ~240px) ── */}
        <View style={styles.hero}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.heroImage} />
          ) : (
            <LinearGradient
              colors={gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}

          {/* Bottom darkening — title legibility on any photo */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.7)']}
            locations={[0, 0.55, 1]}
            style={styles.heroFade}
          />

          {/* Status pill — top-right, glassy translucent */}
          <View style={[styles.pill, statusVariant === 'proof' ? styles.pillProof : statusVariant === 'done' ? styles.pillDone : styles.pillTodo]}>
            <Text style={[styles.pillText, statusVariant === 'proof' ? styles.pillTextProof : statusVariant === 'done' ? styles.pillTextDone : styles.pillTextTodo]}>
              {statusLabel}
            </Text>
          </View>

          {/* Title — bottom-left in Fraunces white */}
          <View style={styles.heroTitleWrap}>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {item.plan.title}
            </Text>
          </View>
        </View>

        {/* ── Stats row sous l'image ── */}
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Ionicons name="trophy" size={13} color={Colors.gold} />
            <Text style={styles.statText}>{item.plan.price}</Text>
          </View>
          <View style={styles.statSep} />
          <View style={styles.stat}>
            <Ionicons name="hourglass-outline" size={13} color={Colors.gold} />
            <Text style={styles.statText}>{item.plan.duration}</Text>
          </View>
          <View style={styles.statSep} />
          <View style={styles.stat}>
            <Ionicons name="heart" size={13} color={Colors.primary} />
            <Text style={styles.statText}>{item.plan.likesCount}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Text style={styles.author} numberOfLines={1}>
            par {item.plan.author.username}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      {/* Header: title centered + star button right */}
      <View style={styles.headerRow}>
        <View style={{ width: 34 }} />
        <Text style={[styles.pageTitle, { color: C.black }]}>Plans</Text>
        <TouchableOpacity
          style={[styles.starBtn, { backgroundColor: C.gray200 }]}
          onPress={() => navigation.navigate('SavedPlaces')}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="star" size={16} color={Colors.gold} />
        </TouchableOpacity>
      </View>

      {/* Segmented control: À faire / Faites */}
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPadding, paddingTop: 10, paddingBottom: 12,
  },
  pageTitle: { fontSize: 22, fontFamily: Fonts.displaySemiBold, letterSpacing: -0.3 },
  starBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  tabBar: {
    flexDirection: 'row', marginHorizontal: Layout.screenPadding,
    borderRadius: 14, padding: 3, marginBottom: 14,
  },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center' },
  tabActive: { shadowColor: 'rgba(44,36,32,0.15)', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 13, fontFamily: Fonts.bodySemiBold },

  // Liste — paddingTop 0 pour que le 1er item s'aligne pile sous le tab,
  // gros padding bas pour la tab bar.
  list: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: 24,
    gap: 18,
  },

  // ── Item immersif ──
  item: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: Colors.bgSecondary,
    shadowColor: 'rgba(44,36,32,1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },

  // Hero image — l'élément visuel fort (par décision UX)
  hero: {
    height: 240,
    width: '100%',
    backgroundColor: Colors.bgTertiary,
    position: 'relative',
    justifyContent: 'flex-end',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  heroFade: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: 130,
  },
  heroTitleWrap: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
  },
  heroTitle: {
    fontSize: 22,
    fontFamily: Fonts.displaySemiBold,
    color: '#FFF',
    letterSpacing: -0.4,
    lineHeight: 26,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },

  // Status pill — top-right, glass-translucent
  pill: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillTodo: {
    backgroundColor: 'rgba(196,112,75,0.92)', // primary
    borderColor: Colors.primaryDeep,
  },
  pillDone: {
    backgroundColor: 'rgba(123,153,113,0.92)', // success
    borderColor: 'rgba(80,110,70,0.6)',
  },
  pillProof: {
    backgroundColor: 'rgba(255,248,240,0.92)', // crème
    borderColor: Colors.primary,
  },
  pillText: {
    fontSize: 10.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  pillTextTodo: { color: Colors.textOnAccent },
  pillTextDone: { color: '#FFF' },
  pillTextProof: { color: Colors.primary },

  // Stats row — sous l'image, dans le même rectangle (mais bg secondaire)
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.05,
  },
  statSep: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.borderMedium,
    marginHorizontal: 2,
  },
  author: {
    fontSize: 11,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textTertiary,
    fontStyle: 'italic',
    maxWidth: 120,
  },
});
