import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { useCoPlanStore } from '../store/coPlanStore';
import { formatSlotKeyShort } from '../services/planDraftService';

interface Props {
  visible: boolean;
  onClose: () => void;
  onLocked: (conversationId: string) => void;
}

/**
 * Lock confirmation — summarizes the draft then creates the real Plan +
 * group conversation via coPlanStore.lockDraft. Offers a "Publier sur
 * notre feed" checkbox : when checked, the locked Plan becomes visible
 * on each participant's feed (co-authored — feature landed in commit 11).
 */
export const CoPlanLockSheet: React.FC<Props> = ({ visible, onClose, onLocked }) => {
  const draft = useCoPlanStore((s) => s.draft);
  const places = useCoPlanStore((s) => s.getSortedPlaces());
  const best = useCoPlanStore((s) => s.getBestOverlapSlot());
  const lockDraft = useCoPlanStore((s) => s.lockDraft);

  const [publishOnFeed, setPublishOnFeed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!draft) return null;

  const canLock = places.length >= 1; // at least 1 place required
  const participantCount = draft.participants.length;
  const totalParticipants = participantCount;
  const meetupLabel = best && best.count > 0 ? formatSlotKeyShort(best.key) : 'à préciser';
  const meetupFullCount = best?.count === totalParticipants;

  const handleSubmit = async () => {
    if (!canLock || submitting) return;
    setSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      const result = await lockDraft(publishOnFeed);
      if (result?.conversationId) {
        onClose();
        // Slight defer so the close anim doesn't compete with the nav.
        setTimeout(() => onLocked(result.conversationId), 180);
      }
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
              <Ionicons name="lock-closed" size={18} color={Colors.primary} />
            </View>
            <View>
              <Text style={styles.eyebrow}>VERROUILLER LE PLAN</Text>
              <Text style={styles.title}>Prêts à figer ensemble ?</Text>
            </View>
          </View>

          {/* Recap rows */}
          <View style={styles.recap}>
            <RecapRow icon="calendar-outline" label="Quand" value={meetupLabel}
              hint={best ? `${best.count}/${totalParticipants} dispos` : undefined}
              highlight={meetupFullCount}
            />
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
                  <Ionicons name="lock-closed" size={14} color={Colors.textOnAccent} />
                  <Text style={styles.btnConfirmText}>Verrouiller</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {!canLock && (
            <Text style={styles.missingHint}>
              Ajoute au moins 1 lieu avant de verrouiller.
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
