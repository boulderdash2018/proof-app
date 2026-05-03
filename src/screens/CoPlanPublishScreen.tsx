import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';

/**
 * Placeholder — l'écran de publication post-exécution co-plan. Sera
 * implémenté pleinement au commit suivant (cover picker mixte
 * pellicule+album, tags participants, creator tip, visibility, etc.).
 *
 * Pour l'instant, cet écran sert juste à wire la navigation depuis
 * DoItNowCompleteScreen (bouton "Publier sur le feed") → on n'expose
 * pas encore l'écran réel pour ne pas mélanger le scope.
 */
export const CoPlanPublishScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const planId = route.params?.planId as string | undefined;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Publier le plan</Text>
        <View style={styles.headerSide} />
      </View>

      <View style={styles.body}>
        <View style={styles.placeholderIcon}>
          <Ionicons name="construct-outline" size={28} color={Colors.primary} />
        </View>
        <Text style={styles.placeholderTitle}>En cours de finalisation</Text>
        <Text style={styles.placeholderHint}>
          Cet écran sera complété très prochainement avec : photos depuis
          l'album du groupe, tags des participants, conseil créateur,
          visibilité.
        </Text>
        {planId && (
          <Text style={styles.debugLine}>planId : {planId}</Text>
        )}
      </View>
    </View>
  );
};

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
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderSubtle,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
  },
  headerSide: { width: 36 },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 14,
  },
  placeholderIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.terracotta50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderTitle: {
    fontSize: 18,
    fontFamily: Fonts.displaySemiBold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  placeholderHint: {
    fontSize: 13,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  debugLine: {
    fontSize: 11,
    fontFamily: Fonts.body,
    color: Colors.textTertiary,
    marginTop: 12,
  },
});
