import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Platform,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Layout, Fonts, Colors } from '../constants';
import { useAuthStore } from '../store';
import { useColors } from '../hooks/useColors';
import { fetchArchivedPlans, unarchivePlan } from '../services/plansService';
import { Plan } from '../types';

const { width } = Dimensions.get('window');
const GRID_GAP = 2;
const GRID_COLS = 3;
const GRID_CELL = (width - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

const parseGradient = (g: string): string[] => {
  const m = g.match(/#[A-Fa-f0-9]{6}/g);
  return m && m.length >= 2 ? m : ['#FF9A60', '#C94520'];
};

const getPlanPhoto = (plan: Plan): string | null => {
  if (plan.coverPhotos?.length) return plan.coverPhotos[0];
  for (const p of plan.places) {
    if (p.photoUrls?.length) return p.photoUrls[0];
  }
  return null;
};

const MONTH_SHORT = ['janv.', 'fev.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'aout', 'sept.', 'oct.', 'nov.', 'dec.'];

const formatDateBadge = (iso: string): { day: string; month: string } => {
  const d = new Date(iso);
  return { day: String(d.getDate()), month: MONTH_SHORT[d.getMonth()] };
};

export const ArchivesScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const C = useColors();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchArchivedPlans(user.id).then((p) => {
      setPlans(p.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setLoading(false);
    });
  }, [user?.id]);

  const handleRepublish = (planId: string) => {
    const doRepublish = () => {
      unarchivePlan(planId).then(() => {
        setPlans((prev) => prev.filter((p) => p.id !== planId));
      });
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Republier ce plan ?')) doRepublish();
    } else {
      const { Alert } = require('react-native');
      Alert.alert('Republier', 'Ce plan sera de nouveau visible sur ton profil et le feed.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Republier', onPress: doRepublish },
      ]);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.borderLight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={C.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: C.black }]}>Archives</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.primary} />
        </View>
      ) : plans.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="archive-outline" size={48} color={C.gray400} />
          <Text style={[styles.emptyText, { color: C.gray600 }]}>Aucun plan archivé</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
          {plans.map((plan) => {
            const colors = parseGradient(plan.gradient);
            const photo = getPlanPhoto(plan);
            const date = formatDateBadge(plan.createdAt);
            return (
              <TouchableOpacity
                key={plan.id}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('PlanDetail', { planId: plan.id })}
                onLongPress={() => handleRepublish(plan.id)}
              >
                <View style={styles.cell}>
                  {photo ? (
                    <Image source={{ uri: photo }} style={styles.cellImage} />
                  ) : (
                    <LinearGradient colors={colors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                  )}
                  {/* Bottom gradient for title readability */}
                  <LinearGradient colors={['transparent', 'rgba(0,0,0,0.65)']} style={styles.cellOverlay} />

                  {/* Date badge — top left like Instagram archives */}
                  <View style={styles.dateBadge}>
                    <Text style={styles.dateBadgeDay}>{date.day}</Text>
                    <Text style={styles.dateBadgeMonth}>{date.month}</Text>
                  </View>

                  {/* Republish icon — top right */}
                  <TouchableOpacity style={styles.republishBadge} onPress={() => handleRepublish(plan.id)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="arrow-undo" size={12} color="#FFF" />
                  </TouchableOpacity>

                  {/* Title — bottom */}
                  <View style={styles.cellBottom}>
                    <Text style={styles.cellTitle} numberOfLines={2}>{plan.title}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontFamily: Fonts.displaySemiBold },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 14, fontFamily: Fonts.body },

  // Grid — same as profile published plans
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  cell: { width: GRID_CELL, height: GRID_CELL, overflow: 'hidden' },
  cellImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', resizeMode: 'cover' },
  cellOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%' },
  cellBottom: { position: 'absolute', bottom: 8, left: 8, right: 8 },
  cellTitle: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: Fonts.displaySemiBold,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // Date badge — Instagram archive style (top-left)
  dateBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(44,36,32,0.5)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    zIndex: 2,
  },
  dateBadgeDay: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 17,
  },
  dateBadgeMonth: {
    color: 'rgba(255,248,240,0.85)',
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'lowercase',
  },

  // Republish icon badge — top-right
  republishBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(44,36,32,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
});
