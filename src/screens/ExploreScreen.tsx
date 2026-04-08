import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TextInput as RNTextInput,
  Dimensions,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout, Fonts, EXPLORE_GROUPS, PERSON_FILTERS } from '../constants';
import { ExploreCategoryItem, ExploreSection, ExploreLayout } from '../constants/exploreCategories';
import { EmptyState } from '../components';
import { Plan } from '../types';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { searchUsers } from '../services/friendsService';
import { useAuthStore } from '../store';
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

export const ExploreScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const C = useColors();
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.user);

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

  const activeGroup = EXPLORE_GROUPS.find((g) => g.key === selectedTheme) || EXPLORE_GROUPS[0];

  const toggleFilter = useCallback((label: string) => {
    setSelectedFilters((prev) => {
      const next = prev.includes(label) ? prev.filter((f) => f !== label) : [...prev, label];
      // Debounced fetch
      if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
      if (next.length > 0) {
        setIsFilterLoading(true);
        filterTimerRef.current = setTimeout(async () => {
          const plans = await fetchPublicPlansByTags(next);
          setFilteredPlans(plans);
          setIsFilterLoading(false);
        }, 300);
      } else {
        setFilteredPlans([]);
        setIsFilterLoading(false);
      }
      return next;
    });
  }, []);

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
      const plans = await searchPublicPlans(query);
      setFilteredPlans(plans);
      setSearchUsers_([]);
      searchTimerRef.current = setTimeout(async () => {
        const places = await searchPlacesNearby(query + ' Paris', { lat: 48.8566, lng: 2.3522 });
        setGooglePlaces(places);
        setIsSearching(false);
      }, 400);
    }
  }, [currentUser]);

  const handleClear = () => {
    setSearchQuery('');
    setFilteredPlans([]);
    setSearchUsers_([]);
    setGooglePlaces([]);
  };

  const showCategories = searchQuery.length < 2;

  // ── Row 1: Person filters (multi-select) ──
  const renderPersonRow = () => (
    <View style={styles.filterSection}>
      <Text style={[styles.filterLabel, { color: C.gray500 }]}>Par personne</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContainer}>
        {PERSON_FILTERS.map((p) => {
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
        {EXPLORE_GROUPS.map((group) => {
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
          <Ionicons name={showSubcategories ? 'chevron-up' : 'add'} size={14} color={showSubcategories ? '#FFF' : C.gray800} />
          <Text style={[styles.chipText, { color: showSubcategories ? '#FFF' : C.gray800 }]}>Voir +</Text>
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
        ) : item.hot ? (
          <View style={[styles.hotBadge, { backgroundColor: C.primary + '18' }]}>
            <Text style={[styles.hotBadgeText, { color: C.primary }]}>chaud</Text>
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
          <View style={styles.compactMetaItem}><Ionicons name="time-outline" size={13} color={C.gold} /><Text style={[styles.compactMetaText, { color: C.gray800 }]}>{item.duration}</Text></View>
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
      <Text style={[styles.pageTitle, { color: C.black }]}>{t.explore_title}</Text>

      {/* Search bar */}
      <View style={[styles.searchBar, { backgroundColor: C.gray200, borderColor: C.border }]}>
        <Ionicons name="search-outline" size={16} color={C.gray600} style={{ marginRight: 8 }} />
        <RNTextInput style={[styles.searchInput, { color: C.black }]} placeholder={t.explore_search_placeholder} placeholderTextColor={C.gray600} value={searchQuery} onChangeText={handleSearch} />
        {searchQuery.length > 0 && <TouchableOpacity onPress={handleClear}><Ionicons name="close-circle" size={18} color={C.gray600} /></TouchableOpacity>}
      </View>

      {showCategories ? (
        <>
          {renderPersonRow()}
          {renderThemeRow()}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {showSubcategories ? (
              activeGroup.sections.map((section, idx) => renderSection(section, idx, activeGroup.layout))
            ) : null}

            {/* Selected filters pills */}
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

                {/* Filter results */}
                {isFilterLoading ? (
                  <ActivityIndicator color={C.primary} style={{ marginTop: 16 }} />
                ) : filteredPlans.length > 0 ? (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.resultsSectionLabel, { color: C.gray700 }]}>Plans ({filteredPlans.length})</Text>
                    {filteredPlans.map((plan) => renderCompactPlan({ item: plan }))}
                  </View>
                ) : (
                  <View style={{ alignItems: 'center', paddingTop: 20 }}>
                    <Text style={[styles.noResultText, { color: C.gray600 }]}>Aucun plan trouvé pour ces filtres</Text>
                  </View>
                )}
              </View>
            )}
            <View style={{ height: 30 }} />
          </ScrollView>
        </>
      ) : (
        <>
          <View style={styles.resultsHeader}>
            <TouchableOpacity onPress={handleClear} style={styles.backLinkRow}>
              <Ionicons name="arrow-back" size={16} color={C.primary} />
              <Text style={[styles.backLink, { color: C.primary }]}>{t.explore_back_categories}</Text>
            </TouchableOpacity>
          </View>

          {searchUsers_.length > 0 ? (
            <ScrollView contentContainerStyle={styles.resultsList}>
              <Text style={[styles.resultsSectionLabel, { color: C.gray700 }]}>{t.explore_users_count} ({searchUsers_.length})</Text>
              {searchUsers_.map(renderUserResult)}
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.resultsList} showsVerticalScrollIndicator={false}>
              {googlePlaces.length > 0 && (
                <>
                  <Text style={[styles.resultsSectionLabel, { color: C.gray700 }]}>Lieux ({googlePlaces.length})</Text>
                  {googlePlaces.map((place) => (
                    <TouchableOpacity key={place.placeId} style={[styles.googlePlaceCard, { backgroundColor: C.gray200, borderColor: C.border }]} activeOpacity={0.7} onPress={() => navigation.navigate('PlaceDetail', { googlePlaceId: place.placeId })}>
                      {place.photoUrls.length > 0 ? <Image source={{ uri: place.photoUrls[0] }} style={styles.googlePlacePhoto} /> : <View style={[styles.googlePlacePhoto, { backgroundColor: C.gray300, alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="location" size={24} color={C.gray600} /></View>}
                      <View style={styles.googlePlaceInfo}>
                        <Text style={[styles.googlePlaceName, { color: C.black }]} numberOfLines={1}>{place.name}</Text>
                        <Text style={[styles.googlePlaceType, { color: C.gray700 }]} numberOfLines={1}>{getReadableType(place.types)} {place.priceLevel !== undefined ? '· ' + priceLevelToSymbol(place.priceLevel) : ''}</Text>
                        {place.rating > 0 && <View style={styles.googlePlaceRating}><Ionicons name="star" size={12} color={C.primary} /><Text style={[styles.googlePlaceRatingText, { color: C.black }]}>{place.rating.toFixed(1)}</Text><Text style={[styles.googlePlaceReviewCount, { color: C.gray600 }]}>({place.reviewCount})</Text></View>}
                        <Text style={[styles.googlePlaceAddress, { color: C.gray600 }]} numberOfLines={1}>{place.address}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {filteredPlans.length > 0 && (
                <>
                  <Text style={[styles.resultsSectionLabel, { color: C.gray700, marginTop: googlePlaces.length > 0 ? 16 : 0 }]}>Plans ({filteredPlans.length})</Text>
                  {filteredPlans.map((plan) => renderCompactPlan({ item: plan }))}
                </>
              )}
              {isSearching && googlePlaces.length === 0 && filteredPlans.length === 0 && <ActivityIndicator color={C.primary} style={{ marginTop: 30 }} />}
              {!isSearching && googlePlaces.length === 0 && filteredPlans.length === 0 && <EmptyState icon="🔍" title={t.explore_no_results} subtitle={t.explore_no_results_sub} />}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageTitle: { fontSize: 22, fontFamily: Fonts.serifBold, letterSpacing: -0.3, paddingHorizontal: Layout.screenPadding, paddingTop: 10, paddingBottom: 12 },
  searchBar: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, marginHorizontal: Layout.screenPadding, paddingHorizontal: 14, height: 44, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 14 },

  // Filter rows
  filterSection: { marginBottom: 4, paddingLeft: Layout.screenPadding },
  filterLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  chipsContainer: { paddingRight: Layout.screenPadding, gap: 8, paddingBottom: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: Fonts.serifSemiBold },

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
  resultsHeader: { paddingHorizontal: Layout.screenPadding, marginBottom: 12 },
  backLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backLink: { fontSize: 13, fontWeight: '600' },
  resultsSectionLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 },
  resultsList: { paddingHorizontal: Layout.screenPadding, paddingBottom: 20 },
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

  // Active filters
  activeFiltersWrap: { marginTop: 14 },
  activeFiltersRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  activeFilterChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, gap: 4 },
  activeFilterText: { fontSize: 11, fontFamily: Fonts.serifSemiBold },
  clearFiltersText: { fontSize: 11, fontFamily: Fonts.serifSemiBold, marginLeft: 4 },
  noResultText: { fontSize: 13, fontFamily: Fonts.serif },
});
