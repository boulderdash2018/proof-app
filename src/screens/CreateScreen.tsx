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
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { storage } from '../services/firebaseConfig';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout, Fonts, CATEGORIES, EXPLORE_GROUPS, PERSON_FILTERS, getCityCoordinates } from '../constants';
import { LinearGradient } from 'expo-linear-gradient';
import { PrimaryButton, Chip, TextInput, PlanCard } from '../components';
import { useAuthStore, useFeedStore, useSavesStore, useDraftStore } from '../store';
import { useColors } from '../hooks/useColors';
import { useCity } from '../hooks/useCity';
import { useTranslation } from '../hooks/useTranslation';
import { CategoryTag, TransportMode, TravelSegment } from '../types';
import { createPlan } from '../services/plansService';
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

// ========== TYPES ==========
interface PlaceEntry {
  id: string;
  googlePlaceId?: string;
  name: string;
  type: string;
  address?: string;
  price: string;      // user input (numbers only)
  duration: string;   // user input in minutes (numbers only)
  customPhoto?: string;     // user's own photo URI
  comment?: string;         // user's personal comment
  questionAnswer?: string;  // answer to a random question
  question?: string;        // the question that was shown
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
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ========== DRAFT ==========
  const draft = useDraftStore();
  const draftRestoredRef = useRef(false);

