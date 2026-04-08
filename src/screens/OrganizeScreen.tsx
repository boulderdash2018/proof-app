import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  TextInput as RNTextInput,
  FlatList,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout, Fonts, CATEGORIES } from '../constants';
import { useColors } from '../hooks/useColors';
import { useAuthStore } from '../store/authStore';
import { useDoItNowStore } from '../store/doItNowStore';
import { CategoryTag, Place, Plan, DoItNowTransport } from '../types';
import { TransportChooser } from '../components/TransportChooser';
import {
  searchPlacesAutocomplete,
  getPlaceDetails,
  getReadableType,
  GooglePlaceAutocomplete,
} from '../services/googlePlacesService';

const PARIS_CENTER = { lat: 48.8566, lng: 2.3522 };

interface PlaceEntry {
  id: string;
  googlePlaceId: string;
  name: string;
  type: string;
  address: string;
}

export const OrganizeScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const C = useColors();
  const user = useAuthStore((s) => s.user);

  // ── State ──
  const [title, setTitle] = useState('');
  const [selectedTags, setSelectedTags] = useState<CategoryTag[]>([]);
  const [places, setPlaces] = useState<PlaceEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showTransport, setShowTransport] = useState(false);
  const [tempPlan, setTempPlan] = useState<Plan | null>(null);

  // Place picker
  const [showPlacePicker, setShowPlacePicker] = useState(false);
  const [placeSearch, setPlaceSearch] = useState('');
  const [placeResults, setPlaceResults] = useState<GooglePlaceAutocomplete[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Handlers ──
  const toggleTag = (tag: CategoryTag) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handlePlaceSearch = useCallback((query: string) => {
    setPlaceSearch(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (query.length < 2) { setPlaceResults([]); return; }
    setIsSearchingPlaces(true);
    searchTimerRef.current = setTimeout(async () => {
      const results = await searchPlacesAutocomplete(query, PARIS_CENTER);
      setPlaceResults(results);
      setIsSearchingPlaces(false);
    }, 350);
  }, []);

  const selectPlace = useCallback((item: GooglePlaceAutocomplete) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newPlace: PlaceEntry = {
      id: item.placeId,
      googlePlaceId: item.placeId,
      name: item.name,
      type: getReadableType(item.types),
      address: item.address || '',
    };
    setPlaces((prev) => [...prev, newPlace]);
    setShowPlacePicker(false);
    setPlaceSearch('');
    setPlaceResults([]);
  }, []);

  const removePlace = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlaces((prev) => prev.filter((p) => p.id !== id));
  };

  const handleLaunch = async () => {
    if (!canLaunch || !user) return;
    setIsLoading(true);

    try {
      // Fetch Google Place details (coordinates, photos) for all places
      const detailedPlaces: Place[] = [];
      for (const entry of places) {
        const details = await getPlaceDetails(entry.googlePlaceId);
        detailedPlaces.push({
          id: entry.googlePlaceId,
          googlePlaceId: entry.googlePlaceId,
          name: entry.name,
          type: entry.type,
          address: entry.address,
          rating: details?.rating || 0,
          reviewCount: details?.reviewCount || 0,
          ratingDistribution: [0, 0, 0, 0, 0],
          reviews: [],
          photoUrls: details?.photoUrls || [],
          latitude: details?.latitude,
          longitude: details?.longitude,
          priceLevel: details?.priceLevel,
        });
      }

      // Check all places have coordinates
      const placesWithCoords = detailedPlaces.filter((p) => p.latitude && p.longitude);
      if (placesWithCoords.length === 0) {
        Alert.alert('Erreur', 'Impossible de localiser les lieux. Réessaie avec d\'autres lieux.');
        setIsLoading(false);
        return;
      }

      // Build temporary plan
      const plan: Plan = {
        id: `organize-${Date.now()}`,
        authorId: user.id,
        author: user,
        title,
        gradient: 'terracotta',
        tags: selectedTags,
        places: detailedPlaces,
        price: '0€',
        duration: '0min',
        transport: 'À pied',
        likesCount: 0,
        commentsCount: 0,
        proofCount: 0,
        declinedCount: 0,
        xpReward: 20,
        createdAt: new Date().toISOString(),
        timeAgo: 'maintenant',
      };

      setTempPlan(plan);
      setShowTransport(true);
    } catch (err) {
      console.error('Error preparing plan:', err);
      Alert.alert('Erreur', 'Impossible de préparer le plan. Réessaie.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTransportSelect = (transport: DoItNowTransport) => {
    if (!tempPlan || !user) return;
    setShowTransport(false);
    useDoItNowStore.getState().startOrganizeSession(tempPlan, transport, user.id, title, selectedTags);
    navigation.navigate('DoItNow', { planId: tempPlan.id });
  };

  const canLaunch = title.trim().length >= 3 && selectedTags.length > 0 && places.length >= 1;

  // ── Render ──
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { backgroundColor: C.white }]}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: C.borderLight }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={22} color={C.black} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: C.black }]}>Organiser une journée</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Title ── */}
          <Text style={[styles.sectionLabel, { color: C.gray800 }]}>Titre de la journée</Text>
          <View style={[styles.inputWrap, { backgroundColor: C.gray200, borderColor: title.length > 0 ? C.primary + '50' : C.borderLight }]}>
            <Ionicons name="pencil-outline" size={16} color={C.gray600} style={{ marginRight: 8 }} />
            <RNTextInput
              style={[styles.textInput, { color: C.black }]}
              placeholder="Ex: Journée culture au Marais"
              placeholderTextColor={C.gray500}
              value={title}
              onChangeText={setTitle}
              maxLength={60}
            />
          </View>
          <Text style={[styles.charCount, { color: C.gray500 }]}>{title.length}/60</Text>

          {/* ── Categories ── */}
          <Text style={[styles.sectionLabel, { color: C.gray800, marginTop: 20 }]}>Catégories</Text>
          <Text style={[styles.sectionHint, { color: C.gray500 }]}>Choisis le vibe de ta journée</Text>
          <View style={styles.chipsWrap}>
            {CATEGORIES.map((cat) => {
              const isSelected = selectedTags.includes(cat.name);
              return (
                <TouchableOpacity
                  key={cat.name}
                  style={[
                    styles.chip,
                    isSelected
                      ? { backgroundColor: cat.bg + '20', borderColor: cat.bg }
                      : { backgroundColor: C.gray200, borderColor: C.borderLight },
                  ]}
                  onPress={() => toggleTag(cat.name)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipEmoji}>{cat.emoji}</Text>
                  <Text style={[styles.chipText, { color: isSelected ? cat.bg : C.gray700 }]}>{cat.name}</Text>
                  {isSelected && <Ionicons name="checkmark" size={14} color={cat.bg} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Places ── */}
          <Text style={[styles.sectionLabel, { color: C.gray800, marginTop: 20 }]}>Lieux</Text>
          <Text style={[styles.sectionHint, { color: C.gray500 }]}>Ajoute les endroits que tu veux visiter</Text>

          {places.length > 0 && (
            <View style={styles.placesList}>
              {places.map((place, index) => (
                <View key={place.id} style={[styles.placeCard, { backgroundColor: C.gray200, borderColor: C.borderLight }]}>
                  <View style={[styles.placeNumber, { backgroundColor: C.primary }]}>
                    <Text style={styles.placeNumberText}>{index + 1}</Text>
                  </View>
                  <View style={styles.placeInfo}>
                    <Text style={[styles.placeName, { color: C.black }]} numberOfLines={1}>{place.name}</Text>
                    <Text style={[styles.placeType, { color: C.gray600 }]} numberOfLines={1}>{place.type} · {place.address}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removePlace(place.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={20} color={C.gray500} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[styles.addPlaceBtn, { backgroundColor: C.primary + '10', borderColor: C.primary + '30' }]}
            onPress={() => setShowPlacePicker(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={18} color={C.primary} />
            <Text style={[styles.addPlaceText, { color: C.primary }]}>Ajouter un lieu</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* ── Bottom CTA ── */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12, backgroundColor: C.white, borderTopColor: C.borderLight }]}>
          <TouchableOpacity
            style={[styles.launchBtn, { backgroundColor: canLaunch && !isLoading ? C.primary : C.gray300 }]}
            onPress={handleLaunch}
            activeOpacity={canLaunch ? 0.8 : 1}
            disabled={!canLaunch || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <Ionicons name="rocket-outline" size={18} color={canLaunch ? '#FFF' : C.gray500} />
                <Text style={[styles.launchBtnText, { color: canLaunch ? '#FFF' : C.gray500 }]}>Lancer le plan</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Transport Chooser ── */}
        <TransportChooser
          visible={showTransport}
          onClose={() => setShowTransport(false)}
          onSelect={handleTransportSelect}
        />

        {/* ── Place Picker Modal ── */}
        <Modal visible={showPlacePicker} animationType="slide" presentationStyle="pageSheet">
          <View style={[styles.modalContainer, { paddingTop: insets.top, backgroundColor: C.white }]}>
            <View style={[styles.modalHeader, { borderBottomColor: C.borderLight }]}>
              <Text style={[styles.modalTitle, { color: C.black }]}>Ajouter un lieu</Text>
              <TouchableOpacity onPress={() => { setShowPlacePicker(false); setPlaceSearch(''); setPlaceResults([]); }}>
                <Text style={[styles.modalClose, { color: C.primary }]}>Annuler</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.searchBar, { backgroundColor: C.gray200 }]}>
              <Ionicons name="search-outline" size={16} color={C.gray600} style={{ marginRight: 8 }} />
              <RNTextInput
                style={[styles.searchInput, { color: C.black }]}
                placeholder="Rechercher un restaurant, bar, musée..."
                placeholderTextColor={C.gray600}
                value={placeSearch}
                onChangeText={handlePlaceSearch}
                autoFocus
              />
              {placeSearch.length > 0 && (
                <TouchableOpacity onPress={() => { setPlaceSearch(''); setPlaceResults([]); }}>
                  <Ionicons name="close-circle" size={18} color={C.gray700} />
                </TouchableOpacity>
              )}
            </View>

            {isSearchingPlaces && placeSearch.length >= 2 && (
              <ActivityIndicator color={C.primary} style={{ marginTop: 20 }} />
            )}

            <FlatList
              data={placeResults}
              keyExtractor={(item) => item.placeId}
              contentContainerStyle={styles.modalList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.placeOption, { borderBottomColor: C.borderLight }]}
                  activeOpacity={0.6}
                  onPress={() => selectPlace(item)}
                >
                  <View style={[styles.placeOptionIcon, { backgroundColor: C.gray200 }]}>
                    <Ionicons name="location-outline" size={22} color={C.gold} />
                  </View>
                  <View style={styles.placeOptionInfo}>
                    <Text style={[styles.placeOptionName, { color: C.black }]}>{item.name}</Text>
                    <Text style={[styles.placeOptionAddr, { color: C.gray700 }]} numberOfLines={1}>{item.address}</Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={24} color={C.primary} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                !isSearchingPlaces && placeSearch.length >= 2 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="search" size={32} color={C.gray500} />
                    <Text style={[styles.emptyText, { color: C.gray600 }]}>Aucun résultat</Text>
                  </View>
                ) : placeSearch.length < 2 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="location" size={32} color={C.gray500} />
                    <Text style={[styles.emptyText, { color: C.gray600 }]}>Recherche un lieu...</Text>
                  </View>
                ) : null
              }
            />
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontFamily: Fonts.serifBold, letterSpacing: -0.3 },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: Layout.screenPadding },

  // Section
  sectionLabel: { fontSize: 13, fontFamily: Fonts.serifBold, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  sectionHint: { fontSize: 12, fontFamily: Fonts.serif, marginBottom: 10 },

  // Title input
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1.5,
  },
  textInput: { flex: 1, fontSize: 15, fontFamily: Fonts.serif, paddingVertical: 0 },
  charCount: { fontSize: 11, fontFamily: Fonts.serif, textAlign: 'right', marginTop: 4, marginBottom: 4 },

  // Category chips
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  chipEmoji: { fontSize: 14 },
  chipText: { fontSize: 13, fontFamily: Fonts.serifSemiBold },

  // Places
  placesList: { gap: 8, marginBottom: 12 },
  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  placeNumber: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  placeNumberText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  placeInfo: { flex: 1 },
  placeName: { fontSize: 14, fontFamily: Fonts.serifBold },
  placeType: { fontSize: 11, fontFamily: Fonts.serif, marginTop: 2 },
  addPlaceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  addPlaceText: { fontSize: 14, fontFamily: Fonts.serifBold },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 12,
    paddingHorizontal: Layout.screenPadding,
    borderTopWidth: 1,
  },
  launchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  launchBtnText: { fontSize: 16, fontFamily: Fonts.serifBold },

  // Place picker modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 17, fontFamily: Fonts.serifBold },
  modalClose: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Layout.screenPadding,
    marginTop: 12,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: Fonts.serif, paddingVertical: 0 },
  modalList: { padding: Layout.screenPadding },
  placeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  placeOptionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  placeOptionInfo: { flex: 1 },
  placeOptionName: { fontSize: 14, fontFamily: Fonts.serifBold },
  placeOptionAddr: { fontSize: 12, fontFamily: Fonts.serif, marginTop: 2 },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: Fonts.serif, textAlign: 'center' },
});
