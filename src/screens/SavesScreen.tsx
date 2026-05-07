import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  ScrollView,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Layout, Fonts } from '../constants';
import { LoadingSkeleton } from '../components';
import { Plan } from '../types';
import { useAuthStore, useSavesStore } from '../store';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { SavedPlan } from '../types';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_W } = Dimensions.get('window');
const H_PAD = Layout.screenPadding;
const GAP = 8;

/**
 * Page Plans (Saves) — refonte V2 inspirée de la maquette Claude
 * Design "Grid Insta 3 colonnes" choisie par le user. Layout
 * mosaïque iOS Photos style :
 *   • Section "hero" : les 2 plans les plus récents en 2-col larges
 *     (ratio 1:1.3, photo + titre + auteur en overlay)
 *   • Section "grid"  : les plans suivants en 3-col carrées
 *     (compact, juste titre + statut, l'user voit 9 plans à l'écran)
 *
 * Photos réelles en background (plan.coverPhotos[0] ou première
 * photo de place), fallback dégradé terracotta si absent.
 *
 * Effets premium pour donner une impression "appli top niveau" :
 *   1. Stagger fade-in : chaque cell apparaît avec un délai
 *      progressif au mount (~50ms × index) → effet cascade.
 *   2. Press scale : onPressIn → scale 0.96 spring → onPressOut →
 *      retour à 1. Feedback tactile direct, pas d'opacité bête.
 *
 * Drag-to-reorder = Phase 2. Pour l'instant, ordre = savedAt
 * descendant (les plus récents en premier). Quand l'user voudra
 * curater son ordre on ajoutera un `customOrder` au SavedPlan +
 * un PanResponder sur les cells.
 */

// ── Helpers ───────────────────────────────────────────────────
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

// ──────────────────────────────────────────────────────────────
// Cell — composant unitaire avec stagger + press anim
// ──────────────────────────────────────────────────────────────

interface CellProps {
  item: SavedPlan;
  size: 'large' | 'square';
  index: number;
  onPress: () => void;
  proofLabel: string;
  doneLabel: string;
  todoLabel: string;
}

