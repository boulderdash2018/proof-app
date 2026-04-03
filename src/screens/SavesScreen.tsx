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
import { useColors } from '../hooks/useColors';
import { SavedPlan } from '../types';

export const SavesScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { savedPlans, isLoading, fetchSaves, markAsDone, unsave } = useSavesStore();
  const [activeTab, setActiveTab] = useState<'todo' | 'done'>('todo');
  const C = useColors();

  useEffect(() => {
    fetchSaves();
  }, []);

  const filteredPlans = savedPlans.filter((sp) =>
    activeTab === 'todo' ? !sp.isDone : sp.isDone
  );

  const renderItem = ({ item }: { item: SavedPlan }) => (
    <TouchableOpacity
      style={[styles.saveItem, { backgroundColor: C.white, borderColor: C.border }]}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('PlanDetail', { planId: item.planId })}
    >
      <View style={styles.saveItemHeader}>
        <Text style={[styles.saveItemTitle, { color: C.black }]} numberOfLines={1}>{item.plan.title}</Text>
        <View style={[styles.statusBadge, item.isDone ? styles.statusDone : styles.statusTodo]}>
          <Text style={[styles.statusText, { color: item.isDone ? C.success : C.primary }]}>
            {item.isDone ? '✓ Faite' : 'À faire'}
          </Text>
        </View>
      </View>
      <View style={styles.saveItemMeta}>
        <Text style={[styles.saveItemAuthor, { color: C.gray700 }]}>par {item.plan.author.username}</Text>
        <Text style={[styles.saveItemDot, { color: C.gray500 }]}>·</Text>
        <Text style={[styles.saveItemPrice, { color: C.gray800 }]}>{item.plan.price}</Text>
        <Text style={[styles.saveItemDot, { color: C.gray500 }]}>·</Text>
        <Text style={[styles.saveItemDuration, { color: C.gray800 }]}>{item.plan.duration}</Text>
      </View>
      <View style={styles.tagsRow}>
        {item.plan.tags.slice(0, 3).map((tag, i) => (
          <Chip key={tag} label={tag} small variant={i === 0 ? 'filled-black' : 'filled-gray'} />
        ))}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      <Text style={[styles.pageTitle, { color: C.black }]}>Sauvegardes</Text>

      <View style={[styles.tabBar, { backgroundColor: C.gray300 }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'todo' && [styles.tabActive, { backgroundColor: C.white }]]}
          onPress={() => setActiveTab('todo')}
        >
          <Text style={[styles.tabText, { color: C.gray700 }, activeTab === 'todo' && { color: C.black }]}>
            À faire
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'done' && [styles.tabActive, { backgroundColor: C.white }]]}
          onPress={() => setActiveTab('done')}
        >
          <Text style={[styles.tabText, { color: C.gray700 }, activeTab === 'done' && { color: C.black }]}>
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
            <EmptyState icon="🔖" title="Aucune activité sauvegardée" subtitle="Sauvegarde des plans depuis le feed !" />
          ) : (
            <EmptyState icon="🗺️" title="Aucune activité faite" subtitle="Complète des plans pour les retrouver ici." />
          )
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  pageTitle: { fontSize: 21, fontWeight: '800', letterSpacing: -0.5, paddingHorizontal: Layout.screenPadding, paddingTop: 10, paddingBottom: 12 },
  tabBar: { flexDirection: 'row', marginHorizontal: Layout.screenPadding, borderRadius: 14, padding: 3, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center' },
  tabActive: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: '600' },
  list: { paddingHorizontal: Layout.screenPadding, paddingBottom: 20 },
  saveItem: { borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1 },
  saveItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  saveItemTitle: { fontSize: 14, fontWeight: '700', flex: 1, marginRight: 8 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  statusTodo: { backgroundColor: '#FFF0EB', borderColor: '#FFE0D0' },
  statusDone: { backgroundColor: Colors.successBg, borderColor: Colors.successBorder },
  statusText: { fontSize: 10, fontWeight: '700' },
  saveItemMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 4 },
  saveItemAuthor: { fontSize: 11 },
  saveItemDot: { fontSize: 11 },
  saveItemPrice: { fontSize: 11 },
  saveItemDuration: { fontSize: 11 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap' },
});
