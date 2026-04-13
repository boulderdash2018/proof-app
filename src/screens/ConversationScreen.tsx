import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Keyboard, Image, Animated, PanResponder,
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
import { ChatMessage, ConversationParticipant, resetUnreadCount } from '../services/chatService';

const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '🔥', '👏'];
const HEART_EMOJI = '❤️';
const DOUBLE_TAP_DELAY = 300;
const SWIPE_THRESHOLD = 55;
const SWIPE_MAX = 80;

// ═══════════════════════════════════════════════
// Typing Indicator
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
// Swipeable Message Row
// ═══════════════════════════════════════════════

interface MessageRowProps {
  item: ChatMessage;
  prevMsg: ChatMessage | undefined;
  userId: string | undefined;
  otherUser: ConversationParticipant;
  C: any;
  isLastSent: boolean;
  otherHasRead: boolean;
  isPickerTarget: boolean;
  pickerScale: Animated.Value;
  onSwipeReply: (msg: ChatMessage) => void;
  onDoubleTapLike: (msgId: string, currentlyLiked: boolean) => void;
  onLongPress: (msgId: string) => void;
  onDismissPicker: () => void;
  onReaction: (emoji: string) => void;
  onScrollToQuote: (msgId: string) => void;
  onPlanPress: (planId: string) => void;
}

