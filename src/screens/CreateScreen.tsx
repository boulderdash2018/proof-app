import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TextInput as RNTextInput,
  FlatList,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Colors, Layout, CATEGORIES } from '../constants';
import { PrimaryButton, Chip, TextInput } from '../components';
import { useAuthStore, useFeedStore, useSavesStore } from '../store';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { CategoryTag, TransportMode } from '../types';
import mockApi from '../services/mockApi';
import { trackEvent } from '../services/posthogConfig';

const TRANSPORT_OPTIONS: TransportMode[] = ['Métro', 'Vélo', 'À pied', 'Voiture', 'Trottinette'];

// ========== FICTIONAL PLACES ==========
const FICTIONAL_PLACES = [
  { id: 'fp-1', name: 'Café Oberkampf', type: 'Café', emoji: '☕' },
  { id: 'fp-2', name: 'Le Bouillon Chartier', type: 'Restaurant', emoji: '🍽️' },
  { id: 'fp-3', name: 'Shakespeare and Company', type: 'Librairie', emoji: '📚' },
  { id: 'fp-4', name: 'Musée Picasso', type: 'Musée', emoji: '🎨' },
  { id: 'fp-5', name: 'Canal Saint-Martin', type: 'Balade', emoji: '🚶' },
  { id: 'fp-6', name: 'Le Comptoir Général', type: 'Bar', emoji: '🍸' },
  { id: 'fp-7', name: 'Marché des Enfants Rouges', type: 'Marché', emoji: '🛒' },
  { id: 'fp-8', name: 'Parc des Buttes-Chaumont', type: 'Parc', emoji: '🌳' },
  { id: 'fp-9', name: 'La REcyclerie', type: 'Café', emoji: '☕' },
  { id: 'fp-10', name: 'Palais de Tokyo', type: 'Musée', emoji: '🏛️' },
  { id: 'fp-11', name: 'Rosa Bonheur', type: 'Bar', emoji: '🍷' },
  { id: 'fp-12', name: 'Ober Mamma', type: 'Restaurant', emoji: '🍝' },
  { id: 'fp-13', name: 'Sacré-Cœur', type: 'Monument', emoji: '⛪' },
  { id: 'fp-14', name: 'Jardin du Luxembourg', type: 'Parc', emoji: '🌷' },
  { id: 'fp-15', name: 'Le Perchoir Marais', type: 'Rooftop', emoji: '🌇' },
  { id: 'fp-16', name: 'Galerie Perrotin', type: 'Expo', emoji: '🖼️' },
  { id: 'fp-17', name: 'La Maison Rose', type: 'Photo spot', emoji: '📸' },
  { id: 'fp-18', name: 'Ten Belles Coffee', type: 'Café', emoji: '☕' },
  { id: 'fp-19', name: 'Le Marais Vintage', type: 'Shopping', emoji: '🛍️' },
  { id: 'fp-20', name: 'Cinéma Le Grand Rex', type: 'Cinéma', emoji: '🎬' },
];

const PLACE_ADDRESSES: Record<string, string> = {
  'fp-1': '3 Rue Oberkampf, 75011 Paris',
  'fp-2': '7 Rue du Faubourg Montmartre, 75009 Paris',
  'fp-3': '37 Rue de la Bûcherie, 75005 Paris',
  'fp-4': '5 Rue de Thorigny, 75003 Paris',
  'fp-5': 'Quai de Jemmapes, 75010 Paris',
  'fp-6': '80 Quai de Jemmapes, 75010 Paris',
  'fp-7': '39 Rue de Bretagne, 75003 Paris',
  'fp-8': '1 Rue Botzaris, 75019 Paris',
  'fp-9': '83 Bd Ornano, 75018 Paris',
  'fp-10': '13 Av. du Président Wilson, 75016 Paris',
  'fp-11': 'Parc des Buttes-Chaumont, 75019 Paris',
  'fp-12': '107 Bd Richard-Lenoir, 75011 Paris',
  'fp-13': '35 Rue du Chevalier de la Barre, 75018 Paris',
  'fp-14': '75006 Paris',
  'fp-15': '33 Rue de la Verrerie, 75004 Paris',
  'fp-16': '76 Rue de Turenne, 75003 Paris',
  'fp-17': "2 Rue de l'Abreuvoir, 75018 Paris",
  'fp-18': '10 Rue de la Grange aux Belles, 75010 Paris',
  'fp-19': 'Rue des Rosiers, 75004 Paris',
  'fp-20': '1 Bd Poissonnière, 75002 Paris',
};

