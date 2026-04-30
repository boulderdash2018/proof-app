import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { useAuthStore } from '../store';
import { useCoPlanStore } from '../store/coPlanStore';
import { backfillConversationForDraft, shareDraftAsGroup, formatMeetupForTitle, getDisplayTitle } from '../services/planDraftService';
import { GroupMosaicAvatar, CoPlanPlacesSection, CoPlanLockSheet, CoPlanRouteSection, CoPlanSummaryFooter, CoPlanActivityToasts } from '../components';
import { CoPlanMeetupSheet } from '../components/CoPlanMeetupSheet';

/**
 * Collaborative workspace — "Organiser avec mes amis".
 *
 * This commit (#4) lands the screen shell : header with editable title,
 * participants mosaic + live presence, and the 4 section placeholders
 * (Où / Quand / Trajet / Verrouiller). Each section is a self-contained
 * block that the next commits will populate.
 */
export const CoPlanWorkspaceScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const user = useAuthStore((s) => s.user);

  const { draftId } = route.params as { draftId: string };

  const draft = useCoPlanStore((s) => s.draft);
  const observeDraft = useCoPlanStore((s) => s.observeDraft);
  const stopObserving = useCoPlanStore((s) => s.stopObserving);
  const rename = useCoPlanStore((s) => s.rename);
  const isPresent = useCoPlanStore((s) => s.isPresent);

  // Rename modal state
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  // Lock confirm sheet state
  const [lockOpen, setLockOpen] = useState(false);
  // Meetup date/time sheet state
  const [meetupSheetOpen, setMeetupSheetOpen] = useState(false);
  // "Créer le groupe" loading state — quand on partage le brouillon
  // initialement (avant qu'il ait une conversation associée).
  const [sharing, setSharing] = useState(false);

  // Observe the draft while mounted — also starts presence heartbeat.
  useEffect(() => {
    if (!user?.id || !draftId) return;
    observeDraft(draftId, user.id);
    return () => stopObserving();
  }, [draftId, user?.id, observeDraft, stopObserving]);

  // Lazy backfill — runs idempotently on every mount for the creator.
  // IMPORTANT (UX fix) : on n'auto-crée PLUS la conv pour un brouillon
  // sans conversationId. Le créateur doit explicitement cliquer "Créer
  // le groupe" pour partager — ça évite que toutes ses actions de la
  // phase de préparation finissent dans le chat. Le backfill ne sert
  // donc plus qu'à patcher `linkedDraftId` sur les convs existantes
  // pré-feature (drafts legacy qui ont déjà une conv).
  useEffect(() => {
    if (!draft || !user?.id) return;
    if (draft.createdBy !== user.id) return;
    if (!draft.conversationId && !draft.publishedConvId) return; // pas de conv → pas de backfill
    backfillConversationForDraft(draft.id).catch((err) => {
      console.warn('[CoPlanWorkspaceScreen] backfill failed:', err);
    });
  }, [draft, user?.id]);

  // Periodic re-render so "Présent · à l'instant" stays fresh even without data update.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 20_000);
    return () => clearInterval(id);
  }, []);

  const otherParticipants = useMemo(() => {
    if (!draft || !user?.id) return [];
    return draft.participants
      .filter((id) => id !== user.id)
      .map((id) => draft.participantDetails[id])
      .filter(Boolean);
  }, [draft, user?.id]);

  const presentCount = useMemo(() => {
    if (!draft) return 0;
    return draft.participants.filter((id) => id !== user?.id && isPresent(id)).length;
  }, [draft, user?.id, isPresent]);


  // Lock pre-conditions — only requires at least one place. The "QUAND"
  // section was removed (per UX direction : the chat is where dates
  // get coordinated, not a structured form).
  const placeCount = draft?.proposedPlaces.length ?? 0;
  const canLock = placeCount > 0;
  const lockMissingHint = !canLock
    ? 'Ajoute au moins un lieu pour activer.'
    : null;

  // ── Stage du brouillon ─────────────────────────────────────
  // - "solo" : pas encore de conv → CTA "Créer le groupe" (partage initial)
  // - "shared" : conv existe → CTA "Lancer le plan" (publier sur le feed)
  const hasGroup = !!(draft?.conversationId || draft?.publishedConvId);

  // Action : créer le groupe → crée la conv + post un snapshot + nav vers le chat.
  const handleCreateGroup = async () => {
    if (!draft || sharing) return;
    setSharing(true);
    try {
      const conversationId = await shareDraftAsGroup(draft.id);
      if (conversationId) {
        navigation.reset({
          index: 0,
          routes: [
            { name: 'Main' },
            { name: 'Conversation', params: { conversationId, otherUser: null } },
          ] as any,
        });
      }
    } finally {
      setSharing(false);
    }
  };

  if (!draft) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerCenter} />
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </View>
    );
  }

  const handleRename = () => {
    const clean = renameValue.trim();
    if (clean.length > 0 && clean !== draft.title) rename(clean);
    setRenameOpen(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ─────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.6}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.eyebrow}>ORGANISER ENSEMBLE</Text>
          <TouchableOpacity
            onPress={() => {
              setRenameValue(draft.title);
              setRenameOpen(true);
            }}
            activeOpacity={0.7}
            style={styles.headerTitleWrap}
          >
            <Text style={styles.headerTitle} numberOfLines={1}>
              {getDisplayTitle(draft.title, draft.meetupAtProposed)}
            </Text>
            <Ionicons name="create-outline" size={13} color={Colors.textTertiary} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </View>
        <View style={styles.headerBtn} />
      </View>

      {/* ── Participants strip ─────────────────── */}
      <View style={styles.participantsStrip}>
        <GroupMosaicAvatar
          participants={otherParticipants.map((p) => ({
            initials: p.initials,
            avatarBg: p.avatarBg,
            avatarColor: p.avatarColor,
            avatarUrl: p.avatarUrl,
          }))}
          size={32}
          borderColor={Colors.bgPrimary}
        />
        <Text style={styles.participantsLabel}>
          {draft.participants.length} participant{draft.participants.length > 1 ? 's' : ''}
        </Text>
        {presentCount > 0 && (
          <View style={styles.presenceChip}>
            <View style={styles.presenceDot} />
            <Text style={styles.presenceText}>
              {presentCount} en ligne
            </Text>
          </View>
        )}
      </View>

      {/* ── Body sections (placeholders — filled by commits 5 / 6 / 7) ─ */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <SectionBlock
          icon="location-outline"
          label="OÙ"
          title="Proposez des lieux"
          subtitle="Chacun propose, vous votez ensemble"
        >
          <CoPlanPlacesSection participants={draft.participantDetails} />
        </SectionBlock>
        <SectionBlock
          icon="calendar-outline"
          label="QUAND"
          title={draft.meetupAtProposed ? 'Date du plan' : 'Fixer la date'}
          subtitle={
            draft.createdBy === user?.id
              ? 'Choisis le jour et l\'heure exacts du rendez-vous'
              : 'Propose une date au groupe — sondage rapide dans le chat'
          }
        >
          <TouchableOpacity
            style={styles.meetupRow}
            onPress={() => setMeetupSheetOpen(true)}
            activeOpacity={0.7}
          >
            <View style={styles.meetupIconWrap}>
              <Ionicons
                name={draft.meetupAtProposed ? 'time' : 'time-outline'}
                size={18}
                color={draft.meetupAtProposed ? Colors.primary : Colors.textSecondary}
              />
            </View>
            <View style={{ flex: 1 }}>
              {draft.meetupAtProposed ? (
                <>
                  <Text style={styles.meetupValue}>
                    {formatMeetupForTitle(draft.meetupAtProposed)}
                  </Text>
                  <Text style={styles.meetupHint}>
                    Touche pour modifier
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.meetupPlaceholder}>
                    Aucune date pour l'instant
                  </Text>
                  <Text style={styles.meetupHint}>
                    {draft.createdBy === user?.id
                      ? 'Touche pour fixer la date'
                      : 'Touche pour proposer'}
                  </Text>
                </>
              )}
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.gray500} />
          </TouchableOpacity>
        </SectionBlock>
        <SectionBlock
          icon="walk-outline"
          label="TRAJET"
          title="Parcours optimisé"
          subtitle="Ordre le plus court calculé à partir de vos lieux"
        >
          <CoPlanRouteSection />
        </SectionBlock>
        {/* Summary pills — estimated duration + budget, above the lock section. */}
        <CoPlanSummaryFooter />

        {hasGroup ? (
          // ── Étape 2 : le groupe existe déjà → on peut publier le plan
          //    sur le feed (visibilité publique, devient un Plan officiel).
          <SectionBlock
            icon="rocket-outline"
            label="LANCER LE PLAN"
            title="Prêt à publier ?"
            subtitle="Le brouillon devient un plan officiel — visible dans la conv et utilisable en session live. Vous pouvez aussi le rendre public sur le feed."
            muted={!canLock}
          >
            <TouchableOpacity
              style={[styles.lockBtn, !canLock && styles.lockBtnDisabled]}
              onPress={() => canLock && setLockOpen(true)}
              activeOpacity={canLock ? 0.85 : 1}
              disabled={!canLock}
            >
              <Ionicons
                name="rocket"
                size={16}
                color={canLock ? Colors.textOnAccent : Colors.textTertiary}
              />
              <Text
                style={[
                  styles.lockBtnText,
                  !canLock && styles.lockBtnTextDisabled,
                ]}
              >
                Lancer le plan
              </Text>
            </TouchableOpacity>
            {lockMissingHint && (
              <Text style={styles.lockHint}>{lockMissingHint}</Text>
            )}
          </SectionBlock>
        ) : (
          // ── Étape 1 : brouillon solo → CTA "Créer le groupe".
          //    Crée la conv et y poste un snapshot du plan tel qu'il est
          //    maintenant (sans rejouer toutes les actions de préparation,
          //    qui sont du bruit pour les invités).
          <SectionBlock
            icon="people-outline"
            label="PARTAGER"
            title="Quand votre proposition est prête"
            subtitle="Le groupe sera créé avec votre plan tel qu'il est maintenant. Tout le monde pourra ensuite voter et modifier ensemble."
            muted={!canLock}
          >
            <TouchableOpacity
              style={[styles.lockBtn, (!canLock || sharing) && styles.lockBtnDisabled]}
              onPress={() => canLock && !sharing && handleCreateGroup()}
              activeOpacity={canLock && !sharing ? 0.85 : 1}
              disabled={!canLock || sharing}
            >
              {sharing ? (
                <ActivityIndicator size="small" color={Colors.textOnAccent} />
              ) : (
                <>
                  <Ionicons
                    name="people"
                    size={16}
                    color={canLock ? Colors.textOnAccent : Colors.textTertiary}
                  />
                  <Text
                    style={[
                      styles.lockBtnText,
                      !canLock && styles.lockBtnTextDisabled,
                    ]}
                  >
                    Créer le groupe
                  </Text>
                </>
              )}
            </TouchableOpacity>
            {lockMissingHint && (
              <Text style={styles.lockHint}>{lockMissingHint}</Text>
            )}
          </SectionBlock>
        )}

        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>

      {/* ── Live activity toasts ──────────────────
          Bottom of the workspace — surfaces "Léa a ajouté Café Pinson"
          while the workspace is open, so the doc feels alive even before
          anyone opens the chat. The lens switcher owns the navigation
          affordance now (in the header), so toasts can use the full
          bottom area without overlap. */}
      <CoPlanActivityToasts />

      {/* ── Meetup date/time sheet ────────────── */}
      <CoPlanMeetupSheet
        visible={meetupSheetOpen}
        onClose={() => setMeetupSheetOpen(false)}
      />

      {/* ── Lock confirm sheet ────────────────── */}
      <CoPlanLockSheet
        visible={lockOpen}
        onClose={() => setLockOpen(false)}
        onLocked={(conversationId) => {
          // Navigate to the freshly-created group conversation. The flow
          // "Do it now multi-user" + polls + album takes over from there.
          navigation.reset({
            index: 0,
            routes: [
              { name: 'Main' },
              { name: 'Conversation', params: { conversationId, otherUser: null } },
            ] as any,
          });
        }}
      />

      {/* ── Rename modal ─────────────────────── */}
      <Modal
        visible={renameOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setRenameOpen(false)}
      >
        <Pressable style={renameStyles.backdrop} onPress={() => setRenameOpen(false)}>
          <Pressable style={renameStyles.card} onPress={() => {}}>
            <Text style={renameStyles.title}>Renommer le brouillon</Text>
            <TextInput
              style={renameStyles.input}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Nom du brouillon"
              placeholderTextColor={Colors.textTertiary}
              maxLength={60}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleRename}
            />
            <View style={renameStyles.actionsRow}>
              <TouchableOpacity
                style={renameStyles.actionBtnCancel}
                onPress={() => setRenameOpen(false)}
                activeOpacity={0.7}
              >
                <Text style={[renameStyles.actionBtnText, { color: Colors.textSecondary }]}>
                  Annuler
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={renameStyles.actionBtnConfirm}
                onPress={handleRename}
                activeOpacity={0.85}
                disabled={renameValue.trim().length === 0}
              >
                <Text style={[renameStyles.actionBtnText, { color: Colors.textOnAccent }]}>
                  Enregistrer
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// SectionBlock — a placeholder section that the workspace screen
// uses for each of the 4 zones. Keeps the shell cohesive while
// content lands in follow-up commits.
// ══════════════════════════════════════════════════════════════

