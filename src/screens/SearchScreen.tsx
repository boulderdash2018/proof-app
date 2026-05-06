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

  /** Trending category tap — pop back to Explore and apply the filter
   *  via route params. Explore reads `applyFilter` on focus and calls its
   *  own toggleFilter (which fires the search + flips into results view). */
  const handleSelectCategory = (name: string) => {
    navigation.navigate('Explore', { applyFilter: name } as any);
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

  /**
   * Plan renderer — IDENTIQUE à SavesScreen (image plein largeur ~240px,
   * titre overlay en Fraunces blanc, stats row sous l'image avec icônes
   * ambrées). Pas de status pill ici — les résultats de recherche n'ont
   * pas d'état sauvegardé.
   */
  const renderPlan = (plan: Plan) => {
    const colors = parseGradientColors(plan.gradient);
    const photo = getPlanPhoto(plan);
    const authorName = plan.author?.displayName || plan.author?.username || '';
    return (
      <TouchableOpacity
        key={plan.id}
        style={s.item}
        activeOpacity={0.92}
        onPress={() => handlePlanPress(plan)}
      >
        {/* ── Hero image (full bleed, ~240px) ── */}
        <View style={s.hero}>
          {photo ? (
            <Image source={{ uri: photo }} style={s.heroImage} />
          ) : (
            <LinearGradient
              colors={colors as [string, string, ...string[]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}

          {/* Bottom darkening — title legibility on any photo */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.7)']}
            locations={[0, 0.55, 1]}
            style={s.heroFade}
          />

          {/* Title — bottom-left in Fraunces white */}
          <View style={s.heroTitleWrap}>
            <Text style={s.heroTitle} numberOfLines={2}>
              {plan.title}
            </Text>
          </View>
        </View>

        {/* ── Stats row sous l'image ── */}
        <View style={s.stats}>
          <View style={s.stat}>
            <Ionicons name="trophy" size={13} color={Colors.gold} />
            <Text style={s.statText}>{plan.price}</Text>
          </View>
          <View style={s.statSep} />
          <View style={s.stat}>
            <Ionicons name="hourglass-outline" size={13} color={Colors.gold} />
            <Text style={s.statText}>{plan.duration}</Text>
          </View>
          <View style={s.statSep} />
          <View style={s.stat}>
            <Ionicons name="heart" size={13} color={Colors.primary} />
            <Text style={s.statText}>{plan.likesCount}</Text>
          </View>
          <View style={{ flex: 1 }} />
          {authorName ? (
            <Text style={s.author} numberOfLines={1}>par {authorName}</Text>
          ) : null}
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
                ...(place.latitude && place.longitude ? { latitude: place.latitude, longitude: place.longitude } : {}),
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

            {/* Trending categories — éditorial : dot bullet terracotta
                + nom Fraunces + count + arrow. Cohérent avec le rendu
                de la liste "tendance" sur l'Explorer principal. */}
            <View style={s.section}>
              <View style={s.sectionHeaderRow}>
                <Text style={[s.sectionLabel, { color: Colors.textTertiary }]}>
                  {trendingCategories.length} CATÉGORIES EN TENDANCE
                </Text>
                {!trendingLoading && trendingCategories.length > 0 && (
                  <Text style={[s.sectionMeta, { color: Colors.textTertiary }]}>
                    Mise à jour aujourd{'\u2019'}hui
                  </Text>
                )}
              </View>
              {trendingLoading ? (
                <LoadingSkeleton variant="list" />
              ) : (
                <View>
                  {trendingCategories.map((cat, i) => {
                    const isHot = cat.hot || i < 3;
                    const planText = `${cat.planCount} plan${cat.planCount > 1 ? 's' : ''}`;
                    return (
                      <TouchableOpacity
                        key={cat.name}
                        style={s.trendingRow}
                        activeOpacity={0.7}
                        onPress={() => handleSelectCategory(cat.name)}
                      >
                        {/* Col 1 — dot bullet (terracotta si hot, taupe sinon) */}
                        <View style={[
                          s.trendingDot,
                          { backgroundColor: isHot ? Colors.primary : Colors.borderMedium },
                        ]} />

                        {/* Col 2 — nom + (méta optionnelle) */}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.trendingName} numberOfLines={1}>
                            {cat.name}
                          </Text>
                        </View>

                        {/* Col 3 — count + chevron */}
                        <View style={s.trendingCountRow}>
                          <Text style={s.trendingCount}>{planText}</Text>
                          <Ionicons name="arrow-forward" size={13} color={Colors.textTertiary} />
                        </View>
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
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: Fonts.bodySemiBold },
  sectionCount: { fontSize: 12, fontFamily: Fonts.body },
  // "Mise à jour aujourd'hui" italique — éditorial discret
  sectionMeta: { fontSize: 11.5, fontFamily: Fonts.bodyMedium, fontStyle: 'italic' },
  clearText: { fontSize: 12, fontFamily: Fonts.body },

  // Recent searches
  recentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1 } as any,
  recentText: { fontSize: 14, fontFamily: Fonts.body, flex: 1 },
  recentRemoveBtn: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' } as any,

  // ── Trending — éditorial : dot bullet + nom Fraunces + count + arrow ──
  // Cohérent avec la liste tendance de l'Explorer principal. Hairline
  // borderTop sur chaque row pour le rythme magazine.
  trendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
  } as any,
  trendingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginLeft: 4,
    marginRight: 4,
  },
  trendingName: {
    fontFamily: Fonts.displayMedium,
    fontSize: 16,
    letterSpacing: -0.25,
    color: Colors.textPrimary,
  },
  trendingCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trendingCount: {
    fontSize: 12.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    letterSpacing: 0.05,
  },

  // Place results (compact rows) — pin in cream square + name/type + star
  placeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, gap: 12 } as any,
  placeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  placeName: { fontSize: 14, fontFamily: Fonts.bodySemiBold },
  placeType: { fontSize: 12, marginTop: 1, fontFamily: Fonts.body },

  // ── Plan results — IDENTIQUE à SavesScreen.styles ──
  // (image plein largeur 240px + titre overlay Fraunces blanc + stats row)
  item: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: Colors.bgSecondary,
    marginBottom: 18,
    shadowColor: 'rgba(44,36,32,1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
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
