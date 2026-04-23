import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Keyboard, Image, Animated, PanResponder,
  NativeSyntheticEvent, NativeScrollEvent, Modal, Pressable, Alert,
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
const BUBBLE_FLAT = 6;
const GROUP_GAP = 4;
const NORMAL_GAP = 12;
const PRESENCE_FRESH_MS = 5 * 60_000;

// ── Reaction overlay ──
const REACTION_OVERLAP = 16;
const REACTION_CHIP_H = 22;
const REACTION_EXTRA = REACTION_CHIP_H - REACTION_OVERLAP; // 6px

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
  isGrouped: boolean;
  listSlideX: Animated.Value;
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({ otherUser, isGrouped, listSlideX }) => {
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
        <Avatar initials={otherUser.initials} bg={otherUser.avatarBg} color={otherUser.avatarColor} size="XSM" avatarUrl={otherUser.avatarUrl || undefined} />
        <View style={[styles.typingBubble, typingRadii]}>
          {[dot1, dot2, dot3].map((dot, i) => (
            <Animated.View key={i} style={[styles.typingDot, { transform: [{ translateY: dot }] }]} />
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

  // ── Reactions to display — aggregate by emoji, with count if ≥2 ──
  const aggregatedNonHeart = useMemo(() => {
    const map = new Map<string, number>();
    nonHeartReactions.forEach((r) => {
      map.set(r.emoji, (map.get(r.emoji) || 0) + 1);
    });
    return Array.from(map.entries()).map(([emoji, count]) => ({ emoji, count }));
  }, [nonHeartReactions]);

  // Heart count (mine + any other hearts on the same message)
  const heartCount = useMemo(
    () => item.reactions.filter((r) => r.emoji === HEART_EMOJI).length,
    [item.reactions],
  );

  const showOverlay = showHeart || aggregatedNonHeart.length > 0;

  return (
    <View>
      {showDate && (
        <View style={styles.dateSeparator}>
          <Text style={styles.dateSeparatorText}>
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
            <Avatar initials={otherUser.initials} bg={otherUser.avatarBg} color={otherUser.avatarColor} size="XSM" avatarUrl={otherUser.avatarUrl || undefined} />
          )}
          {!isMine && !showAvatar && <View style={styles.avatarSpacer} />}

          <TouchableOpacity
            onPress={handlePress}
            onLongPress={handleLongPress}
            activeOpacity={0.9}
            delayLongPress={400}
            style={{ maxWidth: '78%' }}
          >
            {/* Quoted reply preview — colors flip based on bubble side */}
            {hasReply && (
              <TouchableOpacity
                onPress={() => item.replyToId && onScrollToQuote(item.replyToId)}
                style={[
                  styles.quotedReply,
                  isMine ? styles.quotedReplyMine : styles.quotedReplyOther,
                  isMine
                    ? { backgroundColor: 'rgba(255,248,240,0.18)', borderLeftColor: Colors.textOnAccent }
                    : { backgroundColor: Colors.terracotta50, borderLeftColor: Colors.primary },
                ]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.quotedName,
                    { color: isMine ? Colors.textOnAccent : Colors.primaryDeep },
                  ]}
                  numberOfLines={1}
                >
                  {item.replyToSenderId === userId ? 'Toi' : otherUser.displayName}
                </Text>
                <Text
                  style={[
                    styles.quotedText,
                    {
                      color: isMine ? 'rgba(255,248,240,0.85)' : Colors.textSecondary,
                    },
                  ]}
                  numberOfLines={2}
                >
                  {item.replyToType === 'plan'
                    ? 'Plan partagé ✦'
                    : item.replyToContent || 'Message supprimé'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Bubble — dynamic radii from grouping */}
            <View style={[
              styles.bubble,
              isMine
                ? { backgroundColor: Colors.primary }
                : {
                    backgroundColor: Colors.bgSecondary,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: Colors.borderSubtle,
                  },
              // Plan messages get a tighter padding so the inner card breathes
              item.type === 'plan' && styles.bubblePlanPadding,
              bubbleRadii,
              // When there's a quoted reply on top, flatten the bubble's top corners
              // so the preview + bubble merge into a single rounded block.
              hasReply && { borderTopLeftRadius: 6, borderTopRightRadius: 6 },
            ]}>
              {item.type === 'plan' ? (
                <TouchableOpacity
                  onPress={() => item.planId && onPlanPress(item.planId)}
                  activeOpacity={0.85}
                  style={[
                    styles.planCard,
                    {
                      backgroundColor: isMine ? Colors.bgSecondary : Colors.bgPrimary,
                    },
                  ]}
                >
                  {/* Cover hero with floating tag */}
                  <View style={styles.planHero}>
                    {item.planCover ? (
                      <Image source={{ uri: item.planCover }} style={StyleSheet.absoluteFill} />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, styles.planHeroFallback]} />
                    )}
                    <View style={styles.planHeroOverlay} pointerEvents="none" />
                    <View style={styles.planHeroTag}>
                      <Text style={styles.planHeroTagText}>✦ Plan partagé</Text>
                    </View>
                  </View>
                  <View style={styles.planBody}>
                    {item.planAuthorName && (
                      <Text style={styles.planEyebrow} numberOfLines={1}>
                        CURATEUR · {item.planAuthorName}
                      </Text>
                    )}
                    <Text style={styles.planTitle} numberOfLines={2}>
                      {item.planTitle}
                    </Text>
                    {item.planAuthorName && (
                      <Text style={styles.planAuthor} numberOfLines={1}>
                        par {item.planAuthorName}
                      </Text>
                    )}
                  </View>
                  {!!item.content && (
                    <View style={styles.planAttachedWrap}>
                      <Text style={styles.planAttachedMsg}>{item.content}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ) : (
                <Text style={[styles.msgText, { color: isMine ? Colors.textOnAccent : Colors.textPrimary }]}>{item.content}</Text>
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
                    styles.reactionChip,
                    { transform: [{ scale: heartScale }], opacity: heartScale },
                  ]}>
                    <Text style={styles.reactionEmoji}>{HEART_EMOJI}</Text>
                    {heartCount >= 2 && (
                      <Text style={styles.reactionCount}>{heartCount}</Text>
                    )}
                  </Animated.View>
                )}
                {aggregatedNonHeart.map(({ emoji, count }) => (
                  <View key={emoji} style={styles.reactionChip}>
                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                    {count >= 2 && (
                      <Text style={styles.reactionCount}>{count}</Text>
                    )}
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
                    <Text style={[styles.readReceiptText, { color: Colors.primary, fontFamily: Fonts.bodyMedium }]}>
                      Vu · {formatTime(item.createdAt)}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.readReceiptInner}>
                    <Ionicons name="checkmark-done" size={12} color={Colors.textTertiary} />
                    <Text style={[styles.readReceiptText, { color: Colors.textTertiary, fontFamily: Fonts.bodyMedium }]}>
                      Livré · {formatTime(item.createdAt)}
                    </Text>
                  </View>
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

/** Compact "il y a X" for header status */
const formatRelativeShort = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return 'à l\u2019instant';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d} j`;
  return `il y a ${Math.floor(d / 7)} sem`;
};

const formatDateSeparator = (dateStr: string): string => {
  const d = new Date(dateStr);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Aujourd'hui \u00b7 ${time}`;
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Hier \u00b7 ${time}`;
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 7) return `${d.toLocaleDateString('fr-FR', { weekday: 'long' })} \u00b7 ${time}`;
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
  const togglePin = useChatStore((s) => s.togglePin);
  const toggleMute = useChatStore((s) => s.toggleMute);
  const deleteConv = useChatStore((s) => s.deleteConv);

  // Derive read status from conversation-level unreadCount
  const otherHasRead = useMemo(() => {
    const conv = conversations.find((c) => c.id === conversationId);
    return (conv?.unreadCount[otherUser.userId] || 0) === 0;
  }, [conversations, conversationId, otherUser.userId]);

  // Active conversation (looked up once, used for status + kebab actions)
  const activeConv = useMemo(
    () => conversations.find((c) => c.id === conversationId) || null,
    [conversations, conversationId],
  );

  // Is the other user "fresh" (last seen < 5min) — approximate presence
  const otherLastSeenAt = activeConv?.lastReadAt?.[otherUser.userId];
  const otherIsFresh = useMemo(() => {
    if (!otherLastSeenAt) return false;
    return Date.now() - new Date(otherLastSeenAt).getTime() < PRESENCE_FRESH_MS;
  }, [otherLastSeenAt]);

  // Periodic re-render so status freshness updates without new data
  const [, setStatusTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStatusTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Kebab action sheet
  const [kebabOpen, setKebabOpen] = useState(false);

  const isMuted = useMemo(
    () => Boolean(activeConv && user?.id && (activeConv.mutedBy || []).includes(user.id)),
    [activeConv, user?.id],
  );

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [pickerMsgId, setPickerMsgId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;
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

  // ── Reset unread — debounced so it fires at most once per second ──
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!user?.id || messages.length === 0) return;
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      resetUnreadCount(conversationId, user.id);
    }, 1000);
    return () => { if (resetTimerRef.current) clearTimeout(resetTimerRef.current); };
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
  // Uses messagesRef instead of messages closure to keep a STABLE callback
  // reference — prevents FlatList render thrashing (default batch = 10 items).
  const renderItem = useCallback(({ item, index }: { item: ChatMessage; index: number }) => {
    const msgs = messagesRef.current;
    const isLast = index === msgs.length - 1;
    const typingContinuesGroup = isLast && otherTyping && item.senderId !== user?.id;
    const virtualNext = typingContinuesGroup
      ? ({ senderId: item.senderId, createdAt: new Date().toISOString(), reactions: [] } as unknown as ChatMessage)
      : undefined;
    const effectiveNext = index < msgs.length - 1 ? msgs[index + 1] : virtualNext;

    return (
    <MessageRow
      item={item}
      prevMsg={index > 0 ? msgs[index - 1] : undefined}
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
  }, [user?.id, otherUser, otherTyping, C, lastSentMsgId, otherHasRead, pickerMsgId, pickerScale, listSlideX, handleSwipeReply, handleDoubleTapLike, handleLongPressOpen, handleDismissPicker, handleReaction, handleScrollToQuote, handlePlanPress]);

  // ── Typing indicator grouping with last received message ──
  const typingIsGrouped = useMemo(() => {
    if (messages.length === 0) return false;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.senderId === user?.id) return false;
    if (msgHasHeartReaction(lastMsg)) return false;
    return Math.abs(Date.now() - new Date(lastMsg.createdAt).getTime()) < 2 * 60_000;
  }, [messages, user?.id]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: Colors.bgPrimary }]}>
      {/* Header — reworked: avatar + name + status line + kebab */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.headerIconBtn}
          activeOpacity={0.6}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerCenter}
          onPress={() => navigation.navigate('OtherProfile', { userId: otherUser.userId })}
          activeOpacity={0.7}
        >
          <View style={styles.headerAvWrap}>
            <Avatar
              initials={otherUser.initials}
              bg={otherUser.avatarBg}
              color={otherUser.avatarColor}
              size="M"
              avatarUrl={otherUser.avatarUrl || undefined}
            />
            {(otherTyping || otherIsFresh) && (
              <View style={styles.headerPresenceDot} />
            )}
          </View>
          <View style={styles.headerTxt}>
            <Text style={styles.headerName} numberOfLines={1}>
              {otherUser.displayName}
            </Text>
            {otherTyping ? (
              <Text style={[styles.headerStatus, { color: Colors.primary }]} numberOfLines={1}>
                en train d{'\u2019'}écrire{'\u2026'}
              </Text>
            ) : otherIsFresh ? (
              <Text style={[styles.headerStatus, { color: Colors.success }]} numberOfLines={1}>
                En ligne
              </Text>
            ) : otherLastSeenAt ? (
              <Text style={[styles.headerStatus, { color: Colors.textTertiary }]} numberOfLines={1}>
                Vu {formatRelativeShort(otherLastSeenAt)}
              </Text>
            ) : (
              <Text style={[styles.headerStatus, { color: Colors.textTertiary }]} numberOfLines={1}>
                @{otherUser.username}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setKebabOpen(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.headerIconBtn}
          activeOpacity={0.6}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <View style={styles.flex} {...listPanResponder.panHandlers}>
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            extraData={messages.length}
            initialNumToRender={9999}
            maxToRenderPerBatch={9999}
            removeClippedSubviews={false}
            contentContainerStyle={[styles.messagesList, { paddingBottom: 10 }]}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListFooterComponent={otherTyping ? (
              <TypingIndicator
                otherUser={otherUser}
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
            <LinearGradient colors={[Colors.bgPrimary, Colors.bgPrimary + '00']} style={StyleSheet.absoluteFill} />
          </Animated.View>

          {/* Gradient fade — bottom */}
          <Animated.View style={[styles.fadeOverlay, styles.fadeBottom, { opacity: fadeBotOp }]} pointerEvents="none">
            <LinearGradient colors={[Colors.bgPrimary + '00', Colors.bgPrimary]} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>

        {/* Reply preview bar */}
        {replyTo && (
          <View style={styles.replyBar}>
            <View style={styles.replyBarPreview}>
              <Text style={styles.replyBarName} numberOfLines={1}>
                {replyTo.senderId === user?.id ? 'Toi' : otherUser.displayName}
              </Text>
              <Text style={styles.replyBarText} numberOfLines={1}>
                {replyTo.type === 'plan' ? 'Plan partagé ✦' : replyTo.content}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Message..."
              placeholderTextColor={Colors.textTertiary}
              value={text}
              onChangeText={handleTextChange}
              multiline
              maxLength={2000}
              blurOnSubmit={false}
              onKeyPress={(e: any) => {
                const key = e.nativeEvent?.key ?? (e as any).key;
                if (key === 'Enter' && !(e.nativeEvent?.shiftKey ?? (e as any).shiftKey)) {
                  e.preventDefault?.();
                  if (text.trim().length > 0) handleSend();
                }
              }}
            />
            {text.trim().length > 0 && (
              <TouchableOpacity onPress={handleSend} style={styles.sendBtn}>
                <Ionicons name="arrow-up" size={18} color={Colors.textOnAccent} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Kebab action sheet */}
      <Modal
        visible={kebabOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setKebabOpen(false)}
      >
        <Pressable style={kebabStyles.backdrop} onPress={() => setKebabOpen(false)}>
          <Pressable style={kebabStyles.sheet} onPress={() => {}}>
            <View style={kebabStyles.header}>
              <Avatar
                initials={otherUser.initials}
                bg={otherUser.avatarBg}
                color={otherUser.avatarColor}
                size="M"
                avatarUrl={otherUser.avatarUrl || undefined}
              />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={kebabStyles.headerName} numberOfLines={1}>
                  {otherUser.displayName}
                </Text>
                <Text style={kebabStyles.headerHandle} numberOfLines={1}>
                  @{otherUser.username}
                </Text>
              </View>
            </View>
            <View style={kebabStyles.divider} />
            <TouchableOpacity
              style={kebabStyles.action}
              onPress={() => {
                setKebabOpen(false);
                navigation.navigate('OtherProfile', { userId: otherUser.userId });
              }}
              activeOpacity={0.6}
            >
              <Ionicons name="person-outline" size={20} color={Colors.textPrimary} />
              <Text style={kebabStyles.actionText}>Voir le profil</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={kebabStyles.action}
              onPress={() => {
                setKebabOpen(false);
                toggleMute(conversationId);
              }}
              activeOpacity={0.6}
            >
              <Ionicons
                name={isMuted ? 'notifications-outline' : 'notifications-off-outline'}
                size={20}
                color={Colors.textPrimary}
              />
              <Text style={kebabStyles.actionText}>
                {isMuted ? 'Réactiver les notifications' : 'Mettre en sourdine'}
              </Text>
            </TouchableOpacity>
            <View style={kebabStyles.divider} />
            <TouchableOpacity
              style={kebabStyles.action}
              onPress={() => {
                setKebabOpen(false);
                Alert.alert(
                  'Supprimer la conversation\u00a0?',
                  'Cette action est définitive et concerne tous les participants.',
                  [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: 'Supprimer',
                      style: 'destructive',
                      onPress: async () => {
                        await deleteConv(conversationId);
                        navigation.goBack();
                      },
                    },
                  ],
                );
              }}
              activeOpacity={0.6}
            >
              <Ionicons name="trash-outline" size={20} color={Colors.error} />
              <Text style={[kebabStyles.actionText, { color: Colors.error }]}>
                Supprimer la conversation
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={kebabStyles.cancel}
              onPress={() => setKebabOpen(false)}
              activeOpacity={0.6}
            >
              <Text style={kebabStyles.cancelText}>Annuler</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

// ═══════════════════════════════════════════════
// Kebab sheet styles (used by header menu)
// ═══════════════════════════════════════════════

const kebabStyles = StyleSheet.create({
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

// ═══════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },

  // ── Header (refondu) ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSubtle,
    backgroundColor: Colors.bgSecondary,
  },
  headerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
  },
  headerAvWrap: { position: 'relative' },
  headerPresenceDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: Colors.success,
    borderWidth: 2,
    borderColor: Colors.bgSecondary,
  },
  headerTxt: { flex: 1, justifyContent: 'center' },
  headerName: {
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  headerStatus: {
    fontSize: 11.5,
    fontFamily: Fonts.bodyMedium,
    marginTop: 1,
    letterSpacing: 0.1,
  },

  // ── Messages list ──
  messagesList: { paddingHorizontal: 10, paddingTop: 10 },

  // ── Date separator pill ──
  dateSeparator: { alignItems: 'center', marginTop: 18, marginBottom: 14 },
  dateSeparatorText: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: Colors.textTertiary,
    backgroundColor: Colors.bgTertiary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    overflow: 'hidden',
  },

  // ── Message wrapper ──
  msgWrapper: { position: 'relative' },

  // ── Swipe reply indicator ──
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

  // ── Message row ──
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  msgRowLeft: { justifyContent: 'flex-start', marginRight: 48 },
  msgRowRight: { justifyContent: 'flex-end', marginLeft: 48 },

  // Avatar spacer (matches Avatar XSM = 24px)
  avatarSpacer: { width: 24 },

  // ── Bubble ──
  bubble: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    paddingBottom: 10,
    overflow: 'visible',
    borderRadius: BUBBLE_R,
  },
  bubblePlanPadding: { padding: 5 },
  msgText: { fontSize: 15, fontFamily: Fonts.body, lineHeight: 20, letterSpacing: -0.1 },

  // ── Reaction overlay ──
  reactionOverlay: {
    flexDirection: 'row',
    gap: 2,
    marginTop: -REACTION_OVERLAP,
    zIndex: 2,
  },
  reactionOverlayLeft: { alignSelf: 'flex-start', paddingLeft: 10 },
  reactionOverlayRight: { alignSelf: 'flex-end', paddingRight: 10 },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.bgSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 24,
    height: REACTION_CHIP_H,
    shadowColor: 'rgba(44,36,32,1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  reactionEmoji: { fontSize: 12.5 },
  reactionCount: {
    fontSize: 10,
    fontFamily: Fonts.bodyBold,
    color: Colors.textSecondary,
  },

  // ── Plan-in-bubble (rich card) ──
  planCard: {
    width: 230,
    borderRadius: 14,
    overflow: 'hidden',
  },
  planHero: {
    width: '100%',
    height: 110,
    position: 'relative',
    justifyContent: 'flex-end',
    padding: 10,
  },
  planHeroFallback: {
    backgroundColor: Colors.terracotta400,
  },
  planHeroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(44,36,32,0.06)',
  },
  planHeroTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(44,36,32,0.55)',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  planHeroTagText: {
    fontSize: 9,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.textOnAccent,
  },
  planBody: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
  planEyebrow: {
    fontSize: 9,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.primary,
  },
  planTitle: {
    fontSize: 15,
    fontFamily: Fonts.displaySemiBold,
    lineHeight: 18,
    letterSpacing: -0.2,
    color: Colors.textPrimary,
    marginTop: 3,
  },
  planAuthor: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    marginTop: 3,
  },
  planAttachedWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  planAttachedMsg: {
    fontSize: 13,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textPrimary,
    lineHeight: 17,
  },

  // ── Quoted reply ──
  quotedReply: {
    borderLeftWidth: 2.5,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: -2,
  },
  quotedReplyMine: { alignSelf: 'flex-end' },
  quotedReplyOther: { alignSelf: 'flex-start' },
  quotedName: {
    fontSize: 10.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  quotedText: {
    fontSize: 12.5,
    fontFamily: Fonts.body,
    marginTop: 2,
    lineHeight: 16,
  },

  // ── Read receipt ──
  readReceipt: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
    paddingRight: 4,
  },
  readReceiptInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  readReceiptText: { fontSize: 10.5, letterSpacing: 0.1 },

  // ── Reaction picker ──
  reactionPicker: {
    position: 'absolute', top: -48,
    flexDirection: 'row', borderRadius: 22,
    paddingHorizontal: 6, paddingVertical: 6,
    shadowColor: 'rgba(44,36,32,1)', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 18, elevation: 6,
    gap: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  reactionPickerLeft: { left: 26 },
  reactionPickerRight: { right: 0 },
  reactionPickerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  reactionPickerEmoji: { fontSize: 22 },
  reactionPickerActive: { fontSize: 26 },

  // ── Time reveal ──
  revealTimeWrap: {
    position: 'absolute', right: 4, top: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'flex-end',
  },
  revealTimeText: { fontSize: 11, fontFamily: Fonts.body, color: Colors.textTertiary },

  // ── Reply bar above input ──
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
    backgroundColor: Colors.bgSecondary,
    gap: 10,
  },
  replyBarPreview: {
    flex: 1,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    paddingLeft: 10,
    paddingVertical: 2,
  },
  replyBarName: {
    fontSize: 11,
    fontFamily: Fonts.bodyBold,
    color: Colors.primary,
    letterSpacing: 0.3,
  },
  replyBarText: {
    fontSize: 12,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // ── Typing indicator ──
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: BUBBLE_R,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Colors.bgSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  typingDot: { width: 7, height: 7, borderRadius: 3.5, opacity: 0.6, backgroundColor: Colors.textTertiary },

  // ── Input bar ──
  inputBar: {
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
    backgroundColor: Colors.bgSecondary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: Colors.bgTertiary,
    minHeight: 38,
  },
  input: {
    flex: 1,
    fontSize: 14.5,
    fontFamily: Fonts.body,
    color: Colors.textPrimary,
    maxHeight: 100,
    paddingVertical: 0,
  },
  sendBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 3,
  },

  // ── Gradient fade overlays ──
  fadeOverlay: { position: 'absolute', left: 0, right: 0, height: FADE_H },
  fadeTop: { top: 0 },
  fadeBottom: { bottom: 0 },
});