  // Restore draft on mount
  useEffect(() => {
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    if (!draft.hasDraft()) return;
    setTitle(draft.title);
    setCoverPhotos(draft.coverPhotos);
    setSelectedTags(draft.selectedTags as CategoryTag[]);
    setPlaces(draft.places as PlaceEntry[]);
    setTravels(draft.travels as TravelEntry[]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save draft when navigating away
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      if (isSuccess || isPublishing) return;
      const hasContent = title.length > 0 || places.length > 0 || coverPhotos.length > 0;
      if (hasContent) {
        draft.saveDraft({ title, coverPhotos, selectedTags, places, travels });
      } else {
        draft.clearDraft();
      }
    });
    return unsubscribe;
  }, [navigation, title, coverPhotos, selectedTags, places, travels, isSuccess, isPublishing]); // eslint-disable-line react-hooks/exhaustive-deps

  const discardDraft = () => {
    setTitle(''); setCoverPhotos([]); setSelectedTags([]); setPlaces([]); setTravels([]);
    draft.clearDraft();
  };

  // ========== PREVIEW ==========
  const [showPreview, setShowPreview] = useState(false);

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

  const pickPhotos = async () => {
    if (Platform.OS === 'web') {
      // On web, create and click a hidden file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = async () => {
        const files = input.files;
        if (!files || files.length === 0) return;
        setIsUploadingPhotos(true);
        try {
          const maxFiles = Math.min(files.length, 7 - coverPhotos.length);
          // Copy files to array and read all data URLs first (avoids FileList reference issues)
          const fileArray: File[] = [];
          for (let i = 0; i < maxFiles; i++) fileArray.push(files[i]);
          const dataUrls = await Promise.all(fileArray.map((f) => readFileAsDataUrl(f)));
          // Upload sequentially to avoid overwhelming Firebase
          const urls: string[] = [];
          for (const dataUrl of dataUrls) {
            const url = await uploadPhoto(dataUrl);
            urls.push(url);
          }
          setCoverPhotos((prev) => [...prev, ...urls].slice(0, 7));
        } catch (err) {
          console.error('Photo upload error:', err);
          Alert.alert('Erreur', "Impossible d'uploader les photos. Vérifiez les règles Firebase Storage.");
        } finally {
          setIsUploadingPhotos(false);
        }
      };
      input.click();
      return;
    }
    // On native, use expo-image-picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 7 - coverPhotos.length,
      quality: 0.7,
    });
    if (result.canceled || !result.assets) return;

    setIsUploadingPhotos(true);
    try {
      const urls: string[] = [];
      for (const asset of result.assets) {
        const dataUrl = await readFileAsDataUrl(await (await fetch(asset.uri)).blob());
        urls.push(await uploadPhoto(dataUrl));
      }
      setCoverPhotos((prev) => [...prev, ...urls].slice(0, 7));
    } catch (err) {
      console.error('Photo upload error:', err);
      Alert.alert('Erreur', "Impossible d'uploader les photos");
    } finally {
      setIsUploadingPhotos(false);
    }
  };

  const removePhoto = (index: number) => {
    setCoverPhotos((prev) => prev.filter((_, i) => i !== index));
  };

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
  const [customAnswer, setCustomAnswer] = useState('');
  const [customQuestion, setCustomQuestion] = useState('');
  const [showQuestionPicker, setShowQuestionPicker] = useState(false);
  const [editingPlaceIndex, setEditingPlaceIndex] = useState<number | null>(null);

  const PLACE_QUESTIONS = [
    'Quel est ton plat / drink préféré ici ?',
    'Un conseil pour ceux qui y vont ?',
    'Qu\'est-ce qui rend cet endroit unique ?',
    'À quel moment de la journée y aller ?',
    'Un souvenir marquant ici ?',
    'Tu y vas plutôt solo ou accompagné ?',
    'Le spot parfait pour quel mood ?',
    'Combien de temps tu resterais ici ?',
    'Qu\'est-ce que tu commanderais les yeux fermés ?',
    'C\'est quoi l\'ambiance en un mot ?',
    'Le truc que personne ne sait sur cet endroit ?',
    'Première chose qui t\'a marqué en arrivant ?',
    'Tu conseillerais pour un premier date ?',
    'C\'est mieux en été ou en hiver ?',
    'Le meilleur moment pour éviter la foule ?',
    'Ça vaut le détour depuis l\'autre bout de Paris ?',
    'Un endroit similaire que tu recommandes aussi ?',
    'Si tu devais y emmener un touriste, pourquoi ?',
    'Le rapport qualité-prix en toute honnêteté ?',
    'Une anecdote ou fun fact sur ce lieu ?',
  ];

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
    if (type === 'question') setCustomAnswer('');
  };

  const handlePlaceSearch = useCallback((query: string) => {
    setPlaceSearch(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (query.length < 2) { setPlaceResults([]); return; }
    setIsSearchingPlaces(true);
    searchTimerRef.current = setTimeout(async () => {
      const results = await searchPlacesAutocomplete(query, CITY_CENTER);
      setPlaceResults(results);
      setIsSearchingPlaces(false);
    }, 350);
  }, []);

  const selectGooglePlace = useCallback(async (item: GooglePlaceAutocomplete) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const type = getReadableType(item.types);
    const newPlace: PlaceEntry = {
      id: item.placeId,
      googlePlaceId: item.placeId,
      name: item.name,
      type,
      address: item.address,
      price: '',
      duration: '',
    };

    // Close search, open customization screen
    setShowPlacePicker(false);
    setPlaceSearch('');
    setPlaceResults([]);

    // Fetch place photo for the customization screen
    setPendingPlace(newPlace);
    setPendingPlacePhoto(null);
    setCustomPhoto('');
    setCustomComment('');
    setCustomAnswer('');
    setCustomQuestion(PLACE_QUESTIONS[Math.floor(Math.random() * PLACE_QUESTIONS.length)]);
    setShowCustomize(true);

    // Fetch photo in background
    try {
      const details = await getPlaceDetails(item.placeId);
      if (details?.photoUrls?.[0]) setPendingPlacePhoto(details.photoUrls[0]);
    } catch {}
  }, []);

  const editPlaceCustomization = useCallback(async (index: number) => {
    const place = places[index];
    setEditingPlaceIndex(index);
    setPendingPlace(place);
    setCustomPhoto(place.customPhoto || '');
    setCustomComment(place.comment || '');
    setCustomAnswer(place.questionAnswer || '');
    setCustomQuestion(place.question || PLACE_QUESTIONS[Math.floor(Math.random() * PLACE_QUESTIONS.length)]);
    setBlockOrder(['photo', 'comment', 'question']);
    setIsReordering(false);
    setShowQuestionPicker(false);
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
    const placeWithCustom: PlaceEntry = {
      ...pendingPlace,
      customPhoto: customPhoto || undefined,
      comment: customComment || undefined,
      questionAnswer: customAnswer || undefined,
      question: customAnswer ? customQuestion : undefined,
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
  }, [pendingPlace, places, customPhoto, customComment, customAnswer, customQuestion, editingPlaceIndex]);

  const pickCustomPhoto = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      setCustomPhoto(result.assets[0].uri);
    }
  }, []);

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

  // ========== QUALITY SCORE (0–100) ==========
  const qualityScore = useMemo(() => {
    let score = 0;
    if (title.trim().length > 0) score += 15;           // titre
    if (selectedTags.length > 0) score += 10;            // 1 catégorie
    if (places.length >= 1) score += 10;                 // 1er lieu
    if (places.length >= 2) score += 15;                 // 2e lieu
    if (coverPhotos.length > 0) score += 10;             // 1 photo de couverture
    const hasBudget = places.some((p) => p.price && parseInt(p.price, 10) > 0);
    if (hasBudget) score += 10;                          // prix renseigné
    const hasDuration = places.some((p) => p.duration && parseInt(p.duration, 10) > 0);
    if (hasDuration) score += 10;                        // durée renseignée
    const hasWidget = places.some((p) => p.customPhoto || p.comment || p.questionAnswer);
    if (hasWidget) score += 20;                          // 1 widget perso sur 1 lieu
    return Math.min(score, 100);
  }, [title, selectedTags, places, travels, coverPhotos]);

  const barAnim = useRef(new Animated.Value(0)).current;
  const barScale = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const labelFade = useRef(new Animated.Value(1)).current;
  const labelSlide = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const [hasReached100, setHasReached100] = useState(false);
  const [showPublishSheet, setShowPublishSheet] = useState(false);
  const sheetSlide = useRef(new Animated.Value(300)).current;
  // Publish fly-away animation
  const publishTranslateY = useRef(new Animated.Value(0)).current;
  const publishScale = useRef(new Animated.Value(1)).current;
  const publishOpacity = useRef(new Animated.Value(1)).current;
  const [isFlying, setIsFlying] = useState(false);
  const prevLabelRef = useRef('');
  const screenWidth = Dimensions.get('window').width - Layout.screenPadding * 2;

  const qualityLabel = qualityScore >= 100 ? 'Perfect plan' : qualityScore >= 80 ? 'This plan is fire \uD83D\uDD25' : qualityScore >= 56 ? 'Almost there \u2726' : qualityScore >= 31 ? 'Looking good \uD83D\uDC40' : 'Start adding details...';
  const labelColor = qualityScore >= 100 ? '#C8571A' : qualityScore >= 80 ? '#A04010' : qualityScore >= 56 ? '#C8571A' : qualityScore >= 31 ? '#D4784A' : '#8A8078';
  const canPublish = title.trim().length > 0 && selectedTags.length > 0 && places.length >= 2;

  useEffect(() => {
    // Spring fill
    Animated.spring(barAnim, { toValue: qualityScore, friction: 8, tension: 40, useNativeDriver: false }).start();
    // Label fade+slide on text change
    if (prevLabelRef.current !== qualityLabel) {
      prevLabelRef.current = qualityLabel;
      Animated.parallel([
        Animated.timing(labelFade, { toValue: 0, duration: 100, useNativeDriver: true }),
        Animated.timing(labelSlide, { toValue: 6, duration: 100, useNativeDriver: true }),
      ]).start(() => {
        labelSlide.setValue(-6);
        Animated.parallel([
          Animated.timing(labelFade, { toValue: 1, duration: 250, useNativeDriver: true }),
          Animated.spring(labelSlide, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
        ]).start();
      });
    }
    // 100% celebration
    if (qualityScore >= 100 && !hasReached100) {
      setHasReached100(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Pulse
      Animated.sequence([
        Animated.timing(barScale, { toValue: 1.04, duration: 200, useNativeDriver: true }),
        Animated.timing(barScale, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
      // Shimmer sweep
      shimmerAnim.setValue(0);
      Animated.timing(shimmerAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
      // Check pop
      Animated.spring(checkScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
    }
  }, [qualityScore]);

  // Missing criteria for bottom sheet
  const missingCriteria = useMemo(() => {
    const list: { icon: string; text: string; pts: number }[] = [];
    if (coverPhotos.length === 0) list.push({ icon: '\uD83D\uDCF8', text: 'Une photo de couverture', pts: 10 });
    if (!places.some((p) => p.customPhoto || p.comment || p.questionAnswer)) list.push({ icon: '\uD83D\uDCA1', text: 'Personnaliser un lieu', pts: 20 });
    if (!places.some((p) => p.price && parseInt(p.price, 10) > 0)) list.push({ icon: '\uD83D\uDCB0', text: 'Le budget', pts: 10 });
    if (!places.some((p) => p.duration && parseInt(p.duration, 10) > 0)) list.push({ icon: '\u23F1', text: 'La durée', pts: 10 });
    return list.filter((c) => c.pts >= 5).slice(0, 3);
  }, [coverPhotos, places]);

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
  const updatePlacePrice = (id: string, value: string) => {
    // Only allow digits
    const cleaned = value.replace(/[^0-9]/g, '');
    setPlaces((prev) => prev.map((p) => p.id === id ? { ...p, price: cleaned } : p));
  };

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

    // Check each travel has valid duration (skip if still loading '...')
    travels.forEach((tr, i) => {
      if (tr.duration === '...') e[`travel_duration_${i}`] = t.create_travel_loading || 'Calcul en cours...';
      else if (!tr.duration || isNaN(parseInt(tr.duration, 10))) e[`travel_duration_${i}`] = t.create_error_numbers_only;
    });

    setErrors(e);
    if (Object.keys(e).length > 0) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    return Object.keys(e).length === 0;
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
          };
        })
      );

      const newPlan = await createPlan(
        {
          title,
          tags: selectedTags,
          places: placesWithPhotos,
          price: `${totalPrice}€`,
          duration: formatDuration(totalDuration),
          transport: mainTransport,
          travelSegments,
          coverPhotos,
          city: cityConfig.name,
        },
        user
      );
      addPlan(newPlan);
      addCreatedPlan(newPlan);
      trackEvent('plan_created', { title, tags_count: selectedTags.length, places_count: places.length, transport: mainTransport });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      draft.clearDraft();
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
    if (!validate() || !user) return;
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
          <Text style={styles.successEmoji}>🎉</Text>
          <Text style={[styles.successTitle, { color: C.black }]}>{t.create_success_title}</Text>
          <Text style={[styles.successDesc, { color: C.gray700 }]}>{t.create_success_desc}</Text>
          <PrimaryButton label={t.create_success_back} onPress={() => {
            setIsSuccess(false); setTitle(''); setSelectedTags([]); setPlaces([]); setTravels([]);
            publishTranslateY.setValue(0); publishScale.setValue(1); publishOpacity.setValue(1); setIsFlying(false);
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

          {/* Per-place price input */}
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
          </View>

          {/* Per-place duration chips */}
          <View style={{ marginTop: 8 }}>
            <Text style={[styles.placeInputLabel, { color: C.gray700 }]}>{t.create_place_duration}</Text>
            <View style={styles.durationChipsRow}>
              {DURATION_PRESETS.map((preset) => {
                const isSelected = place.duration === preset;
                return (
                  <TouchableOpacity
                    key={preset}
                    style={[
                      styles.durationChip,
                      { backgroundColor: isSelected ? C.primary : C.gray200 },
                    ]}
                    onPress={() => updatePlaceDuration(place.id, preset)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.durationChipText, { color: isSelected ? '#FFF' : C.gray800 }]}>
                      {formatDurationLabel(preset)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {errors[`place_duration_${index}`] && (
              <Text style={styles.miniError}>{errors[`place_duration_${index}`]}</Text>
            )}
          </View>

          {/* Customize / Edit button */}
          <TouchableOpacity
            style={[styles.customizeBtn, { borderColor: C.primary + '40' }]}
            onPress={() => editPlaceCustomization(index)}
            activeOpacity={0.7}
          >
            <Ionicons name={place.customPhoto || place.comment || place.questionAnswer ? 'create-outline' : 'sparkles-outline'} size={14} color={C.primary} />
            <Text style={[styles.customizeBtnText, { color: C.primary }]}>
              {place.customPhoto || place.comment || place.questionAnswer ? 'Modifier la personnalisation' : 'Personnaliser ce lieu'}
            </Text>
          </TouchableOpacity>
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
                  {travel.duration === '...' ? (
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 }}>
                      <ActivityIndicator size="small" color={C.primary} />
                      <Text style={[styles.placeInput, { color: C.gray500 }]}>Calcul...</Text>
                    </View>
                  ) : (
                    <Text style={[styles.placeInput, { color: travel.duration ? C.black : C.gray500, paddingHorizontal: 8, paddingVertical: 6 }]}>
                      {travel.duration ? `${travel.duration}` : 'Auto'}
                    </Text>
                  )}
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

        <Animated.View style={{ flex: 1, opacity: publishOpacity, transform: [{ translateY: publishTranslateY }, { scale: publishScale }] }} pointerEvents={isFlying ? 'none' : 'auto'}>
        {/* Quality progress bar */}
        <Animated.View style={[styles.qualityBarWrap, { transform: [{ scaleY: barScale }] }]}>
          <View style={styles.qualityBarBg}>
            <Animated.View style={[styles.qualityBarFill, { width: barAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp' }) }]}>
              <LinearGradient colors={['#F5C4A0', '#D4784A', '#C8571A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
              {/* Shimmer overlay at 100% */}
              <Animated.View style={[styles.qualityShimmer, { transform: [{ translateX: shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [-screenWidth, screenWidth] }) }], opacity: shimmerAnim.interpolate({ inputRange: [0, 0.3, 0.7, 1], outputRange: [0, 0.6, 0.6, 0] }) }]} />
            </Animated.View>
          </View>
          {/* Tracking label */}
          <Animated.View style={[styles.qualityLabelWrap, { left: barAnim.interpolate({ inputRange: [0, 75, 100], outputRange: ['0%', '55%', '55%'], extrapolate: 'clamp' }), opacity: labelFade, transform: [{ translateY: labelSlide }] }]}>
            <Text style={[styles.qualityLabel, { color: labelColor }]}>
              {qualityLabel}
            </Text>
            {qualityScore >= 100 && (
              <Animated.Text style={[styles.qualityCheck, { color: '#C8571A', transform: [{ scale: checkScale }] }]}> ✓</Animated.Text>
            )}
          </Animated.View>
        </Animated.View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {draft.savedAt && (title.length > 0 || places.length > 0) && (
            <View style={[styles.draftBanner, { backgroundColor: C.goldBg, borderColor: C.goldBorder }]}>
              <View style={styles.draftBannerLeft}>
                <Ionicons name="document-text-outline" size={16} color={C.gold} />
                <Text style={[styles.draftBannerText, { color: C.gold }]}>Brouillon restauré</Text>
              </View>
              <TouchableOpacity onPress={discardDraft} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[styles.draftBannerDiscard, { color: C.gray600 }]}>Supprimer</Text>
              </TouchableOpacity>
            </View>
          )}
          <TextInput label={t.create_plan_title_label} placeholder={t.create_plan_title_placeholder} value={title} onChangeText={setTitle} error={errors.title} />

          {/* Cover Photos */}
          <Text style={[styles.fieldLabel, { color: C.gray800 }]}>Photos de couverture</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosPickerScroll} contentContainerStyle={styles.photosPickerContainer}>
            {coverPhotos.map((uri, i) => (
              <View key={i} style={styles.photoThumbWrap}>
                <Image source={{ uri }} style={styles.photoThumb} />
                <TouchableOpacity style={styles.photoRemoveBtn} onPress={() => removePhoto(i)}>
                  <Ionicons name="close-circle" size={22} color="#FFF" />
                </TouchableOpacity>
              </View>
            ))}
            {coverPhotos.length < 7 && (
              <TouchableOpacity
                style={[styles.photoAddBtn, { backgroundColor: C.gray200, borderColor: C.borderLight }]}
                onPress={pickPhotos}
                disabled={isUploadingPhotos}
              >
                {isUploadingPhotos ? (
                  <ActivityIndicator size="small" color={C.primary} />
                ) : (
                  <>
                    <Ionicons name="camera-outline" size={24} color={C.gray600} />
                    <Text style={[styles.photoAddText, { color: C.gray600 }]}>Ajouter</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </ScrollView>
          <Text style={[styles.photoHint, { color: C.gray500 }]}>
            {coverPhotos.length === 0 ? 'Optionnel · Les photos des lieux seront utilisées par défaut' : `${coverPhotos.length}/7 photos`}
          </Text>

          <Text style={[styles.fieldLabel, { color: C.gray800 }]}>{t.create_category}</Text>

          {/* Row 1: Par personne */}
          <Text style={[styles.filterRowLabel, { color: C.gray500 }]}>Par personne</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupChipsScroll} contentContainerStyle={styles.groupChipsContainer}>
            {PERSON_FILTERS.map((p) => {
              const isSelected = selectedTags.includes(p.label);
              return (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.groupChip, { backgroundColor: isSelected ? C.primary : C.gray200, borderColor: isSelected ? C.primary : C.borderLight }]}
                  onPress={() => toggleTag(p.label)}
                >
                  <Text style={styles.groupChipEmoji}>{p.emoji}</Text>
                  <Text style={[styles.groupChipText, { color: isSelected ? '#FFF' : C.gray800 }]}>{p.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Row 2: Par thème + Voir + */}
          <Text style={[styles.filterRowLabel, { color: C.gray500, marginTop: 8 }]}>Par thème</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupChipsScroll} contentContainerStyle={styles.groupChipsContainer}>
            {EXPLORE_GROUPS.map((group) => {
              const isActive = showSubcategories
                ? selectedGroup === group.key
                : selectedTags.includes(group.label);
              return (
                <TouchableOpacity
                  key={group.key}
                  style={[styles.groupChip, { backgroundColor: isActive ? C.primary : C.gray200, borderColor: isActive ? C.primary : C.borderLight }]}
                  onPress={() => {
                    if (showSubcategories) {
                      setSelectedGroup(group.key);
                    } else {
                      toggleTag(group.label);
                    }
                  }}
                >
                  <Text style={styles.groupChipEmoji}>{group.emoji}</Text>
                  <Text style={[styles.groupChipText, { color: isActive ? '#FFF' : C.gray800 }]}>{group.label}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.groupChip, { backgroundColor: showSubcategories ? Colors.gold : C.gray200, borderColor: showSubcategories ? Colors.gold : C.borderLight }]}
              onPress={() => setShowSubcategories(!showSubcategories)}
            >
              <Text style={[styles.groupChipText, { color: showSubcategories ? '#FFF' : C.gray800, fontWeight: '700' }]}>Voir +</Text>
              <Ionicons name={showSubcategories ? 'chevron-up' : 'chevron-down'} size={15} color={showSubcategories ? '#FFF' : C.gray800} />
            </TouchableOpacity>
          </ScrollView>

          {/* Subcategory cards (visible when Voir + toggled) */}
          {showSubcategories && (EXPLORE_GROUPS.find((g) => g.key === selectedGroup) || EXPLORE_GROUPS[0]).sections.map((section) => (
            <View key={section.title} style={styles.categorySectionWrap}>
              <Text style={[styles.categorySectionTitle, { color: C.gray600 }]}>{section.title}</Text>
              <View style={styles.categoryGrid}>
                {section.items.map((item) => {
                  const isSelected = selectedTags.includes(item.name);
                  const gradColors = item.gradient as [string, string];
                  return (
                    <TouchableOpacity
                      key={item.name}
                      style={[styles.categoryCard, isSelected && styles.categoryCardSelected]}
                      onPress={() => toggleTag(item.name)}
                      activeOpacity={0.8}
                    >
                      <LinearGradient colors={gradColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.categoryCardGradient, isSelected && { borderColor: C.primary, borderWidth: 2 }]}>
                        {item.icon && (
                          <View style={styles.categoryCardIconWrap}>
                            <Ionicons name={item.icon as any} size={18} color="rgba(255,255,255,0.5)" />
                          </View>
                        )}
                        {!item.icon && item.emoji && (
                          <View style={styles.categoryCardIconWrap}>
                            <Text style={{ fontSize: 16 }}>{item.emoji}</Text>
                          </View>
                        )}
                        <View style={styles.categoryCardBottom}>
                          <Text style={styles.categoryCardName}>{item.name}</Text>
                          {item.subtitle ? <Text style={styles.categoryCardSub}>{item.subtitle}</Text> : null}
                        </View>
                        {isSelected && (
                          <View style={styles.categoryCardCheck}>
                            <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                          </View>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
          {selectedTags.length > 0 && (
            <View style={styles.selectedTagsWrap}>
              {selectedTags.map((tag) => (
                <TouchableOpacity key={tag} style={[styles.selectedTagChip, { backgroundColor: C.primary + '20', borderColor: C.primary }]} onPress={() => toggleTag(tag)}>
                  <Text style={[styles.selectedTagText, { color: C.primary }]}>{tag}</Text>
                  <Ionicons name="close" size={14} color={C.primary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
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
            {canPublish && (
              <TouchableOpacity
                style={[styles.previewBtn, { borderColor: C.primary }]}
                onPress={() => setShowPreview(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="eye-outline" size={16} color={C.primary} />
                <Text style={[styles.previewBtnText, { color: C.primary }]}>Preview</Text>
              </TouchableOpacity>
            )}
            {!canPublish && (
              <Text style={[styles.publishHint, { color: C.gray500 }]}>Ajoute un titre et au moins 2 lieux pour publier</Text>
            )}
            {canPublish && qualityScore < 80 && (
              <Text style={[styles.publishHint, { color: C.gray500 }]}>Ajoute des détails pour améliorer ton plan</Text>
            )}
            <TouchableOpacity
              style={[
                styles.publishBtn,
                !canPublish && { backgroundColor: C.gray400, borderColor: C.gray400 },
                canPublish && qualityScore < 80 && { backgroundColor: 'transparent', borderColor: '#C8571A' },
                canPublish && qualityScore >= 80 && { backgroundColor: '#C8571A', borderColor: '#C8571A' },
              ]}
              onPress={() => {
                if (canPublish && qualityScore < 100 && missingCriteria.length > 0) {
                  openPublishSheet();
                } else {
                  handlePublish();
                }
              }}
              disabled={!canPublish || isPublishing}
              activeOpacity={0.8}
            >
              {isPublishing ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <View style={styles.publishBtnInner}>
                  <Text style={[
                    styles.publishBtnText,
                    !canPublish && { color: '#FFF' },
                    canPublish && qualityScore < 80 && { color: '#C8571A' },
                    canPublish && qualityScore >= 80 && { color: '#FFF' },
                  ]}>
                    {qualityScore >= 100 ? 'Publier le plan \u2726' : t.create_publish}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
        </Animated.View>

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
                  <View style={{ alignItems: 'center', paddingTop: 40 }}>
                    <Ionicons name="location" size={32} color={C.gray500} />
                    <Text style={[styles.modalSectionLabel, { color: C.gray600, textAlign: 'center', marginTop: 12 }]}>
                      Recherche un lieu...
                    </Text>
                  </View>
                ) : null
              }
            />
          </View>
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
                  <Ionicons name={isReordering ? 'checkmark' : 'reorder-three'} size={16} color={isReordering ? '#FFF' : C.gray700} />
                </TouchableOpacity>
              </View>

              {blockOrder.map((type, idx) => {
                const isFilled = type === 'photo' ? !!customPhoto : type === 'comment' ? !!customComment : !!customAnswer;

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
                        <TouchableOpacity
                          style={[styles.questionPicker, { backgroundColor: C.white, borderColor: C.borderLight }]}
                          onPress={() => setShowQuestionPicker(!showQuestionPicker)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.questionPickerText, { color: C.gray700 }]} numberOfLines={1}>{customQuestion}</Text>
                          <Ionicons name={showQuestionPicker ? 'chevron-up' : 'chevron-down'} size={16} color={C.gray500} />
                        </TouchableOpacity>
                        {showQuestionPicker && (
                          <View style={[styles.questionDropdown, { backgroundColor: C.white, borderColor: C.borderLight }]}>
                            <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
                              {PLACE_QUESTIONS.map((q) => (
                                <TouchableOpacity
                                  key={q}
                                  style={[
                                    styles.questionOption,
                                    { borderBottomColor: C.borderLight },
                                    q === customQuestion && { backgroundColor: C.primary + '12' },
                                  ]}
                                  onPress={() => { setCustomQuestion(q); setShowQuestionPicker(false); }}
                                  activeOpacity={0.7}
                                >
                                  <Text style={[styles.questionOptionText, { color: q === customQuestion ? C.primary : C.black }]}>{q}</Text>
                                  {q === customQuestion && <Ionicons name="checkmark" size={16} color={C.primary} />}
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        )}
                        <RNTextInput
                          style={[styles.customizeInput, { color: C.black, backgroundColor: C.white, borderColor: C.borderLight, marginTop: 8 }]}
                          placeholder="Ta réponse..."
                          placeholderTextColor={C.gray500}
                          value={customAnswer}
                          onChangeText={setCustomAnswer}
                          multiline
                          maxLength={200}
                        />
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
                <Ionicons name={editingPlaceIndex !== null ? 'checkmark' : 'add'} size={18} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.customizeConfirmText}>{editingPlaceIndex !== null ? 'Enregistrer' : 'Ajouter ce lieu'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ========== PREVIEW MODAL ========== */}
        <Modal visible={showPreview} animationType="slide" presentationStyle="pageSheet">
          <View style={[styles.previewModal, { backgroundColor: C.white, paddingTop: insets.top }]}>
            <View style={[styles.previewHeader, { borderBottomColor: C.border }]}>
              <Text style={[styles.previewTitle, { color: C.black }]}>Preview</Text>
              <TouchableOpacity onPress={() => setShowPreview(false)}>
                <Ionicons name="close" size={24} color={C.black} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.previewSubtitle, { color: C.gray600 }]}>
              Voici comment ton plan apparaîtra dans le feed
            </Text>
            <ScrollView contentContainerStyle={styles.previewScroll} showsVerticalScrollIndicator={false}>
              <PlanCard
                plan={{
                  id: 'preview',
                  authorId: user?.id ?? '',
                  author: user ?? { id: '', username: '', displayName: 'Toi', initials: '?', avatarBg: '#C8571A', avatarColor: '#FFF', badgeType: 'none' as any, isPrivate: false, xpPoints: 0, coins: 0, level: 1, xpForNextLevel: 100, rank: 'Explorateur', planCount: 0, followersCount: 0, followingCount: 0, likesReceived: 0, unlockedBadges: [], createdAt: new Date().toISOString() },
                  title: title || 'Mon plan',
                  gradient: 'linear-gradient(135deg, #FF9A60, #FF6B35, #C94520)',
                  tags: selectedTags,
                  places: places.map((p) => ({
                    id: p.id,
                    googlePlaceId: p.googlePlaceId,
                    name: p.name,
                    type: p.type,
                    address: p.address || '',
                    rating: 0,
                    reviewCount: 0,
                    ratingDistribution: [0, 0, 0, 0, 0] as [number, number, number, number, number],
                    reviews: [],
                    placePrice: parseInt(p.price, 10) || 0,
                    placeDuration: parseInt(p.duration, 10) || 0,
                  })),
                  price: `${totalPrice}€`,
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
                }}
                isLiked={false}
                isSaved={false}
                onPress={() => {}}
                onLike={() => {}}
                onSave={() => {}}
                onComment={() => {}}
                onAuthorPress={() => {}}
              />
            </ScrollView>
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
                  <TouchableOpacity style={[styles.sheetBtnOutline, { borderColor: '#C8571A' }]} onPress={closePublishSheet} activeOpacity={0.7}>
                    <Text style={[styles.sheetBtnOutlineText, { color: '#C8571A' }]}>Continuer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.sheetBtnFill, { backgroundColor: '#C8571A' }]} onPress={() => { setShowPublishSheet(false); handlePublish(); }} activeOpacity={0.7}>
                    <Text style={styles.sheetBtnFillText}>Publier quand même</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </Animated.View>
          </TouchableOpacity>
        )}
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
  draftBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  draftBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  draftBannerText: { fontSize: 13, fontWeight: '600', fontFamily: Fonts.serif },
  draftBannerDiscard: { fontSize: 12, fontWeight: '600' },
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
  previewBtnText: { fontSize: 14, fontFamily: Fonts.serifBold },
  previewModal: { flex: 1 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingVertical: 12, borderBottomWidth: 1 },
  previewTitle: { fontSize: 20, fontFamily: Fonts.serifBold },
  previewSubtitle: { fontSize: 13, textAlign: 'center', marginTop: 12, marginBottom: 16, fontFamily: Fonts.serif },
  previewScroll: { paddingBottom: 40 },
  publishSection: { marginTop: 20, marginBottom: 10 },
  publishBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, overflow: 'hidden' },
  publishBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  publishBtnText: { fontSize: 15, fontFamily: Fonts.serifBold },
  publishHint: { fontSize: 12, textAlign: 'center', marginBottom: 8, fontFamily: Fonts.serif },
  costNote: { fontSize: 12, textAlign: 'center', marginTop: 10 },

  // Quality progress bar
  qualityBarWrap: { paddingHorizontal: Layout.screenPadding, paddingTop: 10, paddingBottom: 2 },
  qualityBarBg: { height: 10, borderRadius: 20, backgroundColor: '#EDE8E0', overflow: 'hidden' },
  qualityBarFill: { height: 10, borderRadius: 20, overflow: 'hidden' },
  qualityShimmer: { position: 'absolute', top: 0, bottom: 0, width: 60, backgroundColor: 'rgba(255,255,255,0.45)', borderRadius: 20 },
  qualityLabelWrap: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  qualityLabel: { fontSize: 11, fontWeight: '600', fontFamily: Fonts.serifSemiBold },
  qualityCheck: { fontSize: 13, fontWeight: '800', fontFamily: Fonts.serifBold },

  // Publish bottom sheet
  sheetOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end', zIndex: 999 },
  sheetContainer: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingBottom: 34 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '800', fontFamily: Fonts.serifBold, marginBottom: 4 },
  sheetSubtitle: { fontSize: 13, fontFamily: Fonts.serif, marginBottom: 14 },
  sheetCriterion: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  sheetCriterionIcon: { fontSize: 16, marginRight: 10 },
  sheetCriterionText: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
  sheetButtons: { flexDirection: 'row', gap: 10, marginTop: 18 },
  sheetBtnOutline: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, alignItems: 'center' },
  sheetBtnOutlineText: { fontSize: 14, fontFamily: Fonts.serifBold },
  sheetBtnFill: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  sheetBtnFillText: { fontSize: 14, fontFamily: Fonts.serifBold, color: '#FFF' },
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
  photoAddBtn: { width: 90, height: 90, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  photoAddText: { fontSize: 10, fontFamily: Fonts.serifSemiBold, marginTop: 4 },
  photoHint: { fontSize: 11, fontFamily: Fonts.serif, marginBottom: 12 },

  // Category group chips
  filterRowLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  groupChipsScroll: { flexGrow: 0, marginBottom: 12 },
  groupChipsContainer: { gap: 8 },
  groupChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  groupChipEmoji: { fontSize: 13, marginRight: 5 },
  groupChipText: { fontSize: 12, fontFamily: Fonts.serifSemiBold },

  // Category sections & cards
  categorySectionWrap: { marginBottom: 12 },
  categorySectionTitle: { fontSize: 10, fontFamily: Fonts.serifSemiBold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryCard: { width: '48%' as any, borderRadius: 14, overflow: 'hidden' },
  categoryCardSelected: {},
  categoryCardGradient: { padding: 12, minHeight: 80, justifyContent: 'flex-end', borderRadius: 14 },
  categoryCardIconWrap: { position: 'absolute', top: 10, right: 10 },
  categoryCardBottom: {},
  categoryCardName: { fontSize: 13, fontFamily: Fonts.serifBold, color: '#FFF' },
  categoryCardSub: { fontSize: 10, fontFamily: Fonts.serif, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  categoryCardCheck: { position: 'absolute', top: 10, left: 10 },

  // Selected tags
  selectedTagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, marginBottom: 4 },
  selectedTagChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, gap: 4 },
  selectedTagText: { fontSize: 11, fontFamily: Fonts.serifSemiBold },

  // ========== PLACE CUSTOMIZATION MODAL ==========
  customizeContainer: { flex: 1 },
  customizeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Layout.screenPadding, paddingVertical: 14, borderBottomWidth: 1 },
  customizeTitle: { fontSize: 16, fontFamily: Fonts.serifBold, flex: 1, textAlign: 'center' },
  customizeScroll: { paddingBottom: 40 },
  customizeBanner: { height: 200, position: 'relative' },
  customizeBannerImg: { width: '100%', height: '100%', resizeMode: 'cover' },
  customizeBannerPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  customizeBannerOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 },
  customizeBannerInfo: { position: 'absolute', bottom: 16, left: 16, right: 16 },
  customizeBannerName: { fontSize: 20, fontFamily: Fonts.serifBold, color: '#FFF', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  customizeBannerType: { fontSize: 12, fontFamily: Fonts.serif, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  customizeSectionTitle: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: Layout.screenPadding, paddingTop: 20, paddingBottom: 12 },
  customizeBlock: { marginHorizontal: Layout.screenPadding, marginBottom: 14, borderRadius: 14, borderWidth: 1, padding: 14 },
  customizeBlockHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  customizeBlockIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  customizeBlockTitle: { fontSize: 14, fontFamily: Fonts.serifSemiBold, flex: 1 },
  customizeBlockHint: { fontSize: 13, fontStyle: 'italic', fontFamily: Fonts.serif },
  customizePhotoPreview: { width: '100%', height: 140, borderRadius: 10, resizeMode: 'cover', marginTop: 4 },
  customizeInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, fontFamily: Fonts.serif, minHeight: 60, textAlignVertical: 'top' },
  customizeQuestion: { fontSize: 13, fontStyle: 'italic', fontFamily: Fonts.serif, marginBottom: 8 },
  questionPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  questionPickerText: { fontSize: 13, fontFamily: Fonts.serifSemiBold, flex: 1, marginRight: 8 },
  questionDropdown: { borderRadius: 10, borderWidth: 1, marginTop: 6, overflow: 'hidden' },
  questionOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1 },
  questionOptionText: { fontSize: 13, fontFamily: Fonts.serif, flex: 1, marginRight: 8 },
  customizeFooter: { borderTopWidth: 1, paddingHorizontal: Layout.screenPadding, paddingVertical: 14 },
  customizeConfirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14 },
  customizeConfirmText: { fontSize: 15, fontFamily: Fonts.serifBold, color: '#FFF' },

  // Reorder UI
  customizeSectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: Layout.screenPadding },
  reorderToggle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  customizeBlockReorder: { opacity: 0.92, borderStyle: 'dashed' },
  reorderArrows: { flexDirection: 'column', alignItems: 'center', marginRight: 4 },
});
