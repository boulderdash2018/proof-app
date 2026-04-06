import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TextInput as RNTextInput,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Layout, EXPLORE_GROUPS } from '../constants';
import { ExploreCategoryItem, ExploreSection, ExploreLayout } from '../constants/exploreCategories';
import { EmptyState } from '../components';
import { Plan } from '../types';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { searchUsers } from '../services/friendsService';
import { useAuthStore } from '../store';
import mockApi from '../services/mockApi';

const { width } = Dimensions.get('window');
const CARD_GAP = 10;
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
  const currentUser = useAuthStore((s) => s.user);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(EXPLORE_GROUPS[0].key);
  const [filteredPlans, setFilteredPlans] = useState<Plan[]>([]);
  const [searchUsers_, setSearchUsers_] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const activeGroup = EXPLORE_GROUPS.find((g) => g.key === selectedGroup) || EXPLORE_GROUPS[0];

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setFilteredPlans([]);
      setSearchUsers_([]);
      return;
    }
    setIsSearching(true);
    if (query.startsWith('@')) {
      const users = await searchUsers(query.slice(1), currentUser?.id || '');
      setSearchUsers_(users);
      setFilteredPlans([]);
    } else {
      const plans = await mockApi.searchPlans(query);
      setFilteredPlans(plans);
      setSearchUsers_([]);
    }
    setIsSearching(false);
  }, [currentUser]);

  const handleClear = () => {
    setSearchQuery('');
    setFilteredPlans([]);
    setSearchUsers_([]);
  };

  const handleCategoryPress = useCallback(async (categoryName: string) => {
    setSearchQuery(categoryName);
    setIsSearching(true);
    const plans = await mockApi.searchPlans(categoryName);
    setFilteredPlans(plans);
    setSearchUsers_([]);
    setIsSearching(false);
  }, []);

  const showCategories = searchQuery.length < 2;

  const renderFilterChips = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsContainer}
      style={styles.chipsScroll}
    >
      {EXPLORE_GROUPS.map((group) => {
        const isActive = group.key === selectedGroup;
        return (
          <TouchableOpacity
            key={group.key}
            style={[
              styles.chip,
              isActive ? { backgroundColor: Colors.primary, borderColor: Colors.primary } : { backgroundColor: C.gray200, borderColor: C.border },
            ]}
            onPress={() => setSelectedGroup(group.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, { color: isActive ? '#FFFFFF' : C.black }]}>
              {group.emoji} {group.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  const renderCategoryCard = (item: ExploreCategoryItem, index: number, rowLength: number) => (
    <TouchableOpacity
      key={item.name}
      style={[styles.catCard, { marginRight: index % 2 === 0 && rowLength > 1 ? CARD_GAP : 0 }]}
      activeOpacity={0.85}
      onPress={() => handleCategoryPress(item.name)}
    >
      <LinearGradient
        colors={item.gradient as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.catCardGradient}
      >
        <Text style={styles.catEmoji}>{item.emoji}</Text>
        <View style={styles.catCardContent}>
          <Text style={styles.catName} numberOfLines={2}>{item.name}</Text>
          {item.subtitle ? <Text style={styles.catSubtitle}>{item.subtitle}</Text> : null}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );

  const renderMoodItem = (item: ExploreCategoryItem) => (
    <TouchableOpacity
      key={item.name}
      style={[styles.moodCard, { backgroundColor: C.gray100 }]}
      activeOpacity={0.7}
      onPress={() => handleCategoryPress(item.name)}
    >
      <Text style={styles.moodEmoji}>{item.emoji}</Text>
      <View style={styles.moodTextCol}>
        <Text style={[styles.moodName, { color: C.black }]}>{item.name}</Text>
        {item.subtitle ? <Text style={[styles.moodSub, { color: C.gray600 }]}>{item.subtitle}</Text> : null}
      </View>
      <Text style={[styles.moodChevron, { color: C.gray400 }]}>›</Text>
    </TouchableOpacity>
  );

  const renderRankedItem = (item: ExploreCategoryItem, rank: number) => (
    <TouchableOpacity
      key={item.name}
      style={[styles.rankedRow, { borderBottomColor: C.border }]}
      activeOpacity={0.7}
      onPress={() => handleCategoryPress(item.name)}
    >
      <Text style={[styles.rankNumber, { color: C.primary }]}>{rank}</Text>
      <View style={[styles.rankEmojiCircle, { backgroundColor: C.gray100 }]}>
        <Text style={styles.rankEmoji}>{item.emoji}</Text>
      </View>
      <View style={styles.rankTextCol}>
        <Text style={[styles.rankName, { color: C.black }]}>{item.name}</Text>
        {item.subtitle ? <Text style={[styles.rankSub, { color: C.gray600 }]}>{item.subtitle}</Text> : null}
      </View>
      {item.hot ? (
        <View style={styles.hotBadge}>
          <Text style={styles.hotBadgeText}>🔥 chaud</Text>
        </View>
      ) : item.planCount ? (
        <View style={[styles.planCountBadge, { backgroundColor: C.gray200 }]}>
          <Text style={[styles.planCountText, { color: C.gray700 }]}>{item.planCount} plans</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );

  const renderSection = (section: ExploreSection, idx: number, layout: ExploreLayout) => (
    <View key={`${section.title}-${idx}`} style={styles.section}>
      <Text style={[styles.sectionTitle, { color: C.gray600 }]}>{section.title}</Text>
      {layout === 'mood-list' ? (
        <View style={styles.moodList}>
          {section.items.map((item) => renderMoodItem(item))}
        </View>
      ) : layout === 'ranked-list' ? (
        <View>
          {section.items.map((item, i) => renderRankedItem(item, i + 1))}
        </View>
      ) : (
        <View style={styles.catGrid}>
          {section.items.map((item, i) => renderCategoryCard(item, i, section.items.length))}
        </View>
      )}
    </View>
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
          colors={colors as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.compactBanner}
        >
          <Text style={styles.compactTitle} numberOfLines={2}>{item.title}</Text>
        </LinearGradient>
        <View style={styles.compactMeta}>
          <Text style={[styles.compactMetaText, { color: C.gray800 }]}>💰 {item.price}</Text>
          <Text style={[styles.compactMetaText, { color: C.gray800 }]}>⏱ {item.duration}</Text>
          <Text style={[styles.compactMetaText, { color: C.gray800 }]}>❤️ {item.likesCount}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderUserResult = (user: any) => (
    <TouchableOpacity
      key={user.id}
      style={[styles.userRow, { borderBottomColor: C.borderLight }]}
      onPress={() => navigation.navigate('OtherProfile', { userId: user.id })}
      activeOpacity={0.7}
    >
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
      <View style={[styles.searchBar, { backgroundColor: C.gray200 }]}>
        <Text style={styles.searchIcon}>🔍</Text>
        <RNTextInput
          style={[styles.searchInput, { color: C.black }]}
          placeholder={t.explore_search_placeholder}
          placeholderTextColor={C.gray600}
          value={searchQuery}
          onChangeText={handleSearch}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={handleClear}>
            <Text style={[styles.clearBtn, { color: C.gray700 }]}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {showCategories ? (
        <>
          {renderFilterChips()}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {activeGroup.sections.map((section, idx) => renderSection(section, idx, activeGroup.layout))}
            <View style={{ height: 30 }} />
          </ScrollView>
        </>
      ) : (
        <>
          {/* Search results */}
          <View style={styles.resultsHeader}>
            <TouchableOpacity onPress={handleClear}>
              <Text style={[styles.backLink, { color: C.primary }]}>{t.explore_back_categories}</Text>
            </TouchableOpacity>
          </View>

          {searchUsers_.length > 0 ? (
            <ScrollView contentContainerStyle={styles.resultsList}>
              <Text style={[styles.resultsSectionLabel, { color: C.gray700 }]}>
                {t.explore_users_count} ({searchUsers_.length})
              </Text>
              {searchUsers_.map(renderUserResult)}
            </ScrollView>
          ) : (
            <FlatList
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
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageTitle: {
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.5,
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 10,
    paddingBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    marginHorizontal: Layout.screenPadding,
    paddingHorizontal: 14,
    height: 44,
    marginBottom: 12,
  },
  searchIcon: { fontSize: 15, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  clearBtn: { fontSize: 16, paddingLeft: 8 },

  // Filter chips
  chipsScroll: { marginBottom: 8, flexGrow: 0 },
  chipsContainer: { paddingHorizontal: Layout.screenPadding, gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '700' },

  // Category sections
  scrollContent: { paddingHorizontal: Layout.screenPadding },
  section: { marginTop: 16 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  catCard: {
    width: CARD_WIDTH,
    marginBottom: CARD_GAP,
    borderRadius: 16,
    overflow: 'hidden',
  },
  catCardGradient: {
    height: 110,
    padding: 14,
    justifyContent: 'flex-end',
    position: 'relative',
  },
  catEmoji: {
    position: 'absolute',
    top: 12,
    right: 14,
    fontSize: 32,
  },
  catCardContent: {},
  catName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  catSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },

  // Results
  resultsHeader: {
    paddingHorizontal: Layout.screenPadding,
    marginBottom: 12,
  },
  backLink: { fontSize: 13, fontWeight: '600' },
  resultsSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  resultsList: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: 20,
  },
  compactCard: {
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
    color: '#FFFFFF',
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
  compactMetaText: { fontSize: 12 },

  // Mood list layout
  moodList: { gap: 10 },
  moodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  moodEmoji: { fontSize: 32, marginRight: 14 },
  moodTextCol: { flex: 1 },
  moodName: { fontSize: 16, fontWeight: '700' },
  moodSub: { fontSize: 13, marginTop: 2 },
  moodChevron: { fontSize: 24, fontWeight: '300', marginLeft: 8 },

  // Ranked list layout
  rankedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  rankNumber: { fontSize: 22, fontWeight: '800', width: 32 },
  rankEmojiCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankEmoji: { fontSize: 24 },
  rankTextCol: { flex: 1 },
  rankName: { fontSize: 15, fontWeight: '700' },
  rankSub: { fontSize: 12, marginTop: 2 },
  hotBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  hotBadgeText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  planCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  planCountText: { fontSize: 12, fontWeight: '600' },

  // User search results
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInitials: { fontSize: 14, fontWeight: '700' },
  userName: { fontSize: 14, fontWeight: '700' },
  userHandle: { fontSize: 12, marginTop: 1 },
});
