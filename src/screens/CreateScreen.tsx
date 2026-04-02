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
import { CategoryTag, TransportMode, Place } from '../types';
import mockApi from '../services/mockApi';
import { trackEvent } from '../services/posthogConfig';

const TRANSPORT_OPTIONS: TransportMode[] = ['Métro', 'Vélo', 'À pied', 'Voiture', 'Trottinette'];

export const CreateScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);

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
      ? Alert.prompt('Ajouter un lieu', 'Nom du lieu', (name) => {
          if (name) {
            setPlaces((prev) => [...prev, { id: `sp-${Date.now()}`, name, type: 'Lieu' }]);
          }
        })
      : Alert.alert('Ajouter un lieu', 'Simulation: un lieu a été ajouté', [
          {
            text: 'Annuler',
            style: 'cancel',
          },
          {
            text: 'Café Oberkampf',
            onPress: () =>
              setPlaces((prev) => [
                ...prev,
                { id: `sp-${Date.now()}`, name: 'Café Oberkampf', type: 'Café' },
              ]),
          },
          {
            text: 'Parc Belleville',
            onPress: () =>
              setPlaces((prev) => [
                ...prev,
                { id: `sp-${Date.now()}`, name: 'Parc Belleville', type: 'Parc' },
              ]),
          },
        ]);
  };

  const removePlace = (id: string) => {
    setPlaces((prev) => prev.filter((p) => p.id !== id));
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (title.length < 5) e.title = 'Minimum 5 caractères';
    if (selectedTags.length === 0) e.tags = 'Sélectionne au moins 1 catégorie';
    if (places.length < 2) e.places = 'Ajoute au moins 2 lieux';
    if (!price) e.price = 'Requis';
    if (!duration) e.duration = 'Requis';
    if (!transport) e.transport = 'Choisis un transport';
    setErrors(e);
    if (Object.keys(e).length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    return Object.keys(e).length === 0;
  };

  const handlePublish = async () => {
    if (!validate()) return;
    setIsPublishing(true);
    try {
      await mockApi.publishPlan({
        title,
        tags: selectedTags,
        places: places.map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
          address: 'Paris',
          rating: 4.5,
          reviewCount: 0,
          ratingDistribution: [0, 0, 0, 0, 0] as [number, number, number, number, number],
          reviews: [],
        })),
        price,
        duration,
        transport: transport!,
      });

      // Track plan creation
      trackEvent('plan_created', {
        title,
        tags_count: selectedTags.length,
        places_count: places.length,
        transport,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsSuccess(true);
    } catch {
      Alert.alert('Erreur', 'Impossible de publier le plan');
    } finally {
      setIsPublishing(false);
    }
  };

  if (isSuccess) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.successContainer}>
          <Text style={styles.successEmoji}>🎉</Text>
          <Text style={styles.successTitle}>Plan publié !</Text>
          <Text style={styles.successDesc}>
            Ton plan est maintenant visible par toute la communauté.
          </Text>
          <View style={styles.xpEarned}>
            <Text style={styles.xpEarnedText}>+20 XP gagnés</Text>
          </View>
          <PrimaryButton
            label="Retour au feed"
            onPress={() => {
              setIsSuccess(false);
              setTitle('');
              setSelectedTags([]);
              setPlaces([]);
              setPrice('');
              setDuration('');
              setTransport(null);
              navigation.navigate('FeedTab');
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Créer un plan</Text>
          <View style={styles.costPill}>
            <Text style={styles.costText}>⭐ coûte 20 pts</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Title */}
          <TextInput
            label="Titre du plan"
            placeholder="ex: Matinée cool à Pigalle..."
            value={title}
            onChangeText={setTitle}
            error={errors.title}
          />

          {/* Categories */}
          <Text style={styles.fieldLabel}>Catégorie</Text>
          <View style={styles.chipsWrap}>
            {CATEGORIES.map((cat) => (
              <Chip
                key={cat.name}
                label={`${cat.emoji} ${cat.name}`}
                variant={selectedTags.includes(cat.name) ? 'filled-black' : 'filled-gray'}
                onPress={() => toggleTag(cat.name)}
              />
            ))}
          </View>
          {errors.tags && <Text style={styles.errorText}>{errors.tags}</Text>}

          {/* Places */}
          <Text style={styles.fieldLabel}>Lieux du plan</Text>
          {places.map((p, i) => (
            <View key={p.id} style={styles.placeRow}>
              <View style={styles.placeDot} />
              <Text style={styles.placeName}>{p.name}</Text>
              <Text style={styles.placeType}>{p.type}</Text>
              <TouchableOpacity onPress={() => removePlace(p.id)}>
                <Text style={styles.placeRemove}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.addPlaceBtn} onPress={addPlace}>
            <Text style={styles.addPlaceText}>+ Ajouter un lieu</Text>
          </TouchableOpacity>
          {errors.places && <Text style={styles.errorText}>{errors.places}</Text>}

          {/* Price & Duration */}
          <View style={styles.halfRow}>
            <TextInput
              label="Prix moyen"
              placeholder="ex: 25€"
              value={price}
              onChangeText={setPrice}
              error={errors.price}
              half
            />
            <View style={{ width: 12 }} />
            <TextInput
              label="Durée"
              placeholder="ex: 4h"
              value={duration}
              onChangeText={setDuration}
              error={errors.duration}
              half
            />
          </View>

          {/* Transport */}
          <Text style={styles.fieldLabel}>Transport</Text>
          <View style={styles.chipsWrap}>
            {TRANSPORT_OPTIONS.map((t) => (
              <Chip
                key={t}
                label={t}
                variant={transport === t ? 'filled-black' : 'filled-gray'}
                onPress={() => setTransport(t)}
              />
            ))}
          </View>
          {errors.transport && <Text style={styles.errorText}>{errors.transport}</Text>}

          {/* Publish */}
          <View style={styles.publishSection}>
            <PrimaryButton
              label="Publier le plan"
              onPress={handlePublish}
              loading={isPublishing}
            />
            <Text style={styles.costNote}>
              Tu as <Text style={{ fontWeight: '700' }}>{userPts} pts</Text> · Il t'en restera{' '}
              <Text style={{ fontWeight: '700' }}>{userPts - 20}</Text>
            </Text>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 21, fontWeight: '800', color: Colors.black, letterSpacing: -0.5 },
  costPill: {
    backgroundColor: Colors.goldBg,
    borderWidth: 1,
    borderColor: Colors.goldBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  costText: { fontSize: 11, fontWeight: '700', color: Colors.gold },
  scroll: { flex: 1 },
  scrollContent: { padding: Layout.screenPadding, paddingBottom: 40 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.gray800,
    marginBottom: 8,
    marginTop: 6,
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  errorText: { fontSize: 11, color: Colors.error, marginTop: -6, marginBottom: 8, marginLeft: 2 },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: 8,
  },
  placeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  placeName: { fontSize: 13, fontWeight: '700', color: Colors.black, flex: 1 },
  placeType: { fontSize: 11, color: Colors.gray700 },
  placeRemove: { fontSize: 14, color: Colors.gray600, paddingHorizontal: 6 },
  addPlaceBtn: {
    paddingVertical: 12,
    marginBottom: 8,
  },
  addPlaceText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  halfRow: { flexDirection: 'row' },
  publishSection: { marginTop: 20 },
  costNote: {
    fontSize: 12,
    color: Colors.gray700,
    textAlign: 'center',
    marginTop: 10,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  successEmoji: { fontSize: 56, marginBottom: 16 },
  successTitle: { fontSize: 20, fontWeight: '800', color: Colors.black, marginBottom: 8 },
  successDesc: {
    fontSize: 14,
    color: Colors.gray700,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  xpEarned: {
    backgroundColor: Colors.successBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 24,
  },
  xpEarnedText: { fontSize: 13, fontWeight: '700', color: Colors.success },
});
