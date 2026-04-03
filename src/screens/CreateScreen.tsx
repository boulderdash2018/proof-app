import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Colors, Layout, CATEGORIES } from '../constants';
import { PrimaryButton, Chip, TextInput } from '../components';
import { useAuthStore } from '../store';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { CategoryTag, TransportMode, Place } from '../types';
import mockApi from '../services/mockApi';
import { trackEvent } from '../services/posthogConfig';

const TRANSPORT_OPTIONS: TransportMode[] = ['Métro', 'Vélo', 'À pied', 'Voiture', 'Trottinette'];

export const CreateScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const C = useColors();
  const { t } = useTranslation();

  const getTransportLabel = (mode: TransportMode): string => {
    const map: Record<TransportMode, string> = {
      'Métro': t.transport_metro, 'Vélo': t.transport_velo,
      'À pied': t.transport_pied, 'Voiture': t.transport_voiture,
      'Trottinette': t.transport_trottinette,
    };
    return map[mode];
  };

  const [title, setTitle] = useState('');
  const [selectedTags, setSelectedTags] = useState<CategoryTag[]>([]);
  const [places, setPlaces] = useState<{ id: string; name: string; type: string }[]>([]);
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [transport, setTransport] = useState<TransportMode | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const userPts = user?.xpPoints ? user.xpPoints % 1000 : 240;

  const toggleTag = (tag: CategoryTag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const addPlace = () => {
    Alert.prompt
      ? Alert.prompt(t.create_add_place_title, t.create_add_place_prompt, (name) => {
          if (name) {
            setPlaces((prev) => [...prev, { id: `sp-${Date.now()}`, name, type: 'Lieu' }]);
          }
        })
      : Alert.alert(t.create_add_place_title, t.create_add_place_sim, [
          { text: t.cancel, style: 'cancel' },
          { text: 'Café Oberkampf', onPress: () => setPlaces((prev) => [...prev, { id: `sp-${Date.now()}`, name: 'Café Oberkampf', type: 'Café' }]) },
          { text: 'Parc Belleville', onPress: () => setPlaces((prev) => [...prev, { id: `sp-${Date.now()}`, name: 'Parc Belleville', type: 'Parc' }]) },
        ]);
  };

  const removePlace = (id: string) => {
    setPlaces((prev) => prev.filter((p) => p.id !== id));
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (title.length < 5) e.title = t.create_error_title;
    if (selectedTags.length === 0) e.tags = t.create_error_tags;
    if (places.length < 2) e.places = t.create_error_places;
    if (!price) e.price = t.create_error_required;
    if (!duration) e.duration = t.create_error_required;
    if (!transport) e.transport = t.create_error_transport;
    setErrors(e);
    if (Object.keys(e).length > 0) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    return Object.keys(e).length === 0;
  };

  const handlePublish = async () => {
    if (!validate()) return;
    setIsPublishing(true);
    try {
      await mockApi.publishPlan({
        title, tags: selectedTags,
        places: places.map((p) => ({ id: p.id, name: p.name, type: p.type, address: 'Paris', rating: 4.5, reviewCount: 0, ratingDistribution: [0, 0, 0, 0, 0] as [number, number, number, number, number], reviews: [] })),
        price, duration, transport: transport!,
      });
      trackEvent('plan_created', { title, tags_count: selectedTags.length, places_count: places.length, transport });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsSuccess(true);
    } catch {
      Alert.alert(t.error, t.create_error_publish);
    } finally {
      setIsPublishing(false);
    }
  };

  if (isSuccess) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
        <View style={styles.successContainer}>
          <Text style={styles.successEmoji}>🎉</Text>
          <Text style={[styles.successTitle, { color: C.black }]}>{t.create_success_title}</Text>
          <Text style={[styles.successDesc, { color: C.gray700 }]}>{t.create_success_desc}</Text>
          <View style={[styles.xpEarned, { backgroundColor: C.successBg }]}>
            <Text style={[styles.xpEarnedText, { color: C.success }]}>{t.create_success_xp}</Text>
          </View>
          <PrimaryButton label={t.create_success_back} onPress={() => { setIsSuccess(false); setTitle(''); setSelectedTags([]); setPlaces([]); setPrice(''); setDuration(''); setTransport(null); navigation.navigate('FeedTab'); }} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
        <View style={[styles.header, { borderBottomColor: C.border }]}>
          <Text style={[styles.headerTitle, { color: C.black }]}>{t.create_title}</Text>
          <View style={[styles.costPill, { backgroundColor: C.goldBg, borderColor: C.goldBorder }]}>
            <Text style={[styles.costText, { color: C.gold }]}>{t.create_cost}</Text>
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <TextInput label={t.create_plan_title_label} placeholder={t.create_plan_title_placeholder} value={title} onChangeText={setTitle} error={errors.title} />

          <Text style={[styles.fieldLabel, { color: C.gray800 }]}>{t.create_category}</Text>
          <View style={styles.chipsWrap}>
            {CATEGORIES.map((cat) => (
              <Chip key={cat.name} label={`${cat.emoji} ${cat.name}`} variant={selectedTags.includes(cat.name) ? 'filled-black' : 'filled-gray'} onPress={() => toggleTag(cat.name)} />
            ))}
          </View>
          {errors.tags && <Text style={styles.errorText}>{errors.tags}</Text>}

          <Text style={[styles.fieldLabel, { color: C.gray800 }]}>{t.create_places}</Text>
          {places.map((p) => (
            <View key={p.id} style={[styles.placeRow, { borderBottomColor: C.borderLight }]}>
              <View style={[styles.placeDot, { backgroundColor: C.primary }]} />
              <Text style={[styles.placeName, { color: C.black }]}>{p.name}</Text>
              <Text style={[styles.placeType, { color: C.gray700 }]}>{p.type}</Text>
              <TouchableOpacity onPress={() => removePlace(p.id)}>
                <Text style={[styles.placeRemove, { color: C.gray600 }]}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.addPlaceBtn} onPress={addPlace}>
            <Text style={[styles.addPlaceText, { color: C.primary }]}>{t.create_add_place}</Text>
          </TouchableOpacity>
          {errors.places && <Text style={styles.errorText}>{errors.places}</Text>}

          <View style={styles.halfRow}>
            <TextInput label={t.create_price_label} placeholder={t.create_price_placeholder} value={price} onChangeText={setPrice} error={errors.price} half />
            <View style={{ width: 12 }} />
            <TextInput label={t.create_duration_label} placeholder={t.create_duration_placeholder} value={duration} onChangeText={setDuration} error={errors.duration} half />
          </View>

          <Text style={[styles.fieldLabel, { color: C.gray800 }]}>{t.create_transport}</Text>
          <View style={styles.chipsWrap}>
            {TRANSPORT_OPTIONS.map((opt) => (
              <Chip key={opt} label={getTransportLabel(opt)} variant={transport === opt ? 'filled-black' : 'filled-gray'} onPress={() => setTransport(opt)} />
            ))}
          </View>
          {errors.transport && <Text style={styles.errorText}>{errors.transport}</Text>}

          <View style={styles.publishSection}>
            <PrimaryButton label={t.create_publish} onPress={handlePublish} loading={isPublishing} />
            <Text style={[styles.costNote, { color: C.gray700 }]}>
              {t.create_points_have} <Text style={{ fontWeight: '700' }}>{userPts} {t.create_points_unit}</Text> · {t.create_points_remain}{' '}
              <Text style={{ fontWeight: '700' }}>{userPts - 20}</Text>
            </Text>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 21, fontWeight: '800', letterSpacing: -0.5 },
  costPill: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  costText: { fontSize: 11, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: Layout.screenPadding, paddingBottom: 40 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8, marginTop: 6 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  errorText: { fontSize: 11, color: Colors.error, marginTop: -6, marginBottom: 8, marginLeft: 2 },
  placeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, gap: 8 },
  placeDot: { width: 7, height: 7, borderRadius: 4 },
  placeName: { fontSize: 13, fontWeight: '700', flex: 1 },
  placeType: { fontSize: 11 },
  placeRemove: { fontSize: 14, paddingHorizontal: 6 },
  addPlaceBtn: { paddingVertical: 12, marginBottom: 8 },
  addPlaceText: { fontSize: 13, fontWeight: '600' },
  halfRow: { flexDirection: 'row' },
  publishSection: { marginTop: 20 },
  costNote: { fontSize: 12, textAlign: 'center', marginTop: 10 },
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  successEmoji: { fontSize: 56, marginBottom: 16 },
  successTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  successDesc: { fontSize: 14, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  xpEarned: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 24 },
  xpEarnedText: { fontSize: 13, fontWeight: '700' },
});
