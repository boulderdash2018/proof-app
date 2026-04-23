import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, TouchableWithoutFeedback, ActivityIndicator, ScrollView, Image,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar } from './Avatar';
import { useAuthStore } from '../store';
import { getMutualFollowIds } from '../services/friendsService';
import { ConversationParticipant, createGroupConversation } from '../services/chatService';
import { collection, query, where, getDocs, documentId } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { User } from '../types';

interface FriendItem {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  avatarBg: string;
  avatarColor: string;
  initials: string;
}

interface GroupPlanSheetProps {
  visible: boolean;
  onClose: () => void;
  planId: string;
  planTitle: string;
  planCover?: string;
  planAuthorName: string;
  /** Called after the group has been created with the new conversation id. */
  onCreated?: (conversationId: string) => void;
}

type Step = 'pick' | 'compose';

// ══════════════════════════════════════════════════════════════
// Date presets — 4 smart defaults covering most real-life cases
// ══════════════════════════════════════════════════════════════

interface DatePreset {
  key: string;
  label: string;
  sublabel: string;
  /** Returns null for "pas de date" option. */
  compute: () => string | null;
}

const atHour = (date: Date, h: number, m = 0): Date => {
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
};

const nextSaturday = (): Date => {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday, 6 = Saturday
  const diff = (6 - day + 7) % 7 || 7; // always a future Saturday
  d.setDate(d.getDate() + diff);
  return atHour(d, 12);
};

const DATE_PRESETS: DatePreset[] = [
  {
    key: 'tonight',
    label: 'Ce soir',
    sublabel: '19h',
    compute: () => atHour(new Date(), 19).toISOString(),
  },
  {
    key: 'tomorrow',
    label: 'Demain',
    sublabel: '12h',
    compute: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return atHour(d, 12).toISOString();
    },
  },
  {
    key: 'saturday',
    label: 'Ce weekend',
    sublabel: 'samedi 12h',
    compute: () => nextSaturday().toISOString(),
  },
  {
    key: 'later',
    label: 'Plus tard',
    sublabel: 'on verra',
    compute: () => null,
  },
];

