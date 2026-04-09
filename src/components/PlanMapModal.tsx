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

// Enegry by Schloesser David — dark mode, gold labels
const MAP_STYLE = [
  {"featureType":"all","elementType":"labels.text.fill","stylers":[{"saturation":36},{"color":"#ffa600"},{"lightness":40}]},
  {"featureType":"all","elementType":"labels.text.stroke","stylers":[{"visibility":"off"},{"lightness":16},{"hue":"#ff0000"}]},
  {"featureType":"all","elementType":"labels.icon","stylers":[{"visibility":"off"}]},
  {"featureType":"administrative","elementType":"geometry.fill","stylers":[{"color":"#000000"},{"lightness":20}]},
  {"featureType":"administrative","elementType":"geometry.stroke","stylers":[{"color":"#000000"},{"lightness":17},{"weight":1.2}]},
  {"featureType":"administrative.locality","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"administrative.neighborhood","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"landscape","elementType":"geometry","stylers":[{"color":"#000000"},{"lightness":20}]},
  {"featureType":"poi","elementType":"geometry","stylers":[{"color":"#000000"},{"lightness":21}]},
  {"featureType":"poi","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"road.highway","elementType":"geometry.fill","stylers":[{"color":"#000000"},{"lightness":17}]},
  {"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#000000"},{"lightness":29},{"weight":0.2}]},
  {"featureType":"road.arterial","elementType":"geometry","stylers":[{"color":"#000000"},{"lightness":18}]},
  {"featureType":"road.local","elementType":"geometry","stylers":[{"color":"#000000"},{"lightness":16}]},
  {"featureType":"transit","elementType":"geometry","stylers":[{"color":"#000000"},{"lightness":19}]},
  {"featureType":"transit.line","elementType":"all","stylers":[{"visibility":"off"}]},
  {"featureType":"water","elementType":"geometry","stylers":[{"color":"#000000"},{"lightness":17}]},
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
