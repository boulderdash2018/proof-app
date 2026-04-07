import React, { useEffect, useRef, useState } from 'react';
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

// Warm brown/terracotta map style — "Proof" branding
const PROOF_MAP_STYLE = [
  {"featureType":"all","elementType":"geometry","stylers":[{"color":"#E8DDD0"}]},
  {"featureType":"all","elementType":"labels.text.fill","stylers":[{"color":"#8C7A6B"}]},
  {"featureType":"all","elementType":"labels.text.stroke","stylers":[{"color":"#F2EBE2"},{"weight":3}]},
  {"featureType":"all","elementType":"labels.icon","stylers":[{"visibility":"off"}]},
  {"featureType":"administrative","elementType":"geometry.stroke","stylers":[{"color":"#D4C4B0"}]},
  {"featureType":"administrative.neighborhood","elementType":"labels.text.fill","stylers":[{"color":"#A8937F"}]},
  {"featureType":"landscape.natural","elementType":"geometry","stylers":[{"color":"#E8DDD0"}]},
  {"featureType":"landscape.man_made","elementType":"geometry","stylers":[{"color":"#E2D5C6"}]},
  {"featureType":"poi","stylers":[{"visibility":"off"}]},
  {"featureType":"poi.park","elementType":"geometry.fill","stylers":[{"visibility":"on"},{"color":"#C8D4AB"}]},
  {"featureType":"road.highway","elementType":"geometry.fill","stylers":[{"color":"#D9CCBC"}]},
  {"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#CCBDAC"},{"weight":0.5}]},
  {"featureType":"road.arterial","elementType":"geometry.fill","stylers":[{"color":"#DED2C3"}]},
  {"featureType":"road.arterial","elementType":"geometry.stroke","stylers":[{"visibility":"off"}]},
  {"featureType":"road.local","elementType":"geometry.fill","stylers":[{"color":"#EDE5DA"}]},
  {"featureType":"road.local","elementType":"geometry.stroke","stylers":[{"visibility":"off"}]},
  {"featureType":"road","elementType":"labels.text.fill","stylers":[{"color":"#9C8B7A"}]},
  {"featureType":"transit","stylers":[{"visibility":"off"}]},
  {"featureType":"water","elementType":"geometry.fill","stylers":[{"color":"#B8CAC0"}]},
  {"featureType":"water","elementType":"labels.text.fill","stylers":[{"color":"#8AA49A"}]}
];

let googleMapsLoaded = false;
let googleMapsLoading = false;
const loadCallbacks: (() => void)[] = [];

function loadGoogleMaps(callback: () => void) {
  if (googleMapsLoaded && (window as any).google?.maps) {
    callback();
    return;
  }
  loadCallbacks.push(callback);
  if (googleMapsLoading) return;
  googleMapsLoading = true;

  (window as any).__gmCallback = () => {
    googleMapsLoaded = true;
    googleMapsLoading = false;
    loadCallbacks.forEach(cb => cb());
    loadCallbacks.length = 0;
  };

  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&callback=__gmCallback`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

const MapRenderer: React.FC<{ places: PlaceCoord[] }> = ({ places }) => {
  const mapDivRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadGoogleMaps(() => {
      if (!mapDivRef.current || !places.length) return;
      const gm = (window as any).google.maps;

      const map = new gm.Map(mapDivRef.current, {
        styles: PROOF_MAP_STYLE,
        disableDefaultUI: true,
        zoomControl: false,
        gestureHandling: 'none',
        backgroundColor: '#E8DDD0',
      });

      // Fit bounds — generous padding to see the city context
      const bounds = new gm.LatLngBounds();
      places.forEach(p => bounds.extend({ lat: p.latitude, lng: p.longitude }));
      map.fitBounds(bounds, { top: 100, right: 100, bottom: 100, left: 100 });

      // Ensure we don't zoom in too much for close-together places
      gm.event.addListenerOnce(map, 'bounds_changed', () => {
        if (map.getZoom() > 14) map.setZoom(14);
      });

      // Markers — small clean dot with number
      places.forEach((p, i) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="13" fill="%23D4845A" stroke="white" stroke-width="2"/><text x="14" y="18.5" text-anchor="middle" fill="white" font-size="12" font-weight="700" font-family="-apple-system,sans-serif">${i + 1}</text></svg>`;
        new gm.Marker({
          position: { lat: p.latitude, lng: p.longitude },
          map,
          icon: {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
            scaledSize: new gm.Size(26, 26),
            anchor: new gm.Point(13, 13),
          },
          clickable: false,
          zIndex: 100 + i,
        });
      });

      // Routes via Directions Service
      if (places.length >= 2) {
        const ds = new gm.DirectionsService();
        const origin = { lat: places[0].latitude, lng: places[0].longitude };
        const dest = { lat: places[places.length - 1].latitude, lng: places[places.length - 1].longitude };
        const waypoints = places.slice(1, -1).map(p => ({
          location: { lat: p.latitude, lng: p.longitude },
          stopover: true,
        }));

        ds.route({
          origin,
          destination: dest,
          waypoints,
          travelMode: gm.TravelMode.WALKING,
          optimizeWaypoints: false,
        }, (result: any, status: string) => {
          if (status === 'OK' && result) {
            result.routes[0].legs.forEach((leg: any) => {
              const path = leg.steps.reduce((acc: any[], step: any) => acc.concat(step.path), []);
              new gm.Polyline({
                path,
                strokeColor: '#D4845A',
                strokeOpacity: 0.85,
                strokeWeight: 4,
                geodesic: true,
                map,
                zIndex: 50,
              });
            });
          } else {
            // Fallback: straight solid lines
            new gm.Polyline({
              path: places.map(p => ({ lat: p.latitude, lng: p.longitude })),
              strokeColor: '#D4845A',
              strokeOpacity: 0.85,
              strokeWeight: 4,
              geodesic: true,
              map,
              zIndex: 50,
            });
          }
        });
      }
    });
  }, [places]);

  return (
    <div
      ref={mapDivRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
};

export const PlanMapModal: React.FC<Props> = ({ visible, onClose, places, title }) => {
  const C = useColors();

  if (!visible || places.length === 0) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: C.white }]}>
        <View style={[styles.header, { borderBottomColor: C.borderLight }]}>
          <TouchableOpacity style={[styles.closeBtn, { backgroundColor: C.gray200 }]} onPress={onClose}>
            <Ionicons name="close" size={20} color={C.black} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: C.black }]} numberOfLines={1}>{title}</Text>
          <View style={{ width: 34 }} />
        </View>

        <View style={styles.mapContainer}>
          <MapRenderer places={places} />
        </View>

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
  mapContainer: { flex: 1 },
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
