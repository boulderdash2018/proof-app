import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
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
  ActivityIndicator,
  Image,
  Animated,
  PanResponder,
  Pressable,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { storage } from '../services/firebaseConfig';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout, Fonts, CATEGORIES, EXPLORE_GROUPS, PERSON_FILTERS, getCityCoordinates } from '../constants';
import { TITLE_SUGGESTIONS, pickRandomSuggestions } from '../constants/suggestions';
import { LinearGradient } from 'expo-linear-gradient';
import { PrimaryButton, Chip, TextInput, PlanCard } from '../components';
import { PhotoEditorSheet } from '../components/PhotoEditorSheet';
import { useAuthStore, useFeedStore, useSavesStore, useDraftStore, useSavedPlacesStore } from '../store';
import { activeCreateSession } from '../store/draftStore';
import { useColors } from '../hooks/useColors';
import { useCity } from '../hooks/useCity';
import { useTranslation } from '../hooks/useTranslation';
import { CategoryTag, TransportMode, TravelSegment, Plan } from '../types';
import { createPlan, updatePlan } from '../services/plansService';
import { pickImage, pickImageFromSource, pickMultipleImages } from '../utils';
import { useProofCamera } from '../components/ProofCamera';
import { SavedPlanPickerSheet } from '../components/SavedPlanPickerSheet';
import { CreatorTipInput } from '../components/publish/CreatorTipInput';
import { DurationPickerSheet } from '../components/DurationPickerSheet';
import { PricePickerSheet } from '../components/PricePickerSheet';
import { trackEvent } from '../services/posthogConfig';
import {
  searchPlacesAutocomplete,
  getPlaceDetails,
  getReadableType,
  computeTravelDuration,
  GooglePlaceAutocomplete,
} from '../services/googlePlacesService';

const TRANSPORT_OPTIONS: TransportMode[] = ['Métro', 'Vélo', 'À pied', 'Voiture', 'Trottinette'];

const TRANSPORT_EMOJIS: Record<TransportMode, string> = {
  'Métro': '🚇',
  'Vélo': '🚲',
  'À pied': '🚶',
  'Voiture': '🚗',
  'Trottinette': '🛴',
};

// City center set dynamically in component via useCity hook

// ========== PRICE RANGES ==========
interface PriceRange {
  label: string;
  min: number;
  max: number;  // Infinity for open-ended
}

const PRICE_RANGES: PriceRange[] = [
  { label: 'Gratuit', min: 0, max: 0 },
  { label: '< 15', min: 1, max: 15 },
  { label: '15–30', min: 15, max: 30 },
  { label: '30–60', min: 30, max: 60 },
  { label: '60–100', min: 60, max: 100 },
  { label: '100+', min: 100, max: Infinity },
];

// ========== TYPES ==========
interface QAPair { question: string; answer: string }