export const CreateScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const addPlan = useFeedStore((s) => s.addPlan);
  const addCreatedPlan = useSavesStore((s) => s.addCreatedPlan);
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

  // Place picker state
  const [showPlacePicker, setShowPlacePicker] = useState(false);
  const [placeSearch, setPlaceSearch] = useState('');

  const userPts = user?.xpPoints ? user.xpPoints % 1000 : 240;

  const toggleTag = (tag: CategoryTag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // Filter fictional places based on search + already added
  const addedIds = new Set(places.map((p) => p.id));
  const filteredPlaces = useMemo(() => {
    const available = FICTIONAL_PLACES.filter((p) => !addedIds.has(p.id));
    if (!placeSearch.trim()) return available;
    const q = placeSearch.toLowerCase();
    return available.filter(
      (p) => p.name.toLowerCase().includes(q) || p.type.toLowerCase().includes(q)
    );
  }, [placeSearch, addedIds.size]);

  const selectPlace = (place: typeof FICTIONAL_PLACES[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlaces((prev) => [...prev, { id: place.id, name: place.name, type: place.type }]);
    setShowPlacePicker(false);
    setPlaceSearch('');
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
    if (!validate() || !user) return;
    setIsPublishing(true);
    try {
      const newPlan = await mockApi.publishPlan(
        {
          title,
          tags: selectedTags,
          places: places.map((p) => ({
            id: p.id,
            name: p.name,
            type: p.type,
            address: PLACE_ADDRESSES[p.id] || 'Paris, France',
            rating: parseFloat((3.8 + Math.random() * 1.2).toFixed(1)),
            reviewCount: Math.floor(Math.random() * 200) + 10,
            ratingDistribution: [50, 25, 15, 7, 3] as [number, number, number, number, number],
            reviews: [],
          })),
          price,
          duration,
          transport: transport!,
        },
        user
      );
      // Add to feed store + saves (as done) immediately
      addPlan(newPlan);
      addCreatedPlan(newPlan);
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
          {places.length > 0 && (
            <Text style={[styles.placesCount, { color: C.gray600 }]}>
              {places.length} {t.create_places_added}
            </Text>
          )}
          {places.map((p, index) => (
            <View key={p.id} style={[styles.placeRow, { borderBottomColor: C.borderLight }]}>
              <View style={[styles.placeNumber, { backgroundColor: C.primary }]}>
                <Text style={styles.placeNumberText}>{index + 1}</Text>
              </View>
              <View style={styles.placeInfo}>
                <Text style={[styles.placeName, { color: C.black }]}>{p.name}</Text>
                <Text style={[styles.placeType, { color: C.gray700 }]}>{p.type}</Text>
              </View>
              <TouchableOpacity onPress={() => removePlace(p.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={[styles.placeRemove, { color: C.gray600 }]}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity
            style={[styles.addPlaceBtn, { backgroundColor: C.primary + '10', borderColor: C.primary + '30' }]}
            onPress={() => setShowPlacePicker(true)}
            activeOpacity={0.7}
          >
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

        {/* ========== PLACE PICKER MODAL ========== */}
        <Modal visible={showPlacePicker} animationType="slide" presentationStyle="pageSheet">
          <View style={[styles.modalContainer, { paddingTop: insets.top, backgroundColor: C.white }]}>
            {/* Modal header */}
            <View style={[styles.modalHeader, { borderBottomColor: C.borderLight }]}>
              <Text style={[styles.modalTitle, { color: C.black }]}>{t.create_add_place_title}</Text>
              <TouchableOpacity onPress={() => { setShowPlacePicker(false); setPlaceSearch(''); }}>
                <Text style={[styles.modalClose, { color: C.primary }]}>{t.cancel}</Text>
              </TouchableOpacity>
            </View>

            {/* Search bar */}
            <View style={[styles.modalSearch, { backgroundColor: C.gray200 }]}>
              <Text style={styles.searchIcon}>🔍</Text>
              <RNTextInput
                style={[styles.searchInput, { color: C.black }]}
                placeholder={t.create_search_place}
                placeholderTextColor={C.gray600}
                value={placeSearch}
                onChangeText={setPlaceSearch}
                autoFocus
              />
              {placeSearch.length > 0 && (
                <TouchableOpacity onPress={() => setPlaceSearch('')}>
                  <Text style={[styles.clearBtn, { color: C.gray700 }]}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.modalSectionLabel, { color: C.gray700 }]}>{t.create_suggested_places}</Text>

            {/* Places list */}
            <FlatList
              data={filteredPlaces}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.modalList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.placeOption, { borderBottomColor: C.borderLight }]}
                  activeOpacity={0.6}
                  onPress={() => selectPlace(item)}
                >
                  <View style={[styles.placeOptionEmoji, { backgroundColor: C.gray200 }]}>
                    <Text style={{ fontSize: 20 }}>{item.emoji}</Text>
                  </View>
                  <View style={styles.placeOptionInfo}>
                    <Text style={[styles.placeOptionName, { color: C.black }]}>{item.name}</Text>
                    <Text style={[styles.placeOptionType, { color: C.gray700 }]}>{item.type} · Paris</Text>
                  </View>
                  <Text style={[styles.placeOptionAdd, { color: C.primary }]}>+</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </Modal>
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
  placesCount: { fontSize: 11, marginBottom: 6, marginLeft: 2 },
  placeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, gap: 10 },
  placeNumber: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  placeNumberText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  placeInfo: { flex: 1 },
  placeName: { fontSize: 13, fontWeight: '700' },
  placeType: { fontSize: 11, marginTop: 1 },
  placeRemove: { fontSize: 14, paddingHorizontal: 6 },
  addPlaceBtn: { paddingVertical: 14, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center' },
  addPlaceText: { fontSize: 13, fontWeight: '700' },
  halfRow: { flexDirection: 'row' },
  publishSection: { marginTop: 20 },
  costNote: { fontSize: 12, textAlign: 'center', marginTop: 10 },
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  successEmoji: { fontSize: 56, marginBottom: 16 },
  successTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  successDesc: { fontSize: 14, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  xpEarned: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 24 },
  xpEarnedText: { fontSize: 13, fontWeight: '700' },

  // Modal styles
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingVertical: 14, borderBottomWidth: 1 },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  modalClose: { fontSize: 14, fontWeight: '600' },
  modalSearch: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Layout.screenPadding, marginTop: 12, borderRadius: 12, paddingHorizontal: 12, height: 42 },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  clearBtn: { fontSize: 15, paddingLeft: 8 },
  modalSectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: Layout.screenPadding, marginTop: 16, marginBottom: 8 },
  modalList: { paddingHorizontal: Layout.screenPadding, paddingBottom: 40 },
  placeOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  placeOptionEmoji: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  placeOptionInfo: { flex: 1 },
  placeOptionName: { fontSize: 14, fontWeight: '700' },
  placeOptionType: { fontSize: 12, marginTop: 2 },
  placeOptionAdd: { fontSize: 24, fontWeight: '600', paddingLeft: 10 },
});
