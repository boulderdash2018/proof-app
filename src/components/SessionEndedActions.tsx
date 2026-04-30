import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Fonts } from '../constants';
import { archiveConversationForUser } from '../services/chatService';

interface Props {
  conversationId: string;
  userId: string | undefined;
}

/**
 * Action card surfaced right after a `session_completed` system event
 * in the chat. Offers each user the choice to archive the conversation
 * (it disappears from their messages list) or keep it. Decision is
 * personal — other members keep their own preference.
 *
 * The card collapses locally once the user picks ; tracked in component
 * state, no Firestore round-trip for "Garder". Archive itself writes
 * to conv.archivedBy via chatService.archiveConversationForUser, which
 * makes subscribeConversations skip the conv on the next snapshot.
 *
 * After archive, we briefly show a confirmation line before the conv
 * dismounts naturally (the listener fires and the parent's chat list
 * removes this conversation).
 */
export const SessionEndedActions: React.FC<Props> = ({ conversationId, userId }) => {
  type Status = 'idle' | 'archiving' | 'archived' | 'kept';
  const [status, setStatus] = useState<Status>('idle');

  if (!userId) return null;
  if (status === 'kept') return null;

  const handleArchive = async () => {
    if (status !== 'idle') return;
    setStatus('archiving');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await archiveConversationForUser(conversationId, userId);
      setStatus('archived');
    } catch (err) {
      console.warn('[SessionEndedActions] archive failed:', err);
      setStatus('idle');
    }
  };

  const handleKeep = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setStatus('kept');
  };

  if (status === 'archived') {
    return (
      <View style={styles.confirmedWrap}>
        <Ionicons name="archive-outline" size={14} color={Colors.textTertiary} />
        <Text style={styles.confirmedText}>
          Conversation archivée — tu peux la retrouver dans tes archives
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Et maintenant ?</Text>
      <Text style={styles.subtitle}>
        Le parcours est fini. Tu peux ranger cette conversation ou la
        garder dans ta liste de messages — c{'’'}est ta décision, les
        autres font comme ils veulent de leur côté.
      </Text>
      <View style={styles.btnRow}>
        <TouchableOpacity
          style={[styles.btn, styles.btnGhost]}
          onPress={handleKeep}
          disabled={status !== 'idle'}
          activeOpacity={0.7}
        >
          <Ionicons name="bookmark-outline" size={14} color={Colors.textPrimary} />
          <Text style={styles.btnGhostText}>Garder</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, status !== 'idle' && { opacity: 0.6 }]}
          onPress={handleArchive}
          disabled={status !== 'idle'}
          activeOpacity={0.85}
        >
          {status === 'archiving' ? (
            <ActivityIndicator size="small" color={Colors.textOnAccent} />
          ) : (
            <>
              <Ionicons name="archive-outline" size={14} color={Colors.textOnAccent} />
              <Text style={styles.btnPrimaryText}>Archiver</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 14,
    marginVertical: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.bgSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  title: {
    fontSize: 14,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    lineHeight: 17,
    letterSpacing: -0.05,
    marginBottom: 12,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  btnGhost: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  btnGhostText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.05,
  },
  btnPrimary: {
    flex: 1.2,
    backgroundColor: Colors.primary,
  },
  btnPrimaryText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
    letterSpacing: -0.05,
  },

  // Post-archive confirmation
  confirmedWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 14,
    marginVertical: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.bgSecondary,
  },
  confirmedText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    color: Colors.textTertiary,
    letterSpacing: 0.05,
  },
});
