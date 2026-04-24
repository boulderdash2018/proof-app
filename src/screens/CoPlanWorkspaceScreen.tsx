import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { useAuthStore } from '../store';
import { useCoPlanStore } from '../store/coPlanStore';

/**
 * Collaborative workspace where a group of friends organizes a day together.
 *
 * For now this is the minimal shell — header + placeholder sections + loading
 * state. The places / availability / lock UIs will land in subsequent commits
 * (#5, #6, #7), each committed independently so the app stays shippable.
 */
export const CoPlanWorkspaceScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const user = useAuthStore((s) => s.user);

  const { draftId } = route.params as { draftId: string };

  const draft = useCoPlanStore((s) => s.draft);
  const observeDraft = useCoPlanStore((s) => s.observeDraft);
  const stopObserving = useCoPlanStore((s) => s.stopObserving);

  // Subscribe while mounted.
  useEffect(() => {
    if (!user?.id || !draftId) return;
    observeDraft(draftId, user.id);
    return () => stopObserving();
  }, [draftId, user?.id, observeDraft, stopObserving]);

  const isLoading = !draft;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.6}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.eyebrow}>ORGANISER ENSEMBLE</Text>
          <Text style={styles.title} numberOfLines={1}>
            {draft?.title || '…'}
          </Text>
        </View>
        <View style={styles.headerBtn} />
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.placeholderText}>
            Brouillon prêt — les sections "Où", "Quand" et "Trajet" arrivent dans les prochains commits.
          </Text>
          <Text style={styles.placeholderSub}>
            {draft.participants.length} participant{draft.participants.length > 1 ? 's' : ''}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSubtle,
    backgroundColor: Colors.bgSecondary,
  },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
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
    letterSpacing: -0.2,
    color: Colors.textPrimary,
  },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 15,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  placeholderSub: {
    marginTop: 10,
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textTertiary,
  },
});
