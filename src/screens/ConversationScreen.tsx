import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Keyboard, Image, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar } from '../components';
import { useAuthStore } from '../store';
import { useChatStore } from '../store/chatStore';
import { useColors } from '../hooks/useColors';
import { ChatMessage, ConversationParticipant, markConversationRead } from '../services/chatService';

const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '🔥', '👏'];

// ═══════════════════════════════════════════════
// Typing Indicator Component
// ═══════════════════════════════════════════════

const TypingIndicator: React.FC<{ otherUser: ConversationParticipant; color: string; bgColor: string }> = ({ otherUser, color, bgColor }) => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animateDot = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -4, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600 - delay),
        ]),
      );
    const a1 = animateDot(dot1, 0);
    const a2 = animateDot(dot2, 150);
    const a3 = animateDot(dot3, 300);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={styles.typingRow}>
      <Avatar initials={otherUser.initials} bg={otherUser.avatarBg} color={otherUser.avatarColor} size="SS" avatarUrl={otherUser.avatarUrl || undefined} />
      <View style={[styles.typingBubble, { backgroundColor: bgColor }]}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View key={i} style={[styles.typingDot, { backgroundColor: color, transform: [{ translateY: dot }] }]} />
        ))}
      </View>
    </View>
  );
};

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

const formatTime = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

