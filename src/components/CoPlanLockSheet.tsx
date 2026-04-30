import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { useCoPlanStore } from '../store/coPlanStore';
import { useAuthStore } from '../store/authStore';
import { useDoItNowStore } from '../store/doItNowStore';
import { createGroupSession } from '../services/planSessionService';
import { ConversationParticipant } from '../services/chatService';

/** Result returned to the parent after a successful lock — the parent
 *  uses this to navigate to the right destination. */
export interface LockResult {
  conversationId: string;
  planId: string | null;
  /** ISO meetup date if any — used by the parent to route to WaitingRoom
   *  when in the future (>15min away). */
  meetupAt: string | null;
  /** Set when the session was created right away (meetup is now / past /
   *  missing). When null, the parent must route through the WaitingRoom
   *  if there's a future meetupAt, or to the chat otherwise. */
  sessionId: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onLocked: (result: LockResult) => void;
}

/**
 * Lock confirmation — summarizes the draft then creates the real Plan +
 * group conversation via coPlanStore.lockDraft.
 *
 * Behavior :
 *   • Always locks the draft on confirm.
 *   • If the meetup date is in the future (>15min away), the session is
 *     NOT created here — the parent will route to WaitingRoom which
 *     shows the countdown + dev override. This prevents users from
 *     accidentally bypassing the wait time.
 *   • If the meetup is now/past or missing, the session is created
 *     immediately so the parent can route straight to DoItNow.
 *
 * The "Publier sur notre feed" toggle remains, but the previous
 * "Démarrer maintenant" toggle was removed : it muddied the contract
 * (it allowed bypassing the WaitingRoom which made the gate useless).
 * Now the WaitingRoom is the SINGLE override surface — its dev button
 * is the only way to start a future-dated plan early.
 */
