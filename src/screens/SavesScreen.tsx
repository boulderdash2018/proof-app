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
  TextInput as RNTextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Layout, Fonts } from '../constants';
import { LoadingSkeleton } from '../components';
import { Plan } from '../types';
import { useAuthStore, useSavesStore, useSavedPlacesStore } from '../store';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { SavedPlan } from '../types';
import * as Haptics from 'expo-haptics';
import { fuzzyMatchAny } from '../utils/fuzzySearch';

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
  const savedPlacesList = useSavedPlacesStore((s) => s.places);
  const [activeTab, setActiveTab] = useState<'todo' | 'done'>('todo');
  const C = useColors();
  const { t } = useTranslation();

  // ── Search + filter state ──
  // searchOpen = barre + chips visibles (toggle au tap loupe).
  // searchQuery = ce que l'user tape (fuzzy match cf. utils/fuzzySearch).
  // filter = chip actif parmi 'all' | 'solo' | 'group' | 'with-favs'.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'solo' | 'group' | 'with-favs'>('all');
  const searchInputRef = useRef<RNTextInput>(null);
  const searchSlide = useRef(new Animated.Value(0)).current;

  // ── Animated tab indicator (pattern Feed) ──
  // Les onglets À faire / Faites ont un trait terracotta qui slide
  // d'un tab à l'autre via spring. Donne une transition fluide qui
  // fait sentir le passage d'état, pas un toggle binaire.
  const todoTabLayout = useRef({ x: 0, width: 0 });
  const doneTabLayout = useRef({ x: 0, width: 0 });
  const tabIndicatorLeft = useRef(new Animated.Value(0)).current;
  const tabIndicatorWidth = useRef(new Animated.Value(0)).current;
  const switchTab = (tab: 'todo' | 'done') => {
    if (tab === activeTab) return;
    Haptics.selectionAsync().catch(() => {});
    setActiveTab(tab);
    const target = tab === 'todo' ? todoTabLayout.current : doneTabLayout.current;
    Animated.parallel([
      Animated.spring(tabIndicatorLeft,  { toValue: target.x,     friction: 9, tension: 80, useNativeDriver: false }),
      Animated.spring(tabIndicatorWidth, { toValue: target.width, friction: 9, tension: 80, useNativeDriver: false }),
    ]).start();
  };

  useEffect(() => {
    if (user) fetchSaves(user.id);
  }, [user?.id]);

  // Set des googlePlaceId favoris — pour le filtre "Avec mes favoris"
  // (un plan match si au moins une de ses places est dans mes favoris).
  const favoriteSet = useMemo(
    () => new Set(savedPlacesList.map((p) => p.placeId)),
    [savedPlacesList],
  );

  // Filtre combiné : tab → chip → recherche fuzzy → tri savedAt desc
  const filteredPlans = useMemo(() => {
    let list = savedPlans.filter((sp) => activeTab === 'todo' ? !sp.isDone : sp.isDone);

    // Chip filter — co-plan vs solo vs avec favoris
    if (filter === 'solo') {
      list = list.filter((sp) =>
        !sp.plan.sourceDraftId && (sp.plan.coAuthors?.length ?? 0) === 0,
      );
    } else if (filter === 'group') {
      list = list.filter((sp) =>
        !!sp.plan.sourceDraftId || (sp.plan.coAuthors?.length ?? 0) > 0,
      );
    } else if (filter === 'with-favs') {
      list = list.filter((sp) =>
        sp.plan.places.some((p) =>
          (p.googlePlaceId && favoriteSet.has(p.googlePlaceId)) || favoriteSet.has(p.id),
        ),
      );
    }

    // Recherche fuzzy — sur titre + place names + tags. Le fuzzyMatchAny
    // tolère 1 faute de frappe (Levenshtein ≤ 1) + l'accent-insensitivité.
    if (searchQuery.trim().length > 0) {
      list = list.filter((sp) => {
        const haystacks: (string | undefined)[] = [
          sp.plan.title,
          ...(sp.plan.places || []).map((p) => p.name),
          ...(sp.plan.tags || []).map((t) => String(t)),
          sp.plan.author?.username,
          sp.plan.author?.displayName,
        ];
        return fuzzyMatchAny(searchQuery, haystacks);
      });
    }

    return list.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  }, [savedPlans, activeTab, filter, searchQuery, favoriteSet]);

  // Toggle search — anime la slide-down + autofocus le input quand ouvert.
  const toggleSearch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = !searchOpen;
    setSearchOpen(next);
    Animated.spring(searchSlide, {
      toValue: next ? 1 : 0,
      friction: 9,
      tension: 80,
      useNativeDriver: false, // height anim — peut pas être native
    }).start();
    if (next) {
      setTimeout(() => searchInputRef.current?.focus(), 120);
    } else {
      // Fermeture → reset query + filter pour ne pas garder un état caché.
      setSearchQuery('');
      setFilter('all');
    }
  };

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
      {/* Header — pattern Explorer (eyebrow centré + carrés rounded
          square aux extrémités). Cohérent avec le reste de l'app
          (Explorer, etc.) — pas de Fraunces italique pour le titre,
          on garde Fraunces pour les titres éditoriaux des cells. */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={[styles.headerBtn, searchOpen && styles.headerBtnActive]}
          onPress={toggleSearch}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={searchOpen ? 'close' : 'search'}
            size={17}
            color={searchOpen ? Colors.textOnAccent : Colors.textSecondary}
          />
        </TouchableOpacity>
        <Text style={styles.headerEyebrow}>PLANS</Text>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => navigation.navigate('SavedPlaces')}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="star" size={17} color={Colors.gold} />
        </TouchableOpacity>
      </View>

      {/* Search bar + filter chips — slide-down depuis le header */}
      <Animated.View
        style={[
          styles.searchWrap,
          {
            maxHeight: searchSlide.interpolate({ inputRange: [0, 1], outputRange: [0, 110] }),
            opacity: searchSlide,
            paddingBottom: searchSlide.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }),
          },
        ]}
        pointerEvents={searchOpen ? 'auto' : 'none'}
      >
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={14} color={Colors.textTertiary} />
          <RNTextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Rechercher un plan, un lieu, un mot..."
            placeholderTextColor={Colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={Colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {([
            { key: 'all', label: 'Tous' },
            { key: 'solo', label: 'Solo' },
            { key: 'group', label: 'En groupe' },
            { key: 'with-favs', label: 'Avec mes favoris' },
          ] as const).map((opt) => {
            const active = filter === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setFilter(opt.key);
                }}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Animated.View>

      {/* Tabs centrées — pattern Feed (Pour toi / Amis) avec
          indicateur animé qui slide entre les 2. Garantit la
          cohérence visuelle avec l'écran principal Feed. */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          onLayout={(e: any) => {
            const { x, width } = e.nativeEvent.layout;
            todoTabLayout.current = { x, width };
            if (activeTab === 'todo') {
              tabIndicatorLeft.setValue(x);
              tabIndicatorWidth.setValue(width);
            }
          }}
          onPress={() => switchTab('todo')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, { opacity: activeTab === 'todo' ? 1 : 0.5 }]}>
            {t.saves_tab_todo}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onLayout={(e: any) => {
            const { x, width } = e.nativeEvent.layout;
            doneTabLayout.current = { x, width };
            if (activeTab === 'done') {
              tabIndicatorLeft.setValue(x);
              tabIndicatorWidth.setValue(width);
            }
          }}
          onPress={() => switchTab('done')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, { opacity: activeTab === 'done' ? 1 : 0.5 }]}>
            {t.saves_tab_done}
          </Text>
        </TouchableOpacity>
        <Animated.View
          style={[styles.tabIndicator, { left: tabIndicatorLeft, width: tabIndicatorWidth }]}
        />
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

  // Header — pattern Explorer : square rounded buttons + eyebrow centré
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: H_PAD,
    paddingTop: 6,
    paddingBottom: 8,
  },
  headerEyebrow: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    fontWeight: '600',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Colors.textTertiary,
  },
  headerBtn: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.bgTertiary,
  },
  headerBtnActive: {
    backgroundColor: Colors.primary,
  },

  // Search bar + filter chips wrap (slide-down depuis le header)
  searchWrap: {
    paddingHorizontal: H_PAD,
    overflow: 'hidden',
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: Colors.bgSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: Fonts.body,
    color: Colors.textPrimary,
    padding: 0,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingRight: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: Colors.bgSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 11.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
    letterSpacing: -0.05,
  },
  chipTextActive: { color: Colors.textOnAccent },

  // Tabs centrées — pattern Feed (Pour toi / Amis) : indicateur
  // animé qui slide entre les 2 tabs, opacity sur le label
  // inactif au lieu d'un changement de couleur.
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingBottom: 10,
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 6,
  },
  tabText: {
    fontSize: 15,
    fontFamily: Fonts.displayBold,
    color: Colors.textPrimary,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: Colors.primary,
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
