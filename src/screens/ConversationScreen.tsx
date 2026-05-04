import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Keyboard, Image, Animated, PanResponder,
  NativeSyntheticEvent, NativeScrollEvent, Modal, Pressable, Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts } from '../constants';
import { Avatar, GroupMosaicAvatar, AddParticipantsSheet, GroupAlbumSheet, PollComposerSheet, CoPlanInlineVote, CoPlanProposalCard, CoPlanPlacesCard, CoPlanCompactEvent, CoPlanDetailsConfirmedCard, CoPlanResolutionPill, CoPlanStatusBar, FloatingSessionDock, DockParticipant, DoItNowDateSheet, SessionEndedActions } from '../components';
import { useGroupSessionStore } from '../store/groupSessionStore';
import { findDraftByConversationId } from '../services/planDraftService';
import { useAuthStore } from '../store';
import { useChatStore } from '../store/chatStore';
import { useColors } from '../hooks/useColors';
import { ChatMessage, ConversationParticipant, resetUnreadCount, setConversationMeetupAt } from '../services/chatService';
import { createGroupSession } from '../services/planSessionService';
import { fetchPlanById } from '../services/plansService';
import { useDoItNowStore } from '../store/doItNowStore';
import { pickImage } from '../utils';
import { useProofCamera } from '../components/ProofCamera';

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
// Co-plan event grouping helpers
// ═══════════════════════════════════════════════
//
// Two co-plan system events of the SAME kind by the SAME sender within
// a short window are visually folded :
//   • For `coplan_place_added` runs : the run header shows "X a proposé
//     N lieux" once; subsequent rows render as compact lines (icon +
//     name + heart) with no actor label.
//   • For `coplan_availability_set` runs : only the LAST event in the
//     run is shown; earlier ones are hidden entirely (no useful info
//     since "marked dispos" is a state, not a timeline).
//   • For `coplan_place_voted` runs : same treatment as availability
//     (only last event shown — votes are silent in the chat anyway).
//
// Without this, a single user's burst of activity creates a wall of
// near-identical lines that drowns the actual conversation.

const COPLAN_RUN_WINDOW_MS = 90_000; // 90s — matches "burst of activity" intuition

const isCoplanSystemEvent = (msg?: ChatMessage): boolean => {
  if (!msg || msg.type !== 'system') return false;
  return msg.systemEvent?.kind?.startsWith('coplan_') ?? false;
};

const isCoplanSameRun = (a?: ChatMessage, b?: ChatMessage): boolean => {
  if (!a || !b) return false;
  if (!isCoplanSystemEvent(a) || !isCoplanSystemEvent(b)) return false;
  if (a.senderId !== b.senderId) return false;
  if (a.systemEvent?.kind !== b.systemEvent?.kind) return false;
  const dt = Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return dt <= COPLAN_RUN_WINDOW_MS;
};

interface CoplanRunInfo {
  /** True when this row is the FIRST of a same-kind same-sender run. */
  isFirst: boolean;
  /** True when this row is the LAST of a same-kind same-sender run. */
  isLast: boolean;
  /** True when this row is part of a multi-item run (not a singleton). */
  inMultiRun: boolean;
  /** Total events in the run starting from this index forward (only
   *  meaningful when `isFirst` — used for "X a proposé N lieux" copy). */
  forwardCount: number;
}