interface PlaceEntry {
  id: string;
  googlePlaceId?: string;
  name: string;
  type: string;
  address?: string;
  placeTypes?: string[];    // raw Google place types for question selection
  priceRangeIndex: number;  // index into PRICE_RANGES (-1 = not set)
  exactPrice: string;       // optional exact price (digits only)
  price: string;            // kept for compat: derived from range or exact
  duration: string;         // user input in minutes (numbers only)
  customPhoto?: string;     // user's own photo URI
  comment?: string;         // user's personal comment
  questionAnswer?: string;  // first QA answer (backward compat)
  question?: string;        // first QA question (backward compat)
  questions?: QAPair[];     // all QAs (multiple questions)
  previewPhotoUrl?: string; // Google photo fetched at selection for preview
  reservationRecommended?: boolean; // book in advance toggle
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

const PREVIEW_TRANSPORT_ICONS: Record<TransportMode, string> = {
  'Métro': 'train-outline', 'Vélo': 'bicycle-outline', 'À pied': 'walk-outline', 'Voiture': 'car-outline', 'Trottinette': 'flash-outline',
};
const PREVIEW_TRANSPORT_EMOJIS: Record<TransportMode, string> = {
  'Métro': '🚇', 'Vélo': '🚲', 'À pied': '🚶', 'Voiture': '🚗', 'Trottinette': '🛴',
};

const PreviewDetail: React.FC<{ plan: Plan; C: any; t: any }> = ({ plan, C, t }) => {
  const cityConfig = useCity();
  const [activeIdx, setActiveIdx] = useState(0);
  const bannerW = Dimensions.get('window').width;

  const allPhotos: string[] = (() => {
    if (plan.coverPhotos && plan.coverPhotos.length > 0) return plan.coverPhotos;
    const pp: string[] = [];
    for (const place of plan.places) {
      if (place.photoUrls) for (const u of place.photoUrls) { pp.push(u); if (pp.length >= 7) break; }
      if (pp.length >= 7) break;
    }
    return pp;
  })();

  const gradientColors = (() => {
    const m = plan.gradient.match(/#[0-9A-Fa-f]{6}/g);
    return m && m.length >= 2 ? m : ['#FF6B35', '#C94520'];
  })();

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      {/* Banner */}
      {allPhotos.length > 0 ? (
        <View style={{ borderRadius: 0, overflow: 'hidden', position: 'relative' }}>
          <FlatList
            data={allPhotos}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => setActiveIdx(Math.round(e.nativeEvent.contentOffset.x / bannerW))}
            scrollEventThrottle={16}
            keyExtractor={(_, i) => String(i)}
            style={{ height: 220 }}
            renderItem={({ item }) => (
              <View style={{ width: bannerW, height: 220 }}>
                <Image source={{ uri: item }} style={{ width: '100%', height: '100%', resizeMode: 'cover' }} />
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 90 }} />
              </View>
            )}
          />
          <View style={{ position: 'absolute', bottom: 16, left: 18, right: 18 }} pointerEvents="none">
            <Text style={{ fontSize: 22, fontFamily: Fonts.displaySemiBold, color: Colors.textOnAccent, textShadowColor: 'rgba(44,36,32,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 }}>{plan.title}</Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,248,240,0.8)', fontFamily: Fonts.body, marginTop: 2 }}>par {plan.author.displayName}</Text>
          </View>
          {allPhotos.length > 1 && (
            <View style={{ position: 'absolute', bottom: 8, alignSelf: 'center', flexDirection: 'row', gap: 5 }} pointerEvents="none">
              {allPhotos.map((_, i) => (
                <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === activeIdx ? Colors.textOnAccent : 'rgba(255,248,240,0.4)' }} />
              ))}
            </View>
          )}
        </View>
      ) : (
        <LinearGradient colors={gradientColors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 220, justifyContent: 'flex-end', paddingHorizontal: 18, paddingBottom: 16 }}>
          <Text style={{ fontSize: 22, fontFamily: Fonts.displaySemiBold, color: Colors.textOnAccent }}>{plan.title}</Text>
          <Text style={{ fontSize: 12, color: 'rgba(255,248,240,0.8)', fontFamily: Fonts.body, marginTop: 2 }}>par {plan.author.displayName}</Text>
        </LinearGradient>
      )}

      {/* Tags + meta */}
      <View style={{ paddingHorizontal: Layout.screenPadding, paddingTop: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {plan.tags.map((tag) => (<Chip key={tag} label={tag} small />))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><Ionicons name="cash-outline" size={14} color={C.gold} /><Text style={{ color: C.gray800, fontSize: 13, fontWeight: '600', marginLeft: 4 }}>{plan.price}</Text></View>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: C.gray500 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><Ionicons name="hourglass-outline" size={14} color={C.gold} /><Text style={{ color: C.gray800, fontSize: 13, fontWeight: '600', marginLeft: 4 }}>{plan.duration}</Text></View>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: C.gray500 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center' }}><Ionicons name={(PREVIEW_TRANSPORT_ICONS[plan.transport] || 'walk-outline') as any} size={14} color={C.gold} /><Text style={{ color: C.gray800, fontSize: 13, fontWeight: '600', marginLeft: 4 }}>{plan.transport}</Text></View>
        </View>
      </View>

      {/* Itinerary */}
      <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray700, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: Layout.screenPadding, marginTop: 16, marginBottom: 10 }}>
        {t.plan_full}
      </Text>

      {plan.places.map((place, index) => {
        const isLast = index === plan.places.length - 1;
        const travelToNext = plan.travelSegments?.find((ts) => ts.fromPlaceId === place.id) || (plan.travelSegments && plan.travelSegments[index]);

        return (
          <View key={place.id}>
            <View style={{ flexDirection: 'row', paddingHorizontal: Layout.screenPadding, paddingVertical: 10, ...(!isLast && !travelToNext ? { borderBottomWidth: 1, borderBottomColor: C.borderLight } : {}) }}>
              <View style={{ width: 30, alignItems: 'center', marginRight: 12 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.textOnAccent }}>{index + 1}</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.black }}>{place.name}</Text>
                <Text style={{ fontSize: 12, color: C.gray700, marginTop: 2 }}>{place.type}{place.address ? ` · ${place.address.split(',')[0]}` : ''}</Text>
                {(place.placePrice != null && place.placePrice > 0 || place.placeDuration != null && place.placeDuration > 0) && (
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                    {place.placePrice != null && place.placePrice > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.gray200, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                        <Ionicons name="cash-outline" size={11} color={C.gold} style={{ marginRight: 3 }} />
                        <Text style={{ fontSize: 11, fontWeight: '600', color: C.gray800 }}>{place.placePrice}{cityConfig.currency}</Text>
                      </View>
                    )}
                    {place.placeDuration != null && place.placeDuration > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.gray200, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                        <Ionicons name="hourglass-outline" size={11} color={C.gold} style={{ marginRight: 3 }} />
                        <Text style={{ fontSize: 11, fontWeight: '600', color: C.gray800 }}>{place.placeDuration}min</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </View>

            {/* Hinge cards */}
            {(place.customPhoto || place.comment || (place.questions && place.questions.length > 0) || place.questionAnswer) && (
              <View style={{ paddingLeft: Layout.screenPadding + 42, paddingRight: Layout.screenPadding, gap: 8, marginBottom: 8 }}>
                {place.customPhoto && (
                  <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.borderLight }}>
                    <Image source={{ uri: place.customPhoto }} style={{ width: '100%', height: 160, resizeMode: 'cover' }} />
                  </View>
                )}
                {place.comment && (
                  <View style={{ backgroundColor: C.white, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.borderLight }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: C.gray600, textTransform: 'uppercase', marginBottom: 4 }}>Mon avis</Text>
                    <Text style={{ fontSize: 13, color: C.black, lineHeight: 18 }}>{place.comment}</Text>
                  </View>
                )}
                {(place.questions && place.questions.length > 0 ? place.questions : (place.questionAnswer && place.question ? [{ question: place.question, answer: place.questionAnswer }] : [])).map((qa, qIdx) => (
                  <View key={qIdx} style={{ backgroundColor: C.white, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.borderLight }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: C.gray600, textTransform: 'uppercase', marginBottom: 4 }}>{qa.question}</Text>
                    <Text style={{ fontSize: 13, color: C.black, lineHeight: 18 }}>{qa.answer}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Travel segment */}
            {!isLast && travelToNext && (
              <View style={{ flexDirection: 'row', paddingHorizontal: Layout.screenPadding, marginVertical: 2 }}>
                <View style={{ width: 30, alignItems: 'center', marginRight: 12 }}>
                  <View style={{ height: 30, borderLeftWidth: 2, borderLeftColor: C.primary + '50', borderStyle: 'dashed' }} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.gray200 + '80', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, gap: 4 }}>
                  <Ionicons name={(PREVIEW_TRANSPORT_ICONS[travelToNext.transport] || 'walk-outline') as any} size={13} color={C.gold} />
                  <Text style={{ fontSize: 12, color: C.gray700 }}>{travelToNext.transport}</Text>
                  <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.gray500 }} />
                  <Text style={{ fontSize: 12, color: C.gray700 }}>{travelToNext.duration}min</Text>
                </View>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
};

export const CreateScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const user = useAuthStore((s) => s.user);
  // Proof Camera — used for cover photo + per-place spot photos.
  // Multi-photo album (pickMultipleImages) stays on the system picker
  // for now since ProofCamera is single-shot — multi-select would mean
  // taking photos one-by-one which is more friction.
  const proofCamera = useProofCamera();
  const addPlan = useFeedStore((s) => s.addPlan);
  const addCreatedPlan = useSavesStore((s) => s.addCreatedPlan);
  const savedPlacesList = useSavedPlacesStore((s) => s.places);
  const C = useColors();
  const { t } = useTranslation();
  const cityConfig = useCity();
  const CITY_CENTER = cityConfig.coordinates;

  const getTransportLabel = (mode: TransportMode): string => {
    const map: Record<TransportMode, string> = {
      'Métro': t.transport_metro, 'Vélo': t.transport_velo,
      'À pied': t.transport_pied, 'Voiture': t.transport_voiture,
      'Trottinette': t.transport_trottinette,
    };
    return map[mode];
  };

  const [title, setTitle] = useState('');
  const [coverPhotos, setCoverPhotos] = useState<string[]>([]);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(EXPLORE_GROUPS[0].key);
  const [showSubcategories, setShowSubcategories] = useState(false);
  const [selectedTags, setSelectedTags] = useState<CategoryTag[]>([]);
  const [places, setPlaces] = useState<PlaceEntry[]>([]);
  const [travels, setTravels] = useState<TravelEntry[]>([]);
  const [authorTip, setAuthorTip] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // DurationPickerSheet — sheet richer qu'une row de pills, monté
  // uniquement en mode customize où l'on veut un CTA fort sur la durée.
  // null = sheet fermé. Le placeId stocké pointe vers le lieu qui sera
  // mis à jour au confirm.
  const [durationPickerPlaceId, setDurationPickerPlaceId] = useState<string | null>(null);
  // PricePickerSheet — symétrique au duration picker, ouvert au tap
  // sur le chip prix en customize mode. Permet de poser explicitement
  // une valeur (incluant 'Gratuit') au lieu de l'expand inline qui
  // mélangeait les pills dans la zone détaillée.
  const [pricePickerPlaceId, setPricePickerPlaceId] = useState<string | null>(null);

  // "Partir d'un plan sauvegardé" picker state — opened from step 1.
  // Après import on bascule en `flowMode='fromSaved'` et on saute
  // DIRECTEMENT à l'étape "lieux" pour que le user perçoive l'action
  // (sinon il a l'impression que rien ne se passe — le sheet se ferme
  // mais l'écran reste sur la step "titre").
  const [showSavedPlanPicker, setShowSavedPlanPicker] = useState(false);

  // Inspirations de titres — 3 piochées au hasard parmi ~50.
  // Re-shuffle :
  //   • à chaque mount (initial state lazy)
  //   • à chaque focus de l'écran (utile car le tab Create reste mounté
  //     entre les visites — sans focus reshuffle, l'user reverrait les
  //     mêmes 3 idées tant qu'il n'a pas reload l'app)
  //   • au tap sur le bouton ↻
  const [titleIdeas, setTitleIdeas] = useState<string[]>(() =>
    pickRandomSuggestions(TITLE_SUGGESTIONS, 3),
  );
  const reshuffleTitleIdeas = () => {
    Haptics.selectionAsync().catch(() => {});
    setTitleIdeas(pickRandomSuggestions(TITLE_SUGGESTIONS, 3));
  };
  useFocusEffect(
    React.useCallback(() => {
      setTitleIdeas(pickRandomSuggestions(TITLE_SUGGESTIONS, 3));
    }, []),
  );

  /**
   * Le wizard a deux flows distincts :
   *   • 'fresh'     — création depuis zéro : titre → cover → catégories → lieux → tip
   *   • 'fromSaved' — préfill depuis un Plan sauvegardé : on commence par
   *     les LIEUX (préremplis, le user ajoute/retire/réordonne), puis
   *     titre VIDE (avec un breadcrumb du plan source), puis cover, puis
   *     catégories, puis tip.
   *
   * Mirror de la même logique qu'OrganizeScreen — quand on importe un
   * plan, le user veut d'abord ajuster les LIEUX à sa sauce, et ensuite
   * lui donner SON nom (pas celui du plan source).
   */
  type FlowMode = 'fresh' | 'fromSaved';
  const [flowMode, setFlowMode] = useState<FlowMode>('fresh');
  /** Titre du plan source — affiché comme breadcrumb sur l'étape titre
   *  en mode `fromSaved` pour donner du contexte au user (ex. "Tu pars
   *  de Dimanche au Marais — donne-lui ton angle"). Null en flow fresh
   *  ou si le plan importé n'avait pas de titre. */
  const [importedSourceTitle, setImportedSourceTitle] = useState<string | null>(null);

  /**
   * Préfill complet du wizard à partir d'un Plan sauvegardé. Recopie
   * tout ce qui peut être réutilisé tel quel et laisse le user modifier
   * dans les étapes suivantes. Le source plan n'est PAS touché — on
   * crée un nouveau plan au final.
   *
   * Pas de coverPhotos en duplicata : on copie le tableau original (URLs
   * Firebase Storage déjà uploadées, partagées entre les deux plans —
   * acceptable car ce sont des assets publics figés).
   *
   * Le titre est volontairement VIDÉ : le plan modifié n'est pas le
   * même que l'original, donc garder le titre serait trompeur. Le user
   * est invité à choisir son propre nom à l'étape titre (qui passe
   * MAINTENANT après les lieux dans le flow `fromSaved`).
   */
  const prefillFromSavedPlan = (src: Plan) => {
    // Titre VIDE — le plan modifié mérite un nom propre. Le breadcrumb
    // garde le contexte : "Tu pars de '${src.title}'".
    setTitle('');
    setImportedSourceTitle(src.title || null);
    setCoverPhotos(src.coverPhotos || []);
    setSelectedTags(src.tags || []);
    setAuthorTip(src.authorTip || '');
    // Convert Place[] → PlaceEntry[] (champs UI custom).
    const newPlaces: PlaceEntry[] = (src.places || []).map((p, idx) => ({
      id: `prefill-${Date.now()}-${idx}`,
      googlePlaceId: p.googlePlaceId,
      name: p.name,
      type: p.type || '',
      address: p.address,
      placeTypes: undefined,
      priceRangeIndex: -1,
      exactPrice: typeof p.placePrice === 'number' && p.placePrice > 0
        ? String(p.placePrice)
        : '',
      price: '',
      duration: typeof p.placeDuration === 'number' && p.placeDuration > 0
        ? String(p.placeDuration)
        : '',
      customPhoto: p.customPhoto,
      comment: p.comment,
      questionAnswer: p.questionAnswer,
      question: p.question,
      questions: p.questions,
      previewPhotoUrl: p.photoUrls?.[0],
      reservationRecommended: p.reservationRecommended,
    }));
    setPlaces(newPlaces);
    // Travel segments : remap fromPlaceId/toPlaceId to nouveaux ids
    // pour que le mapping reste cohérent.
    const idByOldIndex: Record<string, string> = {};
    (src.places || []).forEach((p, idx) => {
      idByOldIndex[p.id] = newPlaces[idx]?.id || '';
    });
    const newTravels: TravelEntry[] = (src.travelSegments || [])
      .map((seg) => ({
        fromId: idByOldIndex[seg.fromPlaceId] || '',
        toId: idByOldIndex[seg.toPlaceId] || '',
        duration: seg.duration > 0 ? String(seg.duration) : '',
        transport: seg.transport,
      }))
      .filter((t) => t.fromId && t.toId);
    setTravels(newTravels);
    // Reset error state — toute valeur précédente devient obsolète.
    setErrors({});
    // Bascule de flow : on saute MAINTENANT à l'étape "lieux" (step 4)
    // pour que le user perçoive l'action et puisse modifier la liste
    // tout de suite. ACTIVE_STEPS sera réordonné à [4, 1, 2, 3, 5] —
    // après les lieux on demande SON titre, puis cover, puis catégories,
    // puis tip. Cf. la définition de ACTIVE_STEPS plus bas.
    setFlowMode('fromSaved');
    setStep(4);
  };

  // ========== 5-STEP WIZARD (1: title, 2: cover, 3: categories, 4: places, 5: creator tip) ==========
  type Step = 1 | 2 | 3 | 4 | 5;
  const TOTAL_STEPS: 5 = 5;
  // Initial step calculé inline pour éviter un flash de l'étape "title"
  // en customize mode (depuis OrganizeCompleteScreen, on saute 1 et 3).
  const [step, setStep] = useState<Step>(() =>
    ((route.params?.draftId || '') as string).startsWith('organize-') ? 2 : 1,
  );
  const TIP_MIN_CHARS = 10;
  const TIP_MAX_CHARS = 180;

  /**
   * "Customize mode" — quand on arrive ici depuis OrganizeCompleteScreen
   * (bouton "Personnaliser ce plan"), le draft a été créé avec un id
   * préfixé `organize-` et contient déjà :
   *   • title (saisi à l'étape 1 du wizard organize)
   *   • selectedTags (saisis à l'étape 2 du wizard organize)
   * Ces deux étapes sont donc redondantes — on les SKIP.
   *
   * Le wizard passe de 5 à 3 étapes effectives : cover → places → tip.
   * Les setters d'étape internes (goToNextStep/goToPrevStep) sautent
   * les indices 1 et 3 quand customizeMode est actif.
   */
  const isCustomizeMode = (route.params?.draftId || '').startsWith('organize-');

  /** Indices d'étape ACTIVES selon le mode + flow.
   *  - `customize` (depuis OrganizeCompleteScreen) : 3 étapes (cover, lieux, tip)
   *  - `fromSaved` (après import d'un plan sauvegardé) : 5 étapes RÉORDONNÉES
   *    pour que les LIEUX viennent en premier, le TITRE après — sinon le user
   *    a l'impression que rien ne se passe quand il importe.
   *  - `fresh` (création standard) : ordre naturel [1..5].
   *  Le `step` stocké reste l'index du composant render (pour ne pas
   *  toucher tout le code des `step === N`). */
  const ACTIVE_STEPS: Step[] =
    isCustomizeMode ? [2, 4, 5] :
    flowMode === 'fromSaved' ? [4, 1, 2, 3, 5] :
    [1, 2, 3, 4, 5];

  /** Position 1-based dans la séquence active (utilisé pour "ÉTAPE X SUR Y"). */
  const stepPosition = ACTIVE_STEPS.indexOf(step) + 1;
  const visibleTotal = ACTIVE_STEPS.length;

  const canProceedFromStep = (s: Step): boolean => {
    if (s === 1) return title.trim().length > 0;
    if (s === 2) return coverPhotos.length > 0; // cover photo is mandatory
    if (s === 3) return selectedTags.length > 0;
    if (s === 4) {
      // Mode customize : plan déjà vécu → on exige les infos pour CHAQUE
      // lieu (photo + durée + prix). Sans ça, la publication serait creuse.
      // Mode fresh : juste 2 lieux mini, le user remplit progressivement.
      if ((route.params?.draftId || '').toString().startsWith('organize-')) {
        if (places.length < 1) return false;
        return places.every((p) =>
          !!(p.customPhoto || p.previewPhotoUrl) &&
          !!p.duration &&
          p.priceRangeIndex >= 0,
        );
      }
      return places.length >= 2;
    }
    if (s === 5) return authorTip.trim().length >= TIP_MIN_CHARS;
    return false;
  };
  const goToNextStep = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const idx = ACTIVE_STEPS.indexOf(step);
    if (idx >= 0 && idx < ACTIVE_STEPS.length - 1) {
      setStep(ACTIVE_STEPS[idx + 1]);
    }
  };
  const goToPrevStep = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const idx = ACTIVE_STEPS.indexOf(step);
    if (idx > 0) {
      setStep(ACTIVE_STEPS[idx - 1]);
    }
  };

  // ========== DRAFT / EDIT ==========
  const draftIdRef = useRef<string>(route.params?.draftId || 'draft-' + Date.now());
  const editPlanIdRef = useRef<string | undefined>(route.params?.editPlanId);
  const isEditing = !!editPlanIdRef.current;
  const draftRestoredRef = useRef(false);
  const toastShownRef = useRef(false);
  const [showDraftToast, setShowDraftToast] = useState(false);
  const draftToastAnim = useRef(new Animated.Value(0)).current;
  const [showResumeSheet, setShowResumeSheet] = useState(false);
  const resumeSheetSlide = useRef(new Animated.Value(300)).current;
  const [pickupDraft, setPickupDraft] = useState<import('../store/draftStore').DraftItem | null>(null);
  const pickupSheetSlide = useRef(new Animated.Value(300)).current;

  // Ref for current form state (read from interval without stale closures)
  const formRef = useRef({ title: '', coverPhotos: [] as string[], selectedTags: [] as CategoryTag[], places: [] as PlaceEntry[], travels: [] as TravelEntry[], authorTip: '' });
  formRef.current = { title, coverPhotos, selectedTags, places, travels, authorTip };

  // ── Drag-to-reorder ──
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const placesRef = useRef(places);
  placesRef.current = places;
  const dragYMap = useRef<Record<string, Animated.Value>>({});
  const dragXMap = useRef<Record<string, Animated.Value>>({});
  const dragHandlersMap = useRef<Record<string, ReturnType<typeof PanResponder.create>>>({});
  const lastSwapDyRef = useRef(0);
  const grantDyRef = useRef(0);
  const grantDxRef = useRef(0);
  const longPressActiveRef = useRef(false);
  const DRAG_SWAP_THRESHOLD = 80;

  const getDragY = (id: string): Animated.Value => {
    if (!dragYMap.current[id]) dragYMap.current[id] = new Animated.Value(0);
    return dragYMap.current[id];
  };
  const getDragX = (id: string): Animated.Value => {
    if (!dragXMap.current[id]) dragXMap.current[id] = new Animated.Value(0);
    return dragXMap.current[id];
  };

  const rebuildTravelsAfterSwap = (newPlaces: PlaceEntry[]) => {
    setTravels((prev) => {
      if (newPlaces.length <= 1) return [];
      const result: TravelEntry[] = [];
      for (let i = 0; i < newPlaces.length - 1; i++) {
        const existing = prev.find((t) => t.fromId === newPlaces[i].id && t.toId === newPlaces[i + 1].id);
        result.push(existing || { fromId: newPlaces[i].id, toId: newPlaces[i + 1].id, duration: '', transport: 'À pied' });
      }
      return result;
    });
  };

  const handleLongPressPlace = useCallback((placeId: string) => {
    longPressActiveRef.current = true;
    setDraggingId(placeId);
    lastSwapDyRef.current = 0;
    grantDyRef.current = 0;
    grantDxRef.current = 0;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const getOrCreateDragHandlers = (placeId: string) => {
    if (dragHandlersMap.current[placeId]) return dragHandlersMap.current[placeId];
    const handler = PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: () => longPressActiveRef.current,
      onMoveShouldSetPanResponder: () => longPressActiveRef.current,
      onPanResponderTerminationRequest: () => !longPressActiveRef.current,
      onPanResponderGrant: (_, gs) => {
        grantDyRef.current = gs.dy;
        grantDxRef.current = gs.dx;
        lastSwapDyRef.current = 0;
      },
      onPanResponderMove: (_, gs) => {
        if (!longPressActiveRef.current) return;
        const relDy = gs.dy - grantDyRef.current;
        const relDx = gs.dx - grantDxRef.current;
        getDragY(placeId).setValue(relDy - lastSwapDyRef.current);
        getDragX(placeId).setValue(relDx * 0.4);
        const offset = relDy - lastSwapDyRef.current;
        const cur = placesRef.current;
        const idx = cur.findIndex((p) => p.id === placeId);
        if (offset > DRAG_SWAP_THRESHOLD && idx < cur.length - 1) {
          const next = [...cur];
          [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
          setPlaces(next);
          placesRef.current = next;
          rebuildTravelsAfterSwap(next);
          lastSwapDyRef.current = relDy;
          getDragY(placeId).setValue(0);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } else if (offset < -DRAG_SWAP_THRESHOLD && idx > 0) {
          const next = [...cur];
          [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
          setPlaces(next);
          placesRef.current = next;
          rebuildTravelsAfterSwap(next);
          lastSwapDyRef.current = relDy;
          getDragY(placeId).setValue(0);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      },
      onPanResponderRelease: () => {
        longPressActiveRef.current = false;
        Animated.parallel([
          Animated.spring(getDragY(placeId), { toValue: 0, useNativeDriver: true, friction: 8, tension: 100 }),
          Animated.spring(getDragX(placeId), { toValue: 0, useNativeDriver: true, friction: 8, tension: 100 }),
        ]).start();
        setDraggingId(null);
      },
      onPanResponderTerminate: () => {
        longPressActiveRef.current = false;
        Animated.parallel([
          Animated.spring(getDragY(placeId), { toValue: 0, useNativeDriver: true, friction: 8, tension: 100 }),
          Animated.spring(getDragX(placeId), { toValue: 0, useNativeDriver: true, friction: 8, tension: 100 }),
        ]).start();
        setDraggingId(null);
      },
    });
    dragHandlersMap.current[placeId] = handler;
    return handler;
  };

  // Helper: load a draft into form state
  const loadDraftIntoForm = useCallback((saved: ReturnType<typeof useDraftStore.getState>['drafts'][number]) => {
    setTitle(saved.title);
    setCoverPhotos(saved.coverPhotos);
    setSelectedTags(saved.selectedTags as CategoryTag[]);
    setPlaces((saved.places as any[]).map((p) => {
      let idx = p.priceRangeIndex ?? -1;
      if (idx < 0 && p.price) {
        const amount = parseInt(p.price, 10);
        if (!isNaN(amount)) {
          idx = PRICE_RANGES.findIndex((r) => amount >= r.min && (r.max === Infinity || amount <= r.max));
          if (idx < 0) idx = PRICE_RANGES.length - 1;
        }
      }
      return { ...p, priceRangeIndex: idx, exactPrice: p.exactPrice ?? '' };
    }) as PlaceEntry[]);
    setTravels(saved.travels as TravelEntry[]);
    setAuthorTip((saved as any).authorTip ?? '');
  }, []);

  // Helper: reset form to blank
  const resetForm = useCallback(() => {
    setTitle(''); setCoverPhotos([]); setSelectedTags([]); setPlaces([]); setTravels([]); setAuthorTip('');
    formRef.current = { title: '', coverPhotos: [], selectedTags: [], places: [], travels: [], authorTip: '' };
    setErrors({});
  }, []);

  // ── Detect route param changes (switching between plans) ──
  useEffect(() => {
    const newDraftId = route.params?.draftId;
    const newEditPlanId = route.params?.editPlanId;
    const resumeDraft = route.params?.resumeDraft;

    // Skip if params haven't changed
    if (newDraftId === draftIdRef.current && newEditPlanId === editPlanIdRef.current) {
      // Still handle resume sheet on re-focus for same plan
      if (resumeDraft && !draftRestoredRef.current) {
        draftRestoredRef.current = true;
        setShowResumeSheet(true);
        Animated.spring(resumeSheetSlide, { toValue: 0, friction: 9, tension: 50, useNativeDriver: true }).start();
      }
      return;
    }

    // ── New plan being edited — clean up old edit draft if switching plans ──
    const oldDraftId = draftIdRef.current;
    if (oldDraftId && oldDraftId !== newDraftId && oldDraftId.startsWith('edit-') && !oldDraftId.endsWith('-fresh')) {
      useDraftStore.getState().deleteDraft(oldDraftId);
      useDraftStore.getState().deleteDraft(oldDraftId + '-fresh');
    }

    // Update refs
    draftIdRef.current = newDraftId || 'draft-' + Date.now();
    editPlanIdRef.current = newEditPlanId;
    draftRestoredRef.current = true;
    toastShownRef.current = false;

    // Reset form before loading new draft
    resetForm();

    // Reset step to the FIRST active step of the (new) mode — sinon
    // si le user vient de finir un wizard "fresh" en step 5 puis revient
    // depuis Personnaliser (customize mode), il resterait à 5 alors qu'on
    // veut redémarrer à 2 (cover).
    const customizing = (newDraftId || '').startsWith('organize-');
    setStep(customizing ? 2 : 1);

    // Update activeCreateSession
    activeCreateSession.draftId = draftIdRef.current;

    if (resumeDraft) {
      // Show bottom sheet — let user choose resume or discard
      setShowResumeSheet(true);
      Animated.spring(resumeSheetSlide, { toValue: 0, friction: 9, tension: 50, useNativeDriver: true }).start();
    } else if (newDraftId) {
      const saved = useDraftStore.getState().getDraft(newDraftId);
      if (saved) loadDraftIntoForm(saved);
    }
  }, [route.params?.draftId, route.params?.editPlanId, route.params?.resumeDraft]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resume sheet handlers
  const handleResumeDraft = () => {
    Animated.timing(resumeSheetSlide, { toValue: 300, duration: 200, useNativeDriver: true }).start(() => setShowResumeSheet(false));
    const saved = useDraftStore.getState().getDraft(draftIdRef.current);
    if (saved) loadDraftIntoForm(saved);
  };

  const handleDiscardResume = () => {
    Animated.timing(resumeSheetSlide, { toValue: 300, duration: 200, useNativeDriver: true }).start(() => setShowResumeSheet(false));
    // Load fresh copy saved by PlanDetailModal
    const freshId = draftIdRef.current + '-fresh';
    const fresh = useDraftStore.getState().getDraft(freshId);
    if (fresh) {
      loadDraftIntoForm(fresh);
      // Replace the modified draft with fresh data
      useDraftStore.getState().saveDraft(draftIdRef.current, {
        title: fresh.title, coverPhotos: fresh.coverPhotos,
        selectedTags: fresh.selectedTags, places: fresh.places, travels: fresh.travels,
        authorTip: (fresh as any).authorTip ?? '',
      });
    }
    useDraftStore.getState().deleteDraft(freshId);
  };

  // Restore specific draft on initial mount only
  useEffect(() => {
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    const id = route.params?.draftId;
    if (!id) return;

    if (route.params?.resumeDraft) {
      // Show resume sheet instead of auto-loading
      setShowResumeSheet(true);
      Animated.spring(resumeSheetSlide, { toValue: 0, friction: 9, tension: 50, useNativeDriver: true }).start();
      return;
    }

    const saved = useDraftStore.getState().getDraft(id);
    if (!saved) return;
    loadDraftIntoForm(saved);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      const { title, coverPhotos, selectedTags, places, travels, authorTip } = formRef.current;
      const hasContent = title.length > 0 || places.length > 0 || selectedTags.length > 0 || coverPhotos.length > 0 || authorTip.length > 0;
      if (!hasContent) return;
      useDraftStore.getState().saveDraft(draftIdRef.current, { title, coverPhotos, selectedTags, places, travels, authorTip });
      // Show toast once per session
      if (!toastShownRef.current) {
        toastShownRef.current = true;
        setShowDraftToast(true);
        Animated.timing(draftToastAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        setTimeout(() => {
          Animated.timing(draftToastAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => setShowDraftToast(false));
        }, 2000);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save on blur as safety net
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      if (isSuccess || isPublishing) return;
      const { title, coverPhotos, selectedTags, places, travels, authorTip } = formRef.current;
      const hasContent = title.length > 0 || places.length > 0 || selectedTags.length > 0 || coverPhotos.length > 0 || authorTip.length > 0;
      if (hasContent) {
        useDraftStore.getState().saveDraft(draftIdRef.current, { title, coverPhotos, selectedTags, places, travels, authorTip });
      }
    });
    return unsubscribe;
  }, [navigation, isSuccess, isPublishing]);

  // Track content on shared module-level object so BottomTabNavigator can check
  useEffect(() => {
    activeCreateSession.draftId = draftIdRef.current;
    activeCreateSession.saveForm = () => {
      const { title, coverPhotos, selectedTags, places, travels, authorTip } = formRef.current;
      useDraftStore.getState().saveDraft(draftIdRef.current, { title, coverPhotos, selectedTags, places, travels, authorTip });
    };
    activeCreateSession.discardForm = () => {
      resetForm();
      activeCreateSession.hasContent = false;
      useDraftStore.getState().deleteDraft(draftIdRef.current);
      useDraftStore.getState().deleteDraft(draftIdRef.current + '-fresh');
    };
    return () => {
      activeCreateSession.hasContent = false;
      activeCreateSession.draftId = '';
      activeCreateSession.saveForm = null;
      activeCreateSession.discardForm = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep hasContent in sync on every render (cheap assignment)
  useEffect(() => {
    const has = title.length > 0 || places.length > 0 || selectedTags.length > 0 || coverPhotos.length > 0;
    activeCreateSession.hasContent = has && !isSuccess && !isPublishing;
  });

  // ── Show "Pick up where you left off?" when returning with no specific draft ──
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      // Only show when opening a fresh form (no explicit draftId from params)
      if (route.params?.draftId || route.params?.editPlanId) return;
      // Don't show if form already has content
      const { title: t, places: p, selectedTags: st, coverPhotos: cp } = formRef.current;
      if (t.length > 0 || p.length > 0 || st.length > 0 || cp.length > 0) return;

      const { drafts, dismissedPickupIds } = useDraftStore.getState();
      const allDrafts = drafts
        .filter((d) => !d.id.startsWith('edit-') && !d.id.endsWith('-fresh'))
        .filter((d) => d.title.length > 0 || d.places.length > 0)
        .filter((d) => !dismissedPickupIds.includes(d.id))
        .sort((a, b) => b.updatedAt - a.updatedAt);

      if (allDrafts.length === 0) return;

      const latest = allDrafts[0];
      setPickupDraft(latest);
      pickupSheetSlide.setValue(300);
      Animated.spring(pickupSheetSlide, { toValue: 0, friction: 9, tension: 50, useNativeDriver: true }).start();
    });
    return unsubscribe;
  }, [navigation, route.params?.draftId, route.params?.editPlanId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePickupResume = () => {
    if (!pickupDraft) return;
    // Mark this draft as dismissed so the sheet never re-appears for it
    useDraftStore.getState().dismissPickup(pickupDraft.id);
    Animated.timing(pickupSheetSlide, { toValue: 300, duration: 200, useNativeDriver: true }).start(() => setPickupDraft(null));
    // Switch to the draft's ID so future saves go to the right slot
    draftIdRef.current = pickupDraft.id;
    activeCreateSession.draftId = pickupDraft.id;
    loadDraftIntoForm(pickupDraft);
  };

  const handlePickupNew = () => {
    if (pickupDraft) {
      // Mark this draft as dismissed so the sheet never re-appears for it
      useDraftStore.getState().dismissPickup(pickupDraft.id);
    }
    Animated.timing(pickupSheetSlide, { toValue: 300, duration: 200, useNativeDriver: true }).start(() => setPickupDraft(null));
    // Keep the fresh draftId — user starts a brand-new plan
    // The old draft remains saved in Drafts for manual retrieval from the profile
  };

  // ========== PREVIEW ==========
  const [showPreview, setShowPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState<'card' | 'detail'>('card');

  // ========== PHOTO PICKER ==========
  const readFileAsDataUrl = (file: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const uploadPhoto = async (dataUrl: string): Promise<string> => {
    const filename = `plans/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
    const storageRef = ref(storage, filename);
    await uploadString(storageRef, dataUrl, 'data_url');
    return getDownloadURL(storageRef);
  };

  // Single-photo picker — replaces the unique cover photo (step 2 UX).
  // Goes through the Proof Camera now (branded fullscreen capture +
  // filter editor). The output is already filtered + JPEG-encoded.
  const pickSingleCoverPhoto = async () => {
    const picked = await proofCamera.open();
    if (!picked) return;
    setIsUploadingPhotos(true);
    try {
      const url = await uploadPhoto(picked.dataUrl);
      setCoverPhotos([url]);
    } catch (err) {
      console.error('Photo upload error:', err);
      Alert.alert('Erreur', "Impossible d'uploader la photo.");
    } finally {
      setIsUploadingPhotos(false);
    }
  };

  const pickPhotos = async () => {
    // Multi-select is library-only by nature (cameras capture one at a time).
    // Use pickMultipleImages which handles web + native uniformly.
    const picked = await pickMultipleImages({ max: 7 - coverPhotos.length, quality: 0.7 });
    if (picked.length === 0) return;

    setIsUploadingPhotos(true);
    try {
      const urls: string[] = [];
      for (const img of picked) {
        urls.push(await uploadPhoto(img.dataUrl));
      }
      setCoverPhotos((prev) => [...prev, ...urls].slice(0, 7));
    } catch (err) {
      console.error('Photo upload error:', err);
      Alert.alert('Erreur', "Impossible d'uploader les photos. Vérifiez les règles Firebase Storage.");
    } finally {
      setIsUploadingPhotos(false);
    }
  };

  const removePhoto = (index: number) => {
    setCoverPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const [editingPhotoIdx, setEditingPhotoIdx] = useState<number | null>(null);

  // Place picker state
  const [showPlacePicker, setShowPlacePicker] = useState(false);
  const [placeSearch, setPlaceSearch] = useState('');
  const [placeResults, setPlaceResults] = useState<GooglePlaceAutocomplete[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Place customization state
  const [showCustomize, setShowCustomize] = useState(false);
  const [pendingPlace, setPendingPlace] = useState<PlaceEntry | null>(null);
  const [pendingPlacePhoto, setPendingPlacePhoto] = useState<string | null>(null);
  const [customPhoto, setCustomPhoto] = useState('');
  const [customComment, setCustomComment] = useState('');
  const [customQAs, setCustomQAs] = useState<QAPair[]>([]);
  const [activeQAPicker, setActiveQAPicker] = useState<number | null>(null);
  const [placeQuestions, setPlaceQuestions] = useState<string[]>([]);
  const [editingPlaceIndex, setEditingPlaceIndex] = useState<number | null>(null);

  // ── Type-specific question banks ──
  const QUESTIONS_BY_TYPE: Record<string, string[]> = {
    food: [
      'Quel est ton plat préféré ici ?',
      'Qu\'est-ce que tu commanderais les yeux fermés ?',
      'Le service est comment ?',
      'Tu réserves ou tu tentes ta chance ?',
      'Plutôt déjeuner ou dîner ici ?',
      'Un plat à absolument éviter ?',
      'Idéal pour quel type d\'occasion ?',
      'La taille des portions, ça donne quoi ?',
    ],
    cafe: [
      'Le café est bon ? Note sur 10',
      'Tu y vas pour bosser ou chiller ?',
      'Le wifi est fiable ?',
      'Ton drink préféré ici ?',
      'Les pâtisseries valent le coup ?',
      'Il y a des prises pour charger ?',
      'C\'est calme ou animé ?',
    ],
    bar: [
      'Quel est le meilleur cocktail ?',
      'L\'ambiance en soirée, ça donne quoi ?',
      'Happy hour : oui ou non ?',
      'Plutôt before ou after ici ?',
      'La terrasse vaut le coup ?',
      'La musique est comment ?',
      'Tu y vas pour boire ou pour l\'ambiance ?',
      'Le dress code ?',
    ],
    culture: [
      'Combien de temps prévoir pour la visite ?',
      'Ça vaut le prix d\'entrée ?',
      'Le must-see absolu à ne pas rater ?',
      'Audio-guide ou visite libre ?',
      'C\'est adapté pour les enfants ?',
      'Le meilleur moment pour éviter la foule ?',
      'La boutique souvenir vaut le détour ?',
    ],
    sport: [
      'L\'équipement est en bon état ?',
      'Le tarif est raisonnable ?',
      'Il faut réserver en avance ?',
      'C\'est adapté pour les débutants ?',
      'L\'ambiance est compétitive ou détendue ?',
      'Les vestiaires sont propres ?',
      'Quel est le meilleur créneau horaire ?',
    ],
    shopping: [
      'Ton coup de cœur dans la boutique ?',
      'Le rapport qualité-prix ?',
      'C\'est mieux en période de soldes ?',
      'Le personnel est accueillant ?',
      'Tu y vas pour quoi en général ?',
      'Des marques ou des créateurs ?',
    ],
    nature: [
      'C\'est mieux en été ou en hiver ?',
      'Le spot parfait pour quel mood ?',
      'Combien de temps tu y resterais ?',
      'C\'est calme ou il y a du monde ?',
      'Le meilleur moment de la journée ?',
      'Idéal pour un picnic ?',
      'Tu y vas seul ou accompagné ?',
    ],
    hotel: [
      'Le confort de la chambre ?',
      'Le petit-déjeuner vaut le coup ?',
      'Le rapport qualité-prix en toute honnêteté ?',
      'Le personnel est accueillant ?',
      'La vue depuis la chambre ?',
      'Les espaces communs sont comment ?',
      'Tu y retournerais ?',
    ],
    generic: [
      'Un conseil pour ceux qui y vont ?',
      'Qu\'est-ce qui rend cet endroit unique ?',
      'À quel moment de la journée y aller ?',
      'Un souvenir marquant ici ?',
      'Tu y vas plutôt solo ou accompagné ?',
      'Le spot parfait pour quel mood ?',
      'Combien de temps tu resterais ici ?',
      'C\'est quoi l\'ambiance en un mot ?',
      'Le truc que personne ne sait sur cet endroit ?',
      'Première chose qui t\'a marqué en arrivant ?',
      'Tu conseillerais pour un premier date ?',
      'Le meilleur moment pour éviter la foule ?',
      'Ça vaut le détour depuis l\'autre bout de Paris ?',
      'Si tu devais y emmener un touriste, pourquoi ?',
      'Le rapport qualité-prix en toute honnêteté ?',
      'Une anecdote ou fun fact sur ce lieu ?',
    ],
  };

  const getQuestionsForPlace = (types: string[]): string[] => {
    let cat = 'generic';
    for (const t of types) {
      if (['restaurant', 'food', 'meal_delivery', 'meal_takeaway'].includes(t)) { cat = 'food'; break; }
      if (['cafe', 'bakery'].includes(t)) { cat = 'cafe'; break; }
      if (['bar', 'night_club'].includes(t)) { cat = 'bar'; break; }
      if (['museum', 'art_gallery', 'library', 'church', 'tourist_attraction'].includes(t)) { cat = 'culture'; break; }
      if (['gym', 'spa', 'stadium'].includes(t)) { cat = 'sport'; break; }
      if (['clothing_store', 'book_store', 'shopping_mall', 'store'].includes(t)) { cat = 'shopping'; break; }
      if (['park', 'campground', 'natural_feature'].includes(t)) { cat = 'nature'; break; }
      if (['lodging'].includes(t)) { cat = 'hotel'; break; }
    }
    const specific = QUESTIONS_BY_TYPE[cat] || [];
    const generic = QUESTIONS_BY_TYPE.generic;
    const all = [...specific];
    generic.forEach((q) => { if (!all.includes(q)) all.push(q); });
    return all;
  };

  type BlockType = 'photo' | 'comment' | 'question';
  const [blockOrder, setBlockOrder] = useState<BlockType[]>(['photo', 'comment', 'question']);
  const [isReordering, setIsReordering] = useState(false);

  const moveBlock = (index: number, dir: 'up' | 'down') => {
    const target = dir === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= blockOrder.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBlockOrder((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const clearBlock = (type: BlockType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (type === 'photo') setCustomPhoto('');
    if (type === 'comment') setCustomComment('');
    if (type === 'question') {
      const q = placeQuestions.length > 0 ? placeQuestions[Math.floor(Math.random() * placeQuestions.length)] : '';
      setCustomQAs([{ question: q, answer: '' }]);
      setActiveQAPicker(null);
    }
  };

  const handlePlaceSearch = useCallback((query: string) => {
    setPlaceSearch(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (query.length < 2) { setPlaceResults([]); return; }
    setIsSearchingPlaces(true);
    searchTimerRef.current = setTimeout(async () => {
      const results = await searchPlacesAutocomplete(query, CITY_CENTER, cityConfig.countryCode);
      setPlaceResults(results);
      setIsSearchingPlaces(false);
    }, 350);
  }, [CITY_CENTER, cityConfig.countryCode]);

  const selectGooglePlace = useCallback(async (item: GooglePlaceAutocomplete) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const type = getReadableType(item.types);
    const newPlace: PlaceEntry = {
      id: item.placeId,
      googlePlaceId: item.placeId,
      name: item.name,
      type,
      address: item.address,
      placeTypes: item.types,
      priceRangeIndex: -1,
      exactPrice: '',
      price: '',
      duration: '',
    };

    // Close search, open customization screen
    setShowPlacePicker(false);
    setPlaceSearch('');
    setPlaceResults([]);

    // Fetch place photo for the customization screen
    const questions = getQuestionsForPlace(item.types);
    setPlaceQuestions(questions);
    setPendingPlace(newPlace);
    setPendingPlacePhoto(null);
    setCustomPhoto('');
    setCustomComment('');
    setCustomQAs([{ question: questions[Math.floor(Math.random() * questions.length)], answer: '' }]);
    setActiveQAPicker(null);
    setShowCustomize(true);

    // Fetch photo in background
    try {
      const details = await getPlaceDetails(item.placeId);
      if (details?.photoUrls?.[0]) {
        setPendingPlacePhoto(details.photoUrls[0]);
        setPendingPlace((prev) => prev ? { ...prev, previewPhotoUrl: details.photoUrls[0] } : prev);
      }
    } catch {}
  }, []);

  const editPlaceCustomization = useCallback(async (index: number) => {
    const place = places[index];
    setEditingPlaceIndex(index);
    setPendingPlace(place);
    setCustomPhoto(place.customPhoto || '');
    setCustomComment(place.comment || '');
    const questions = getQuestionsForPlace(place.placeTypes || []);
    setPlaceQuestions(questions);
    // Load existing QAs
    if (place.questions && place.questions.length > 0) {
      setCustomQAs(place.questions.map((q) => ({ ...q })));
    } else if (place.questionAnswer && place.question) {
      setCustomQAs([{ question: place.question, answer: place.questionAnswer }]);
    } else {
      setCustomQAs([{ question: questions[Math.floor(Math.random() * questions.length)], answer: '' }]);
    }
    setActiveQAPicker(null);
    setBlockOrder(['photo', 'comment', 'question']);
    setIsReordering(false);
    setPendingPlacePhoto(null);
    setShowCustomize(true);
    // Fetch photo in background
    if (place.googlePlaceId) {
      try {
        const details = await getPlaceDetails(place.googlePlaceId);
        if (details?.photoUrls?.[0]) setPendingPlacePhoto(details.photoUrls[0]);
      } catch {}
    }
  }, [places]);

  const confirmPlace = useCallback(() => {
    if (!pendingPlace) return;
    const filledQAs = customQAs.filter((qa) => qa.answer.trim().length > 0);
    const placeWithCustom: PlaceEntry = {
      ...pendingPlace,
      customPhoto: customPhoto || undefined,
      comment: customComment || undefined,
      // Backward compat: first filled QA
      questionAnswer: filledQAs[0]?.answer || undefined,
      question: filledQAs[0]?.answer ? filledQAs[0].question : undefined,
      questions: filledQAs.length > 0 ? filledQAs : undefined,
      previewPhotoUrl: pendingPlace.previewPhotoUrl || pendingPlacePhoto || undefined,
    };

    if (editingPlaceIndex !== null) {
      // Editing existing place — update in-place
      setPlaces((prev) => prev.map((p, i) => i === editingPlaceIndex ? { ...p, ...placeWithCustom } : p));
    } else {
      // Adding new place
      const newPlaces = [...places, placeWithCustom];
      setPlaces(newPlaces);

      if (places.length > 0) {
        const prevPlace = places[places.length - 1];
        const defaultTransport: TransportMode = 'À pied';
        setTravels((prev) => [
          ...prev,
          { fromId: prevPlace.id, toId: pendingPlace.id, duration: '...', transport: defaultTransport },
        ]);
        computeTravelDuration(prevPlace.id, pendingPlace.id, defaultTransport).then((mins) => {
          if (mins !== null) {
            setTravels((prev) => prev.map((t) =>
              t.fromId === prevPlace.id && t.toId === pendingPlace.id ? { ...t, duration: String(mins) } : t
            ));
          } else {
            setTravels((prev) => prev.map((t) =>
              t.fromId === prevPlace.id && t.toId === pendingPlace.id && t.duration === '...' ? { ...t, duration: '' } : t
            ));
          }
        });
      }
    }

    setShowCustomize(false);
    setPendingPlace(null);
    setEditingPlaceIndex(null);
  }, [pendingPlace, places, customPhoto, customComment, customQAs, editingPlaceIndex]);

  const pickCustomPhoto = useCallback(async () => {
    // Spot photo per place — 4:3 aspect to match the editorial card
    // layout. Proof Camera handles the crop + filters in one fullscreen
    // step (replaces the legacy "allowsEditing: true" system crop).
    const picked = await proofCamera.open({ aspect: [4, 3] });
    if (picked) setCustomPhoto(picked.dataUrl);
  }, [proofCamera]);

  const toggleTag = (tag: CategoryTag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // ========== AUTO-CALCULATED TOTALS ==========
  const { totalPriceMin, totalPriceMax, totalPriceExact } = useMemo(() => {
    let tMin = 0, tMax = 0, tExact = 0;
    let hasExact = false;
    for (const p of places) {
      const exact = parseInt(p.exactPrice, 10);
      if (!isNaN(exact) && exact > 0) {
        tMin += exact; tMax += exact; tExact += exact; hasExact = true;
      } else if (p.priceRangeIndex >= 0) {
        const range = PRICE_RANGES[p.priceRangeIndex];
        tMin += range.min;
        tMax += range.max === Infinity ? range.min * 2 : range.max;
        tExact += Math.round((range.min + (range.max === Infinity ? range.min * 2 : range.max)) / 2);
      }
    }
    return { totalPriceMin: tMin, totalPriceMax: tMax, totalPriceExact: hasExact ? tExact : tExact };
  }, [places]);

  const totalPrice = totalPriceExact; // backward compat for preview/publish

  const formatPriceRange = useCallback((cur: string) => {
    if (totalPriceMin === 0 && totalPriceMax === 0) return `Free ✦`;
    if (totalPriceMin === totalPriceMax) return `~${totalPriceMin}${cur}`;
    return `${totalPriceMin}–${totalPriceMax}${cur}`;
  }, [totalPriceMin, totalPriceMax]);

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

  // ========== BUILD PREVIEW PLAN ==========
  const buildPreviewPlan = useCallback((): Plan => {
    const previewPlaces = places.map((p) => ({
      id: p.id,
      googlePlaceId: p.googlePlaceId,
      name: p.name,
      type: p.type,
      address: p.address || '',
      rating: 0,
      reviewCount: 0,
      ratingDistribution: [0, 0, 0, 0, 0] as [number, number, number, number, number],
      reviews: [] as any[],
      photoUrls: [p.customPhoto, p.previewPhotoUrl].filter(Boolean) as string[],
      placePrice: parseInt(p.price, 10) || 0,
      placeDuration: parseInt(p.duration, 10) || 0,
      customPhoto: p.customPhoto,
      comment: p.comment,
      question: p.question,
      questionAnswer: p.questionAnswer,
      questions: p.questions,
      ...(p.reservationRecommended && { reservationRecommended: true }),
    }));
    const travelSegs = travels.map((tr) => ({
      fromPlaceId: tr.fromId,
      toPlaceId: tr.toId,
      duration: parseInt(tr.duration, 10) || 0,
      transport: tr.transport,
    }));
    return {
      id: 'preview',
      authorId: user?.id ?? '',
      author: user ?? { id: '', username: '', displayName: 'Toi', initials: '?', avatarBg: Colors.primary, avatarColor: Colors.textOnAccent, badgeType: 'none' as any, isPrivate: false, xpPoints: 0, coins: 0, level: 1, xpForNextLevel: 100, rank: 'Explorateur', planCount: 0, followersCount: 0, followingCount: 0, likesReceived: 0, unlockedBadges: [], createdAt: new Date().toISOString() },
      title: title || 'Mon plan',
      gradient: 'linear-gradient(135deg, #FF9A60, #FF6B35, #C94520)',
      tags: selectedTags,
      places: previewPlaces,
      travelSegments: travelSegs,
      price: formatPriceRange(cityConfig.currency),
      duration: formatDuration(totalDuration),
      transport: mainTransport,
      coverPhotos,
      city: cityConfig.name,
      likesCount: 0,
      commentsCount: 0,
      proofCount: 0,
      declinedCount: 0,
      xpReward: 0,
      createdAt: new Date().toISOString(),
      timeAgo: 'À l\'instant',
    };
  }, [title, selectedTags, places, travels, coverPhotos, totalPrice, totalDuration, mainTransport, user, cityConfig.name, formatPriceRange]);

  // ========== QUALITY SCORE (0–100) ==========
  const qualityScore = useMemo(() => {
    let score = 0;
    if (title.trim().length > 0) score += 15;           // titre
    if (selectedTags.length > 0) score += 10;            // 1 catégorie
    if (places.length >= 1) score += 10;                 // 1er lieu
    if (places.length >= 2) score += 15;                 // 2e lieu
    if (coverPhotos.length > 0) score += 10;             // 1 photo de couverture
    const hasBudget = places.some((p) => p.priceRangeIndex >= 0);
    if (hasBudget) score += 10;                          // prix renseigné
    const hasDuration = places.some((p) => p.duration && parseInt(p.duration, 10) > 0);
    if (hasDuration) score += 10;                        // durée renseignée
    const hasWidget = places.some((p) => p.customPhoto || p.comment || p.questionAnswer || (p.questions && p.questions.length > 0));
    if (hasWidget) score += 20;                          // 1 widget perso sur 1 lieu
    return Math.min(score, 100);
  }, [title, selectedTags, places, travels, coverPhotos]);

  const [showPublishSheet, setShowPublishSheet] = useState(false);
  const sheetSlide = useRef(new Animated.Value(300)).current;
  // Publish fly-away animation
  const publishTranslateY = useRef(new Animated.Value(0)).current;
  const publishScale = useRef(new Animated.Value(1)).current;
  const publishOpacity = useRef(new Animated.Value(1)).current;
  const [isFlying, setIsFlying] = useState(false);

  // Validation finale pour publier. En mode customize (depuis Organize),
  // le user a déjà vécu le plan IRL — peu importe s'il y a 1 ou 5 lieux,
  // ça reflète sa réalité. Donc on relâche la contrainte places.length >= 2
  // (qui n'a de sens qu'en construction depuis zéro).
  const _isCustomizing = ((route.params?.draftId || '') as string).startsWith('organize-');
  const _placeCountOk = _isCustomizing ? places.length >= 1 : places.length >= 2;
  const canPublish =
    title.trim().length > 0 &&
    coverPhotos.length > 0 &&
    selectedTags.length > 0 &&
    _placeCountOk &&
    authorTip.trim().length >= TIP_MIN_CHARS;

  // Missing criteria for bottom sheet
  const missingCriteria = useMemo(() => {
    const list: { icon: string; text: string; pts: number }[] = [];
    if (!places.some((p) => p.customPhoto || p.comment || p.questionAnswer || (p.questions && p.questions.length > 0))) list.push({ icon: '\uD83D\uDCA1', text: 'Personnaliser un lieu', pts: 20 });
    if (!places.some((p) => p.price && parseInt(p.price, 10) > 0)) list.push({ icon: '\uD83D\uDCB0', text: 'Le budget', pts: 10 });
    if (!places.some((p) => p.duration && parseInt(p.duration, 10) > 0)) list.push({ icon: '\u23F1', text: 'La durée', pts: 10 });
    return list.filter((c) => c.pts >= 5).slice(0, 3);
  }, [places]);

  const openPublishSheet = () => {
    setShowPublishSheet(true);
    Animated.spring(sheetSlide, { toValue: 0, friction: 9, tension: 50, useNativeDriver: true }).start();
  };
  const closePublishSheet = () => {
    Animated.timing(sheetSlide, { toValue: 300, duration: 200, useNativeDriver: true }).start(() => setShowPublishSheet(false));
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
  const updatePlacePriceRange = (id: string, rangeIndex: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlaces((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const range = PRICE_RANGES[rangeIndex];
      const mid = range.max === Infinity ? range.min : Math.round((range.min + range.max) / 2);
      return { ...p, priceRangeIndex: rangeIndex, exactPrice: '', price: String(mid) };
    }));
  };

  const updatePlaceExactPrice = (id: string, value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '');
    setPlaces((prev) => prev.map((p) => p.id === id ? { ...p, exactPrice: cleaned, price: cleaned || String(PRICE_RANGES[p.priceRangeIndex]?.min || 0) } : p));
  };

  const [showExactPrice, setShowExactPrice] = useState<Record<string, boolean>>({});

  // ── Timeline (Step 4) interaction state ──
  const [expandedPlaceId, setExpandedPlaceId] = useState<string | null>(null);
  const [expandedTravelIdx, setExpandedTravelIdx] = useState<number | null>(null);
  const [visibility, setVisibility] = useState<'public' | 'friends' | 'private'>('public');
  const [showVisibilitySheet, setShowVisibilitySheet] = useState(false);

  const togglePlaceExpand = useCallback((id: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setExpandedPlaceId((prev) => (prev === id ? null : id));
    setExpandedTravelIdx(null);
  }, []);

  const toggleTravelExpand = useCallback((idx: number) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setExpandedTravelIdx((prev) => (prev === idx ? null : idx));
    setExpandedPlaceId(null);
  }, []);

  const DURATION_PRESETS = ['15', '30', '45', '60', '90', '120', '180'];
  const formatDurationLabel = (min: string) => {
    const n = parseInt(min, 10);
    if (n < 60) return `${n}min`;
    const h = Math.floor(n / 60);
    const m = n % 60;
    return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
  };

  const updatePlaceDuration = (id: string, value: string) => {
    setPlaces((prev) => prev.map((p) => p.id === id ? { ...p, duration: p.duration === value ? '' : value } : p));
  };

  const toggleReservation = (id: string) => {
    setPlaces((prev) => prev.map((p) => p.id === id ? { ...p, reservationRecommended: !p.reservationRecommended } : p));
  };

  const updateTravelDuration = (index: number, value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '');
    setTravels((prev) => prev.map((t, i) => i === index ? { ...t, duration: cleaned } : t));
  };

  const updateTravelTransport = (index: number, mode: TransportMode) => {
    setTravels((prev) => prev.map((t, i) => i === index ? { ...t, transport: mode, duration: '...' } : t));
    // Auto-compute new travel duration
    const travel = travels[index];
    if (travel) {
      computeTravelDuration(travel.fromId, travel.toId, mode).then((mins) => {
        setTravels((prev) => prev.map((t, i) => {
          if (i !== index) return t;
          if (mins !== null) return { ...t, duration: String(mins) };
          return { ...t, duration: '' };
        }));
      });
    }
  };

  // ========== VALIDATION ==========
  const validate = (): { ok: boolean; errors: Record<string, string> } => {
    const e: Record<string, string> = {};
    // En customize mode (depuis Organize), beaucoup de checks doivent être
    // relâchés : places.length peut être 1, les travels arrivent vides
    // (le mode de transport est figé en amont par Organize, pas saisi
    // par segment). Sans ce relâchement, validate() bloque silencieusement
    // le publish (Alert.alert n'apparaît pas sur web → bouton 'inerte').
    const isCustomizing = ((route.params?.draftId || '') as string).startsWith('organize-');

    if (title.length < 5) e.title = t.create_error_title;
    if (coverPhotos.length === 0) e.cover = 'Une photo de présentation est obligatoire';
    if (selectedTags.length === 0) e.tags = t.create_error_tags;
    if (!isCustomizing && places.length < 2) e.places = t.create_error_places;
    if (isCustomizing && places.length < 1) e.places = t.create_error_places;

    // Check each place has valid price range + duration. canProceedFromStep
    // a déjà gated cette étape donc en théorie toujours OK, mais on garde
    // un sanity check pour ne rien laisser passer à Firestore.
    places.forEach((p, i) => {
      if (p.priceRangeIndex < 0) e[`place_price_${i}`] = t.create_error_numbers_only;
      if (!p.duration || isNaN(parseInt(p.duration, 10))) e[`place_duration_${i}`] = t.create_error_numbers_only;
    });

    // Travels — pas de saisie en customize (Organize donne juste un mode
    // global, pas par segment). On skip la validation.
    if (!isCustomizing) {
      travels.forEach((tr, i) => {
        if (tr.duration === '...') e[`travel_duration_${i}`] = (t as any).create_travel_loading || 'Calcul en cours...';
        else if (!tr.duration || isNaN(parseInt(tr.duration, 10))) e[`travel_duration_${i}`] = t.create_error_numbers_only;
      });
    }

    setErrors(e);
    if (Object.keys(e).length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // Web : Alert.alert ne montre pas toujours de popup → on log
      // explicitement pour aider au debug + on affiche le 1er.
      console.warn('[CreateScreen] validate() failed:', e);
    }
    return { ok: Object.keys(e).length === 0, errors: e };
  };

  const doPublish = async () => {
    try {
      const travelSegments: TravelSegment[] = travels.map((tr) => ({
        fromPlaceId: tr.fromId,
        toPlaceId: tr.toId,
        duration: parseInt(tr.duration, 10),
        transport: tr.transport,
      }));

      // Fetch Google Place photos for each place (for fallback carousel)
      const placesWithPhotos = await Promise.all(
        places.map(async (p) => {
          let photoUrls: string[] = [];
          let details: any = null;
          if (p.googlePlaceId) {
            try {
              details = await getPlaceDetails(p.googlePlaceId);
              if (details && details.photoUrls.length > 0) {
                photoUrls = details.photoUrls.slice(0, 2);
              }
            } catch {}
          }
          // Upload custom photo to Firebase Storage if present
          let customPhotoUrl: string | undefined;
          if (p.customPhoto) {
            try { customPhotoUrl = await uploadPhoto(p.customPhoto); } catch {}
          }
          return {
            id: p.id,
            googlePlaceId: p.googlePlaceId,
            name: p.name,
            type: p.type,
            address: p.address || 'Paris, France',
            rating: details?.rating || 0,
            reviewCount: details?.reviewCount || 0,
            ratingDistribution: [0, 0, 0, 0, 0] as [number, number, number, number, number],
            reviews: [],
            photoUrls,
            latitude: details?.latitude || undefined,
            longitude: details?.longitude || undefined,
            placePrice: parseInt(p.price, 10) || 0,
            placeDuration: parseInt(p.duration, 10) || 0,
            ...(customPhotoUrl && { customPhoto: customPhotoUrl }),
            ...(p.comment && { comment: p.comment }),
            ...(p.question && { question: p.question }),
            ...(p.questionAnswer && { questionAnswer: p.questionAnswer }),
            ...(p.questions && p.questions.length > 0 && { questions: p.questions }),
            ...(p.reservationRecommended && { reservationRecommended: true }),
          };
        })
      );

      const planPayload = {
        title,
        tags: selectedTags,
        places: placesWithPhotos,
        price: formatPriceRange(cityConfig.currency),
        duration: formatDuration(totalDuration),
        transport: mainTransport,
        travelSegments,
        coverPhotos,
        city: cityConfig.name,
        authorTip: authorTip.trim(),
      };

      if (isEditing && editPlanIdRef.current) {
        // Update existing plan
        await updatePlan(editPlanIdRef.current, planPayload);
        // Refresh feed with updated data
        useFeedStore.setState((s) => ({
          plans: s.plans.map((p) =>
            p.id === editPlanIdRef.current
              ? { ...p, ...planPayload, places: placesWithPhotos }
              : p
          ),
        }));
        trackEvent('plan_edited', { planId: editPlanIdRef.current, title });
      } else {
        const newPlan = await createPlan(planPayload, user);
        addPlan(newPlan);
        addCreatedPlan(newPlan);
        trackEvent('plan_created', { title, tags_count: selectedTags.length, places_count: places.length, transport: mainTransport });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      useDraftStore.getState().deleteDraft(draftIdRef.current);
      useDraftStore.getState().deleteDraft(draftIdRef.current + '-fresh');
      setIsSuccess(true);
    } catch {
      // Reset animation on error so UI comes back
      publishTranslateY.setValue(0);
      publishScale.setValue(1);
      publishOpacity.setValue(1);
      setIsFlying(false);
      Alert.alert(t.error, t.create_error_publish);
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePublish = async () => {
    if (!user) return;
    const { ok, errors: e } = validate();
    if (!ok) {
      // Surface the first error instead of failing silently.
      const firstError = Object.values(e)[0] || t.create_error_publish;
      Alert.alert(t.error, firstError);
      return;
    }
    setIsPublishing(true);
    setIsFlying(true);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const screenH = Dimensions.get('window').height;

    // Phase 1: slight scale down + lift
    Animated.parallel([
      Animated.timing(publishScale, { toValue: 0.92, duration: 200, useNativeDriver: true }),
      Animated.timing(publishTranslateY, { toValue: -10, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      // Phase 2: fly up and fade out
      Animated.parallel([
        Animated.timing(publishTranslateY, { toValue: -screenH, duration: 450, useNativeDriver: true }),
        Animated.timing(publishScale, { toValue: 0.7, duration: 450, useNativeDriver: true }),
        Animated.timing(publishOpacity, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]).start(() => {
        doPublish();
      });
    });
  };

  // ========== SUCCESS SCREEN ==========
  if (isSuccess) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
        <View style={styles.successContainer}>
          <Text style={styles.successEmoji}>{isEditing ? '✅' : '🎉'}</Text>
          <Text style={[styles.successTitle, { color: C.black }]}>{isEditing ? 'Plan modifié !' : t.create_success_title}</Text>
          <Text style={[styles.successDesc, { color: C.gray700 }]}>{isEditing ? 'Tes modifications sont en ligne.' : t.create_success_desc}</Text>
          <PrimaryButton label={t.create_success_back} onPress={() => {
            setIsSuccess(false); setTitle(''); setSelectedTags([]); setPlaces([]); setTravels([]);
            publishTranslateY.setValue(0); publishScale.setValue(1); publishOpacity.setValue(1); setIsFlying(false);
            navigation.navigate('FeedTab');
          }} />
        </View>
      </View>
    );
  }

  // ========== RENDER TIMELINE (editorial vertical timeline) ==========
  const renderPlaceExpanded = (place: PlaceEntry, index: number) => {
    const hasCustom = !!(place.customPhoto || place.comment || place.questionAnswer || (place.questions && place.questions.length > 0));
    const priceLabel = place.priceRangeIndex >= 0
      ? (() => {
          const r = PRICE_RANGES[place.priceRangeIndex];
          return r.max === 0 ? r.label : r.max === Infinity ? `${r.min}${cityConfig.currency}+` : `${r.label}${cityConfig.currency}`;
        })()
      : null;
    return (
      <View style={styles.tlExpanded}>
        {/* PRIX — bouton qui ouvre le PricePickerSheet (système de
            référence pour tous les flows de saisie de prix dans l'app). */}
        <Text style={styles.tlFieldLabel}>PRIX ({cityConfig.currency})</Text>
        <TouchableOpacity
          style={[
            styles.tlPickerBtn,
            place.priceRangeIndex >= 0 && styles.tlPickerBtnFilled,
          ]}
          onPress={() => setPricePickerPlaceId(place.id)}
          activeOpacity={0.85}
        >
          <Ionicons
            name={place.priceRangeIndex >= 0 ? 'wallet' : 'wallet-outline'}
            size={15}
            color={place.priceRangeIndex >= 0 ? Colors.terracotta700 : Colors.primary}
          />
          <Text style={[
            styles.tlPickerBtnText,
            place.priceRangeIndex >= 0 && styles.tlPickerBtnTextFilled,
          ]}>
            {priceLabel ?? 'Choisir une fourchette'}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={14}
            color={place.priceRangeIndex >= 0 ? Colors.terracotta700 : Colors.primary}
          />
        </TouchableOpacity>
        {place.priceRangeIndex >= 0 && !showExactPrice[place.id] && (
          <TouchableOpacity
            onPress={() => setShowExactPrice((prev) => ({ ...prev, [place.id]: true }))}
            style={{ marginTop: 8 }}
            activeOpacity={0.7}
          >
            <Text style={styles.tlGhostLink}>Préciser le montant</Text>
          </TouchableOpacity>
        )}
        {showExactPrice[place.id] && (
          <View style={styles.tlExactPriceWrap}>
            <RNTextInput
              style={styles.tlExactPriceInput}
              placeholder="ex: 25"
              placeholderTextColor={Colors.textTertiary}
              value={place.exactPrice}
              onChangeText={(v) => updatePlaceExactPrice(place.id, v)}
              keyboardType="numeric"
              maxLength={5}
            />
            <Text style={styles.tlExactPriceUnit}>{cityConfig.currency}</Text>
          </View>
        )}
        {errors[`place_price_${index}`] && (
          <Text style={styles.miniError}>{errors[`place_price_${index}`]}</Text>
        )}

        {/* DURÉE — bouton qui ouvre le DurationPickerSheet. */}
        <Text style={[styles.tlFieldLabel, { marginTop: 14 }]}>DURÉE</Text>
        <TouchableOpacity
          style={[
            styles.tlPickerBtn,
            !!place.duration && styles.tlPickerBtnFilled,
          ]}
          onPress={() => setDurationPickerPlaceId(place.id)}
          activeOpacity={0.85}
        >
          <Ionicons
            name={place.duration ? 'time' : 'time-outline'}
            size={15}
            color={place.duration ? Colors.terracotta700 : Colors.primary}
          />
          <Text style={[
            styles.tlPickerBtnText,
            !!place.duration && styles.tlPickerBtnTextFilled,
          ]}>
            {place.duration ? formatDurationLabel(place.duration) : 'Choisir une durée'}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={14}
            color={place.duration ? Colors.terracotta700 : Colors.primary}
          />
        </TouchableOpacity>
        {errors[`place_duration_${index}`] && (
          <Text style={styles.miniError}>{errors[`place_duration_${index}`]}</Text>
        )}

        {/* Book in advance toggle */}
        <TouchableOpacity
          style={styles.tlToggleRow}
          onPress={() => toggleReservation(place.id)}
          activeOpacity={0.75}
        >
          <View style={{ flex: 1 }}>
            <View style={styles.tlToggleTitleRow}>
              <Ionicons
                name={place.reservationRecommended ? 'bookmark' : 'bookmark-outline'}
                size={14}
                color={place.reservationRecommended ? Colors.primary : Colors.textSecondary}
              />
              <Text style={styles.tlToggleTitle}>Réserver à l'avance</Text>
            </View>
            <Text style={styles.tlToggleHint}>Recommandé pour ce lieu</Text>
          </View>
          <View style={[styles.tlSwitch, place.reservationRecommended && styles.tlSwitchOn]}>
            <View style={[styles.tlSwitchThumb, place.reservationRecommended && styles.tlSwitchThumbOn]} />
          </View>
        </TouchableOpacity>

        {/* Personalize */}
        <TouchableOpacity
          style={[styles.tlPersonalizeBtn, hasCustom && styles.tlPersonalizeBtnDone]}
          onPress={() => editPlaceCustomization(index)}
          activeOpacity={0.7}
        >
          <Ionicons name={hasCustom ? 'create' : 'sparkles'} size={14} color={Colors.primary} />
          <Text style={styles.tlPersonalizeText}>
            {hasCustom ? 'Modifier la personnalisation' : 'Personnaliser ce lieu'}
          </Text>
          {hasCustom && <Ionicons name="checkmark-circle" size={14} color={Colors.primary} style={{ marginLeft: 4 }} />}
        </TouchableOpacity>
      </View>
    );
  };

  const renderTransition = (fromIdx: number) => {
    const travel = travels[fromIdx];
    if (!travel) return null;
    const isExpanded = !isCustomizeMode && expandedTravelIdx === fromIdx;
    const emoji = TRANSPORT_EMOJIS[travel.transport] || '🚶';
    const durationLabel = travel.duration && travel.duration !== '...' ? `${travel.duration}min` : 'Auto';

    return (
      <View style={styles.tlTransitionRow} key={`tr-${fromIdx}`}>
        {/* Pill transport :
            • fresh     → cliquable, expand pour changer le mode
            • customize → read-only, le mode a été choisi en amont par
                          l'user dans le wizard organize. Pas de chevron. */}
        <TouchableOpacity
          style={[styles.tlTransitionPill, isExpanded && styles.tlTransitionPillActive]}
          onPress={isCustomizeMode ? undefined : () => toggleTravelExpand(fromIdx)}
          activeOpacity={isCustomizeMode ? 1 : 0.75}
          disabled={isCustomizeMode}
        >
          {travel.duration === '...' ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <Text style={styles.tlTransitionEmoji}>{emoji}</Text>
          )}
          <Text style={styles.tlTransitionText}>{durationLabel}</Text>
          {!isCustomizeMode && (
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={11}
              color={Colors.textTertiary}
              style={{ marginLeft: 2 }}
            />
          )}
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.tlTransitionCard}>
            <Text style={styles.tlFieldLabel}>MODE DE TRANSPORT</Text>
            <View style={styles.tlPillsRow}>
              {TRANSPORT_OPTIONS.map((opt) => {
                const isActive = travel.transport === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.tlTransportPill, isActive && styles.tlTransportPillActive]}
                    onPress={() => updateTravelTransport(fromIdx, opt)}
                    activeOpacity={0.75}
                  >
                    <Text style={{ fontSize: 12 }}>{TRANSPORT_EMOJIS[opt]}</Text>
                    <Text style={[styles.tlTransportPillText, isActive && styles.tlTransportPillTextActive]}>
                      {getTransportLabel(opt)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.tlTransitionHint}>
              {travel.duration === '...' ? 'Calcul en cours…' : `${travel.duration || '—'} min estimées · ${getTransportLabel(travel.transport).toLowerCase()}`}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderPlacesWithTravels = () => {
    if (places.length === 0) {
      return (
        <View style={styles.tlEmptyState}>
          <View style={styles.tlEmptyIconWrap}>
            <Ionicons name="map-outline" size={26} color={Colors.terracotta400} />
          </View>
          <Text style={styles.tlEmptyTitle}>Commence par un premier lieu</Text>
          <Text style={styles.tlEmptyHint}>Ajoute au moins 2 lieux pour construire ton itinéraire.</Text>
          <TouchableOpacity
            style={styles.tlAddCardStandalone}
            onPress={() => setShowPlacePicker(true)}
            activeOpacity={0.75}
          >
            <Ionicons name="add" size={16} color={Colors.primary} />
            <Text style={styles.tlAddText}>Ajouter un lieu</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.tlWrap}>
        {/* Vertical backbone line — covers nodes + add node */}
        <View style={styles.tlBackbone} pointerEvents="none" />

        {places.map((place, index) => {
          const isExpanded = expandedPlaceId === place.id;
          const isDragging = draggingId === place.id;
          const hasCustom = !!(place.customPhoto || place.comment || place.questionAnswer || (place.questions && place.questions.length > 0));
          const hasPhoto = !!(place.customPhoto || place.previewPhotoUrl);

          return (
            <React.Fragment key={`place-${place.id}`}>
              <Animated.View
                style={[
                  styles.tlRow,
                  { transform: [{ translateY: getDragY(place.id) }, { translateX: getDragX(place.id) }] },
                  { zIndex: isDragging ? 100 : isExpanded ? 10 : 1 },
                ]}
                {...getOrCreateDragHandlers(place.id).panHandlers}
              >
                {/* Node */}
                <View
                  style={[
                    styles.tlNode,
                    isExpanded && styles.tlNodeFocus,
                    isDragging && styles.tlNodeDragging,
                  ]}
                >
                  <Text style={styles.tlNodeText}>{index + 1}</Text>
                </View>

                {/* Card — UI unifiée fresh + customize.
                    Le tap sur la frame n'ouvre PLUS le menu déroulant
                    inline. Toutes les actions passent par les chips et
                    sheets. Long-press réservé au drag-to-reorder en fresh
                    seulement (en customize le plan est déjà vécu, l'ordre
                    ne se réorganise plus). */}
                <Pressable
                  onPress={undefined}
                  onLongPress={isCustomizeMode ? undefined : () => handleLongPressPlace(place.id)}
                  delayLongPress={350}
                  style={[
                    styles.tlCard,
                    isDragging && styles.tlCardDragging,
                  ]}
                >
                  {/* Top row: thumb + name + remove
                      Le thumb est cliquable et ouvre directement le modal
                      de personnalisation (photo + comment + QAs). Placeholder
                      dashed terracotta avec icône caméra invitante. UI unifiée
                      entre fresh et customize. */}
                  <View style={styles.tlCardTop}>
                    <TouchableOpacity
                      style={styles.tlThumb}
                      onPress={(e) => { e.stopPropagation(); editPlaceCustomization(index); }}
                      activeOpacity={0.85}
                    >
                      {hasPhoto ? (
                        <Image
                          source={{ uri: (place.customPhoto || place.previewPhotoUrl) as string }}
                          style={styles.tlThumbImg}
                        />
                      ) : (
                        <View style={[styles.tlThumbImg, styles.tlThumbPlaceholder]}>
                          <Ionicons name="camera" size={18} color={Colors.primary} />
                        </View>
                      )}
                    </TouchableOpacity>

                    <View style={styles.tlCardInfo}>
                      <Text style={styles.tlPlaceName} numberOfLines={1}>{place.name}</Text>
                      <Text style={styles.tlPlaceAddr} numberOfLines={1}>
                        {place.address || place.type}
                      </Text>
                    </View>

                    {/* Croix de suppression — uniquement en mode fresh.
                        En customize, le plan a déjà été vécu IRL : tous les
                        lieux ajoutés ont été visités, on ne veut pas les
                        retirer. */}
                    {!isCustomizeMode && (
                      <TouchableOpacity
                        onPress={(e) => { e.stopPropagation(); removePlace(place.id); }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={styles.tlRemoveBtn}
                      >
                        <Ionicons name="close" size={16} color={Colors.textTertiary} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Meta — UI unifiée fresh + customize : jauge 3/3 +
                      chips CTA + toggle 'Réservation conseillée'. Système
                      de référence pour la saisie de prix/durée dans toute
                      l'app. */}
                  {(() => {
                    const photoFilled = !!(place.customPhoto || place.previewPhotoUrl);
                    const durationFilled = !!place.duration;
                    const priceFilled = place.priceRangeIndex >= 0;
                    const filledCount = (photoFilled ? 1 : 0) + (durationFilled ? 1 : 0) + (priceFilled ? 1 : 0);
                    const allFilled = filledCount === 3;
                    const priceLabel = priceFilled
                      ? (() => {
                          const r = PRICE_RANGES[place.priceRangeIndex];
                          return r.max === 0 ? r.label : r.max === Infinity ? `${r.min}${cityConfig.currency}+` : `${r.label}${cityConfig.currency}`;
                        })()
                      : null;
                    return (
                      <>
                        {/* Jauge complétion : N/3 + 3 pastilles */}
                        <View style={styles.czGauge}>
                          <View style={styles.czGaugeDots}>
                            {[photoFilled, durationFilled, priceFilled].map((on, i) => (
                              <View
                                key={i}
                                style={[styles.czGaugeDot, on && styles.czGaugeDotOn]}
                              />
                            ))}
                          </View>
                          <Text style={[
                            styles.czGaugeText,
                            allFilled && { color: Colors.primary },
                          ]}>
                            {allFilled ? 'Tout est rempli ✓' : `${filledCount}/3 infos`}
                          </Text>
                        </View>

                        {/* 3 chips CTA dimensionnés — tap → sheet correspondant */}
                        <View style={styles.czChipsRow}>
                          <TouchableOpacity
                            style={[styles.czChip, photoFilled && styles.czChipFilled]}
                            onPress={(e) => { e.stopPropagation(); editPlaceCustomization(index); }}
                            activeOpacity={0.85}
                          >
                            <Ionicons
                              name={photoFilled ? 'image' : 'image-outline'}
                              size={14}
                              color={photoFilled ? Colors.terracotta700 : Colors.primary}
                            />
                            <Text style={[
                              styles.czChipText,
                              photoFilled && styles.czChipTextFilled,
                            ]} numberOfLines={1}>
                              {photoFilled ? 'Widgets ✓' : 'Widgets'}
                            </Text>
                            {photoFilled && (
                              <Ionicons name="checkmark-circle" size={12} color={Colors.primary} />
                            )}
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.czChip, durationFilled && styles.czChipFilled]}
                            onPress={(e) => { e.stopPropagation(); setDurationPickerPlaceId(place.id); }}
                            activeOpacity={0.85}
                          >
                            <Ionicons
                              name={durationFilled ? 'time' : 'time-outline'}
                              size={14}
                              color={durationFilled ? Colors.terracotta700 : Colors.primary}
                            />
                            <Text style={[
                              styles.czChipText,
                              durationFilled && styles.czChipTextFilled,
                            ]} numberOfLines={1}>
                              {durationFilled ? formatDurationLabel(place.duration) : 'Combien de temps ?'}
                            </Text>
                            {durationFilled && (
                              <Ionicons name="checkmark-circle" size={12} color={Colors.primary} />
                            )}
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.czChip, priceFilled && styles.czChipFilled]}
                            onPress={(e) => { e.stopPropagation(); setPricePickerPlaceId(place.id); }}
                            activeOpacity={0.85}
                          >
                            <Ionicons
                              name={priceFilled ? 'wallet' : 'wallet-outline'}
                              size={14}
                              color={priceFilled ? Colors.terracotta700 : Colors.primary}
                            />
                            <Text style={[
                              styles.czChipText,
                              priceFilled && styles.czChipTextFilled,
                            ]} numberOfLines={1}>
                              {priceLabel ?? 'Combien ça coûte ?'}
                            </Text>
                            {priceFilled && (
                              <Ionicons name="checkmark-circle" size={12} color={Colors.primary} />
                            )}
                          </TouchableOpacity>
                        </View>

                        {/* Toggle "Réservation conseillée" — opt-in, hors jauge */}
                        <TouchableOpacity
                          style={styles.czReserveRow}
                          onPress={(e) => { e.stopPropagation(); toggleReservation(place.id); }}
                          activeOpacity={0.7}
                        >
                          <View style={styles.czReserveLabel}>
                            <Ionicons
                              name={place.reservationRecommended ? 'bookmark' : 'bookmark-outline'}
                              size={13}
                              color={place.reservationRecommended ? Colors.primary : Colors.textTertiary}
                            />
                            <Text style={[
                              styles.czReserveText,
                              place.reservationRecommended && styles.czReserveTextActive,
                            ]}>
                              Réservation conseillée
                            </Text>
                          </View>
                          <View style={[styles.czSwitch, place.reservationRecommended && styles.czSwitchOn]}>
                            <View style={[
                              styles.czSwitchThumb,
                              place.reservationRecommended && styles.czSwitchThumbOn,
                            ]} />
                          </View>
                        </TouchableOpacity>
                      </>
                    );
                  })()}
                </Pressable>
              </Animated.View>

              {/* Transition pill between this place and the next */}
              {index < places.length - 1 && index < travels.length && renderTransition(index)}
            </React.Fragment>
          );
        })}

        {/* Add place node — caché en customize mode (le user vient de
            faire le plan, on ne veut PAS qu'il rajoute un lieu fantôme
            qu'il n'a pas vraiment visité). Sinon dispo normalement. */}
        {!isCustomizeMode && (
          <View style={styles.tlRow}>
            <View style={[styles.tlNode, styles.tlNodeAdd]}>
              <Ionicons name="add" size={16} color={Colors.primary} />
            </View>
            <TouchableOpacity
              style={styles.tlAddCard}
              onPress={() => setShowPlacePicker(true)}
              activeOpacity={0.75}
            >
              <Text style={styles.tlAddText}>Ajouter un lieu</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
        <View style={[styles.wizardHeader, { borderBottomColor: C.borderLight }]}>
          {stepPosition > 1 ? (
            <TouchableOpacity onPress={goToPrevStep} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.wizardHeaderSide}>
              <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.wizardHeaderSide} />
          )}
          <View style={styles.wizardHeaderCenter}>
            <Text style={[styles.wizardStepLabel, { color: Colors.textTertiary }]}>ÉTAPE {stepPosition} SUR {visibleTotal}</Text>
            <Text style={[styles.wizardStepTitle, { color: Colors.textPrimary }]}>
              {step === 1
                ? 'Commence par le titre'
                : step === 2
                  ? 'La photo qui claque'
                  : step === 3
                    ? 'Choisis les catégories'
                    : step === 4
                      ? 'Ajoute les lieux'
                      : 'Ton conseil final'}
            </Text>
          </View>
          <View style={styles.wizardHeaderSide} />
        </View>

        {/* Step progress bar — un segment par étape ACTIVE (3 en customize
            mode, 5 en fresh). Chaque segment est rempli si on a atteint
            ou dépassé son index dans ACTIVE_STEPS. */}
        <View style={styles.wizardProgress}>
          {ACTIVE_STEPS.map((s, idx) => (
            <View
              key={s}
              style={[
                styles.wizardProgressSeg,
                { backgroundColor: stepPosition >= idx + 1 ? Colors.primary : Colors.borderSubtle },
              ]}
            />
          ))}
        </View>

        <Animated.View style={{ flex: 1, opacity: publishOpacity, transform: [{ translateY: publishTranslateY }, { scale: publishScale }] }} pointerEvents={isFlying ? 'none' : 'auto'}>

        <View style={[styles.scroll, styles.scrollContent, { flex: 1 }]}>
          {/* ═══════ STEP 1: Title only — editorial composer ═══════ */}
          {step === 1 && (
            <View style={styles.s0Container}>
              <Text style={styles.s0Prompt}>
                {flowMode === 'fromSaved' ? 'Donne-lui ton nom' : 'Qu\'est-ce que tu proposes ?'}
              </Text>
              <Text style={styles.s0Helper}>
                {flowMode === 'fromSaved'
                  ? 'Tu as adapté les lieux à ta sauce — choisis maintenant un titre qui te ressemble.'
                  : 'Un titre court et précis vaut mieux qu\'un long descriptif.'}
              </Text>

              {/* "Partir d'un plan sauvegardé" — bouton pour préfiller le
                  wizard depuis un plan existant. Placé EN HAUT (avant
                  l'input qui ouvre le clavier en autoFocus) sinon il est
                  poussé sous le viewport et invisible.
                  Caché en mode `fromSaved` : on est déjà parti d'un plan,
                  ré-importer écraserait les modifs en cours. */}
              {flowMode === 'fresh' && (
                <TouchableOpacity
                  style={styles.s0ImportBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setShowSavedPlanPicker(true);
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.s0ImportIconWrap}>
                    <Ionicons name="bookmark" size={16} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.s0ImportTitle}>Partir d'un plan sauvegardé</Text>
                    <Text style={styles.s0ImportHint}>
                      Re-utilise un plan existant et modifie ce que tu veux
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.gray500} />
                </TouchableOpacity>
              )}

              {/* Breadcrumb du plan source (mode `fromSaved` uniquement).
                  Donne du contexte sans inciter à reprendre tel quel le
                  titre original — qui n'est plus exact maintenant que les
                  lieux ont été modifiés. */}
              {flowMode === 'fromSaved' && importedSourceTitle && (
                <View style={styles.s0SourceBreadcrumb}>
                  <Ionicons name="bookmark" size={13} color={Colors.terracotta600} />
                  <Text style={styles.s0SourceBreadcrumbText} numberOfLines={2}>
                    Tu pars de <Text style={styles.s0SourceBreadcrumbTitle}>« {importedSourceTitle} »</Text>
                  </Text>
                </View>
              )}

              <View style={styles.s0InputWrap}>
                <RNTextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Meilleur sushi de Passy"
                  placeholderTextColor={Colors.textTertiary}
                  style={styles.s0Input}
                  maxLength={80}
                  autoFocus
                  returnKeyType="done"
                />
                <View style={styles.s0InputUnderline} />
              </View>

              <View style={styles.s0MetaRow}>
                {errors.title ? (
                  <Text style={styles.s0Error}>{errors.title}</Text>
                ) : (
                  <Text style={styles.s0Hint}>Tu pourras le modifier à tout moment</Text>
                )}
                <Text style={styles.s0Counter}>{title.length}/80</Text>
              </View>

              {/* Inspiration suggestions — design aligné sur CoPlanInviteSheet :
                  chips horizontaux compacts (flex-wrap), couleur primaryDeep,
                  re-shuffle 3 nouvelles idées au tap sur ↻. */}
              <View style={styles.s0Inspirations}>
                <View style={styles.s0InspirationHeader}>
                  <Text style={styles.s0InspirationLabel}>QUELQUES IDÉES</Text>
                  <TouchableOpacity
                    onPress={reshuffleTitleIdeas}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="refresh-outline" size={13} color={Colors.textTertiary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.s0IdeasWrap}>
                  {titleIdeas.map((idea) => (
                    <TouchableOpacity
                      key={idea}
                      style={styles.s0IdeaChip}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setTitle(idea);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="sparkles-outline" size={13} color={Colors.primaryDeep} />
                      <Text style={styles.s0IdeaChipText}>{idea}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* ═══════ STEP 2: Cover photo — editorial hero (single photo, fills space) ═══════ */}
          {step === 2 && (
            <View style={styles.s1Container}>
              {/* ── HERO PHOTO (single, takes ALL available space) ── */}
              <TouchableOpacity
                style={styles.s1Hero}
                onPress={coverPhotos.length === 0 ? pickSingleCoverPhoto : () => setEditingPhotoIdx(0)}
                activeOpacity={coverPhotos.length === 0 ? 0.85 : 0.9}
                disabled={isUploadingPhotos && coverPhotos.length === 0}
              >
                {coverPhotos.length === 0 ? (
                  // Empty state — big dashed placeholder, tap to pick
                  <View style={styles.s1HeroEmpty}>
                    {isUploadingPhotos ? (
                      <ActivityIndicator size="large" color={Colors.primary} />
                    ) : (
                      <>
                        <View style={styles.s1HeroIconCircle}>
                          <Ionicons name="image-outline" size={34} color={Colors.primary} />
                        </View>
                        <Text style={styles.s1HeroEmptyTitle}>Ajoute la photo</Text>
                        <Text style={styles.s1HeroEmptySub}>
                          Celle qui donne envie au premier coup d'œil
                        </Text>
                        <View style={styles.s1HeroEmptyCta}>
                          <Ionicons name="add" size={16} color={Colors.textOnAccent} />
                          <Text style={styles.s1HeroEmptyCtaText}>Choisir une photo</Text>
                        </View>
                      </>
                    )}
                  </View>
                ) : (
                  // Filled state — show big photo with edit + remove pills
                  <>
                    <Image source={{ uri: coverPhotos[0] }} style={styles.s1HeroImg} resizeMode="cover" />
                    <LinearGradient
                      colors={['rgba(44,36,32,0.35)', 'transparent', 'rgba(44,36,32,0.35)']}
                      locations={[0, 0.3, 1]}
                      style={StyleSheet.absoluteFillObject}
                      pointerEvents="none"
                    />
                    <TouchableOpacity
                      style={styles.s1HeroRemove}
                      onPress={() => removePhoto(0)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close" size={18} color="#FFF" />
                    </TouchableOpacity>
                    <View style={styles.s1HeroEditPill}>
                      <Ionicons name="options-outline" size={14} color="#FFF" />
                      <Text style={styles.s1HeroEditText}>Éditer</Text>
                    </View>
                    <View style={styles.s1HeroChangePill}>
                      <Text style={styles.s1HeroChangeText}>Photo principale</Text>
                    </View>
                  </>
                )}
              </TouchableOpacity>

            </View>
          )}

          {/* ═══════ STEP 3: Categories — horizontal chip rows + subcategory cards ═══════ */}
          {step === 3 && (() => {
            const visibleThemes = EXPLORE_GROUPS.filter(g => g.key !== 'trending' && g.key !== 'nearby');
            const visiblePersons = PERSON_FILTERS.filter(p => p.key !== 'around-you');
            const personLabels = visiblePersons.map(p => p.label);
            const themeLabels = visibleThemes.map(g => g.label);
            const allSubcatNames = EXPLORE_GROUPS.flatMap(g => g.sections.flatMap(s => s.items.map(i => i.name)));
            const countMain = selectedTags.filter(t => personLabels.includes(t) || themeLabels.includes(t)).length;
            const countSub = selectedTags.filter(t => allSubcatNames.includes(t)).length;
            const selectedThemeGroups = visibleThemes.filter(g => selectedTags.includes(g.label));

            return (
              <View style={{ flex: 1 }}>
                {/* ── Fixed top: chip rows ── */}
                <View>
                  {/* PAR PERSONNE */}
                  <Text style={styles.s3Overline}>PAR PERSONNE</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.s3ChipsRow}
                  >
                    {visiblePersons.map((p) => {
                      const isSelected = selectedTags.includes(p.label);
                      return (
                        <TouchableOpacity
                          key={p.key}
                          style={[styles.s3Chip, isSelected && styles.s3ChipActive]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            toggleTag(p.label);
                          }}
                          activeOpacity={0.75}
                        >
                          {isSelected && (
                            <Ionicons name="checkmark" size={13} color={Colors.terracotta700} style={{ marginRight: 2 }} />
                          )}
                          <Text style={styles.s3ChipEmoji}>{p.emoji}</Text>
                          <Text style={[styles.s3ChipText, isSelected && styles.s3ChipTextActive]}>{p.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* PAR THÈME */}
                  <Text style={[styles.s3Overline, { marginTop: 18 }]}>PAR THÈME</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.s3ChipsRow}
                  >
                    {visibleThemes.map((group) => {
                      const isSelected = selectedTags.includes(group.label);
                      return (
                        <TouchableOpacity
                          key={group.key}
                          style={[styles.s3Chip, isSelected && styles.s3ChipActive]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            toggleTag(group.label);
                          }}
                          activeOpacity={0.75}
                        >
                          {isSelected && (
                            <Ionicons name="checkmark" size={13} color={Colors.terracotta700} style={{ marginRight: 2 }} />
                          )}
                          <Text style={styles.s3ChipEmoji}>{group.emoji}</Text>
                          <Text style={[styles.s3ChipText, isSelected && styles.s3ChipTextActive]}>{group.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  {errors.tags && <Text style={[styles.errorText, { marginTop: 8 }]}>{errors.tags}</Text>}
                </View>

                {/* ── Scrollable middle: subcategory blocks per selected theme ── */}
                <ScrollView
                  style={styles.s3SubScroll}
                  contentContainerStyle={styles.s3SubScrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  {selectedThemeGroups.length === 0 ? (
                    <View style={styles.s3EmptyState}>
                      <Ionicons name="sparkles-outline" size={22} color={Colors.terracotta400} />
                      <Text style={styles.s3EmptyText}>
                        Sélectionne un thème ci-dessus pour préciser ton style
                      </Text>
                    </View>
                  ) : (
                    selectedThemeGroups.map((theme) => {
                      const items = theme.sections.flatMap((s) => s.items);
                      const selectedInTheme = items.filter((i) => selectedTags.includes(i.name)).length;
                      return (
                        <View key={theme.key} style={styles.s3SubBlock}>
                          <View style={styles.s3SubHeader}>
                            <View style={styles.s3SubHeaderLeft}>
                              <Text style={styles.s3SubHeaderEmoji}>{theme.emoji}</Text>
                              <Text style={styles.s3SubHeaderTitle}>{theme.label}</Text>
                              <Text style={styles.s3SubHeaderSep}>—</Text>
                              <Text style={styles.s3SubHeaderHint}>précise ton style</Text>
                            </View>
                            {selectedInTheme > 0 && (
                              <Text style={styles.s3SubHeaderCount}>
                                {selectedInTheme} choisi{selectedInTheme > 1 ? 's' : ''}
                              </Text>
                            )}
                          </View>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.s3CardsRow}
                          >
                            {items.map((item) => {
                              const isSelected = selectedTags.includes(item.name);
                              return (
                                <TouchableOpacity
                                  key={item.name}
                                  style={[styles.s3Card, isSelected && styles.s3CardActive]}
                                  onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    toggleTag(item.name);
                                  }}
                                  activeOpacity={0.75}
                                >
                                  <Text style={styles.s3CardEmoji}>{item.emoji}</Text>
                                  <Text
                                    style={[styles.s3CardName, isSelected && styles.s3CardNameActive]}
                                    numberOfLines={2}
                                  >
                                    {item.name}
                                  </Text>
                                  {isSelected && (
                                    <View style={styles.s3CardCheck}>
                                      <Ionicons name="checkmark" size={10} color={Colors.textOnAccent} />
                                    </View>
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        </View>
                      );
                    })
                  )}
                </ScrollView>

                {/* ── Fixed bottom: summary recap ── */}
                <View style={styles.s3Summary}>
                  <Ionicons
                    name={countMain > 0 ? 'sparkles' : 'sparkles-outline'}
                    size={16}
                    color={countMain > 0 ? Colors.primary : Colors.textTertiary}
                  />
                  {countMain > 0 ? (
                    <Text style={styles.s3SummaryText}>
                      <Text style={styles.s3SummaryStrong}>{countMain}</Text>
                      {' '}catégorie{countMain > 1 ? 's' : ''}
                      {countSub > 0 ? (
                        <>
                          {'  ·  '}
                          <Text style={styles.s3SummaryStrong}>{countSub}</Text>
                          {' '}style{countSub > 1 ? 's' : ''}
                        </>
                      ) : null}
                    </Text>
                  ) : (
                    <Text style={styles.s3SummaryEmpty}>
                      Sélectionne au moins 1 catégorie
                    </Text>
                  )}
                </View>
              </View>
            );
          })()}

          {/* ═══════ STEP 4: Places — editorial timeline ═══════ */}
          {step === 4 && (
          <View style={{ flex: 1 }}>
          {/* Editorial header — texte adapté au mode :
              • fresh    → 'Construis ton itinéraire' (encore en construction)
              • customize → 'Personnalise tes lieux' (les lieux sont déjà là,
                            le user doit juste enrichir prix/durée/photo) */}
          <View style={styles.tlHeader}>
            <View style={styles.tlHeaderTitleRow}>
              <Text style={styles.tlHeaderTitle}>
                {isCustomizeMode ? 'Personnalise tes lieux' : 'Construis ton itinéraire'}
              </Text>
              {places.length > 0 && (
                <Text style={styles.tlHeaderCount}>
                  {places.length < 2 ? `${places.length} / 2 min.` : `${places.length} lieu${places.length > 1 ? 'x' : ''}`}
                  {places.length >= 2 && totalDuration > 0 ? ` · ${formatDuration(totalDuration)}` : ''}
                </Text>
              )}
            </View>
            <Text style={styles.tlHeaderSub}>
              {isCustomizeMode
                ? 'Tape un lieu pour ajouter prix, durée et photo — ces détails rendent ton plan utile pour les autres'
                : "Tape un lieu pour l'éditer · maintiens pour réorganiser"}
            </Text>
          </View>

          {/* Timeline (internal scroll) */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 14 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={!draggingId}
          >
            {renderPlacesWithTravels()}
            {errors.places && <Text style={[styles.errorText, { marginLeft: 56, marginTop: 4 }]}>{errors.places}</Text>}

            {/* Compact recap pill — conditions adaptées au mode :
                • fresh    : >= 2 lieux suffit (UX historique)
                • customize: ne s'affiche QUE quand TOUS les lieux ont
                  durée + prix renseignés. Sinon la pill mentirait
                  ("0min", "Free") et brouillerait le user qui pense
                  que c'est calculé automatiquement. */}
            {places.length >= 2 && (
              !isCustomizeMode || places.every((p) => p.duration && p.priceRangeIndex >= 0)
            ) && (
              <View style={styles.tlRecapPill}>
                <View style={styles.tlRecapItem}>
                  <Text style={styles.tlRecapEmoji}>📍</Text>
                  <Text style={styles.tlRecapValue}>{places.length}</Text>
                  <Text style={styles.tlRecapLabel}>étapes</Text>
                </View>
                <View style={styles.tlRecapSep} />
                <View style={styles.tlRecapItem}>
                  <Text style={styles.tlRecapEmoji}>⏱</Text>
                  <Text style={styles.tlRecapValue}>{formatDuration(totalDuration)}</Text>
                </View>
                <View style={styles.tlRecapSep} />
                <View style={styles.tlRecapItem}>
                  <Text style={styles.tlRecapEmoji}>💰</Text>
                  <Text style={styles.tlRecapValue}>{formatPriceRange(cityConfig.currency)}</Text>
                </View>
                {uniqueTransports.length > 0 && (
                  <>
                    <View style={styles.tlRecapSep} />
                    <View style={styles.tlRecapItem}>
                      {uniqueTransports.map((mode) => (
                        <Text key={mode} style={styles.tlRecapTransport}>{TRANSPORT_EMOJIS[mode]}</Text>
                      ))}
                    </View>
                  </>
                )}
              </View>
            )}

            {/* Preview button */}
            {canPublish && (
              <TouchableOpacity
                style={[styles.previewBtn, { borderColor: Colors.primary, marginTop: 12 }]}
                onPress={() => setShowPreview(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="eye-outline" size={16} color={Colors.primary} />
                <Text style={[styles.previewBtnText, { color: Colors.primary }]}>Aperçu du plan</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
          </View>
          )}

          {/* ═══════ STEP 5: Creator tip — mandatory signature sentence ═══════ */}
          {step === 5 && (
            <View style={{ flex: 1 }}>
              {/* Composant partagé extrait pour réutilisation dans le flow
                  CoPlanPublishScreen — render pixel-identique au layout
                  d'origine, props par défaut = anciennes valeurs hardcodées. */}
              <CreatorTipInput
                value={authorTip}
                onChange={setAuthorTip}
                minChars={TIP_MIN_CHARS}
                maxChars={TIP_MAX_CHARS}
              />
            </View>
          )}
        </View>
        </Animated.View>

        {/* ═══════ Wizard footer — dynamic action per step ═══════ */}
        <View style={[styles.wizardFooter, { paddingBottom: insets.bottom + 12, borderTopColor: Colors.borderSubtle, backgroundColor: Colors.bgPrimary }]}>
          {/* Visibility bandeau — only on step 4 (publish) */}
          {step === TOTAL_STEPS && (
            <TouchableOpacity
              style={styles.tlVisibilityRow}
              onPress={() => setShowVisibilitySheet(true)}
              activeOpacity={0.7}
            >
              <View style={styles.tlVisibilityLeft}>
                <Text style={styles.tlVisibilityIcon}>
                  {visibility === 'public' ? '🌍' : visibility === 'friends' ? '👥' : '🔒'}
                </Text>
                <Text style={styles.tlVisibilityLabel}>
                  {visibility === 'public' ? 'Publié en public' : visibility === 'friends' ? 'Amis seulement' : 'Privé (moi uniquement)'}
                </Text>
              </View>
              <Text style={styles.tlVisibilityEdit}>Modifier</Text>
            </TouchableOpacity>
          )}
          {step < TOTAL_STEPS && (
            <TouchableOpacity
              style={[
                styles.wizardPrimaryBtn,
                canProceedFromStep(step)
                  ? { backgroundColor: Colors.primary }
                  : { backgroundColor: Colors.gray300 },
              ]}
              onPress={goToNextStep}
              disabled={!canProceedFromStep(step)}
              activeOpacity={0.85}
            >
              <Text style={[styles.wizardPrimaryBtnText, { color: canProceedFromStep(step) ? Colors.textOnAccent : Colors.textTertiary }]}>
                {(() => {
                  // Le label "Suivant — X" mentionne l'étape qui SUIT, pas
                  // celle où on est. En customize mode (skip 1 et 3), il
                  // faut donc lire ACTIVE_STEPS, pas `step + 1`.
                  const idx = ACTIVE_STEPS.indexOf(step);
                  const next = idx >= 0 ? ACTIVE_STEPS[idx + 1] : null;
                  if (next === 2) return 'Suivant — la photo';
                  if (next === 3) return 'Suivant — les catégories';
                  if (next === 4) return 'Suivant — les lieux';
                  if (next === 5) return 'Suivant — ton conseil';
                  return 'Suivant';
                })()}
              </Text>
              <Ionicons name="arrow-forward" size={18} color={canProceedFromStep(step) ? Colors.textOnAccent : Colors.textTertiary} />
            </TouchableOpacity>
          )}
          {step === 2 && coverPhotos.length === 0 && (
            <Text style={{ fontSize: 12, color: Colors.textTertiary, textAlign: 'center', marginTop: 10, fontFamily: Fonts.body }}>
              Une photo de présentation est obligatoire
            </Text>
          )}
          {/* Hint customize step 4 : explique pourquoi le bouton est gris */}
          {step === 4 && isCustomizeMode && !canProceedFromStep(4) && (
            <Text style={{ fontSize: 12, color: Colors.textTertiary, textAlign: 'center', marginTop: 10, fontFamily: Fonts.body }}>
              Complète photo, durée et prix de chaque lieu pour continuer.
            </Text>
          )}
          {step >= TOTAL_STEPS && (
            <TouchableOpacity
              style={[
                styles.wizardPrimaryBtn,
                !canPublish && { backgroundColor: Colors.gray300 },
                canPublish && qualityScore < 80 && { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: Colors.primary },
                canPublish && qualityScore >= 80 && { backgroundColor: Colors.primary },
              ]}
              onPress={() => {
                if (canPublish && qualityScore < 100 && missingCriteria.length > 0) {
                  openPublishSheet();
                } else {
                  handlePublish();
                }
              }}
              disabled={!canPublish || isPublishing}
              activeOpacity={0.85}
            >
              {isPublishing ? (
                <ActivityIndicator size="small" color={Colors.textOnAccent} />
              ) : (
                <>
                  <Ionicons
                    name="send"
                    size={16}
                    color={canPublish && qualityScore < 80 ? Colors.primary : Colors.textOnAccent}
                  />
                  <Text
                    style={[
                      styles.wizardPrimaryBtnText,
                      !canPublish && { color: Colors.textTertiary },
                      canPublish && qualityScore < 80 && { color: Colors.primary },
                      canPublish && qualityScore >= 80 && { color: Colors.textOnAccent },
                    ]}
                  >
                    {qualityScore >= 100 ? 'Publier le plan ✦' : t.create_publish}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

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
              <Ionicons name="search-outline" size={16} color={C.gray600} style={{ marginRight: 8 }} />
              <RNTextInput
                style={[styles.searchInput, { color: C.black }]}
                placeholder={t.create_search_place}
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

            {placeResults.length > 0 && (
              <Text style={[styles.modalSectionLabel, { color: C.gray700 }]}>{t.create_suggested_places}</Text>
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
                  onPress={() => selectGooglePlace(item)}
                >
                  <View style={[styles.placeOptionEmoji, { backgroundColor: C.gray200 }]}>
                    <Ionicons name="location-outline" size={22} color={C.gold} />
                  </View>
                  <View style={styles.placeOptionInfo}>
                    <Text style={[styles.placeOptionName, { color: C.black }]}>{item.name}</Text>
                    <Text style={[styles.placeOptionType, { color: C.gray700 }]} numberOfLines={1}>{item.address}</Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={24} color={C.primary} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                !isSearchingPlaces && placeSearch.length >= 2 ? (
                  <View style={{ alignItems: 'center', paddingTop: 40 }}>
                    <Ionicons name="search" size={32} color={C.gray500} />
                    <Text style={[styles.modalSectionLabel, { color: C.gray600, textAlign: 'center', marginTop: 12 }]}>
                      Aucun résultat
                    </Text>
                  </View>
                ) : placeSearch.length < 2 ? (
                  savedPlacesList.length > 0 ? (
                    <View>
                      <Text style={[styles.modalSectionLabel, { color: C.gray700 }]}>Lieux sauvegardés</Text>
                      {savedPlacesList.map((sp) => (
                        <TouchableOpacity
                          key={sp.placeId}
                          style={[styles.placeOption, { borderBottomColor: C.borderLight }]}
                          activeOpacity={0.6}
                          onPress={() => selectGooglePlace({ placeId: sp.placeId, name: sp.name, address: sp.address, types: sp.types })}
                        >
                          <View style={[styles.placeOptionEmoji, { backgroundColor: C.gray200 }]}>
                            <Ionicons name="star" size={22} color={Colors.gold} />
                          </View>
                          <View style={styles.placeOptionInfo}>
                            <Text style={[styles.placeOptionName, { color: C.black }]}>{sp.name}</Text>
                            <Text style={[styles.placeOptionType, { color: C.gray700 }]} numberOfLines={1}>{sp.address}</Text>
                          </View>
                          <Ionicons name="add-circle-outline" size={24} color={Colors.primary} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <View style={{ alignItems: 'center', paddingTop: 40 }}>
                      <Ionicons name="location" size={32} color={C.gray500} />
                      <Text style={[styles.modalSectionLabel, { color: C.gray600, textAlign: 'center', marginTop: 12 }]}>
                        Recherche un lieu...
                      </Text>
                    </View>
                  )
                ) : null
              }
            />
          </View>
        </Modal>

        {/* ========== VISIBILITY SHEET (Step 4 publish audience) ========== */}
        <Modal visible={showVisibilitySheet} animationType="fade" transparent onRequestClose={() => setShowVisibilitySheet(false)}>
          <Pressable style={styles.tlVisSheetBackdrop} onPress={() => setShowVisibilitySheet(false)}>
            <Pressable style={styles.tlVisSheet} onPress={() => {}}>
              <View style={styles.tlVisSheetHandle} />
              <Text style={styles.tlVisSheetTitle}>Qui peut voir ce plan ?</Text>
              {(['public', 'friends', 'private'] as const).map((v) => {
                const meta = v === 'public'
                  ? { emoji: '🌍', title: 'Public', hint: 'Visible par tout le monde sur Proof' }
                  : v === 'friends'
                    ? { emoji: '👥', title: 'Amis seulement', hint: 'Visible uniquement par tes amis' }
                    : { emoji: '🔒', title: 'Privé', hint: 'Visible uniquement par toi' };
                const isActive = visibility === v;
                return (
                  <TouchableOpacity
                    key={v}
                    style={[styles.tlVisOption, isActive && styles.tlVisOptionActive]}
                    onPress={() => {
                      setVisibility(v);
                      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setShowVisibilitySheet(false);
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.tlVisOptionEmoji}>{meta.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.tlVisOptionTitle, isActive && styles.tlVisOptionTitleActive]}>{meta.title}</Text>
                      <Text style={styles.tlVisOptionHint}>{meta.hint}</Text>
                    </View>
                    {isActive && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </Pressable>
          </Pressable>
        </Modal>

        {/* ========== PLACE CUSTOMIZATION MODAL ========== */}
        <Modal visible={showCustomize} animationType="slide" presentationStyle="pageSheet">
          <View style={[styles.customizeContainer, { backgroundColor: C.white }]}>
            <View style={[styles.customizeHeader, { borderBottomColor: C.border }]}>
              <TouchableOpacity onPress={() => { setShowCustomize(false); setPendingPlace(null); }}>
                <Ionicons name="arrow-back" size={22} color={C.black} />
              </TouchableOpacity>
              <Text style={[styles.customizeTitle, { color: C.black }]}>{pendingPlace?.name}</Text>
              <View style={{ width: 22 }} />
            </View>

            <ScrollView contentContainerStyle={styles.customizeScroll} showsVerticalScrollIndicator={false}>
              {/* Place photo banner */}
              <View style={styles.customizeBanner}>
                {pendingPlacePhoto ? (
                  <Image source={{ uri: pendingPlacePhoto }} style={styles.customizeBannerImg} />
                ) : (
                  <View style={[styles.customizeBannerPlaceholder, { backgroundColor: C.gray200 }]}>
                    <Ionicons name="location" size={40} color={C.gray500} />
                  </View>
                )}
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={styles.customizeBannerOverlay} />
                <View style={styles.customizeBannerInfo}>
                  <Text style={styles.customizeBannerName}>{pendingPlace?.name}</Text>
                  <Text style={styles.customizeBannerType}>{pendingPlace?.type} • {pendingPlace?.address}</Text>
                </View>
              </View>

              {/* Customization blocks */}
              <View style={styles.customizeSectionRow}>
                <Text style={[styles.customizeSectionTitle, { color: C.gray600 }]}>
                  Optionnel : personnaliser ce lieu
                </Text>
                <TouchableOpacity
                  onPress={() => setIsReordering(!isReordering)}
                  style={[styles.reorderToggle, { backgroundColor: isReordering ? C.primary : C.gray200 }]}
                >
                  <Ionicons name={isReordering ? 'checkmark' : 'reorder-three'} size={16} color={isReordering ? Colors.textOnAccent : C.gray700} />
                </TouchableOpacity>
              </View>

              {blockOrder.map((type, idx) => {
                const isFilled = type === 'photo' ? !!customPhoto : type === 'comment' ? !!customComment : customQAs.some((qa) => qa.answer.trim().length > 0);

                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.customizeBlock,
                      { backgroundColor: C.gray100, borderColor: isFilled ? C.primary : C.borderLight },
                      isReordering && styles.customizeBlockReorder,
                    ]}
                    onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setIsReordering(true); }}
                    onPress={type === 'photo' && !isReordering ? pickCustomPhoto : undefined}
                    activeOpacity={isReordering ? 1 : 0.7}
                    delayLongPress={300}
                  >
                    <View style={styles.customizeBlockHeader}>
                      {/* Grip handle (reorder mode) */}
                      {isReordering && (
                        <View style={styles.reorderArrows}>
                          <TouchableOpacity onPress={() => moveBlock(idx, 'up')} disabled={idx === 0} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="chevron-up" size={18} color={idx === 0 ? C.gray400 : C.black} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => moveBlock(idx, 'down')} disabled={idx === blockOrder.length - 1} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="chevron-down" size={18} color={idx === blockOrder.length - 1 ? C.gray400 : C.black} />
                          </TouchableOpacity>
                        </View>
                      )}

                      <View style={[styles.customizeBlockIcon, { backgroundColor: C.primary + '15' }]}>
                        <Ionicons
                          name={type === 'photo' ? 'camera-outline' : type === 'comment' ? 'chatbubble-outline' : 'help-circle-outline'}
                          size={20}
                          color={C.primary}
                        />
                      </View>
                      <Text style={[styles.customizeBlockTitle, { color: C.black }]}>
                        {type === 'photo' ? 'Ajouter une photo' : type === 'comment' ? 'Commenter' : 'Répondre à une question'}
                      </Text>

                      {/* Clear button */}
                      {isFilled && (
                        <TouchableOpacity onPress={() => clearBlock(type)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.clearBtn}>
                          <Ionicons name="close-circle" size={20} color={C.gray500} />
                        </TouchableOpacity>
                      )}
                      {!isFilled && !isReordering && <Ionicons name="chevron-forward" size={16} color={C.gray400} />}
                    </View>

                    {/* Block content */}
                    {!isReordering && type === 'photo' && (
                      customPhoto ? (
                        <Image source={{ uri: customPhoto }} style={styles.customizePhotoPreview} />
                      ) : (
                        <Text style={[styles.customizeBlockHint, { color: C.gray500 }]}>Ta propre photo de ce lieu</Text>
                      )
                    )}

                    {!isReordering && type === 'comment' && (
                      <RNTextInput
                        style={[styles.customizeInput, { color: C.black, backgroundColor: C.white, borderColor: C.borderLight }]}
                        placeholder="Ton avis, un conseil, une anecdote..."
                        placeholderTextColor={C.gray500}
                        value={customComment}
                        onChangeText={setCustomComment}
                        multiline
                        maxLength={280}
                      />
                    )}

                    {!isReordering && type === 'question' && (
                      <>
                        {customQAs.map((qa, qaIdx) => {
                          const usedQuestions = customQAs.map((q) => q.question);
                          const availableQs = placeQuestions.filter((q) => !usedQuestions.includes(q) || q === qa.question);
                          return (
                            <View key={qaIdx} style={[qaIdx > 0 && { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.borderLight }]}>
                              {/* Question picker */}
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <TouchableOpacity
                                  style={[styles.questionPicker, { backgroundColor: C.white, borderColor: C.borderLight, flex: 1 }]}
                                  onPress={() => setActiveQAPicker(activeQAPicker === qaIdx ? null : qaIdx)}
                                  activeOpacity={0.7}
                                >
                                  <Text style={[styles.questionPickerText, { color: C.gray700 }]} numberOfLines={1}>{qa.question}</Text>
                                  <Ionicons name={activeQAPicker === qaIdx ? 'chevron-up' : 'chevron-down'} size={16} color={C.gray500} />
                                </TouchableOpacity>
                                {customQAs.length > 1 && (
                                  <TouchableOpacity
                                    onPress={() => { setCustomQAs((prev) => prev.filter((_, i) => i !== qaIdx)); setActiveQAPicker(null); }}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  >
                                    <Ionicons name="trash-outline" size={18} color={C.gray500} />
                                  </TouchableOpacity>
                                )}
                              </View>
                              {/* Question dropdown */}
                              {activeQAPicker === qaIdx && (
                                <View style={[styles.questionDropdown, { backgroundColor: C.white, borderColor: C.borderLight }]}>
                                  <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
                                    {availableQs.map((q) => (
                                      <TouchableOpacity
                                        key={q}
                                        style={[
                                          styles.questionOption,
                                          { borderBottomColor: C.borderLight },
                                          q === qa.question && { backgroundColor: C.primary + '12' },
                                        ]}
                                        onPress={() => {
                                          setCustomQAs((prev) => prev.map((item, i) => i === qaIdx ? { ...item, question: q } : item));
                                          setActiveQAPicker(null);
                                        }}
                                        activeOpacity={0.7}
                                      >
                                        <Text style={[styles.questionOptionText, { color: q === qa.question ? C.primary : C.black }]}>{q}</Text>
                                        {q === qa.question && <Ionicons name="checkmark" size={16} color={C.primary} />}
                                      </TouchableOpacity>
                                    ))}
                                  </ScrollView>
                                </View>
                              )}
                              {/* Answer input */}
                              <RNTextInput
                                style={[styles.customizeInput, { color: C.black, backgroundColor: C.white, borderColor: C.borderLight, marginTop: 8 }]}
                                placeholder="Ta réponse..."
                                placeholderTextColor={C.gray500}
                                value={qa.answer}
                                onChangeText={(text) => setCustomQAs((prev) => prev.map((item, i) => i === qaIdx ? { ...item, answer: text } : item))}
                                multiline
                                maxLength={200}
                              />
                            </View>
                          );
                        })}

                        {/* Add question button */}
                        {customQAs.length < 3 && (
                          <TouchableOpacity
                            style={[styles.addQuestionBtn, { borderColor: C.borderLight }]}
                            onPress={() => {
                              const usedQuestions = customQAs.map((q) => q.question);
                              const available = placeQuestions.filter((q) => !usedQuestions.includes(q));
                              if (available.length === 0) return;
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setCustomQAs((prev) => [...prev, { question: available[Math.floor(Math.random() * available.length)], answer: '' }]);
                            }}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="add-circle-outline" size={18} color={C.primary} />
                            <Text style={[styles.addQuestionText, { color: C.primary }]}>Ajouter une question</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Confirm button */}
            <View style={[styles.customizeFooter, { borderTopColor: C.border }]}>
              <TouchableOpacity
                style={[styles.customizeConfirmBtn, { backgroundColor: C.primary }]}
                onPress={confirmPlace}
                activeOpacity={0.8}
              >
                <Ionicons name={editingPlaceIndex !== null ? 'checkmark' : 'add'} size={18} color={Colors.textOnAccent} style={{ marginRight: 6 }} />
                <Text style={styles.customizeConfirmText}>{editingPlaceIndex !== null ? 'Enregistrer' : 'Ajouter ce lieu'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ========== SAVED PLAN PICKER ==========
            Disponible UNIQUEMENT à l'étape titre en mode `fresh`. Au pick,
            `prefillFromSavedPlan` préremplit tout, bascule en `fromSaved`
            et saute à l'étape "lieux" (cf. son implémentation plus haut)
            pour que l'action soit perceptible. */}
        <SavedPlanPickerSheet
          visible={showSavedPlanPicker}
          onClose={() => setShowSavedPlanPicker(false)}
          onPick={(plan) => {
            prefillFromSavedPlan(plan);
          }}
          title="Partir d'un plan sauvegardé"
          subtitle="Tu pourras ajuster les lieux, puis donner ton propre nom au plan."
        />

        {/* ========== DURATION PICKER (customize mode — étape lieux) ========== */}
        {(() => {
          const target = durationPickerPlaceId
            ? places.find((p) => p.id === durationPickerPlaceId) || null
            : null;
          return (
            <DurationPickerSheet
              visible={!!target}
              onClose={() => setDurationPickerPlaceId(null)}
              currentMinutes={target?.duration ? parseInt(target.duration, 10) : null}
              placeName={target?.name}
              placeCategory={target?.placeTypes?.[0] || target?.type}
              onConfirm={async (minutes) => {
                if (!target) return;
                // Le picker utilise null pour clear ; ici on stocke en string.
                const value = minutes == null ? '' : String(minutes);
                updatePlaceDuration(target.id, value);
                // Si la pill toggle (= la valeur posée est égale à la précédente),
                // updatePlaceDuration vide. On pose explicitement la valeur
                // pour éviter ce comportement quand on confirme via le sheet.
                setPlaces((prev) => prev.map((p) =>
                  p.id === target.id ? { ...p, duration: value } : p,
                ));
                setDurationPickerPlaceId(null);
              }}
            />
          );
        })()}

        {/* ========== PRICE PICKER (customize mode — étape lieux) ========== */}
        {(() => {
          const target = pricePickerPlaceId
            ? places.find((p) => p.id === pricePickerPlaceId) || null
            : null;
          return (
            <PricePickerSheet
              visible={!!target}
              onClose={() => setPricePickerPlaceId(null)}
              currentRangeIndex={target?.priceRangeIndex ?? -1}
              currency={cityConfig.currency}
              placeName={target?.name}
              onConfirm={async (rangeIndex) => {
                if (!target) return;
                // -1 = clear ; 0..5 = un range posé. updatePlacePriceRange
                // toggle si on retap le même index — on évite ça en posant
                // explicitement la valeur.
                setPlaces((prev) => prev.map((p) =>
                  p.id === target.id
                    ? { ...p, priceRangeIndex: rangeIndex, exactPrice: rangeIndex < 0 ? '' : p.exactPrice }
                    : p,
                ));
                setPricePickerPlaceId(null);
              }}
            />
          );
        })()}

        {/* ========== PREVIEW MODAL ========== */}
        <Modal visible={showPreview} animationType="slide" presentationStyle="pageSheet">
          <View style={[styles.previewModal, { backgroundColor: C.white, paddingTop: insets.top }]}>
            <View style={[styles.previewHeader, { borderBottomColor: C.border }]}>
              {previewMode === 'detail' ? (
                <TouchableOpacity onPress={() => setPreviewMode('card')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="chevron-back" size={22} color={C.primary} />
                  <Text style={[styles.previewBackText, { color: C.primary }]}>Feed</Text>
                </TouchableOpacity>
              ) : (
                <Text style={[styles.previewTitle, { color: C.black }]}>Preview</Text>
              )}
              <TouchableOpacity onPress={() => { setShowPreview(false); setPreviewMode('card'); }}>
                <Ionicons name="close" size={24} color={C.black} />
              </TouchableOpacity>
            </View>

            {previewMode === 'card' ? (
              <>
                <Text style={[styles.previewSubtitle, { color: C.gray600 }]}>
                  Voici comment ton plan apparaîtra dans le feed
                </Text>
                <ScrollView contentContainerStyle={styles.previewScroll} showsVerticalScrollIndicator={false}>
                  <PlanCard
                    plan={buildPreviewPlan()}
                    isLiked={false}
                    isSaved={false}
                    onPress={() => setPreviewMode('detail')}
                    onLike={() => {}}
                    onSave={() => {}}
                    onComment={() => {}}
                    onAuthorPress={() => {}}
                  />
                </ScrollView>
              </>
            ) : (
              <PreviewDetail plan={buildPreviewPlan()} C={C} t={t} />
            )}
          </View>
        </Modal>

        {/* ========== PUBLISH BOTTOM SHEET ========== */}
        {showPublishSheet && (
          <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={closePublishSheet}>
            <Animated.View style={[styles.sheetContainer, { backgroundColor: C.white, transform: [{ translateY: sheetSlide }] }]}>
              <TouchableOpacity activeOpacity={1}>
                <View style={[styles.sheetHandle, { backgroundColor: C.gray400 }]} />
                <Text style={[styles.sheetTitle, { color: C.black }]}>Almost a perfect plan ✦</Text>
                <Text style={[styles.sheetSubtitle, { color: C.gray600 }]}>Ton plan serait encore mieux avec :</Text>
                {missingCriteria.map((c, i) => (
                  <View key={i} style={[styles.sheetCriterion, { borderBottomColor: C.borderLight }]}>
                    <Text style={styles.sheetCriterionIcon}>{c.icon}</Text>
                    <Text style={[styles.sheetCriterionText, { color: C.black }]}>{c.text}</Text>
                  </View>
                ))}
                <View style={styles.sheetButtons}>
                  <TouchableOpacity style={[styles.sheetBtnOutline, { borderColor: Colors.primary }]} onPress={closePublishSheet} activeOpacity={0.7}>
                    <Text style={[styles.sheetBtnOutlineText, { color: Colors.primary }]}>Continuer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.sheetBtnFill, { backgroundColor: Colors.primary }]} onPress={() => { closePublishSheet(); handlePublish(); }} activeOpacity={0.7}>
                    <Text style={styles.sheetBtnFillText}>Publier quand même</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </Animated.View>
          </TouchableOpacity>
        )}
        {/* ========== RESUME EDIT BOTTOM SHEET ========== */}
        {showResumeSheet && (
          <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={handleDiscardResume}>
            <Animated.View style={[styles.sheetContainer, { backgroundColor: C.white, transform: [{ translateY: resumeSheetSlide }] }]}>
              <TouchableOpacity activeOpacity={1}>
                <View style={[styles.sheetHandle, { backgroundColor: C.gray400 }]} />
                <Text style={[styles.sheetTitle, { color: C.black }]}>Modification en cours</Text>
                <Text style={[styles.sheetSubtitle, { color: C.gray600 }]}>Tu avais commencé à modifier ce plan — continuer ?</Text>
                <View style={styles.sheetButtons}>
                  <TouchableOpacity style={[styles.sheetBtnOutline, { borderColor: C.gray500 }]} onPress={handleDiscardResume} activeOpacity={0.7}>
                    <Text style={[styles.sheetBtnOutlineText, { color: C.gray700 }]}>Annuler les modifications</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.sheetBtnFill, { backgroundColor: Colors.primary }]} onPress={handleResumeDraft} activeOpacity={0.7}>
                    <Text style={styles.sheetBtnFillText}>Reprendre</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </Animated.View>
          </TouchableOpacity>
        )}

        {/* ========== PICK UP DRAFT BOTTOM SHEET (non-blocking) ========== */}
        {pickupDraft && (
          <Animated.View style={[styles.pickupSheet, { backgroundColor: C.white, transform: [{ translateY: pickupSheetSlide }] }]}>
            <View style={[styles.sheetHandle, { backgroundColor: C.gray400 }]} />
            <Text style={[styles.pickupTitle, { color: C.black }]}>Pick up where you left off?</Text>
            <Text style={[styles.pickupSubtitle, { color: C.gray600 }]}>
              {pickupDraft.title
                ? pickupDraft.title
                : `Untitled plan · ${pickupDraft.places.length} place${pickupDraft.places.length !== 1 ? 's' : ''} added`}
            </Text>
            <View style={styles.sheetButtons}>
              <TouchableOpacity style={[styles.sheetBtnOutline, { borderColor: C.gray500 }]} onPress={handlePickupNew} activeOpacity={0.7}>
                <Text style={[styles.sheetBtnOutlineText, { color: C.gray700 }]}>New plan</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sheetBtnFill, { backgroundColor: Colors.primary }]} onPress={handlePickupResume} activeOpacity={0.7}>
                <Text style={styles.sheetBtnFillText}>Resume draft</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* Photo Editor */}
        <PhotoEditorSheet
          visible={editingPhotoIdx !== null}
          photoUri={editingPhotoIdx !== null ? coverPhotos[editingPhotoIdx] : ''}
          onApply={(newUri) => {
            if (editingPhotoIdx !== null) {
              setCoverPhotos((prev) => prev.map((u, i) => i === editingPhotoIdx ? newUri : u));
            }
            setEditingPhotoIdx(null);
          }}
          onClose={() => setEditingPhotoIdx(null)}
        />

        {/* Draft saved toast */}
        {showDraftToast && (
          <Animated.View style={[styles.draftToast, { opacity: draftToastAnim, transform: [{ translateY: draftToastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]} pointerEvents="none">
            <Ionicons name="cloud-done-outline" size={14} color="#8B7B6B" />
            <Text style={styles.draftToastText}>Draft saved ✦</Text>
          </Animated.View>
        )}

      </View>
      {/* Proof Camera host — fullscreen branded camera triggered by
          cover & spot photo CTAs. */}
      <proofCamera.ProofCameraHost />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 22, fontFamily: Fonts.displaySemiBold, letterSpacing: -0.3 },
  // ── Wizard header + progress + footer (3-step flow) ──
  wizardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  wizardHeaderSide: {
    width: 32,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  wizardHeaderCenter: {
    flex: 1,
    alignItems: 'center',
  },
  wizardStepLabel: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  wizardStepTitle: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    letterSpacing: -0.2,
  },
  wizardProgress: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 10,
    paddingBottom: 4,
  } as any,
  wizardProgressSeg: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  stepIntro: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.body,
    marginTop: 4,
    marginBottom: 20,
  },
  stepIntroCompact: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.body,
  },
  s4Header: {
    marginBottom: 10,
  },

  // ── STEP 3: Editorial categories (horizontal chips + subcategory cards) ──
  s3Overline: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    letterSpacing: 1.3,
    marginBottom: 10,
  },
  s3ChipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 24,
  } as any,
  s3Chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 99,
    borderWidth: 1.5,
    borderColor: Colors.borderMedium,
    backgroundColor: 'transparent',
  } as any,
  s3ChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.terracotta100,
  },
  s3ChipEmoji: {
    fontSize: 15,
  },
  s3ChipText: {
    fontSize: 13,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textPrimary,
  },
  s3ChipTextActive: {
    color: Colors.terracotta700,
    fontFamily: Fonts.bodySemiBold,
  },

  // Subcategory blocks (scrollable middle)
  s3SubScroll: {
    flex: 1,
    marginTop: 18,
  },
  s3SubScrollContent: {
    paddingBottom: 12,
  } as any,
  s3SubBlock: {
    marginBottom: 18,
  },
  s3SubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  s3SubHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    flexWrap: 'nowrap',
  } as any,
  s3SubHeaderEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  s3SubHeaderTitle: {
    fontSize: 15,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  s3SubHeaderSep: {
    fontSize: 13,
    color: Colors.textTertiary,
    marginHorizontal: 6,
  },
  s3SubHeaderHint: {
    fontSize: 12,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    color: Colors.textTertiary,
  },
  s3SubHeaderCount: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
    letterSpacing: 0.2,
  },

  s3CardsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: 24,
    paddingTop: 6,
    paddingBottom: 2,
  } as any,
  s3Card: {
    width: 84,
    height: 92,
    borderRadius: 16,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1.5,
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
    position: 'relative',
  } as any,
  s3CardActive: {
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: Colors.terracotta100,
  },
  s3CardEmoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  s3CardName: {
    fontSize: 11,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 13,
  },
  s3CardNameActive: {
    color: Colors.terracotta700,
    fontFamily: Fonts.bodySemiBold,
  },
  s3CardCheck: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2C2420',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 2,
    borderColor: Colors.bgPrimary,
  },

  s3EmptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 22,
    borderRadius: 14,
    backgroundColor: Colors.terracotta50,
    borderWidth: 1,
    borderColor: Colors.terracotta100,
    marginTop: 6,
  } as any,
  s3EmptyText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    color: Colors.textSecondary,
    lineHeight: 18,
  },

  s3Summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.terracotta50,
    marginTop: 8,
  } as any,
  s3SummaryText: {
    fontSize: 14,
    fontFamily: Fonts.body,
    color: Colors.textPrimary,
  },
  s3SummaryStrong: {
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },
  s3SummaryEmpty: {
    fontSize: 13,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    color: Colors.textTertiary,
  },
  // ── STEP 1 (pre-step): Title composer ──
  s0Container: {
    paddingTop: 40,
    paddingBottom: 40,
  },
  s0Prompt: {
    fontSize: 30,
    lineHeight: 36,
    fontFamily: Fonts.displayBold,
    color: Colors.textPrimary,
    letterSpacing: -0.6,
    marginBottom: 10,
  },
  s0Helper: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginBottom: 36,
  },
  s0InputWrap: {
    marginBottom: 12,
  },
  s0Input: {
    fontSize: 26,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.4,
    paddingTop: 0,
    paddingBottom: 10,
    // Single-line only — no minHeight so it sits naturally at line height
  },
  s0InputUnderline: {
    height: 2,
    backgroundColor: Colors.borderMedium,
    borderRadius: 1,
  },
  s0MetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  s0Hint: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
  },
  s0Error: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.error,
  },
  s0Counter: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textTertiary,
  },
  s0Inspirations: {
    gap: 8,
  } as any,
  s0InspirationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  // Chips d'idées de titre — design CoPlanInviteSheet (compact, primaryDeep)
  s0IdeasWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  s0IdeaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: Colors.terracotta50,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.terracotta100,
  },
  s0IdeaChipText: {
    fontSize: 12.5,
    fontFamily: Fonts.bodyMedium,
    color: Colors.primaryDeep,
  },
  s0ImportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.terracotta300,
    marginBottom: 18,
  },
  s0ImportIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.terracotta50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  s0ImportTitle: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  s0ImportHint: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
  },
  // Breadcrumb du plan source — affiché en haut de l'étape titre quand
  // l'user arrive après un import. Plus discret que le bouton import :
  // c'est juste un rappel contextuel ("tu pars de X"), pas un CTA.
  s0SourceBreadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: Colors.terracotta50,
    marginBottom: 14,
  },
  s0SourceBreadcrumbText: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  s0SourceBreadcrumbTitle: {
    fontFamily: Fonts.bodySemiBold,
    color: Colors.terracotta600,
  },
  s0InspirationLabel: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    letterSpacing: 1.3,
    marginBottom: 4,
  },
  s0InspirationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.terracotta50,
    borderWidth: 1,
    borderColor: Colors.terracotta100,
  } as any,
  s0InspirationText: {
    fontSize: 14,
    fontFamily: Fonts.bodyMedium,
    color: Colors.terracotta700,
    flex: 1,
  },

  // Title recap inside the photo step (below thumbnails)
  s1TitleRecap: {
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: Colors.bgTertiary,
  },
  s1TitleRecapLabel: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    letterSpacing: 1.3,
    marginBottom: 6,
  },
  s1TitleRecapText: {
    fontSize: 17,
    lineHeight: 22,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },

  // ── STEP 2: editorial hero — single photo takes ALL available space ──
  s1Container: {
    flex: 1,
    paddingTop: 4,
    paddingBottom: 4,
  },
  s1Hero: {
    // Flex-sized so the single photo fills ALL available vertical space
    flex: 1,
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: Colors.bgTertiary,
    shadowColor: '#2C2420',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 10,
    alignSelf: 'center',
  },
  s1HeroEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: Colors.terracotta200,
    borderRadius: 24,
    backgroundColor: Colors.terracotta50,
    padding: 32,
  },
  s1HeroIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.terracotta100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  s1HeroEmptyTitle: {
    fontSize: 20,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  s1HeroEmptySub: {
    fontSize: 14,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
    marginBottom: 24,
  },
  s1HeroEmptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 99,
    backgroundColor: Colors.primary,
  } as any,
  s1HeroEmptyCtaText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
    letterSpacing: 0.1,
  },
  s1HeroImg: {
    width: '100%',
    height: '100%',
  },
  s1HeroRemove: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(44,36,32,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  s1HeroEditPill: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
    backgroundColor: 'rgba(44,36,32,0.55)',
  } as any,
  s1HeroEditText: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    color: '#FFF',
    letterSpacing: 0.2,
  },
  s1HeroChangePill: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: 'rgba(250, 247, 242, 0.9)',
  },
  s1HeroChangeText: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  // Additional photo thumbnails row
  s1Thumbs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 28,
  } as any,
  s1Thumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    overflow: 'visible',
    backgroundColor: Colors.bgTertiary,
    position: 'relative',
  },
  s1ThumbImg: {
    width: 56,
    height: 56,
    borderRadius: 12,
  },
  s1ThumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  s1ThumbAdd: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: Colors.bgTertiary,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.borderMedium,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Title — big editorial input
  s1TitleWrap: {
    marginTop: 4,
  },
  s1TitleLabel: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    letterSpacing: 1.3,
    marginBottom: 10,
  },
  s1TitleInput: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    paddingTop: 6,
    paddingBottom: 14,
    minHeight: 70,
    borderBottomWidth: 2,
    borderBottomColor: Colors.borderMedium,
  },
  s1TitleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  s1TitleHint: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
  },
  s1TitleError: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.error,
  },
  s1TitleCounter: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textTertiary,
  },
  wizardFooter: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  wizardPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 54,
    borderRadius: 16,
  } as any,
  wizardPrimaryBtnText: {
    fontSize: 15,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 0.15,
  },
  costPill: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  costText: { fontSize: 11, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: Layout.screenPadding, paddingBottom: 40 },
  // Draft banner
  // Draft toast
  draftToast: { position: 'absolute', bottom: 30, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EDE8E0', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, shadowColor: 'rgba(44,36,32,1)', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 4 },
  draftToastText: { fontSize: 11, fontWeight: '600', color: '#8B7B6B', letterSpacing: 0.3 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8, marginTop: 6 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  errorText: { fontSize: 11, color: Colors.error, marginTop: -6, marginBottom: 8, marginLeft: 2 },
  placesCount: { fontSize: 11, marginBottom: 6, marginLeft: 2 },

  // Place card
  placeCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 0 },
  placeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  placeNumber: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  placeNumberText: { fontSize: 12, fontWeight: '700', color: Colors.textOnAccent },
  placeCardInfo: { flex: 1 },
  placeName: { fontSize: 13, fontWeight: '700' },
  placeType: { fontSize: 11, marginTop: 1 },
  reservationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, paddingTop: 5 },
  reservationLabel: { fontSize: 11 },
  reservationToggle: { width: 34, height: 18, borderRadius: 9, justifyContent: 'center', paddingHorizontal: 2 },
  reservationThumb: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#FFFFFF' },
  reservationThumbOn: { alignSelf: 'flex-end' },
  placeRemove: { fontSize: 14, paddingHorizontal: 6 },
  customizeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  customizeBtnText: { fontSize: 12, fontWeight: '600' },
  placeInputsRow: { flexDirection: 'row' },
  placeInputGroup: { flex: 1 },
  placeInputLabel: { fontSize: 10, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  placeInputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 10, height: 36, borderWidth: 1.5 },
  placeInput: { flex: 1, fontSize: 14, fontWeight: '600', paddingVertical: 0 },
  placeInputUnit: { fontSize: 12, fontWeight: '600', marginLeft: 4 },
  miniError: { fontSize: 10, color: Colors.error, marginTop: 2 },
  durationChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  durationChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  durationChipText: { fontSize: 12, fontWeight: '600' },

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
  previewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, marginBottom: 10 },
  previewBtnText: { fontSize: 14, fontFamily: Fonts.displaySemiBold },
  previewModal: { flex: 1 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingVertical: 12, borderBottomWidth: 1 },
  previewTitle: { fontSize: 20, fontFamily: Fonts.displaySemiBold },
  previewBackText: { fontSize: 15, fontFamily: Fonts.bodySemiBold },
  previewSubtitle: { fontSize: 13, textAlign: 'center', marginTop: 12, marginBottom: 16, fontFamily: Fonts.body },
  previewScroll: { paddingBottom: 40 },
  publishSection: { marginTop: 20, marginBottom: 10 },
  publishBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, overflow: 'hidden' },
  publishBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  publishBtnText: { fontSize: 15, fontFamily: Fonts.displaySemiBold },
  publishHint: { fontSize: 12, textAlign: 'center', marginBottom: 8, fontFamily: Fonts.body },
  costNote: { fontSize: 12, textAlign: 'center', marginTop: 10 },

  // Publish bottom sheet
  sheetOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end', zIndex: 999 },
  sheetContainer: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingBottom: 34 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '800', fontFamily: Fonts.displaySemiBold, marginBottom: 4 },
  sheetSubtitle: { fontSize: 13, fontFamily: Fonts.body, marginBottom: 14 },
  sheetCriterion: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  sheetCriterionIcon: { fontSize: 16, marginRight: 10 },
  sheetCriterionText: { fontSize: 14, fontFamily: Fonts.bodySemiBold },
  sheetButtons: { flexDirection: 'row', gap: 10, marginTop: 18 },
  sheetBtnOutline: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  sheetBtnOutlineText: { fontSize: 14, fontFamily: Fonts.displaySemiBold },
  sheetBtnFill: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  sheetBtnFillText: { fontSize: 14, fontFamily: Fonts.displaySemiBold, color: Colors.textOnAccent },
  // Pickup draft sheet (non-blocking — no overlay)
  pickupSheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 900,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingBottom: 34,
    shadowColor: 'rgba(44,36,32,1)', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 12,
  },
  pickupTitle: { fontSize: 18, fontWeight: '800', fontFamily: Fonts.displaySemiBold, marginBottom: 4 },
  pickupSubtitle: { fontSize: 13, fontFamily: Fonts.body, marginBottom: 14 },
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

  // Photo picker
  photosPickerScroll: { flexGrow: 0, marginBottom: 4 },
  photosPickerContainer: { gap: 8 },
  photoThumbWrap: { position: 'relative' },
  photoThumb: { width: 90, height: 90, borderRadius: 12 },
  photoRemoveBtn: { position: 'absolute', top: -6, right: -6 },
  photoEditBtn: { position: 'absolute', bottom: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  photoAddBtn: { width: 90, height: 90, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  photoAddText: { fontSize: 10, fontFamily: Fonts.bodySemiBold, marginTop: 4 },
  photoHint: { fontSize: 11, fontFamily: Fonts.body, marginBottom: 12 },

  // Category group chips
  filterRowLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  groupChipsScroll: { flexGrow: 0, marginBottom: 12 },
  groupChipsContainer: { gap: 8 },
  groupChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  groupChipEmoji: { fontSize: 13, marginRight: 5 },
  groupChipText: { fontSize: 12, fontFamily: Fonts.bodySemiBold },

  // Category sections & cards
  categorySectionWrap: { marginBottom: 12 },
  categorySectionTitle: { fontSize: 10, fontFamily: Fonts.bodySemiBold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  flatSubcatRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  flatSubcatEmoji: { fontSize: 28, width: 40, textAlign: 'center', marginRight: 12 },
  flatSubcatTextCol: { flex: 1 },
  flatSubcatName: { fontSize: 15, fontFamily: Fonts.bodySemiBold },
  flatSubcatSub: { fontSize: 11, marginTop: 2 },

  // Selected tags
  selectedTagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, marginBottom: 4 },
  selectedTagChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, gap: 4 },
  selectedTagText: { fontSize: 11, fontFamily: Fonts.bodySemiBold },

  // ========== PLACE CUSTOMIZATION MODAL ==========
  customizeContainer: { flex: 1 },
  customizeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingVertical: 14, borderBottomWidth: 1 },
  customizeTitle: { fontSize: 16, fontFamily: Fonts.displaySemiBold, flex: 1, textAlign: 'center' },
  customizeScroll: { paddingBottom: 40 },
  customizeBanner: { height: 200, position: 'relative' },
  customizeBannerImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  customizeBannerPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  customizeBannerOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 },
  customizeBannerInfo: { position: 'absolute', bottom: 16, left: 16, right: 16 },
  customizeBannerName: { fontSize: 20, fontFamily: Fonts.displaySemiBold, color: Colors.textOnAccent, textShadowColor: 'rgba(44,36,32,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  customizeBannerType: { fontSize: 12, fontFamily: Fonts.body, color: 'rgba(255,248,240,0.8)', marginTop: 2 },
  customizeSectionTitle: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: Layout.screenPadding, paddingTop: 20, paddingBottom: 12 },
  customizeBlock: { marginHorizontal: Layout.screenPadding, marginBottom: 14, borderRadius: 14, borderWidth: 1, padding: 14 },
  customizeBlockHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  customizeBlockIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  customizeBlockTitle: { fontSize: 14, fontFamily: Fonts.bodySemiBold, flex: 1 },
  customizeBlockHint: { fontSize: 13, fontFamily: Fonts.displayItalic },
  customizePhotoPreview: { width: '100%', height: 140, borderRadius: 10, resizeMode: 'cover', marginTop: 4 },
  customizeInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, fontFamily: Fonts.body, minHeight: 60, textAlignVertical: 'top' },
  customizeQuestion: { fontSize: 13, fontFamily: Fonts.displayItalic, marginBottom: 8 },
  questionPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  questionPickerText: { fontSize: 13, fontFamily: Fonts.bodySemiBold, flex: 1, marginRight: 8 },
  questionDropdown: { borderRadius: 10, borderWidth: 1, marginTop: 6, overflow: 'hidden' },
  questionOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1 },
  questionOptionText: { fontSize: 13, fontFamily: Fonts.body, flex: 1, marginRight: 8 },
  addQuestionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed' },
  addQuestionText: { fontSize: 13, fontFamily: Fonts.bodySemiBold },
  customizeFooter: { borderTopWidth: 1, paddingHorizontal: Layout.screenPadding, paddingVertical: 14 },
  customizeConfirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14 },
  customizeConfirmText: { fontSize: 15, fontFamily: Fonts.displaySemiBold, color: Colors.textOnAccent },

  // Reorder UI
  customizeSectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: Layout.screenPadding },
  reorderToggle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  customizeBlockReorder: { opacity: 0.92, borderStyle: 'dashed' },
  reorderArrows: { flexDirection: 'column', alignItems: 'center', marginRight: 4 },

  // ─────────────────────────────────────────────────────────────
  // STEP 4 — Editorial Timeline (tl*)
  // ─────────────────────────────────────────────────────────────
  tlHeader: {
    marginBottom: 14,
  },
  tlHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  tlHeaderTitle: {
    fontSize: 24,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    flex: 1,
  },
  tlHeaderCount: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textTertiary,
  },
  tlHeaderSub: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 17,
  },

  // Timeline backbone
  tlWrap: {
    position: 'relative',
  },
  tlBackbone: {
    position: 'absolute',
    left: 15,
    top: 16,
    bottom: 28,
    width: 2,
    backgroundColor: Colors.terracotta200,
    zIndex: 0,
  },
  tlRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    position: 'relative',
  },

  // Node (circle badge)
  tlNode: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.bgPrimary,
    marginTop: 10,
    marginRight: 12,
    zIndex: 2,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 2,
  },
  tlNodeText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    fontWeight: '700' as const,
    color: Colors.textOnAccent,
  },
  tlNodeFocus: {
    shadowOpacity: 0.35,
    shadowRadius: 10,
    transform: [{ scale: 1.05 }],
  },
  tlNodeDragging: {
    shadowOpacity: 0.45,
    shadowRadius: 14,
    transform: [{ scale: 1.1 }],
  },
  tlNodeAdd: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.terracotta400,
    borderStyle: 'dashed',
    shadowOpacity: 0,
  },

  // Card (place)
  tlCard: {
    flex: 1,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: 'rgba(44, 36, 32, 1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  tlCardPressed: {
    backgroundColor: Colors.terracotta50,
  },
  tlCardExpanded: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  tlCardDragging: {
    borderColor: Colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },

  // Collapsed top row
  tlCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tlThumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: Colors.bgTertiary,
  },
  tlThumbImg: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Placeholder cliquable en customize mode — encourage à ajouter une photo
  tlThumbPlaceholder: {
    backgroundColor: Colors.terracotta50,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
  },

  // ── Carte customize mode (étape "Personnalise tes lieux") ──
  // Jauge complétion + 3 chips CTA dimensionnés. Toute la palette est en
  // terracotta — pas de vert (palette stricte de l'app).
  czGauge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 8,
  },
  czGaugeDots: {
    flexDirection: 'row',
    gap: 4,
  },
  czGaugeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.borderMedium,
  },
  czGaugeDotOn: {
    backgroundColor: Colors.primary,
  },
  czGaugeText: {
    fontSize: 10.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    letterSpacing: 0.4,
  },
  czChipsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  czChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderRadius: 99,
    backgroundColor: Colors.terracotta50,
    borderWidth: 1.2,
    borderColor: Colors.primary,
    minHeight: 38,
  },
  czChipFilled: {
    backgroundColor: Colors.terracotta100,
    borderColor: Colors.terracotta300,
  },
  czChipText: {
    fontSize: 11.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
    flexShrink: 1,
  },
  czChipTextFilled: {
    color: Colors.terracotta700,
  },

  // Toggle "Réserver à l'avance" — discret, sous les chips, en customize
  czReserveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  czReserveLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  czReserveText: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
  },
  czReserveTextActive: {
    color: Colors.primary,
    fontFamily: Fonts.bodySemiBold,
  },
  // Mini-switch terracotta
  czSwitch: {
    width: 30,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.borderMedium,
    padding: 2,
    justifyContent: 'center',
  },
  czSwitchOn: {
    backgroundColor: Colors.primary,
  },
  czSwitchThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.bgSecondary,
  },
  czSwitchThumbOn: {
    transform: [{ translateX: 12 }],
  },
  tlCardInfo: {
    flex: 1,
    minWidth: 0,
  },
  tlPlaceName: {
    fontSize: 15,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  tlPlaceAddr: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  tlRemoveBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgTertiary,
  },

  // Meta inline row
  tlMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  tlMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tlMetaEmoji: {
    fontSize: 11,
  },
  tlMetaText: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
  },
  tlMetaPlaceholder: {
    color: Colors.textTertiary,
    fontStyle: 'italic',
  },
  // Pill 'add' — affordance visuelle quand durée ou prix ne sont pas remplis
  tlMetaAddPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: Colors.terracotta400,
    backgroundColor: Colors.terracotta50,
  },
  tlMetaAddText: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.terracotta700,
    letterSpacing: 0.3,
    marginLeft: 1,
  },
  tlMetaSep: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
  tlCustomBadge: {
    backgroundColor: Colors.terracotta100,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
    marginLeft: 'auto',
  },
  tlCustomBadgeText: {
    fontSize: 10.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.terracotta700,
    letterSpacing: 0.2,
  },

  // Expanded section content
  tlExpanded: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  tlFieldLabel: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    letterSpacing: 1.1,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
  },
  tlPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tlPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: Colors.borderMedium,
    backgroundColor: 'transparent',
  },
  tlPillActive: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
    backgroundColor: Colors.terracotta100,
  },
  tlPillText: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textPrimary,
  },
  tlPillTextActive: {
    color: Colors.terracotta700,
    fontFamily: Fonts.bodySemiBold,
  },
  // Bouton "ouvrir le picker" (sheet) — remplace la row de pills inline
  // pour les champs durée + prix. Système unifié avec le mode customize.
  tlPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: Colors.primary,
    backgroundColor: Colors.terracotta50,
  },
  tlPickerBtnFilled: {
    backgroundColor: Colors.terracotta100,
    borderColor: Colors.terracotta300,
  },
  tlPickerBtnText: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },
  tlPickerBtnTextFilled: {
    color: Colors.terracotta700,
  },
  tlGhostLink: {
    fontSize: 11.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },
  tlExactPriceWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgPrimary,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 38,
    maxWidth: 140,
    marginTop: 8,
  },
  tlExactPriceInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  tlExactPriceUnit: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
    marginLeft: 4,
  },

  // Toggle book in advance
  tlToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Colors.bgPrimary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  tlToggleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tlToggleTitle: {
    fontSize: 13,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textPrimary,
  },
  tlToggleHint: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  tlSwitch: {
    width: 40,
    height: 22,
    borderRadius: 99,
    backgroundColor: Colors.borderMedium,
    paddingHorizontal: 2,
    justifyContent: 'center',
  },
  tlSwitchOn: {
    backgroundColor: Colors.primary,
  },
  tlSwitchThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    shadowColor: 'rgba(44, 36, 32, 1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  tlSwitchThumbOn: {
    alignSelf: 'flex-end',
  },

  // Personalize button
  tlPersonalizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.terracotta300,
    backgroundColor: 'transparent',
  },
  tlPersonalizeBtnDone: {
    borderColor: Colors.primary,
    backgroundColor: Colors.terracotta50,
  },
  tlPersonalizeText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },

  // Transition pill (between places)
  tlTransitionRow: {
    marginLeft: 0,
    marginVertical: 4,
    alignItems: 'flex-start',
    paddingLeft: 0,
    zIndex: 3,
  },
  tlTransitionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.bgPrimary,
    marginLeft: 0,
    alignSelf: 'flex-start',
    position: 'relative',
    left: 0,
  },
  tlTransitionPillActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.terracotta50,
  },
  tlTransitionEmoji: {
    fontSize: 13,
  },
  tlTransitionText: {
    fontSize: 11,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
  },
  tlTransitionCard: {
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    marginLeft: 44,
    shadowColor: 'rgba(44, 36, 32, 1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  tlTransportPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: Colors.borderMedium,
    backgroundColor: 'transparent',
  },
  tlTransportPillActive: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
    backgroundColor: Colors.terracotta100,
  },
  tlTransportPillText: {
    fontSize: 11.5,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textPrimary,
  },
  tlTransportPillTextActive: {
    color: Colors.terracotta700,
    fontFamily: Fonts.bodySemiBold,
  },
  tlTransitionHint: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    marginTop: 10,
    fontStyle: 'italic',
  },

  // Add place CTA card
  tlAddCard: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.terracotta400,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tlAddCardStandalone: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.terracotta400,
    borderStyle: 'dashed',
    backgroundColor: Colors.terracotta50,
    marginTop: 12,
  },
  tlAddText: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },

  // Empty state
  tlEmptyState: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  tlEmptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.terracotta100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  tlEmptyTitle: {
    fontSize: 17,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  tlEmptyHint: {
    fontSize: 12.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },

  // Recap pill (compact)
  tlRecapPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 14,
    marginHorizontal: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.terracotta50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.terracotta100,
  },
  tlRecapItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tlRecapEmoji: {
    fontSize: 13,
  },
  tlRecapValue: {
    fontSize: 12.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },
  tlRecapLabel: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginLeft: 2,
  },
  tlRecapSep: {
    width: 1,
    height: 14,
    backgroundColor: Colors.terracotta200,
  },
  tlRecapTransport: {
    fontSize: 13,
    marginLeft: 1,
  },

  // Visibility bandeau
  tlVisibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    paddingVertical: 10,
    marginBottom: 4,
  },
  tlVisibilityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tlVisibilityIcon: {
    fontSize: 14,
  },
  tlVisibilityLabel: {
    fontSize: 12.5,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
  },
  tlVisibilityEdit: {
    fontSize: 12.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },

  // Visibility sheet
  tlVisSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(44, 36, 32, 0.4)',
    justifyContent: 'flex-end',
  },
  tlVisSheet: {
    backgroundColor: Colors.bgPrimary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  tlVisSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderMedium,
    alignSelf: 'center',
    marginBottom: 14,
  },
  tlVisSheetTitle: {
    fontSize: 18,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  tlVisOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.bgSecondary,
    marginBottom: 10,
  },
  tlVisOptionActive: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
    backgroundColor: Colors.terracotta50,
  },
  tlVisOptionEmoji: {
    fontSize: 22,
  },
  tlVisOptionTitle: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },
  tlVisOptionTitleActive: {
    color: Colors.terracotta700,
  },
  tlVisOptionHint: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // ─────────────────────────────────────────────────────────────
  // STEP 5 — Creator tip (editorial mandatory sentence)
  // ─────────────────────────────────────────────────────────────
  tipHeader: {
    marginBottom: 18,
  },
  tipOverline: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    letterSpacing: 1.3,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  tipTitle: {
    fontSize: 26,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  tipSubtitle: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  tipInputWrap: {
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1.5,
    borderColor: Colors.terracotta200,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: 'rgba(44, 36, 32, 1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  tipQuoteMark: {
    fontSize: 38,
    lineHeight: 38,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.terracotta400,
    marginBottom: -8,
  },
  tipInput: {
    fontSize: 17,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    color: Colors.textPrimary,
    lineHeight: 24,
    minHeight: 90,
    paddingTop: 4,
    paddingHorizontal: 0,
    paddingBottom: 4,
  },
  tipFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
  },
  tipHint: {
    fontSize: 11.5,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textTertiary,
  },
  tipCount: {
    fontSize: 11.5,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textTertiary,
  },
  tipSuggestions: {
    gap: 6,
  },
  tipSuggestionsLabel: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    letterSpacing: 1.1,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  tipSuggestionChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.bgSecondary,
  },
  tipSuggestionText: {
    fontSize: 12.5,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    color: Colors.textSecondary,
  },
});