const formatDateSeparator = (dateStr: string): string => {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  if (days < 7) return d.toLocaleDateString('fr-FR', { weekday: 'long' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
};

const shouldShowDateSeparator = (msg: ChatMessage, prevMsg?: ChatMessage): boolean => {
  if (!prevMsg) return true;
  return new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();
};

// ═══════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════

export const ConversationScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const C = useColors();
  const user = useAuthStore((s) => s.user);

  const { conversationId, otherUser } = route.params as {
    conversationId: string;
    otherUser: ConversationParticipant;
  };

  const messages = useChatStore((s) => s.messages);
  const isMessagesLoading = useChatStore((s) => s.isMessagesLoading);
  const otherTyping = useChatStore((s) => s.otherTyping);
  const openConversation = useChatStore((s) => s.openConversation);
  const closeConversation = useChatStore((s) => s.closeConversation);
  const sendText = useChatStore((s) => s.sendText);
  const toggleReaction = useChatStore((s) => s.toggleReaction);
  const setTypingStore = useChatStore((s) => s.setTyping);

  const [text, setText] = useState('');
  const [contextMenuMsgId, setContextMenuMsgId] = useState<string | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const menuScale = useRef(new Animated.Value(0)).current;
  const convIdRef = useRef(conversationId);

  // ── Typing indicator freshness timer ──
  useEffect(() => {
    if (!otherTyping) return;
    const timer = setInterval(() => {
      // Force re-check via conversations (store derives otherTyping)
      // If the typing timestamp is stale, the store will set otherTyping=false
      const convs = useChatStore.getState().conversations;
      const conv = convs.find((c) => c.id === conversationId);
      if (conv?.typing) {
        const otherId = conv.participants.find((id) => id !== user?.id);
        if (otherId) {
          const ts = conv.typing[otherId] || 0;
          if (ts === 0 || Date.now() - ts >= 5000) {
            useChatStore.setState({ otherTyping: false });
          }
        }
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [otherTyping, conversationId, user?.id]);

  // ── Open conversation + mark read ──
  useEffect(() => {
    convIdRef.current = conversationId;
    if (user?.id) openConversation(conversationId, user.id);
    return () => {
      if (convIdRef.current === conversationId) closeConversation();
    };
  }, [conversationId, user?.id]);

  // ── Mark read when new messages arrive (for read receipts) ──
  useEffect(() => {
    if (messages.length > 0 && user?.id) {
      markConversationRead(conversationId, user.id).catch(() => {});
    }
  }, [messages.length, conversationId, user?.id]);

  // ── Auto-scroll on new messages ──
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // ── Text change → typing indicator ──
  const handleTextChange = useCallback((val: string) => {
    setText(val);
    if (val.trim().length > 0) {
      setTypingStore(true);
    }
  }, [setTypingStore]);

  // ── Send ──
  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const reply = replyTo ? {
      id: replyTo.id,
      senderId: replyTo.senderId,
      content: replyTo.type === 'plan' ? `📍 ${replyTo.planTitle || 'Plan'}` : replyTo.content,
      type: replyTo.type,
    } : undefined;
    setText('');
    setReplyTo(null);
    Keyboard.dismiss();
    await sendText(trimmed, reply);
  }, [text, sendText, replyTo]);

  // ── Long press → context menu ──
  const handleLongPress = useCallback((messageId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setContextMenuMsgId(messageId);
    setShowReactionPicker(false);
    Animated.spring(menuScale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 100 }).start();
  }, []);

  const dismissMenu = useCallback(() => {
    if (!contextMenuMsgId) return;
    Animated.timing(menuScale, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setContextMenuMsgId(null);
      setShowReactionPicker(false);
    });
  }, [contextMenuMsgId]);

  // ── Context menu: Reply ──
  const handleReply = useCallback(() => {
    const msg = messages.find((m) => m.id === contextMenuMsgId);
    if (msg) setReplyTo(msg);
    Animated.timing(menuScale, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setContextMenuMsgId(null);
      setShowReactionPicker(false);
    });
  }, [contextMenuMsgId, messages]);

  // ── Context menu: Show reactions ──
  const handleShowReactions = useCallback(() => {
    setShowReactionPicker(true);
  }, []);

  // ── Reaction tap ──
  const handleReaction = useCallback((emoji: string) => {
    if (!contextMenuMsgId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleReaction(contextMenuMsgId, emoji);
    Animated.timing(menuScale, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setContextMenuMsgId(null);
      setShowReactionPicker(false);
    });
  }, [contextMenuMsgId, toggleReaction]);

  // ── Scroll to quoted message ──
  const scrollToMessage = useCallback((messageId: string) => {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx >= 0) {
      flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
    }
  }, [messages]);

  const handlePlanPress = useCallback((planId: string) => {
    navigation.navigate('PlanDetail', { planId });
  }, [navigation]);

  // ── Find last message sent by me (for read receipt) ──
  const lastSentMsgId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].senderId === user?.id) return messages[i].id;
    }
    return null;
  }, [messages, user?.id]);

  // ── Render message ──
  const renderMessage = useCallback(({ item, index }: { item: ChatMessage; index: number }) => {
    const isMine = item.senderId === user?.id;
    const prevMsg = index > 0 ? messages[index - 1] : undefined;
    const showDate = shouldShowDateSeparator(item, prevMsg);
    const isMenuTarget = contextMenuMsgId === item.id;
    const isLastSent = item.id === lastSentMsgId;
    const myReaction = item.reactions.find((r) => r.userId === user?.id);
    const hasReply = !!item.replyToId;
    const isReadByOther = item.readBy?.includes(otherUser.userId);

    return (
      <View>
        {showDate && (
          <View style={styles.dateSeparator}>
            <Text style={[styles.dateSeparatorText, { color: C.gray600 }]}>
              {formatDateSeparator(item.createdAt)}
            </Text>
          </View>
        )}

        <TouchableOpacity
          activeOpacity={0.9}
          onLongPress={() => handleLongPress(item.id)}
          onPress={dismissMenu}
          style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}
        >
          {/* Avatar for other person */}
          {!isMine && (
            <Avatar initials={otherUser.initials} bg={otherUser.avatarBg} color={otherUser.avatarColor} size="SS" avatarUrl={otherUser.avatarUrl || undefined} />
          )}

          <View style={{ maxWidth: '80%' }}>
            {/* Quoted reply preview inside bubble */}
            {hasReply && (
              <TouchableOpacity
                onPress={() => item.replyToId && scrollToMessage(item.replyToId)}
                style={[styles.quotedReply, { backgroundColor: isMine ? 'rgba(255,255,255,0.15)' : C.primary + '10', borderLeftColor: C.primary }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.quotedName, { color: isMine ? 'rgba(255,255,255,0.8)' : C.primary }]} numberOfLines={1}>
                  {item.replyToSenderId === user?.id ? 'Toi' : otherUser.displayName}
                </Text>
                <Text style={[styles.quotedText, { color: isMine ? 'rgba(255,255,255,0.6)' : C.gray600 }]} numberOfLines={1}>
                  {item.replyToType === 'plan' ? 'Plan partagé ✦' : item.replyToContent}
                </Text>
              </TouchableOpacity>
            )}

            <View style={[
              styles.bubble,
              isMine ? [styles.bubbleMine, { backgroundColor: C.primary }] : [styles.bubbleOther, { backgroundColor: C.gray200 }],
              hasReply && styles.bubbleWithReply,
            ]}>
              {item.type === 'plan' ? (
                <TouchableOpacity onPress={() => item.planId && handlePlanPress(item.planId)} activeOpacity={0.8}>
                  {item.planCover ? (
                    <Image source={{ uri: item.planCover }} style={styles.planCover} />
                  ) : (
                    <View style={[styles.planCoverPlaceholder, { backgroundColor: C.primary + '20' }]}>
                      <Ionicons name="map-outline" size={24} color={C.primary} />
                    </View>
                  )}
                  <View style={styles.planInfo}>
                    <Text style={[styles.planLabel, { color: isMine ? 'rgba(255,255,255,0.7)' : C.gray600 }]}>Plan partagé</Text>
                    <Text style={[styles.planTitle, { color: isMine ? '#FFF' : C.black }]} numberOfLines={2}>{item.planTitle}</Text>
                    {item.planAuthorName && (
                      <Text style={[styles.planAuthor, { color: isMine ? 'rgba(255,255,255,0.6)' : C.gray600 }]}>par {item.planAuthorName}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ) : (
                <Text style={[styles.msgText, { color: isMine ? '#FFF' : C.black }]}>{item.content}</Text>
              )}
              <Text style={[styles.msgTime, { color: isMine ? 'rgba(255,255,255,0.6)' : C.gray600 }]}>{formatTime(item.createdAt)}</Text>
            </View>

            {/* Reactions display */}
            {item.reactions.length > 0 && (
              <View style={[styles.reactionsRow, isMine ? styles.reactionsRight : styles.reactionsLeft]}>
                {item.reactions.map((r) => (
                  <View
                    key={`${r.emoji}-${r.userId}`}
                    style={[
                      styles.reactionChip,
                      { backgroundColor: C.gray200 },
                      r.userId === user?.id && { backgroundColor: C.primary + '20', borderWidth: 1, borderColor: C.primary + '40' },
                    ]}
                  >
                    <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Read receipt — only under last sent message by me */}
            {isMine && isLastSent && (
              <View style={styles.readReceipt}>
                {isReadByOther ? (
                  <View style={styles.readReceiptInner}>
                    <Avatar initials={otherUser.initials} bg={otherUser.avatarBg} color={otherUser.avatarColor} size="XS" avatarUrl={otherUser.avatarUrl || undefined} />
                    <Text style={[styles.readReceiptText, { color: C.gray600 }]}>Vu</Text>
                  </View>
                ) : (
                  <Text style={[styles.readReceiptText, { color: C.gray600 }]}>Envoyé</Text>
                )}
              </View>
            )}
          </View>

          {/* Context menu */}
          {isMenuTarget && (
            <Animated.View style={[
              styles.contextMenu,
              { backgroundColor: C.white, transform: [{ scale: menuScale }] },
              isMine ? styles.contextMenuRight : styles.contextMenuLeft,
            ]}>
              {showReactionPicker ? (
                <View style={styles.reactionPickerRow}>
                  {REACTION_EMOJIS.map((emoji) => (
                    <TouchableOpacity key={emoji} onPress={() => handleReaction(emoji)} style={styles.reactionPickerBtn}>
                      <Text style={[styles.reactionPickerEmoji, myReaction?.emoji === emoji && styles.reactionPickerActive]}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <>
                  <TouchableOpacity style={styles.contextMenuItem} onPress={handleReply} activeOpacity={0.7}>
                    <Ionicons name="arrow-undo-outline" size={16} color={C.black} />
                    <Text style={[styles.contextMenuText, { color: C.black }]}>Répondre</Text>
                  </TouchableOpacity>
                  <View style={[styles.contextMenuDivider, { backgroundColor: C.borderLight }]} />
                  <TouchableOpacity style={styles.contextMenuItem} onPress={handleShowReactions} activeOpacity={0.7}>
                    <Ionicons name="happy-outline" size={16} color={C.black} />
                    <Text style={[styles.contextMenuText, { color: C.black }]}>Réagir</Text>
                  </TouchableOpacity>
                </>
              )}
            </Animated.View>
          )}
        </TouchableOpacity>
      </View>
    );
  }, [user?.id, messages, contextMenuMsgId, showReactionPicker, lastSentMsgId, otherUser, C, menuScale, handleLongPress, dismissMenu, handleReply, handleShowReactions, handleReaction, scrollToMessage, handlePlanPress]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.borderLight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={C.black} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerCenter}
          onPress={() => navigation.navigate('OtherProfile', { userId: otherUser.userId })}
          activeOpacity={0.7}
        >
          <Avatar initials={otherUser.initials} bg={otherUser.avatarBg} color={otherUser.avatarColor} size="S" avatarUrl={otherUser.avatarUrl || undefined} />
          <Text style={[styles.headerName, { color: C.black }]} numberOfLines={1}>{otherUser.displayName}</Text>
        </TouchableOpacity>
        <View style={{ width: 24 }} />
      </View>

      {/* Messages */}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.messagesList, { paddingBottom: 10 }]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListFooterComponent={otherTyping ? <TypingIndicator otherUser={otherUser} color={C.gray600} bgColor={C.gray200} /> : null}
          onScrollToIndexFailed={() => {}}
        />

        {/* Reply preview bar */}
        {replyTo && (
          <View style={[styles.replyBar, { backgroundColor: C.white, borderTopColor: C.borderLight }]}>
            <View style={[styles.replyBarPreview, { borderLeftColor: C.primary }]}>
              <Text style={[styles.replyBarName, { color: C.primary }]} numberOfLines={1}>
                {replyTo.senderId === user?.id ? 'Toi' : otherUser.displayName}
              </Text>
              <Text style={[styles.replyBarText, { color: C.gray600 }]} numberOfLines={1}>
                {replyTo.type === 'plan' ? 'Plan partagé ✦' : replyTo.content}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={18} color={C.gray600} />
            </TouchableOpacity>
          </View>
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { borderTopColor: C.borderLight, paddingBottom: Math.max(insets.bottom, 8) }]}>
          <View style={[styles.inputRow, { backgroundColor: C.gray200 }]}>
            <TextInput
              style={[styles.input, { color: C.black }]}
              placeholder="Message..."
              placeholderTextColor={C.gray600}
              value={text}
              onChangeText={handleTextChange}
              multiline
              maxLength={2000}
            />
            {text.trim().length > 0 && (
              <TouchableOpacity onPress={handleSend} style={[styles.sendBtn, { backgroundColor: C.primary }]}>
                <Ionicons name="arrow-up" size={18} color="#FFF" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

// ═══════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1,
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'center' },
  headerName: { fontSize: 16, fontFamily: Fonts.serifBold, letterSpacing: -0.3 },
  messagesList: { paddingHorizontal: 12, paddingTop: 12 },

  // Date separator
  dateSeparator: { alignItems: 'center', marginVertical: 16 },
  dateSeparatorText: { fontSize: 12, fontFamily: Fonts.serifSemiBold, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Message row
  msgRow: { flexDirection: 'row', marginBottom: 6, alignItems: 'flex-end', gap: 6, position: 'relative' },
  msgRowLeft: { justifyContent: 'flex-start', marginRight: 50 },
  msgRowRight: { justifyContent: 'flex-end', marginLeft: 50 },

  // Bubble
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleOther: { borderBottomLeftRadius: 4 },
  bubbleWithReply: { borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  msgText: { fontSize: 15, fontFamily: Fonts.serif, lineHeight: 20 },
  msgTime: { fontSize: 10, fontFamily: Fonts.serif, marginTop: 4, alignSelf: 'flex-end' },

  // Plan in message
  planCover: { width: '100%', height: 120, borderRadius: 12, marginBottom: 8 },
  planCoverPlaceholder: { width: '100%', height: 80, borderRadius: 12, marginBottom: 8, alignItems: 'center', justifyContent: 'center' },
  planInfo: { gap: 2 },
  planLabel: { fontSize: 10, fontFamily: Fonts.serifSemiBold, textTransform: 'uppercase', letterSpacing: 0.5 },
  planTitle: { fontSize: 14, fontFamily: Fonts.serifBold, lineHeight: 18 },
  planAuthor: { fontSize: 11, fontFamily: Fonts.serif, marginTop: 2 },

  // Quoted reply in bubble
  quotedReply: {
    borderLeftWidth: 3, borderRadius: 8, borderTopLeftRadius: 4,
    paddingHorizontal: 10, paddingVertical: 6, marginBottom: 2,
  },
  quotedName: { fontSize: 11, fontFamily: Fonts.serifBold },
  quotedText: { fontSize: 12, fontFamily: Fonts.serif, marginTop: 1 },

  // Reactions
  reactionsRow: { flexDirection: 'row', gap: 3, marginTop: 2 },
  reactionsLeft: { justifyContent: 'flex-start' },
  reactionsRight: { justifyContent: 'flex-end' },
  reactionChip: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 10,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  reactionEmoji: { fontSize: 13 },

  // Read receipt
  readReceipt: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 3, paddingRight: 2 },
  readReceiptInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  readReceiptText: { fontSize: 10, fontFamily: Fonts.serif },

  // Context menu (Reply + React)
  contextMenu: {
    position: 'absolute', top: -52, borderRadius: 14,
    paddingVertical: 4, paddingHorizontal: 4, minWidth: 140,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 6,
  },
  contextMenuLeft: { left: 30 },
  contextMenuRight: { right: 0 },
  contextMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  contextMenuText: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
  contextMenuDivider: { height: 1, marginHorizontal: 8 },

  // Reaction picker (inside context menu)
  reactionPickerRow: { flexDirection: 'row', paddingHorizontal: 4, paddingVertical: 4, gap: 2 },
  reactionPickerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  reactionPickerEmoji: { fontSize: 22 },
  reactionPickerActive: { fontSize: 26 },

  // Reply bar above input
  replyBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 8, borderTopWidth: 1, gap: 12,
  },
  replyBarPreview: { flex: 1, borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 2 },
  replyBarName: { fontSize: 12, fontFamily: Fonts.serifBold },
  replyBarText: { fontSize: 12, fontFamily: Fonts.serif, marginTop: 1 },

  // Typing indicator
  typingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginLeft: 12, marginBottom: 6 },
  typingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 18, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 12,
  },
  typingDot: { width: 7, height: 7, borderRadius: 3.5, opacity: 0.6 },

  // Input bar
  inputBar: { paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', borderRadius: 22, paddingHorizontal: 14, paddingVertical: 8, gap: 8 },
  input: { flex: 1, fontSize: 15, fontFamily: Fonts.serif, maxHeight: 100, paddingVertical: 0 },
  sendBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