const computeCoplanRunInfo = (
  msgs: ChatMessage[],
  idx: number,
): CoplanRunInfo => {
  const item = msgs[idx];
  if (!isCoplanSystemEvent(item)) {
    return { isFirst: false, isLast: false, inMultiRun: false, forwardCount: 0 };
  }
  const prev = idx > 0 ? msgs[idx - 1] : undefined;
  const next = idx < msgs.length - 1 ? msgs[idx + 1] : undefined;
  const isFirst = !isCoplanSameRun(prev, item);
  const isLast = !isCoplanSameRun(item, next);

  // Forward count from the FIRST of a run — counts how many in the streak.
  let forwardCount = 0;
  if (isFirst) {
    for (let j = idx; j < msgs.length; j++) {
      if (j === idx || isCoplanSameRun(msgs[j - 1], msgs[j])) {
        forwardCount++;
      } else {
        break;
      }
    }
  }
  return {
    isFirst,
    isLast,
    inMultiRun: forwardCount > 1 || (!isFirst && (isCoplanSameRun(prev, item) || isCoplanSameRun(item, next))),
    forwardCount,
  };
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
// Photo Bubble — respects aspect ratio, caps the max dimensions
// ═══════════════════════════════════════════════

interface PhotoBubbleProps {
  url: string;
  width?: number;
  height?: number;
  caption?: string;
  isMine: boolean;
}

const PHOTO_MAX_W = 220;
const PHOTO_MAX_H = 280;

const PhotoBubble: React.FC<PhotoBubbleProps> = ({ url, width, height, caption, isMine }) => {
  // Default to a portrait-ish frame if dimensions are unknown.
  let renderW = PHOTO_MAX_W;
  let renderH = PHOTO_MAX_H;
  if (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0) {
    const ratio = width / height;
    if (ratio >= 1) {
      // Landscape — cap by width.
      renderW = PHOTO_MAX_W;
      renderH = Math.round(PHOTO_MAX_W / ratio);
      if (renderH > PHOTO_MAX_H) {
        renderH = PHOTO_MAX_H;
        renderW = Math.round(PHOTO_MAX_H * ratio);
      }
    } else {
      // Portrait — cap by height.
      renderH = PHOTO_MAX_H;
      renderW = Math.round(PHOTO_MAX_H * ratio);
      if (renderW > PHOTO_MAX_W) {
        renderW = PHOTO_MAX_W;
        renderH = Math.round(PHOTO_MAX_W / ratio);
      }
    }
  }
  return (
    <View>
      <Image
        source={{ uri: url }}
        style={{
          width: renderW,
          height: renderH,
          borderRadius: 16,
          backgroundColor: Colors.bgTertiary,
        }}
      />
      {!!caption && (
        <Text
          style={{
            fontSize: 13,
            fontFamily: Fonts.body,
            color: isMine ? Colors.textOnAccent : Colors.textPrimary,
            marginTop: 6,
            paddingHorizontal: 4,
            lineHeight: 17,
            maxWidth: renderW,
          }}
        >
          {caption}
        </Text>
      )}
    </View>
  );
};

// ═══════════════════════════════════════════════
// Poll Bubble — shows question + options + live results
// ═══════════════════════════════════════════════

interface PollBubbleProps {
  question: string;
  options: string[];
  votes: Record<string, number>;
  userId: string | undefined;
  isMine: boolean;
  onVote: (optionIndex: number) => void;
}

const PollBubble: React.FC<PollBubbleProps> = ({
  question, options, votes, userId, isMine, onVote,
}) => {
  const totalVotes = Object.keys(votes).length;
  const myVote = userId ? votes[userId] : undefined;
  const counts = options.map((_, i) => Object.values(votes).filter((v) => v === i).length);

  return (
    <View style={{ width: 240, paddingVertical: 2 }}>
      <Text style={[pollBubbleStyles.eyebrow, { color: isMine ? 'rgba(255,248,240,0.7)' : Colors.primary }]}>
        SONDAGE
      </Text>
      <Text style={[pollBubbleStyles.question, { color: isMine ? Colors.textOnAccent : Colors.textPrimary }]}>
        {question}
      </Text>
      <View style={{ gap: 6, marginTop: 10 }}>
        {options.map((opt, i) => {
          const count = counts[i];
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isMyChoice = myVote === i;
          return (
            <TouchableOpacity
              key={i}
              onPress={() => onVote(i)}
              activeOpacity={0.85}
              style={[
                pollBubbleStyles.optionRow,
                isMine
                  ? { backgroundColor: 'rgba(255,248,240,0.12)', borderColor: 'rgba(255,248,240,0.2)' }
                  : { backgroundColor: Colors.bgPrimary, borderColor: Colors.borderSubtle },
                isMyChoice && (isMine
                  ? { borderColor: Colors.textOnAccent }
                  : { borderColor: Colors.primary, backgroundColor: Colors.terracotta50 }),
              ]}
            >
              {/* Progress fill */}
              {totalVotes > 0 && (
                <View
                  style={[
                    pollBubbleStyles.fill,
                    {
                      width: `${pct}%`,
                      backgroundColor: isMine
                        ? 'rgba(255,248,240,0.18)'
                        : isMyChoice
                          ? Colors.terracotta100
                          : Colors.bgTertiary,
                    },
                  ]}
                />
              )}
              <Text
                style={[
                  pollBubbleStyles.optionText,
                  {
                    color: isMine ? Colors.textOnAccent : Colors.textPrimary,
                    fontFamily: isMyChoice ? Fonts.bodySemiBold : Fonts.body,
                  },
                ]}
                numberOfLines={2}
              >
                {opt}
              </Text>
              {totalVotes > 0 && (
                <Text
                  style={[
                    pollBubbleStyles.optionPct,
                    { color: isMine ? 'rgba(255,248,240,0.85)' : Colors.textSecondary },
                  ]}
                >
                  {pct}%
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={[pollBubbleStyles.footer, { color: isMine ? 'rgba(255,248,240,0.65)' : Colors.textTertiary }]}>
        {totalVotes > 0
          ? `${totalVotes} vote${totalVotes > 1 ? 's' : ''}`
          : 'Sois le premier à voter'}
      </Text>
    </View>
  );
};

const pollBubbleStyles = StyleSheet.create({
  eyebrow: {
    fontSize: 9,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  question: {
    fontSize: 15,
    fontFamily: Fonts.displaySemiBold,
    letterSpacing: -0.2,
    lineHeight: 19,
  },
  optionRow: {
    position: 'relative',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth + 0.3,
    minHeight: 38,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  optionText: {
    flex: 1,
    fontSize: 13,
    letterSpacing: -0.05,
  },
  optionPct: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    marginLeft: 8,
  },
  footer: {
    fontSize: 11,
    fontFamily: Fonts.body,
    marginTop: 8,
  },
});

// ═══════════════════════════════════════════════
// Swipeable Message Row
// ═══════════════════════════════════════════════

interface MessageRowProps {
  item: ChatMessage;
  prevMsg: ChatMessage | undefined;
  nextMsg: ChatMessage | undefined;
  userId: string | undefined;
  /** Participant that SENT this message (the visible "other" — avatar, receipt). For DMs this is constant; for groups it varies per message. */
  senderUser: ConversationParticipant | null;
  /** Display group-aware context (show sender name header above bubble on first-in-group). */
  isGroupContext: boolean;
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
  /** Deep-link tap → open Plan detail with the map sheet auto-shown.
   *  Used by the "Plan prêt" timeline card so its destination is
   *  distinct from the regular pinned plan card. */
  onOpenPlanMap: (planId: string) => void;
  onJoinSession: () => void;
  onPhotoPress: (url: string) => void;
  onOpenAlbum: () => void;
  onVotePoll: (messageId: string, optionIndex: number) => void;
  /** Group participants — used to resolve actor names on co-plan system events. */
  participants?: Record<string, ConversationParticipant>;
  /** Run-grouping info for co-plan system events (computed in parent). */
  coplanRun?: CoplanRunInfo;
  /** Linked plan metadata — used by the "Plan prêt" card on
   *  coplan_details_confirmed events to render a tappable preview. Null
   *  when the conv has no plan attached yet (early lifecycle). */
  linkedPlanInfo?: {
    planId: string | null;
    title: string | null;
    cover: string | null;
    meetupAt: string | null;
  } | null;
}

const MessageRow = React.memo<MessageRowProps>(({
  item, prevMsg, nextMsg, userId, senderUser, isGroupContext, C, isLastSent, otherHasRead,
  isPickerTarget, pickerScale, listSlideX,
  onSwipeReply, onDoubleTapLike, onLongPress, onDismissPicker, onReaction,
  onScrollToQuote, onPlanPress, onOpenPlanMap, onJoinSession, onPhotoPress, onOpenAlbum, onVotePoll,
  participants, coplanRun, linkedPlanInfo,
}) => {
  const isMine = item.senderId === userId;
  const showDate = shouldShowDateSeparator(item, prevMsg);
  const myReaction = item.reactions.find((r) => r.userId === userId);
  const hasReply = !!item.replyToId;

  // ── System event ──
  if (item.type === 'system') {
    const ev = item.systemEvent;
    const isCoplan = ev?.kind?.startsWith('coplan_') ?? false;
    const isSessionStart = ev?.kind === 'session_started' && ev.actorId !== userId;
    const isSessionComplete = ev?.kind === 'session_completed';

    // `coplan_place_added` is intercepted by renderItem → <CoPlanPlacesCard>;
    // never reaches this branch.

    // Hide all-but-last for coplan availability/voted runs (noise).
    if (isCoplan && coplanRun && !coplanRun.isLast) {
      return showDate ? (
        <View style={styles.dateSeparator}>
          <Text style={styles.dateSeparatorText}>{formatDateSeparator(item.createdAt)}</Text>
        </View>
      ) : null;
    }

    // ── Resolution pill for proposal outcomes ──
    if (ev?.kind === 'coplan_proposal_applied' || ev?.kind === 'coplan_proposal_rejected') {
      return (
        <View>
          {showDate && (
            <View style={styles.dateSeparator}>
              <Text style={styles.dateSeparatorText}>{formatDateSeparator(item.createdAt)}</Text>
            </View>
          )}
          <CoPlanResolutionPill
            variant={ev.kind === 'coplan_proposal_applied' ? 'applied' : 'rejected'}
            subject={ev.payload}
          />
        </View>
      );
    }

    // ── "Plan prêt" preview card ──
    // Surfaced for coplan_details_confirmed — rich timeline preview with
    // numbered pins + travel pills + arrival times. Tap → deep-link to
    // the MAP sheet (different destination than the pinned plan card,
    // which opens PlanDetail without the map). The two widgets stop
    // being visually + functionally redundant.
    if (ev?.kind === 'coplan_details_confirmed') {
      const linkedPlanId = linkedPlanInfo?.planId ?? null;
      const linkedPlanTitle = linkedPlanInfo?.title ?? null;
      const meetupAt = linkedPlanInfo?.meetupAt ?? null;
      const onPressMap = linkedPlanId
        ? () => onOpenPlanMap(linkedPlanId)
        : undefined;
      return (
        <View>
          {showDate && (
            <View style={styles.dateSeparator}>
              <Text style={styles.dateSeparatorText}>{formatDateSeparator(item.createdAt)}</Text>
            </View>
          )}
          <CoPlanDetailsConfirmedCard
            message={item}
            participants={participants}
            planId={linkedPlanId}
            planTitle={linkedPlanTitle}
            meetupAt={meetupAt}
            onPressMap={onPressMap}
          />
        </View>
      );
    }

    // ── Compact event ──
    // All non-bubble system events are rendered in the compact format
    // (avatar + actor + verb + timestamp). This includes session_started
    // and session_completed — the rejoin CTA moved to the floating dock,
    // and the album button moves to the kebab menu / pinned card; the
    // event itself is a clean audit-log line, like coplan_member_joined.
    const COMPACT_KINDS = new Set([
      'group_created', 'joined', 'left', 'renamed',
      'session_started', 'session_completed', 'session_advanced',
    ]);
    const useCompact = isCoplan || (ev?.kind && COMPACT_KINDS.has(ev.kind));
    if (useCompact) {
      return (
        <View>
          {showDate && (
            <View style={styles.dateSeparator}>
              <Text style={styles.dateSeparatorText}>{formatDateSeparator(item.createdAt)}</Text>
            </View>
          )}
          <CoPlanCompactEvent message={item} participants={participants} />
          {/* When a session_completed event lands, surface the per-user
              archive action card right under the compact line. Each
              member decides individually : "Archiver" (the conv
              disappears from THEIR list only) or "Garder" (no-op,
              card collapses locally). */}
          {ev?.kind === 'session_completed' && userId && item.conversationId && (
            <SessionEndedActions conversationId={item.conversationId} userId={userId} />
          )}
        </View>
      );
    }

    // Fallback : centered gray italic line (sessions, etc.)
    const text = item.content || renderSystemEventText(ev, participants);
    return (
      <View>
        {showDate && (
          <View style={styles.dateSeparator}>
            <Text style={styles.dateSeparatorText}>{formatDateSeparator(item.createdAt)}</Text>
          </View>
        )}
        <View style={styles.systemEventWrap}>
          <Text style={styles.systemEventText}>{text}</Text>
          {isSessionStart && (
            <TouchableOpacity
              style={styles.systemJoinBtn}
              onPress={onJoinSession}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-forward-circle" size={14} color={Colors.textOnAccent} />
              <Text style={styles.systemJoinText}>Rejoindre la session</Text>
            </TouchableOpacity>
          )}
          {isSessionComplete && (
            <TouchableOpacity
              style={[styles.systemJoinBtn, { backgroundColor: Colors.textPrimary }]}
              onPress={onOpenAlbum}
              activeOpacity={0.85}
            >
              <Ionicons name="images" size={14} color={Colors.textOnAccent} />
              <Text style={styles.systemJoinText}>Voir l{'\u2019'}album</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // ── Co-plan proposal card: rich card with live vote count ──
  if (item.type === 'coplan_proposal') {
    const proposerName = participants?.[item.senderId]?.displayName?.split(' ')[0] || 'Quelqu\'un';
    return (
      <View>
        {showDate && (
          <View style={styles.dateSeparator}>
            <Text style={styles.dateSeparatorText}>{formatDateSeparator(item.createdAt)}</Text>
          </View>
        )}
        <CoPlanProposalCard
          draftId={item.proposalDraftId!}
          proposalId={item.proposalId!}
          proposalSubject={item.proposalSubject || ''}
          participantCount={participants ? Object.keys(participants).length : 1}
          proposerName={proposerName}
          voterUserId={userId!}
          isProposer={item.senderId === userId}
        />
      </View>
    );
  }

  // ── Group: show sender name above bubble for the FIRST message of a run by a non-self sender ──
  const showSenderLabel =
    isGroupContext && !isMine && senderUser &&
    (prevMsg == null || prevMsg.senderId !== item.senderId || prevMsg.type === 'system');

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
          {!isMine && showAvatar && senderUser && (
            <Avatar initials={senderUser.initials} bg={senderUser.avatarBg} color={senderUser.avatarColor} size="XSM" avatarUrl={senderUser.avatarUrl ?? undefined} />
          )}
          {!isMine && !showAvatar && <View style={styles.avatarSpacer} />}

          <TouchableOpacity
            onPress={handlePress}
            onLongPress={handleLongPress}
            activeOpacity={0.9}
            delayLongPress={400}
            style={{ maxWidth: '78%' }}
          >
            {/* Group sender label — shows first name above the first bubble of a run */}
            {showSenderLabel && senderUser && (
              <Text style={styles.groupSenderLabel}>{senderUser.displayName}</Text>
            )}
            {/* Quoted reply preview — colors flip based on bubble side */}
            {hasReply && (
              <TouchableOpacity
                onPress={() => item.replyToId && onScrollToQuote(item.replyToId)}
                style={[
                  styles.quotedReply,
                  isMine ? styles.quotedReplyMine : styles.quotedReplyOther,
                  isMine
                    ? {
                        // Deeper terracotta from the same palette — feels like a "cuite plus profonde"
                        // ceramic plate nested inside the main bubble. Stays in the warm DNA.
                        backgroundColor: Colors.terracotta700,
                        borderLeftColor: Colors.terracotta200,
                      }
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
                  {item.replyToSenderId === userId ? 'Toi' : (senderUser?.displayName ?? '')}
                </Text>
                <Text
                  style={[
                    styles.quotedText,
                    {
                      color: isMine ? Colors.textOnAccent : Colors.textSecondary,
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
              // Plan / photo / poll messages get a tighter padding so the inner card breathes
              (item.type === 'plan' || item.type === 'photo' || item.type === 'poll') && styles.bubblePlanPadding,
              // Photo bubbles have no bg / border — the image fills.
              item.type === 'photo' && { backgroundColor: 'transparent', borderWidth: 0 },
              // Poll bubbles keep the mine/other bg but add more horizontal padding.
              item.type === 'poll' && { paddingHorizontal: 12, paddingVertical: 10 },
              bubbleRadii,
              // When there's a quoted reply on top, flatten the bubble's top corners
              // so the preview + bubble merge into a single rounded block.
              hasReply && { borderTopLeftRadius: 6, borderTopRightRadius: 6 },
            ]}>
              {item.type === 'photo' ? (
                <TouchableOpacity
                  activeOpacity={0.92}
                  onPress={() => item.photoUrl && onPhotoPress(item.photoUrl)}
                >
                  <PhotoBubble
                    url={item.photoUrl!}
                    width={item.photoWidth}
                    height={item.photoHeight}
                    caption={item.content}
                    isMine={isMine}
                  />
                </TouchableOpacity>
              ) : item.type === 'poll' ? (
                <PollBubble
                  question={item.pollQuestion || item.content}
                  options={item.pollOptions || []}
                  votes={item.pollVotes || {}}
                  userId={userId}
                  isMine={isMine}
                  onVote={(idx) => onVotePoll(item.id, idx)}
                />
              ) : item.type === 'plan' ? (
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

            {/* Read receipt — only under last sent message by me (DM only — noisy in groups) */}
            {isMine && isLastSent && !isGroupContext && (
              <View style={styles.readReceipt}>
                {otherHasRead && senderUser ? (
                  <View style={styles.readReceiptInner}>
                    <Avatar initials={senderUser.initials} bg={senderUser.avatarBg} color={senderUser.avatarColor} size="XS" avatarUrl={senderUser.avatarUrl ?? undefined} />
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

/** Fallback text for system events missing a content string. */
const renderSystemEventText = (
  ev: ChatMessage['systemEvent'] | undefined,
  participants?: Record<string, ConversationParticipant>,
): string => {
  if (!ev) return '';
  // First-name resolution for events that surface an actor.
  const firstNameOf = (uid?: string): string => {
    if (!uid || !participants) return 'Quelqu\'un';
    const p = participants[uid];
    return p ? p.displayName.split(' ')[0] : 'Quelqu\'un';
  };
  switch (ev.kind) {
    case 'group_created':
      return `Groupe « ${ev.payload || ''} » créé`;
    case 'joined':
      return `Un participant a rejoint le groupe`;
    case 'left':
      return `Un participant a quitté le groupe`;
    case 'renamed':
      return `Groupe renommé « ${ev.payload || ''} »`;
    case 'session_started':
      return `La session a démarré`;
    case 'session_completed':
      return `Session terminée`;
    case 'session_advanced': {
      const parts = (ev.payload || '').split('|');
      const place = parts[0] || '';
      const step = parts[1];
      const total = parts[2];
      if (place && step && total) {
        return `${firstNameOf(ev.actorId)} est passé à ${place} (étape ${step}/${total})`;
      }
      return place ? `${firstNameOf(ev.actorId)} est passé à ${place}` : '';
    }
    // ── Co-plan workspace mirror events ──
    case 'coplan_place_added':
      return `${firstNameOf(ev.actorId)} a proposé ${ev.payload || 'un lieu'}`;
    case 'coplan_place_removed':
      return `${firstNameOf(ev.actorId)} a retiré ${ev.payload || 'un lieu'}`;
    case 'coplan_place_voted':
      return `${firstNameOf(ev.actorId)} a voté pour ${ev.payload || 'un lieu'}`;
    case 'coplan_availability_set':
      return `${firstNameOf(ev.actorId)} a marqué ${ev.payload || 'ses dispos'}`;
    case 'coplan_meetup_set':
      return ev.payload === 'sans date'
        ? `${firstNameOf(ev.actorId)} a retiré la date`
        : `${firstNameOf(ev.actorId)} a fixé la date · ${ev.payload || ''}`;
    case 'coplan_details_confirmed':
      return `📋 ${firstNameOf(ev.actorId)} a confirmé les détails — ${ev.payload || ''}`;
    case 'coplan_locked':
      return `Plan lancé : ${ev.payload || ''}`;
    case 'coplan_proposal_applied':
      return `✓ Proposition adoptée : ${ev.payload || ''}`;
    case 'coplan_proposal_rejected':
      return `✕ Proposition rejetée${ev.payload ? ` : ${ev.payload}` : ''}`;
    default:
      return '';
  }
};

/** Compact meetup date formatter for group header sub-line. */
const formatMeetupShort = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `ce soir \u00b7 ${time}`;
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === tomorrow.toDateString()) return `demain \u00b7 ${time}`;
  const diffDays = Math.floor((d.getTime() - now.getTime()) / 86400000);
  if (diffDays >= 0 && diffDays < 7) {
    return `${d.toLocaleDateString('fr-FR', { weekday: 'long' })} \u00b7 ${time}`;
  }
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
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

  const { conversationId, otherUser: routeOtherUser } = route.params as {
    conversationId: string;
    otherUser: ConversationParticipant | null;
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
  const addToGroup = useChatStore((s) => s.addToGroup);
  const leaveGroupConv = useChatStore((s) => s.leaveGroupConv);
  const renameGroupConv = useChatStore((s) => s.renameGroupConv);
  const sendPhoto = useChatStore((s) => s.sendPhoto);
  const sendPoll = useChatStore((s) => s.sendPoll);
  const votePoll = useChatStore((s) => s.votePoll);

  // Active conversation (looked up once, used for status + kebab actions)
  const activeConv = useMemo(
    () => conversations.find((c) => c.id === conversationId) || null,
    [conversations, conversationId],
  );

  // ── Linked co-plan draft detection ──
  // The "Plan" lens-switcher tab needs to know if this conv is attached to
  // an active draft. We prefer the denormalized `linkedDraftId` on the conv
  // (set by the planDraftService when seeding the conv at draft time), and
  // fall back to a one-shot query for legacy convs without that field.
  // The query is wrapped in try/catch in the service — a failure (rules,
  // network) just means the switcher tab won't appear, not that the conv
  // breaks.
  const [linkedDraftId, setLinkedDraftId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Reset on conv change.
    setLinkedDraftId(null);
    if (!activeConv || !user?.id) return;
    // Locked plan? No "Brouillon" tab — the plan is a real Plan now.
    if (activeConv.linkedPlanId) return;
    if (activeConv.linkedDraftId) {
      setLinkedDraftId(activeConv.linkedDraftId);
      return;
    }
    // Legacy fallback: query plan_drafts. Constrained by participants
    // to satisfy the standard rule pattern.
    (async () => {
      try {
        const draft = await findDraftByConversationId(activeConv.id, user.id);
        if (!cancelled && draft) setLinkedDraftId(draft.id);
      } catch (err) {
        // Already swallowed in the service — extra safety here.
        if (__DEV__) console.warn('[ConversationScreen] linked-draft lookup error:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [activeConv?.id, activeConv?.linkedDraftId, activeConv?.linkedPlanId, user?.id]);

  const isGroup = activeConv?.isGroup === true;

  // For groups, the single "otherUser" concept doesn't apply — we pick the primary other
  // participant for DMs and use null for groups (derived per-message via senderParticipant).
  const otherUser: ConversationParticipant | null = useMemo(() => {
    if (isGroup) return null;
    if (routeOtherUser) return routeOtherUser;
    if (activeConv && user?.id) {
      const otherId = activeConv.participants.find((id) => id !== user.id);
      if (otherId) return activeConv.participantDetails[otherId] || null;
    }
    return null;
  }, [isGroup, routeOtherUser, activeConv, user?.id]);

  // Derive read status from conversation-level unreadCount (DM only — groups use per-participant signals)
  const otherHasRead = useMemo(() => {
    if (!otherUser || isGroup) return false;
    const conv = conversations.find((c) => c.id === conversationId);
    return (conv?.unreadCount[otherUser.userId] || 0) === 0;
  }, [conversations, conversationId, otherUser, isGroup]);

  // Is the other user "fresh" (last seen < 5min) — approximate presence (DM only)
  const otherLastSeenAt = otherUser ? activeConv?.lastReadAt?.[otherUser.userId] : undefined;
  const otherIsFresh = useMemo(() => {
    if (!otherLastSeenAt) return false;
    return Date.now() - new Date(otherLastSeenAt).getTime() < PRESENCE_FRESH_MS;
  }, [otherLastSeenAt]);

  // ── Group derivations ──
  const otherParticipants = useMemo(() => {
    if (!activeConv || !user?.id || !isGroup) return [];
    return activeConv.participants
      .filter((id) => id !== user.id)
      .map((id) => activeConv.participantDetails[id])
      .filter(Boolean);
  }, [activeConv, user?.id, isGroup]);

  const groupDisplayName = useMemo(() => {
    if (!isGroup || !activeConv) return '';
    return activeConv.groupName || activeConv.linkedPlanTitle || 'Groupe';
  }, [isGroup, activeConv]);

  // Any non-self participant currently typing (group awareness)
  const groupTypingName = useMemo(() => {
    if (!isGroup || !activeConv) return null;
    const now = Date.now();
    for (const pid of activeConv.participants) {
      if (pid === user?.id) continue;
      const ts = (activeConv.typing || {})[pid] || 0;
      if (ts > 0 && now - ts < 5000) {
        const p = activeConv.participantDetails[pid];
        if (p) return p.displayName.split(' ')[0];
      }
    }
    return null;
  }, [isGroup, activeConv, user?.id]);

  // Periodic re-render so status freshness updates without new data
  const [, setStatusTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStatusTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Kebab action sheet + group sub-sheets
  const [kebabOpen, setKebabOpen] = useState(false);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [renameSheetOpen, setRenameSheetOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [albumOpen, setAlbumOpen] = useState(false);

  // Only the creator can hard-delete a group — others leave.
  const isGroupCreator = isGroup && activeConv?.createdBy === user?.id;

  // ── Session handlers (multi-user DoItNow) ──
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  // Proof Camera — replaces the system picker for in-chat photo
  // capture. Same imperative pattern used in DoItNow's souvenir card.
  const proofCamera = useProofCamera();
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [pollComposerOpen, setPollComposerOpen] = useState(false);
  // Date sheet — used to fix the "Do it now à plusieurs" start time on
  // a group conv. Tappable from the pinned plan card (the calendar line).
  const [dateSheetOpen, setDateSheetOpen] = useState(false);

  // ── Meetup date handlers ──
  // Persists meetupAt on the conversation + posts a system event so the
  // whole group sees the change in the chat. Reuses the chat-service
  // helper which mirrors the pattern of every other group mutation.
  const handleSetMeetupAt = useCallback(async (iso: string) => {
    if (!user || !conversationId) return;
    const actor: ConversationParticipant = activeConv?.participantDetails?.[user.id] || {
      userId: user.id,
      displayName: user.displayName,
      username: user.username,
      avatarUrl: user.avatarUrl || null,
      avatarBg: user.avatarBg,
      avatarColor: user.avatarColor,
      initials: user.initials,
    };
    await setConversationMeetupAt(conversationId, iso, actor);
  }, [user, conversationId, activeConv?.participantDetails]);

  const handleClearMeetupAt = useCallback(async () => {
    if (!user || !conversationId) return;
    const actor: ConversationParticipant = activeConv?.participantDetails?.[user.id] || {
      userId: user.id,
      displayName: user.displayName,
      username: user.username,
      avatarUrl: user.avatarUrl || null,
      avatarBg: user.avatarBg,
      avatarColor: user.avatarColor,
      initials: user.initials,
    };
    await setConversationMeetupAt(conversationId, null, actor);
  }, [user, conversationId, activeConv?.participantDetails]);
  // Track focus on the message input — used to hide the floating
  // session dock while the user is typing (no CTA noise mid-message).
  const [isInputFocused, setIsInputFocused] = useState(false);

  // ── Subscribe to the active session (when one is running on this conv)
  // so the floating session dock can show real "who's joined" presence
  // without an extra query. Idempotent : if the user navigates to
  // DoItNow which also observes the same session, the second call is
  // a no-op (store-level dedup).
  const observeSession = useGroupSessionStore((s) => s.observeSession);
  const stopObservingSession = useGroupSessionStore((s) => s.stopObserving);
  const activeGroupSession = useGroupSessionStore((s) => s.activeSession);
  useEffect(() => {
    if (!activeConv?.activeSessionId || !user?.id) return;
    observeSession(activeConv.activeSessionId, user.id);
    return () => stopObservingSession();
  }, [activeConv?.activeSessionId, user?.id, observeSession, stopObservingSession]);

  // Build the "others in session" list for the dock label.
  const dockOthers: DockParticipant[] = useMemo(() => {
    if (!activeGroupSession || !user?.id) return [];
    return Object.values(activeGroupSession.participants)
      .filter((p) => p.userId !== user.id)
      .map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        initials: p.initials,
        avatarUrl: p.avatarUrl ?? null,
        avatarBg: p.avatarBg,
        avatarColor: p.avatarColor,
      }));
  }, [activeGroupSession, user?.id]);

  // Per-user gate : has the current user already finished THIS session?
  // Once finished, the FloatingDock + Rejoindre + "Démarrer la session"
  // affordances all hide for them — the parcours is over for them
  // even if some teammates are still walking the route.
  const isMeFinishedInActiveSession = useMemo(() => {
    if (!activeGroupSession || !user?.id) return false;
    return !!activeGroupSession.participants?.[user.id]?.finishedAt;
  }, [activeGroupSession, user?.id]);

  const handlePickPhoto = useCallback(async () => {
    setAttachMenuOpen(false);
    if (isUploadingPhoto) return;
    try {
      const picked = await proofCamera.open();
      if (!picked) return;
      setIsUploadingPhoto(true);
      await sendPhoto({
        imageDataUrl: picked.dataUrl,
        width: picked.width,
        height: picked.height,
        sessionId: activeConv?.activeSessionId || undefined,
      });
    } catch (err) {
      console.warn('[ConversationScreen] photo upload error:', err);
    } finally {
      setIsUploadingPhoto(false);
    }
  }, [isUploadingPhoto, sendPhoto, activeConv?.activeSessionId, proofCamera]);

  const handleStartSession = useCallback(async () => {
    if (!user?.id || !activeConv?.linkedPlanId || isStartingSession) return;

    // ── Gate : si le RDV est dans le futur (>15min), on n'allume pas la
    // session live tout de suite. On envoie l'utilisateur dans la
    // SALLE D'ATTENTE qui montre un countdown + un aperçu du plan + un
    // bouton dev pour override. La salle d'attente créera la session
    // elle-même quand l'utilisateur clique "Commencer maintenant" ou
    // quand le countdown arrive à zéro.
    //
    // Le seuil 15min absorbe les petits décalages d'horloge sans
    // bloquer un démarrage légitime à l'heure pile.
    const meetupISO = activeConv.meetupAt;
    const meetupMs = meetupISO ? new Date(meetupISO).getTime() : NaN;
    const isFutureMeetup = Number.isFinite(meetupMs) && (meetupMs - Date.now()) > 15 * 60 * 1000;
    if (isFutureMeetup) {
      navigation.navigate('WaitingRoom', {
        planId: activeConv.linkedPlanId,
        conversationId,
        meetupAt: meetupISO ?? null,
      });
      return;
    }

    setIsStartingSession(true);
    try {
      const plan = await fetchPlanById(activeConv.linkedPlanId);
      if (!plan) {
        setIsStartingSession(false);
        return;
      }
      const creator: ConversationParticipant = activeConv.participantDetails[user.id] || {
        userId: user.id,
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl || null,
        avatarBg: user.avatarBg,
        avatarColor: user.avatarColor,
        initials: user.initials,
      };
      const sessionId = await createGroupSession({
        plan: {
          id: plan.id,
          title: plan.title,
          coverPhoto: activeConv.linkedPlanCover ?? null,
          placeIds: plan.places.map((p) => p.id),
        },
        conversationId: conversationId,
        creator,
      });
      // Pre-populate the local doItNowStore BEFORE navigating so DoItNow
      // doesn't need to bootstrap on mount (avoids hooks-order violation
      // from its early `if (!session) return null;` guard).
      useDoItNowStore.getState().startSession(plan, 'walking', user.id);
      navigation.navigate('DoItNow', {
        planId: plan.id,
        sessionId,
        conversationId: conversationId,
      });
    } catch (err) {
      console.warn('[ConversationScreen] start session error:', err);
    } finally {
      setIsStartingSession(false);
    }
  }, [user, activeConv, conversationId, isStartingSession, navigation]);

  const handleJoinSession = useCallback(async () => {
    if (!user?.id || !activeConv?.activeSessionId || !activeConv.linkedPlanId) return;
    // Per-user gate : if I've already finished this session, I can't
    // rejoin — the parcours is over for me regardless of teammates.
    if (isMeFinishedInActiveSession) return;
    // Fetch the plan + pre-populate the local doItNowStore BEFORE navigating —
    // same rationale as handleStartSession (avoids the DoItNowScreen
    // hooks-order edge case).
    try {
      const plan = await fetchPlanById(activeConv.linkedPlanId);
      if (!plan) return;
      useDoItNowStore.getState().startSession(plan, 'walking', user.id);
      navigation.navigate('DoItNow', {
        planId: activeConv.linkedPlanId,
        sessionId: activeConv.activeSessionId,
        conversationId: conversationId,
      });
    } catch (err) {
      console.warn('[ConversationScreen] join session error:', err);
    }
  }, [user, activeConv, conversationId, navigation, isMeFinishedInActiveSession]);

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
  // Two cases :
  //   1. First time we open this conv (or switch to a new one) → schedule
  //      MULTIPLE scrollToEnd attempts so the bottom shows even if the
  //      ListHeaderComponent / images / pinned card take a few frames
  //      to settle. Without these retries, very long convs landed at
  //      the top — bad UX. No animation here, we just want to start
  //      at the bottom on entry.
  //   2. Same conv, new message arrives → single animated scroll to
  //      bottom (nice "fly-in" feel for live messages).
  const initialScrollConvIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (messages.length === 0) return;
    const isFirstLoadForThisConv = initialScrollConvIdRef.current !== conversationId;
    if (isFirstLoadForThisConv) {
      initialScrollConvIdRef.current = conversationId;
      const timeouts: ReturnType<typeof setTimeout>[] = [];
      [60, 200, 500, 1000].forEach((delay) => {
        timeouts.push(setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }, delay));
      });
      return () => timeouts.forEach(clearTimeout);
    }
    const t = setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
    return () => clearTimeout(t);
  }, [messages.length, conversationId]);

  // ── Text change → typing ──
  const handleTextChange = useCallback((val: string) => {
    setText(val);
    if (val.trim().length > 0) setTypingStore(true);
  }, [setTypingStore]);

  // ── Send ──
  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    // Skip system messages — they are not quoteable.
    const reply = replyTo && replyTo.type !== 'system' ? {
      id: replyTo.id,
      senderId: replyTo.senderId,
      content: replyTo.type === 'plan' ? `\ud83d\udccd ${replyTo.planTitle || 'Plan'}` : replyTo.content,
      type: replyTo.type as 'text' | 'plan' | 'photo' | 'poll',
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

  // Deep-link variant — opens PlanDetail with the map sheet auto-shown.
  // Used by the "Plan prêt" timeline card so its tap destination is
  // distinct from the regular pinned plan card (which lands on the
  // overview without the map).
  const handleOpenPlanMap = useCallback((planId: string) => {
    navigation.navigate('PlanDetail', { planId, openMap: true });
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

    // For groups, resolve the sender for this specific message (may differ per row).
    // For DMs, fall back to the constant otherUser.
    const senderForThisMsg: ConversationParticipant | null = isGroup
      ? (activeConv?.participantDetails[item.senderId] || null)
      : otherUser;

    // Compute co-plan run-grouping info — used by MessageRow to fold
    // consecutive same-kind same-sender events into a single visual block.
    const coplanRun = computeCoplanRunInfo(msgs, index);

    // ── Co-plan place-added run : render as ONE coherent card ──
    // When the current event is a `coplan_place_added`:
    //   • If it's the FIRST of a run, slice msgs[idx, idx+forwardCount]
    //     and render a `CoPlanPlacesCard` listing all of them.
    //   • If it's NOT first (follower), return null — the card already
    //     covers it. We still preserve the date separator if needed.
    if (item.type === 'system' && item.systemEvent?.kind === 'coplan_place_added') {
      const showDate = shouldShowDateSeparator(item, index > 0 ? msgs[index - 1] : undefined);
      if (coplanRun.isFirst) {
        const runLength = Math.max(1, coplanRun.forwardCount || 1);
        const runEvents = msgs.slice(index, index + runLength);
        return (
          <View>
            {showDate && (
              <View style={styles.dateSeparator}>
                <Text style={styles.dateSeparatorText}>{formatDateSeparator(item.createdAt)}</Text>
              </View>
            )}
            <CoPlanPlacesCard
              events={runEvents}
              participants={activeConv?.participantDetails}
              voterUserId={user?.id}
            />
          </View>
        );
      }
      // Follower row — already inside the card above.
      return showDate ? (
        <View style={styles.dateSeparator}>
          <Text style={styles.dateSeparatorText}>{formatDateSeparator(item.createdAt)}</Text>
        </View>
      ) : null;
    }

    return (
    <MessageRow
      item={item}
      prevMsg={index > 0 ? msgs[index - 1] : undefined}
      nextMsg={effectiveNext}
      userId={user?.id}
      senderUser={senderForThisMsg}
      isGroupContext={isGroup}
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
      onOpenPlanMap={handleOpenPlanMap}
      onJoinSession={handleJoinSession}
      onPhotoPress={setLightboxUrl}
      onOpenAlbum={() => setAlbumOpen(true)}
      onVotePoll={votePoll}
      participants={activeConv?.participantDetails}
      coplanRun={coplanRun}
      linkedPlanInfo={activeConv ? {
        planId: activeConv.linkedPlanId ?? null,
        title: activeConv.linkedPlanTitle ?? null,
        cover: activeConv.linkedPlanCover ?? null,
        meetupAt: activeConv.meetupAt ?? null,
      } : null}
    />
    );
  }, [user?.id, otherUser, otherTyping, C, lastSentMsgId, otherHasRead, pickerMsgId, pickerScale, listSlideX, isGroup, activeConv, handleSwipeReply, handleDoubleTapLike, handleLongPressOpen, handleDismissPicker, handleReaction, handleScrollToQuote, handlePlanPress, handleOpenPlanMap, handleJoinSession, votePoll]);

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

        {isGroup ? (
          <TouchableOpacity
            style={styles.headerCenter}
            onPress={() => setKebabOpen(true)}
            activeOpacity={0.7}
          >
            <GroupMosaicAvatar
              participants={otherParticipants.map((p) => ({
                initials: p.initials,
                avatarBg: p.avatarBg,
                avatarColor: p.avatarColor,
                avatarUrl: p.avatarUrl,
              }))}
              size={36}
              borderColor={Colors.bgSecondary}
            />
            <View style={styles.headerTxt}>
              <Text style={styles.headerName} numberOfLines={1}>
                {groupDisplayName}
              </Text>
              {groupTypingName ? (
                <Text style={[styles.headerStatus, { color: Colors.primary }]} numberOfLines={1}>
                  {groupTypingName} écrit{'\u2026'}
                </Text>
              ) : (
                <Text style={[styles.headerStatus, { color: Colors.textTertiary }]} numberOfLines={1}>
                  {activeConv?.participants.length ?? 0} participants
                  {activeConv?.meetupAt ? `  \u00b7  ${formatMeetupShort(activeConv.meetupAt)}` : ''}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        ) : otherUser ? (
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
                avatarUrl={otherUser.avatarUrl ?? undefined}
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
        ) : (
          <View style={styles.headerCenter} />
        )}

        <TouchableOpacity
          onPress={() => setKebabOpen(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.headerIconBtn}
          activeOpacity={0.6}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* ── Co-plan status widget ──
          Sticky just below the header — shows the live status of the
          linked draft (places, dispos, pending modifs) and exposes the
          two main shortcuts : "Modifier" → workspace, and a tap on
          "X modif en attente" → scroll to the freshest pending card. */}
      {linkedDraftId && (
        <CoPlanStatusBar
          draftId={linkedDraftId}
          onOpenWorkspace={() => navigation.navigate('CoPlanWorkspace', { draftId: linkedDraftId })}
          onJumpToPendingProposal={(proposalId) => {
            const idx = messagesRef.current.findIndex(
              (m) => m.type === 'coplan_proposal' && m.proposalId === proposalId,
            );
            if (idx >= 0 && flatListRef.current) {
              try {
                flatListRef.current.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
              } catch {
                // scrollToIndex can throw on virtualized lists — fall back to scrollToOffset.
                flatListRef.current.scrollToEnd({ animated: true });
              }
            }
          }}
        />
      )}

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
            ListHeaderComponent={isGroup && activeConv?.linkedPlanId ? (
              <View style={styles.pinnedPlanWrap}>
                <TouchableOpacity
                  style={styles.pinnedPlanCard}
                  onPress={() => navigation.navigate('PlanDetail', { planId: activeConv.linkedPlanId! })}
                  activeOpacity={0.85}
                >
                  {activeConv.linkedPlanCover ? (
                    <Image source={{ uri: activeConv.linkedPlanCover }} style={styles.pinnedPlanCover} />
                  ) : (
                    <View style={[styles.pinnedPlanCover, { backgroundColor: Colors.terracotta400 }]} />
                  )}
                  <View style={styles.pinnedPlanBody}>
                    <Text style={styles.pinnedPlanEyebrow}>PLAN ÉPINGLÉ</Text>
                    <Text style={styles.pinnedPlanTitle} numberOfLines={2}>
                      {activeConv.linkedPlanTitle || 'Plan'}
                    </Text>
                    <View style={styles.pinnedPlanMeta}>
                      {/* Calendar line — tappable to set/change the date
                          UNLESS the session is locked in :
                            • activeSessionId → un parcours tourne, la
                              date est figée à "maintenant"
                            • lastSessionCompletedAt → la session est
                              terminée, plus rien à modifier
                          Dans ces deux cas la ligne reste affichée mais
                          devient non-cliquable (et le ton terracotta est
                          remplacé par le gris secondaire pour ne plus
                          inviter à l'action). */}
                      {(() => {
                        const dateLocked = !!activeConv.activeSessionId || !!activeConv.lastSessionCompletedAt;
                        if (dateLocked) {
                          return (
                            <View style={styles.pinnedPlanMetaPressable}>
                              <Ionicons
                                name="calendar-outline"
                                size={11}
                                color={Colors.textSecondary}
                              />
                              <Text style={styles.pinnedPlanMetaText}>
                                {activeConv.meetupAt ? formatMeetupShort(activeConv.meetupAt) : 'Date à fixer'}
                              </Text>
                            </View>
                          );
                        }
                        return (
                          <TouchableOpacity
                            onPress={(e) => {
                              // RN-Web : stopPropagation so the parent card
                              // doesn't navigate to PlanDetail when the user
                              // taps the date line.
                              (e as any).stopPropagation?.();
                              setDateSheetOpen(true);
                            }}
                            hitSlop={{ top: 6, bottom: 6, left: 4, right: 8 }}
                            style={styles.pinnedPlanMetaPressable}
                            activeOpacity={0.6}
                          >
                            <Ionicons
                              name="calendar-outline"
                              size={11}
                              color={activeConv.meetupAt ? Colors.textSecondary : Colors.primary}
                            />
                            <Text
                              style={[
                                styles.pinnedPlanMetaText,
                                !activeConv.meetupAt && { color: Colors.primary, fontFamily: Fonts.bodySemiBold },
                              ]}
                            >
                              {activeConv.meetupAt ? formatMeetupShort(activeConv.meetupAt) : 'Date à fixer'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })()}
                      <Text style={styles.pinnedPlanMetaSep}>·</Text>
                      <Ionicons name="people-outline" size={11} color={Colors.textSecondary} />
                      <Text style={styles.pinnedPlanMetaText}>
                        {activeConv.participants.length} amis
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
                </TouchableOpacity>
                {/* Session CTA in the pinned card — only "Démarrer" remains
                    here. The "Rejoindre" affordance for an ACTIVE session
                    moved to the FloatingSessionDock above the input bar
                    (less competing with the pinned card for attention,
                    closer to the thumb, carries social presence). */}
                {!activeConv.activeSessionId && !activeConv.lastSessionCompletedAt && (
                  <TouchableOpacity
                    style={[styles.sessionStartBtn, { opacity: isStartingSession ? 0.6 : 1 }]}
                    onPress={handleStartSession}
                    activeOpacity={0.85}
                    disabled={isStartingSession}
                  >
                    <Ionicons name="compass" size={16} color={Colors.primary} />
                    <Text style={styles.sessionStartText}>
                      {isStartingSession ? 'Démarrage…' : 'Démarrer la session'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}
            ListFooterComponent={!isGroup && otherTyping && otherUser ? (
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
                {replyTo.senderId === user?.id
                  ? 'Toi'
                  : (activeConv?.participantDetails[replyTo.senderId]?.displayName || otherUser?.displayName || '')}
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
          <View style={styles.inputBarRow}>
            {/* Attach "+" button — opens photo picker + future actions */}
            <TouchableOpacity
              style={styles.attachBtn}
              onPress={() => setAttachMenuOpen((v) => !v)}
              activeOpacity={0.7}
              disabled={isUploadingPhoto}
            >
              {isUploadingPhoto ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Ionicons
                  name={attachMenuOpen ? 'close' : 'add'}
                  size={22}
                  color={Colors.primary}
                />
              )}
            </TouchableOpacity>
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
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
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
                  <Ionicons name="arrow-up" size={14} color={Colors.textOnAccent} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          {/* Attach menu — appears when + is tapped */}
          {attachMenuOpen && (
            <View style={styles.attachMenu}>
              <TouchableOpacity
                style={styles.attachMenuItem}
                onPress={handlePickPhoto}
                activeOpacity={0.7}
              >
                <View style={styles.attachMenuIcon}>
                  <Ionicons name="image" size={18} color={Colors.primary} />
                </View>
                <Text style={styles.attachMenuText}>Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.attachMenuItem}
                onPress={() => {
                  setAttachMenuOpen(false);
                  setPollComposerOpen(true);
                }}
                activeOpacity={0.7}
              >
                <View style={styles.attachMenuIcon}>
                  <Ionicons name="bar-chart" size={18} color={Colors.primary} />
                </View>
                <Text style={styles.attachMenuText}>Sondage</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* ── Floating session dock ──
          Replaces the previous double-CTA ("Rejoindre" sticky + inline
          button on the system event). Sits just above the message input,
          carries social presence ("Léa et Marc sont en route"), auto-hides
          while the user is typing. Dismounts when the session ends. */}
      {isGroup && activeConv?.activeSessionId && !isMeFinishedInActiveSession && (
        <FloatingSessionDock
          others={dockOthers}
          hidden={isInputFocused}
          bottom={Math.max(insets.bottom, 8) + 60}
          onPress={handleJoinSession}
        />
      )}

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
              {isGroup ? (
                <GroupMosaicAvatar
                  participants={otherParticipants.map((p) => ({
                    initials: p.initials,
                    avatarBg: p.avatarBg,
                    avatarColor: p.avatarColor,
                    avatarUrl: p.avatarUrl,
                  }))}
                  size={40}
                />
              ) : otherUser ? (
                <Avatar
                  initials={otherUser.initials}
                  bg={otherUser.avatarBg}
                  color={otherUser.avatarColor}
                  size="M"
                  avatarUrl={otherUser.avatarUrl ?? undefined}
                />
              ) : null}
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={kebabStyles.headerName} numberOfLines={1}>
                  {isGroup ? groupDisplayName : (otherUser?.displayName || '')}
                </Text>
                <Text style={kebabStyles.headerHandle} numberOfLines={1}>
                  {isGroup
                    ? `${activeConv?.participants.length ?? 0} participants${activeConv?.meetupAt ? '  \u00b7  ' + formatMeetupShort(activeConv.meetupAt) : ''}`
                    : (otherUser ? `@${otherUser.username}` : '')}
                </Text>
              </View>
            </View>
            <View style={kebabStyles.divider} />
            {!isGroup && otherUser && (
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
            )}

            {/* Group-only actions */}
            {isGroup && (
              <TouchableOpacity
                style={kebabStyles.action}
                onPress={() => {
                  setKebabOpen(false);
                  setTimeout(() => setAddSheetOpen(true), 200);
                }}
                activeOpacity={0.6}
              >
                <Ionicons name="person-add-outline" size={20} color={Colors.textPrimary} />
                <Text style={kebabStyles.actionText}>Ajouter des participants</Text>
              </TouchableOpacity>
            )}
            {isGroup && (
              <TouchableOpacity
                style={kebabStyles.action}
                onPress={() => {
                  setKebabOpen(false);
                  setTimeout(() => setAlbumOpen(true), 200);
                }}
                activeOpacity={0.6}
              >
                <Ionicons name="images-outline" size={20} color={Colors.textPrimary} />
                <Text style={kebabStyles.actionText}>Voir l{'\u2019'}album</Text>
              </TouchableOpacity>
            )}
            {isGroup && (
              <TouchableOpacity
                style={kebabStyles.action}
                onPress={() => {
                  setKebabOpen(false);
                  setRenameValue(groupDisplayName);
                  setTimeout(() => setRenameSheetOpen(true), 200);
                }}
                activeOpacity={0.6}
              >
                <Ionicons name="pencil-outline" size={20} color={Colors.textPrimary} />
                <Text style={kebabStyles.actionText}>Renommer le groupe</Text>
              </TouchableOpacity>
            )}

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

            {/* Destructive action — depends on context */}
            {isGroup && !isGroupCreator ? (
              // Regular member : quitter le groupe
              <TouchableOpacity
                style={kebabStyles.action}
                onPress={() => {
                  setKebabOpen(false);
                  Alert.alert(
                    'Quitter le groupe\u00a0?',
                    'Tu ne recevras plus les messages de ce groupe.',
                    [
                      { text: 'Annuler', style: 'cancel' },
                      {
                        text: 'Quitter',
                        style: 'destructive',
                        onPress: async () => {
                          await leaveGroupConv(conversationId);
                          navigation.goBack();
                        },
                      },
                    ],
                  );
                }}
                activeOpacity={0.6}
              >
                <Ionicons name="exit-outline" size={20} color={Colors.error} />
                <Text style={[kebabStyles.actionText, { color: Colors.error }]}>
                  Quitter le groupe
                </Text>
              </TouchableOpacity>
            ) : (
              // DM or group-creator: supprimer la conversation
              <TouchableOpacity
                style={kebabStyles.action}
                onPress={() => {
                  setKebabOpen(false);
                  Alert.alert(
                    isGroup ? 'Supprimer le groupe\u00a0?' : 'Supprimer la conversation\u00a0?',
                    isGroup
                      ? 'Le groupe sera supprimé pour tous les participants.'
                      : 'Cette action est définitive et concerne tous les participants.',
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
                  {isGroup ? 'Supprimer le groupe' : 'Supprimer la conversation'}
                </Text>
              </TouchableOpacity>
            )}
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

      {/* Photo lightbox — full-screen dimmed backdrop + zoomed image */}
      {lightboxUrl && (
        <Modal
          visible={!!lightboxUrl}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setLightboxUrl(null)}
        >
          <Pressable style={lightboxStyles.backdrop} onPress={() => setLightboxUrl(null)}>
            <Image
              source={{ uri: lightboxUrl }}
              style={lightboxStyles.image}
              resizeMode="contain"
            />
            <TouchableOpacity
              style={[lightboxStyles.closeBtn, { top: insets.top + 12 }]}
              onPress={() => setLightboxUrl(null)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color={Colors.textOnAccent} />
            </TouchableOpacity>
          </Pressable>
        </Modal>
      )}

      {/* Add participants sheet (groups only) */}
      {isGroup && (
        <AddParticipantsSheet
          visible={addSheetOpen}
          onClose={() => setAddSheetOpen(false)}
          existingParticipantIds={activeConv?.participants || []}
          onAdd={(participant) => addToGroup(conversationId, participant)}
        />
      )}

      {/* Group album sheet */}
      {isGroup && (
        <GroupAlbumSheet
          visible={albumOpen}
          onClose={() => setAlbumOpen(false)}
          conversationId={conversationId}
        />
      )}

      {/* Poll composer sheet */}
      <PollComposerSheet
        visible={pollComposerOpen}
        onClose={() => setPollComposerOpen(false)}
        onSubmit={(question, options) => sendPoll({ question, options })}
      />

      {/* "Do it now à plusieurs" date sheet — fix the start time of the
          group session. Reuses the same calendar UI as CoPlanMeetupSheet
          (day strip + hour grid) but writes to the conv's meetupAt
          rather than the draft. Only mounted for groups with a linked
          plan — the date is meaningless for plain DM conversations. */}
      {isGroup && activeConv?.linkedPlanId && (
        <DoItNowDateSheet
          visible={dateSheetOpen}
          onClose={() => setDateSheetOpen(false)}
          currentMeetupAt={activeConv.meetupAt ?? null}
          onConfirm={handleSetMeetupAt}
          onClear={handleClearMeetupAt}
        />
      )}

      {/* Proof Camera host — fullscreen branded camera triggered by
          the chat's "+" menu. Same instance used everywhere a photo
          is needed in the app. */}
      <proofCamera.ProofCameraHost />

      {/* Rename modal (groups only) */}
      {isGroup && (
        <Modal
          visible={renameSheetOpen}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setRenameSheetOpen(false)}
        >
          <Pressable style={renameStyles.backdrop} onPress={() => setRenameSheetOpen(false)}>
            <Pressable style={renameStyles.card} onPress={() => {}}>
              <Text style={renameStyles.title}>Renommer le groupe</Text>
              <TextInput
                style={renameStyles.input}
                value={renameValue}
                onChangeText={setRenameValue}
                placeholder="Nom du groupe"
                placeholderTextColor={Colors.textTertiary}
                maxLength={60}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => {
                  const trimmed = renameValue.trim();
                  if (trimmed.length > 0) {
                    renameGroupConv(conversationId, trimmed);
                  }
                  setRenameSheetOpen(false);
                }}
              />
              <View style={renameStyles.actionsRow}>
                <TouchableOpacity
                  style={[renameStyles.actionBtn, renameStyles.actionBtnCancel]}
                  onPress={() => setRenameSheetOpen(false)}
                  activeOpacity={0.7}
                >
                  <Text style={[renameStyles.actionBtnText, { color: Colors.textSecondary }]}>
                    Annuler
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[renameStyles.actionBtn, renameStyles.actionBtnConfirm]}
                  onPress={() => {
                    const trimmed = renameValue.trim();
                    if (trimmed.length > 0) {
                      renameGroupConv(conversationId, trimmed);
                    }
                    setRenameSheetOpen(false);
                  }}
                  activeOpacity={0.85}
                  disabled={renameValue.trim().length === 0}
                >
                  <Text style={[renameStyles.actionBtnText, { color: Colors.textOnAccent }]}>
                    Enregistrer
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
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
// Photo lightbox styles
// ═══════════════════════════════════════════════

const lightboxStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  closeBtn: {
    position: 'absolute',
    right: 18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ═══════════════════════════════════════════════
// Rename modal styles (group-only)
// ═══════════════════════════════════════════════

const renameStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(44,36,32,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.bgSecondary,
    borderRadius: 18,
    padding: 22,
  },
  title: {
    fontSize: 17,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 14,
  },
  input: {
    fontSize: 15,
    fontFamily: Fonts.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.bgTertiary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 18,
  },
  actionBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnCancel: {
    backgroundColor: 'transparent',
  },
  actionBtnConfirm: {
    backgroundColor: Colors.primary,
  },
  actionBtnText: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
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

  // ── Group sender label (shown above first bubble of a run) ──
  groupSenderLabel: {
    fontSize: 11,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textTertiary,
    marginBottom: 3,
    marginLeft: 4,
    letterSpacing: 0.1,
  },

  // ── System event (centered line, no bubble) ──
  systemEventWrap: {
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingVertical: 6,
    marginVertical: 4,
  },
  systemEventText: {
    fontSize: 11.5,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 16,
  },
  systemJoinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 99,
    backgroundColor: Colors.primary,
    marginTop: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 2,
  },
  systemJoinText: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
    letterSpacing: -0.1,
  },

  // ── Pinned plan card (group list header) ──
  pinnedPlanWrap: {
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: Colors.bgSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
    shadowColor: 'rgba(44,36,32,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
    overflow: 'hidden',
  },
  pinnedPlanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
  },
  // Session CTA (start) — outline terracotta
  sessionStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
    backgroundColor: Colors.bgPrimary,
  },
  sessionStartText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
    letterSpacing: -0.1,
  },
  // Session CTA (active) — solid terracotta with live dot
  sessionActiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    backgroundColor: Colors.primary,
  },
  sessionActiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.textOnAccent,
  },
  sessionActiveText: {
    fontSize: 13,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
    letterSpacing: -0.1,
  },
  pinnedPlanCover: {
    width: 52,
    height: 52,
    borderRadius: 10,
  },
  pinnedPlanBody: { flex: 1 },
  pinnedPlanEyebrow: {
    fontSize: 9,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: Colors.primary,
    marginBottom: 2,
  },
  pinnedPlanTitle: {
    fontSize: 14,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
    lineHeight: 17,
  },
  pinnedPlanMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  pinnedPlanMetaPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pinnedPlanMetaText: {
    fontSize: 11.5,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
  },
  pinnedPlanMetaSep: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginHorizontal: 3,
  },

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
  inputBarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  attachBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.bgTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachMenu: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 8,
    paddingLeft: 2,
  },
  attachMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.bgPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  attachMenuIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.terracotta50,
  },
  attachMenuText: {
    fontSize: 13.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
  },
  inputRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 99,
    paddingHorizontal: 14,
    paddingVertical: 2,
    gap: 8,
    backgroundColor: Colors.bgTertiary,
    minHeight: 28,
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
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 2,
  },

  // ── Gradient fade overlays ──
  fadeOverlay: { position: 'absolute', left: 0, right: 0, height: FADE_H },
  fadeTop: { top: 0 },
  fadeBottom: { bottom: 0 },
});