const MessageRow = React.memo<MessageRowProps>(({
  item, prevMsg, userId, otherUser, C, isLastSent, otherHasRead,
  isPickerTarget, pickerScale,
  onSwipeReply, onDoubleTapLike, onLongPress, onDismissPicker, onReaction,
  onScrollToQuote, onPlanPress,
}) => {
  const isMine = item.senderId === userId;
  const showDate = shouldShowDateSeparator(item, prevMsg);
  const myReaction = item.reactions.find((r) => r.userId === userId);
  const hasReply = !!item.replyToId;

  // ── Animated values ──
  const translateX = useRef(new Animated.Value(0)).current;
  const heartScale = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;
  const lastTapRef = useRef(0);

  // ── Stable refs for PanResponder callbacks ──
  const itemRef = useRef(item);
  itemRef.current = item;
  const onSwipeReplyRef = useRef(onSwipeReply);
  onSwipeReplyRef.current = onSwipeReply;

  // ── Swipe PanResponder ──
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => g.dx > 15 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onMoveShouldSetPanResponderCapture: () => false,
    onPanResponderMove: (_, g) => {
      const x = Math.max(0, Math.min(g.dx, SWIPE_MAX));
      translateX.setValue(x);
    },
    onPanResponderRelease: (_, g) => {
      if (g.dx > SWIPE_THRESHOLD) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onSwipeReplyRef.current(itemRef.current);
      }
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 7, tension: 40 }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
    },
  }), []);

  // ── Swipe reply icon interpolation ──
  const replyIconOpacity = translateX.interpolate({ inputRange: [0, 25, SWIPE_THRESHOLD], outputRange: [0, 0.4, 1], extrapolate: 'clamp' });
  const replyIconScale = translateX.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0.4, 1], extrapolate: 'clamp' });

  // ── Tap handler (double-tap = like) ──
  const handlePress = useCallback(() => {
    if (isPickerTarget) { onDismissPicker(); return; }

    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      lastTapRef.current = 0;
      const hasLike = item.reactions.some((r) => r.userId === userId && r.emoji === HEART_EMOJI);
      onDoubleTapLike(item.id, hasLike);

      if (!hasLike) {
        heartOpacity.setValue(1);
        heartScale.setValue(0);
        Animated.sequence([
          Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, friction: 3, tension: 200 }),
          Animated.delay(500),
          Animated.parallel([
            Animated.timing(heartScale, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(heartOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
          ]),
        ]).start();
      }
    } else {
      lastTapRef.current = now;
    }
  }, [item, userId, isPickerTarget, onDoubleTapLike, onDismissPicker]);

  // ── Long press → reaction picker ──
  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress(item.id);
  }, [item.id, onLongPress]);

  return (
    <View>
      {showDate && (
        <View style={styles.dateSeparator}>
          <Text style={[styles.dateSeparatorText, { color: C.gray600 }]}>
            {formatDateSeparator(item.createdAt)}
          </Text>
        </View>
      )}

      <View style={styles.msgWrapper}>
        {/* Swipe reply indicator — fixed behind, revealed by slide */}
        <Animated.View style={[
          styles.swipeIndicator,
          { opacity: replyIconOpacity, transform: [{ scale: replyIconScale }] },
        ]}>
          <View style={[styles.swipeIndicatorCircle, { backgroundColor: C.gray200 }]}>
            <Ionicons name="arrow-undo" size={14} color={C.gray600} />
          </View>
        </Animated.View>

        {/* Swipeable message content */}
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft,
            { transform: [{ translateX }] },
          ]}
        >
          {!isMine && (
            <Avatar initials={otherUser.initials} bg={otherUser.avatarBg} color={otherUser.avatarColor} size="SS" avatarUrl={otherUser.avatarUrl || undefined} />
          )}

          <TouchableOpacity
            onPress={handlePress}
            onLongPress={handleLongPress}
            activeOpacity={0.9}
            delayLongPress={400}
            style={{ maxWidth: '80%' }}
          >
            {/* Quoted reply preview */}
            {hasReply && (
              <TouchableOpacity
                onPress={() => item.replyToId && onScrollToQuote(item.replyToId)}
                style={[styles.quotedReply, { backgroundColor: isMine ? 'rgba(255,255,255,0.15)' : C.primary + '10', borderLeftColor: C.primary }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.quotedName, { color: isMine ? 'rgba(255,255,255,0.8)' : C.primary }]} numberOfLines={1}>
                  {item.replyToSenderId === userId ? 'Toi' : otherUser.displayName}
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
                <TouchableOpacity onPress={() => item.planId && onPlanPress(item.planId)} activeOpacity={0.8}>
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

              {/* Heart animation overlay */}
              <Animated.View
                pointerEvents="none"
                style={[styles.heartOverlay, { opacity: heartOpacity, transform: [{ scale: heartScale }] }]}
              >
                <Text style={styles.heartEmoji}>❤️</Text>
              </Animated.View>
            </View>

            {/* Reactions display */}
            {item.reactions.length > 0 && (
              <View style={[styles.reactionsRow, isMine ? styles.reactionsRight : styles.reactionsLeft]}>
                {item.reactions.map((r) => (
                  <View
                    key={`${r.emoji}-${r.userId}`}
                    style={[
                      styles.reactionChip, { backgroundColor: C.gray200 },
                      r.userId === userId && { backgroundColor: C.primary + '20', borderWidth: 1, borderColor: C.primary + '40' },
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
                {otherHasRead ? (
                  <View style={styles.readReceiptInner}>
                    <Avatar initials={otherUser.initials} bg={otherUser.avatarBg} color={otherUser.avatarColor} size="XS" avatarUrl={otherUser.avatarUrl || undefined} />
                    <Text style={[styles.readReceiptText, { color: C.gray600 }]}>Vu</Text>
                  </View>
                ) : (
                  <Text style={[styles.readReceiptText, { color: C.gray600 }]}>Envoyé</Text>
                )}
              </View>
            )}
          </TouchableOpacity>

          {/* Reaction picker (long press) — emoji row directly */}
          {isPickerTarget && (
            <Animated.View style={[
              styles.reactionPicker,
              { backgroundColor: C.white, transform: [{ scale: pickerScale }] },
              isMine ? styles.reactionPickerRight : styles.reactionPickerLeft,
            ]}>
              {REACTION_EMOJIS.map((emoji) => (
                <TouchableOpacity key={emoji} onPress={() => onReaction(emoji)} style={styles.reactionPickerBtn}>
                  <Text style={[
                    styles.reactionPickerEmoji,
                    myReaction?.emoji === emoji && styles.reactionPickerActive,
                  ]}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          )}
        </Animated.View>
      </View>
    </View>
  );
});

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
  const conversations = useChatStore((s) => s.conversations);
  const openConversation = useChatStore((s) => s.openConversation);
  const closeConversation = useChatStore((s) => s.closeConversation);
  const sendText = useChatStore((s) => s.sendText);
  const toggleReaction = useChatStore((s) => s.toggleReaction);
  const setTypingStore = useChatStore((s) => s.setTyping);

  // Derive read status from conversation-level unreadCount (no message-level writes)
  const otherHasRead = useMemo(() => {
    const conv = conversations.find((c) => c.id === conversationId);
    return (conv?.unreadCount[otherUser.userId] || 0) === 0;
  }, [conversations, conversationId, otherUser.userId]);

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [pickerMsgId, setPickerMsgId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const pickerScale = useRef(new Animated.Value(0)).current;
  const convIdRef = useRef(conversationId);

  // ── Typing freshness timer ──
  useEffect(() => {
    if (!otherTyping) return;
    const timer = setInterval(() => {
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

  // ── Open conversation ──
  useEffect(() => {
    convIdRef.current = conversationId;
    if (user?.id) openConversation(conversationId, user.id);
    return () => { if (convIdRef.current === conversationId) closeConversation(); };
  }, [conversationId, user?.id]);

  // ── Reset unread on new messages (lightweight — only touches conversation doc, not messages) ──
  useEffect(() => {
    if (!user?.id || messages.length === 0) return;
    // Just reset the counter — no writes to individual message documents
    resetUnreadCount(conversationId, user.id);
  }, [messages.length, conversationId, user?.id]);

  // ── Auto-scroll ──
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // ── Text change → typing ──
  const handleTextChange = useCallback((val: string) => {
    setText(val);
    if (val.trim().length > 0) setTypingStore(true);
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

  // ── Swipe → reply ──
  const handleSwipeReply = useCallback((msg: ChatMessage) => {
    setReplyTo(msg);
    setPickerMsgId(null);
  }, []);

  // ── Double tap → like / unlike ──
  const handleDoubleTapLike = useCallback((msgId: string, currentlyLiked: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleReaction(msgId, HEART_EMOJI);
  }, [toggleReaction]);

  // ── Long press → reaction picker ──
  const handleLongPressOpen = useCallback((msgId: string) => {
    setPickerMsgId(msgId);
    pickerScale.setValue(0);
    Animated.spring(pickerScale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 100 }).start();
  }, []);

  // ── Dismiss picker ──
  const handleDismissPicker = useCallback(() => {
    Animated.timing(pickerScale, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setPickerMsgId(null);
    });
  }, []);

  // ── Reaction from picker ──
  const handleReaction = useCallback((emoji: string) => {
    if (!pickerMsgId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleReaction(pickerMsgId, emoji);
    Animated.timing(pickerScale, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setPickerMsgId(null);
    });
  }, [pickerMsgId, toggleReaction]);

  // ── Scroll to quoted message ──
  const handleScrollToQuote = useCallback((messageId: string) => {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx >= 0) flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
  }, [messages]);

  const handlePlanPress = useCallback((planId: string) => {
    navigation.navigate('PlanDetail', { planId });
  }, [navigation]);

  // ── Last sent message ID (for read receipt) ──
  const lastSentMsgId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].senderId === user?.id) return messages[i].id;
    }
    return null;
  }, [messages, user?.id]);

  // ── Render item ──
  const renderItem = useCallback(({ item, index }: { item: ChatMessage; index: number }) => (
    <MessageRow
      item={item}
      prevMsg={index > 0 ? messages[index - 1] : undefined}
      userId={user?.id}
      otherUser={otherUser}
      C={C}
      isLastSent={item.id === lastSentMsgId}
      otherHasRead={otherHasRead}
      isPickerTarget={pickerMsgId === item.id}
      pickerScale={pickerScale}
      onSwipeReply={handleSwipeReply}
      onDoubleTapLike={handleDoubleTapLike}
      onLongPress={handleLongPressOpen}
      onDismissPicker={handleDismissPicker}
      onReaction={handleReaction}
      onScrollToQuote={handleScrollToQuote}
      onPlanPress={handlePlanPress}
    />
  ), [messages, user?.id, otherUser, C, lastSentMsgId, otherHasRead, pickerMsgId, pickerScale, handleSwipeReply, handleDoubleTapLike, handleLongPressOpen, handleDismissPicker, handleReaction, handleScrollToQuote, handlePlanPress]);

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
          renderItem={renderItem}
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

  // Message wrapper (holds swipe indicator + row)
  msgWrapper: { position: 'relative', marginBottom: 6 },

  // Swipe reply indicator
  swipeIndicator: {
    position: 'absolute', left: 12, top: 0, bottom: 0,
    justifyContent: 'center', zIndex: -1,
  },
  swipeIndicatorCircle: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },

  // Message row
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  msgRowLeft: { justifyContent: 'flex-start', marginRight: 50 },
  msgRowRight: { justifyContent: 'flex-end', marginLeft: 50 },

  // Bubble
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, overflow: 'hidden' },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleOther: { borderBottomLeftRadius: 4 },
  bubbleWithReply: { borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  msgText: { fontSize: 15, fontFamily: Fonts.serif, lineHeight: 20 },
  msgTime: { fontSize: 10, fontFamily: Fonts.serif, marginTop: 4, alignSelf: 'flex-end' },

  // Heart animation overlay
  heartOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  heartEmoji: { fontSize: 36 },

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
  reactionChip: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 5, paddingVertical: 2 },
  reactionEmoji: { fontSize: 13 },

  // Read receipt
  readReceipt: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 3, paddingRight: 2 },
  readReceiptInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  readReceiptText: { fontSize: 10, fontFamily: Fonts.serif },

  // Reaction picker (long press — emojis directly)
  reactionPicker: {
    position: 'absolute', top: -48,
    flexDirection: 'row', borderRadius: 22,
    paddingHorizontal: 6, paddingVertical: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
    gap: 2,
  },
  reactionPickerLeft: { left: 26 },
  reactionPickerRight: { right: 0 },
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