export const CoPlanLockSheet: React.FC<Props> = ({ visible, onClose, onLocked }) => {
  const draft = useCoPlanStore((s) => s.draft);
  const places = useCoPlanStore((s) => s.getSortedPlaces());
  const lockDraft = useCoPlanStore((s) => s.lockDraft);
  const user = useAuthStore((s) => s.user);

  const [publishOnFeed, setPublishOnFeed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!draft) return null;

  const canLock = places.length >= 1; // at least 1 place required
  const participantCount = draft.participants.length;

  const handleSubmit = async () => {
    if (!canLock || submitting) return;
    setSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      const result = await lockDraft(publishOnFeed);
      if (!result?.conversationId) return;

      // ── Gate on meetupAt — décide où l'utilisateur atterrit ──
      // Lecture du meetupAt depuis le plan freshly-locked. Si > now+15min
      // dans le futur, on N'OUVRE PAS la session ici : le parent route
      // vers la WaitingRoom qui montre le countdown + le bouton dev
      // override. Le seuil 15min absorbe les décalages d'horloge sans
      // bloquer un démarrage légitime à l'heure pile.
      const meetupAtISO = result.plan?.meetupAt ?? null;
      const meetupMs = meetupAtISO ? new Date(meetupAtISO).getTime() : NaN;
      const isFutureMeetup = Number.isFinite(meetupMs) && (meetupMs - Date.now()) > 15 * 60 * 1000;

      let sessionId: string | null = null;
      if (!isFutureMeetup && result.plan && user) {
        // Meetup is now / past / not set → on lance directement.
        // Pré-populate le DoItNowStore pour éviter le edge case
        // hooks-order de l'écran DoItNow (early `if (!session) return`).
        // Échec non fatal : on retombe sur "chat" si la création crash.
        try {
          const creator: ConversationParticipant = {
            userId: user.id,
            displayName: user.displayName,
            username: user.username,
            avatarUrl: user.avatarUrl || null,
            avatarBg: user.avatarBg,
            avatarColor: user.avatarColor,
            initials: user.initials,
          };
          sessionId = await createGroupSession({
            plan: {
              id: result.plan.id,
              title: result.plan.title,
              coverPhoto: result.plan.coverPhotos?.[0] ?? null,
              placeIds: result.plan.places.map((p: { id: string }) => p.id),
            },
            conversationId: result.conversationId,
            creator,
          });
          useDoItNowStore.getState().startSession(result.plan, 'walking', user.id);
        } catch (err) {
          console.warn('[CoPlanLockSheet] session creation failed — falling back to chat:', err);
          sessionId = null;
        }
      }

      onClose();
      // Slight defer so the close anim doesn't compete with the nav.
      setTimeout(() => onLocked({
        conversationId: result.conversationId,
        planId: result.planId,
        meetupAt: meetupAtISO,
        sessionId,
      }), 180);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            <View style={styles.lockIcon}>
              <Ionicons name="rocket" size={18} color={Colors.primary} />
            </View>
            <View>
              <Text style={styles.eyebrow}>LANCER LE PLAN</Text>
              <Text style={styles.title}>Le groupe est OK ?</Text>
            </View>
          </View>

          {/* Recap rows — date is coordinated in the chat, not here. */}
          <View style={styles.recap}>
            <RecapRow icon="location-outline" label="Où" value={`${places.length} lieu${places.length > 1 ? 'x' : ''}`} />
            <RecapRow icon="people-outline" label="Amis" value={`${participantCount} participant${participantCount > 1 ? 's' : ''}`} />
          </View>

          {/* Publish toggle */}
          <TouchableOpacity
            style={styles.publishRow}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setPublishOnFeed((v) => !v);
            }}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.checkbox,
                publishOnFeed
                  ? { backgroundColor: Colors.primary, borderColor: Colors.primary }
                  : { borderColor: Colors.gray400 },
              ]}
            >
              {publishOnFeed && <Ionicons name="checkmark" size={14} color={Colors.textOnAccent} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.publishTitle}>Publier sur notre feed</Text>
              <Text style={styles.publishHint}>
                Le plan apparaîtra chez chacun des {participantCount} participants, co-signé.
              </Text>
            </View>
          </TouchableOpacity>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.btnCancel}
              onPress={onClose}
              activeOpacity={0.7}
              disabled={submitting}
            >
              <Text style={styles.btnCancelText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.btnConfirm,
                { opacity: canLock && !submitting ? 1 : 0.5 },
              ]}
              onPress={handleSubmit}
              disabled={!canLock || submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={Colors.textOnAccent} />
              ) : (
                <>
                  <Ionicons name="rocket" size={14} color={Colors.textOnAccent} />
                  <Text style={styles.btnConfirmText}>Lancer le plan</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {!canLock && (
            <Text style={styles.missingHint}>
              Ajoute au moins 1 lieu avant de lancer le plan.
            </Text>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════════════
// Recap row sub-component
// ══════════════════════════════════════════════════════════════

interface RecapRowProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}

const RecapRow: React.FC<RecapRowProps> = ({ icon, label, value, hint, highlight }) => (
  <View style={styles.recapRow}>
    <Ionicons name={icon} size={14} color={highlight ? Colors.primary : Colors.textSecondary} />
    <Text style={styles.recapLabel}>{label}</Text>
    <Text style={[styles.recapValue, highlight && { color: Colors.primary }]}>{value}</Text>
    {hint && <Text style={styles.recapHint}>{hint}</Text>}
  </View>
);

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(44,36,32,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: Colors.bgSecondary,
    borderRadius: 18,
    padding: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  lockIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.terracotta50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.primary,
    marginBottom: 2,
  },
  title: {
    fontSize: 17,
    fontFamily: Fonts.displaySemiBold,
    letterSpacing: -0.2,
    color: Colors.textPrimary,
  },

  // Recap
  recap: {
    backgroundColor: Colors.bgPrimary,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
    gap: 8,
    marginBottom: 14,
  },
  recapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recapLabel: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textTertiary,
    width: 50,
  },
  recapValue: {
    fontSize: 13.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    flex: 1,
  },
  recapHint: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
  },

  // Publish toggle
  publishRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.bgPrimary,
    marginBottom: 14,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  publishTitle: {
    fontSize: 13.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  publishHint: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },

  // Actions
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  btnCancel: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancelText: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
  },
  btnConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  btnConfirmText: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
  },
  missingHint: {
    fontSize: 11,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    color: Colors.error,
    textAlign: 'center',
    marginTop: 10,
  },
});
