import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
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

// Vintage Brown by Magdalena — monochrome brown, dark water
const MAP_STYLE = [
  {"featureType":"administrative","elementType":"labels.text.fill","stylers":[{"color":"#444444"}]},
  {"featureType":"administrative.country","elementType":"all","stylers":[{"visibility":"on"}]},
  {"featureType":"administrative.country","elementType":"labels.text","stylers":[{"visibility":"off"}]},
  {"featureType":"administrative.province","elementType":"labels.text","stylers":[{"visibility":"off"}]},
  {"featureType":"administrative.locality","elementType":"labels.text","stylers":[{"visibility":"off"}]},
  {"featureType":"landscape","elementType":"all","stylers":[{"color":"#f2f2f2"}]},
  {"featureType":"landscape","elementType":"geometry","stylers":[{"color":"#b5997c"}]},
  {"featureType":"landscape","elementType":"labels.text","stylers":[{"visibility":"off"}]},
  {"featureType":"landscape.man_made","elementType":"all","stylers":[{"visibility":"on"}]},
  {"featureType":"poi","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"road","elementType":"all","stylers":[{"saturation":-100},{"lightness":45},{"visibility":"off"}]},
  {"featureType":"road.highway","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"road.arterial","elementType":"labels.icon","stylers":[{"visibility":"off"}]},
  {"featureType":"transit","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"water","elementType":"all","stylers":[{"color":"#ff9100"},{"visibility":"on"}]},
  {"featureType":"water","elementType":"geometry","stylers":[{"color":"#a06249"}]},
  {"featureType":"water","elementType":"geometry.fill","stylers":[{"color":"#a06249"}]},
  {"featureType":"water","elementType":"labels","stylers":[{"visibility":"off"}]},
];

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export const PlanMapModal: React.FC<Props> = ({ visible, onClose, places, title }) => {
  const C = useColors();
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (visible && places.length > 0 && mapRef.current) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(
          places.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
          { edgePadding: { top: 80, right: 60, bottom: 80, left: 60 }, animated: true }
        );
      }, 400);
    }
  }, [visible, places]);

  if (places.length === 0) return null;

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

        {/* Map */}
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          customMapStyle={MAP_STYLE}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
          showsScale={false}
          showsPointsOfInterest={false}
          initialRegion={{
            latitude: places[0].latitude,
            longitude: places[0].longitude,
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
          }}
        >
          {/* Path polyline */}
          <Polyline
            coordinates={places.map((p) => ({ latitude: p.latitude, longitude: p.longitude }))}
            strokeColor={Colors.primary}
            strokeWidth={3}
            lineDashPattern={[8, 6]}
          />

          {/* Numbered markers */}
          {places.map((place, index) => (
            <Marker
              key={`${place.latitude}-${place.longitude}-${index}`}
              coordinate={{ latitude: place.latitude, longitude: place.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.markerOuter}>
                <View style={styles.marker}>
                  <Text style={styles.markerText}>{index + 1}</Text>
                </View>
              </View>
            </Marker>
          ))}
        </MapView>

        {/* Legend */}
        <View style={[styles.legend, { backgroundColor: C.white, borderTopColor: C.borderLight }]}>
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
    paddingTop: Platform.OS === 'ios' ? 16 : 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 15, fontFamily: Fonts.serifBold, textAlign: 'center', marginHorizontal: 10 },
  map: { flex: 1 },

  // Markers
  markerOuter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  marker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  markerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  // Legend
  legend: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderTopWidth: 1,
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  legendDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendDotText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  legendName: {
    fontSize: 13,
    fontFamily: Fonts.serifSemiBold,
    flex: 1,
  },
});
