import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  Animated,
  PanResponder,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout, Fonts, EXPLORE_GROUPS, PERSON_FILTERS } from '../constants';
import { TITLE_SUGGESTIONS, pickRandomSuggestions } from '../constants/suggestions';
import { useColors } from '../hooks/useColors';
import { useCity } from '../hooks/useCity';
import { useAuthStore } from '../store/authStore';
import { useDoItNowStore } from '../store/doItNowStore';
import { useSavedPlacesStore } from '../store/savedPlacesStore';
import { useDraftStore, DraftItem } from '../store/draftStore';
import { CategoryTag, Place, Plan, DoItNowTransport } from '../types';
import { TransportChooser } from '../components/TransportChooser';
import { SavedPlanPickerSheet } from '../components/SavedPlanPickerSheet';
import {
  searchPlacesAutocomplete,
  getPlaceDetails,
  getReadableType,
  GooglePlaceAutocomplete,
} from '../services/googlePlacesService';

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
  const route = useRoute<any>();
  const C = useColors();
  const cityConfig = useCity();
  const CITY_CENTER = cityConfig.coordinates;
  const user = useAuthStore((s) => s.user);
  const savedPlacesList = useSavedPlacesStore((s) => s.places);

  // ── State ──
  const [title, setTitle] = useState('');
  const [selectedTags, setSelectedTags] = useState<CategoryTag[]>([]);
  // Note : `showSubcategories` / `selectedGroup` state has been retired.
  // The "Voir +" toggle is gone ; subcategories now expand inline under
  // each selected theme chip (same pattern as the plan creation flow).
  const [places, setPlaces] = useState<PlaceEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showTransport, setShowTransport] = useState(false);
  const [tempPlan, setTempPlan] = useState<Plan | null>(null);
  const [pickedTransport, setPickedTransport] = useState<DoItNowTransport | null>(null);

  // "Partir d'un plan sauvegardé" — picker pour préfiller le wizard à
  // partir d'un Plan déjà bookmark. Ouvert depuis l'étape 1.
  const [showSavedPlanPicker, setShowSavedPlanPicker] = useState(false);

  /**
   * Préfill : tags + places à partir d'un Plan source. Le user choisira
   * son propre titre — sinon il aurait l'impression de copier le plan
   * d'origine plutôt que de s'en inspirer.
   *
   * Switch sur le flow 'fromSaved' qui réordonne les étapes :
   *   places (préremplis) → title (vide) → vibe (préremplis) → recap
   * Et reset à l'étape 1 pour partir du début (= places).
   */
  const prefillFromSavedPlan = (src: Plan) => {
    setTitle(''); // titre VIDE — le user crée le sien
    setSelectedTags(src.tags || []);
    const newPlaces: PlaceEntry[] = (src.places || []).map((p, idx) => ({
      id: `prefill-${Date.now()}-${idx}`,
      googlePlaceId: p.googlePlaceId || '',
      name: p.name,
      type: p.type || '',
      address: p.address || '',
    }));
    setPlaces(newPlaces);
    setFlowMode('fromSaved');
    setStep(1);
  };

  // ── 4-step Wizard (1: title, 2: vibe, 3: places, 4: launch) ──
  type Step = 1 | 2 | 3 | 4;
  const TOTAL_STEPS: 4 = 4;
  const [step, setStep] = useState<Step>(1);

  /**
   * Le wizard a deux flows distincts :
   *   • 'fresh'     — démarrage depuis zéro : titre → vibe → lieux → transport
   *   • 'fromSaved' — préfill depuis un Plan sauvegardé : on commence par
   *     les LIEUX (préremplis, le user retire/ajoute), puis titre VIDE,
   *     puis catégories préremplies, puis transport.
   *
   * Cette logique mappe le numéro d'étape vers la "clé sémantique" de
   * l'étape — au lieu de hardcoder `step === 1 → titre`, on utilise
   * `stepKey === 'title' → render le titre`. Permet de réordonner sans
   * dupliquer le rendu.
   */
  type FlowMode = 'fresh' | 'fromSaved';
  type StepKey = 'title' | 'vibe' | 'places' | 'recap';
  const [flowMode, setFlowMode] = useState<FlowMode>('fresh');
  const FLOW_ORDER: Record<FlowMode, StepKey[]> = {
    fresh:     ['title',  'vibe', 'places', 'recap'],
    fromSaved: ['places', 'title', 'vibe',  'recap'],
  };
  const stepKey: StepKey = FLOW_ORDER[flowMode][step - 1];

  // Inspirations de titres — re-shuffle au mount, au focus de l'écran
  // ET au tap sur le bouton ↻ (l'écran organize peut rester mounté
  // entre 2 utilisations, useFocusEffect garantit du nouveau contenu).
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

  const canProceedFromStepKey = (k: StepKey): boolean => {
    if (k === 'title')  return title.trim().length >= 3;
    if (k === 'vibe')   return selectedTags.length > 0;
    if (k === 'places') return places.length >= 1;
    if (k === 'recap')  return pickedTransport !== null;
    return false;
  };
  // Backward-compat alias — used in the JSX below.
  const canProceedFromStep = (_s: Step): boolean => canProceedFromStepKey(stepKey);

  const goToNextStep = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step < TOTAL_STEPS) setStep((step + 1) as Step);
  };
  const goToPrevStep = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step > 1) setStep((step - 1) as Step);
  };

  // ── Draft persistence ──
  const draftIdRef = useRef<string>(route.params?.draftId || 'organize-' + Date.now());

  // Pickup draft
  const [pickupDraft, setPickupDraft] = useState<DraftItem | null>(null);
  const pickupSheetSlide = useRef(new Animated.Value(300)).current;

  // Place picker
  const [showPlacePicker, setShowPlacePicker] = useState(false);
  const [placeSearch, setPlaceSearch] = useState('');
  const [placeResults, setPlaceResults] = useState<GooglePlaceAutocomplete[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const DRAG_SWAP_THRESHOLD = 58;

  const getDragY = (id: string): Animated.Value => {
    if (!dragYMap.current[id]) dragYMap.current[id] = new Animated.Value(0);
    return dragYMap.current[id];
  };
  const getDragX = (id: string): Animated.Value => {
    if (!dragXMap.current[id]) dragXMap.current[id] = new Animated.Value(0);
    return dragXMap.current[id];
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
          lastSwapDyRef.current = relDy;
          getDragY(placeId).setValue(0);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } else if (offset < -DRAG_SWAP_THRESHOLD && idx > 0) {
          const next = [...cur];
          [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
          setPlaces(next);
          placesRef.current = next;
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

  // ── Show "Pick up where you left off?" when screen opens with empty form ──
  useFocusEffect(
    useCallback(() => {
      // Don't show if form already has content
      if (title.length > 0 || places.length > 0 || selectedTags.length > 0) return;

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
    }, []) // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handlePickupResume = () => {
    if (!pickupDraft) return;
    useDraftStore.getState().dismissPickup(pickupDraft.id);
    Animated.timing(pickupSheetSlide, { toValue: 300, duration: 200, useNativeDriver: true }).start(() => setPickupDraft(null));
    // Load draft data into OrganizeScreen form
    setTitle(pickupDraft.title);
    setSelectedTags(pickupDraft.selectedTags as CategoryTag[]);
    const loadedPlaces: PlaceEntry[] = pickupDraft.places.map((p) => ({
      id: p.id,
      googlePlaceId: p.googlePlaceId || p.id,
      name: p.name,
      type: p.type,
      address: p.address || '',
    }));
    setPlaces(loadedPlaces);
  };

  const handlePickupNew = () => {
    if (pickupDraft) {
      useDraftStore.getState().dismissPickup(pickupDraft.id);
    }
    Animated.timing(pickupSheetSlide, { toValue: 300, duration: 200, useNativeDriver: true }).start(() => setPickupDraft(null));
  };

  // ── Load draft from params ──
  useEffect(() => {
    const id = route.params?.draftId;
    if (!id) return;
    draftIdRef.current = id;
    const saved = useDraftStore.getState().getDraft(id);
    if (!saved) return;
    setTitle(saved.title);
    setSelectedTags(saved.selectedTags as CategoryTag[]);
    setPlaces(saved.places.map((p) => ({ id: p.id, googlePlaceId: p.googlePlaceId || p.id, name: p.name, type: p.type, address: p.address || '' })));
  }, [route.params?.draftId]);

  // ── Save on blur ──
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      const hasContent = title.length > 0 || places.length > 0 || selectedTags.length > 0;
      if (hasContent) {
        useDraftStore.getState().saveDraft(draftIdRef.current, {
          title, coverPhotos: [], selectedTags, places: places.map((p) => ({
            id: p.id, googlePlaceId: p.googlePlaceId, name: p.name, type: p.type, address: p.address,
            priceRangeIndex: 0, exactPrice: '', price: '', duration: '',
          })), travels: [], type: 'organize',
        });
      }
    });
    return unsubscribe;
  }, [navigation, title, places, selectedTags]);

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
      const results = await searchPlacesAutocomplete(query, CITY_CENTER, cityConfig.countryCode);
      setPlaceResults(results);
      setIsSearchingPlaces(false);
    }, 350);
  }, [CITY_CENTER, cityConfig.countryCode]);

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
    if (!canLaunch || !user || !pickedTransport) return;
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
        price: `0${cityConfig.currency}`,
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

      // Launch directly with the transport picked in step 4 — no extra modal.
      setTempPlan(plan);
      useDoItNowStore.getState().startOrganizeSession(plan, pickedTransport, user.id, title, selectedTags);
      navigation.navigate('DoItNow', { planId: plan.id });
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

  // Transport options for step 4 — matches TransportChooser values
  const TRANSPORT_OPTIONS: { key: DoItNowTransport; label: string; icon: string; emoji: string }[] = [
    { key: 'walking',   label: 'À pied',     icon: 'walk-outline',    emoji: '🚶' },
    { key: 'transit',   label: 'Métro',      icon: 'train-outline',   emoji: '🚇' },
    { key: 'bicycling', label: 'Vélo',       icon: 'bicycle-outline', emoji: '🚲' },
    { key: 'driving',   label: 'Voiture',    icon: 'car-outline',     emoji: '🚗' },
  ];

  // ── Render ──
  // Labels keyed par StepKey (pas par numéro d'étape) — on récupère le
  // bon label en fonction du flowMode + step courant.
  const stepTitlesByKey: Record<StepKey, string> = {
    title:  'Nomme ta journée',
    vibe:   'Quelle vibe ?',
    places: 'Ajoute les lieux',
    recap:  'Prêt à partir ?',
  };

  /** Le label du bouton "Suivant" mentionne ce qu'il y a APRÈS — donc
   *  dépend du stepKey de l'étape suivante (ou "lancement" si dernière). */
  const nextStepLabel = (() => {
    if (step === TOTAL_STEPS) return '🚀 Lancer la journée';
    const nextKey = FLOW_ORDER[flowMode][step];
    if (!nextKey) return 'Suivant';
    const phrase: Record<StepKey, string> = {
      title:  'Suivant — le titre',
      vibe:   'Suivant — la vibe',
      places: 'Suivant — les lieux',
      recap:  'Suivant — lancement',
    };
    return phrase[nextKey];
  })();

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { backgroundColor: Colors.bgPrimary }]}>
        {/* ═══════ Wizard header ═══════ */}
        <View style={[styles.wizardHeader, { paddingTop: insets.top + 8 }]}>
          {step > 1 ? (
            <TouchableOpacity onPress={goToPrevStep} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.wizardHeaderSide}>
              <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.wizardHeaderSide}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
          )}
          <View style={styles.wizardHeaderCenter}>
            <Text style={styles.wizardStepLabel}>ÉTAPE {step} SUR {TOTAL_STEPS}</Text>
            <Text style={styles.wizardStepTitle}>{stepTitlesByKey[stepKey]}</Text>
          </View>
          <View style={styles.wizardHeaderSide} />
        </View>

        {/* ═══════ Progress bar (4 segments) ═══════ */}
        <View style={styles.wizardProgress}>
          <View style={[styles.wizardProgressSeg, { backgroundColor: step >= 1 ? Colors.primary : Colors.borderSubtle }]} />
          <View style={[styles.wizardProgressSeg, { backgroundColor: step >= 2 ? Colors.primary : Colors.borderSubtle }]} />
          <View style={[styles.wizardProgressSeg, { backgroundColor: step >= 3 ? Colors.primary : Colors.borderSubtle }]} />
          <View style={[styles.wizardProgressSeg, { backgroundColor: step >= 4 ? Colors.primary : Colors.borderSubtle }]} />
        </View>

        {/* ═══════ Step content ═══════ */}
        <View style={styles.stepWrap}>
          {/* ─── Étape "title" ─── */}
          {stepKey === 'title' && (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.stepPad, { paddingBottom: 24 }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.stepHint}>Le nom court qui résume l'ambiance. Tu pourras le changer plus tard.</Text>

              {/* "Partir d'un plan sauvegardé" — préfill du wizard depuis
                  un plan déjà sauvegardé. Placé en HAUT (avant l'input qui
                  ouvre le clavier en autoFocus) pour rester visible.
                  Caché en mode 'fromSaved' (on est déjà dedans). */}
              {flowMode === 'fresh' && (
                <TouchableOpacity
                  style={styles.importBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setShowSavedPlanPicker(true);
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.importIconWrap}>
                    <Ionicons name="bookmark" size={16} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.importTitle}>Partir d'un plan sauvegardé</Text>
                    <Text style={styles.importHint}>
                      Re-utilise un plan existant et modifie ce que tu veux
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.gray500} />
                </TouchableOpacity>
              )}

              <View style={[styles.inputWrap, { backgroundColor: Colors.bgSecondary, borderColor: title.length > 0 ? Colors.primary : Colors.borderSubtle, marginTop: 16 }]}>
                <Ionicons name="pencil-outline" size={16} color={Colors.textSecondary} style={{ marginRight: 8 }} />
                <RNTextInput
                  style={[styles.textInput, { color: Colors.textPrimary }]}
                  placeholder="Ex: Journée culture au Marais"
                  placeholderTextColor={Colors.textTertiary}
                  value={title}
                  onChangeText={setTitle}
                  maxLength={60}
                  autoFocus
                />
              </View>
              <Text style={[styles.charCount, { color: Colors.textTertiary }]}>{title.length}/60</Text>

              <View style={styles.inspHeader}>
                <Text style={styles.inspLabel}>INSPIRATIONS</Text>
                <TouchableOpacity
                  onPress={reshuffleTitleIdeas}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.6}
                >
                  <Ionicons name="refresh-outline" size={13} color={Colors.textTertiary} />
                </TouchableOpacity>
              </View>
              <View style={styles.inspWrap}>
                {titleIdeas.map((label) => (
                  <TouchableOpacity
                    key={label}
                    style={[styles.inspChip, { backgroundColor: Colors.terracotta50, borderColor: Colors.terracotta100 }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTitle(label); }}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="sparkles-outline" size={13} color={Colors.primaryDeep} />
                    <Text style={[styles.inspText, { color: Colors.primaryDeep }]} numberOfLines={1}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}

          {/* ─── Étape "vibe" (catégories) ─── */}
          {stepKey === 'vibe' && (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.stepPad, { paddingBottom: 24 }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.stepHint}>Une ou plusieurs catégories qui décrivent ta journée.</Text>

              {/* Row 1: Par personne */}
              <Text style={[styles.filterRowLabel, { color: Colors.textTertiary, marginTop: 16 }]}>PAR PERSONNE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterChips}>
                {PERSON_FILTERS.filter(p => p.key !== 'around-you').map((p) => {
                  const isSelected = selectedTags.includes(p.label);
                  return (
                    <TouchableOpacity
                      key={p.key}
                      style={[styles.chip, isSelected ? { backgroundColor: Colors.primary, borderColor: Colors.primary } : { backgroundColor: Colors.bgSecondary, borderColor: Colors.borderSubtle }]}
                      onPress={() => toggleTag(p.label)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.chipEmoji}>{p.emoji}</Text>
                      <Text style={[styles.chipText, { color: isSelected ? Colors.textOnAccent : Colors.textPrimary }]}>{p.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Row 2: Par thème — tap a theme chip to select it (adds the
                  group label to selectedTags). The subcategory cards then
                  appear below inline, matching the pattern used in the
                  regular plan creation flow. The old "Voir +" toggle has
                  been retired in favor of this consistent UX. */}
              <Text style={[styles.filterRowLabel, { color: Colors.textTertiary, marginTop: 12 }]}>PAR THÈME</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterChips}>
                {EXPLORE_GROUPS.filter(g => g.key !== 'trending' && g.key !== 'nearby').map((group) => {
                  const isSelected = selectedTags.includes(group.label);
                  return (
                    <TouchableOpacity
                      key={group.key}
                      style={[styles.chip, isSelected ? { backgroundColor: Colors.primary, borderColor: Colors.primary } : { backgroundColor: Colors.bgSecondary, borderColor: Colors.borderSubtle }]}
                      onPress={() => toggleTag(group.label)}
                      activeOpacity={0.7}
                    >
                      {isSelected && (
                        <Ionicons name="checkmark" size={13} color={Colors.textOnAccent} style={{ marginRight: 2 }} />
                      )}
                      <Text style={styles.chipEmoji}>{group.emoji}</Text>
                      <Text style={[styles.chipText, { color: isSelected ? Colors.textOnAccent : Colors.textPrimary }]}>{group.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* ── Inline subcategory sections — one block per selected
                  theme. Mirrors the CreateScreen "ÉTAPE 3" UX : header
                  "Outdoor — précise ton style" + horizontal cards of
                  subcategory chips. */}
              {(() => {
                const selectedThemeGroups = EXPLORE_GROUPS
                  .filter((g) => g.key !== 'trending' && g.key !== 'nearby')
                  .filter((g) => selectedTags.includes(g.label));
                if (selectedThemeGroups.length === 0) return null;
                return (
                  <View style={{ marginTop: 18, gap: 14 }}>
                    {selectedThemeGroups.map((theme) => {
                      const items = theme.sections.flatMap((s) => s.items);
                      const selectedInTheme = items.filter((i) => selectedTags.includes(i.name)).length;
                      return (
                        <View key={theme.key}>
                          <View style={subcatStyles.header}>
                            <Text style={subcatStyles.headerEmoji}>{theme.emoji}</Text>
                            <Text style={subcatStyles.headerTitle}>{theme.label}</Text>
                            <Text style={subcatStyles.headerSep}>—</Text>
                            <Text style={subcatStyles.headerHint}>précise ton style</Text>
                            {selectedInTheme > 0 && (
                              <Text style={subcatStyles.headerCount}>
                                {selectedInTheme} choisi{selectedInTheme > 1 ? 's' : ''}
                              </Text>
                            )}
                          </View>
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={subcatStyles.cardsRow}
                          >
                            {items.map((item) => {
                              const isSelected = selectedTags.includes(item.name);
                              return (
                                <TouchableOpacity
                                  key={item.name}
                                  style={[subcatStyles.card, isSelected && subcatStyles.cardActive]}
                                  onPress={() => toggleTag(item.name)}
                                  activeOpacity={0.75}
                                >
                                  <Text style={subcatStyles.cardEmoji}>{item.emoji}</Text>
                                  <Text
                                    style={[subcatStyles.cardName, isSelected && subcatStyles.cardNameActive]}
                                    numberOfLines={2}
                                  >
                                    {item.name}
                                  </Text>
                                  {isSelected && (
                                    <View style={subcatStyles.cardCheck}>
                                      <Ionicons name="checkmark" size={10} color={Colors.textOnAccent} />
                                    </View>
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        </View>
                      );
                    })}
                  </View>
                );
              })()}

              {/* Selected tags recap */}
              {selectedTags.length > 0 && (
                <View style={styles.selectedTagsWrap}>
                  {selectedTags.map((tag) => (
                    <TouchableOpacity key={tag} style={[styles.selectedTag, { backgroundColor: Colors.terracotta100, borderColor: Colors.primary }]} onPress={() => toggleTag(tag)}>
                      <Text style={[styles.selectedTagText, { color: Colors.terracotta700 }]}>{tag}</Text>
                      <Ionicons name="close" size={14} color={Colors.primary} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
          )}

          {/* ─── Étape "places" ─── */}
          {stepKey === 'places' && (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.stepPad, { paddingBottom: 24 }]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              scrollEnabled={!draggingId}
            >
              <Text style={styles.stepHint}>Au moins 1 lieu. Maintiens un lieu pour le réorganiser.</Text>

              {places.length > 0 && (
                <View style={[styles.placesList, { marginTop: 16 }]}>
                  {places.map((place, index) => (
                    <Animated.View
                      key={place.id}
                      style={[
                        styles.placeCard,
                        { backgroundColor: Colors.bgSecondary, borderColor: Colors.borderSubtle },
                        { transform: [{ translateY: getDragY(place.id) }, { translateX: getDragX(place.id) }] },
                        draggingId === place.id && {
                          shadowColor: 'rgba(44,36,32,1)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18,
                          shadowRadius: 8, elevation: 8, borderColor: Colors.primary,
                        },
                        { zIndex: draggingId === place.id ? 100 : 1 },
                      ]}
                      {...getOrCreateDragHandlers(place.id).panHandlers}
                    >
                      <Pressable onLongPress={() => handleLongPressPlace(place.id)} delayLongPress={350} style={[styles.placeCardInner, { userSelect: 'none', cursor: draggingId === place.id ? 'grabbing' : 'default' } as any]}>
                        <View style={[styles.placeNumber, { backgroundColor: Colors.primary }]}>
                          <Text style={styles.placeNumberText}>{index + 1}</Text>
                        </View>
                        <View style={styles.placeInfo}>
                          <Text style={[styles.placeName, { color: Colors.textPrimary }]} numberOfLines={1}>{place.name}</Text>
                          <Text style={[styles.placeType, { color: Colors.textSecondary }]} numberOfLines={1}>{place.type}{place.address ? ` · ${place.address.split(',')[0]}` : ''}</Text>
                        </View>
                        <TouchableOpacity onPress={() => removePlace(place.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="close-circle" size={20} color={Colors.textTertiary} />
                        </TouchableOpacity>
                      </Pressable>
                    </Animated.View>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[styles.addPlaceBtn, { backgroundColor: Colors.terracotta50, borderColor: Colors.terracotta400, marginTop: places.length > 0 ? 12 : 16 }]}
                onPress={() => setShowPlacePicker(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle-outline" size={18} color={Colors.primary} />
                <Text style={[styles.addPlaceText, { color: Colors.primary }]}>Ajouter un lieu</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* ─── Étape "recap" (lancement + transport) ─── */}
          {stepKey === 'recap' && (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.stepPad, { paddingBottom: 24 }]}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.stepHint}>Choisis ton mode de transport et go !</Text>

              {/* Recap card */}
              <View style={[styles.recapCard, { backgroundColor: Colors.bgSecondary, borderColor: Colors.borderSubtle }]}>
                <Text style={[styles.recapTitle, { color: Colors.textPrimary }]} numberOfLines={2}>{title}</Text>
                <View style={styles.recapMeta}>
                  <View style={styles.recapMetaItem}>
                    <Ionicons name="location" size={14} color={Colors.primary} />
                    <Text style={[styles.recapMetaText, { color: Colors.textSecondary }]}>{places.length} lieu{places.length > 1 ? 'x' : ''}</Text>
                  </View>
                  <View style={styles.recapSep} />
                  <View style={styles.recapMetaItem}>
                    <Ionicons name="pricetag" size={14} color={Colors.primary} />
                    <Text style={[styles.recapMetaText, { color: Colors.textSecondary }]}>{selectedTags.length} catégorie{selectedTags.length > 1 ? 's' : ''}</Text>
                  </View>
                </View>

                {/* Mini timeline preview */}
                <View style={styles.miniTimelineRow}>
                  {places.slice(0, 5).map((p, i) => (
                    <React.Fragment key={p.id}>
                      {i > 0 && <View style={[styles.miniTimelineDash, { backgroundColor: Colors.terracotta200 }]} />}
                      <View style={[styles.miniTimelineDot, { backgroundColor: Colors.primary }]}>
                        <Text style={styles.miniTimelineDotText}>{i + 1}</Text>
                      </View>
                    </React.Fragment>
                  ))}
                  {places.length > 5 && (
                    <>
                      <View style={[styles.miniTimelineDash, { backgroundColor: Colors.terracotta200 }]} />
                      <Text style={[styles.miniTimelineMore, { color: Colors.textSecondary }]}>+{places.length - 5}</Text>
                    </>
                  )}
                </View>
              </View>

              {/* Transport picker */}
              <Text style={[styles.filterRowLabel, { color: Colors.textTertiary, marginTop: 20 }]}>TON TRANSPORT</Text>
              <View style={styles.transportGrid}>
                {TRANSPORT_OPTIONS.map((t) => {
                  const isActive = pickedTransport === t.key;
                  return (
                    <TouchableOpacity
                      key={t.key}
                      style={[
                        styles.transportChip,
                        {
                          backgroundColor: isActive ? Colors.primary : Colors.bgSecondary,
                          borderColor: isActive ? Colors.primary : Colors.borderSubtle,
                        },
                      ]}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPickedTransport(t.key); }}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.transportEmoji}>{t.emoji}</Text>
                      <Text style={[styles.transportLabel, { color: isActive ? Colors.textOnAccent : Colors.textPrimary }]}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {pickedTransport && (
                <Text style={[styles.launchHint, { color: Colors.textTertiary }]}>
                  En lançant, ta session Do-It-Now démarre. Tu peux ensuite valider chaque lieu au fur et à mesure.
                </Text>
              )}
            </ScrollView>
          )}
        </View>

        {/* ═══════ Wizard footer ═══════ */}
        <View style={[styles.wizardFooter, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[
              styles.wizardPrimaryBtn,
              canProceedFromStep(step) ? { backgroundColor: Colors.primary } : { backgroundColor: Colors.bgTertiary },
            ]}
            onPress={step === TOTAL_STEPS ? handleLaunch : goToNextStep}
            disabled={!canProceedFromStep(step) || isLoading}
            activeOpacity={0.85}
          >
            {isLoading && step === TOTAL_STEPS ? (
              <ActivityIndicator color={Colors.textOnAccent} size="small" />
            ) : (
              <>
                <Text style={[styles.wizardPrimaryBtnText, { color: canProceedFromStep(step) ? Colors.textOnAccent : Colors.textTertiary }]}>
                  {nextStepLabel}
                </Text>
                {step < TOTAL_STEPS ? (
                  <Ionicons name="arrow-forward" size={18} color={canProceedFromStep(step) ? Colors.textOnAccent : Colors.textTertiary} />
                ) : null}
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

        {/* ── Saved-plan picker (step 1) ── */}
        <SavedPlanPickerSheet
          visible={showSavedPlanPicker}
          onClose={() => setShowSavedPlanPicker(false)}
          onPick={(plan) => prefillFromSavedPlan(plan)}
          title="Partir d'un plan sauvegardé"
          subtitle="Toutes les infos sont préremplies. Tu peux modifier ce que tu veux ensuite."
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
                  savedPlacesList.length > 0 ? (
                    <View>
                      <Text style={[styles.savedSectionLabel, { color: C.gray700 }]}>Lieux sauvegardés</Text>
                      {savedPlacesList.map((sp) => (
                        <TouchableOpacity
                          key={sp.placeId}
                          style={[styles.placeOption, { borderBottomColor: C.borderLight }]}
                          activeOpacity={0.6}
                          onPress={() => selectPlace({ placeId: sp.placeId, name: sp.name, address: sp.address, types: sp.types })}
                        >
                          <View style={[styles.placeOptionIcon, { backgroundColor: C.gray200 }]}>
                            <Ionicons name="star" size={22} color={Colors.gold} />
                          </View>
                          <View style={styles.placeOptionInfo}>
                            <Text style={[styles.placeOptionName, { color: C.black }]}>{sp.name}</Text>
                            <Text style={[styles.placeOptionAddr, { color: C.gray700 }]} numberOfLines={1}>{sp.address}</Text>
                          </View>
                          <Ionicons name="add-circle-outline" size={24} color={Colors.primary} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.emptyState}>
                      <Ionicons name="location" size={32} color={C.gray500} />
                      <Text style={[styles.emptyText, { color: C.gray600 }]}>Recherche un lieu...</Text>
                    </View>
                  )
                ) : null
              }
            />
          </View>
        </Modal>

        {/* ── Pick up draft bottom sheet (non-blocking) ── */}
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
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ─────────────────────────────────────────────────────────────
  // Wizard shell (header, progress, footer) — mirrors CreateScreen
  // ─────────────────────────────────────────────────────────────
  wizardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: 10,
    gap: 8,
  },
  wizardHeaderSide: { width: 28, alignItems: 'flex-start' },
  wizardHeaderCenter: { flex: 1, alignItems: 'center' },
  wizardStepLabel: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    letterSpacing: 1.3,
  },
  wizardStepTitle: {
    fontSize: 17,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    marginTop: 2,
    letterSpacing: -0.2,
  },
  wizardProgress: {
    flexDirection: 'row',
    paddingHorizontal: Layout.screenPadding,
    gap: 4,
    paddingBottom: 14,
  },
  wizardProgressSeg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  stepWrap: { flex: 1 },
  stepPad: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 8,
  },
  stepHint: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  wizardFooter: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    backgroundColor: Colors.bgPrimary,
  },
  wizardPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 14,
  },
  wizardPrimaryBtnText: {
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
  },

  // ─────────────────────────────────────────────────────────────
  // Step 1 — title inspirations
  // ─────────────────────────────────────────────────────────────
  inspHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 10,
  },
  inspLabel: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    letterSpacing: 1.3,
  },
  // Design aligné sur CoPlanInviteSheet : chips horizontaux compacts
  // (flex-wrap), couleur primaryDeep, fond terracotta50, hairline
  // border. Les anciens chips full-width ont été retirés.
  inspWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inspChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: StyleSheet.hairlineWidth,
  },
  inspEmoji: { fontSize: 18 },
  inspText: { fontSize: 12.5, fontFamily: Fonts.bodyMedium },

  // "Partir d'un plan sauvegardé" — bouton step 1
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.terracotta300,
    marginTop: 16,
  },
  importIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.terracotta50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importTitle: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  importHint: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
  },

  // ─────────────────────────────────────────────────────────────
  // Step 4 — recap + transport
  // ─────────────────────────────────────────────────────────────
  recapCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  recapTitle: {
    fontSize: 18,
    fontFamily: Fonts.displaySemiBold,
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  recapMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  recapMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recapMetaText: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
  },
  recapSep: { width: 1, height: 12, backgroundColor: Colors.borderMedium },
  miniTimelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  miniTimelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniTimelineDotText: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
  },
  miniTimelineDash: {
    width: 14,
    height: 2,
    borderRadius: 1,
  },
  miniTimelineMore: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    marginLeft: 4,
  },
  transportGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  transportChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 99,
    borderWidth: 1.5,
    minWidth: '47%',
    justifyContent: 'center',
  },
  transportEmoji: { fontSize: 17 },
  transportLabel: {
    fontSize: 13.5,
    fontFamily: Fonts.bodySemiBold,
  },
  launchHint: {
    fontSize: 12,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 16,
    lineHeight: 17,
  },

  // Legacy (kept for place picker modal + pickup sheet)
  scroll: { flex: 1 },
  scrollContent: { padding: Layout.screenPadding },

  // Section
  sectionLabel: { fontSize: 13, fontFamily: Fonts.bodySemiBold, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  sectionHint: { fontSize: 12, fontFamily: Fonts.body, marginBottom: 10 },

  // Title input
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1.5,
  },
  textInput: { flex: 1, fontSize: 15, fontFamily: Fonts.body, paddingVertical: 0 },
  charCount: { fontSize: 11, fontFamily: Fonts.body, textAlign: 'right', marginTop: 4, marginBottom: 4 },

  // Filter rows
  filterRowLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  filterScroll: { flexGrow: 0, marginBottom: 12 },
  filterChips: { gap: 8 },
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
  chipText: { fontSize: 13, fontFamily: Fonts.bodySemiBold },

  // Subcategory flat list
  subcategorySection: { marginBottom: 12 },
  subcategorySectionTitle: { fontSize: 10, fontFamily: Fonts.bodySemiBold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  flatSubcatRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  flatSubcatEmoji: { fontSize: 28, width: 40, textAlign: 'center', marginRight: 12 },
  flatSubcatTextCol: { flex: 1 },
  flatSubcatName: { fontSize: 15, fontFamily: Fonts.bodySemiBold },
  flatSubcatSub: { fontSize: 11, marginTop: 2 },

  // Selected tags
  selectedTagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, marginBottom: 4 },
  selectedTag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, gap: 4 },
  selectedTagText: { fontSize: 11, fontFamily: Fonts.bodySemiBold },

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
  placeNumberText: { fontSize: 12, fontWeight: '700', color: Colors.textOnAccent },
  placeInfo: { flex: 1 },
  placeName: { fontSize: 14, fontFamily: Fonts.bodySemiBold },
  placeType: { fontSize: 11, fontFamily: Fonts.body, marginTop: 2 },
  placeCardInner: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, flex: 1 },
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
  addPlaceText: { fontSize: 14, fontFamily: Fonts.bodySemiBold },

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
  launchBtnText: { fontSize: 16, fontFamily: Fonts.displaySemiBold },

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
  modalTitle: { fontSize: 17, fontFamily: Fonts.displaySemiBold },
  modalClose: { fontSize: 14, fontFamily: Fonts.bodySemiBold },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Layout.screenPadding,
    marginTop: 12,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: Fonts.body, paddingVertical: 0 },
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
  placeOptionName: { fontSize: 14, fontFamily: Fonts.bodySemiBold },
  placeOptionAddr: { fontSize: 12, fontFamily: Fonts.body, marginTop: 2 },
  emptyState: { alignItems: 'center', paddingTop: 40, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: Fonts.body, textAlign: 'center' },
  savedSectionLabel: { fontSize: 12, fontFamily: Fonts.bodySemiBold, letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },

  // Pickup draft sheet (non-blocking — no overlay)
  pickupSheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 900,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingBottom: 34,
    shadowColor: 'rgba(44,36,32,1)', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 12,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 16 },
  pickupTitle: { fontSize: 18, fontWeight: '800', fontFamily: Fonts.displaySemiBold, marginBottom: 4 },
  pickupSubtitle: { fontSize: 13, fontFamily: Fonts.body, marginBottom: 14 },
  sheetButtons: { flexDirection: 'row', gap: 10, marginTop: 18 },
  sheetBtnOutline: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  sheetBtnOutlineText: { fontSize: 14, fontFamily: Fonts.bodySemiBold },
  sheetBtnFill: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  sheetBtnFillText: { fontSize: 14, fontFamily: Fonts.bodySemiBold, color: Colors.textOnAccent },
});

// ══════════════════════════════════════════════════════════════════════
// Subcategory styles — mirror the CreateScreen "ÉTAPE 3" UX so both
// flows feel identical when picking categories. Same header layout
// ("Outdoor — précise ton style"), same horizontal cards row.
// ══════════════════════════════════════════════════════════════════════

const subcatStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  headerEmoji: {
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  headerSep: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginHorizontal: 2,
  },
  headerHint: {
    fontSize: 12,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    color: Colors.textTertiary,
    flex: 1,
  },
  headerCount: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
    letterSpacing: 0.05,
  },
  cardsRow: {
    gap: 8,
    paddingRight: 4,
  },
  card: {
    width: 100,
    minHeight: 96,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    position: 'relative',
  },
  cardActive: {
    backgroundColor: Colors.terracotta50,
    borderColor: Colors.primary,
    borderWidth: 1.5,
  },
  cardEmoji: {
    fontSize: 22,
  },
  cardName: {
    fontSize: 11.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.05,
  },
  cardNameActive: {
    color: Colors.primary,
  },
  cardCheck: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
