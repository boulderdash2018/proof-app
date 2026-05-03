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
import { fetchPlanById, publishCoPlan } from '../services/plansService';
import { fetchPlanDraft } from '../services/planDraftService';
import { pickImage } from '../utils/pickImage';
import { CreatorTipInput } from '../components/publish/CreatorTipInput';
import { Avatar, GroupAlbumSheet } from '../components';
import { useAuthStore } from '../store/authStore';
import { Plan, PlanDraft, CoAuthor } from '../types';

/**
 * CoPlanPublishScreen — page de publication post-exécution d'un co-plan.
 *
 * Reçoit `planId` (route param) → fetch le Plan privé créé au lock du
 * brouillon, ainsi que le draft source pour récupérer la liste des
 * participants. L'utilisateur enrichit la publication :
 *   • Photo de couverture (pellicule pour l'instant — l'album du groupe
 *     sera ajouté au commit suivant via GroupAlbumSheet en mode picker)
 *   • Titre (pré-rempli depuis le brouillon, modifiable)
 *   • Tags des participants (avatars cochables, pré-cochés par défaut)
 *   • Conseil créateur (CreatorTipInput partagé avec CreateScreen)
 *
 * À la confirmation : `publishCoPlan(planId, payload)` qui set
 * `visibility:'public'` + tous les autres champs en un seul updateDoc.
 * Le plan apparaît sur le feed dès la prochaine fetch.
 */
