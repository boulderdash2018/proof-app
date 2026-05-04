import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput as RNTextInput,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { Colors, Fonts } from '../constants';
import { storage } from '../services/firebaseConfig';
import { fetchPlanById, publishCoPlan, updatePlan } from '../services/plansService';
import { fetchPlanDraft } from '../services/planDraftService';
import { notifyTaggedInPlan } from '../services/notificationsService';
import { pickImage } from '../utils/pickImage';
import { CreatorTipInput } from '../components/publish/CreatorTipInput';
import { DurationPickerSheet } from '../components/DurationPickerSheet';
import { PricePickerSheet } from '../components/PricePickerSheet';
import { Avatar, GroupAlbumSheet } from '../components';
import { useAuthStore } from '../store/authStore';
import { useCity } from '../hooks/useCity';
import { Plan, PlanDraft, CoAuthor, Place } from '../types';

// ──────────────────────────────────────────────────────────────
// Wizard step constants
// ──────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;
const TOTAL_STEPS: Step = 4;
const TIP_MIN_CHARS = 10;
const TIP_MAX_CHARS = 180;

const PRICE_RANGES: { label: string; min: number; max: number }[] = [
  { label: 'Gratuit', min: 0, max: 0 },
  { label: '< 15', min: 1, max: 15 },
  { label: '15–30', min: 15, max: 30 },
  { label: '30–60', min: 30, max: 60 },
  { label: '60–100', min: 60, max: 100 },
  { label: '100+', min: 100, max: Infinity },
];

