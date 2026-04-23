import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput as RNTextInput,
  Image,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout, Fonts } from '../constants';
import { EmptyState, LoadingSkeleton } from '../components';
import { Plan } from '../types';
import { useColors } from '../hooks/useColors';
import { useCity } from '../hooks/useCity';
import { useTranslation } from '../hooks/useTranslation';
import { useAuthStore, useTrendingStore, useSavedPlacesStore, useRecentSearchesStore } from '../store';
import { searchPublicPlans } from '../services/plansService';
import {
  searchPlacesNearby,
  getReadableType,
  priceLevelToSymbol,
  GooglePlaceDetails,
} from '../services/googlePlacesService';

const parseGradientColors = (gradient: string): string[] => {
  const matches = gradient.match(/#[0-9A-Fa-f]{6}/g);
  return matches && matches.length >= 2 ? matches : ['#8B6A50', '#5C4030'];
};

export const SearchScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const searchMode: 'tous' | 'plans' | 'lieux' = route.params?.contentMode ?? 'tous';
  const C = useColors();
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.user);
  const trendingCategories = useTrendingStore((s) => s.categories);
  const trendingLoading = useTrendingStore((s) => s.isLoading);
  const cityConfig = useCity();
  const savedPlacesStore = useSavedPlacesStore();
  const { searches: recentSearches, addSearch, removeSearch, clearSearches } = useRecentSearchesStore();

  const [query, setQuery] = useState('');
  const [googlePlaces, setGooglePlaces] = useState<GooglePlaceDetails[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<any>(null);

  // Animations
  const defaultOpacity = useRef(new Animated.Value(1)).current;
  const resultsOpacity = useRef(new Animated.Value(0)).current;

  const isActive = query.length >= 2;

  useEffect(() => {
    if (isActive) {
      Animated.parallel([
        Animated.timing(defaultOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(resultsOpacity, { toValue: 1, duration: 150, delay: 80, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(resultsOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(defaultOpacity, { toValue: 1, duration: 150, delay: 80, useNativeDriver: true }),
      ]).start();
    }
  }, [isActive]);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (text.length < 2) {
      setPlans([]);
      setGooglePlaces([]);
      return;
    }
    setIsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      const [planResults, placeResults] = await Promise.all([
        searchPublicPlans(text, cityConfig.name),
        searchPlacesNearby(text + ' ' + cityConfig.name, cityConfig.coordinates),
      ]);
      setPlans(planResults);
      setGooglePlaces(placeResults);
      setIsSearching(false);
    }, 400);
  }, [cityConfig.name]);

  const handleSelectRecent = (term: string) => {
    setQuery(term);
    handleSearch(term);
  };

  const handlePlacePress = (place: GooglePlaceDetails) => {
    addSearch(query);
    navigation.navigate('PlaceDetail', { googlePlaceId: place.placeId });
  };

  const handlePlanPress = (plan: Plan) => {
    addSearch(query);
    navigation.navigate('PlanDetail', { planId: plan.id });
  };

  const handleCancel = () => {
    navigation.goBack();
  };

  // ── Plan renderer ──
  const getPlanPhoto = (plan: Plan): string | null => {
    if (plan.coverPhotos && plan.coverPhotos.length > 0) return plan.coverPhotos[0];
    for (const place of plan.places) {
      if (place.photoUrls && place.photoUrls.length > 0) return place.photoUrls[0];
    }
    return null;
  };

  const renderPlan = (plan: Plan) => {
    const colors = parseGradientColors(plan.gradient);
    const photo = getPlanPhoto(plan);
    const authorName = plan.author?.displayName || plan.author?.username || '';
    return (
      <TouchableOpacity
        key={plan.id}
        style={s.planCard}
        activeOpacity={0.85}
        onPress={() => handlePlanPress(plan)}
      >
        <View style={s.planBanner}>
          {photo ? (
            <Image source={{ uri: photo }} style={s.planBannerImage} />
          ) : (
            <LinearGradient
              colors={colors as [string, string, ...string[]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(44,36,32,0.6)']}
            locations={[0.45, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={s.planBannerBody}>
            <Text style={s.planTitle} numberOfLines={2}>{plan.title}</Text>
            {authorName ? (
              <Text style={s.planAuthor} numberOfLines={1}>par {authorName.toLowerCase()}</Text>
            ) : null}
          </View>
        </View>
        <View style={s.planMeta}>
          <Text style={[s.planMetaText, { color: C.gray800 }]}>~{plan.price}</Text>
          <Text style={[s.planMetaDot, { color: C.gray500 }]}>·</Text>
          <Text style={[s.planMetaText, { color: C.gray800 }]}>{plan.duration}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ── Place renderer (compact) ──
  const renderPlace = (place: GooglePlaceDetails) => {
    const isSaved = savedPlacesStore.isPlaceSaved(place.placeId);
    return (
      <TouchableOpacity
        key={place.placeId}
        style={[s.placeRow, { borderBottomColor: C.borderLight }]}
        activeOpacity={0.7}
        onPress={() => handlePlacePress(place)}
      >
        <View style={[s.placeIcon, { backgroundColor: C.gray200 }]}>
          <Ionicons name="location-outline" size={18} color={C.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.placeName, { color: C.black }]} numberOfLines={1}>{place.name}</Text>
          <Text style={[s.placeType, { color: C.gray600 }]} numberOfLines={1}>{getReadableType(place.types)}{place.address ? ' · ' + place.address.split(',')[0] : ''}</Text>
        </View>
        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => {
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
          <Ionicons name={isSaved ? 'star' : 'star-outline'} size={18} color={isSaved ? Colors.gold : C.gray500} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const sortedPlaces = [...googlePlaces].sort((a, b) => b.reviewCount - a.reviewCount).slice(0, 3);

  return (
    <View style={[s.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      {/* ── Header: search bar + cancel ── */}
      <View style={s.header}>
        <View
          style={[
            s.searchBar,
            {
              backgroundColor: isFocused ? Colors.terracotta50 : C.gray200,
              borderColor: isFocused ? Colors.primary : 'transparent',
              borderWidth: isFocused ? 1.5 : 1,
            },
          ]}
        >
          <Ionicons name="search-outline" size={16} color={isFocused ? Colors.primary : C.gray600} style={{ marginRight: 8 }} />
          <RNTextInput
            ref={inputRef}
            style={[s.searchInput, { color: C.black }, s.noWebOutline]}
            placeholder={t.explore_search_placeholder}
            placeholderTextColor={C.gray600}
            value={query}
            onChangeText={handleSearch}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={() => { if (query.trim().length >= 2) addSearch(query); }}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setPlans([]); setGooglePlaces([]); }}>
              <Ionicons name="close-circle" size={18} color={C.gray600} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={handleCancel} style={s.cancelBtn}>
          <Text style={[s.cancelText, { color: C.primary }]}>{t.cancel}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Default state: recent searches + trending ── */}
      {!isActive && (
        <Animated.View style={[s.defaultWrap, { opacity: defaultOpacity }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
            {/* Recent searches */}
            {recentSearches.length > 0 && (
              <View style={s.section}>
                <View style={s.sectionHeaderRow}>
                  <Text style={[s.sectionLabel, { color: C.gray600 }]}>RECHERCHES RÉCENTES</Text>
                  <TouchableOpacity onPress={clearSearches} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[s.clearText, { color: C.gray500 }]}>Effacer</Text>
                  </TouchableOpacity>
                </View>
                {recentSearches.map((term) => (
                  <TouchableOpacity
                    key={term}
                    style={[s.recentRow, { borderBottomColor: C.borderLight }]}
                    onPress={() => handleSelectRecent(term)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="time-outline" size={16} color={C.gray500} style={{ marginRight: 12 }} />
                    <Text style={[s.recentText, { color: C.black }]} numberOfLines={1}>{term}</Text>
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation?.(); removeSearch(term); }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={s.recentRemoveBtn}
                    >
                      <Ionicons name="close" size={14} color={C.gray500} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Trending categories */}
            <View style={s.section}>
              <View style={s.sectionHeaderRow}>
                <Text style={[s.sectionLabel, { color: C.gray600 }]}>CATÉGORIES EN TENDANCE</Text>
                {!trendingLoading && trendingCategories.length > 0 && (
                  <Text style={[s.sectionCount, { color: C.gray500 }]}>{trendingCategories.length}</Text>
                )}
              </View>
              {trendingLoading ? (
                <LoadingSkeleton variant="list" />
              ) : (
                <View>
                  {trendingCategories.map((cat, i) => {
                    const isLast = i === trendingCategories.length - 1;
                    const isHot = cat.hot || i < 3;
                    return (
                      <TouchableOpacity
                        key={cat.name}
                        style={[s.trendingRow, !isLast && { borderBottomWidth: 1, borderBottomColor: C.borderLight }]}
                        activeOpacity={0.7}
                        onPress={() => {
                          navigation.goBack();
                          // Small delay to let the screen close, then the ExploreScreen can handle the filter
                        }}
                      >
                        {/* Mini gradient tile — same palette as the Explore grid */}
                        <View style={s.trendingTile}>
                          <LinearGradient
                            colors={cat.gradient as [string, string]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={s.trendingNameRow}>
                            <Text style={[s.trendingName, { color: C.black }]} numberOfLines={1}>
                              {cat.name}
                            </Text>
                            {isHot && (
                              <Text style={[s.trendingHotPlus, { color: Colors.gold }]}>+</Text>
                            )}
                          </View>
                          <Text style={[s.trendingCount, { color: C.gray600 }]}>
                            {cat.planCount} plan{cat.planCount > 1 ? 's' : ''}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={C.gray500} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
            <View style={{ height: 40 }} />
          </ScrollView>
        </Animated.View>
      )}

      {/* ── Active state: search results ── */}
      {isActive && (
        <Animated.View style={[s.resultsWrap, { opacity: resultsOpacity }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
            {/* Google Places */}
            {searchMode !== 'plans' && sortedPlaces.length > 0 && (
              <View style={s.section}>
                <Text style={[s.sectionLabel, { color: C.gray600 }]}>LIEUX</Text>
                {sortedPlaces.map(renderPlace)}
              </View>
            )}

            {/* Plans */}
            {searchMode !== 'lieux' && plans.length > 0 && (
              <View style={[s.section, searchMode !== 'plans' && sortedPlaces.length > 0 && { marginTop: 8 }]}>
                <Text style={[s.sectionLabel, { color: C.gray600 }]}>PLANS ({plans.length})</Text>
                {plans.map(renderPlan)}
              </View>
            )}

            {/* Loading */}
            {isSearching && sortedPlaces.length === 0 && plans.length === 0 && (
              <LoadingSkeleton variant="list" />
            )}

            {/* Empty */}
            {!isSearching && sortedPlaces.length === 0 && plans.length === 0 && (
              <EmptyState icon="🔍" title={t.explore_no_results} subtitle={t.explore_no_results_sub} />
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
};

// ========== STYLES ==========
const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Layout.screenPadding, paddingTop: 8, paddingBottom: 10, gap: 12 },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, height: 44 },
  searchInput: { flex: 1, fontSize: 14 },
  // Web only — removes the default browser focus outline on <input>. No-op on native.
  noWebOutline: { outlineStyle: 'none', outlineWidth: 0 } as any,
  cancelBtn: { paddingVertical: 6 },
  cancelText: { fontSize: 14, fontFamily: Fonts.bodySemiBold },

  scrollContent: { paddingHorizontal: Layout.screenPadding },
  defaultWrap: { flex: 1 },
  resultsWrap: { flex: 1 },

  // Sections
  section: { marginTop: 18 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, fontFamily: Fonts.bodySemiBold },
  sectionCount: { fontSize: 12, fontFamily: Fonts.body },
  clearText: { fontSize: 12, fontFamily: Fonts.body },

  // Recent searches
  recentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1 } as any,
  recentText: { fontSize: 14, fontFamily: Fonts.body, flex: 1 },
  recentRemoveBtn: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' } as any,

  // Trending — mini-tile gradient + name + optional gold "+" + chevron
  trendingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 } as any,
  trendingTile: {
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: 'hidden',
  },
  trendingNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 } as any,
  trendingName: { fontSize: 15, fontFamily: Fonts.displaySemiBold },
  trendingHotPlus: { fontSize: 16, fontFamily: Fonts.displayBold, marginTop: -2 },
  trendingCount: { fontSize: 12, marginTop: 2, fontFamily: Fonts.body },

  // Place results (compact rows) — pin in cream square + name/type + star
  placeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, gap: 12 } as any,
  placeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  placeName: { fontSize: 14, fontFamily: Fonts.bodySemiBold },
  placeType: { fontSize: 12, marginTop: 1, fontFamily: Fonts.body },

  // Plan results — full editorial card with author byline, meta below card
  planCard: { marginBottom: 14 },
  planBanner: { height: 130, borderRadius: 16, overflow: 'hidden', justifyContent: 'flex-end' },
  planBannerImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', resizeMode: 'cover' } as any,
  planBannerBody: { padding: 14 },
  planTitle: {
    color: Colors.textOnAccent,
    fontSize: 18,
    fontFamily: Fonts.displaySemiBold,
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  planAuthor: {
    color: 'rgba(255, 248, 240, 0.8)',
    fontSize: 12,
    fontFamily: Fonts.body,
    marginTop: 3,
  },
  planMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    paddingHorizontal: 4,
  } as any,
  planMetaText: { fontSize: 13, fontFamily: Fonts.body },
  planMetaDot: { fontSize: 13 },
});
