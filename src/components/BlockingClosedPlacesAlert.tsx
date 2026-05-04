import React from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, TouchableOpacity, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { PlaceOpenAtDateStatus } from '../services/googlePlacesService';

interface Props {
  visible: boolean;
  /** Places that would be closed at the target date. */
  closedPlaces: PlaceOpenAtDateStatus[];
  /** Human-readable date string used in the headline ("le 1 mai · 18h"). */
  targetDateLabel: string;
  /** User taps "OK, je change la date" — dismiss the alert ; the
   *  caller's date-setter is NOT executed (the meetup remains
   *  unchanged) so the user can pick another slot. */
  onDismiss: () => void;
}

/**
 * Blocking warning surfaced when a user tries to schedule a co-plan
 * meetup on a date where one or more places would be closed.
 *
 * Different from the existing `ClosedPlacesSheet` (which is the
 * DoItNow / live-session warning that lets the user "Continue
 * anyway") — here the date CANNOT be confirmed. The only path forward
 * is "OK, je change la date" which dismisses the modal without
 * persisting the chosen meetup.
 *
 * Rationale : at planning time we have plenty of room to adjust ; at
 * live time (DoItNow) the user is already on-site and the soft warning
 * is the right tradeoff. Blocking at planning time avoids the worst
 * outcome — proposing to friends a day where stuff is closed.
 */
export const BlockingClosedPlacesAlert: React.FC<Props> = ({
  visible, closedPlaces, targetDateLabel, onDismiss,
}) => {
  const hasMultiple = closedPlaces.length > 1;
  const hasPermanent = closedPlaces.some((p) => p.isPermanentlyClosed);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.card} onPress={() => {}}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Ionicons name="alert" size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>DATE INDISPONIBLE</Text>
              <Text style={styles.title}>
                {hasMultiple
                  ? `${closedPlaces.length} lieux fermés ${targetDateLabel}`
                  : `Un lieu fermé ${targetDateLabel}`}
              </Text>
            </View>
          </View>

          <Text style={styles.subtitle}>
            On ne peut pas proposer cette date au groupe — voici les
            lieux qui ne seront pas ouverts :
          </Text>

          {/* List of closed places */}
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {closedPlaces.map((p) => (
              <View key={p.placeId} style={styles.row}>
                <View style={[
                  styles.rowIcon,
                  p.isPermanentlyClosed
                    ? { backgroundColor: Colors.errorBg }
                    : { backgroundColor: Colors.terracotta50 },
                ]}>
                  <Ionicons
                    name={p.isPermanentlyClosed ? 'close-circle' : 'time-outline'}
                    size={14}
                    color={p.isPermanentlyClosed ? Colors.error : Colors.primary}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowName} numberOfLines={2}>{p.name}</Text>
                  <Text style={styles.rowSub}>
                    {p.isPermanentlyClosed
                      ? 'Définitivement fermé'
                      : 'Pas ouvert ce jour-là'}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {hasPermanent && (
            <Text style={styles.permanentNote}>
              💡 Pense à retirer ce lieu du plan — il est définitivement fermé.
            </Text>
          )}

          {/* Single CTA — no "continue anyway" */}
          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={onDismiss}
            activeOpacity={0.85}
          >
            <Text style={styles.btnPrimaryText}>OK, je change la date</Text>
          </TouchableOpacity>
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
    backgroundColor: 'rgba(44,36,32,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Colors.bgSecondary,
    borderRadius: 18,
    padding: 22,
    maxHeight: '80%',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontSize: 16,
    fontFamily: Fonts.displaySemiBold,
    letterSpacing: -0.2,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 12.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginBottom: 14,
  },

  list: {
    flexGrow: 0,
    maxHeight: 220,
  },
  listContent: {
    gap: 10,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: Colors.bgPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderSubtle,
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowName: {
    fontSize: 13.5,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textPrimary,
    letterSpacing: -0.05,
  },
  rowSub: {
    fontSize: 11.5,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    marginTop: 1,
  },

  permanentNote: {
    fontSize: 11.5,
    fontFamily: Fonts.bodyMedium,
    fontStyle: 'italic',
    color: Colors.textTertiary,
    marginTop: 12,
    paddingHorizontal: 4,
  },

  btnPrimary: {
    marginTop: 18,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  btnPrimaryText: {
    fontSize: 14,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textOnAccent,
    letterSpacing: -0.05,
  },
});
