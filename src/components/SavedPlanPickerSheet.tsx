import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Fonts } from '../constants';
import { useSavesStore, useAuthStore } from '../store';
import { Plan } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called with the chosen plan. The caller decides what to do (prefill
   *  a wizard, replace co-plan places, etc.). Sheet auto-closes after. */
  onPick: (plan: Plan) => void;
  /** Override the title for context-specific phrasing (e.g. "Importer
   *  depuis…" vs "Partir de…"). */
  title?: string;
  subtitle?: string;
}

/**
 * Modal sheet listing the user's saved plans for re-use.
 *
 * Shared by :
 *   • CreateScreen wizard (step 1) — "Partir d'un plan sauvegardé"
 *   • CoPlanWorkspace (section OÙ, pre-group only) — "Importer
 *     depuis un plan sauvegardé"
 *
 * Lit `useSavesStore.savedPlans` direct — pas de fetch supplémentaire
 * (le store est déjà hydraté au login). Si la liste est vide, on rend
 * un état explicite "Aucun plan sauvegardé pour le moment" plutôt
 * qu'une liste vide silencieuse.
 *
 * Le sheet se ferme automatiquement après le tap (pas de double "Confirmer").
 */
export const SavedPlanPickerSheet: React.FC<Props> = ({
  visible,
  onClose,
  onPick,
  title = 'Partir d\'un plan sauvegardé',
  subtitle = 'Choisis l\'un de tes plans sauvegardés. Tu pourras tout modifier ensuite.',
}) => {
  const savedPlans = useSavesStore((s) => s.savedPlans);
  const isLoading = useSavesStore((s) => s.isLoading);
  const fetchSaves = useSavesStore((s) => s.fetchSaves);
  const userId = useAuthStore((s) => s.user?.id);

  /**
   * Lazy fetch — au tout premier login, le store n'est pas hydraté
   * jusqu'à ce que la ProfileScreen ou SavesScreen soit visitée.
   * On déclenche un fetch quand le sheet s'ouvre la PREMIÈRE fois
   * (liste vide + pas déjà en cours de chargement).
   */
  useEffect(() => {
    if (!visible || !userId) return;
    if (savedPlans.length === 0 && !isLoading) {
      fetchSaves(userId).catch((err) =>
        console.warn('[SavedPlanPickerSheet] lazy fetch failed:', err),
      );
    }
    // On ne dépend QUE de `visible` et `userId` — re-déclencher à chaque
    // changement de savedPlans/isLoading provoquerait une boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, userId]);

  /**
   * Filtre + tri.
   *
   * La sous-collection Firestore `users/{uid}/savedPlans` accumule aussi
   * des entrées créées par `markPlanAsDone` (Proof It sur un plan jamais
   * sauvegardé) — ces "fake saves" pollueraient la liste.
   *
   * La source de vérité du vrai bookmark est `plan.savedByIds` :
   *   • `savePlan()` → arrayUnion(userId)
   *   • `unsavePlan()` → arrayRemove(userId)
   *   • `markPlanAsDone()` n'y touche PAS
   *
   * Donc on filtre sur `savedByIds.includes(userId)` pour ne garder que
   * les plans que l'utilisateur a explicitement bookmark.
   */
  const sorted = useMemo(
    () =>
      [...savedPlans]
        .filter((sp) => {
          if (!sp.plan || !userId) return false;
          const ids = sp.plan.savedByIds;
          return Array.isArray(ids) && ids.includes(userId);
        })
        .sort((a, b) =>
          (b.savedAt || '').localeCompare(a.savedAt || ''),
        ),
    [savedPlans, userId],
  );

  const showLoading = isLoading && sorted.length === 0;

  const handlePick = (plan: Plan) => {
    Haptics.selectionAsync().catch(() => {});
    onPick(plan);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="bookmark" size={18} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>PLANS SAUVEGARDÉS</Text>
              <Text style={styles.title}>{title}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>{subtitle}</Text>

          {/* List */}
          {showLoading ? (
            <View style={styles.emptyWrap}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.emptyHint}>Chargement de tes plans…</Text>
            </View>
          ) : sorted.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons
                name="bookmark-outline"
                size={36}
                color={Colors.textTertiary}
              />
              <Text style={styles.emptyTitle}>
                Aucun plan sauvegardé pour le moment
              </Text>
              <Text style={styles.emptyHint}>
                Sauvegarde un plan depuis le feed, puis reviens ici pour
                l'utiliser comme base.
              </Text>
            </View>
          ) : (
            <FlatList
              data={sorted}
              keyExtractor={(sp) => sp.planId}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const plan = item.plan;
                const cover =
                  plan.coverPhotos?.[0] ||
                  plan.places?.find((p) => p.photoUrls?.length)?.photoUrls?.[0];
                const placeCount = plan.places?.length || 0;
                return (
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => handlePick(plan)}
                    activeOpacity={0.85}
                  >
                    {cover ? (
                      <Image source={{ uri: cover }} style={styles.cover} />
                    ) : (
                      <View
                        style={[
                          styles.cover,
                          styles.coverPlaceholder,
                        ]}
                      >
                        <Ionicons
                          name="image-outline"
                          size={20}
                          color={Colors.textTertiary}
                        />
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rowTitle} numberOfLines={2}>
                        {plan.title}
                      </Text>
                      <View style={styles.rowMeta}>
                        <Ionicons
                          name="location-outline"
                          size={12}
                          color={Colors.textTertiary}
                        />
                        <Text style={styles.rowMetaText}>
                          {placeCount} lieu{placeCount > 1 ? 'x' : ''}
                        </Text>
                        {plan.author?.displayName ? (
                          <>
                            <Text style={styles.rowMetaSep}>·</Text>
                            <Text
                              style={styles.rowMetaText}
                              numberOfLines={1}
                            >
                              par {plan.author.displayName}
                            </Text>
                          </>
                        ) : null}
                      </View>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={Colors.gray500}
                    />
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(44,36,32,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.bgSecondary,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 30,
    maxHeight: '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderMedium,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.terracotta50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: 9.5,
    fontFamily: Fonts.bodyBold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Colors.primary,
    marginBottom: 2,
  },
  title: {
    fontSize: 17,
    fontFamily: Fonts.displaySemiBold,
    letterSpacing: -0.2,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 12.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginTop: 6,
    marginBottom: 14,
    marginLeft: 50,
  },
  listContent: {
    paddingTop: 4,
    paddingBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  cover: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: Colors.bgPrimary,
  },
  coverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  rowTitle: {
    fontSize: 14,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.1,
    marginBottom: 4,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowMetaText: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
  },
  rowMetaSep: {
    fontSize: 11.5,
    color: Colors.textTertiary,
    marginHorizontal: 2,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.borderSubtle,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 12.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
