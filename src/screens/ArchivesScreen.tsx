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
      setPlans(p);
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
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <Text style={[styles.back, { color: C.primary }]} onPress={() => navigation.goBack()}>Retour</Text>
        <Text style={[styles.headerTitle, { color: C.black }]}>Archives</Text>
        <View style={{ width: 60 }} />
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
        <ScrollView contentContainerStyle={styles.scroll}>
          {plans.map((plan) => {
            const colors = parseGradient(plan.gradient);
            const photo = getPlanPhoto(plan);
            return (
              <View key={plan.id} style={[styles.card, { borderColor: C.borderLight }]}>
                <TouchableOpacity
                  style={styles.cardContent}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('PlanDetail', { planId: plan.id })}
                >
                  <View style={styles.cardImage}>
                    {photo ? (
                      <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} />
                    ) : (
                      <LinearGradient colors={colors as [string, string, ...string[]]} style={StyleSheet.absoluteFill} />
                    )}
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={[styles.cardTitle, { color: C.black }]} numberOfLines={2}>{plan.title}</Text>
                    <Text style={[styles.cardMeta, { color: C.gray600 }]}>{plan.places.length} lieux · {plan.price}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.republishBtn, { backgroundColor: C.primary }]} onPress={() => handleRepublish(plan.id)}>
                  <Ionicons name="arrow-undo-outline" size={16} color="#FFF" />
                  <Text style={styles.republishText}>Republier</Text>
                </TouchableOpacity>
              </View>
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
  back: { fontSize: 15, fontFamily: Fonts.serifSemiBold, width: 60 },
  headerTitle: { fontSize: 17, fontFamily: Fonts.serifBold },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 14, fontFamily: Fonts.serif },
  scroll: { padding: Layout.screenPadding, gap: 14 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  cardImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: 'hidden',
  },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 14, fontFamily: Fonts.serifBold, marginBottom: 4 },
  cardMeta: { fontSize: 12, fontFamily: Fonts.serif },
  republishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  republishText: { color: '#FFF', fontSize: 13, fontFamily: Fonts.serifBold },
});
