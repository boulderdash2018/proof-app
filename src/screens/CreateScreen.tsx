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
import { Colors, Layout, Fonts, CATEGORIES } from '../constants';
import { PrimaryButton, Chip, TextInput } from '../components';
import { useAuthStore, useFeedStore, useSavesStore } from '../store';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { CategoryTag, TransportMode, TravelSegment } from '../types';
import { createPlan } from '../services/plansService';
import { trackEvent } from '../services/posthogConfig';

const TRANSPORT_OPTIONS: TransportMode[] = ['Métro', 'Vélo', 'À pied', 'Voiture', 'Trottinette'];

const TRANSPORT_EMOJIS: Record<TransportMode, string> = {
  'Métro': '🚇',
  'Vélo': '🚲',
  'À pied': '🚶',
  'Voiture': '🚗',
  'Trottinette': '🛴',
};

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

// ========== TYPES ==========
interface PlaceEntry {
  id: string;
  name: string;
  type: string;
  price: string;      // user input (numbers only)
  duration: string;   // user input in minutes (numbers only)
}

interface TravelEntry {
  fromId: string;
  toId: string;
  duration: string;   // user input in minutes (numbers only)
  transport: TransportMode;
}

// Format minutes to readable duration
const formatDuration = (totalMinutes: number): string => {
  if (totalMinutes < 60) return `${totalMinutes}min`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
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
  const [places, setPlaces] = useState<PlaceEntry[]>([]);
  const [travels, setTravels] = useState<TravelEntry[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Place picker state
  const [showPlacePicker, setShowPlacePicker] = useState(false);
  const [placeSearch, setPlaceSearch] = useState('');


  const toggleTag = (tag: CategoryTag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // ========== AUTO-CALCULATED TOTALS ==========
  const totalPrice = useMemo(() => {
    return places.reduce((sum, p) => {
      const val = parseInt(p.price, 10);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }, [places]);

  const totalDuration = useMemo(() => {
    const placeTime = places.reduce((sum, p) => {
      const val = parseInt(p.duration, 10);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
    const travelTime = travels.reduce((sum, t) => {
      const val = parseInt(t.duration, 10);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
    return placeTime + travelTime;
  }, [places, travels]);

  // Get the most used transport mode for the plan's main transport
  const mainTransport = useMemo((): TransportMode => {
    if (travels.length === 0) return 'À pied';
    const counts: Record<string, number> = {};
    travels.forEach((t) => { counts[t.transport] = (counts[t.transport] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as TransportMode;
  }, [travels]);

  // All unique transports chosen (in order of first appearance)
  const uniqueTransports = useMemo((): TransportMode[] => {
    if (travels.length === 0) return [];
    const seen = new Set<TransportMode>();
    const result: TransportMode[] = [];
    travels.forEach((t) => {
      if (!seen.has(t.transport)) { seen.add(t.transport); result.push(t.transport); }
    });
    return result;
  }, [travels]);

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
    const newPlace: PlaceEntry = { id: place.id, name: place.name, type: place.type, price: '', duration: '' };
    const newPlaces = [...places, newPlace];
    setPlaces(newPlaces);

    // Auto-add travel segment if this isn't the first place
    if (places.length > 0) {
      const prevPlace = places[places.length - 1];
      setTravels((prev) => [
        ...prev,
        { fromId: prevPlace.id, toId: place.id, duration: '', transport: 'À pied' },
      ]);
    }

    setShowPlacePicker(false);
    setPlaceSearch('');
  };

  const removePlace = (id: string) => {
    const index = places.findIndex((p) => p.id === id);
    if (index === -1) return;

    const newPlaces = places.filter((p) => p.id !== id);
    setPlaces(newPlaces);

    // Remove associated travel segments and rebuild
    if (newPlaces.length <= 1) {
      setTravels([]);
    } else {
      const newTravels: TravelEntry[] = [];
      for (let i = 0; i < newPlaces.length - 1; i++) {
        // Try to find existing travel between these two places
        const existing = travels.find(
          (t) => t.fromId === newPlaces[i].id && t.toId === newPlaces[i + 1].id
        );
        newTravels.push(
          existing || { fromId: newPlaces[i].id, toId: newPlaces[i + 1].id, duration: '', transport: 'À pied' }
        );
      }
      setTravels(newTravels);
    }
  };

  // ========== UPDATE HANDLERS ==========
  const updatePlacePrice = (id: string, value: string) => {
    // Only allow digits
    const cleaned = value.replace(/[^0-9]/g, '');
    setPlaces((prev) => prev.map((p) => p.id === id ? { ...p, price: cleaned } : p));
  };

  const updatePlaceDuration = (id: string, value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '');
    setPlaces((prev) => prev.map((p) => p.id === id ? { ...p, duration: cleaned } : p));
  };

  const updateTravelDuration = (index: number, value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '');
    setTravels((prev) => prev.map((t, i) => i === index ? { ...t, duration: cleaned } : t));
  };

  const updateTravelTransport = (index: number, mode: TransportMode) => {
    setTravels((prev) => prev.map((t, i) => i === index ? { ...t, transport: mode } : t));
  };

  // ========== VALIDATION ==========
  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (title.length < 5) e.title = t.create_error_title;
    if (selectedTags.length === 0) e.tags = t.create_error_tags;
    if (places.length < 2) e.places = t.create_error_places;

    // Check each place has valid numbers
    places.forEach((p, i) => {
      if (!p.price || isNaN(parseInt(p.price, 10))) e[`place_price_${i}`] = t.create_error_numbers_only;
      if (!p.duration || isNaN(parseInt(p.duration, 10))) e[`place_duration_${i}`] = t.create_error_numbers_only;
    });

    // Check each travel has valid duration
    travels.forEach((tr, i) => {
      if (!tr.duration || isNaN(parseInt(tr.duration, 10))) e[`travel_duration_${i}`] = t.create_error_numbers_only;
    });

    setErrors(e);
    if (Object.keys(e).length > 0) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    return Object.keys(e).length === 0;
  };

  const handlePublish = async () => {
    if (!validate() || !user) return;
    setIsPublishing(true);
    try {
      const travelSegments: TravelSegment[] = travels.map((tr) => ({
        fromPlaceId: tr.fromId,
        toPlaceId: tr.toId,
        duration: parseInt(tr.duration, 10),
        transport: tr.transport,
      }));

      const newPlan = await createPlan(
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
            placePrice: parseInt(p.price, 10) || 0,
            placeDuration: parseInt(p.duration, 10) || 0,
          })),
          price: `${totalPrice}€`,
          duration: formatDuration(totalDuration),
          transport: mainTransport,
          travelSegments,
        },
        user
      );
      addPlan(newPlan);
      addCreatedPlan(newPlan);
      trackEvent('plan_created', { title, tags_count: selectedTags.length, places_count: places.length, transport: mainTransport });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsSuccess(true);
    } catch {
      Alert.alert(t.error, t.create_error_publish);
    } finally {
      setIsPublishing(false);
    }
  };

  // ========== SUCCESS SCREEN ==========
  if (isSuccess) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
        <View style={styles.successContainer}>
          <Text style={styles.successEmoji}>🎉</Text>
          <Text style={[styles.successTitle, { color: C.black }]}>{t.create_success_title}</Text>
          <Text style={[styles.successDesc, { color: C.gray700 }]}>{t.create_success_desc}</Text>
          <PrimaryButton label={t.create_success_back} onPress={() => {
            setIsSuccess(false); setTitle(''); setSelectedTags([]); setPlaces([]); setTravels([]);
            navigation.navigate('FeedTab');
          }} />
        </View>
      </View>
    );
  }

  // ========== RENDER PLACE + TRAVEL ITEMS ==========
  const renderPlacesWithTravels = () => {
    const items: React.ReactNode[] = [];

    places.forEach((place, index) => {
      // Place card
      items.push(
        <View key={`place-${place.id}`} style={[styles.placeCard, { backgroundColor: C.white, borderColor: C.borderLight }]}>
          <View style={styles.placeCardHeader}>
            <View style={[styles.placeNumber, { backgroundColor: C.primary }]}>
              <Text style={styles.placeNumberText}>{index + 1}</Text>
            </View>
            <View style={styles.placeCardInfo}>
              <Text style={[styles.placeName, { color: C.black }]}>{place.name}</Text>
              <Text style={[styles.placeType, { color: C.gray700 }]}>{place.type}</Text>
            </View>
            <TouchableOpacity onPress={() => removePlace(place.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={[styles.placeRemove, { color: C.gray600 }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Per-place price & duration inputs */}
          <View style={styles.placeInputsRow}>
            <View style={styles.placeInputGroup}>
              <Text style={[styles.placeInputLabel, { color: C.gray700 }]}>{t.create_place_price}</Text>
              <View style={[styles.placeInputWrap, { backgroundColor: C.gray200, borderColor: errors[`place_price_${index}`] ? Colors.error : 'transparent' }]}>
                <RNTextInput
                  style={[styles.placeInput, { color: C.black }]}
                  placeholder={t.create_place_price_placeholder}
                  placeholderTextColor={C.gray500}
                  value={place.price}
                  onChangeText={(v) => updatePlacePrice(place.id, v)}
                  keyboardType="numeric"
                  maxLength={5}
                />
                <Text style={[styles.placeInputUnit, { color: C.gray600 }]}>€</Text>
              </View>
              {errors[`place_price_${index}`] && (
                <Text style={styles.miniError}>{errors[`place_price_${index}`]}</Text>
              )}
            </View>

            <View style={{ width: 10 }} />

            <View style={styles.placeInputGroup}>
              <Text style={[styles.placeInputLabel, { color: C.gray700 }]}>{t.create_place_duration}</Text>
              <View style={[styles.placeInputWrap, { backgroundColor: C.gray200, borderColor: errors[`place_duration_${index}`] ? Colors.error : 'transparent' }]}>
                <RNTextInput
                  style={[styles.placeInput, { color: C.black }]}
                  placeholder={t.create_place_duration_placeholder}
                  placeholderTextColor={C.gray500}
                  value={place.duration}
                  onChangeText={(v) => updatePlaceDuration(place.id, v)}
                  keyboardType="numeric"
                  maxLength={4}
                />
                <Text style={[styles.placeInputUnit, { color: C.gray600 }]}>min</Text>
              </View>
              {errors[`place_duration_${index}`] && (
                <Text style={styles.miniError}>{errors[`place_duration_${index}`]}</Text>
              )}
            </View>
          </View>
        </View>
      );

      // Travel segment between this place and the next one
      if (index < places.length - 1 && index < travels.length) {
        const travel = travels[index];
        const nextPlace = places[index + 1];
        items.push(
          <View key={`travel-${index}`} style={[styles.travelCard, { backgroundColor: C.gray200 + '80' }]}>
            <View style={styles.travelHeader}>
              <Text style={styles.travelDots}>⋮</Text>
              <Text style={[styles.travelLabel, { color: C.gray700 }]}>
                {t.create_between_places} <Text style={{ fontWeight: '700', color: C.black }}>{place.name.split(' ')[0]}</Text> {t.create_and} <Text style={{ fontWeight: '700', color: C.black }}>{nextPlace.name.split(' ')[0]}</Text>
              </Text>
            </View>

            <View style={styles.travelInputsRow}>
              <View style={styles.travelInputGroup}>
                <Text style={[styles.placeInputLabel, { color: C.gray700 }]}>{t.create_travel_time}</Text>
                <View style={[styles.placeInputWrap, { backgroundColor: C.white, borderColor: errors[`travel_duration_${index}`] ? Colors.error : 'transparent' }]}>
                  <RNTextInput
                    style={[styles.placeInput, { color: C.black }]}
                    placeholder={t.create_travel_time_placeholder}
                    placeholderTextColor={C.gray500}
                    value={travel.duration}
                    onChangeText={(v) => updateTravelDuration(index, v)}
                    keyboardType="numeric"
                    maxLength={4}
                  />
                  <Text style={[styles.placeInputUnit, { color: C.gray600 }]}>min</Text>
                </View>
                {errors[`travel_duration_${index}`] && (
                  <Text style={styles.miniError}>{errors[`travel_duration_${index}`]}</Text>
                )}
              </View>
            </View>

            <View style={styles.travelTransportRow}>
              {TRANSPORT_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[
                    styles.transportMiniChip,
                    {
                      backgroundColor: travel.transport === opt ? C.primary : C.white,
                      borderColor: travel.transport === opt ? C.primary : C.borderLight,
                    },
                  ]}
                  onPress={() => updateTravelTransport(index, opt)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.transportMiniEmoji}>{TRANSPORT_EMOJIS[opt]}</Text>
                  <Text style={[
                    styles.transportMiniText,
                    { color: travel.transport === opt ? '#FFFFFF' : C.gray800 },
                  ]}>
                    {getTransportLabel(opt)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      }
    });

    return items;
  };

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

          {/* Places with travel segments */}
          {renderPlacesWithTravels()}

          <TouchableOpacity
            style={[styles.addPlaceBtn, { backgroundColor: C.primary + '10', borderColor: C.primary + '30' }]}
            onPress={() => setShowPlacePicker(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.addPlaceText, { color: C.primary }]}>{t.create_add_place}</Text>
          </TouchableOpacity>
          {errors.places && <Text style={styles.errorText}>{errors.places}</Text>}

          {/* ========== AUTO-CALCULATED TOTALS ========== */}
          {places.length >= 2 && (
            <View style={[styles.totalsCard, { backgroundColor: C.primary + '08', borderColor: C.primary + '20' }]}>
              <Text style={[styles.totalsTitle, { color: C.primary }]}>RECAP</Text>
              <View style={styles.totalsRow}>
                <View style={styles.totalItem}>
                  <Text style={styles.totalEmoji}>💰</Text>
                  <Text style={[styles.totalLabel, { color: C.gray700 }]}>{t.create_total_price}</Text>
                  <Text style={[styles.totalValue, { color: C.black }]}>{totalPrice}€</Text>
                </View>
                <View style={[styles.totalsDivider, { backgroundColor: C.primary + '20' }]} />
                <View style={styles.totalItem}>
                  <Text style={styles.totalEmoji}>⏱️</Text>
                  <Text style={[styles.totalLabel, { color: C.gray700 }]}>{t.create_total_duration}</Text>
                  <Text style={[styles.totalValue, { color: C.black }]}>{formatDuration(totalDuration)}</Text>
                </View>
                <View style={[styles.totalsDivider, { backgroundColor: C.primary + '20' }]} />
                <View style={styles.totalItem}>
                  <Text style={[styles.totalLabel, { color: C.gray700 }]}>{t.create_transport}</Text>
                  <View style={styles.transportsList}>
                    {uniqueTransports.map((mode) => (
                      <View key={mode} style={[styles.transportTag, { backgroundColor: C.primary + '15' }]}>
                        <Text style={styles.transportTagEmoji}>{TRANSPORT_EMOJIS[mode]}</Text>
                        <Text style={[styles.transportTagText, { color: C.primary }]}>{getTransportLabel(mode)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            </View>
          )}

          <View style={styles.publishSection}>
            <PrimaryButton label={t.create_publish} onPress={handlePublish} loading={isPublishing} />
          </View>
        </ScrollView>

        {/* ========== PLACE PICKER MODAL ========== */}
        <Modal visible={showPlacePicker} animationType="slide" presentationStyle="pageSheet">
          <View style={[styles.modalContainer, { paddingTop: insets.top, backgroundColor: C.white }]}>
            <View style={[styles.modalHeader, { borderBottomColor: C.borderLight }]}>
              <Text style={[styles.modalTitle, { color: C.black }]}>{t.create_add_place_title}</Text>
              <TouchableOpacity onPress={() => { setShowPlacePicker(false); setPlaceSearch(''); }}>
                <Text style={[styles.modalClose, { color: C.primary }]}>{t.cancel}</Text>
              </TouchableOpacity>
            </View>

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
  headerTitle: { fontSize: 22, fontFamily: Fonts.serifBold, letterSpacing: -0.3 },
  costPill: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  costText: { fontSize: 11, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: Layout.screenPadding, paddingBottom: 40 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8, marginTop: 6 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  errorText: { fontSize: 11, color: Colors.error, marginTop: -6, marginBottom: 8, marginLeft: 2 },
  placesCount: { fontSize: 11, marginBottom: 6, marginLeft: 2 },

  // Place card
  placeCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 0 },
  placeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  placeNumber: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  placeNumberText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  placeCardInfo: { flex: 1 },
  placeName: { fontSize: 13, fontWeight: '700' },
  placeType: { fontSize: 11, marginTop: 1 },
  placeRemove: { fontSize: 14, paddingHorizontal: 6 },
  placeInputsRow: { flexDirection: 'row' },
  placeInputGroup: { flex: 1 },
  placeInputLabel: { fontSize: 10, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  placeInputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 10, height: 36, borderWidth: 1.5 },
  placeInput: { flex: 1, fontSize: 14, fontWeight: '600', paddingVertical: 0 },
  placeInputUnit: { fontSize: 12, fontWeight: '600', marginLeft: 4 },
  miniError: { fontSize: 10, color: Colors.error, marginTop: 2 },

  // Travel card
  travelCard: { borderRadius: 12, padding: 10, marginVertical: 4 },
  travelHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  travelDots: { fontSize: 16, marginRight: 8, color: '#999', fontWeight: '700' },
  travelLabel: { fontSize: 11, flex: 1 },
  travelInputsRow: { flexDirection: 'row', marginBottom: 8 },
  travelInputGroup: { flex: 1, maxWidth: 160 },
  travelTransportRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  transportMiniChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1 },
  transportMiniEmoji: { fontSize: 12, marginRight: 4 },
  transportMiniText: { fontSize: 11, fontWeight: '600' },

  // Totals recap
  totalsCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 16, marginBottom: 4 },
  totalsTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 10, textAlign: 'center' },
  totalsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  totalItem: { alignItems: 'center' },
  totalEmoji: { fontSize: 18, marginBottom: 4 },
  totalLabel: { fontSize: 10, fontWeight: '600', marginBottom: 2 },
  totalValue: { fontSize: 16, fontWeight: '800' },
  totalsDivider: { width: 1, height: 40 },
  transportsList: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4, marginTop: 4 },
  transportTag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  transportTagEmoji: { fontSize: 11, marginRight: 3 },
  transportTagText: { fontSize: 11, fontWeight: '700' },

  addPlaceBtn: { paddingVertical: 14, marginTop: 8, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center' },
  addPlaceText: { fontSize: 13, fontWeight: '700' },
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
