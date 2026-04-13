import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Keyboard, Image, Animated, PanResponder,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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

// ── Time reveal (iMessage-style page slide) ──
const TIME_REVEAL_MAX = 70;

// ── Bubble shape (Instagram-style grouping) ──
const BUBBLE_R = 20;
const BUBBLE_FLAT = 4;
const GROUP_GAP = 4;
const NORMAL_GAP = 12;

// ── Reaction overlay ──
const REACTION_OVERLAP = 8;
const REACTION_CHIP_H = 22;
const REACTION_EXTRA = REACTION_CHIP_H - REACTION_OVERLAP; // 14px

// ── Gradient fade ──
const FADE_H = 30;

// ═══════════════════════════════════════════════
// Bubble grouping helpers
// ═══════════════════════════════════════════════

type BubblePos = 'single' | 'first' | 'middle' | 'last';

const isGroupedWith = (a: ChatMessage, b: ChatMessage): boolean => {
  if (a.senderId !== b.senderId) return false;
  return Math.abs(new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) < 2 * 60_000;
};

const msgHasHeartReaction = (msg: ChatMessage): boolean =>
  msg.reactions.some((r) => r.emoji === HEART_EMOJI);

const getBubblePos = (msg: ChatMessage, prev?: ChatMessage, next?: ChatMessage): BubblePos => {
  const prevReacted = prev ? msgHasHeartReaction(prev) : false;
  const withPrev = !!prev && isGroupedWith(prev, msg) && !prevReacted;
  const withNext = !!next && isGroupedWith(msg, next) && !msgHasHeartReaction(msg);
  if (withPrev && withNext) return 'middle';
  if (withPrev) return 'last';
  if (withNext) return 'first';
  return 'single';
};

const getBubbleRadii = (pos: BubblePos, isMine: boolean) => {
  if (pos === 'single') return { borderRadius: BUBBLE_R };
  // first: bottom sender-side corner flat (connects to next)
  if (pos === 'first') {
    return isMine
      ? { borderTopLeftRadius: BUBBLE_R, borderTopRightRadius: BUBBLE_R, borderBottomLeftRadius: BUBBLE_R, borderBottomRightRadius: BUBBLE_FLAT }
      : { borderTopLeftRadius: BUBBLE_R, borderTopRightRadius: BUBBLE_R, borderBottomLeftRadius: BUBBLE_FLAT, borderBottomRightRadius: BUBBLE_R };
  }
  // middle: both sender-side corners flat
  if (pos === 'middle') {
    return isMine
      ? { borderTopLeftRadius: BUBBLE_R, borderBottomLeftRadius: BUBBLE_R, borderTopRightRadius: BUBBLE_FLAT, borderBottomRightRadius: BUBBLE_FLAT }
      : { borderTopRightRadius: BUBBLE_R, borderBottomRightRadius: BUBBLE_R, borderTopLeftRadius: BUBBLE_FLAT, borderBottomLeftRadius: BUBBLE_FLAT };
  }
  // last: top sender-side flat, bottom rounded
  return isMine
    ? { borderTopLeftRadius: BUBBLE_R, borderBottomLeftRadius: BUBBLE_R, borderTopRightRadius: BUBBLE_FLAT, borderBottomRightRadius: BUBBLE_R }
    : { borderTopRightRadius: BUBBLE_R, borderBottomRightRadius: BUBBLE_R, borderTopLeftRadius: BUBBLE_FLAT, borderBottomLeftRadius: BUBBLE_R };
};

const getSpacing = (msg: ChatMessage, next?: ChatMessage): number => {
  const hasAnyReact = msg.reactions.length > 0;
  const extra = hasAnyReact ? REACTION_EXTRA : 0;
  if (!next) return extra;
  const hasHeart = msg.reactions.some((r) => r.emoji === HEART_EMOJI);
  const sameGroup = isGroupedWith(msg, next) && !hasHeart;  // only heart breaks group
  if (sameGroup) return hasAnyReact ? GROUP_GAP + extra : GROUP_GAP;
  return NORMAL_GAP + extra;
};