export const CoPlanPublishScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const planId = route.params?.planId as string;
  const me = useAuthStore((s) => s.user);

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

  // ── Form state — initialisé depuis le plan/draft une fois chargés ──
  const [title, setTitle] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [tip, setTip] = useState('');
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<Set<string>>(new Set());
  const [uploadingCover, setUploadingCover] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // "Choisir la source" sheet (pellicule vs album du groupe)
  const [coverSourceSheetOpen, setCoverSourceSheetOpen] = useState(false);
  const [albumPickerOpen, setAlbumPickerOpen] = useState(false);

  useEffect(() => {
    if (plan && title === '') setTitle(plan.title || '');
    if (plan && plan.coverPhotos?.[0] && !coverUrl) setCoverUrl(plan.coverPhotos[0]);
    if (plan && typeof plan.authorTip === 'string' && tip === '') setTip(plan.authorTip);
    // Pré-coche tous les participants (sauf moi) par défaut.
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

  const toggleParticipant = (userId: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedParticipantIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  // ── Cover photo picker — deux sources possibles ──
  // 1. Pellicule (caméra ou bibliothèque locale via pickImage)
  // 2. Album du groupe (photos déjà uploadées dans la conversation
  //    pendant l'exécution du plan, via GroupAlbumSheet en mode picker)
  //
  // Le bouton "Changer" ouvre d'abord un petit choisir-la-source si la
  // conversation est connue (= source draft existe). Sinon fallback
  // direct sur pellicule.
  const conversationId = draft?.conversationId || draft?.publishedConvId;

  const openCoverPicker = () => {
    if (conversationId) {
      setCoverSourceSheetOpen(true);
    } else {
      handlePickFromLibrary();
    }
  };

  const handlePickFromLibrary = async () => {
    setCoverSourceSheetOpen(false);
    const picked = await pickImage({ quality: 0.7 });
    if (!picked) return;
    setUploadingCover(true);
    try {
      const filename = `plans/${planId}_${Date.now()}.jpg`;
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

  const handlePickFromAlbum = () => {
    setCoverSourceSheetOpen(false);
    setAlbumPickerOpen(true);
  };

  const handleAlbumSelected = (urls: string[]) => {
    setAlbumPickerOpen(false);
    if (urls.length > 0) {
      setCoverUrl(urls[0]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  };

  // ── Validation gates ──
  const canPublish =
    !loading &&
    !submitting &&
    title.trim().length >= 3 &&
    !!coverUrl;

  // ── Publish handler ──
  const handlePublish = async () => {
    if (!canPublish || !plan || !draft) return;
    setSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      const coAuthors: CoAuthor[] = otherParticipants
        .filter((p) => selectedParticipantIds.has(p.userId))
        .map((p) => ({
          id: p.userId,
          username: p.username,
          displayName: p.displayName,
          initials: p.initials,
          avatarUrl: p.avatarUrl,
          avatarBg: p.avatarBg,
          avatarColor: p.avatarColor,
        }));

      await publishCoPlan(planId, {
        title: title.trim(),
        coverPhotos: coverUrl ? [coverUrl] : undefined,
        authorTip: tip.trim() || undefined,
        coAuthors,
      });

      // Retour direct au feed — le plan apparaît au prochain fetch.
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }] as any,
      });
    } catch (err) {
      console.warn('[CoPlanPublishScreen] publish error:', err);
      Alert.alert('Oups', "La publication a échoué. Réessaye.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Publier le plan</Text>
          <View style={styles.headerSide} />
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (!plan) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Publier le plan</Text>
          <View style={styles.headerSide} />
        </View>
        <View style={styles.errorWrap}>
          <Ionicons name="alert-circle-outline" size={36} color={Colors.textTertiary} />
          <Text style={styles.errorText}>Plan introuvable.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Publier le plan</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Photo de couverture ── */}
        <Text style={styles.sectionEyebrow}>PHOTO DE COUVERTURE</Text>
        <Text style={styles.sectionHelp}>
          La photo qui résume le plan. Choisis-en une qui donne envie.
        </Text>
        <TouchableOpacity
          style={styles.coverWrap}
          onPress={openCoverPicker}
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

        {/* ── 2. Titre ── */}
        <Text style={[styles.sectionEyebrow, { marginTop: 22 }]}>TITRE</Text>
        <View style={styles.titleInputWrap}>
          <RNTextInput
            style={styles.titleInput}
            value={title}
            onChangeText={(t) => setTitle(t.slice(0, 80))}
            placeholder="Titre du plan"
            placeholderTextColor={Colors.textTertiary}
            maxLength={80}
            returnKeyType="done"
          />
          <Text style={styles.titleCount}>{title.length}/80</Text>
        </View>

        {/* ── 3. Tags participants ── */}
        {otherParticipants.length > 0 && (
          <>
            <Text style={[styles.sectionEyebrow, { marginTop: 22 }]}>
              AVEC
            </Text>
            <Text style={styles.sectionHelp}>
              Sélectionne les participants à co-signer. Le plan apparaîtra
              chez chacun d'eux avec ton nom.
            </Text>
            <View style={styles.participantsRow}>
              {otherParticipants.map((p) => {
                const isSelected = selectedParticipantIds.has(p.userId);
                return (
                  <TouchableOpacity
                    key={p.userId}
                    style={[
                      styles.participantChip,
                      isSelected && styles.participantChipActive,
                    ]}
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
                      style={[
                        styles.participantName,
                        isSelected && styles.participantNameActive,
                      ]}
                      numberOfLines={1}
                    >
                      {p.displayName.split(' ')[0]}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={14} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* ── 4. Creator tip (composant partagé) ── */}
        <View style={{ marginTop: 26 }}>
          <CreatorTipInput
            value={tip}
            onChange={setTip}
            minChars={10}
            maxChars={180}
            autoFocus={false}
          />
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* ── Footer : bouton Publier ── */}
      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + 14 },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.publishBtn,
            !canPublish && styles.publishBtnDisabled,
          ]}
          onPress={handlePublish}
          disabled={!canPublish}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.textOnAccent} />
          ) : (
            <>
              <Ionicons
                name="paper-plane"
                size={15}
                color={canPublish ? Colors.textOnAccent : Colors.textTertiary}
              />
              <Text
                style={[
                  styles.publishBtnText,
                  !canPublish && styles.publishBtnTextDisabled,
                ]}
              >
                Publier sur le feed
              </Text>
            </>
          )}
        </TouchableOpacity>
        {!canPublish && !submitting && (
          <Text style={styles.gateHint}>
            {!coverUrl
              ? 'Ajoute une photo de couverture pour publier.'
              : title.trim().length < 3
                ? 'Le titre doit faire au moins 3 caractères.'
                : ''}
          </Text>
        )}
      </View>

      {/* ── Source-choice sheet : pellicule vs album du groupe ── */}
      <Modal
        visible={coverSourceSheetOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setCoverSourceSheetOpen(false)}
      >
        <Pressable
          style={styles.sourceBackdrop}
          onPress={() => setCoverSourceSheetOpen(false)}
        >
          <Pressable style={styles.sourceCard} onPress={() => {}}>
            <View style={styles.sourceHandle} />
            <Text style={styles.sourceTitle}>Choisir une photo</Text>
            <Text style={styles.sourceHint}>
              D'où veux-tu prendre la photo de couverture ?
            </Text>
            <TouchableOpacity
              style={styles.sourceOption}
              onPress={handlePickFromAlbum}
              activeOpacity={0.7}
            >
              <View style={[styles.sourceOptionIcon, { backgroundColor: Colors.terracotta50 }]}>
                <Ionicons name="people" size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sourceOptionTitle}>Album du groupe</Text>
                <Text style={styles.sourceOptionDesc}>
                  Photos partagées dans la conversation
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.gray500} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sourceOption}
              onPress={handlePickFromLibrary}
              activeOpacity={0.7}
            >
              <View style={[styles.sourceOptionIcon, { backgroundColor: Colors.terracotta50 }]}>
                <Ionicons name="image" size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sourceOptionTitle}>Pellicule</Text>
                <Text style={styles.sourceOptionDesc}>
                  Photo prise par toi sur ton téléphone
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.gray500} />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Album picker (mode multi-select extension de GroupAlbumSheet) ── */}
      {conversationId && (
        <GroupAlbumSheet
          visible={albumPickerOpen}
          onClose={() => setAlbumPickerOpen(false)}
          conversationId={conversationId}
          selectionMode={{
            max: 1,
            initialSelected: coverUrl ? [coverUrl] : [],
            onSelected: handleAlbumSelected,
          }}
        />
      )}
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  errorText: {
    fontSize: 14,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSubtle,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
  },
  headerSide: { width: 36 },

  // Scroll
  scroll: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 32,
  },

  // Section
  sectionEyebrow: {
    fontSize: 10,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: Colors.textTertiary,
    marginBottom: 6,
  },
  sectionHelp: {
    fontSize: 12.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },

  // Cover
  coverWrap: {
    height: 200,
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

  // Title input
  titleInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  titleInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.body,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  titleCount: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
  },

  // Participants
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
  participantNameActive: {
    color: Colors.primary,
  },

  // Footer
  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
    backgroundColor: Colors.bgPrimary,
    gap: 6,
  },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 99,
    backgroundColor: Colors.primary,
  },
  publishBtnDisabled: {
    backgroundColor: Colors.gray200,
  },
  publishBtnText: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
  },
  publishBtnTextDisabled: {
    color: Colors.textTertiary,
  },
  gateHint: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  // Source-choice sheet (cover photo)
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
