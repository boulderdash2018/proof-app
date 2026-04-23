import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Image,
  Modal,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout, Fonts, EXPLORE_GROUPS, PERSON_FILTERS } from '../constants';
import { ExploreCategoryItem } from '../constants/exploreCategories';
import { LoadingSkeleton } from '../components';
import { Plan, Place } from '../types';
import { useCity } from '../hooks/useCity';
import { useTranslation } from '../hooks/useTranslation';
import { useAuthStore, useTrendingStore, useFriendsStore } from '../store';
import { useGuestStore } from '../store/guestStore';
import { fetchPublicPlansByTags, fetchPublicPlansNearby } from '../services/plansService';
import { FriendsMapView } from './FriendsMapView';
import * as Location from 'expo-location';

const { width } = Dimensions.get('window');
const CARD_GAP = 10;
const CARD_WIDTH = (width - Layout.screenPadding * 2 - CARD_GAP) / 2;

const parseGradientColors = (gradient: string): string[] => {
  const matches = gradient.match(/#[0-9A-Fa-f]{6}/g);
  return matches && matches.length >= 2 ? matches : ['#8B6A50', '#5C4030'];
};

const THEME_GROUPS = EXPLORE_GROUPS.filter(g => g.key !== 'trending');
const FILTERED_PERSONS = PERSON_FILTERS.filter(p => p.key !== 'around-you');
const PERSON_LABELS = new Set(PERSON_FILTERS.map(p => p.label));
const NEARBY_LABEL = 'Dans ton quartier';
const MOOD_LABEL = 'Mood';

// Build name→icon lookup from all category items for trending grid
const CATEGORY_ICON_MAP = new Map<string, string>();
for (const group of EXPLORE_GROUPS) {
  for (const section of group.sections) {
    for (const item of section.items) {
      if (item.icon) CATEGORY_ICON_MAP.set(item.name, item.icon);
    }
  }
}

// ─── Refonte "Atlas" : utilitaires gradient + mapping catégorie → thème ───

/** Darken a hex color toward black by `factor` ∈ [0,1]. */
const darkenHex = (hex: string, factor: number): string => {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean, 16);
  const r = Math.max(0, Math.floor((num >> 16) * (1 - factor)));
  const g = Math.max(0, Math.floor(((num >> 8) & 0xff) * (1 - factor)));
  const b = Math.max(0, Math.floor((num & 0xff) * (1 - factor)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
};

/** Extend a 2-stop curated gradient into a 3-stop gradient with a deeper
 *  bottom — gives the tile more visual depth, makes the title pop. */
const expandGradient3 = (stops: readonly [string, string]): [string, string, string] => [
  stops[0],
  stops[1],
  darkenHex(stops[1], 0.4),
];

/** Map each subcategory NAME → its parent theme key (food-drinks, sports, ...).
 *  Lets us filter trendingCategories by the active theme tab. */
const TAG_TO_THEME_KEY = new Map<string, string>();
for (const group of EXPLORE_GROUPS) {
  if (group.key === 'trending') continue;
  for (const section of group.sections) {
    for (const item of section.items) {
      if (!TAG_TO_THEME_KEY.has(item.name)) TAG_TO_THEME_KEY.set(item.name, group.key);
    }
  }
}

export const ExploreScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setShowAccountPrompt = useGuestStore((s) => s.setShowAccountPrompt);
  const trendingCategories = useTrendingStore((s) => s.categories);
  const trendingLoading = useTrendingStore((s) => s.isLoading);
  const fetchTrending = useTrendingStore((s) => s.fetchTrending);
  const cityConfig = useCity();

  // Fetch trending on mount (5-min cache in store)
  useEffect(() => { fetchTrending(cityConfig.name); }, [cityConfig.name]);

  // ── Friend requests badge (for the people icon in the header) ──
  // Lifted from ProfileScreen — discovery / connections live here now.
  const incomingRequests = useFriendsStore((s) => s.incomingRequests);
  const fetchIncomingRequests = useFriendsStore((s) => s.fetchIncomingRequests);
  useEffect(() => {
    if (currentUser?.id) fetchIncomingRequests(currentUser.id);
  }, [currentUser?.id, fetchIncomingRequests]);

  // Active theme tab — purely a navigation state (which categories the grid
  // shows). NOT a filter — selectedFilters stays untouched until the user
  // taps a tile. Defaults to "food-drinks" so the screen opens populated.
  const [activeTheme, setActiveTheme] = useState<string>('food-drinks');
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [filteredPlans, setFilteredPlans] = useState<Plan[]>([]);
  const [isFilterLoading, setIsFilterLoading] = useState(false);
  const filterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [contentMode, setContentMode] = useState<'tous' | 'plans' | 'lieux'>('tous');
  const [showMap, setShowMap] = useState(false);

  // Advanced filters (null = off, number = active threshold)
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [maxBudget, setMaxBudget] = useState<number | null>(null);
  const [maxDuration, setMaxDuration] = useState<number | null>(null);
  const [minLikes, setMinLikes] = useState<number | null>(null);
  const [minProofs, setMinProofs] = useState<number | null>(null);
  const hasAdvancedFilters = maxBudget !== null || maxDuration !== null || minLikes !== null || minProofs !== null || contentMode !== 'tous';

  const BUDGET_STEPS = [20, 50, 100, 200, 500];
  const DURATION_STEPS = [30, 60, 120, 180, 360];
  const LIKES_STEPS = [1, 5, 10, 25, 50];
  const PROOFS_STEPS = [1, 3, 5, 10, 25];

  // Derive active theme group from selected filters (still used by the
  // results-view branch when a filter is active).
  const activeThemeFilter = selectedFilters.find(f => !PERSON_LABELS.has(f));

  const toggleFilter = useCallback((label: string) => {
    setSelectedFilters((prev) => {
      const isPerson = PERSON_LABELS.has(label);
      const currentPerson = prev.find((f) => PERSON_LABELS.has(f));
      const currentTheme = prev.find((f) => !PERSON_LABELS.has(f));

      // Single-select per group: 1 person + 1 theme max
      let newPerson = isPerson ? (currentPerson === label ? undefined : label) : currentPerson;
      let newTheme = isPerson ? currentTheme : (currentTheme === label ? undefined : label);

      const next: string[] = [];
      if (newPerson) next.push(newPerson);
      if (newTheme) next.push(newTheme);

      if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
      if (next.length > 0) {
        setIsFilterLoading(true);
        (async () => {
          const plans = await fetchPublicPlansByTags(next, cityConfig.name);
          // Intersect: plan must match ALL selected tags
          const filtered = next.length > 1
            ? plans.filter((plan) => next.every((tag) => plan.tags.includes(tag)))
            : plans;
          setFilteredPlans(filtered);
          setIsFilterLoading(false);
        })();
      } else {
        setFilteredPlans([]);
        setIsFilterLoading(false);
      }
      return next;
    });
  }, [cityConfig.name]);

  // Apply a filter pushed by another screen (e.g. SearchScreen tapping a
  // trending category) via route params. Clear the param immediately so the
  // effect doesn't re-fire on subsequent renders.
  useEffect(() => {
    const pending = route.params?.applyFilter;
    if (typeof pending === 'string' && pending.length > 0) {
      toggleFilter(pending);
      navigation.setParams({ applyFilter: undefined } as any);
    }
  }, [route.params?.applyFilter, toggleFilter, navigation]);

  // ── "Dans ton quartier" handler ──
  const handleNearbyFilter = async () => {
    const currentTheme = selectedFilters.find(f => !PERSON_LABELS.has(f));
    const currentPerson = selectedFilters.find(f => PERSON_LABELS.has(f));
    const isActive = currentTheme === NEARBY_LABEL;

    if (isActive) {
      // Deselect nearby
      const next = currentPerson ? [currentPerson] : [];
      setSelectedFilters(next);
      setLocationDenied(false);
      if (currentPerson) {
        setIsFilterLoading(true);
        fetchPublicPlansByTags([currentPerson], cityConfig.name).then(plans => {
          setFilteredPlans(plans);
          setIsFilterLoading(false);
        });
      } else {
        setFilteredPlans([]);
      }
      return;
    }

    // Request location permission
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setLocationDenied(true);
      setTimeout(() => setLocationDenied(false), 4000);
      return;
    }

    setLocationDenied(false);

    const next: string[] = [];
    if (currentPerson) next.push(currentPerson);
    next.push(NEARBY_LABEL);
    setSelectedFilters(next);
    setIsFilterLoading(true);

    try {
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      let plans = await fetchPublicPlansNearby(
        location.coords.latitude,
        location.coords.longitude,
        2,
        cityConfig.name,
      );
      if (currentPerson) {
        plans = plans.filter(p => p.tags.includes(currentPerson));
      }
      setFilteredPlans(plans);
    } catch (err) {
      console.error('[ExploreScreen] Nearby error:', err);
      setFilteredPlans([]);
    } finally {
      setIsFilterLoading(false);
    }
  };

  // ── Parse helpers for plan fields ──
  const parsePrice = (p: string): number => {
    const m = p.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  };
  const parseDuration = (d: string): number => {
    let mins = 0;
    const h = d.match(/(\d+)\s*h/);
    const m = d.match(/(\d+)\s*min/);
    if (h) mins += parseInt(h[1], 10) * 60;
    if (m) mins += parseInt(m[1], 10);
    return mins;
  };

  const applyAdvancedFilters = (plans: Plan[]): Plan[] => {
    if (!hasAdvancedFilters) return plans;
    return plans.filter((p) => {
      if (maxBudget !== null && parsePrice(p.price) > maxBudget) return false;
      if (maxDuration !== null && parseDuration(p.duration) > maxDuration) return false;
      if (minLikes !== null && p.likesCount < minLikes) return false;
      if (minProofs !== null && p.proofCount < minProofs) return false;
      return true;
    });
  };

  const displayedPlans = applyAdvancedFilters(filteredPlans);

  // Extract unique places from filtered plans for "Lieux" mode
  const displayedPlaces = (() => {
    if (contentMode === 'plans') return [];
    const seen = new Set<string>();
    const places: (Place & { planTitle: string; planId: string })[] = [];
    for (const plan of displayedPlans) {
      for (const place of plan.places) {
        const key = place.googlePlaceId || place.id;
        if (!seen.has(key)) {
          seen.add(key);
          places.push({ ...place, planTitle: plan.title, planId: plan.id });
        }
      }
    }
    return places;
  })();

  const clearAdvancedFilters = () => {
    setMaxBudget(null);
    setMaxDuration(null);
    setMinLikes(null);
    setMinProofs(null);
    setContentMode('tous');
  };

  const handleMapOpen = () => {
    if (!isAuthenticated) {
      setShowAccountPrompt(true);
      return;
    }
    setShowMap(true);
  };

  const formatDuration = (mins: number): string =>
    mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 > 0 ? (mins % 60 < 10 ? '0' : '') + (mins % 60) : ''}` : `${mins}min`;

  const renderStepRow = (
    label: string,
    icon: string,
    steps: number[],
    value: number | null,
    setter: (v: number | null) => void,
    formatLabel: (n: number, isLast: boolean) => string,
  ) => (
    <View style={styles.filterField}>
      <View style={styles.filterFieldHeader}>
        <Ionicons name={icon as any} size={16} color={Colors.textSecondary} />
        <Text style={[styles.filterFieldLabel, { color: Colors.textPrimary }]}>{label}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stepsRow}>
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          const isActive = value === step;
          return (
            <TouchableOpacity
              key={step}
              style={[styles.stepChip, isActive ? { backgroundColor: Colors.primary, borderColor: Colors.primary } : { backgroundColor: Colors.bgTertiary, borderColor: Colors.borderSubtle }]}
              onPress={() => setter(isActive ? null : step)}
              activeOpacity={0.7}
            >
              <Text style={[styles.stepChipText, { color: isActive ? Colors.textOnAccent : Colors.textPrimary }]}>
                {formatLabel(step, isLast)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  // ── Browse vs results: cross-fade between the default theme grid and the
  // active-filter results view. The "Voir +" subcategory expansion was
  // removed — themes are now navigation tabs and the grid below them is
  // always visible, so there's nothing to gate on subcategory state.
  const hasActiveFilters = selectedFilters.length > 0;
  const [showBrowse, setShowBrowse] = useState(true);
  const browseOpacity = useRef(new Animated.Value(1)).current;
  const resultsOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (hasActiveFilters) {
      Animated.timing(browseOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
        setShowBrowse(false);
      });
    } else {
      setShowBrowse(true);
      browseOpacity.setValue(0);
      Animated.timing(browseOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    }
  }, [hasActiveFilters]);

  // Fade in results when filters become active
  useEffect(() => {
    if (hasActiveFilters) {
      resultsOpacity.setValue(0);
      Animated.timing(resultsOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    }
  }, [hasActiveFilters]);

  // ── "Avec qui ?" — thin pills, single-select (Atlas refonte) ──
  const renderPersonRow = () => (
    <View style={styles.personSection}>
      <Text style={styles.eyebrow}>AVEC QUI ?</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.personChipsContainer}>
        {FILTERED_PERSONS.map((p) => {
          const isActive = selectedFilters.includes(p.label);
          return (
            <TouchableOpacity
              key={p.key}
              style={[styles.personPill, isActive ? styles.personPillActive : styles.personPillInactive]}
              onPress={() => toggleFilter(p.label)}
              activeOpacity={0.8}
            >
              <Text style={[styles.personPillText, isActive ? styles.personPillTextActive : styles.personPillTextInactive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  // ── Theme tabs — segmented + underline. "Dans ton quartier" lives here as
  //    the last tab with a small pin to signal its action-y nature; tap fires
  //    handleNearbyFilter instead of changing activeTheme. ──
  const renderThemeTabs = () => (
    <View style={styles.themeTabsContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.themeTabsScroll}
      >
        {THEME_GROUPS.map((group) => {
          const isNearby = group.key === 'nearby';
          const isActive = !isNearby && activeTheme === group.key;
          return (
            <TouchableOpacity
              key={group.key}
              style={styles.themeTab}
              onPress={() => {
                if (isNearby) handleNearbyFilter();
                else setActiveTheme(group.key);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.themeTabContent}>
                {isNearby && (
                  <Ionicons name="location" size={13} color={Colors.textTertiary} style={{ marginRight: 4 }} />
                )}
                <Text style={[
                  styles.themeTabLabel,
                  isActive ? { color: Colors.textPrimary } : { color: Colors.textTertiary },
                ]}>
                  {group.label}
                </Text>
              </View>
              {isActive && <View style={styles.themeTabUnderline} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  // ── Category tile (Pinterest-style staggered grid) ──
  const renderCategoryTile = (item: ExploreCategoryItem, isTall: boolean, isHot: boolean, planCount: number) => {
    const tileWidth = (width - Layout.screenPadding * 2 - 10) / 2;
    const tileHeight = isTall ? Math.round(tileWidth * (4 / 3)) : tileWidth;
    const grad = expandGradient3(item.gradient);
    const subtitle = planCount > 0
      ? `${planCount} plan${planCount > 1 ? 's' : ''}`
      : 'À découvrir';

    return (
      <TouchableOpacity
        key={item.name}
        style={[styles.tile, { width: tileWidth, height: tileHeight }]}
        onPress={() => toggleFilter(item.name)}
        activeOpacity={0.88}
      >
        <LinearGradient
          colors={grad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Bottom darkening so the title pops */}
        <LinearGradient
          colors={['transparent', 'rgba(44, 36, 32, 0.65)']}
          locations={[0.35, 1]}
          style={StyleSheet.absoluteFill}
        />
        {isHot && (
          <View style={styles.tileHotBadge}>
            <Ionicons name="sparkles" size={10} color={Colors.gold} />
            <Text style={styles.tileHotBadgeText}>Tendance</Text>
          </View>
        )}
        <View style={styles.tileBottom}>
          <Text style={styles.tileTitle} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.tileSubtitle}>{subtitle}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  /** Build the grid items for the active theme tab.
   *  Source = EXPLORE_GROUPS[activeTheme].sections[*].items (so the user
   *  sees the full curated list, not just trending picks).
   *  Overlay = trending data (hot flag + planCount) when available. */
  const renderCategoryGrid = () => {
    const group = THEME_GROUPS.find((g) => g.key === activeTheme);
    if (!group) return null;

    const items = group.sections.flatMap((s) => s.items);
    const trendingByName = new Map(trendingCategories.map((t) => [t.name, t]));
    const top3Names = new Set(trendingCategories.slice(0, 3).map((t) => t.name));

    // Split into two columns; index 0 (left) and index 3 (right) are tall —
    // global indices [0,2,4,...] go left, [1,3,5,...] go right.
    const leftCol = items.filter((_, i) => i % 2 === 0);
    const rightCol = items.filter((_, i) => i % 2 === 1);

    const enrich = (item: ExploreCategoryItem, globalIndex: number) => {
      const trend = trendingByName.get(item.name);
      const isHot = !!(trend?.hot) || top3Names.has(item.name) || !!item.hot;
      const planCount = trend?.planCount ?? item.planCount ?? 0;
      const isTall = globalIndex === 0 || globalIndex === 3;
      return renderCategoryTile(item, isTall, isHot, planCount);
    };

    return (
      <View>
        <View style={styles.gridHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, styles.eyebrowGridHeader]}>TENDANCE CETTE SEMAINE</Text>
            <Text style={styles.gridTitle}>{group.label}</Text>
          </View>
          <Text style={styles.gridCount}>{items.length} catégories</Text>
        </View>
        <View style={styles.gridRow}>
          <View style={styles.gridColumn}>
            {leftCol.map((item, lI) => enrich(item, lI * 2))}
          </View>
          <View style={styles.gridColumn}>
            {rightCol.map((item, rI) => enrich(item, rI * 2 + 1))}
          </View>
        </View>
      </View>
    );
  };

  // ── Search result renderers ──
  const getPlanPhoto = (plan: Plan): string | null => {
    if (plan.coverPhotos && plan.coverPhotos.length > 0) return plan.coverPhotos[0];
    for (const place of plan.places) {
      if (place.photoUrls && place.photoUrls.length > 0) return place.photoUrls[0];
    }
    return null;
  };

  const renderCompactPlan = ({ item }: { item: Plan }) => {
    const colors = parseGradientColors(item.gradient);
    const photo = getPlanPhoto(item);
    return (
      <TouchableOpacity style={[styles.compactCard, { borderBottomColor: Colors.borderMedium }]} activeOpacity={0.85} onPress={() => navigation.navigate('PlanDetail', { planId: item.id })}>
        <View style={styles.compactBanner}>
          {photo ? <Image source={{ uri: photo }} style={styles.compactBannerImage} /> : <LinearGradient colors={colors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
          <LinearGradient colors={['transparent', 'rgba(44,36,32,0.55)']} style={styles.compactBannerOverlay} />
          <Text style={styles.compactTitle} numberOfLines={2}>{item.title}</Text>
        </View>
        <View style={styles.compactMeta}>
          <View style={styles.compactMetaItem}><Ionicons name="cash-outline" size={13} color={Colors.gold} /><Text style={[styles.compactMetaText, { color: Colors.textPrimary }]}>{item.price}</Text></View>
          <View style={styles.compactMetaItem}><Ionicons name="hourglass-outline" size={13} color={Colors.gold} /><Text style={[styles.compactMetaText, { color: Colors.textPrimary }]}>{item.duration}</Text></View>
          <View style={styles.compactMetaItem}><Ionicons name="heart" size={13} color={Colors.gold} /><Text style={[styles.compactMetaText, { color: Colors.textPrimary }]}>{item.likesCount}</Text></View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderCompactPlace = (place: Place & { planTitle: string; planId: string }, index: number, total: number) => {
    const photo = place.photoUrls?.[0] || place.customPhoto;
    return (
      <TouchableOpacity
        key={`${place.googlePlaceId || place.id}-${index}`}
        style={[styles.placeRow, index < total - 1 && { borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle }]}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('PlanDetail', { planId: place.planId })}
      >
        {photo ? (
          <Image source={{ uri: photo }} style={styles.placeThumb} />
        ) : (
          <View style={[styles.placeThumb, { backgroundColor: Colors.bgTertiary, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="location-outline" size={18} color={Colors.textSecondary} />
          </View>
        )}
        <View style={styles.placeInfo}>
          <Text style={[styles.placeName, { color: Colors.textPrimary }]} numberOfLines={1}>{place.name}</Text>
          <Text style={[styles.placeType, { color: Colors.textSecondary }]} numberOfLines={1}>{place.type}</Text>
        </View>
        {place.rating > 0 && (
          <View style={styles.placeRating}>
            <Ionicons name="star" size={12} color={Colors.gold} />
            <Text style={[styles.placeRatingText, { color: Colors.textPrimary }]}>{place.rating.toFixed(1)}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: Colors.bgPrimary }]}>
      <View style={styles.headerRow}>
        {/* LEFT — friend requests / discovery */}
        <TouchableOpacity
          style={[styles.filterBtn, { backgroundColor: Colors.bgTertiary }]}
          onPress={() => {
            if (!isAuthenticated) { setShowAccountPrompt(true); return; }
            navigation.navigate('FriendRequests');
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="people-outline" size={18} color={Colors.textSecondary} />
          {incomingRequests.length > 0 && (
            <View style={[styles.headerBadge, { backgroundColor: Colors.primary }]}>
              <Text style={styles.headerBadgeText}>
                {incomingRequests.length > 9 ? '9+' : incomingRequests.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* CENTER — title (absolute so the side icons don't push it off-axis) */}
        <View style={styles.headerTitleAbsolute} pointerEvents="none">
          <Text style={[styles.pageTitle, { color: Colors.textPrimary }]}>{t.explore_title}</Text>
        </View>

        {/* RIGHT — map + filters */}
        <View style={styles.headerBtns}>
          <TouchableOpacity
            style={[styles.filterBtn, { backgroundColor: Colors.bgTertiary }]}
            onPress={handleMapOpen}
            activeOpacity={0.7}
          >
            <Ionicons name="map-outline" size={17} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterBtn, hasAdvancedFilters ? { backgroundColor: Colors.primary } : { backgroundColor: Colors.bgTertiary }]}
            onPress={() => setShowFiltersModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="options-outline" size={18} color={hasAdvancedFilters ? Colors.textOnAccent : Colors.textSecondary} />
            {hasAdvancedFilters && <View style={styles.filterBtnDot} />}
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar — tapping opens dedicated SearchScreen */}
      <TouchableOpacity
        style={[styles.searchBar, { backgroundColor: Colors.bgTertiary, borderColor: Colors.borderSubtle }]}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('ExploreSearch', { contentMode })}
      >
        <Ionicons name="search-outline" size={16} color={Colors.textTertiary} style={{ marginRight: 8 }} />
        <Text style={[styles.searchInput, { color: Colors.textTertiary }]}>{t.explore_search_placeholder}</Text>
      </TouchableOpacity>

      {/* "Avec qui ?" pills + Theme nav tabs (Atlas refonte) */}
      {renderPersonRow()}
      {renderThemeTabs()}

      {/* Location denied message */}
      {locationDenied && (
        <View style={styles.locationDeniedRow}>
          <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
          <Text style={[styles.locationDeniedText, { color: Colors.textSecondary }]}>Active ta localisation pour voir les plans pres de toi</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Browse view — theme grid (always visible until a filter is tapped) */}
        {showBrowse && !hasActiveFilters && (
          <Animated.View style={{ opacity: browseOpacity }}>
            {trendingLoading && trendingCategories.length === 0 ? (
              <LoadingSkeleton variant="list" />
            ) : (
              renderCategoryGrid()
            )}
          </Animated.View>
        )}

        {/* Selected filter pills + results */}
        {hasActiveFilters && (
          <Animated.View style={[styles.activeFiltersWrap, { opacity: resultsOpacity }]}>
            <View style={styles.activeFiltersRow}>
              {selectedFilters.map((f) => (
                <TouchableOpacity key={f} style={[styles.activeFilterChip, { backgroundColor: Colors.terracotta100, borderColor: Colors.primary }]} onPress={() => f === NEARBY_LABEL ? handleNearbyFilter() : toggleFilter(f)}>
                  <Text style={[styles.activeFilterText, { color: Colors.primary }]}>{f}</Text>
                  <Ionicons name="close" size={13} color={Colors.primary} />
                </TouchableOpacity>
              ))}
              {selectedFilters.length > 1 && (
                <TouchableOpacity onPress={() => { setSelectedFilters([]); setFilteredPlans([]); setLocationDenied(false); }}>
                  <Text style={[styles.clearFiltersText, { color: Colors.textSecondary }]}>Tout effacer</Text>
                </TouchableOpacity>
              )}
            </View>
                {isFilterLoading ? (
                  <LoadingSkeleton variant="list" />
                ) : (
                  <>
                    {/* Plans section */}
                    {contentMode !== 'lieux' && displayedPlans.length > 0 && (
                      <View style={{ marginTop: 12, marginHorizontal: -Layout.screenPadding }}>
                        <Text style={[styles.resultsSectionLabel, { color: Colors.textSecondary, paddingHorizontal: Layout.screenPadding }]}>Plans ({displayedPlans.length})</Text>
                        {displayedPlans.map((plan) => renderCompactPlan({ item: plan }))}
                      </View>
                    )}
                    {/* Lieux section */}
                    {contentMode !== 'plans' && displayedPlaces.length > 0 && (
                      <View style={{ marginTop: 12 }}>
                        <Text style={[styles.resultsSectionLabel, { color: Colors.textSecondary }]}>Lieux ({displayedPlaces.length})</Text>
                        {displayedPlaces.map((place, i) => renderCompactPlace(place, i, displayedPlaces.length))}
                      </View>
                    )}
                    {/* Empty */}
                    {displayedPlans.length === 0 && displayedPlaces.length === 0 && (
                      <View style={{ alignItems: 'center', paddingTop: 20 }}>
                        <Text style={[styles.noResultText, { color: Colors.textSecondary }]}>Aucun resultat pour ces filtres</Text>
                      </View>
                    )}
                  </>
                )}
              </Animated.View>
            )}
        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ── Filters Modal ── */}
      <Modal visible={showFiltersModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.filtersModal, { backgroundColor: Colors.bgSecondary }]}>
            <View style={[styles.filtersHeader, { borderBottomColor: Colors.borderSubtle }]}>
              <Text style={[styles.filtersTitle, { color: Colors.textPrimary }]}>Filtres</Text>
              <TouchableOpacity onPress={() => setShowFiltersModal(false)}>
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.filtersBody} showsVerticalScrollIndicator={false}>
              {/* Content mode toggle */}
              <View style={styles.filterField}>
                <View style={styles.filterFieldHeader}>
                  <Ionicons name="layers-outline" size={16} color={Colors.textSecondary} />
                  <Text style={[styles.filterFieldLabel, { color: Colors.textPrimary }]}>Afficher</Text>
                </View>
                <View style={[styles.modeRow, { backgroundColor: Colors.bgTertiary }]}>
                  {(['tous', 'plans', 'lieux'] as const).map((mode) => {
                    const active = contentMode === mode;
                    const label = mode === 'tous' ? 'Tous' : mode === 'plans' ? 'Plans' : 'Lieux';
                    return (
                      <TouchableOpacity
                        key={mode}
                        style={[styles.modePill, active && { backgroundColor: Colors.bgSecondary }]}
                        onPress={() => setContentMode(mode)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.modePillText, { color: active ? Colors.textPrimary : Colors.textSecondary }]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {renderStepRow('Budget maximum', 'cash-outline', BUDGET_STEPS, maxBudget, setMaxBudget,
                (n, isLast) => isLast ? `${n}${cityConfig.currency}+` : `${n}${cityConfig.currency}`)}
              {renderStepRow('Temps maximum', 'hourglass-outline', DURATION_STEPS, maxDuration, setMaxDuration,
                (n, isLast) => isLast ? `${formatDuration(n)}+` : formatDuration(n))}
              {renderStepRow('Likes minimum', 'heart-outline', LIKES_STEPS, minLikes, setMinLikes,
                (n, isLast) => isLast ? `${n}+` : `${n}`)}
              {renderStepRow('Proof. it minimum', 'checkmark-circle-outline', PROOFS_STEPS, minProofs, setMinProofs,
                (n, isLast) => isLast ? `${n}+` : `${n}`)}
            </ScrollView>

            <View style={[styles.filtersFooter, { borderTopColor: Colors.borderSubtle }]}>
              <TouchableOpacity onPress={clearAdvancedFilters} style={[styles.filtersClearBtn, { borderColor: Colors.borderMedium }]}>
                <Text style={[styles.filtersClearText, { color: Colors.textSecondary }]}>Reinitialiser</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowFiltersModal(false)} style={[styles.filtersApplyBtn, { backgroundColor: Colors.primary }]}>
                <Text style={styles.filtersApplyText}>Appliquer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Friends Map overlay */}
      <FriendsMapView visible={showMap} onClose={() => setShowMap(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingTop: 10, paddingBottom: 12, position: 'relative' } as any,
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Absolute centering — keeps the title perfectly on axis even though the
  // left column has 1 icon and the right column has 2.
  headerTitleAbsolute: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  } as any,
  pageTitle: { fontSize: 22, fontFamily: Fonts.displaySemiBold, letterSpacing: -0.3 },
  filterBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeText: {
    fontSize: 9,
    fontFamily: Fonts.bodyBold,
    color: Colors.textOnAccent,
  },
  filterBtnDot: { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.gold },
  searchBar: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, marginHorizontal: Layout.screenPadding, paddingHorizontal: 14, height: 44, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: Fonts.body },

  // Content mode toggle
  modeRow: { flexDirection: 'row', borderRadius: 10, padding: 3, marginRight: 20 },
  modePill: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8 },
  modePillText: { fontSize: 13, fontFamily: Fonts.bodySemiBold },

  // ─── Atlas refonte : "Avec qui ?" pills ───
  eyebrow: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: Colors.textTertiary,
  },
  personSection: { marginTop: 4, marginBottom: 4 },
  personChipsContainer: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 6,
  } as any,
  personPill: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  } as any,
  personPillInactive: {
    borderColor: Colors.borderMedium,
    backgroundColor: 'transparent',
  },
  personPillActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  personPillText: {
    fontSize: 12,
    fontFamily: Fonts.body,
    letterSpacing: -0.05,
  },
  personPillTextInactive: { color: Colors.textPrimary },
  personPillTextActive: { color: Colors.textOnAccent, fontWeight: '600' },

  // Theme tabs (segmented underlined nav)
  themeTabsContainer: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSubtle,
    paddingLeft: Layout.screenPadding,
    marginTop: 14,
  },
  themeTabsScroll: {
    paddingRight: Layout.screenPadding,
    alignItems: 'flex-end',
  } as any,
  themeTab: {
    paddingVertical: 8,
    marginRight: 22,
    position: 'relative',
  } as any,
  themeTabContent: { flexDirection: 'row', alignItems: 'center' } as any,
  themeTabLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontWeight: '500',
    fontSize: 17,
    letterSpacing: -0.2,
  },
  themeTabUnderline: {
    position: 'absolute',
    left: 0,
    right: 22,
    bottom: -StyleSheet.hairlineWidth,
    height: 1.5,
    backgroundColor: Colors.primary,
    borderRadius: 1,
  } as any,

  // Location denied
  locationDeniedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Layout.screenPadding, paddingVertical: 8 },
  locationDeniedText: { fontSize: 12, fontFamily: Fonts.body },

  // Browse / scroll content
  scrollContent: { paddingHorizontal: Layout.screenPadding, paddingBottom: 30 },

  // Section header above grid
  gridHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 14,
  } as any,
  eyebrowGridHeader: { marginBottom: 3 },
  gridTitle: {
    fontFamily: Fonts.displaySemiBold,
    fontWeight: '500',
    fontSize: 20,
    letterSpacing: -0.3,
    color: Colors.textPrimary,
  },
  gridCount: {
    fontSize: 11,
    color: Colors.textTertiary,
    fontFamily: Fonts.body,
  },

  // Pinterest-style 2-col staggered grid
  gridRow: { flexDirection: 'row', gap: 10 } as any,
  gridColumn: { flex: 1, gap: 10 } as any,

  // Tile
  tile: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#2C2420',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  } as any,
  tileHotBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(255, 248, 240, 0.92)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  } as any,
  tileHotBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    fontWeight: '600',
    color: Colors.textPrimary,
    letterSpacing: 0.3,
  },
  tileBottom: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 11,
  },
  tileTitle: {
    fontFamily: Fonts.displaySemiBold,
    fontWeight: '500',
    fontSize: 17,
    lineHeight: 19,
    letterSpacing: -0.3,
    color: Colors.textOnAccent,
  },
  tileSubtitle: {
    fontSize: 10.5,
    color: 'rgba(255, 248, 240, 0.8)',
    marginTop: 3,
    letterSpacing: 0.2,
    fontFamily: Fonts.body,
  },

  // Results
  resultsSectionLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10, fontFamily: Fonts.bodySemiBold },
  compactCard: { marginBottom: 0, borderBottomWidth: 1, overflow: 'hidden' },
  compactBanner: { height: 180, justifyContent: 'flex-end', padding: 14, overflow: 'hidden' },
  compactBannerImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', resizeMode: 'cover' },
  compactBannerOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 },
  compactTitle: { color: Colors.textOnAccent, fontSize: 16, fontFamily: Fonts.displayBold, textShadowColor: 'rgba(44,36,32,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  compactMeta: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, gap: 14 },
  compactMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  compactMetaText: { fontSize: 12, fontFamily: Fonts.body },

  // (Ranked / mood-list / hotBadge / planCountBadge styles removed —
  //  superseded by the Atlas grid above.)

  // Active filters
  activeFiltersWrap: { marginTop: 14 },
  activeFiltersRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  activeFilterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, gap: 4 },
  activeFilterText: { fontSize: 11, fontFamily: Fonts.bodySemiBold },
  clearFiltersText: { fontSize: 11, fontFamily: Fonts.bodySemiBold, marginLeft: 4 },
  noResultText: { fontSize: 13, fontFamily: Fonts.body },

  // Filters modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(44,36,32,0.4)', justifyContent: 'flex-end' },
  filtersModal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%' },
  filtersHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  filtersTitle: { fontSize: 18, fontFamily: Fonts.displaySemiBold },
  filtersBody: { paddingVertical: 16, paddingLeft: 20 },
  filterField: { marginBottom: 18 },
  filterFieldHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  filterFieldLabel: { fontSize: 13, fontFamily: Fonts.displayBold },
  stepsRow: { gap: 8, paddingRight: 20 },
  stepChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5 },
  stepChipText: { fontSize: 13, fontFamily: Fonts.bodySemiBold },
  filtersFooter: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1 },
  filtersClearBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
  filtersClearText: { fontSize: 14, fontFamily: Fonts.bodySemiBold },
  filtersApplyBtn: { flex: 2, alignItems: 'center', paddingVertical: 14, borderRadius: 12 },
  filtersApplyText: { fontSize: 14, fontFamily: Fonts.displayBold, color: Colors.textOnAccent },

  // Place list items
  placeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  placeThumb: { width: 48, height: 48, borderRadius: 10, overflow: 'hidden' },
  placeInfo: { flex: 1 },
  placeName: { fontSize: 14, fontFamily: Fonts.displaySemiBold },
  placeType: { fontSize: 11, fontFamily: Fonts.body, marginTop: 2 },
  placeRating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  placeRatingText: { fontSize: 12, fontFamily: Fonts.bodySemiBold },
});
