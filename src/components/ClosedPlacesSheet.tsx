import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts, Layout } from '../constants';
import { useColors } from '../hooks/useColors';
import { PlaceOpenStatus } from '../services/googlePlacesService';

interface Props {
  visible: boolean;
  closedPlaces: PlaceOpenStatus[];
  allClosed: boolean;
  onSkipClosed: () => void;
  onContinue: () => void;
  onCancel: () => void;
}

export const ClosedPlacesSheet: React.FC<Props> = ({
  visible,
  closedPlaces,
  allClosed,
  onSkipClosed,
  onContinue,
  onCancel,
}) => {
  const insets = useSafeAreaInsets();
  const C = useColors();

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: C.white, paddingBottom: insets.bottom + 16 }]}>
          {/* Header */}
          <View style={styles.handle} />
          <Text style={[styles.title, { color: C.black }]}>Heads up <Text style={{ color: Colors.primary }}>&#x2726;</Text></Text>

          {/* Closed places list */}
          <ScrollView style={styles.listWrap} showsVerticalScrollIndicator={false}>
            {closedPlaces.map((place) => (
              <View key={place.placeId} style={[styles.placeRow, { borderBottomColor: C.borderLight }]}>
                {place.isPermanentlyClosed ? (
                  <View style={[styles.iconCircle, { backgroundColor: Colors.primary + '18' }]}>
                    <Ionicons name="close" size={14} color={Colors.primary} />
                  </View>
                ) : (
                  <View style={[styles.iconCircle, { backgroundColor: C.gray200 }]}>
                    <Ionicons name="time-outline" size={14} color={C.gray700} />
                  </View>
                )}
                <View style={styles.placeInfo}>
                  <Text style={[styles.placeName, { color: C.black }]} numberOfLines={1}>{place.name}</Text>
                  <Text style={[styles.placeStatus, { color: place.isPermanentlyClosed ? Colors.primary : C.gray600 }]}>
                    {place.isPermanentlyClosed
                      ? 'Fermé définitivement'
                      : place.nextOpenTime
                        ? `Fermé en ce moment — ouvre à ${place.nextOpenTime}`
                        : 'Fermé en ce moment'}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* All closed message */}
          {allClosed && (
            <Text style={[styles.allClosedMsg, { color: C.gray600 }]}>
              All places in this plan are currently closed.
            </Text>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            {!allClosed && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: C.primary }]}
                onPress={onSkipClosed}
                activeOpacity={0.8}
              >
                <Text style={styles.actionBtnTextPrimary}>Skip closed places</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: C.gray200 }]}
              onPress={onContinue}
              activeOpacity={0.8}
            >
              <Text style={[styles.actionBtnText, { color: C.black }]}>Continue anyway</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelText, { color: C.gray600 }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 10, maxHeight: '70%' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#999', alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '800', fontFamily: Fonts.serifBold, paddingHorizontal: 20, marginBottom: 16 },

  listWrap: { paddingHorizontal: 20, maxHeight: 220 },
  placeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  iconCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  placeInfo: { flex: 1 },
  placeName: { fontSize: 14, fontFamily: Fonts.serifBold, marginBottom: 2 },
  placeStatus: { fontSize: 12, fontFamily: Fonts.serif },

  allClosedMsg: { fontSize: 12, fontFamily: Fonts.serif, textAlign: 'center', paddingVertical: 12, paddingHorizontal: 20 },

  actions: { paddingHorizontal: 20, paddingTop: 16, gap: 10 },
  actionBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  actionBtnTextPrimary: { fontSize: 14, fontFamily: Fonts.serifBold, color: '#FFF' },
  actionBtnText: { fontSize: 14, fontFamily: Fonts.serifBold },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { fontSize: 13, fontFamily: Fonts.serifSemiBold },
});
