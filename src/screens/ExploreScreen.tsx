import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput as RNTextInput,
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
import { EmptyState, LoadingSkeleton } from '../components';
import { Plan } from '../types';
import { useColors } from '../hooks/useColors';
import { useCity } from '../hooks/useCity';
import { useTranslation } from '../hooks/useTranslation';
import { searchUsers } from '../services/friendsService';
import { useAuthStore, useTrendingStore, useSavedPlacesStore } from '../store';
import { fetchPublicPlansByTags, searchPublicPlans } from '../services/plansService';
import {
  searchPlacesNearby,
  getReadableType,
  priceLevelToSymbol,
  GooglePlaceDetails,
} from '../services/googlePlacesService';

const { width } = Dimensions.get('window');
const CARD_GAP = 10;
const CARD_WIDTH = (width - Layout.screenPadding * 2 - CARD_GAP) / 2;

const parseGradientColors = (gradient: string): string[] => {
  const matches = gradient.match(/#[0-9A-Fa-f]{6}/g);
  return matches && matches.length >= 2 ? matches : ['#8B6A50', '#5C4030'];
};

const THEME_GROUPS = EXPLORE_GROUPS.filter(g => g.key !== 'mood' && g.key !== 'trending');
const FILTERED_PERSONS = PERSON_FILTERS.filter(p => p.key !== 'around-you');
const PERSON_LABELS = new Set(PERSON_FILTERS.map(p => p.label));

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
  const trendingCategories = useTrendingStore((s) => s.categories);
  const trendingLoading = useTrendingStore((s) => s.isLoading);
  const fetchTrending = useTrendingStore((s) => s.fetchTrending);
  const cityConfig = useCity();
  const savedPlacesStore = useSavedPlacesStore();

  // Fetch trending on mount (5-min cache in store)
  useEffect(() => { fetchTrending(cityConfig.name); }, [cityConfig.name]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTheme, setSelectedTheme] = useState(EXPLORE_GROUPS[0].key);
  const [showSubcategories, setShowSubcategories] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [filteredPlans, setFilteredPlans] = useState<Plan[]>([]);
  const [searchUsers_, setSearchUsers_] = useState<any[]>([]);
  const [googlePlaces, setGooglePlaces] = useState<GooglePlaceDetails[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFilterLoading, setIsFilterLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Advanced filters (null = off, number = active threshold)
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [maxBudget, setMaxBudget] = useState<number | null>(null);
  const [maxDuration, setMaxDuration] = useState<number | null>(null);
  const [minLikes, setMinLikes] = useState<number | null>(null);
  const [minProofs, setMinProofs] = useState<number | null>(null);
  const hasAdvancedFilters = maxBudget !== null || maxDuration !== null || minLikes !== null || minProofs !== null;

  const BUDGET_STEPS = [20, 50, 100, 200, 500];
  const DURATION_STEPS = [30, 60, 120, 180, 360];
  const LIKES_STEPS = [1, 5, 10, 25, 50];
  const PROOFS_STEPS = [1, 3, 5, 10, 25];

  const activeGroup = THEME_GROUPS.find((g) => g.key === selectedTheme) || THEME_GROUPS[0];

  const toggleFilter = useCallback((label: string) => {
    setSelectedFilters((prev) => {
      const next = prev.includes(label) ? prev.filter((f) => f !== label) : [...prev, label];
      // Debounced fetch with intersection logic
      if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
      if (next.length > 0) {
        setIsFilterLoading(true);
        filterTimerRef.current = setTimeout(async () => {
          const plans = await fetchPublicPlansByTags(next, cityConfig.name);
          // Split into person vs theme filters
          const persons = next.filter((f) => PERSON_LABELS.has(f));
          const themes = next.filter((f) => !PERSON_LABELS.has(f));
          // Intersection: plan must match ≥1 from each non-empty group
          const filtered = plans.filter((plan) => {
            const okPerson = persons.length === 0 || persons.some((p) => plan.tags.includes(p));
            const okTheme = themes.length === 0 || themes.some((t) => plan.tags.includes(t));
            return okPerson && okTheme;
          });
          setFilteredPlans(filtered);
          setIsFilterLoading(false);
        }, 300);
      } else {
        setFilteredPlans([]);
        setIsFilterLoading(false);
      }
      return next;
    });
  }, [cityConfig.name]);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (query.length < 2) {
      setFilteredPlans([]);
      setSearchUsers_([]);
      setGooglePlaces([]);
      return;
    }
    setIsSearching(true);
    if (query.startsWith('@')) {
      const users = await searchUsers(query.slice(1), currentUser?.id || '');
      setSearchUsers_(users);
      setFilteredPlans([]);
      setGooglePlaces([]);
      setIsSearching(false);
    } else {
      const plans = await searchPublicPlans(query, cityConfig.name);
      setFilteredPlans(plans);
      setSearchUsers_([]);
      searchTimerRef.current = setTimeout(async () => {
        const places = await searchPlacesNearby(query + ' ' + cityConfig.name, cityConfig.coordinates);
        setGooglePlaces(places);
        setIsSearching(false);
      }, 400);
    }
  }, [currentUser, cityConfig.name]);

  const handleClear = () => {
    setSearchQuery('');
    setFilteredPlans([]);
    setSearchUsers_([]);
    setGooglePlaces([]);
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

  const clearAdvancedFilters = () => {
    setMaxBudget(null);
    setMaxDuration(null);
    setMinLikes(null);
    setMinProofs(null);
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

  const showCategories = searchQuery.length < 2;

  // ── Trending section fade ──
  const [showTrending, setShowTrending] = useState(true);
  const trendingOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (showSubcategories) {
      Animated.timing(trendingOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setShowTrending(false);
      });
    } else {
      setShowTrending(true);
      trendingOpacity.setValue(0);
      Animated.timing(trendingOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [showSubcategories]);

  // ── Row 1: Person filters (multi-select) ──
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

  // ── Row 2: Theme chips ──
  // Closed: chips are multi-select filters (like person row)
  // Open:   chips are tabs to pick which subcategories to show
  const renderThemeRow = () => (
    <View style={styles.filterSection}>
      <Text style={[styles.filterLabel, { color: C.gray500 }]}>Par thème</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContainer}>
        {THEME_GROUPS.map((group) => {
          const isActive = showSubcategories
            ? group.key === selectedTheme
            : selectedFilters.includes(group.label);
          return (
            <TouchableOpacity
              key={group.key}
              style={[styles.chip, isActive ? { backgroundColor: Colors.primary, borderColor: Colors.primary } : { backgroundColor: C.gray200, borderColor: C.border }]}
              onPress={() => {
                if (showSubcategories) {
                  setSelectedTheme(group.key);
                } else {
                  toggleFilter(group.label);
                }
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, { color: isActive ? '#FFF' : C.gray800 }]}>{group.emoji} {group.label}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[styles.chip, showSubcategories ? { backgroundColor: Colors.gold, borderColor: Colors.gold } : { backgroundColor: C.gray200, borderColor: C.border }]}
          onPress={() => setShowSubcategories(!showSubcategories)}
          activeOpacity={0.8}
        >
          <Text style={[styles.chipText, { color: showSubcategories ? '#FFF' : C.gray800, fontWeight: '700' }]}>Voir +</Text>
          <Ionicons name={showSubcategories ? 'chevron-up' : 'chevron-down'} size={15} color={showSubcategories ? '#FFF' : C.gray800} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  // ── Renderers ──
  const renderCategoryCard = (item: ExploreCategoryItem, index: number, rowLength: number) => {
    const isSelected = selectedFilters.includes(item.name);
    return (
      <TouchableOpacity
        key={item.name}
        style={[styles.catCard, { marginRight: index % 2 === 0 && rowLength > 1 ? CARD_GAP : 0 }]}
        activeOpacity={0.85}
        onPress={() => toggleFilter(item.name)}
      >
        <LinearGradient colors={item.gradient as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.catCardGradient, isSelected && { borderColor: Colors.primary, borderWidth: 2.5 }]}>
          {isSelected && (
            <View style={styles.catCheckMark}>
              <Ionicons name="checkmark-circle" size={20} color="#FFF" />
            </View>
          )}
          <View style={styles.catIconWrap}>
            <Ionicons name={(item.icon || 'ellipse-outline') as any} size={26} color={Colors.gold} />
          </View>
          <View style={styles.catCardContent}>
            <Text style={styles.catName} numberOfLines={2}>{item.name}</Text>
            {item.subtitle ? <Text style={styles.catSubtitle}>{item.subtitle}</Text> : null}
            {item.hot ? <View style={styles.catHotDot} /> : null}
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  const renderMoodItem = (item: ExploreCategoryItem) => {
    const isSelected = selectedFilters.includes(item.name);
    return (
      <TouchableOpacity key={item.name} style={[styles.moodCard, { backgroundColor: C.gray200, borderColor: isSelected ? Colors.primary : C.border, borderWidth: isSelected ? 2 : 1 }]} activeOpacity={0.7} onPress={() => toggleFilter(item.name)}>
        <Text style={styles.moodEmoji}>{item.emoji}</Text>
        <View style={styles.moodTextCol}>
          <Text style={[styles.moodName, { color: C.black }]}>{item.name}</Text>
          {item.subtitle ? <Text style={[styles.moodSub, { color: C.gray600 }]}>{item.subtitle}</Text> : null}
        </View>
        {isSelected ? <Ionicons name="checkmark-circle" size={20} color={Colors.primary} /> : <Ionicons name="chevron-forward" size={18} color={C.gray500} />}
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
        <View style={styles.moodList}>{section.items.map((item) => renderMoodItem(item))}</View>
      ) : layout === 'ranked-list' ? (
        <View>{section.items.map((item, i) => renderRankedItem(item, i + 1))}</View>
      ) : (
        <View style={styles.catGrid}>{section.items.map((item, i) => renderCategoryCard(item, i, section.items.length))}</View>
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
      <TouchableOpacity style={[styles.compactCard, { borderColor: C.cardBorder, backgroundColor: C.gray200 }]} activeOpacity={0.85} onPress={() => navigation.navigate('PlanDetail', { planId: item.id })}>
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

  const renderUserResult = (user: any) => (
    <TouchableOpacity key={user.id} style={[styles.userRow, { borderBottomColor: C.borderLight }]} onPress={() => navigation.navigate('OtherProfile', { userId: user.id })} activeOpacity={0.7}>
      <View style={[styles.userAvatar, { backgroundColor: user.avatarBg }]}>
        <Text style={[styles.userInitials, { color: user.avatarColor }]}>{user.initials}</Text>
      </View>
      <View>
        <Text style={[styles.userName, { color: C.black }]}>{user.displayName}</Text>
        <Text style={[styles.userHandle, { color: C.gray600 }]}>@{user.username}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.pageTitle, { color: C.black }]}>{t.explore_title}</Text>
        <TouchableOpacity
          style={[styles.filterBtn, hasAdvancedFilters ? { backgroundColor: Colors.primary } : { backgroundColor: C.gray200 }]}
          onPress={() => setShowFiltersModal(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="options-outline" size={18} color={hasAdvancedFilters ? '#FFF' : C.gray700} />
          {hasAdvancedFilters && <View style={styles.filterBtnDot} />}
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={[styles.searchBar, { backgroundColor: C.gray200, borderColor: C.border }]}>
        <Ionicons name="search-outline" size={16} color={C.gray600} style={{ marginRight: 8 }} />
        <RNTextInput style={[styles.searchInput, { color: C.black }]} placeholder={t.explore_search_placeholder} placeholderTextColor={C.gray600} value={searchQuery} onChangeText={handleSearch} />
        {searchQuery.length > 0 && <TouchableOpacity onPress={handleClear}><Ionicons name="close-circle" size={18} color={C.gray600} /></TouchableOpacity>}
      </View>

      {/* Filter rows — hidden during active search */}
      {showCategories && renderPersonRow()}
      {showCategories && renderThemeRow()}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {!showCategories ? (
          /* ── Search results ── */
          searchUsers_.length > 0 ? (
            <>
              <Text style={[styles.resultsSectionLabel, { color: C.gray700 }]}>{t.explore_users_count} ({searchUsers_.length})</Text>
              {searchUsers_.map(renderUserResult)}
            </>
          ) : (
            <>
              {googlePlaces.length > 0 && (
                <>
                  <Text style={[styles.resultsSectionLabel, { color: C.gray700 }]}>Lieux ({Math.min(googlePlaces.length, 3)})</Text>
                  {[...googlePlaces].sort((a, b) => b.reviewCount - a.reviewCount).slice(0, 3).map((place) => {
                    const isSaved = savedPlacesStore.isPlaceSaved(place.placeId);
                    return (
                    <TouchableOpacity key={place.placeId} style={[styles.googlePlaceCard, { backgroundColor: C.gray200, borderColor: C.border }]} activeOpacity={0.7} onPress={() => navigation.navigate('PlaceDetail', { googlePlaceId: place.placeId })}>
                      {place.photoUrls.length > 0 ? <Image source={{ uri: place.photoUrls[0] }} style={styles.googlePlacePhoto} /> : <View style={[styles.googlePlacePhoto, { backgroundColor: C.gray300, alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="location" size={24} color={C.gray600} /></View>}
                      <View style={styles.googlePlaceInfo}>
                        <Text style={[styles.googlePlaceName, { color: C.black }]} numberOfLines={1}>{place.name}</Text>
                        <Text style={[styles.googlePlaceType, { color: C.gray700 }]} numberOfLines={1}>{getReadableType(place.types)} {place.priceLevel !== undefined ? '· ' + priceLevelToSymbol(place.priceLevel) : ''}</Text>
                        {place.rating > 0 && <View style={styles.googlePlaceRating}><Ionicons name="star" size={12} color={C.primary} /><Text style={[styles.googlePlaceRatingText, { color: C.black }]}>{place.rating.toFixed(1)}</Text><Text style={[styles.googlePlaceReviewCount, { color: C.gray600 }]}>({place.reviewCount})</Text></View>}
                        <Text style={[styles.googlePlaceAddress, { color: C.gray600 }]} numberOfLines={1}>{place.address}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.saveStarBtn}
                        activeOpacity={0.6}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        onPress={(e) => {
                          e.stopPropagation();
                          if (isSaved) {
                            savedPlacesStore.unsavePlace(place.placeId);
                          } else {
                            savedPlacesStore.savePlace({
                              placeId: place.placeId,
                              name: place.name,
                              address: place.address,
                              types: place.types,
                              rating: place.rating,
                              reviewCount: place.reviewCount,
                              photoUrl: place.photoUrls.length > 0 ? place.photoUrls[0] : null,
                              savedAt: Date.now(),
                            });
                          }
                        }}
                      >
                        <Ionicons name={isSaved ? 'star' : 'star-outline'} size={20} color={isSaved ? Colors.gold : C.gray600} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                    );
                  })}
                </>
              )}
              {displayedPlans.length > 0 && (
                <>
                  <Text style={[styles.resultsSectionLabel, { color: C.gray700, marginTop: googlePlaces.length > 0 ? 16 : 0 }]}>Plans ({displayedPlans.length})</Text>
                  {displayedPlans.map((plan) => renderCompactPlan({ item: plan }))}
                </>
              )}
              {isSearching && googlePlaces.length === 0 && displayedPlans.length === 0 && <LoadingSkeleton variant="list" />}
              {!isSearching && googlePlaces.length === 0 && displayedPlans.length === 0 && <EmptyState icon="🔍" title={t.explore_no_results} subtitle={t.explore_no_results_sub} />}
            </>
          )
        ) : (
          /* ── Default / category mode ── */
          <>
            {/* Subcategories when "Voir +" is open */}
            {showSubcategories && activeGroup.sections.map((section, idx) => renderSection(section, idx, activeGroup.layout))}

            {/* Trending categories list — fades in/out when Voir + toggles */}
            {showTrending && (
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
            {selectedFilters.length > 0 && (
              <View style={styles.activeFiltersWrap}>
                <View style={styles.activeFiltersRow}>
                  {selectedFilters.map((f) => (
                    <TouchableOpacity key={f} style={[styles.activeFilterChip, { backgroundColor: Colors.primary + '20', borderColor: Colors.primary }]} onPress={() => toggleFilter(f)}>
                      <Text style={[styles.activeFilterText, { color: Colors.primary }]}>{f}</Text>
                      <Ionicons name="close" size={13} color={Colors.primary} />
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity onPress={() => { setSelectedFilters([]); setFilteredPlans([]); }}>
                    <Text style={[styles.clearFiltersText, { color: C.gray600 }]}>Tout effacer</Text>
                  </TouchableOpacity>
                </View>
                {isFilterLoading ? (
                  <LoadingSkeleton variant="list" />
                ) : displayedPlans.length > 0 ? (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.resultsSectionLabel, { color: C.gray700 }]}>Plans ({displayedPlans.length})</Text>
                    {displayedPlans.map((plan) => renderCompactPlan({ item: plan }))}
                  </View>
                ) : (
                  <View style={{ alignItems: 'center', paddingTop: 20 }}>
                    <Text style={[styles.noResultText, { color: C.gray600 }]}>Aucun plan trouvé pour ces filtres</Text>
                  </View>
                )}
              </View>
            )}
          </>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingTop: 10, paddingBottom: 12 },
  pageTitle: { fontSize: 22, fontFamily: Fonts.serifBold, letterSpacing: -0.3 },
  filterBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  filterBtnDot: { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.gold },
  searchBar: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, marginHorizontal: Layout.screenPadding, paddingHorizontal: 14, height: 44, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 14 },

  // Filter rows
  filterSection: { marginBottom: 4, paddingLeft: Layout.screenPadding },
  filterLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  chipsContainer: { paddingRight: Layout.screenPadding, gap: 8, paddingBottom: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: Fonts.serifSemiBold },

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
  catGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  catCard: { width: CARD_WIDTH, marginBottom: CARD_GAP, borderRadius: 16, overflow: 'hidden' },
  catCardGradient: { height: 110, padding: 14, justifyContent: 'flex-end', position: 'relative' },
  catIconWrap: { position: 'absolute', top: 12, right: 14, width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center' },
  catCardContent: {},
  catName: { color: '#FFFFFF', fontSize: 14, fontFamily: Fonts.serifBold, textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  catSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '500', marginTop: 2 },
  catCheckMark: { position: 'absolute', top: 10, left: 10, zIndex: 1 },
  catHotDot: { position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.error },

  // Results
  resultsSectionLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 },
  compactCard: { borderRadius: 18, marginBottom: 12, borderWidth: 1, overflow: 'hidden' },
  compactBanner: { height: 90, justifyContent: 'flex-end', padding: 12, overflow: 'hidden' },
  compactBannerImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', resizeMode: 'cover' },
  compactBannerOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 },
  compactTitle: { color: '#FFFFFF', fontSize: 15, fontFamily: Fonts.serifBold, textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  compactMeta: { flexDirection: 'row', padding: 10, gap: 14 },
  compactMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  compactMetaText: { fontSize: 12 },

  // Mood
  moodList: { gap: 10 },
  moodCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, paddingVertical: 16, paddingHorizontal: 16 },
  moodEmoji: { fontSize: 32, marginRight: 14 },
  moodTextCol: { flex: 1 },
  moodName: { fontSize: 15, fontFamily: Fonts.serifBold },
  moodSub: { fontSize: 12, marginTop: 3 },

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

  // User results
  userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, gap: 12 },
  userAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  userInitials: { fontSize: 14, fontWeight: '600' },
  userName: { fontSize: 14, fontWeight: '600' },
  userHandle: { fontSize: 12, marginTop: 1 },

  // Google Places
  googlePlaceCard: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 10 },
  googlePlacePhoto: { width: 90, height: 90 },
  googlePlaceInfo: { flex: 1, padding: 10, justifyContent: 'center' },
  googlePlaceName: { fontSize: 14, fontFamily: Fonts.serifBold, marginBottom: 2 },
  googlePlaceType: { fontSize: 12, marginBottom: 3 },
  googlePlaceRating: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 },
  googlePlaceRatingText: { fontSize: 12, fontFamily: Fonts.serifSemiBold },
  googlePlaceReviewCount: { fontSize: 11 },
  googlePlaceAddress: { fontSize: 11 },
  saveStarBtn: { position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },

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
});
