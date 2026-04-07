import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';
import { useColors } from '../hooks/useColors';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';

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

const buildEmbedUrl = (places: PlaceCoord[]): string => {
  // Use Google Maps Embed API with directions mode to show the route
  if (places.length === 1) {
    return `https://www.google.com/maps/embed/v1/place?key=${API_KEY}&q=${places[0].latitude},${places[0].longitude}&zoom=15`;
  }

  const origin = `${places[0].latitude},${places[0].longitude}`;
  const destination = `${places[places.length - 1].latitude},${places[places.length - 1].longitude}`;
  const waypoints = places.length > 2
    ? places.slice(1, -1).map((p) => `${p.latitude},${p.longitude}`).join('|')
    : '';

  let url = `https://www.google.com/maps/embed/v1/directions?key=${API_KEY}&origin=${origin}&destination=${destination}&mode=walking`;
  if (waypoints) url += `&waypoints=${waypoints}`;
  return url;
};

export const PlanMapModal: React.FC<Props> = ({ visible, onClose, places, title }) => {
  const C = useColors();

  if (!visible || places.length === 0) return null;

  const embedUrl = buildEmbedUrl(places);

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

        {/* Map iframe */}
        <View style={styles.mapContainer}>
          <iframe
            src={embedUrl}
            style={{ width: '100%', height: '100%', border: 'none', borderRadius: 0 } as any}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
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
