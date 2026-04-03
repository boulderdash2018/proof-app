import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput as RNTextInput,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Layout, CATEGORIES } from '../constants';
import { EmptyState } from '../components';
import { Plan, CategoryTag } from '../types';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import mockApi from '../services/mockApi';

const { width } = Dimensions.get('window');
const CARD_GAP = 8;
const CARD_WIDTH = (width - Layout.screenPadding * 2 - CARD_GAP) / 2;

const parseGradientColors = (gradient: string): string[] => {
  const matches = gradient.match(/#[0-9A-Fa-f]{6}/g);
  return matches && matches.length >= 2 ? matches : ['#FF6B35', '#C94520'];
};

export const ExploreScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const C = useColors();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryTag | null>(null);
  const [filteredPlans, setFilteredPlans] = useState<Plan[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleCategoryPress = useCallback(async (cat: CategoryTag) => {
    setSelectedCategory(cat);
    setIsSearching(true);
    const plans = await mockApi.getPlansByCategory(cat);
    setFilteredPlans(plans);
    setIsSearching(false);
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setFilteredPlans([]);
      return;
    }
    setSelectedCategory(null);
    setIsSearching(true);
    const plans = await mockApi.searchPlans(query);
    setFilteredPlans(plans);
    setIsSearching(false);
  }, []);

  const handleClear = () => {
    setSearchQuery('');
    setSelectedCategory(null);
    setFilteredPlans([]);
  };

  const renderCategoryCard = ({ item, index }: { item: typeof CATEGORIES[0]; index: number }) => (
    <TouchableOpacity
      style={[
        styles.catCard,
        { backgroundColor: item.bg, marginRight: index % 2 === 0 ? CARD_GAP : 0 },
      ]}
      activeOpacity={0.85}
      onPress={() => handleCategoryPress(item.name)}
    >
      <Text style={styles.catEmoji}>{item.emoji}</Text>
      <Text style={styles.catName}>{item.name}</Text>
    </TouchableOpacity>
  );

  const renderCompactPlan = ({ item }: { item: Plan }) => {
    const colors = parseGradientColors(item.gradient);
    return (
      <TouchableOpacity
        style={styles.compactCard}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('PlanDetail', { planId: item.id })}
      >
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.compactBanner}
        >
          <Text style={styles.compactTitle} numberOfLines={2}>
            {item.title}
          </Text>
        </LinearGradient>
        <View style={styles.compactMeta}>
          <Text style={styles.compactMetaText}>💰 {item.price}</Text>
          <Text style={styles.compactMetaText}>⏱ {item.duration}</Text>
          <Text style={styles.compactMetaText}>❤️ {item.likesCount}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const showCategories = !selectedCategory && searchQuery.length < 2;

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      <Text style={[styles.pageTitle, { color: C.black }]}>{t.explore_title}</Text>

      {/* Search bar */}
      <View style={[styles.searchBar, { backgroundColor: C.gray200 }]}>
        <Text style={styles.searchIcon}>🔍</Text>
        <RNTextInput
          style={styles.searchInput}
          placeholder={t.explore_search_placeholder}
          placeholderTextColor={C.gray600}
          value={searchQuery}
          onChangeText={handleSearch}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={handleClear}>
            <Text style={styles.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {showCategories ? (
        <>
          <Text style={styles.sectionLabel}>{t.explore_categories}</Text>
          <FlatList
            key="categories-grid"
            data={CATEGORIES}
            renderItem={renderCategoryCard}
            keyExtractor={(item) => item.name}
            numColumns={2}
            contentContainerStyle={styles.catGrid}
            showsVerticalScrollIndicator={false}
          />
        </>
      ) : (
        <>
          {/* Results header */}
          <View style={styles.resultsHeader}>
            {selectedCategory ? (
              <View style={styles.resultsHeaderRow}>
                <Text style={styles.resultsTitle}>
                  {selectedCategory}{' '}
                  <Text style={styles.resultsCount}>({filteredPlans.length})</Text>
                </Text>
                <TouchableOpacity onPress={handleClear}>
                  <Text style={styles.backLink}>{t.explore_back_categories}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.resultsTitle}>
                {t.explore_results_for} "{searchQuery}"
              </Text>
            )}
          </View>

          <FlatList
            key="plan-results"
            data={filteredPlans}
            renderItem={renderCompactPlan}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.resultsList}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              !isSearching ? (
                <EmptyState
                  icon="🔍"
                  title={t.explore_no_results}
                  subtitle={t.explore_no_results_sub}
                />
              ) : null
            }
          />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  pageTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: Colors.black,
    letterSpacing: -0.5,
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 10,
    paddingBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray200,
    borderRadius: 14,
    marginHorizontal: Layout.screenPadding,
    paddingHorizontal: 14,
    height: 44,
    marginBottom: 16,
  },
  searchIcon: {
    fontSize: 15,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.black,
  },
  clearBtn: {
    fontSize: 16,
    color: Colors.gray700,
    paddingLeft: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: Colors.gray700,
    paddingHorizontal: Layout.screenPadding,
    marginBottom: 10,
  },
  catGrid: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: 20,
  },
  catCard: {
    width: CARD_WIDTH,
    height: 78,
    borderRadius: 18,
    padding: 12,
    marginBottom: CARD_GAP,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  catEmoji: {
    position: 'absolute',
    top: 10,
    right: 10,
    fontSize: 28,
  },
  catName: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  resultsHeader: {
    paddingHorizontal: Layout.screenPadding,
    marginBottom: 12,
  },
  resultsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.black,
  },
  resultsCount: {
    color: Colors.gray700,
    fontWeight: '400',
  },
  backLink: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },
  resultsList: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: 20,
  },
  compactCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  compactBanner: {
    height: 90,
    justifyContent: 'flex-end',
    padding: 12,
  },
  compactTitle: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  compactMeta: {
    flexDirection: 'row',
    padding: 10,
    gap: 14,
  },
  compactMetaText: {
    fontSize: 12,
    color: Colors.gray800,
  },
});