interface SectionBlockProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  title: string;
  subtitle: string;
  placeholder?: boolean;
  muted?: boolean;
  children?: React.ReactNode;
}

const SectionBlock: React.FC<SectionBlockProps> = ({
  icon, label, title, subtitle, placeholder, muted, children,
}) => {
  return (
    <View style={[sectionStyles.block, muted && sectionStyles.blockMuted]}>
      <View style={sectionStyles.headerRow}>
        <View style={[sectionStyles.iconBox, muted && sectionStyles.iconBoxMuted]}>
          <Ionicons name={icon} size={16} color={muted ? Colors.textTertiary : Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={sectionStyles.label}>{label}</Text>
          <Text style={sectionStyles.title}>{title}</Text>
        </View>
      </View>
      <Text style={sectionStyles.subtitle}>{subtitle}</Text>
      {children ? (
        <View style={{ marginTop: 10 }}>{children}</View>
      ) : placeholder ? (
        <View style={sectionStyles.placeholderBox}>
          <Text style={sectionStyles.placeholderText}>à venir dans un prochain commit</Text>
        </View>
      ) : null}
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },

  // Meetup row (QUAND section)
  meetupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.bgSecondary,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  meetupIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.terracotta50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meetupValue: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  meetupPlaceholder: {
    fontSize: 14,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  meetupHint: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSubtle,
    backgroundColor: Colors.bgSecondary,
  },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  eyebrow: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.primary,
    marginBottom: 2,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    letterSpacing: -0.2,
    color: Colors.textPrimary,
    maxWidth: 220,
  },

  // Participants strip
  participantsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.bgSecondary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSubtle,
  },
  participantsLabel: {
    fontSize: 12.5,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
    letterSpacing: 0.1,
  },
  presenceChip: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: 'rgba(123,153,113,0.12)',
  },
  presenceDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.success,
  },
  presenceText: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.success,
    letterSpacing: 0.2,
  },

  // Body
  scrollContent: { padding: 14 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Lock CTA in VERROUILLER section
  lockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  lockBtnText: {
    fontSize: 14.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
    letterSpacing: -0.1,
  },
  lockBtnDisabled: {
    backgroundColor: Colors.bgTertiary,
    shadowOpacity: 0,
    elevation: 0,
  },
  lockBtnTextDisabled: {
    color: Colors.textTertiary,
  },
  lockHint: {
    marginTop: 8,
    fontSize: 11.5,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});

const sectionStyles = StyleSheet.create({
  block: {
    backgroundColor: Colors.bgSecondary,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
    marginBottom: 12,
  },
  blockMuted: {
    opacity: 0.62,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.terracotta50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxMuted: {
    backgroundColor: Colors.bgTertiary,
  },
  label: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.textTertiary,
    marginBottom: 1,
  },
  title: {
    fontSize: 15,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 17,
    paddingLeft: 42,
  },
  placeholderBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.bgPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: Platform.OS === 'web' ? ('dashed' as any) : 'dashed',
    borderColor: Colors.borderSubtle,
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 11,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    color: Colors.textTertiary,
  },
});

// Rename modal styles
const renameStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(44,36,32,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.bgSecondary,
    borderRadius: 18,
    padding: 22,
  },
  title: {
    fontSize: 17,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 14,
  },
  input: {
    fontSize: 15,
    fontFamily: Fonts.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.bgTertiary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 18,
  },
  actionBtnCancel: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  actionBtnConfirm: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  actionBtnText: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
  },
});
