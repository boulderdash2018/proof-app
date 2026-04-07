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
<style>*{margin:0;padding:0}html,body,#map{width:100%;height:100%}</style>
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
    {featureType:"road",elementType:"labels.text.fill",stylers:[{color:"#9E9689"}]},
    {featureType:"road.highway",elementType:"geometry",stylers:[{color:"#DDD5CC"}]},
    {featureType:"water",elementType:"geometry",stylers:[{color:"#C5D5DC"}]},
    {featureType:"water",elementType:"labels.text.fill",stylers:[{color:"#8AA4B0"}]},
    {featureType:"park",elementType:"geometry",stylers:[{color:"#D5DCC5"}]},
    {featureType:"poi",stylers:[{visibility:"off"}]},
    {featureType:"transit",stylers:[{visibility:"off"}]},
    {featureType:"administrative",elementType:"geometry.stroke",stylers:[{color:"#DDD5CC"}]},
    {featureType:"administrative.land_parcel",stylers:[{visibility:"off"}]},
    {featureType:"administrative.neighborhood",elementType:"labels.text.fill",stylers:[{color:"#B5ADA5"}]}
  ];

  const map=new google.maps.Map(document.getElementById("map"),{
    styles:mapStyle,
    disableDefaultUI:true,
    zoomControl:false,
    gestureHandling:"none",
    backgroundColor:"#F5F0EB"
  });

  // Fit to show all places
  const bounds=new google.maps.LatLngBounds();
  places.forEach(p=>bounds.extend({lat:p.latitude,lng:p.longitude}));
  map.fitBounds(bounds,{top:70,right:70,bottom:70,left:70});

  // Add numbered pin markers
  places.forEach((p,i)=>{
    new google.maps.Marker({
      position:{lat:p.latitude,lng:p.longitude},
      map:map,
      icon:{
        url:"data:image/svg+xml;charset=UTF-8,"+encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="52">'
          +'<path d="M20 50 C20 50 2 32 2 18 A18 18 0 1 1 38 18 C38 32 20 50 20 50Z" fill="%23D4845A" stroke="white" stroke-width="2.5"/>'
          +'<circle cx="20" cy="18" r="11" fill="white" opacity="0.25"/>'
          +'<text x="20" y="23" text-anchor="middle" fill="white" font-size="15" font-weight="800" font-family="-apple-system,BlinkMacSystemFont,sans-serif">'+(i+1)+'</text>'
          +'</svg>'
        ),
        scaledSize:new google.maps.Size(34,44),
        anchor:new google.maps.Point(17,44)
      },
      clickable:false,
      zIndex:100+i
    });
  });

  // Draw real walking routes between consecutive places
  if(places.length>=2){
    const ds=new google.maps.DirectionsService();
    const origin={lat:places[0].latitude,lng:places[0].longitude};
    const dest={lat:places[places.length-1].latitude,lng:places[places.length-1].longitude};
    const waypoints=places.slice(1,-1).map(p=>({location:{lat:p.latitude,lng:p.longitude},stopover:true}));

    ds.route({
      origin:origin,
      destination:dest,
      waypoints:waypoints,
      travelMode:google.maps.TravelMode.WALKING,
      optimizeWaypoints:false
    },function(result,status){
      if(status==="OK"&&result){
        // Draw each leg as a dashed polyline
        result.routes[0].legs.forEach(function(leg){
          const dashSymbol={path:"M 0,-1 0,1",strokeOpacity:1,strokeWeight:3,scale:3};
          new google.maps.Polyline({
            path:leg.steps.reduce(function(acc,step){return acc.concat(step.path)},[]),
            strokeOpacity:0,
            icons:[{icon:dashSymbol,offset:"0",repeat:"18px"}],
            strokeColor:"#D4845A",
            map:map,
            zIndex:50
          });
        });
      }else{
        // Fallback: straight dashed lines if directions fail
        const dashSymbol={path:"M 0,-1 0,1",strokeOpacity:1,strokeWeight:2.5,scale:3};
        new google.maps.Polyline({
          path:places.map(function(p){return{lat:p.latitude,lng:p.longitude}}),
          strokeOpacity:0,
          icons:[{icon:dashSymbol,offset:"0",repeat:"16px"}],
          strokeColor:"#D4845A",
          map:map,
          zIndex:50
        });
      }
    });
  }
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
