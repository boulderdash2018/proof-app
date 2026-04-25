import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Colors, Fonts } from '../constants';
import { Avatar } from './Avatar';
import { ChatMessage, ConversationParticipant } from '../services/chatService';

interface Props {
  message: ChatMessage;
  participants?: Record<string, ConversationParticipant>;
}

/**
 * Compact one-line event used for low-information system events in a
 * co-plan conversation : avatar dot + bold actor name + colored action
 * verb + right-aligned timestamp.
 *
 * Replaces the centered gray italic line for events that don't deserve
 * a full card. Examples :
 *   • "● baptisteqh a créé le brouillon         23:03"
 *   • "● Léo a mis à jour ses dispos           01:32"
 *   • "● Sarah a rejoint le groupe             14:08"
 *
 * The structure mirrors the CoPlanPlacesCard header so groups of events
 * read as a coherent visual rhythm down the chat.
 */
export const CoPlanCompactEvent: React.FC<Props> = ({ message, participants }) => {
  const ev = message.systemEvent;
  if (!ev) return null;

  const actorId = ev.actorId || message.senderId;
  const actor = participants?.[actorId];
  const actorName = actor?.displayName?.split(' ')[0] || 'Quelqu\'un';
  const verb = formatActionVerb(ev.kind, ev.payload);

  return (
    <View style={styles.row}>
      {actor ? (
        <Avatar
          initials={actor.initials}
          bg={actor.avatarBg}
          color={actor.avatarColor}
          size="XS"
          avatarUrl={actor.avatarUrl ?? undefined}
        />
      ) : (
        <View style={styles.actorDotFallback} />
      )}

      <Text style={styles.text} numberOfLines={1}>
        <Text style={styles.actor}>{actorName}</Text>
        <Text style={styles.verb}> {verb}</Text>
      </Text>

      <Text style={styles.timestamp}>{formatHHMM(message.createdAt)}</Text>
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════

function formatActionVerb(kind?: string, payload?: string): string {
  switch (kind) {
    case 'group_created':
      return 'a créé le brouillon';
    case 'joined':
      return 'a rejoint le groupe';
    case 'left':
      return 'a quitté le groupe';
    case 'renamed':
      return `a renommé en « ${payload || ''} »`;
    case 'session_started':
      return 'a démarré la session';
    case 'session_completed':
      return 'a terminé la session';
    case 'coplan_availability_set':
      return 'a mis à jour ses dispos';
    case 'coplan_place_voted':
      return `a voté pour ${payload || 'un lieu'}`;
    case 'coplan_place_removed':
      return `a retiré ${payload || 'un lieu'}`;
    case 'coplan_locked':
      return `a lancé le plan${payload ? ` : ${payload}` : ''}`;
    default:
      return '';
  }
}

function formatHHMM(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginVertical: 2,
  },
  actorDotFallback: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  text: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    letterSpacing: -0.05,
  },
  actor: {
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },
  verb: {
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
  },
  timestamp: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    letterSpacing: 0.1,
  },
});