const formatMeetup = (iso: string | null): string => {
  if (!iso) return 'Pas encore décidée';
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Ce soir · ${time}`;
  return `${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} · ${time}`;
};

// ══════════════════════════════════════════════════════════════
// Main sheet
// ══════════════════════════════════════════════════════════════

export const GroupPlanSheet: React.FC<GroupPlanSheetProps> = ({
  visible, onClose, planId, planTitle, planCover, planAuthorName, onCreated,
}) => {
  const user = useAuthStore((s) => s.user);

  const [step, setStep] = useState<Step>('pick');
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [filtered, setFiltered] = useState<FriendItem[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [presetKey, setPresetKey] = useState<string>('saturday'); // default: ce weekend
  const [message, setMessage] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // ── Reset whenever the sheet opens ──
  useEffect(() => {
    if (visible && user?.id) {
      loadFriends();
      setStep('pick');
      setSelectedIds(new Set());
      setMessage('');
      setSearch('');
      setPresetKey('saturday');
      setIsCreating(false);
    }
  }, [visible, user?.id]);

  const loadFriends = async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const mutualIds = await getMutualFollowIds(user.id);
      if (mutualIds.length === 0) {
        setFriends([]);
        setFiltered([]);
        setIsLoading(false);
        return;
      }
      const allFriends: FriendItem[] = [];
      for (let i = 0; i < mutualIds.length; i += 10) {
        const batch = mutualIds.slice(i, i + 10);
        const q = query(collection(db, 'users'), where(documentId(), 'in', batch));
        const snap = await getDocs(q);
        snap.docs.forEach((d) => {
          const data = d.data() as User;
          allFriends.push({
            id: d.id,
            displayName: data.displayName,
            username: data.username,
            avatarUrl: data.avatarUrl || null,
            avatarBg: data.avatarBg,
            avatarColor: data.avatarColor,
            initials: data.initials,
          });
        });
      }
      allFriends.sort((a, b) => a.displayName.localeCompare(b.displayName));
      setFriends(allFriends);
      setFiltered(allFriends);
    } catch (err) {
      console.warn('[GroupPlanSheet] load friends error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(friends);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(
      friends.filter((f) =>
        f.displayName.toLowerCase().includes(q) || f.username.toLowerCase().includes(q),
      ),
    );
  }, [search, friends]);

  const toggleSelect = (friend: FriendItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(friend.id)) next.delete(friend.id);
      else next.add(friend.id);
      return next;
    });
  };

  const goToCompose = () => {
    if (selectedIds.size === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setStep('compose');
  };

  const backToPick = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setStep('pick');
  };

  const handleCreate = useCallback(async () => {
    if (!user || isCreating || selectedIds.size === 0) return;
    setIsCreating(true);
    try {
      const me: ConversationParticipant = {
        userId: user.id,
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl || null,
        avatarBg: user.avatarBg,
        avatarColor: user.avatarColor,
        initials: user.initials,
      };
      const selectedFriends = friends.filter((f) => selectedIds.has(f.id));
      const otherParticipants: ConversationParticipant[] = selectedFriends.map((f) => ({
        userId: f.id,
        displayName: f.displayName,
        username: f.username,
        avatarUrl: f.avatarUrl,
        avatarBg: f.avatarBg,
        avatarColor: f.avatarColor,
        initials: f.initials,
      }));
      const preset = DATE_PRESETS.find((p) => p.key === presetKey) || DATE_PRESETS[0];
      const meetupAt = preset.compute() || undefined;
      const trimmedMessage = message.trim() || undefined;

      const convId = await createGroupConversation({
        creator: me,
        otherParticipants,
        plan: {
          id: planId,
          title: planTitle,
          coverPhoto: planCover,
        },
        meetupAt,
        initialMessage: trimmedMessage,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onClose();
      // Tiny delay so the close animation doesn't compete with the navigation.
      setTimeout(() => onCreated?.(convId), 180);
    } catch (err) {
      console.warn('[GroupPlanSheet] create error:', err);
    } finally {
      setIsCreating(false);
    }
  }, [user, isCreating, selectedIds, friends, presetKey, message, planId, planTitle, planCover, onClose, onCreated]);

  // ── Renderers ──
  const renderFriendRow = ({ item }: { item: FriendItem }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => toggleSelect(item)}
      >
        <Avatar
          initials={item.initials}
          bg={item.avatarBg}
          color={item.avatarColor}
          size="M"
          avatarUrl={item.avatarUrl ?? undefined}
        />
        <View style={styles.rowText}>
          <Text style={styles.name} numberOfLines={1}>{item.displayName}</Text>
          <Text style={styles.username} numberOfLines={1}>@{item.username}</Text>
        </View>
        <View
          style={[
            styles.checkbox,
            isSelected
              ? { backgroundColor: Colors.primary, borderColor: Colors.primary }
              : { borderColor: Colors.gray400 },
          ]}
        >
          {isSelected ? <Ionicons name="checkmark" size={14} color={Colors.textOnAccent} /> : null}
        </View>
      </TouchableOpacity>
    );
  };

  const selectedCount = selectedIds.size;
  const selectedFriendsList = friends.filter((f) => selectedIds.has(f.id));

  const selectedPreset = DATE_PRESETS.find((p) => p.key === presetKey) || DATE_PRESETS[0];
  const computedMeetup = selectedPreset.compute();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
        pointerEvents="box-none"
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* ═════════════════ STEP 1: pick friends ═════════════════ */}
          {step === 'pick' && (
            <>
              <View style={styles.header}>
                <View style={{ width: 28 }} />
                <View style={styles.titleWrap}>
                  <Text style={styles.eyebrow}>CRÉER UN GROUPE</Text>
                  <Text style={styles.title} numberOfLines={1}>{planTitle}</Text>
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Search */}
              <View style={styles.searchRow}>
                <Ionicons name="search-outline" size={16} color={Colors.textTertiary} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Qui emmènes-tu ?"
                  placeholderTextColor={Colors.textTertiary}
                  value={search}
                  onChangeText={setSearch}
                />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={16} color={Colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>

              {isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color={Colors.primary} />
                </View>
              ) : (
                <FlatList
                  data={filtered}
                  renderItem={renderFriendRow}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.list}
                  style={styles.flatList}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  extraData={selectedIds}
                  ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>
                        {search ? 'Aucun résultat' : 'Aucun ami mutuel'}
                      </Text>
                    </View>
                  }
                />
              )}

              {selectedCount > 0 && (
                <View style={styles.pickFooter}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.selectedRow}
                  >
                    {selectedFriendsList.map((f) => (
                      <View key={f.id} style={styles.selectedChip}>
                        <Avatar
                          initials={f.initials}
                          bg={f.avatarBg}
                          color={f.avatarColor}
                          size="XS"
                          avatarUrl={f.avatarUrl ?? undefined}
                        />
                        <Text style={styles.selectedChipName} numberOfLines={1}>
                          {f.displayName.split(' ')[0]}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                  <TouchableOpacity
                    style={styles.nextBtn}
                    onPress={goToCompose}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.nextBtnText}>
                      {selectedCount === 1 ? 'Suivant' : `Suivant · ${selectedCount}`}
                    </Text>
                    <Ionicons name="arrow-forward" size={16} color={Colors.textOnAccent} />
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}

          {/* ═════════════════ STEP 2: compose ═════════════════ */}
          {step === 'compose' && (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 12 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.header}>
                <TouchableOpacity onPress={backToPick} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
                </TouchableOpacity>
                <View style={styles.titleWrap}>
                  <Text style={styles.eyebrow}>NOUVEAU GROUPE</Text>
                  <Text style={styles.title} numberOfLines={1}>
                    {selectedCount === 1
                      ? `Avec ${selectedFriendsList[0]?.displayName.split(' ')[0] ?? ''}`
                      : `Avec ${selectedCount} amis`}
                  </Text>
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Selected avatars recap */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.composeSelectedRow}
              >
                {selectedFriendsList.map((f) => (
                  <View key={f.id} style={styles.composeSelectedChip}>
                    <Avatar
                      initials={f.initials}
                      bg={f.avatarBg}
                      color={f.avatarColor}
                      size="S"
                      avatarUrl={f.avatarUrl ?? undefined}
                    />
                    <Text style={styles.composeSelectedName} numberOfLines={1}>
                      {f.displayName.split(' ')[0]}
                    </Text>
                  </View>
                ))}
              </ScrollView>

              {/* Plan preview card */}
              <View style={styles.planPreview}>
                {planCover ? (
                  <Image source={{ uri: planCover }} style={styles.planPreviewCover} />
                ) : (
                  <View style={[styles.planPreviewCover, { backgroundColor: Colors.terracotta400 }]} />
                )}
                <View style={styles.planPreviewInfo}>
                  <Text style={styles.planPreviewEyebrow}>PLAN ÉPINGLÉ</Text>
                  <Text style={styles.planPreviewTitle} numberOfLines={2}>{planTitle}</Text>
                  <Text style={styles.planPreviewAuthor} numberOfLines={1}>par {planAuthorName}</Text>
                </View>
              </View>

              {/* Date chips */}
              <Text style={styles.sectionLabel}>QUAND ?</Text>
              <View style={styles.dateChipsRow}>
                {DATE_PRESETS.map((p) => {
                  const active = p.key === presetKey;
                  return (
                    <TouchableOpacity
                      key={p.key}
                      style={[
                        styles.dateChip,
                        active
                          ? { backgroundColor: Colors.primary, borderColor: Colors.primary }
                          : { backgroundColor: Colors.bgSecondary, borderColor: Colors.borderSubtle },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setPresetKey(p.key);
                      }}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.dateChipLabel,
                          { color: active ? Colors.textOnAccent : Colors.textPrimary },
                        ]}
                      >
                        {p.label}
                      </Text>
                      <Text
                        style={[
                          styles.dateChipSub,
                          { color: active ? 'rgba(255,248,240,0.8)' : Colors.textTertiary },
                        ]}
                      >
                        {p.sublabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.meetupPreview}>
                <Ionicons name="calendar-outline" size={12} color={Colors.textSecondary} />
                {'  '}
                {formatMeetup(computedMeetup)}
              </Text>

              {/* Optional intro message */}
              <Text style={[styles.sectionLabel, { marginTop: 18 }]}>UN PETIT MOT ?</Text>
              <View style={styles.messageInputRow}>
                <TextInput
                  style={styles.messageInput}
                  placeholder="On y va à plusieurs ? (optionnel)"
                  placeholderTextColor={Colors.textTertiary}
                  value={message}
                  onChangeText={setMessage}
                  maxLength={200}
                  multiline
                />
              </View>

              {/* Create button */}
              <TouchableOpacity
                style={[styles.createBtn, { opacity: isCreating ? 0.6 : 1 }]}
                onPress={handleCreate}
                disabled={isCreating}
                activeOpacity={0.85}
              >
                {isCreating ? (
                  <ActivityIndicator size="small" color={Colors.textOnAccent} />
                ) : (
                  <>
                    <Ionicons name="people" size={16} color={Colors.textOnAccent} />
                    <Text style={styles.createBtnText}>
                      {selectedCount === 1 ? 'Créer le groupe' : `Créer le groupe · ${selectedCount + 1}`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              <Text style={styles.hintText}>
                Tu pourras changer le nom, la date et les participants après.
              </Text>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(44,36,32,0.4)' },
  sheetWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: '12%',
  },
  sheet: {
    flex: 1,
    backgroundColor: Colors.bgSecondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  flatList: { flex: 1 },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray400,
    opacity: 0.3,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 4,
    gap: 8,
  },
  titleWrap: { flex: 1, alignItems: 'center' },
  eyebrow: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.primary,
    marginBottom: 2,
  },
  title: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    textAlign: 'center',
    maxWidth: '100%',
  },

  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 6,
    backgroundColor: Colors.bgTertiary,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.body,
    paddingVertical: 0,
    color: Colors.textPrimary,
  },

  // List
  loadingContainer: { paddingVertical: 40, alignItems: 'center' },
  list: { paddingBottom: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  rowText: { flex: 1 },
  name: { fontSize: 14, fontFamily: Fonts.bodySemiBold, color: Colors.textPrimary },
  username: { fontSize: 12, fontFamily: Fonts.body, color: Colors.textSecondary, marginTop: 1 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { fontSize: 14, fontFamily: Fonts.body, color: Colors.textSecondary },

  // Pick footer
  pickFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderSubtle,
  },
  selectedRow: { gap: 6, paddingRight: 6, alignItems: 'center' },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: Colors.terracotta50,
    maxWidth: 120,
  },
  selectedChipName: {
    fontSize: 12,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    maxWidth: 70,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  nextBtnText: {
    color: Colors.textOnAccent,
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
  },

  // Compose — selected avatars strip
  composeSelectedRow: {
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    alignItems: 'center',
  },
  composeSelectedChip: {
    alignItems: 'center',
    gap: 4,
    maxWidth: 56,
  },
  composeSelectedName: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    maxWidth: 56,
    textAlign: 'center',
  },

  // Plan preview card
  planPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    padding: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.bgPrimary,
    marginBottom: 16,
  },
  planPreviewCover: { width: 56, height: 56, borderRadius: 10 },
  planPreviewInfo: { flex: 1 },
  planPreviewEyebrow: {
    fontSize: 9,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: Colors.primary,
    marginBottom: 2,
  },
  planPreviewTitle: {
    fontSize: 14,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  planPreviewAuthor: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    marginTop: 2,
  },

  // Section labels
  sectionLabel: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.textTertiary,
    paddingHorizontal: 16,
    marginBottom: 8,
  },

  // Date chips
  dateChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
  },
  dateChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 110,
  },
  dateChipLabel: {
    fontSize: 13.5,
    fontFamily: Fonts.bodySemiBold,
  },
  dateChipSub: {
    fontSize: 11,
    fontFamily: Fonts.body,
    marginTop: 2,
  },
  meetupPreview: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },

  // Message input
  messageInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.bgTertiary,
    marginHorizontal: 16,
    minHeight: 50,
  },
  messageInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.body,
    color: Colors.textPrimary,
    minHeight: 30,
    textAlignVertical: 'top',
  },

  // Create button
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  createBtnText: {
    color: Colors.textOnAccent,
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
  },
  hintText: {
    fontSize: 11,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 24,
  },
});
