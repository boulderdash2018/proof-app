import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Modal, TouchableWithoutFeedback, ActivityIndicator, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { Avatar } from './Avatar';
import { useAuthStore } from '../store';
import { getMutualFollowIds } from '../services/friendsService';
import { createPlanDraft } from '../services/planDraftService';
import { CoPlanParticipant, User } from '../types';
import { collection, query, where, getDocs, documentId } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';

interface FriendItem {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  avatarBg: string;
  avatarColor: string;
  initials: string;
}

interface CoPlanInviteSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called once the draft is created with its id — parent should navigate to the workspace. */
  onCreated?: (draftId: string) => void;
}

type Step = 'title' | 'pick';

/**
 * Entry sheet for "Organiser avec mes amis" — 2 quick steps:
 *   1. Give a working title (editable later in the workspace)
 *   2. Pick friends to invite (mutual follows)
 * Then creates the plan_draft doc and hands off to the parent which
 * navigates to the collaborative workspace.
 */
export const CoPlanInviteSheet: React.FC<CoPlanInviteSheetProps> = ({
  visible, onClose, onCreated,
}) => {
  const user = useAuthStore((s) => s.user);

  const [step, setStep] = useState<Step>('title');
  const [title, setTitle] = useState('');
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoadingFriends, setIsLoadingFriends] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset whenever the sheet opens
  useEffect(() => {
    if (visible && user?.id) {
      loadFriends();
      setStep('title');
      setTitle('');
      setSearch('');
      setSelectedIds(new Set());
      setIsSubmitting(false);
    }
  }, [visible, user?.id]);

  const loadFriends = async () => {
    if (!user?.id) return;
    setIsLoadingFriends(true);
    try {
      const mutualIds = await getMutualFollowIds(user.id);
      if (mutualIds.length === 0) {
        setFriends([]);
        setIsLoadingFriends(false);
        return;
      }
      const all: FriendItem[] = [];
      for (let i = 0; i < mutualIds.length; i += 10) {
        const batch = mutualIds.slice(i, i + 10);
        const q = query(collection(db, 'users'), where(documentId(), 'in', batch));
        const snap = await getDocs(q);
        snap.docs.forEach((d) => {
          const data = d.data() as User;
          all.push({
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
      all.sort((a, b) => a.displayName.localeCompare(b.displayName));
      setFriends(all);
    } catch (err) {
      console.warn('[CoPlanInviteSheet] load friends error:', err);
    } finally {
      setIsLoadingFriends(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return friends;
    const q = search.toLowerCase();
    return friends.filter((f) =>
      f.displayName.toLowerCase().includes(q) || f.username.toLowerCase().includes(q),
    );
  }, [friends, search]);

  const toggleSelect = (f: FriendItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(f.id)) next.delete(f.id);
      else next.add(f.id);
      return next;
    });
  };

  const canGoNext = title.trim().length >= 2;
  const canSubmit = selectedIds.size >= 1 && !isSubmitting;

  const handleNext = () => {
    if (!canGoNext) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setStep('pick');
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setStep('title');
  };

  const handleSubmit = useCallback(async () => {
    console.log('[CoPlan] submit pressed — user?', !!user, 'canSubmit?', canSubmit, 'selected count:', selectedIds.size);
    if (!user || !canSubmit) {
      console.warn('[CoPlan] aborted — missing user or not submittable');
      return;
    }
    setIsSubmitting(true);
    try {
      const me: CoPlanParticipant = {
        userId: user.id,
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl || null,
        avatarBg: user.avatarBg,
        avatarColor: user.avatarColor,
        initials: user.initials,
      };
      const selected = friends.filter((f) => selectedIds.has(f.id));
      const invitees: CoPlanParticipant[] = selected.map((f) => ({
        userId: f.id,
        displayName: f.displayName,
        username: f.username,
        avatarUrl: f.avatarUrl,
        avatarBg: f.avatarBg,
        avatarColor: f.avatarColor,
        initials: f.initials,
      }));
      console.log('[CoPlan] calling createPlanDraft — title:', title.trim(), 'invitees:', invitees.length);
      const draftId = await createPlanDraft({
        title: title.trim(),
        creator: me,
        invitees,
      });
      console.log('[CoPlan] draft created — id:', draftId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onClose();
      setTimeout(() => {
        console.log('[CoPlan] firing onCreated callback — nav to workspace');
        onCreated?.(draftId);
      }, 180);
    } catch (err) {
      console.error('[CoPlan] submit error:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [user, canSubmit, title, friends, selectedIds, onClose, onCreated]);

  const renderFriendRow = ({ item }: { item: FriendItem }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => toggleSelect(item)}>
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
  const selectedList = friends.filter((f) => selectedIds.has(f.id));

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

          {/* ── Step 1 : title ───────────────────────── */}
          {step === 'title' && (
            <>
              <View style={styles.header}>
                <View style={{ width: 28 }} />
                <View style={styles.titleWrap}>
                  <Text style={styles.eyebrow}>ORGANISER ENSEMBLE</Text>
                  <Text style={styles.title}>Donne un titre au brouillon</Text>
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.bodyPadH}>
                <View style={styles.titleInputBox}>
                  <TextInput
                    style={styles.titleInput}
                    placeholder="Samedi Marais"
                    placeholderTextColor={Colors.textTertiary}
                    value={title}
                    onChangeText={setTitle}
                    maxLength={60}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleNext}
                  />
                </View>
                <Text style={styles.titleHint}>
                  Indicatif — tout le monde pourra le modifier plus tard.
                </Text>

                {/* Quick ideas — tap to set */}
                <Text style={[styles.sectionLabel, { marginTop: 20 }]}>QUELQUES IDÉES</Text>
                <View style={styles.ideasWrap}>
                  {['Samedi Marais', 'Dimanche brunch', 'Afterwork Belleville'].map((idea) => (
                    <TouchableOpacity
                      key={idea}
                      style={styles.ideaChip}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setTitle(idea);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="sparkles-outline" size={13} color={Colors.primaryDeep} />
                      <Text style={styles.ideaChipText}>{idea}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.primaryBtn, { opacity: canGoNext ? 1 : 0.5 }]}
                  onPress={handleNext}
                  disabled={!canGoNext}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>Suivant — inviter des amis</Text>
                  <Ionicons name="arrow-forward" size={16} color={Colors.textOnAccent} />
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ── Step 2 : pick friends ───────────────── */}
          {step === 'pick' && (
            <>
              <View style={styles.header}>
                <TouchableOpacity onPress={handleBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
                </TouchableOpacity>
                <View style={styles.titleWrap}>
                  <Text style={styles.eyebrow}>{title}</Text>
                  <Text style={styles.title}>Qui emmènes-tu&nbsp;?</Text>
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.searchRow}>
                <Ionicons name="search-outline" size={16} color={Colors.textTertiary} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Rechercher un ami"
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

              {isLoadingFriends ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator color={Colors.primary} />
                </View>
              ) : (
                <FlatList
                  data={filtered}
                  renderItem={renderFriendRow}
                  keyExtractor={(item) => item.id}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: 10 }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  extraData={selectedIds}
                  ListEmptyComponent={
                    <View style={styles.emptyWrap}>
                      <Text style={styles.emptyText}>
                        {search ? 'Aucun résultat' : 'Aucun ami mutuel'}
                      </Text>
                    </View>
                  }
                />
              )}

              {selectedCount > 0 && (
                <View style={styles.footer}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.selectedRow}
                  >
                    {selectedList.map((f) => (
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
                    style={[styles.submitBtn, { opacity: canSubmit ? 1 : 0.5 }]}
                    onPress={handleSubmit}
                    disabled={!canSubmit}
                    activeOpacity={0.85}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color={Colors.textOnAccent} />
                    ) : (
                      <>
                        <Ionicons name="people" size={15} color={Colors.textOnAccent} />
                        <Text style={styles.submitBtnText}>
                          Créer le brouillon · {selectedCount + 1}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </>
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
    top: '14%',
  },
  sheet: {
    flex: 1,
    backgroundColor: Colors.bgSecondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
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
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 4,
  },
  titleWrap: { flex: 1, alignItems: 'center' },
  eyebrow: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.primary,
    marginBottom: 2,
    maxWidth: 220,
  },
  title: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },

  // Body paddings
  bodyPadH: { paddingHorizontal: 16, flex: 1 },

  // Title input
  titleInputBox: {
    backgroundColor: Colors.bgTertiary,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  titleInput: {
    fontSize: 18,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    padding: 0,
  },
  titleHint: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    fontStyle: 'italic',
    color: Colors.textTertiary,
    marginTop: 8,
  },

  // Section label
  sectionLabel: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.textTertiary,
    marginBottom: 8,
  },

  // Idea chips
  ideasWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ideaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: Colors.terracotta50,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.terracotta100,
  },
  ideaChipText: {
    fontSize: 12.5,
    fontFamily: Fonts.bodyMedium,
    color: Colors.primaryDeep,
  },

  // Primary CTA
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 'auto',
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryBtnText: {
    color: Colors.textOnAccent,
    fontSize: 15,
    fontFamily: Fonts.bodySemiBold,
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
    backgroundColor: Colors.bgTertiary,
    marginBottom: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.body,
    color: Colors.textPrimary,
    padding: 0,
  },

  // List row
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

  loadingWrap: { paddingVertical: 40, alignItems: 'center' },
  emptyWrap: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { fontSize: 13, fontFamily: Fonts.body, color: Colors.textSecondary },

  // Footer (step 2)
  footer: {
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
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  submitBtnText: {
    color: Colors.textOnAccent,
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
  },
});
