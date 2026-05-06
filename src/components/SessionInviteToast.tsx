import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Fonts } from '../constants';
import { useAuthStore } from '../store';
import { useChatStore } from '../store/chatStore';
import { GroupMosaicAvatar } from './GroupMosaicAvatar';

/**
 * Cross-screen toast shown when a new multi-user session starts in one of my
 * groups AND I'm not currently viewing that conversation.
 *
 * Auto-dismisses after 10s. Tap = open the conversation.
 *
 * "Live-only" semantics : ce toast doit notifier UN événement temps réel,
 * pas restituer un état déjà connu. Deux garde-fous coopèrent :
 *
 *   1. Initial-load snapshot — la première fois que conversations
 *      arrive non-vide (= chargement initial depuis Firestore au démarrage),
 *      on enregistre TOUTES les sessions actives existantes comme déjà
 *      "vues". Conséquence : aucune rafale de toasts à l'ouverture pour
 *      les sessions qui tournaient déjà — l'utilisateur les retrouve
 *      naturellement dans sa chat list.
 *
 *   2. Freshness gate — pour toute session non-vue détectée APRÈS le
 *      chargement initial, on vérifie que `lastMessageAt` est < 60s. Au-
 *      delà, on marque comme vu sans toaster. Couvre les cas tordus :
 *      re-subscription Firestore après reconnexion réseau, retour de
 *      cache, etc.
 *
 * Effet net : le toast n'apparaît que quand un participant démarre une
 * session ALORS QUE l'app est ouverte. Exactement le comportement attendu
 * pour une notification "intra-app".
 */
const TOAST_DURATION_MS = 10_000;
const FRESHNESS_WINDOW_MS = 60_000;

interface ToastState {
  conversationId: string;
  sessionId: string;
  groupName: string;
  starterName: string;
  otherParticipants: Array<{ initials: string; avatarBg: string; avatarColor: string; avatarUrl: string | null }>;
}

export const SessionInviteToast: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const conversations = useChatStore((s) => s.conversations);
  const activeConversationId = useChatStore((s) => s.activeConversationId);

  // Tracks which {convId: sessionId} pairs we've already shown, so we don't re-toast
  // the same session when conversations list re-renders.
  const seenRef = useRef<Record<string, string>>({});
  // True une fois qu'on a fait le snapshot des sessions actives existantes
  // au chargement initial. Tant qu'il est false, on ne toaste rien — on
  // se contente de remplir seenRef. Cf. doc en haut de fichier.
  const initialSnapshotDoneRef = useRef(false);

  const [toast, setToast] = useState<ToastState | null>(null);
  const translateY = useRef(new Animated.Value(-120)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Detect new active sessions in my groups ──
  useEffect(() => {
    if (!user?.id) return;

    // Snapshot du chargement initial : la première fois que conversations
    // arrive non-vide, on marque toutes les sessions actives existantes
    // comme "vues" SANS toaster. C'est ce qui résout la rafale à
    // l'ouverture — sans ce garde-fou, chaque session déjà en cours
    // déclenchait un toast au démarrage de l'app.
    if (!initialSnapshotDoneRef.current && conversations.length > 0) {
      for (const conv of conversations) {
        if (conv.isGroup && conv.activeSessionId) {
          seenRef.current[conv.id] = conv.activeSessionId;
        }
      }
      initialSnapshotDoneRef.current = true;
      return;
    }

    for (const conv of conversations) {
      if (!conv.isGroup) continue;
      if (!conv.activeSessionId) continue;
      if (conv.id === activeConversationId) continue; // already viewing — no need

      const prevSessionId = seenRef.current[conv.id];
      if (prevSessionId === conv.activeSessionId) continue; // already handled

      // Only toast if I didn't start it myself.
      const starterMsg = conv.lastMessageSenderId;
      if (starterMsg === user.id) {
        seenRef.current[conv.id] = conv.activeSessionId;
        continue;
      }

      // Freshness gate : ne toaste que si l'événement est récent (<60s).
      // Couvre les re-subscriptions Firestore, retours de cache, etc.,
      // qui pourraient sinon faire revivre une session qui tourne déjà
      // depuis un moment. On marque comme vu pour éviter une re-éval.
      const lastMsgTs = Date.parse(conv.lastMessageAt || '');
      const ageMs = Date.now() - lastMsgTs;
      if (Number.isNaN(lastMsgTs) || ageMs > FRESHNESS_WINDOW_MS) {
        seenRef.current[conv.id] = conv.activeSessionId;
        continue;
      }

      // Build toast state and show.
      const starter = conv.participantDetails[starterMsg];
      const otherParticipants = conv.participants
        .filter((id) => id !== user.id)
        .map((id) => conv.participantDetails[id])
        .filter(Boolean)
        .map((p) => ({
          initials: p.initials,
          avatarBg: p.avatarBg,
          avatarColor: p.avatarColor,
          avatarUrl: p.avatarUrl,
        }));

      setToast({
        conversationId: conv.id,
        sessionId: conv.activeSessionId,
        groupName: conv.groupName || conv.linkedPlanTitle || 'Groupe',
        starterName: starter?.displayName?.split(' ')[0] || 'Quelqu\u2019un',
        otherParticipants,
      });
      seenRef.current[conv.id] = conv.activeSessionId;
      break; // Only one toast at a time.
    }
  }, [conversations, activeConversationId, user?.id]);

  // ── Slide in / slide out ──
  useEffect(() => {
    if (!toast) return;
    Animated.spring(translateY, {
      toValue: 0,
      friction: 7,
      tension: 60,
      useNativeDriver: true,
    }).start();

    timerRef.current = setTimeout(() => {
      dismiss();
    }, TOAST_DURATION_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast?.sessionId]);

  const dismiss = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    Animated.timing(translateY, {
      toValue: -120,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setToast(null);
    });
  };

  const openConversation = () => {
    if (!toast) return;
    const conv = conversations.find((c) => c.id === toast.conversationId);
    if (!conv) {
      dismiss();
      return;
    }
    dismiss();
    navigation.navigate('Conversation', {
      conversationId: conv.id,
      otherUser: null,
    });
  };

  if (!toast) return null;

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          top: insets.top + 10,
          transform: [{ translateY }],
        },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity style={styles.card} activeOpacity={0.92} onPress={openConversation}>
        <GroupMosaicAvatar
          participants={toast.otherParticipants}
          size={38}
          borderColor={Colors.bgSecondary}
        />
        <View style={styles.txt}>
          <Text style={styles.title} numberOfLines={1}>
            {toast.starterName} a démarré {toast.groupName}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            Ouvrir le groupe pour rejoindre
          </Text>
        </View>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>Rejoindre</Text>
          <Ionicons name="arrow-forward" size={14} color={Colors.textOnAccent} />
        </View>
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.closeBtn}
        >
          <Ionicons name="close" size={15} color={Colors.textTertiary} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 999,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 10,
    borderRadius: 16,
    backgroundColor: Colors.bgSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
    shadowColor: 'rgba(44,36,32,1)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 6,
    // On web the box-shadow alone is fine; let RN compute the rest.
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as any } : null),
  },
  txt: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 13.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  sub: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  ctaText: {
    color: Colors.textOnAccent,
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
  },
  closeBtn: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
});
