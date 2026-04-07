import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Image, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { useColors } from '../hooks/useColors';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';
const { width: SCREEN_W } = Dimensions.get('window');
const MAP_W = Math.min(SCREEN_W - 40, 640);
const MAP_H = Math.round(MAP_W * 0.65);

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

const buildStaticMapUrl = (places: PlaceCoord[]): string => {
  const params = new URLSearchParams();
  params.set('size', `${MAP_W * 2}x${MAP_H * 2}`);
  params.set('scale', '2');
  params.set('maptype', 'roadmap');
  params.set('key', API_KEY);

  // Custom map styling (Proof branding: muted tones, no POIs)
  const styles = [
    'feature:poi|visibility:off',
    'feature:transit|visibility:off',
    'element:geometry|color:0xF5F0EB',
    'element:labels.text.fill|color:0x6B6560',
    'feature:road|element:geometry|color:0xE8E0D8',
    'feature:road.highway|element:geometry|color:0xDDD5CC',
    'feature:water|element:geometry|color:0xC5D5DC',
    'feature:park|element:geometry|color:0xD5DCC5',
  ];
  styles.forEach((s) => params.append('style', s));

  // Path (dashed line between places)
  const pathCoords = places.map((p) => `${p.latitude},${p.longitude}`).join('|');
  params.set('path', `color:0xD4845AFF|weight:3|${pathCoords}`);

  // Numbered markers
  places.forEach((place, i) => {
    params.append('markers', `color:0xD4845A|label:${i + 1}|${place.latitude},${place.longitude}`);
  });

  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
};

export const PlanMapModal: React.FC<Props> = ({ visible, onClose, places, title }) => {
  const C = useColors();

  if (!visible || places.length === 0) return null;

  const mapUrl = buildStaticMapUrl(places);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: C.white }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: C.borderLight }]}>
          <TouchableOpacity style={[styles.closeBtn, { backgroundColor: C.gray200 }]} onPress={onClose}>
            <Ionicons name="close" size={20} color={C.black} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: C.black }]} numberOfLines={1}>{title}</Text>
          <View style={{ width: 34 }} />
        </View>

        {/* Map image */}
        <View style={styles.mapContainer}>
          <Image
            source={{ uri: mapUrl }}
            style={[styles.mapImage, { width: MAP_W, height: MAP_H }]}
            resizeMode="cover"
          />
        </View>

        {/* Legend */}
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
  mapContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapImage: {
    borderRadius: 16,
  },
  legend: {
    paddingHorizontal: 18,
    paddingVertical: 16,
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
