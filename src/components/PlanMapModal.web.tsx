import React, { useMemo } from 'react';
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

const buildMapHtml = (places: PlaceCoord[]): string => {
  const placesJson = JSON.stringify(places);

  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{margin:0;padding:0}
  html,body,#map{width:100%;height:100%}
</style>
</head><body>
<div id="map"></div>
<script>
function initMap(){
  const places=${placesJson};
  const mapStyle=[
    {elementType:"geometry",stylers:[{color:"#F5F0EB"}]},
    {elementType:"labels.text.fill",stylers:[{color:"#6B6560"}]},
    {elementType:"labels.text.stroke",stylers:[{color:"#F5F0EB"}]},
    {featureType:"road",elementType:"geometry",stylers:[{color:"#E8E0D8"}]},
    {featureType:"road",elementType:"geometry.stroke",stylers:[{color:"#DDD5CC"}]},
    {featureType:"road.highway",elementType:"geometry",stylers:[{color:"#DDD5CC"}]},
    {featureType:"water",elementType:"geometry",stylers:[{color:"#C5D5DC"}]},
    {featureType:"water",elementType:"labels.text.fill",stylers:[{color:"#8AA4B0"}]},
    {featureType:"park",elementType:"geometry",stylers:[{color:"#D5DCC5"}]},
    {featureType:"poi",stylers:[{visibility:"off"}]},
    {featureType:"transit",stylers:[{visibility:"off"}]},
    {featureType:"administrative",elementType:"geometry.stroke",stylers:[{color:"#DDD5CC"}]},
    {featureType:"administrative.land_parcel",stylers:[{visibility:"off"}]},
    {featureType:"administrative.neighborhood",stylers:[{visibility:"off"}]}
  ];

  const map=new google.maps.Map(document.getElementById("map"),{
    styles:mapStyle,
    disableDefaultUI:true,
    zoomControl:false,
    gestureHandling:"none",
    backgroundColor:"#F5F0EB"
  });

  const bounds=new google.maps.LatLngBounds();
  places.forEach(p=>bounds.extend({lat:p.latitude,lng:p.longitude}));
  map.fitBounds(bounds,{top:60,right:60,bottom:60,left:60});

  // Dashed polyline
  const path=places.map(p=>({lat:p.latitude,lng:p.longitude}));
  const lineSymbol={path:"M 0,-1 0,1",strokeOpacity:1,strokeWeight:2.5,scale:3};
  new google.maps.Polyline({
    path:path,
    strokeOpacity:0,
    icons:[{icon:lineSymbol,offset:"0",repeat:"16px"}],
    strokeColor:"#D4845A",
    map:map
  });

  // Numbered markers
  places.forEach((p,i)=>{
    const marker=new google.maps.marker.AdvancedMarkerElement||null;
    const div=document.createElement("div");
    div.style.cssText="width:32px;height:32px;border-radius:50%;background:#D4845A;border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,0.25);font-family:-apple-system,BlinkMacSystemFont,sans-serif";
    div.textContent=String(i+1);

    new google.maps.Marker({
      position:{lat:p.latitude,lng:p.longitude},
      map:map,
      icon:{
        url:"data:image/svg+xml;charset=UTF-8,"+encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="15" fill="%23D4845A" stroke="white" stroke-width="3"/><text x="18" y="23" text-anchor="middle" fill="white" font-size="14" font-weight="800" font-family="sans-serif">'+(i+1)+'</text></svg>'
        ),
        scaledSize:new google.maps.Size(36,36),
        anchor:new google.maps.Point(18,18)
      },
      clickable:false
    });
  });
}
</script>
<script src="https://maps.googleapis.com/maps/api/js?key=${API_KEY}&callback=initMap" async defer></script>
</body></html>`;
};

export const PlanMapModal: React.FC<Props> = ({ visible, onClose, places, title }) => {
  const C = useColors();

  const mapHtml = useMemo(() => {
    if (places.length === 0) return '';
    const html = buildMapHtml(places);
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  }, [places]);

  if (!visible || places.length === 0) return null;

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
        <View style={styles.mapContainer}>
          <iframe
            src={mapHtml}
            style={{ width: '100%', height: '100%', border: 'none' } as any}
            loading="lazy"
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