// ═══════════════════════════════════════════════
// Typing Indicator
// ═══════════════════════════════════════════════

interface TypingIndicatorProps {
  otherUser: ConversationParticipant;
  color: string;
  bgColor: string;
  isGrouped: boolean;
  listSlideX: Animated.Value;
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({ otherUser, color, bgColor, isGrouped, listSlideX }) => {
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

  // When grouped with previous received message, use 'last' bubble radii (flat top-left)
  const typingRadii = isGrouped
    ? { borderTopLeftRadius: BUBBLE_FLAT, borderTopRightRadius: BUBBLE_R, borderBottomLeftRadius: BUBBLE_R, borderBottomRightRadius: BUBBLE_R }
    : {};

  return (
    <View style={styles.msgWrapper}>
      <Animated.View style={[styles.msgRow, styles.msgRowLeft, { transform: [{ translateX: listSlideX }] }]}>
        <Avatar initials={otherUser.initials} bg={otherUser.avatarBg} color={otherUser.avatarColor} size="SS" avatarUrl={otherUser.avatarUrl || undefined} />
        <View style={[styles.typingBubble, { backgroundColor: bgColor }, typingRadii]}>
          {[dot1, dot2, dot3].map((dot, i) => (
            <Animated.View key={i} style={[styles.typingDot, { backgroundColor: color, transform: [{ translateY: dot }] }]} />
          ))}
        </View>
      </Animated.View>
    </View>
  );
};

// ═══════════════════════════════════════════════
// Swipeable Message Row
// ═══════════════════════════════════════════════

interface MessageRowProps {
  item: ChatMessage;
  prevMsg: ChatMessage | undefined;
  nextMsg: ChatMessage | undefined;
  userId: string | undefined;
  otherUser: ConversationParticipant;
  C: any;
  isLastSent: boolean;
  otherHasRead: boolean;
  isPickerTarget: boolean;
  pickerScale: Animated.Value;
  listSlideX: Animated.Value;
  onSwipeReply: (msg: ChatMessage) => void;
  onDoubleTapLike: (msgId: string, currentlyLiked: boolean) => void;
  onLongPress: (msgId: string) => void;
  onDismissPicker: () => void;
  onReaction: (emoji: string) => void;
  onScrollToQuote: (msgId: string) => void;
  onPlanPress: (planId: string) => void;
}

const MessageRow = React.memo<MessageRowProps>(({
  item, prevMsg, nextMsg, userId, otherUser, C, isLastSent, otherHasRead,
  isPickerTarget, pickerScale, listSlideX,
  onSwipeReply, onDoubleTapLike, onLongPress, onDismissPicker, onReaction,
  onScrollToQuote, onPlanPress,
}) => {
  const isMine = item.senderId === userId;
  const showDate = shouldShowDateSeparator(item, prevMsg);
  const myReaction = item.reactions.find((r) => r.userId === userId);
  const hasReply = !!item.replyToId;

  // ── Bubble grouping ──
  const bubblePos = getBubblePos(item, prevMsg, nextMsg);
  const bubbleRadii = getBubbleRadii(bubblePos, isMine);
  const spacing = getSpacing(item, nextMsg);
  const showAvatar = !isMine && (bubblePos === 'single' || bubblePos === 'last');

  // ── Heart like state ──
  const hasMyLike = item.reactions.some((r) => r.userId === userId && r.emoji === HEART_EMOJI);
  const nonHeartReactions = item.reactions.filter((r) => !(r.userId === userId && r.emoji === HEART_EMOJI));

  // ── Animated values ──
  const translateX = useRef(new Animated.Value(0)).current;
  const heartScale = useRef(new Animated.Value(hasMyLike ? 1 : 0)).current;
  const isAnimatingRef = useRef(false);
  const lastTapRef = useRef(0);
  const [showHeart, setShowHeart] = useState(hasMyLike);

  // ── Combined translateX: page slide + individual reply swipe ──
  const combinedX = useMemo(() => Animated.add(listSlideX, translateX), []);

  // ── Time reveal opacity ──
  const timeOpacity = useMemo(() => listSlideX.interpolate({
    inputRange: [-TIME_REVEAL_MAX, -25, 0],
    outputRange: [1, 0, 0],
    extrapolate: 'clamp',
  }), []);

  // ── Stable refs for PanResponder callbacks ──
  const itemRef = useRef(item);
  itemRef.current = item;
  const onSwipeReplyRef = useRef(onSwipeReply);
  onSwipeReplyRef.current = onSwipeReply;
  const isMineRef = useRef(isMine);
  isMineRef.current = isMine;

  // ── Sync heart with data (outside animation) ──
  useEffect(() => {
    if (!isAnimatingRef.current) {
      setShowHeart(hasMyLike);
      heartScale.setValue(hasMyLike ? 1 : 0);
    }
  }, [hasMyLike]);

  // ── Swipe PanResponder (mine → LEFT, received → RIGHT) ──
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => {
      const mine = isMineRef.current;
      if (mine) return g.dx < -15 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5;
      return g.dx > 15 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5;
    },
    onMoveShouldSetPanResponderCapture: () => false,
    onPanResponderMove: (_, g) => {
      const mine = isMineRef.current;
      if (mine) {
        translateX.setValue(Math.min(0, Math.max(g.dx, -SWIPE_MAX)));
      } else {
        translateX.setValue(Math.max(0, Math.min(g.dx, SWIPE_MAX)));
      }
    },
    onPanResponderRelease: (_, g) => {
      const mine = isMineRef.current;
      const triggered = mine ? g.dx < -SWIPE_THRESHOLD : g.dx > SWIPE_THRESHOLD;
      if (triggered) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onSwipeReplyRef.current(itemRef.current);
      }
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 7, tension: 40 }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
    },
  }), []);

  // ── Reply icon interpolation (bidirectional) ──
  const replyIconOpacity = isMine
    ? translateX.interpolate({ inputRange: [-SWIPE_THRESHOLD, -25, 0], outputRange: [1, 0.4, 0], extrapolate: 'clamp' })
    : translateX.interpolate({ inputRange: [0, 25, SWIPE_THRESHOLD], outputRange: [0, 0.4, 1], extrapolate: 'clamp' });
  const replyIconScale = isMine
    ? translateX.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0.4], extrapolate: 'clamp' })
    : translateX.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0.4, 1], extrapolate: 'clamp' });

  // ── Tap handler (double-tap = like/unlike) ──
  const handlePress = useCallback(() => {
    if (isPickerTarget) { onDismissPicker(); return; }
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      lastTapRef.current = 0;
      const hasLike = item.reactions.some((r) => r.userId === userId && r.emoji === HEART_EMOJI);
      onDoubleTapLike(item.id, hasLike);
      isAnimatingRef.current = true;
      if (!hasLike) {
        setShowHeart(true);
        heartScale.setValue(0);
        Animated.timing(heartScale, { toValue: 1, duration: 150, useNativeDriver: false }).start(() => {
          isAnimatingRef.current = false;
        });
      } else {
        Animated.timing(heartScale, { toValue: 0, duration: 150, useNativeDriver: false }).start(() => {
          isAnimatingRef.current = false;
          setShowHeart(false);
        });
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

  // ── Reactions to display ──
  const showOverlay = showHeart || nonHeartReactions.length > 0;

  return (
    <View>
      {showDate && (
        <View style={styles.dateSeparator}>
          <Text style={[styles.dateSeparatorText, { color: C.gray600 }]}>
            {formatDateSeparator(item.createdAt)}
          </Text>
        </View>
      )}

      <View style={[styles.msgWrapper, { marginBottom: spacing }]}>
        {/* Swipe reply indicator — left for received, right for mine */}
        <Animated.View style={[
          styles.swipeIndicatorBase,
          isMine ? styles.swipeIndicatorRight : styles.swipeIndicatorLeft,
          { opacity: replyIconOpacity, transform: [{ scale: replyIconScale }] },
        ]}>
          <View style={[styles.swipeIndicatorCircle, { backgroundColor: C.gray200 }]}>
            <Ionicons name="arrow-undo" size={14} color={C.gray600} />
          </View>
        </Animated.View>

        {/* Swipeable message content — slides with listSlideX + reply translateX */}
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft,
            { transform: [{ translateX: combinedX }] },
          ]}
        >
          {/* Avatar (other only, last in group) */}
          {!isMine && showAvatar && (
            <Avatar initials={otherUser.initials} bg={otherUser.avatarBg} color={otherUser.avatarColor} size="SS" avatarUrl={otherUser.avatarUrl || undefined} />
          )}
          {!isMine && !showAvatar && <View style={styles.avatarSpacer} />}

          <TouchableOpacity
            onPress={handlePress}
            onLongPress={handleLongPress}
            activeOpacity={0.9}
            delayLongPress={400}
            style={{ maxWidth: '78%' }}
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
                  {item.replyToType === 'plan' ? 'Plan partag\u00e9 \u2726' : item.replyToContent}
                </Text>
              </TouchableOpacity>
            )}

            {/* Bubble — dynamic radii from grouping */}
            <View style={[
              styles.bubble,
              isMine ? { backgroundColor: C.primary } : { backgroundColor: C.gray200 },
              hasReply && { borderTopLeftRadius: 8, borderTopRightRadius: 8 },
              bubbleRadii,
              hasReply && { borderTopLeftRadius: 8, borderTopRightRadius: 8 },
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
                    <Text style={[styles.planLabel, { color: isMine ? 'rgba(255,255,255,0.7)' : C.gray600 }]}>Plan partag\u00e9</Text>
                    <Text style={[styles.planTitle, { color: isMine ? '#FFF' : C.black }]} numberOfLines={2}>{item.planTitle}</Text>
                    {item.planAuthorName && (
                      <Text style={[styles.planAuthor, { color: isMine ? 'rgba(255,255,255,0.6)' : C.gray600 }]}>par {item.planAuthorName}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ) : (
                <Text style={[styles.msgText, { color: isMine ? '#FFF' : C.black }]}>{item.content}</Text>
              )}
            </View>

            {/* Reaction overlay — overlaps bottom of bubble */}
            {showOverlay && (
              <View style={[
                styles.reactionOverlay,
                isMine ? styles.reactionOverlayRight : styles.reactionOverlayLeft,
              ]}>
                {showHeart && (
                  <Animated.View style={[
                    styles.reactionChip, { backgroundColor: C.gray300 + 'DD', borderColor: C.primary + '30' },
                    { transform: [{ scale: heartScale }], opacity: heartScale },
                  ]}>
                    <Text style={styles.reactionEmoji}>{HEART_EMOJI}</Text>
                  </Animated.View>
                )}
                {nonHeartReactions.map((r) => (
                  <View
                    key={`${r.emoji}-${r.userId}`}
                    style={[
                      styles.reactionChip,
                      { backgroundColor: C.gray300 + 'DD', borderColor: C.primary + '30' },
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
                  <Text style={[styles.readReceiptText, { color: C.gray600 }]}>Envoy\u00e9</Text>
                )}
              </View>
            )}
          </TouchableOpacity>

          {/* Reaction picker (long press) */}
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

        {/* Time label — stays fixed at right, fades in on page slide */}
        <Animated.View style={[styles.revealTimeWrap, { opacity: timeOpacity }]} pointerEvents="none">
          <Text style={[styles.revealTimeText, { color: C.gray600 }]}>{formatTime(item.createdAt)}</Text>
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

  // Derive read status from conversation-level unreadCount
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

  // ── Page-level slide for time reveal ──
  const listSlideX = useRef(new Animated.Value(0)).current;
  const listPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      g.dx < -10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => {
      listSlideX.setValue(Math.max(g.dx, -TIME_REVEAL_MAX));
    },
    onPanResponderRelease: () => {
      Animated.spring(listSlideX, { toValue: 0, useNativeDriver: true, friction: 8, tension: 60 }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(listSlideX, { toValue: 0, useNativeDriver: true }).start();
    },
  }), []);

  // ── Gradient fade on scroll ──
  const fadeTopOp = useRef(new Animated.Value(0)).current;
  const fadeBotOp = useRef(new Animated.Value(1)).current;
  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    fadeTopOp.setValue(contentOffset.y > 8 ? 1 : 0);
    fadeBotOp.setValue(contentOffset.y + layoutMeasurement.height < contentSize.height - 8 ? 1 : 0);
  }, []);

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

  // ── Reset unread on new messages ──
  useEffect(() => {
    if (!user?.id || messages.length === 0) return;
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
      content: replyTo.type === 'plan' ? `\ud83d\udccd ${replyTo.planTitle || 'Plan'}` : replyTo.content,
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

  // ── Double tap → like/unlike ──
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
  const renderItem = useCallback(({ item, index }: { item: ChatMessage; index: number }) => {
    // When typing indicator is shown and this is the last received message,
    // inject a virtual "next message" so it doesn't show avatar (typing indicator will)
    const isLast = index === messages.length - 1;
    const typingContinuesGroup = isLast && otherTyping && item.senderId !== user?.id;
    const virtualNext = typingContinuesGroup
      ? ({ senderId: item.senderId, createdAt: new Date().toISOString(), reactions: [] } as unknown as ChatMessage)
      : undefined;
    const effectiveNext = index < messages.length - 1 ? messages[index + 1] : virtualNext;

    return (
    <MessageRow
      item={item}
      prevMsg={index > 0 ? messages[index - 1] : undefined}
      nextMsg={effectiveNext}
      userId={user?.id}
      otherUser={otherUser}
      C={C}
      isLastSent={item.id === lastSentMsgId}
      otherHasRead={otherHasRead}
      isPickerTarget={pickerMsgId === item.id}
      pickerScale={pickerScale}
      listSlideX={listSlideX}
      onSwipeReply={handleSwipeReply}
      onDoubleTapLike={handleDoubleTapLike}
      onLongPress={handleLongPressOpen}
      onDismissPicker={handleDismissPicker}
      onReaction={handleReaction}
      onScrollToQuote={handleScrollToQuote}
      onPlanPress={handlePlanPress}
    />
    );
  }, [messages, user?.id, otherUser, otherTyping, C, lastSentMsgId, otherHasRead, pickerMsgId, pickerScale, listSlideX, handleSwipeReply, handleDoubleTapLike, handleLongPressOpen, handleDismissPicker, handleReaction, handleScrollToQuote, handlePlanPress]);

  // ── Typing indicator grouping with last received message ──
  const typingIsGrouped = useMemo(() => {
    if (messages.length === 0) return false;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.senderId === user?.id) return false;
    if (msgHasHeartReaction(lastMsg)) return false;
    return Math.abs(Date.now() - new Date(lastMsg.createdAt).getTime()) < 2 * 60_000;
  }, [messages, user?.id]);

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
        <View style={styles.flex} {...listPanResponder.panHandlers}>
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.messagesList, { paddingBottom: 10 }]}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListFooterComponent={otherTyping ? (
              <TypingIndicator
                otherUser={otherUser}
                color={C.gray600}
                bgColor={C.gray200}
                isGrouped={typingIsGrouped}
                listSlideX={listSlideX}
              />
            ) : null}
            onScrollToIndexFailed={() => {}}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          />

          {/* Gradient fade — top */}
          <Animated.View style={[styles.fadeOverlay, styles.fadeTop, { opacity: fadeTopOp }]} pointerEvents="none">
            <LinearGradient colors={[C.white, C.white + '00']} style={StyleSheet.absoluteFill} />
          </Animated.View>

          {/* Gradient fade — bottom */}
          <Animated.View style={[styles.fadeOverlay, styles.fadeBottom, { opacity: fadeBotOp }]} pointerEvents="none">
            <LinearGradient colors={[C.white + '00', C.white]} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>

        {/* Reply preview bar */}
        {replyTo && (
          <View style={[styles.replyBar, { backgroundColor: C.white, borderTopColor: C.borderLight }]}>
            <View style={[styles.replyBarPreview, { borderLeftColor: C.primary }]}>
              <Text style={[styles.replyBarName, { color: C.primary }]} numberOfLines={1}>
                {replyTo.senderId === user?.id ? 'Toi' : otherUser.displayName}
              </Text>
              <Text style={[styles.replyBarText, { color: C.gray600 }]} numberOfLines={1}>
                {replyTo.type === 'plan' ? 'Plan partag\u00e9 \u2726' : replyTo.content}
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

  // Message wrapper
  msgWrapper: { position: 'relative' },

  // Swipe reply indicator (left for received, right for mine)
  swipeIndicatorBase: {
    position: 'absolute', top: 0, bottom: 0,
    justifyContent: 'center', zIndex: -1,
  },
  swipeIndicatorLeft: { left: 12 },
  swipeIndicatorRight: { right: 12 },
  swipeIndicatorCircle: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },

  // Message row
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  msgRowLeft: { justifyContent: 'flex-start', marginRight: 50 },
  msgRowRight: { justifyContent: 'flex-end', marginLeft: 50 },

  // Avatar spacer (matches Avatar SS = 20px)
  avatarSpacer: { width: 20 },

  // Bubble
  bubble: { paddingHorizontal: 14, paddingVertical: 10, overflow: 'visible' },
  msgText: { fontSize: 15, fontFamily: Fonts.serif, lineHeight: 20 },

  // Reaction overlay — overlaps bottom of bubble
  reactionOverlay: {
    flexDirection: 'row', gap: 2,
    marginTop: -REACTION_OVERLAP,
    zIndex: 2,
  },
  reactionOverlayLeft: { alignSelf: 'flex-start', paddingLeft: 8 },
  reactionOverlayRight: { alignSelf: 'flex-end', paddingRight: 8 },
  reactionChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 11, borderWidth: 1,
    paddingHorizontal: 5, paddingVertical: 1, minWidth: 26, height: REACTION_CHIP_H,
  },
  reactionEmoji: { fontSize: 13 },

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

  // Read receipt
  readReceipt: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 3, paddingRight: 2 },
  readReceiptInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  readReceiptText: { fontSize: 10, fontFamily: Fonts.serif },

  // Reaction picker (long press)
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

  // Time reveal (iMessage-style)
  revealTimeWrap: {
    position: 'absolute', right: 4, top: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'flex-end',
  },
  revealTimeText: { fontSize: 11, fontFamily: Fonts.serif },

  // Reply bar above input
  replyBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 8, borderTopWidth: 1, gap: 12,
  },
  replyBarPreview: { flex: 1, borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 2 },
  replyBarName: { fontSize: 12, fontFamily: Fonts.serifBold },
  replyBarText: { fontSize: 12, fontFamily: Fonts.serif, marginTop: 1 },

  // Typing indicator
  typingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: BUBBLE_R, paddingHorizontal: 14, paddingVertical: 12,
  },
  typingDot: { width: 7, height: 7, borderRadius: 3.5, opacity: 0.6 },

  // Input bar
  inputBar: { paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', borderRadius: 22, paddingHorizontal: 14, paddingVertical: 8, gap: 8 },
  input: { flex: 1, fontSize: 15, fontFamily: Fonts.serif, maxHeight: 100, paddingVertical: 0 },
  sendBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },

  // Gradient fade overlays
  fadeOverlay: { position: 'absolute', left: 0, right: 0, height: FADE_H },
  fadeTop: { top: 0 },
  fadeBottom: { bottom: 0 },
});
