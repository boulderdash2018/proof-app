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
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout, Fonts, EXPLORE_GROUPS, PERSON_FILTERS } from '../constants';
import { ExploreCategoryItem, ExploreSection, ExploreLayout } from '../constants/exploreCategories';
import { LoadingSkeleton } from '../components';
import { Plan, Place } from '../types';
import { useColors } from '../hooks/useColors';
import { useCity } from '../hooks/useCity';
import { useTranslation } from '../hooks/useTranslation';
import { useAuthStore, useTrendingStore } from '../store';
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

export const ExploreScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const C = useColors();
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

  const [showSubcategories, setShowSubcategories] = useState(false);
  const voirPlusOpacity = useRef(new Animated.Value(0)).current;
  const [voirPlusMounted, setVoirPlusMounted] = useState(false);
  const subcatOpacity = useRef(new Animated.Value(0)).current;
  const [subcatMounted, setSubcatMounted] = useState(false);
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

  // Derive active theme group from selected filters
  const activeThemeFilter = selectedFilters.find(f => !PERSON_LABELS.has(f));
  const hasActiveThemeChip = !!activeThemeFilter && THEME_GROUPS.some(g => g.label === activeThemeFilter);
  const activeThemeGroup = hasActiveThemeChip ? THEME_GROUPS.find(g => g.label === activeThemeFilter)! : null;
  const showVoirPlusForTheme = hasActiveThemeChip && activeThemeFilter !== MOOD_LABEL && activeThemeFilter !== NEARBY_LABEL;

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

      // Auto-open subcategories for Mood, close for everything else
      if (!isPerson) {
        if (newTheme === MOOD_LABEL) {
          setShowSubcategories(true);
        } else {
          setShowSubcategories(false);
        }
      }

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
      setShowSubcategories(false);
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
    setShowSubcategories(false);

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
        <Ionicons name={icon as any} size={16} color={C.gray600} />
        <Text style={[styles.filterFieldLabel, { color: C.gray800 }]}>{label}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stepsRow}>
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          const isActive = value === step;
          return (
            <TouchableOpacity
              key={step}
              style={[styles.stepChip, isActive ? { backgroundColor: Colors.primary, borderColor: Colors.primary } : { backgroundColor: C.gray200, borderColor: C.borderLight }]}
              onPress={() => setter(isActive ? null : step)}
              activeOpacity={0.7}
            >
              <Text style={[styles.stepChipText, { color: isActive ? '#FFF' : C.gray800 }]}>
                {formatLabel(step, isLast)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  // ── Trending / results fade ──
  const hasActiveFilters = selectedFilters.length > 0;
  const shouldHideTrending = showSubcategories || hasActiveFilters;
  const [showTrending, setShowTrending] = useState(true);
  const trendingOpacity = useRef(new Animated.Value(1)).current;
  const resultsOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (shouldHideTrending) {
      Animated.timing(trendingOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
        setShowTrending(false);
      });
    } else {
      setShowTrending(true);
      trendingOpacity.setValue(0);
      Animated.timing(trendingOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    }
  }, [shouldHideTrending]);

  // Fade in results when filters become active
  useEffect(() => {
    if (hasActiveFilters) {
      resultsOpacity.setValue(0);
      Animated.timing(resultsOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    }
  }, [hasActiveFilters]);

  // Close subcategories when no theme is active
  useEffect(() => {
    if (!hasActiveThemeChip) setShowSubcategories(false);
  }, [hasActiveThemeChip]);

  // Fade "Voir +" button in/out (excluded for Mood & Nearby)
  useEffect(() => {
    if (showVoirPlusForTheme) {
      setVoirPlusMounted(true);
      voirPlusOpacity.setValue(0);
      Animated.timing(voirPlusOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    } else {
      Animated.timing(voirPlusOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
        setVoirPlusMounted(false);
      });
    }
  }, [showVoirPlusForTheme]);

  // Fade subcategories panel in/out
  useEffect(() => {
    if (showSubcategories) {
      setSubcatMounted(true);
      subcatOpacity.setValue(0);
      Animated.timing(subcatOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    } else {
      Animated.timing(subcatOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
        setSubcatMounted(false);
      });
    }
  }, [showSubcategories]);

  // ── Row 1: Person filters (single-select) ──
  const renderPersonRow = () => (
    <View style={styles.filterSection}>
      <Text style={[styles.filterLabel, { color: C.gray500 }]}>Par personne</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContainer}>
        {FILTERED_PERSONS.map((p) => {
          const isActive = selectedFilters.includes(p.label);
          return (
            <TouchableOpacity
              key={p.key}
              style={[styles.chip, isActive ? { backgroundColor: Colors.primary, borderColor: Colors.primary } : { backgroundColor: C.gray200, borderColor: C.border }]}
              onPress={() => toggleFilter(p.label)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, { color: isActive ? '#FFF' : C.gray800 }]}>{p.emoji} {p.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  // ── Row 2: Theme chips (always single-select filter mode) ──
  const renderThemeRow = () => (
    <View style={styles.filterSection}>
      <Text style={[styles.filterLabel, { color: C.gray500 }]}>Par thème</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContainer}>
        {THEME_GROUPS.map((group) => {
          const isActive = selectedFilters.includes(group.label);
          return (
            <TouchableOpacity
              key={group.key}
              style={[styles.chip, isActive ? { backgroundColor: Colors.primary, borderColor: Colors.primary } : { backgroundColor: C.gray200, borderColor: C.border }]}
              onPress={() => group.key === 'nearby' ? handleNearbyFilter() : toggleFilter(group.label)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, { color: isActive ? '#FFF' : C.gray800 }]}>{group.emoji} {group.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  // ── Renderers ──
  const renderCategoryItem = (item: ExploreCategoryItem, index: number, totalItems: number) => {
    const isSelected = selectedFilters.includes(item.name);
    const isLast = index === totalItems - 1;
    return (
      <TouchableOpacity
        key={item.name}
        style={[styles.flatRow, !isLast && { borderBottomWidth: 1, borderBottomColor: C.borderLight }, isSelected && { backgroundColor: Colors.primary + '10' }]}
        activeOpacity={0.7}
        onPress={() => toggleFilter(item.name)}
      >
        <Text style={styles.flatEmoji}>{item.emoji}</Text>
        <View style={styles.flatTextCol}>
          <Text style={[styles.flatName, { color: C.black }]}>{item.name}</Text>
          {item.subtitle ? <Text style={[styles.flatSub, { color: C.gray600 }]}>{item.subtitle}</Text> : null}
        </View>
        {isSelected ? (
          <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
        ) : item.hot ? (
          <View style={[styles.hotBadge, { backgroundColor: C.primary + '18' }]}>
            <Text style={[styles.hotBadgeText, { color: C.primary }]}>🔥</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderRankedItem = (item: ExploreCategoryItem, rank: number) => {
    const isSelected = selectedFilters.includes(item.name);
    return (
      <TouchableOpacity key={item.name} style={[styles.rankedRow, { borderBottomColor: C.border, backgroundColor: isSelected ? Colors.primary + '10' : 'transparent' }]} activeOpacity={0.7} onPress={() => toggleFilter(item.name)}>
        <Text style={[styles.rankNumber, { color: C.primary }]}>{rank}</Text>
        <View style={[styles.rankEmojiCircle, { backgroundColor: C.gray200 }]}>
          <Text style={styles.rankEmoji}>{item.emoji}</Text>
        </View>
        <View style={styles.rankTextCol}>
          <Text style={[styles.rankName, { color: C.black }]}>{item.name}</Text>
          {item.subtitle ? <Text style={[styles.rankSub, { color: C.gray600 }]}>{item.subtitle}</Text> : null}
        </View>
        {isSelected ? (
          <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
        ) : item.badgeLabel ? (
          <View style={[styles.hotBadge, { backgroundColor: item.hot ? C.primary + '18' : '#22C55E18' }]}>
            <Text style={[styles.hotBadgeText, { color: item.hot ? C.primary : '#22C55E' }]}>{item.badgeLabel}</Text>
          </View>
        ) : item.hot ? (
          <View style={[styles.hotBadge, { backgroundColor: C.primary + '18' }]}>
            <Text style={[styles.hotBadgeText, { color: C.primary }]}>🔥 Cette semaine</Text>
          </View>
        ) : item.planCount ? (
          <View style={[styles.planCountBadge, { backgroundColor: C.gray200 }]}>
            <Text style={[styles.planCountText, { color: C.gray700 }]}>{item.planCount} plans</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderSection = (section: ExploreSection, idx: number, layout: ExploreLayout) => (
    <View key={`${section.title}-${idx}`} style={styles.section}>
      <Text style={[styles.sectionTitle, { color: C.gray600 }]}>{section.title}</Text>
      {layout === 'mood-list' ? (
        <View>{section.items.map((item, i) => renderCategoryItem(item, i, section.items.length))}</View>
      ) : layout === 'ranked-list' ? (
        <View>{section.items.map((item, i) => renderRankedItem(item, i + 1))}</View>
      ) : (
        <View>{section.items.map((item, i) => renderCategoryItem(item, i, section.items.length))}</View>
      )}
    </View>
  );

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
      <TouchableOpacity style={[styles.compactCard, { borderBottomColor: C.border }]} activeOpacity={0.85} onPress={() => navigation.navigate('PlanDetail', { planId: item.id })}>
        <View style={styles.compactBanner}>
          {photo ? <Image source={{ uri: photo }} style={styles.compactBannerImage} /> : <LinearGradient colors={colors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={styles.compactBannerOverlay} />
          <Text style={styles.compactTitle} numberOfLines={2}>{item.title}</Text>
        </View>
        <View style={styles.compactMeta}>
          <View style={styles.compactMetaItem}><Ionicons name="cash-outline" size={13} color={C.gold} /><Text style={[styles.compactMetaText, { color: C.gray800 }]}>{item.price}</Text></View>
          <View style={styles.compactMetaItem}><Ionicons name="hourglass-outline" size={13} color={C.gold} /><Text style={[styles.compactMetaText, { color: C.gray800 }]}>{item.duration}</Text></View>
          <View style={styles.compactMetaItem}><Ionicons name="heart" size={13} color={C.gold} /><Text style={[styles.compactMetaText, { color: C.gray800 }]}>{item.likesCount}</Text></View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderCompactPlace = (place: Place & { planTitle: string; planId: string }, index: number, total: number) => {
    const photo = place.photoUrls?.[0] || place.customPhoto;
    return (
      <TouchableOpacity
        key={`${place.googlePlaceId || place.id}-${index}`}
        style={[styles.placeRow, index < total - 1 && { borderBottomWidth: 1, borderBottomColor: C.borderLight }]}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('PlanDetail', { planId: place.planId })}
      >
        {photo ? (
          <Image source={{ uri: photo }} style={styles.placeThumb} />
        ) : (
          <View style={[styles.placeThumb, { backgroundColor: C.gray300, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="location-outline" size={18} color={C.gray600} />
          </View>
        )}
        <View style={styles.placeInfo}>
          <Text style={[styles.placeName, { color: C.black }]} numberOfLines={1}>{place.name}</Text>
          <Text style={[styles.placeType, { color: C.gray600 }]} numberOfLines={1}>{place.type}</Text>
        </View>
        {place.rating > 0 && (
          <View style={styles.placeRating}>
            <Ionicons name="star" size={12} color={Colors.gold} />
            <Text style={[styles.placeRatingText, { color: C.gray800 }]}>{place.rating.toFixed(1)}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.pageTitle, { color: C.black }]}>{t.explore_title}</Text>
        <View style={styles.headerBtns}>
          <TouchableOpacity
            style={[styles.filterBtn, { backgroundColor: C.gray200 }]}
            onPress={handleMapOpen}
            activeOpacity={0.7}
          >
            <Ionicons name="map-outline" size={17} color={C.gray700} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterBtn, hasAdvancedFilters ? { backgroundColor: Colors.primary } : { backgroundColor: C.gray200 }]}
            onPress={() => setShowFiltersModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="options-outline" size={18} color={hasAdvancedFilters ? '#FFF' : C.gray700} />
            {hasAdvancedFilters && <View style={styles.filterBtnDot} />}
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar — tapping opens dedicated SearchScreen */}
      <TouchableOpacity
        style={[styles.searchBar, { backgroundColor: C.gray200, borderColor: C.border }]}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('ExploreSearch', { contentMode })}
      >
        <Ionicons name="search-outline" size={16} color={C.gray600} style={{ marginRight: 8 }} />
        <Text style={[styles.searchInput, { color: C.gray600 }]}>{t.explore_search_placeholder}</Text>
      </TouchableOpacity>

      {/* Filter rows */}
      {renderPersonRow()}
      {renderThemeRow()}

      {/* "Voir +" button — only for themes with subcategories (not Mood/Nearby) */}
      {voirPlusMounted && (
        <Animated.View style={[styles.voirPlusRow, { opacity: voirPlusOpacity }]}>
          <TouchableOpacity
            style={[styles.voirPlusBtn, showSubcategories ? { backgroundColor: Colors.gold, borderColor: Colors.gold } : { backgroundColor: C.gray200, borderColor: C.border }]}
            onPress={() => setShowSubcategories(!showSubcategories)}
            activeOpacity={0.8}
          >
            <Text style={[styles.voirPlusText, { color: showSubcategories ? '#FFF' : C.gray800 }]}>Voir +</Text>
            <Ionicons name={showSubcategories ? 'chevron-up' : 'chevron-down'} size={14} color={showSubcategories ? '#FFF' : C.gray800} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Location denied message */}
      {locationDenied && (
        <View style={styles.locationDeniedRow}>
          <Ionicons name="location-outline" size={14} color={C.gray600} />
          <Text style={[styles.locationDeniedText, { color: C.gray600 }]}>Active ta localisation pour voir les plans près de toi</Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Subcategories when "Voir +" is open */}
            {subcatMounted && activeThemeGroup && (
              <Animated.View style={{ opacity: subcatOpacity }}>
                {activeThemeGroup.sections.map((section, idx) => renderSection(section, idx, activeThemeGroup.layout))}
              </Animated.View>
            )}

            {/* Trending categories list — hidden when any filter is active */}
            {showTrending && !hasActiveFilters && (
              <Animated.View style={{ opacity: trendingOpacity }}>
                <Text style={[styles.trendingLabel, { color: C.gray600 }]}>CATÉGORIES EN TENDANCE</Text>
                {trendingLoading ? (
                  <LoadingSkeleton variant="list" />
                ) : (
                  <View>
                    {trendingCategories.map((cat, i) => {
                      const isSelected = selectedFilters.includes(cat.name);
                      const isLast = i === trendingCategories.length - 1;
                      return (
                        <TouchableOpacity
                          key={cat.name}
                          style={[styles.trendingRow, !isLast && { borderBottomWidth: 1, borderBottomColor: C.borderLight }]}
                          activeOpacity={0.7}
                          onPress={() => toggleFilter(cat.name)}
                        >
                          <Text style={styles.trendingEmoji}>{cat.emoji}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.trendingName, { color: C.black }]}>{cat.name}</Text>
                            <Text style={[styles.trendingCount, { color: C.gray600 }]}>{cat.planCount} plan{cat.planCount > 1 ? 's' : ''}</Text>
                          </View>
                          {isSelected && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </Animated.View>
            )}

            {/* Selected filter pills + results */}
            {hasActiveFilters && (
              <Animated.View style={[styles.activeFiltersWrap, { opacity: resultsOpacity }]}>
                <View style={styles.activeFiltersRow}>
                  {selectedFilters.map((f) => (
                    <TouchableOpacity key={f} style={[styles.activeFilterChip, { backgroundColor: Colors.primary + '20', borderColor: Colors.primary }]} onPress={() => f === NEARBY_LABEL ? handleNearbyFilter() : toggleFilter(f)}>
                      <Text style={[styles.activeFilterText, { color: Colors.primary }]}>{f}</Text>
                      <Ionicons name="close" size={13} color={Colors.primary} />
                    </TouchableOpacity>
                  ))}
                  {selectedFilters.length > 1 && (
                    <TouchableOpacity onPress={() => { setSelectedFilters([]); setFilteredPlans([]); setLocationDenied(false); setShowSubcategories(false); }}>
                      <Text style={[styles.clearFiltersText, { color: C.gray600 }]}>Tout effacer</Text>
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
                        <Text style={[styles.resultsSectionLabel, { color: C.gray700, paddingHorizontal: Layout.screenPadding }]}>Plans ({displayedPlans.length})</Text>
                        {displayedPlans.map((plan) => renderCompactPlan({ item: plan }))}
                      </View>
                    )}
                    {/* Lieux section */}
                    {contentMode !== 'plans' && displayedPlaces.length > 0 && (
                      <View style={{ marginTop: 12 }}>
                        <Text style={[styles.resultsSectionLabel, { color: C.gray700 }]}>Lieux ({displayedPlaces.length})</Text>
                        {displayedPlaces.map((place, i) => renderCompactPlace(place, i, displayedPlaces.length))}
                      </View>
                    )}
                    {/* Empty */}
                    {displayedPlans.length === 0 && displayedPlaces.length === 0 && (
                      <View style={{ alignItems: 'center', paddingTop: 20 }}>
                        <Text style={[styles.noResultText, { color: C.gray600 }]}>Aucun résultat pour ces filtres</Text>
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
          <View style={[styles.filtersModal, { backgroundColor: C.white }]}>
            <View style={[styles.filtersHeader, { borderBottomColor: C.borderLight }]}>
              <Text style={[styles.filtersTitle, { color: C.black }]}>Filtres</Text>
              <TouchableOpacity onPress={() => setShowFiltersModal(false)}>
                <Ionicons name="close" size={22} color={C.gray700} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.filtersBody} showsVerticalScrollIndicator={false}>
              {/* Content mode toggle */}
              <View style={styles.filterField}>
                <View style={styles.filterFieldHeader}>
                  <Ionicons name="layers-outline" size={16} color={C.gray600} />
                  <Text style={[styles.filterFieldLabel, { color: C.gray800 }]}>Afficher</Text>
                </View>
                <View style={[styles.modeRow, { backgroundColor: C.gray200 }]}>
                  {(['tous', 'plans', 'lieux'] as const).map((mode) => {
                    const active = contentMode === mode;
                    const label = mode === 'tous' ? 'Tous' : mode === 'plans' ? 'Plans' : 'Lieux';
                    return (
                      <TouchableOpacity
                        key={mode}
                        style={[styles.modePill, active && { backgroundColor: C.white }]}
                        onPress={() => setContentMode(mode)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.modePillText, { color: active ? C.black : C.gray600 }]}>
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
              {renderStepRow('Proof it minimum', 'checkmark-circle-outline', PROOFS_STEPS, minProofs, setMinProofs,
                (n, isLast) => isLast ? `${n}+` : `${n}`)}
            </ScrollView>

            <View style={[styles.filtersFooter, { borderTopColor: C.borderLight }]}>
              <TouchableOpacity onPress={clearAdvancedFilters} style={[styles.filtersClearBtn, { borderColor: C.borderLight }]}>
                <Text style={[styles.filtersClearText, { color: C.gray700 }]}>Réinitialiser</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowFiltersModal(false)} style={[styles.filtersApplyBtn, { backgroundColor: C.primary }]}>
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
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingTop: 10, paddingBottom: 12 },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pageTitle: { fontSize: 22, fontFamily: Fonts.serifBold, letterSpacing: -0.3 },
  filterBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  filterBtnDot: { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.gold },
  searchBar: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, marginHorizontal: Layout.screenPadding, paddingHorizontal: 14, height: 44, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 14 },

  // Content mode toggle
  modeRow: { flexDirection: 'row', borderRadius: 10, padding: 3, marginRight: 20 },
  modePill: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8 },
  modePillText: { fontSize: 13, fontFamily: Fonts.serifSemiBold },

  // Filter rows
  filterSection: { marginBottom: 4, paddingLeft: Layout.screenPadding },
  filterLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  chipsContainer: { paddingRight: Layout.screenPadding, gap: 8, paddingBottom: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: Fonts.serifSemiBold },

  // "Voir +" standalone button
  voirPlusRow: { alignItems: 'flex-end', paddingHorizontal: Layout.screenPadding, paddingTop: 2, paddingBottom: 6 },
  voirPlusBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  voirPlusText: { fontSize: 13, fontFamily: Fonts.serifSemiBold, fontWeight: '700' },

  // Location denied
  locationDeniedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Layout.screenPadding, paddingVertical: 8 },
  locationDeniedText: { fontSize: 12, fontFamily: Fonts.serif },

  // Trending section
  trendingLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, marginTop: 6 },
  trendingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14 },
  trendingEmoji: { fontSize: 28 },
  trendingName: { fontSize: 15, fontFamily: Fonts.serifSemiBold },
  trendingCount: { fontSize: 12, marginTop: 2 },

  // Category sections
  scrollContent: { paddingHorizontal: Layout.screenPadding },
  section: { marginTop: 18 },
  sectionTitle: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 },
  // Flat list items
  flatRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  flatEmoji: { fontSize: 28, width: 40, textAlign: 'center', marginRight: 12 },
  flatTextCol: { flex: 1 },
  flatName: { fontSize: 15, fontFamily: Fonts.serifSemiBold },
  flatSub: { fontSize: 11, marginTop: 2 },

  // Results
  resultsSectionLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 },
  compactCard: { marginBottom: 0, borderBottomWidth: 1, overflow: 'hidden' },
  compactBanner: { height: 180, justifyContent: 'flex-end', padding: 14, overflow: 'hidden' },
  compactBannerImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', resizeMode: 'cover' },
  compactBannerOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 },
  compactTitle: { color: '#FFFFFF', fontSize: 16, fontFamily: Fonts.serifBold, textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  compactMeta: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, gap: 14 },
  compactMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  compactMetaText: { fontSize: 12 },

  // (mood-list now uses flatRow renderer)

  // Ranked
  rankedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1 },
  rankNumber: { fontSize: 20, fontFamily: Fonts.serifBold, width: 32 },
  rankEmojiCircle: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rankEmoji: { fontSize: 24 },
  rankTextCol: { flex: 1 },
  rankName: { fontSize: 14, fontFamily: Fonts.serifBold },
  rankSub: { fontSize: 12, marginTop: 2 },
  hotBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginLeft: 8 },
  hotBadgeText: { fontSize: 12, fontWeight: '600' },
  planCountBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginLeft: 8 },
  planCountText: { fontSize: 12, fontWeight: '500' },

  // Active filters
  activeFiltersWrap: { marginTop: 14 },
  activeFiltersRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  activeFilterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, gap: 4 },
  activeFilterText: { fontSize: 11, fontFamily: Fonts.serifSemiBold },
  clearFiltersText: { fontSize: 11, fontFamily: Fonts.serifSemiBold, marginLeft: 4 },
  noResultText: { fontSize: 13, fontFamily: Fonts.serif },

  // Filters modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  filtersModal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%' },
  filtersHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  filtersTitle: { fontSize: 18, fontFamily: Fonts.serifBold },
  filtersBody: { paddingVertical: 16, paddingLeft: 20 },
  filterField: { marginBottom: 18 },
  filterFieldHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  filterFieldLabel: { fontSize: 13, fontFamily: Fonts.serifBold },
  stepsRow: { gap: 8, paddingRight: 20 },
  stepChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1.5 },
  stepChipText: { fontSize: 13, fontFamily: Fonts.serifSemiBold },
  filtersFooter: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1 },
  filtersClearBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1 },
  filtersClearText: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
  filtersApplyBtn: { flex: 2, alignItems: 'center', paddingVertical: 14, borderRadius: 12 },
  filtersApplyText: { fontSize: 14, fontFamily: Fonts.serifBold, color: '#FFF' },

  // Place list items
  placeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  placeThumb: { width: 48, height: 48, borderRadius: 10, overflow: 'hidden' },
  placeInfo: { flex: 1 },
  placeName: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
  placeType: { fontSize: 11, fontFamily: Fonts.serif, marginTop: 2 },
  placeRating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  placeRatingText: { fontSize: 12, fontFamily: Fonts.serifSemiBold },
});
