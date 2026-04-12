import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout, Fonts } from '../constants';
import { EmptyState } from '../components';
import { useSavedPlacesStore } from '../store';
import { useColors } from '../hooks/useColors';
import { SavedPlace } from '../store/savedPlacesStore';

export const SavedPlacesScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const C = useColors();
  const { places: savedPlaces, unsavePlace } = useSavedPlacesStore();

  const renderPlaceItem = ({ item }: { item: SavedPlace }) => (
    <View style={[styles.placeRow, { borderBottomColor: C.borderLight }]}>
      <TouchableOpacity
        style={styles.placePress}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('PlaceDetail', { googlePlaceId: item.placeId })}
      >
        {item.photoUrl ? (
          <Image source={{ uri: item.photoUrl }} style={styles.placeThumb} />
        ) : (
          <View style={[styles.placeThumb, { backgroundColor: C.gray300, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="location" size={20} color={C.gray600} />
          </View>
        )}
        <View style={styles.placeInfo}>
          <Text style={[styles.placeName, { color: C.black }]} numberOfLines={1}>{item.name}</Text>
          {item.rating > 0 && (
            <View style={styles.placeRating}>
              <Ionicons name="star" size={11} color={Colors.primary} />
              <Text style={[styles.placeRatingText, { color: C.black }]}>{item.rating.toFixed(1)}</Text>
              <Text style={[styles.placeReviewCount, { color: C.gray600 }]}>({item.reviewCount})</Text>
            </View>
          )}
          <Text style={[styles.placeAddress, { color: C.gray600 }]} numberOfLines={1}>{item.address}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => unsavePlace(item.placeId)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={0.6}
      >
        <Ionicons name="star" size={20} color={Colors.gold} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={C.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: C.black }]}>Lieux favoris</Text>
        <View style={{ width: 22 }} />
      </View>

      <FlatList
        data={savedPlaces}
        renderItem={renderPlaceItem}
        keyExtractor={(item) => item.placeId}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState icon="📍" title="Aucun lieu sauvegard\u00e9" subtitle="Sauvegarde des lieux depuis Explorer avec \u2b50" />
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 18, fontFamily: Fonts.serifBold, letterSpacing: -0.3 },
  list: { paddingBottom: 20 },
  placeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: Layout.screenPadding, borderBottomWidth: 1, gap: 12 },
  placePress: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  placeThumb: { width: 52, height: 52, borderRadius: 12 },
  placeInfo: { flex: 1, marginLeft: 12 },
  placeName: { fontSize: 14, fontFamily: Fonts.serifBold, marginBottom: 2 },
  placeRating: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 },
  placeRatingText: { fontSize: 12, fontFamily: Fonts.serifSemiBold },
  placeReviewCount: { fontSize: 11 },
  placeAddress: { fontSize: 11 },
});