const Cell: React.FC<CellProps> = ({ item, size, index, onPress, proofLabel, doneLabel, todoLabel }) => {
  const photo = getPlanPhoto(item.plan);
  const gradientColors = parseGradient(item.plan.gradient);
  const isProof = item.proofStatus === 'validated';
  const statusVariant: 'proof' | 'done' | 'todo' = item.isDone
    ? (isProof ? 'proof' : 'done')
    : 'todo';
  const statusLabel = isProof ? proofLabel : item.isDone ? doneLabel : todoLabel;
  const isCoPlan = !!(item.plan.sourceDraftId || (item.plan.coAuthors?.length ?? 0) > 0);

  // ── Stagger entrance ─────────────────────────────────────
  // Chaque cell a un Animated.Value qui démarre à 0, anime
  // vers 1 avec un délai = 50ms × index. Le résultat : cascade
  // douce qui fait sentir l'app "vivante" au mount.
  const entryAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(entryAnim, {
      toValue: 1,
      friction: 8,
      tension: 60,
      delay: index * 50,
      useNativeDriver: true,
    }).start();
  }, [entryAnim, index]);

  // ── Press scale ───────────────────────────────────────────
  // onPressIn → scale à 0.96 (spring tendu pour réactivité)
  // onPressOut → retour à 1. Le ressort donne le côté "tactile"
  // qui fait pro vs un activeOpacity qui fait toujours flat.
  const pressScale = useRef(new Animated.Value(1)).current;
  const onPressIn = () => {
    Animated.spring(pressScale, { toValue: 0.96, friction: 7, tension: 200, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    Animated.spring(pressScale, { toValue: 1, friction: 5, tension: 200, useNativeDriver: true }).start();
  };
  const onPressTap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  const cellStyle = size === 'large' ? styles.cellLarge : styles.cellSquare;
  const titleStyle = size === 'large' ? styles.cellTitleLarge : styles.cellTitleSquare;

  return (
    <Animated.View
      style={{
        opacity: entryAnim,
        transform: [
          { scale: pressScale },
          {
            translateY: entryAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [12, 0],
            }),
          },
        ],
      }}
    >
      <Pressable
        onPress={onPressTap}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={cellStyle}
      >
        {/* Photo bg ou dégradé fallback */}
        {photo ? (
          <Image source={{ uri: photo }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={gradientColors as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}

        {/* Dégradé de lisibilité bottom — toujours, pour titre blanc */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.7)']}
          locations={[0.4, 0.7, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Statut pill — top-right */}
        <View style={[styles.pill, statusVariant === 'proof' ? styles.pillProof : statusVariant === 'done' ? styles.pillDone : styles.pillTodo]}>
          <Text style={[styles.pillText, statusVariant === 'proof' ? styles.pillTextProof : statusVariant === 'done' ? styles.pillTextDone : styles.pillTextTodo]} numberOfLines={1}>
            {statusLabel}
          </Text>
        </View>

        {/* Co-plan badge — top-left (icône people sur cercle terracotta) */}
        {isCoPlan && (
          <View style={styles.coPlanBadge}>
            <Ionicons name="people" size={11} color={Colors.textOnAccent} />
          </View>
        )}

        {/* Titre + auteur en bas */}
        <View style={styles.cellBottom}>
          <Text style={titleStyle} numberOfLines={2}>
            {item.plan.title}
          </Text>
          {size === 'large' && item.plan.author?.username && (
            <Text style={styles.cellAuthor} numberOfLines={1}>
              par {item.plan.author.username} · {item.plan.duration}
            </Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
};

// ──────────────────────────────────────────────────────────────
// Empty state — custom, aligné maquette V2
// ──────────────────────────────────────────────────────────────

const EmptyTab: React.FC<{ tab: 'todo' | 'done'; onDiscover: () => void }> = ({ tab, onDiscover }) => {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyLogo}>
        <Text style={styles.emptyLogoText}>p<Text style={{ color: Colors.primary }}>.</Text></Text>
      </View>
      <Text style={styles.emptyTitle}>
        {tab === 'todo' ? 'Rien dans ta liste, encore.' : 'Pas encore de plan vécu.'}
      </Text>
      <Text style={styles.emptySub}>
        {tab === 'todo'
          ? 'Sauvegarde des plans depuis le feed,\nils s’afficheront ici en grille.'
          : 'Quand tu auras fait un plan,\nil viendra se ranger ici.'}
      </Text>
      <TouchableOpacity style={styles.emptyCta} onPress={onDiscover} activeOpacity={0.85}>
        <Text style={styles.emptyCtaText}>Découvrir des plans</Text>
      </TouchableOpacity>
    </View>
  );
};

// ──────────────────────────────────────────────────────────────
// Main screen
// ──────────────────────────────────────────────────────────────

export const SavesScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const { savedPlans, isLoading, fetchSaves } = useSavesStore();
  const [activeTab, setActiveTab] = useState<'todo' | 'done'>('todo');
  const C = useColors();
  const { t } = useTranslation();

  useEffect(() => {
    if (user) fetchSaves(user.id);
  }, [user?.id]);

  // Filtre + tri par savedAt desc (= plus récents en premier)
  const filteredPlans = useMemo(() => {
    return savedPlans
      .filter((sp) => activeTab === 'todo' ? !sp.isDone : sp.isDone)
      .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  }, [savedPlans, activeTab]);

  // Split : 2 premiers = hero (large), reste = grid 3-col
  const heroPlans = filteredPlans.slice(0, 2);
  const gridPlans = filteredPlans.slice(2);

  const handleOpenPlan = (planId: string, isDone: boolean) => {
    navigation.navigate('PlanDetail', {
      planId,
      from: isDone ? 'saves-done' : 'saves-todo',
    });
  };

  const handleDiscover = () => {
    navigation.navigate('FeedTab');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: Colors.bgPrimary }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={{ width: 34 }} />
        <Text style={styles.pageTitle}>Plans</Text>
        <TouchableOpacity
          style={styles.starBtn}
          onPress={() => navigation.navigate('SavedPlaces')}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="star" size={16} color={Colors.gold} />
        </TouchableOpacity>
      </View>

      {/* Tabs underline-style — moins lourd qu'un segment plein-largeur */}
      <View style={styles.tabsRow}>
        <TouchableOpacity style={styles.tabUnderline} onPress={() => setActiveTab('todo')} activeOpacity={0.7}>
          <View style={styles.tabLabelRow}>
            <Text style={[styles.tabText, activeTab === 'todo' && styles.tabTextActive]}>
              {t.saves_tab_todo}
            </Text>
            <Text style={[styles.tabCount, activeTab === 'todo' && styles.tabCountActive]}>
              {savedPlans.filter((sp) => !sp.isDone).length}
            </Text>
          </View>
          {activeTab === 'todo' && <View style={styles.tabUnderlineBar} />}
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabUnderline} onPress={() => setActiveTab('done')} activeOpacity={0.7}>
          <View style={styles.tabLabelRow}>
            <Text style={[styles.tabText, activeTab === 'done' && styles.tabTextActive]}>
              {t.saves_tab_done}
            </Text>
            <Text style={[styles.tabCount, activeTab === 'done' && styles.tabCountActive]}>
              {savedPlans.filter((sp) => sp.isDone).length}
            </Text>
          </View>
          {activeTab === 'done' && <View style={styles.tabUnderlineBar} />}
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <LoadingSkeleton variant="saves" />
      ) : filteredPlans.length === 0 ? (
        <EmptyTab tab={activeTab} onDiscover={handleDiscover} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero — 2-col larges (s'il y a au moins 1 plan) */}
          {heroPlans.length > 0 && (
            <View style={styles.heroRow}>
              {heroPlans.map((item, i) => (
                <Cell
                  key={item.planId}
                  item={item}
                  size="large"
                  index={i}
                  onPress={() => handleOpenPlan(item.planId, item.isDone)}
                  proofLabel={t.proof_validated}
                  doneLabel={t.saves_status_done}
                  todoLabel={t.saves_status_todo}
                />
              ))}
              {/* Si un seul plan dans le hero, on remplit l'autre col avec un spacer
                  pour garder la cellule à 50% width au lieu de prendre toute la
                  largeur en flex:1 (sans ça le seul plan ferait 100% — moche). */}
              {heroPlans.length === 1 && <View style={styles.heroFiller} />}
            </View>
          )}

          {/* Grid — 3-col carrées (s'il y a 3+ plans) */}
          {gridPlans.length > 0 && (
            <View style={styles.grid}>
              {gridPlans.map((item, i) => (
                <Cell
                  key={item.planId}
                  item={item}
                  size="square"
                  index={i + heroPlans.length}
                  onPress={() => handleOpenPlan(item.planId, item.isDone)}
                  proofLabel={t.proof_validated}
                  doneLabel={t.saves_status_done}
                  todoLabel={t.saves_status_todo}
                />
              ))}
            </View>
          )}

          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
      )}
    </View>
  );
};

