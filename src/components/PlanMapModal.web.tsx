import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { useColors } from '../hooks/useColors';

interface PlaceCoord {
  name: string;
  latitude: number;
  longitude: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  places: PlaceCoord[];
  title: string;
}

export const PlanMapModal: React.FC<Props> = ({ visible, onClose, places, title }) => {
  const C = useColors();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: C.white }]}>
        <View style={[styles.header, { borderBottomColor: C.borderLight }]}>
          <TouchableOpacity style={[styles.closeBtn, { backgroundColor: C.gray200 }]} onPress={onClose}>
            <Ionicons name="close" size={20} color={C.black} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: C.black }]} numberOfLines={1}>{title}</Text>
          <View style={{ width: 34 }} />
        </View>
        <View style={styles.fallback}>
          <Ionicons name="map-outline" size={48} color={C.gray400} />
          <Text style={[styles.fallbackText, { color: C.gray600 }]}>
            La carte est disponible sur l'app mobile
          </Text>
          <View style={[styles.legend, { borderTopColor: C.borderLight }]}>
            {places.map((place, index) => (
              <View key={index} style={styles.legendItem}>
                <View style={styles.legendDot}>
                  <Text style={styles.legendDotText}>{index + 1}</Text>
                </View>
                <Text style={[styles.legendName, { color: C.black }]} numberOfLines={1}>{place.name}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 15, fontFamily: Fonts.serifBold, textAlign: 'center', marginHorizontal: 10 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  fallbackText: { fontSize: 14, fontFamily: Fonts.serif, marginTop: 12, textAlign: 'center' },
  legend: {
    width: '100%',
    paddingTop: 20,
    marginTop: 24,
    borderTopWidth: 1,
    gap: 10,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendDotText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  legendName: { fontSize: 13, fontFamily: Fonts.serifSemiBold, flex: 1 },
});