const formatDurationLabel = (min: string | number) => {
  const n = typeof min === 'string' ? parseInt(min, 10) : min;
  if (Number.isNaN(n) || n <= 0) return '';
  if (n < 60) return `${n}min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
};

/**
 * Per-place edits saved locally before publish. Reflète les enrichissements
 * que l'utilisateur ajoute à chaque lieu pendant le wizard (étape 3) :
 *   • photo : URL choisie par l'utilisateur (override de la photo Google)
 *   • duration / priceRangeIndex : saisis via les sheets de référence
 *
 * Au publish, ces edits sont mergés dans `plan.places[]` via updatePlan.
 */
interface PlaceEdit {
  customPhoto?: string;
  duration?: string;
  priceRangeIndex?: number;
}

/**
 * CoPlanPublishScreen — wizard 4 étapes pour publier un co-plan
 * post-exécution. Reprend la même logique que le mode customize de
 * CreateScreen ("Personnaliser ce plan" depuis Organize), avec en plus
 * une étape 1 dédiée à l'identification des co-auteurs.
 *
 * Étape 1 — IDENTIFIER : "Veux-tu identifier les membres du groupe ?"
 *           Oui → cocher les participants à co-signer (notifs envoyées)
 *           Non → publication solo, aucune mention des participants
 *
 * Étape 2 — COVER     : photo de couverture (pellicule + album du groupe)
 * Étape 3 — LIEUX     : chips photo / durée / prix par lieu (référence
 *                       UI partagée avec CreateScreen)
 * Étape 4 — TIP       : conseil créateur (CreatorTipInput partagé)
 *
 * Au publish : updatePlan(places enrichis) + publishCoPlan(visibility:'public'
 * + coAuthors + cover + tip) + notifyTaggedInPlan pour chaque coAuthor.
 */
export const CoPlanPublishScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const planId = route.params?.planId as string;
  const me = useAuthStore((s) => s.user);
  const cityConfig = useCity();

  // ── Data fetch ──
  const [plan, setPlan] = useState<Plan | null>(null);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await fetchPlanById(planId);
        if (cancelled) return;
        setPlan(p);
        if (p?.sourceDraftId) {
          const d = await fetchPlanDraft(p.sourceDraftId);
          if (!cancelled) setDraft(d);
        }
      } catch (err) {
        console.warn('[CoPlanPublishScreen] fetch error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [planId]);

  // ── Wizard state ──
  const [step, setStep] = useState<Step>(1);

  // Étape 1 — identification
  const [identifyMembers, setIdentifyMembers] = useState<boolean | null>(null); // null = pas encore choisi
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<Set<string>>(new Set());

  // Étape 2 — cover
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverSourceSheetOpen, setCoverSourceSheetOpen] = useState(false);
  const [albumPickerOpen, setAlbumPickerOpen] = useState(false);

  // Étape 3 — places edits
  const [placeEdits, setPlaceEdits] = useState<Record<string, PlaceEdit>>({});
  const [durationPickerPlaceId, setDurationPickerPlaceId] = useState<string | null>(null);
  const [pricePickerPlaceId, setPricePickerPlaceId] = useState<string | null>(null);
  const [photoUploadingForId, setPhotoUploadingForId] = useState<string | null>(null);

  // Étape 4 — tip + final
  const [tip, setTip] = useState('');

  const [submitting, setSubmitting] = useState(false);

  // Préfill une fois plan + draft chargés.
  useEffect(() => {
    if (plan && coverUrl === null && plan.coverPhotos?.[0]) setCoverUrl(plan.coverPhotos[0]);
    if (plan && tip === '' && typeof plan.authorTip === 'string') setTip(plan.authorTip);
    if (draft && me && selectedParticipantIds.size === 0) {
      const all = new Set<string>();
      draft.participants.forEach((id) => {
        if (id !== me.id) all.add(id);
      });
      setSelectedParticipantIds(all);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, draft, me?.id]);

  const otherParticipants = useMemo(() => {
    if (!draft || !me) return [];
    return draft.participants
      .filter((id) => id !== me.id)
      .map((id) => draft.participantDetails[id])
      .filter(Boolean);
  }, [draft, me?.id]);

  const conversationId = draft?.conversationId || draft?.publishedConvId;

  // ── Step gates : si la step courante n'est pas validée, on bloque "Suivant" ──
  const canAdvanceFromStep = (s: Step): boolean => {
    if (s === 1) return identifyMembers !== null;
    if (s === 2) return !!coverUrl;
    if (s === 3) {
      if (!plan) return false;
      return plan.places.every((p) => {
        const edit = placeEdits[p.id] || {};
        const hasPhoto = !!(edit.customPhoto || p.photoUrls?.[0]);
        const duration = edit.duration ?? '';
        const priceIdx = edit.priceRangeIndex ?? -1;
        return hasPhoto && !!duration && priceIdx >= 0;
      });
    }
    if (s === 4) return tip.trim().length >= TIP_MIN_CHARS;
    return false;
  };

  const canPublish = step === TOTAL_STEPS && canAdvanceFromStep(TOTAL_STEPS);

  const goNext = () => {
    if (!canAdvanceFromStep(step)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (step < TOTAL_STEPS) setStep((step + 1) as Step);
  };
  const goPrev = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (step > 1) setStep((step - 1) as Step);
  };

  // ── Étape 1 — identification toggles ──
  const toggleParticipant = (userId: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedParticipantIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  // ── Étape 2 — cover photo (pellicule + album groupe) ──
  const openCoverPicker = () => {
    if (conversationId) {
      setCoverSourceSheetOpen(true);
    } else {
      handlePickCoverFromLibrary();
    }
  };
  const handlePickCoverFromLibrary = async () => {
    setCoverSourceSheetOpen(false);
    const picked = await pickImage({ quality: 0.7 });
    if (!picked) return;
    setUploadingCover(true);
    try {
      const filename = `plans/${planId}_cover_${Date.now()}.jpg`;
      const storageRef = ref(storage, filename);
      await uploadString(storageRef, picked.dataUrl, 'data_url');
      const url = await getDownloadURL(storageRef);
      setCoverUrl(url);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      console.warn('[CoPlanPublishScreen] cover upload failed:', err);
      Alert.alert('Oups', "L'upload de la photo a échoué. Réessaye.");
    } finally {
      setUploadingCover(false);
    }
  };
  const handlePickCoverFromAlbum = () => {
    setCoverSourceSheetOpen(false);
    setAlbumPickerOpen(true);
  };
  const handleAlbumCoverSelected = (urls: string[]) => {
    setAlbumPickerOpen(false);
    if (urls.length > 0) {
      setCoverUrl(urls[0]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  };

  // ── Étape 3 — per-place photo / duration / price ──
  const updatePlaceEdit = (placeId: string, patch: Partial<PlaceEdit>) => {
    setPlaceEdits((prev) => ({
      ...prev,
      [placeId]: { ...prev[placeId], ...patch },
    }));
  };

  const handlePickPlacePhoto = async (placeId: string) => {
    const picked = await pickImage({ quality: 0.7 });
    if (!picked) return;
    setPhotoUploadingForId(placeId);
    try {
      const filename = `plans/${planId}_${placeId}_${Date.now()}.jpg`;
      const storageRef = ref(storage, filename);
      await uploadString(storageRef, picked.dataUrl, 'data_url');
      const url = await getDownloadURL(storageRef);
      updatePlaceEdit(placeId, { customPhoto: url });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      console.warn('[CoPlanPublishScreen] place photo upload failed:', err);
      Alert.alert('Oups', "L'upload de la photo a échoué.");
    } finally {
      setPhotoUploadingForId(null);
    }
  };

  // ── PUBLISH ──
  const handlePublish = async () => {
    if (!plan || !canPublish || submitting) return;
    setSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    try {
      // 1. Merge per-place edits dans plan.places.
      const enrichedPlaces: Place[] = plan.places.map((p) => {
        const edit = placeEdits[p.id];
        if (!edit) return p;
        return {
          ...p,
          ...(edit.customPhoto && { customPhoto: edit.customPhoto }),
          ...(edit.duration && { placeDuration: parseInt(edit.duration, 10) || undefined }),
          ...(edit.priceRangeIndex != null && edit.priceRangeIndex >= 0 && {
            priceLevel: edit.priceRangeIndex,
            placePrice: edit.priceRangeIndex === 0 ? 0 : PRICE_RANGES[edit.priceRangeIndex].min,
          }),
        };
      });

      // 2. Update places via updatePlan (existant — accepte places enrichis).
      await updatePlan(planId, {
        title: plan.title,
        tags: plan.tags,
        places: enrichedPlaces,
        price: plan.price,
        duration: plan.duration,
        transport: plan.transport,
        travelSegments: plan.travelSegments || [],
        coverPhotos: coverUrl ? [coverUrl] : (plan.coverPhotos || []),
        city: plan.city,
        authorTip: tip.trim(),
      });

      // 3. CoAuthors selon choix étape 1.
      const coAuthors: CoAuthor[] = identifyMembers
        ? otherParticipants
            .filter((p) => selectedParticipantIds.has(p.userId))
            .map((p) => ({
              id: p.userId,
              username: p.username,
              displayName: p.displayName,
              initials: p.initials,
              avatarUrl: p.avatarUrl,
              avatarBg: p.avatarBg,
              avatarColor: p.avatarColor,
            }))
        : [];

      // 4. Publish — visibility:'public' + coAuthors + meta.
      await publishCoPlan(planId, {
        title: plan.title,
        coverPhotos: coverUrl ? [coverUrl] : undefined,
        authorTip: tip.trim() || undefined,
        coAuthors,
      });

      // 5. Notifs taggués (best-effort, on bloque pas la publication).
      if (me && coAuthors.length > 0) {
        const planForNotif: Plan = {
          ...plan,
          coverPhotos: coverUrl ? [coverUrl] : plan.coverPhotos,
        };
        Promise.all(
          coAuthors.map((co) => notifyTaggedInPlan(me, co.id, planForNotif)),
        ).catch((err) => console.warn('[CoPlanPublishScreen] notif fail:', err));
      }

      // 6. Retour feed.
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }] as any,
      });
    } catch (err: any) {
      console.warn('[CoPlanPublishScreen] publish error:', err);
      // Surface le vrai message d'erreur pour aider au debug — un
      // 'Oups' générique cachait des problèmes Firestore (undefined
      // dans places, permissions rules, etc.) qui se résolvent vite
      // une fois identifiés.
      const msg = err?.message || String(err) || 'Erreur inconnue';
      Alert.alert('La publication a échoué', msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render scaffolding ──
  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Header onBack={() => navigation.goBack()} step={null} totalSteps={null} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </View>
    );
  }
  if (!plan) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Header onBack={() => navigation.goBack()} step={null} totalSteps={null} />
        <View style={styles.errorWrap}>
          <Ionicons name="alert-circle-outline" size={36} color={Colors.textTertiary} />
          <Text style={styles.errorText}>Plan introuvable.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <Header
        onBack={step === 1 ? () => navigation.goBack() : goPrev}
        step={step}
        totalSteps={TOTAL_STEPS}
      />

      {/* Progress segments */}
      <View style={styles.progressRow}>
        {[1, 2, 3, 4].map((s) => (
          <View
            key={s}
            style={[
              styles.progressSeg,
              s <= step && styles.progressSegActive,
            ]}
          />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 1 && (
          <Step1Identify
            identifyMembers={identifyMembers}
            setIdentifyMembers={setIdentifyMembers}
            otherParticipants={otherParticipants}
            selectedParticipantIds={selectedParticipantIds}
            toggleParticipant={toggleParticipant}
          />
        )}
        {step === 2 && (
          <Step2Cover
            coverUrl={coverUrl}
            uploadingCover={uploadingCover}
            onPickCover={openCoverPicker}
          />
        )}
        {step === 3 && (
          <Step3Places
            plan={plan}
            placeEdits={placeEdits}
            currency={cityConfig.currency}
            photoUploadingForId={photoUploadingForId}
            onPickPhoto={handlePickPlacePhoto}
            onOpenDuration={(id) => setDurationPickerPlaceId(id)}
            onOpenPrice={(id) => setPricePickerPlaceId(id)}
          />
        )}
        {step === 4 && (
          <Step4Tip value={tip} onChange={setTip} />
        )}

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <TouchableOpacity
          style={[
            styles.primaryBtn,
            !canAdvanceFromStep(step) && styles.primaryBtnDisabled,
          ]}
          onPress={step === TOTAL_STEPS ? handlePublish : goNext}
          disabled={!canAdvanceFromStep(step) || submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.textOnAccent} />
          ) : (
            <>
              <Ionicons
                name={step === TOTAL_STEPS ? 'paper-plane' : 'arrow-forward'}
                size={15}
                color={canAdvanceFromStep(step) ? Colors.textOnAccent : Colors.textTertiary}
              />
              <Text style={[
                styles.primaryBtnText,
                !canAdvanceFromStep(step) && styles.primaryBtnTextDisabled,
              ]}>
                {step === TOTAL_STEPS
                  ? 'Publier sur le feed'
                  : step === 1
                    ? 'Suivant — la photo'
                    : step === 2
                      ? 'Suivant — les lieux'
                      : 'Suivant — ton conseil'}
              </Text>
            </>
          )}
        </TouchableOpacity>
        {!canAdvanceFromStep(step) && !submitting && (
          <Text style={styles.gateHint}>
            {step === 1 && 'Indique si tu veux identifier les autres pour continuer.'}
            {step === 2 && 'Ajoute une photo de couverture pour continuer.'}
            {step === 3 && 'Complète photo, durée et prix pour chaque lieu.'}
            {step === 4 && `Le conseil doit faire au moins ${TIP_MIN_CHARS} caractères.`}
          </Text>
        )}
      </View>

      {/* Source-choice sheet : pellicule vs album du groupe */}
      <Modal
        visible={coverSourceSheetOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setCoverSourceSheetOpen(false)}
      >
        <Pressable style={styles.sourceBackdrop} onPress={() => setCoverSourceSheetOpen(false)}>
          <Pressable style={styles.sourceCard} onPress={() => {}}>
            <View style={styles.sourceHandle} />
            <Text style={styles.sourceTitle}>Choisir une photo</Text>
            <Text style={styles.sourceHint}>D'où veux-tu prendre la photo de couverture ?</Text>
            <TouchableOpacity style={styles.sourceOption} onPress={handlePickCoverFromAlbum} activeOpacity={0.7}>
              <View style={[styles.sourceOptionIcon, { backgroundColor: Colors.terracotta50 }]}>
                <Ionicons name="people" size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sourceOptionTitle}>Album du groupe</Text>
                <Text style={styles.sourceOptionDesc}>Photos partagées dans la conversation</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.gray500} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.sourceOption} onPress={handlePickCoverFromLibrary} activeOpacity={0.7}>
              <View style={[styles.sourceOptionIcon, { backgroundColor: Colors.terracotta50 }]}>
                <Ionicons name="image" size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sourceOptionTitle}>Pellicule</Text>
                <Text style={styles.sourceOptionDesc}>Photo prise par toi sur ton téléphone</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.gray500} />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {conversationId && (
        <GroupAlbumSheet
          visible={albumPickerOpen}
          onClose={() => setAlbumPickerOpen(false)}
          conversationId={conversationId}
          selectionMode={{
            max: 1,
            initialSelected: coverUrl ? [coverUrl] : [],
            onSelected: handleAlbumCoverSelected,
          }}
        />
      )}

      {/* Duration picker (étape 3) */}
      {(() => {
        const target = durationPickerPlaceId
          ? plan.places.find((p) => p.id === durationPickerPlaceId) || null
          : null;
        if (!target) return null;
        const edit = placeEdits[target.id] || {};
        const currentMinutes = edit.duration
          ? parseInt(edit.duration, 10) || null
          : (target.placeDuration || null);
        return (
          <DurationPickerSheet
            visible={!!target}
            onClose={() => setDurationPickerPlaceId(null)}
            currentMinutes={currentMinutes}
            placeName={target.name}
            placeCategory={target.type}
            onConfirm={async (minutes) => {
              const value = minutes == null ? '' : String(minutes);
              updatePlaceEdit(target.id, { duration: value });
              setDurationPickerPlaceId(null);
            }}
          />
        );
      })()}

      {/* Price picker (étape 3) */}
      {(() => {
        const target = pricePickerPlaceId
          ? plan.places.find((p) => p.id === pricePickerPlaceId) || null
          : null;
        if (!target) return null;
        const edit = placeEdits[target.id] || {};
        return (
          <PricePickerSheet
            visible={!!target}
            onClose={() => setPricePickerPlaceId(null)}
            currentRangeIndex={edit.priceRangeIndex ?? -1}
            currency={cityConfig.currency}
            placeName={target.name}
            onConfirm={async (rangeIndex) => {
              updatePlaceEdit(target.id, { priceRangeIndex: rangeIndex });
              setPricePickerPlaceId(null);
            }}
          />
        );
      })()}
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// Header sub-component
// ══════════════════════════════════════════════════════════════

const Header: React.FC<{
  onBack: () => void;
  step: Step | null;
  totalSteps: Step | null;
}> = ({ onBack, step, totalSteps }) => (
  <View style={styles.header}>
    <TouchableOpacity
      style={styles.closeBtn}
      onPress={onBack}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
    </TouchableOpacity>
    <View style={styles.headerCenter}>
      {step != null && totalSteps != null && (
        <Text style={styles.headerEyebrow}>ÉTAPE {step} SUR {totalSteps}</Text>
      )}
      <Text style={styles.headerTitle}>Publier le plan</Text>
    </View>
    <View style={styles.headerSide} />
  </View>
);

// ══════════════════════════════════════════════════════════════
// STEP 1 — Identifier les membres
// ══════════════════════════════════════════════════════════════

interface Step1Props {
  identifyMembers: boolean | null;
  setIdentifyMembers: (v: boolean) => void;
  otherParticipants: Array<{
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    avatarBg: string;
    avatarColor: string;
    initials: string;
  }>;
  selectedParticipantIds: Set<string>;
  toggleParticipant: (userId: string) => void;
}
const Step1Identify: React.FC<Step1Props> = ({
  identifyMembers,
  setIdentifyMembers,
  otherParticipants,
  selectedParticipantIds,
  toggleParticipant,
}) => (
  <>
    <Text style={styles.sectionEyebrow}>IDENTIFIER LES MEMBRES</Text>
    <Text style={styles.sectionTitle}>Tu veux nommer ceux qui étaient là ?</Text>
    <Text style={styles.sectionHelp}>
      Si oui, le plan apparaîtra co-signé avec leurs noms et ils recevront
      une notification. Si non, la publication reste solo, sans mention.
    </Text>

    <TouchableOpacity
      style={[
        styles.choiceCard,
        identifyMembers === true && styles.choiceCardActive,
      ]}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        setIdentifyMembers(true);
      }}
      activeOpacity={0.85}
    >
      <View style={styles.choiceIconWrap}>
        <Ionicons name="people" size={20} color={Colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.choiceTitle}>Oui, identifier les autres</Text>
        <Text style={styles.choiceDesc}>
          Plan co-signé · ils sont notifiés
        </Text>
      </View>
      {identifyMembers === true && (
        <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
      )}
    </TouchableOpacity>

    <TouchableOpacity
      style={[
        styles.choiceCard,
        identifyMembers === false && styles.choiceCardActive,
      ]}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        setIdentifyMembers(false);
      }}
      activeOpacity={0.85}
    >
      <View style={styles.choiceIconWrap}>
        <Ionicons name="person" size={20} color={Colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.choiceTitle}>Non, publier en solo</Text>
        <Text style={styles.choiceDesc}>
          Aucune mention des autres participants
        </Text>
      </View>
      {identifyMembers === false && (
        <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
      )}
    </TouchableOpacity>

    {identifyMembers === true && otherParticipants.length > 0 && (
      <>
        <Text style={[styles.sectionEyebrow, { marginTop: 22 }]}>
          AVEC ({selectedParticipantIds.size}/{otherParticipants.length})
        </Text>
        <Text style={styles.sectionHelp}>
          Décoche ceux que tu ne veux pas identifier.
        </Text>
        <View style={styles.participantsRow}>
          {otherParticipants.map((p) => {
            const isSelected = selectedParticipantIds.has(p.userId);
            return (
              <TouchableOpacity
                key={p.userId}
                style={[styles.participantChip, isSelected && styles.participantChipActive]}
                onPress={() => toggleParticipant(p.userId)}
                activeOpacity={0.85}
              >
                <Avatar
                  avatarUrl={p.avatarUrl ?? undefined}
                  bg={p.avatarBg}
                  color={p.avatarColor}
                  initials={p.initials}
                  size="S"
                />
                <Text
                  style={[styles.participantName, isSelected && styles.participantNameActive]}
                  numberOfLines={1}
                >
                  {p.displayName.split(' ')[0]}
                </Text>
                {isSelected && <Ionicons name="checkmark-circle" size={14} color={Colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </>
    )}
  </>
);

// ══════════════════════════════════════════════════════════════
// STEP 2 — Cover photo
// ══════════════════════════════════════════════════════════════

const Step2Cover: React.FC<{
  coverUrl: string | null;
  uploadingCover: boolean;
  onPickCover: () => void;
}> = ({ coverUrl, uploadingCover, onPickCover }) => (
  <>
    <Text style={styles.sectionEyebrow}>PHOTO DE COUVERTURE</Text>
    <Text style={styles.sectionTitle}>La photo qui résume le plan</Text>
    <Text style={styles.sectionHelp}>
      Choisis-en une qui donne envie. Tu peux la prendre depuis l'album du
      groupe (photos partagées pendant la session) ou ta pellicule perso.
    </Text>
    <TouchableOpacity
      style={styles.coverWrap}
      onPress={onPickCover}
      activeOpacity={0.85}
      disabled={uploadingCover}
    >
      {coverUrl ? (
        <Image source={{ uri: coverUrl }} style={styles.coverImage} resizeMode="cover" />
      ) : (
        <View style={styles.coverPlaceholder}>
          <Ionicons name="image-outline" size={28} color={Colors.textTertiary} />
          <Text style={styles.coverPlaceholderText}>Choisir une photo</Text>
        </View>
      )}
      {uploadingCover && (
        <View style={styles.coverOverlay}>
          <ActivityIndicator color={Colors.textOnAccent} />
        </View>
      )}
      {coverUrl && !uploadingCover && (
        <View style={styles.coverEditBadge}>
          <Ionicons name="create" size={12} color={Colors.textOnAccent} />
          <Text style={styles.coverEditText}>Changer</Text>
        </View>
      )}
    </TouchableOpacity>
  </>
);

// ══════════════════════════════════════════════════════════════
// STEP 3 — Personnalise les lieux (chips photo / durée / prix)
// ══════════════════════════════════════════════════════════════

interface Step3Props {
  plan: Plan;
  placeEdits: Record<string, PlaceEdit>;
  currency: string;
  photoUploadingForId: string | null;
  onPickPhoto: (placeId: string) => void;
  onOpenDuration: (placeId: string) => void;
  onOpenPrice: (placeId: string) => void;
}
const Step3Places: React.FC<Step3Props> = ({
  plan, placeEdits, currency, photoUploadingForId, onPickPhoto, onOpenDuration, onOpenPrice,
}) => (
  <>
    <Text style={styles.sectionEyebrow}>PERSONNALISE TES LIEUX</Text>
    <Text style={styles.sectionTitle}>Ajoute prix, durée et photo</Text>
    <Text style={styles.sectionHelp}>
      Ces détails rendent ton plan utile pour les autres. Tape un chip pour
      ajouter l'info.
    </Text>

    <View style={{ gap: 12, marginTop: 4 }}>
      {plan.places.map((place, idx) => {
        const edit = placeEdits[place.id] || {};
        const photoUrl = edit.customPhoto || place.photoUrls?.[0];
        const photoFilled = !!photoUrl;
        const durationFilled = !!edit.duration;
        const priceFilled = (edit.priceRangeIndex ?? -1) >= 0;
        const filledCount = (photoFilled ? 1 : 0) + (durationFilled ? 1 : 0) + (priceFilled ? 1 : 0);
        const allFilled = filledCount === 3;
        const priceLabel = priceFilled
          ? (() => {
              const r = PRICE_RANGES[edit.priceRangeIndex!];
              return r.max === 0 ? r.label : r.max === Infinity ? `${r.min}${currency}+` : `${r.label}${currency}`;
            })()
          : null;
        const isUploadingThis = photoUploadingForId === place.id;
        return (
          <View key={place.id} style={styles.placeCard}>
            <View style={styles.placeCardTop}>
              <TouchableOpacity
                style={styles.placeThumb}
                onPress={() => onPickPhoto(place.id)}
                activeOpacity={0.85}
                disabled={isUploadingThis}
              >
                {isUploadingThis ? (
                  <View style={[styles.placeThumbImg, styles.placeThumbPlaceholder]}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                  </View>
                ) : photoFilled ? (
                  <Image source={{ uri: photoUrl! }} style={styles.placeThumbImg} />
                ) : (
                  <View style={[styles.placeThumbImg, styles.placeThumbPlaceholder]}>
                    <Ionicons name="camera" size={18} color={Colors.primary} />
                  </View>
                )}
              </TouchableOpacity>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.placeIndexBadge}>
                  <Text style={styles.placeIndexText}>{idx + 1}</Text>
                </View>
                <Text style={styles.placeName} numberOfLines={1}>{place.name}</Text>
                <Text style={styles.placeAddr} numberOfLines={1}>{place.address || place.type}</Text>
              </View>
            </View>

            {/* Jauge */}
            <View style={styles.gauge}>
              <View style={styles.gaugeDots}>
                {[photoFilled, durationFilled, priceFilled].map((on, i) => (
                  <View key={i} style={[styles.gaugeDot, on && styles.gaugeDotOn]} />
                ))}
              </View>
              <Text style={[styles.gaugeText, allFilled && { color: Colors.primary }]}>
                {allFilled ? 'Tout est rempli ✓' : `${filledCount}/3 infos`}
              </Text>
            </View>

            {/* 3 chips CTA */}
            <View style={styles.chipsRow}>
              <TouchableOpacity
                style={[styles.chip, photoFilled && styles.chipFilled]}
                onPress={() => onPickPhoto(place.id)}
                activeOpacity={0.85}
                disabled={isUploadingThis}
              >
                <Ionicons
                  name={photoFilled ? 'image' : 'image-outline'}
                  size={14}
                  color={photoFilled ? Colors.terracotta700 : Colors.primary}
                />
                <Text style={[styles.chipText, photoFilled && styles.chipTextFilled]} numberOfLines={1}>
                  {photoFilled ? 'Photo OK' : 'Ajoute une photo'}
                </Text>
                {photoFilled && <Ionicons name="checkmark-circle" size={12} color={Colors.primary} />}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.chip, durationFilled && styles.chipFilled]}
                onPress={() => onOpenDuration(place.id)}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={durationFilled ? 'time' : 'time-outline'}
                  size={14}
                  color={durationFilled ? Colors.terracotta700 : Colors.primary}
                />
                <Text style={[styles.chipText, durationFilled && styles.chipTextFilled]} numberOfLines={1}>
                  {durationFilled ? formatDurationLabel(edit.duration!) : 'Combien de temps ?'}
                </Text>
                {durationFilled && <Ionicons name="checkmark-circle" size={12} color={Colors.primary} />}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.chip, priceFilled && styles.chipFilled]}
                onPress={() => onOpenPrice(place.id)}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={priceFilled ? 'wallet' : 'wallet-outline'}
                  size={14}
                  color={priceFilled ? Colors.terracotta700 : Colors.primary}
                />
                <Text style={[styles.chipText, priceFilled && styles.chipTextFilled]} numberOfLines={1}>
                  {priceLabel ?? 'Combien ça coûte ?'}
                </Text>
                {priceFilled && <Ionicons name="checkmark-circle" size={12} color={Colors.primary} />}
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  </>
);

// ══════════════════════════════════════════════════════════════
// STEP 4 — Conseil créateur
// ══════════════════════════════════════════════════════════════

const Step4Tip: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
  <CreatorTipInput
    value={value}
    onChange={onChange}
    minChars={TIP_MIN_CHARS}
    maxChars={TIP_MAX_CHARS}
    autoFocus={false}
  />
);

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  errorText: { fontSize: 14, fontFamily: Fonts.body, color: Colors.textSecondary },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { alignItems: 'center', flex: 1 },
  headerEyebrow: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.textTertiary,
    marginBottom: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
  },
  headerSide: { width: 36 },

  // Progress
  progressRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 4,
  },
  progressSeg: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.borderSubtle,
  },
  progressSegActive: { backgroundColor: Colors.primary },

  // Scroll
  scroll: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 32,
  },

  // Section labels
  sectionEyebrow: {
    fontSize: 10,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: Colors.textTertiary,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 22,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  sectionHelp: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    lineHeight: 19,
    marginBottom: 16,
  },

  // STEP 1 — choice cards
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1.5,
    borderColor: Colors.borderSubtle,
    marginBottom: 10,
  },
  choiceCardActive: {
    backgroundColor: Colors.terracotta50,
    borderColor: Colors.primary,
  },
  choiceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.terracotta50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceTitle: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  choiceDesc: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
  },
  participantsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  participantChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  participantChipActive: {
    backgroundColor: Colors.terracotta50,
    borderColor: Colors.primary,
  },
  participantName: {
    fontSize: 12.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
  },
  participantNameActive: { color: Colors.primary },

  // STEP 2 — cover
  coverWrap: {
    height: 220,
    borderRadius: 16,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    overflow: 'hidden',
    position: 'relative',
  },
  coverImage: { width: '100%', height: '100%' },
  coverPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  coverPlaceholderText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
  },
  coverOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEditBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  coverEditText: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
  },

  // STEP 3 — place card (référence visuelle)
  placeCard: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  placeCardTop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  placeThumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: Colors.bgPrimary,
  },
  placeThumbImg: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeThumbPlaceholder: {
    backgroundColor: Colors.terracotta50,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
  },
  placeIndexBadge: {
    position: 'absolute',
    top: -6,
    left: -64,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeIndexText: {
    fontSize: 11,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textOnAccent,
  },
  placeName: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  placeAddr: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  gauge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 8,
  },
  gaugeDots: { flexDirection: 'row', gap: 4 },
  gaugeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.borderMedium,
  },
  gaugeDotOn: { backgroundColor: Colors.primary },
  gaugeText: {
    fontSize: 10.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    letterSpacing: 0.4,
  },
  chipsRow: { flexDirection: 'row', gap: 6 },
  chip: {
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
  chipFilled: {
    backgroundColor: Colors.terracotta100,
    borderColor: Colors.terracotta300,
  },
  chipText: {
    fontSize: 11.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
    flexShrink: 1,
  },
  chipTextFilled: { color: Colors.terracotta700 },

  // Footer
  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
    backgroundColor: Colors.bgPrimary,
    gap: 6,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 99,
    backgroundColor: Colors.primary,
  },
  primaryBtnDisabled: { backgroundColor: Colors.gray200 },
  primaryBtnText: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
  },
  primaryBtnTextDisabled: { color: Colors.textTertiary },
  gateHint: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  // Source-choice sheet
  sourceBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(44,36,32,0.5)',
    justifyContent: 'flex-end',
  },
  sourceCard: {
    backgroundColor: Colors.bgSecondary,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 30,
  },
  sourceHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderMedium,
    marginBottom: 18,
  },
  sourceTitle: {
    fontSize: 17,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  sourceHint: {
    fontSize: 12.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginBottom: 14,
  },
  sourceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  sourceOptionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceOptionTitle: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  sourceOptionDesc: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
  },
});