// ──────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────

const HERO_W = (SCREEN_W - H_PAD * 2 - GAP) / 2;
const HERO_H = HERO_W * 1.3; // ratio 1:1.3 = légèrement portrait, immersif sans dominer
const SQ = (SCREEN_W - H_PAD * 2 - GAP * 2) / 3;

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: H_PAD,
    paddingTop: 6,
    paddingBottom: 4,
  },
  pageTitle: {
    fontSize: 22,
    fontFamily: Fonts.displaySemiBoldItalic,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  starBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.bgSecondary,
  },

  // Tabs underline
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    gap: 22,
    marginTop: 6,
    marginBottom: 12,
  },
  tabUnderline: {
    paddingVertical: 8,
  },
  tabLabelRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  tabText: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    letterSpacing: -0.05,
  },
  tabTextActive: { color: Colors.textPrimary },
  tabCount: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
  },
  tabCountActive: { color: Colors.primary },
  tabUnderlineBar: {
    height: 2,
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 1,
    marginTop: 6,
  },

  // ScrollView content
  scroll: {
    paddingHorizontal: H_PAD,
    paddingBottom: 16,
  },

  // Hero row (2-col larges)
  heroRow: {
    flexDirection: 'row',
    gap: GAP,
    marginBottom: GAP,
  },
  heroFiller: { width: HERO_W },

  // Grid 3-col
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },

  // Cell — large variant
  cellLarge: {
    width: HERO_W,
    height: HERO_H,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: Colors.bgTertiary,
  },
  cellTitleLarge: {
    fontSize: 17,
    fontFamily: Fonts.displaySemiBoldItalic,
    color: '#FFF',
    letterSpacing: -0.25,
    lineHeight: 21,
  },

  // Cell — square variant
  cellSquare: {
    width: SQ,
    height: SQ,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Colors.bgTertiary,
  },
  cellTitleSquare: {
    fontSize: 12.5,
    fontFamily: Fonts.displaySemiBoldItalic,
    color: '#FFF',
    letterSpacing: -0.1,
    lineHeight: 15,
  },

  // Bottom title block (commun)
  cellBottom: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
  },
  cellAuthor: {
    fontSize: 10.5,
    fontFamily: Fonts.body,
    color: 'rgba(255,255,255,0.78)',
    marginTop: 4,
    letterSpacing: 0.05,
  },

  // Status pill
  pill: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    minHeight: 18,
    justifyContent: 'center',
  },
  pillTodo: { backgroundColor: Colors.primary },
  pillDone: { backgroundColor: Colors.success },
  pillProof: { backgroundColor: Colors.terracotta700 },
  pillText: {
    fontSize: 9,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 0.6,
  },
  pillTextTodo: { color: Colors.textOnAccent },
  pillTextDone: { color: Colors.textOnAccent },
  pillTextProof: { color: Colors.textOnAccent },

  // Co-plan badge
  coPlanBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },

  // Empty state
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 60,
  },
  emptyLogo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  emptyLogoText: {
    fontSize: 28,
    fontFamily: Fonts.displaySemiBoldItalic,
    color: Colors.textPrimary,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: Fonts.displaySemiBoldItalic,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 13.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 24,
  },
  emptyCta: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 99,
    backgroundColor: Colors.primary,
  },
  emptyCtaText: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
    letterSpacing: 0.05,
  },
});
