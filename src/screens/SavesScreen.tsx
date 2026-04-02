import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Layout } from '../constants';
import { Chip, EmptyState } from '../components';
import { useSavesStore } from '../store';
import { SavedPlan } from '../types';

export const SavesScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { savedPlans, isLoading, fetchSaves, markAsDone, unsave } = useSavesStore();
  const [activeTab, setActiveTab] = useState<'todo' | 'done'>('todo');

  useEffect(() => {
    fetchSaves();
  }, []);

  const filteredPlans = savedPlans.filter((sp) =>
    activeTab === 'todo' ? !sp.isDone : sp.isDone
  );

  const renderItem = ({ item }: { item: SavedPlan }) => (
    <TouchableOpacity
      style={styles.saveItem}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('PlanDetail', { planId: item.planId })}
    >
      <View style={styles.saveItemHeader}>
        <Text style={styles.saveItemTitle} numberOfLines={1}>{item.plan.title}</Text>
        <View
          style={[
            styles.statusBadge,
            item.isDone ? styles.statusDone : styles.statusTodo,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              { color: item.isDone ? Colors.success : Colors.primary },
            ]}
          >
            {item.isDone ? '✓ Faite' : 'À faire'}
          </Text>
        </View>
      </View>
      <View style={styles.saveItemMeta}>
        <Text style={styles.saveItemAuthor}>par {item.plan.author.username}</Text>
        <Text style={styles.saveItemDot}>·</Text>
        <Text style={styles.saveItemPrice}>{item.plan.price}</Text>
        <Text style={styles.saveItemDot}>·</Text>
        <Text style={styles.saveItemDuration}>{item.plan.duration}</Text>
      </View>
      <View style={styles.tagsRow}>
        {item.plan.tags.slice(0, 3).map((tag, i) => (
          <Chip key={tag} label={tag} small variant={i === 0 ? 'filled-black' : 'filled-gray'} />
        ))}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.pageTitle}>Sauvegardes</Text>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'todo' && styles.tabActive]}
          onPress={() => setActiveTab('todo')}
        >
          <Text style={[styles.tabText, activeTab === 'todo' && styles.tabTextActive]}>
            À faire
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'done' && styles.tabActive]}
          onPress={() => setActiveTab('done')}
        >
          <Text style={[styles.tabText, activeTab === 'done' && styles.tabTextActive]}>
            Faites ✓
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredPlans}
        renderItem={renderItem}
        keyExtractor={(item) => item.planId}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          activeTab === 'todo' ? (
            <EmptyState
              icon="🔖"
              title="Aucune activité sauvegardée"
              subtitle="Sauvegarde des plans depuis le feed !"
            />
          ) : (
            <EmptyState
              icon="🗺️"
              title="Aucune activité faite"
              subtitle="Complète des plans pour les retrouver ici."
            />
          )
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  pageTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: Colors.black,
    letterSpacing: -0.5,
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 10,
    paddingBottom: 12,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: Layout.screenPadding,
    backgroundColor: '#F3F3F3',
    borderRadius: 14,
    padding: 3,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.gray700 },
  tabTextActive: { color: Colors.black },
  list: { paddingHorizontal: Layout.screenPadding, paddingBottom: 20 },
  saveItem: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  saveItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  saveItemTitle: { fontSize: 14, fontWeight: '700', color: Colors.black, flex: 1, marginRight: 8 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  statusTodo: { backgroundColor: '#FFF0EB', borderColor: '#FFE0D0' },
  statusDone: { backgroundColor: Colors.successBg, borderColor: Colors.successBorder },
  statusText: { fontSize: 10, fontWeight: '700' },
  saveItemMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 4 },
  saveItemAuthor: { fontSize: 11, color: Colors.gray700 },
  saveItemDot: { fontSize: 11, color: Colors.gray500 },
  saveItemPrice: { fontSize: 11, color: Colors.gray800 },
  saveItemDuration: { fontSize: 11, color: Colors.gray800 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap' },
});
