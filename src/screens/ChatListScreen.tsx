import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Animated,
  Easing,
  Modal,
  Pressable,
  Alert,
  Platform,
  StatusBar,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar, EmptyState } from '../components';
import { useAuthStore } from '../store';
import { useChatStore } from '../store/chatStore';
import { Conversation } from '../services/chatService';

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

const formatTimeAgo = (dateStr: string): string => {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  if (diff < 60_000) return 'à l\u2019instant';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} j`;
  const weeks = Math.floor(days / 7);
  return `${weeks} sem`;
};

const truncate = (s: string, n: number): string =>
  s.length > n ? s.slice(0, n) + '\u2026' : s;

type FilterKey = 'all' | 'unread';

type RowKind = 'header' | 'conv';
interface SectionHeaderItem {
  kind: 'header';
  id: string;
  label: string;
}
interface ConvRowItem {
  kind: 'conv';
  id: string;
  conv: Conversation;
}
type ListItem = SectionHeaderItem | ConvRowItem;

// ──────────────────────────────────────────────────────────────
// Typing dots — shared little animated dots component
// ──────────────────────────────────────────────────────────────

const TypingDots: React.FC<{ color: string }> = ({ color }) => {
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;
  const a3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const make = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 400, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.delay(400 - delay),
        ]),
      );
    const anim = Animated.parallel([make(a1, 0), make(a2, 150), make(a3, 300)]);
    anim.start();
    return () => anim.stop();
  }, [a1, a2, a3]);

  const dotStyle = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
    transform: [
      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
    ],
  });

  return (
    <View style={dotsStyles.row}>
      <Animated.View style={[dotsStyles.dot, { backgroundColor: color }, dotStyle(a1)]} />
      <Animated.View style={[dotsStyles.dot, { backgroundColor: color }, dotStyle(a2)]} />
      <Animated.View style={[dotsStyles.dot, { backgroundColor: color }, dotStyle(a3)]} />
    </View>
  );
};

const dotsStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginLeft: 4, gap: 2 },
  dot: { width: 3, height: 3, borderRadius: 1.5 },
});

// ──────────────────────────────────────────────────────────────
// Mosaic avatar — stacks 2 participants' avatars (for groups)
// ──────────────────────────────────────────────────────────────

interface MosaicAvatarProps {
  participants: Array<{ initials: string; avatarBg: string; avatarColor: string; avatarUrl: string | null }>;
  size?: number;
}

const GroupMosaicAvatar: React.FC<MosaicAvatarProps> = ({ participants, size = 50 }) => {
  // Show first 2 non-self participants. If only 1, render single avatar centered.
  const shown = participants.slice(0, 2);
  const subSize = Math.round(size * 0.68);

  if (shown.length === 0) {
    return (
      <View style={[mosaicStyles.frame, { width: size, height: size, borderRadius: size / 2, backgroundColor: Colors.bgTertiary }]}>
        <Ionicons name="people" size={20} color={Colors.textTertiary} />
      </View>
    );
  }

  if (shown.length === 1) {
    const p = shown[0];
    return (
      <View style={[mosaicStyles.frame, { width: size, height: size, borderRadius: size / 2, backgroundColor: p.avatarBg }]}>
        {p.avatarUrl ? (
          <Image source={{ uri: p.avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />
        ) : (
          <Text style={[mosaicStyles.initials, { color: p.avatarColor, fontSize: size * 0.38 }]}>{p.initials}</Text>
        )}
      </View>
    );
  }

  const [a, b] = shown;
  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      {/* Back avatar — top-left */}
      <View
        style={[
          mosaicStyles.subAvatar,
          {
            top: 0,
            left: 0,
            width: subSize,
            height: subSize,
            borderRadius: subSize / 2,
            backgroundColor: a.avatarBg,
            borderColor: Colors.bgPrimary,
          },
        ]}
      >
        {a.avatarUrl ? (
          <Image source={{ uri: a.avatarUrl }} style={{ width: subSize, height: subSize, borderRadius: subSize / 2 }} />
        ) : (
          <Text style={[mosaicStyles.initials, { color: a.avatarColor, fontSize: subSize * 0.4 }]}>{a.initials}</Text>
        )}
      </View>
      {/* Front avatar — bottom-right, overlaps */}
      <View
        style={[
          mosaicStyles.subAvatar,
          {
            top: size - subSize,
            left: size - subSize,
            width: subSize,
            height: subSize,
            borderRadius: subSize / 2,
            backgroundColor: b.avatarBg,
            borderColor: Colors.bgPrimary,
          },
        ]}
      >
        {b.avatarUrl ? (
          <Image source={{ uri: b.avatarUrl }} style={{ width: subSize, height: subSize, borderRadius: subSize / 2 }} />
        ) : (
          <Text style={[mosaicStyles.initials, { color: b.avatarColor, fontSize: subSize * 0.4 }]}>{b.initials}</Text>
        )}
      </View>
    </View>
  );
};

const mosaicStyles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  subAvatar: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
  },
  initials: {
    fontFamily: Fonts.bodyBold,
  },
});

// ──────────────────────────────────────────────────────────────
// Conversation row
// ──────────────────────────────────────────────────────────────

interface RowProps {
  conv: Conversation;
  meId: string;
  onPress: () => void;
  onLongPress: () => void;
}

const ConversationRow: React.FC<RowProps> = ({ conv, meId, onPress, onLongPress }) => {
  const isGroup = conv.isGroup === true;

  // Resolve the "primary" other participant for DMs; for groups we collect all.
  const otherId = isGroup ? null : conv.participants.find((id) => id !== meId);
  const other = !isGroup && otherId ? conv.participantDetails[otherId] : null;
  if (!isGroup && (!other || !otherId)) return null;

  // For groups, precompute the list of other participants (excluding me).
  const otherParticipants = isGroup
    ? conv.participants
        .filter((id) => id !== meId)
        .map((id) => conv.participantDetails[id])
        .filter(Boolean)
    : [];

  const unread = conv.unreadCount[meId] || 0;
  const isMyLastMsg = conv.lastMessageSenderId === meId;
  const muted = (conv.mutedBy || []).includes(meId);
  const pinned = (conv.pinnedBy || []).includes(meId);
  const showUnreadAccent = unread > 0 && !isMyLastMsg && !muted;

  // Typing detection — only for DMs (single "other" to watch)
  const typingTs = !isGroup && otherId ? (conv.typing && conv.typing[otherId]) || 0 : 0;
  const isTyping = typingTs > 0 && Date.now() - typingTs < 5000;

  // "Vu" — DM only. Groups have per-user lastReadAt but aggregated receipt is noisy.
  let theyHaveRead = false;
  if (!isGroup && isMyLastMsg && otherId && conv.lastMessageAt && conv.lastReadAt) {
    const theirLastReadAt = conv.lastReadAt[otherId];
    if (theirLastReadAt) {
      theyHaveRead = new Date(theirLastReadAt).getTime() >= new Date(conv.lastMessageAt).getTime();
    }
  }

  // Display name + optional meetup sub-line
  const displayName = isGroup
    ? (conv.groupName || conv.linkedPlanTitle || 'Nouveau groupe')
    : (other?.displayName || '');

  // Sender name for group message preview prefix ("Léa: ...")
  const lastSenderName = (() => {
    if (!isGroup) return '';
    if (isMyLastMsg) return 'Toi';
    const sender = conv.participantDetails[conv.lastMessageSenderId];
    if (!sender) return '';
    return sender.displayName.split(' ')[0];
  })();

  // ── Build preview content ──
  let previewNode: React.ReactNode;

  if (isTyping) {
    previewNode = (
      <View style={rowStyles.previewLine}>
        <Text style={[rowStyles.typingText, { color: Colors.primary }]} numberOfLines={1}>
          en train d{'\u2019'}écrire
        </Text>
        <TypingDots color={Colors.primary} />
      </View>
    );
  } else if (!conv.lastMessage) {
    previewNode = (
      <Text
        style={[rowStyles.preview, { color: Colors.textTertiary, fontStyle: 'italic' }]}
        numberOfLines={1}
      >
        {isGroup ? 'Dis bonjour au groupe' : 'Nouvelle conversation'}
      </Text>
    );
  } else if (conv.lastMessageType === 'system') {
    previewNode = (
      <Text
        style={[rowStyles.preview, { color: Colors.textTertiary, fontStyle: 'italic' }]}
        numberOfLines={1}
      >
        {conv.lastMessage}
      </Text>
    );
  } else if (conv.lastMessageType === 'plan') {
    // Plan-share micro-pill
    const swatch = (!isGroup && other?.avatarBg) || Colors.primary;
    previewNode = (
      <View style={rowStyles.previewLine}>
        {isGroup && lastSenderName && (
          <Text style={[rowStyles.receipt, { color: Colors.textSecondary, fontFamily: Fonts.bodySemiBold }]}>
            {lastSenderName}{': '}
          </Text>
        )}
        {!isGroup && isMyLastMsg && (
          <Text
            style={[
              rowStyles.receipt,
              { color: theyHaveRead ? Colors.primary : Colors.textTertiary },
            ]}
          >
            Toi{theyHaveRead ? ' · vu' : ' · '}
          </Text>
        )}
        <View
          style={[
            rowStyles.planPill,
            {
              backgroundColor: Colors.terracotta50,
              borderColor: Colors.terracotta100,
            },
            (isGroup || isMyLastMsg) && { marginLeft: 6 },
          ]}
        >
          <View style={[rowStyles.planSwatch, { backgroundColor: swatch }]} />
          <Text
            style={[rowStyles.planPillText, { color: Colors.primaryDeep }]}
            numberOfLines={1}
          >
            {truncate(conv.lastMessage || 'Plan partagé', 28)}
          </Text>
        </View>
      </View>
    );
  } else {
    // Text message
    const previewColor = muted
      ? Colors.textTertiary
      : showUnreadAccent
        ? Colors.textPrimary
        : Colors.textSecondary;
    const previewWeight = showUnreadAccent ? Fonts.bodySemiBold : Fonts.body;

    if (isGroup) {
      // Group: "Léa: xxx" prefix (no "vu" receipt — too noisy in groups)
      previewNode = (
        <Text
          style={[rowStyles.preview, { color: previewColor, fontFamily: previewWeight }]}
          numberOfLines={1}
        >
          {lastSenderName && (
            <Text style={{ color: Colors.textSecondary, fontFamily: Fonts.bodySemiBold }}>
              {lastSenderName}{': '}
            </Text>
          )}
          {conv.lastMessage}
        </Text>
      );
    } else if (isMyLastMsg) {
      previewNode = (
        <Text
          style={[rowStyles.preview, { color: previewColor, fontFamily: previewWeight }]}
          numberOfLines={1}
        >
          <Text
            style={[
              rowStyles.receipt,
              { color: theyHaveRead ? Colors.primary : Colors.textTertiary },
            ]}
          >
            Toi{theyHaveRead ? ' · vu  ' : ' · '}
          </Text>
          {conv.lastMessage}
        </Text>
      );
    } else {
      previewNode = (
        <Text
          style={[rowStyles.preview, { color: previewColor, fontFamily: previewWeight }]}
          numberOfLines={1}
        >
          {conv.lastMessage}
        </Text>
      );
    }
  }

  // ── Right-side meta (badge / mute icon / pin) ──
  const rightMeta: React.ReactNode[] = [];

  if (muted) {
    rightMeta.push(
      <Ionicons
        key="mute"
        name="notifications-off-outline"
        size={14}
        color={Colors.textTertiary}
        style={{ marginRight: unread > 0 ? 6 : 0 }}
      />,
    );
  }

  if (unread > 0) {
    rightMeta.push(
      <View
        key="badge"
        style={[
          rowStyles.badge,
          { backgroundColor: muted ? Colors.gray400 : Colors.primary },
        ]}
      >
        <Text style={rowStyles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
      </View>,
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.65}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={[
        rowStyles.row,
        showUnreadAccent && {
          backgroundColor: 'rgba(196, 112, 75, 0.06)',
        },
      ]}
    >
      {/* Left accent bar (unread, non-muted only) */}
      {showUnreadAccent && <View style={[rowStyles.accentBar, { backgroundColor: Colors.primary }]} />}

      {isGroup ? (
        <GroupMosaicAvatar
          participants={otherParticipants.map((p) => ({
            initials: p.initials,
            avatarBg: p.avatarBg,
            avatarColor: p.avatarColor,
            avatarUrl: p.avatarUrl,
          }))}
          size={50}
        />
      ) : (
        <Avatar
          initials={other!.initials}
          bg={other!.avatarBg}
          color={other!.avatarColor}
          size="ML"
          avatarUrl={other!.avatarUrl ?? undefined}
        />
      )}

      <View style={rowStyles.body}>
        <View style={rowStyles.topLine}>
          <View style={rowStyles.nameWrap}>
            {isGroup && (
              <Ionicons
                name="people"
                size={12}
                color={Colors.textTertiary}
                style={{ marginRight: 6 }}
              />
            )}
            <Text
              style={[
                rowStyles.name,
                {
                  color: muted ? Colors.textSecondary : Colors.textPrimary,
                  fontFamily: showUnreadAccent ? Fonts.bodyBold : Fonts.bodySemiBold,
                },
              ]}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            {pinned && (
              <Ionicons
                name="pin"
                size={11}
                color={Colors.textTertiary}
                style={{ marginLeft: 5, transform: [{ rotate: '45deg' }] }}
              />
            )}
          </View>
          <Text
            style={[
              rowStyles.time,
              {
                color: showUnreadAccent ? Colors.primary : Colors.textTertiary,
                fontFamily: showUnreadAccent ? Fonts.bodySemiBold : Fonts.bodyMedium,
              },
            ]}
          >
            {formatTimeAgo(conv.lastMessageAt)}
          </Text>
        </View>

        <View style={rowStyles.bottomLine}>
          <View style={rowStyles.previewWrap}>{previewNode}</View>
          {rightMeta.length > 0 && (
            <View style={rowStyles.metaWrap}>{rightMeta}</View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const rowStyles = StyleSheet.create({
  row: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  body: { flex: 1, justifyContent: 'center' },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  nameWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  name: {
    fontSize: 14.5,
    letterSpacing: -0.1,
  },
  time: {
    fontSize: 11,
    letterSpacing: 0.1,
  },
  bottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewWrap: { flex: 1, marginRight: 8 },
  previewLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  preview: {
    fontSize: 13,
    lineHeight: 18,
  },
  receipt: {
    fontSize: 13,
    fontFamily: Fonts.body,
  },
  typingText: {
    fontSize: 13,
    fontFamily: Fonts.bodyMedium,
    fontStyle: 'italic',
  },
  metaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 11,
    fontFamily: Fonts.bodyBold,
    color: Colors.textOnAccent,
    lineHeight: 13,
  },
  planPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 200,
  },
  planSwatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  planPillText: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    flexShrink: 1,
  },
});

// ──────────────────────────────────────────────────────────────
// Action sheet (long-press menu)
// ──────────────────────────────────────────────────────────────

interface ActionSheetProps {
  visible: boolean;
  conv: Conversation | null;
  meId: string;
  onClose: () => void;
  onTogglePin: (id: string) => void;
  onToggleMute: (id: string) => void;
  onDelete: (id: string) => void;
}

const ActionSheet: React.FC<ActionSheetProps> = ({
  visible,
  conv,
  meId,
  onClose,
  onTogglePin,
  onToggleMute,
  onDelete,
}) => {
  if (!conv) return null;
  const isGroup = conv.isGroup === true;
  const otherId = isGroup ? null : conv.participants.find((id) => id !== meId);
  const other = !isGroup && otherId ? conv.participantDetails[otherId] : null;
  const pinned = (conv.pinnedBy || []).includes(meId);
  const muted = (conv.mutedBy || []).includes(meId);
  const groupName = isGroup ? (conv.groupName || conv.linkedPlanTitle || 'Groupe') : '';
  const participantCount = conv.participants.length;
  const otherParticipantsForSheet = isGroup
    ? conv.participants
        .filter((id) => id !== meId)
        .map((id) => conv.participantDetails[id])
        .filter(Boolean)
    : [];

  const askDelete = () => {
    onClose();
    Alert.alert(
      'Supprimer la conversation\u00a0?',
      'Cette action est définitive et concerne tous les participants.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => onDelete(conv.id),
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={sheetStyles.backdrop} onPress={onClose}>
        <Pressable style={sheetStyles.sheet} onPress={() => {}}>
          {isGroup ? (
            <View style={sheetStyles.header}>
              <GroupMosaicAvatar
                participants={otherParticipantsForSheet.map((p) => ({
                  initials: p.initials,
                  avatarBg: p.avatarBg,
                  avatarColor: p.avatarColor,
                  avatarUrl: p.avatarUrl,
                }))}
                size={40}
              />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={sheetStyles.headerName} numberOfLines={1}>
                  {groupName}
                </Text>
                <Text style={sheetStyles.headerHandle} numberOfLines={1}>
                  {participantCount} participants
                </Text>
              </View>
            </View>
          ) : other ? (
            <View style={sheetStyles.header}>
              <Avatar
                initials={other.initials}
                bg={other.avatarBg}
                color={other.avatarColor}
                size="M"
                avatarUrl={other.avatarUrl ?? undefined}
              />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={sheetStyles.headerName} numberOfLines={1}>
                  {other.displayName}
                </Text>
                <Text style={sheetStyles.headerHandle} numberOfLines={1}>
                  @{other.username}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={sheetStyles.divider} />

          <TouchableOpacity
            style={sheetStyles.action}
            onPress={() => {
              onTogglePin(conv.id);
              onClose();
            }}
            activeOpacity={0.6}
          >
            <Ionicons
              name={pinned ? 'pin' : 'pin-outline'}
              size={20}
              color={Colors.textPrimary}
              style={pinned ? { transform: [{ rotate: '45deg' }] } : undefined}
            />
            <Text style={sheetStyles.actionText}>
              {pinned ? 'Désépingler' : 'Épingler en haut'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={sheetStyles.action}
            onPress={() => {
              onToggleMute(conv.id);
              onClose();
            }}
            activeOpacity={0.6}
          >
            <Ionicons
              name={muted ? 'notifications-outline' : 'notifications-off-outline'}
              size={20}
              color={Colors.textPrimary}
            />
            <Text style={sheetStyles.actionText}>
              {muted ? 'Réactiver les notifications' : 'Mettre en sourdine'}
            </Text>
          </TouchableOpacity>

          <View style={sheetStyles.divider} />

          <TouchableOpacity
            style={sheetStyles.action}
            onPress={askDelete}
            activeOpacity={0.6}
          >
            <Ionicons name="trash-outline" size={20} color={Colors.error} />
            <Text style={[sheetStyles.actionText, { color: Colors.error }]}>
              Supprimer la conversation
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={sheetStyles.cancel}
            onPress={onClose}
            activeOpacity={0.6}
          >
            <Text style={sheetStyles.cancelText}>Annuler</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.bgSecondary,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 6,
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerName: {
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },
  headerHandle: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.borderSubtle,
    marginHorizontal: 4,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 14,
  },
  actionText: {
    fontSize: 15,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textPrimary,
  },
  cancel: {
    marginTop: 6,
    marginHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: Colors.bgTertiary,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
  },
});

// ──────────────────────────────────────────────────────────────
// Main screen
// ──────────────────────────────────────────────────────────────

export const ChatListScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const {
    conversations,
    isLoading,
    subscribe,
    togglePin,
    toggleMute,
    deleteConv,
  } = useChatStore();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sheetConvId, setSheetConvId] = useState<string | null>(null);

  // ── Periodic re-render so "à l'instant / 5 min" updates without new data ──
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (user?.id) subscribe(user.id);
  }, [user?.id, subscribe]);

  const meId = user?.id || '';

  // ── Compute the unread total (for the chip badge) ──
  const totalUnreadConvs = useMemo(() => {
    if (!meId) return 0;
    return conversations.filter((c) => (c.unreadCount[meId] || 0) > 0).length;
  }, [conversations, meId]);

  // ── Filter + search + section ──
  const items = useMemo<ListItem[]>(() => {
    if (!meId) return [];

    const q = search.trim().toLowerCase();
    const matchesSearch = (c: Conversation) => {
      if (!q) return true;
      const last = (c.lastMessage || '').toLowerCase();
      if (c.isGroup) {
        const name = (c.groupName || c.linkedPlanTitle || '').toLowerCase();
        // Also match any participant's displayName
        const participantMatch = Object.values(c.participantDetails || {}).some((p) =>
          p.displayName.toLowerCase().includes(q) || p.username.toLowerCase().includes(q),
        );
        return name.includes(q) || last.includes(q) || participantMatch;
      }
      const otherId = c.participants.find((id) => id !== meId);
      const other = otherId ? c.participantDetails[otherId] : null;
      const name = other?.displayName?.toLowerCase() || '';
      const username = other?.username?.toLowerCase() || '';
      return name.includes(q) || username.includes(q) || last.includes(q);
    };

    const matchesFilter = (c: Conversation) => {
      if (filter === 'all') return true;
      if (filter === 'unread') {
        const unread = c.unreadCount[meId] || 0;
        const isMine = c.lastMessageSenderId === meId;
        return unread > 0 && !isMine;
      }
      return true;
    };

    const filtered = conversations.filter((c) => matchesSearch(c) && matchesFilter(c));

    // Split pinned vs rest, both sorted by lastMessageAt desc
    const pinned: Conversation[] = [];
    const rest: Conversation[] = [];

    filtered.forEach((c) => {
      if ((c.pinnedBy || []).includes(meId)) pinned.push(c);
      else rest.push(c);
    });

    const sortDesc = (a: Conversation, b: Conversation) =>
      b.lastMessageAt.localeCompare(a.lastMessageAt);
    pinned.sort(sortDesc);
    rest.sort(sortDesc);

    const out: ListItem[] = [];
    if (pinned.length > 0) {
      out.push({ kind: 'header', id: 'h-pinned', label: 'Épinglés' });
      pinned.forEach((c) => out.push({ kind: 'conv', id: c.id, conv: c }));
    }
    // Plain flat list for everything else — no temporal section header
    rest.forEach((c) => out.push({ kind: 'conv', id: c.id, conv: c }));

    return out;
  }, [conversations, meId, search, filter]);

  const sheetConv = useMemo(
    () => conversations.find((c) => c.id === sheetConvId) || null,
    [conversations, sheetConvId],
  );

  // ──────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────

  const renderItem = ({ item, index }: { item: ListItem; index: number }) => {
    if (item.kind === 'header') {
      return (
        <View
          style={[
            styles.sectionHeader,
            index > 0 && { marginTop: 18 },
          ]}
        >
          <Text style={styles.sectionLabel}>{item.label}</Text>
        </View>
      );
    }

    // Show separator above row if previous item is also a conv (not a section header)
    const prev = items[index - 1];
    const showSep = prev && prev.kind === 'conv';

    return (
      <View>
        {showSep && <View style={styles.rowSeparator} />}
        <ConversationRow
          conv={item.conv}
          meId={meId}
          onPress={() => {
            if (item.conv.isGroup) {
              // Groups are identified by conv id alone; ConversationScreen derives header data from it.
              navigation.navigate('Conversation', {
                conversationId: item.conv.id,
                otherUser: null,
              });
              return;
            }
            const otherId = item.conv.participants.find((id) => id !== meId);
            const other = otherId ? item.conv.participantDetails[otherId] : null;
            if (!other) return;
            navigation.navigate('Conversation', {
              conversationId: item.conv.id,
              otherUser: other,
            });
          }}
          onLongPress={() => setSheetConvId(item.conv.id)}
        />
      </View>
    );
  };

  const showLoading = isLoading && conversations.length === 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {Platform.OS === 'android' && (
        <StatusBar
          barStyle="dark-content"
          backgroundColor={Colors.bgPrimary}
          translucent={false}
        />
      )}

      {/* ── Header ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.6}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => navigation.navigate('NewConversation')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.6}
        >
          <Ionicons name="create-outline" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* ── Search bar ─────────────────────────────────────── */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher"
            placeholderTextColor={Colors.textTertiary}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch('')}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="close-circle" size={16} color={Colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Filter chips ───────────────────────────────────── */}
      <View style={styles.chipsRow}>
        <FilterChip
          label="Tous"
          active={filter === 'all'}
          onPress={() => setFilter('all')}
        />
        <FilterChip
          label="Non-lus"
          active={filter === 'unread'}
          count={totalUnreadConvs}
          onPress={() => setFilter('unread')}
        />
      </View>

      {/* ── Body ───────────────────────────────────────────── */}
      {showLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : items.length === 0 && conversations.length === 0 ? (
        <EmptyState
          icon="💬"
          title="Aucun message"
          subtitle="Envoie un message ou partage un plan avec un ami."
          ctaLabel="Nouveau message"
          onCtaPress={() => navigation.navigate('NewConversation')}
        />
      ) : items.length === 0 ? (
        <View style={styles.emptyFiltered}>
          <Text style={styles.emptyFilteredTitle}>
            {search ? 'Aucun résultat' : 'Tout est lu'}
          </Text>
          <Text style={styles.emptyFilteredSub}>
            {search
              ? 'Essaie un autre mot-clé.'
              : 'Tu es à jour sur toutes tes conversations.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      )}

      <ActionSheet
        visible={sheetConvId !== null}
        conv={sheetConv}
        meId={meId}
        onClose={() => setSheetConvId(null)}
        onTogglePin={togglePin}
        onToggleMute={toggleMute}
        onDelete={deleteConv}
      />
    </View>
  );
};

// ──────────────────────────────────────────────────────────────
// Filter chip
// ──────────────────────────────────────────────────────────────

interface ChipProps {
  label: string;
  active: boolean;
  count?: number;
  onPress: () => void;
}

const FilterChip: React.FC<ChipProps> = ({ label, active, count, onPress }) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        chipStyles.chip,
        active
          ? { backgroundColor: Colors.textPrimary, borderColor: Colors.textPrimary }
          : { backgroundColor: Colors.bgTertiary, borderColor: Colors.borderSubtle },
      ]}
    >
      <Text
        style={[
          chipStyles.chipText,
          { color: active ? Colors.textOnAccent : Colors.textPrimary },
        ]}
      >
        {label}
      </Text>
      {typeof count === 'number' && count > 0 && (
        <View style={[chipStyles.chipBadge, { backgroundColor: Colors.primary }]}>
          <Text style={chipStyles.chipBadgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 99,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontSize: 12.5,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: 0.1,
  },
  chipBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.bodyBold,
    color: Colors.textOnAccent,
    lineHeight: 12,
  },
});

// ──────────────────────────────────────────────────────────────
// Top-level styles
// ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    letterSpacing: -0.2,
    color: Colors.textPrimary,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.bgTertiary,
    borderRadius: 13,
    paddingHorizontal: 12,
    height: 38,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.body,
    color: Colors.textPrimary,
    padding: 0,
    margin: 0,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  list: {
    paddingTop: 6,
    paddingBottom: 30,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.textTertiary,
  },
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.borderSubtle,
    marginLeft: 70, // after 50px avatar + 12px gap + 8px row padding-left ≈ 70
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyFiltered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 80,
  },
  emptyFilteredTitle: {
    fontSize: 17,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  emptyFilteredSub: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
