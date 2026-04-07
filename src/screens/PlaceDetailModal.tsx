import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout, Fonts } from '../constants';
import { useColors } from '../hooks/useColors';
import { useTranslation } from '../hooks/useTranslation';
import { Place } from '../types';
import mockApi from '../services/mockApi';
import { getPlaceDetails, getReadableType, priceLevelToSymbol, GooglePlaceDetails } from '../services/googlePlacesService';

export const PlaceDetailModal: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { placeId, planId, googlePlaceId } = route.params as {
    placeId?: string;
    planId?: string;
    googlePlaceId?: string;
  };
  const C = useColors();
  const { t } = useTranslation();

  const [place, setPlace] = useState<Place | null>(null);
  const [googlePlace, setGooglePlace] = useState<GooglePlaceDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        // If we have a googlePlaceId (from Explore or from a plan place with google data), fetch from API
        const gId = googlePlaceId || placeId;
        if (gId) {
          const details = await getPlaceDetails(gId);
          if (details) {
            setGooglePlace(details);
            setLoading(false);
            return;
          }
        }
        // Fallback: load from plan (legacy mock data)
        if (planId && placeId) {
          const plan = await mockApi.getPlanById(planId);
          if (plan) {
            const found = plan.places.find((p) => p.id === placeId);
            if (found) setPlace(found);
          }
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [planId, placeId, googlePlaceId]);

  const renderStars = (rating: number, size: number = 14) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Ionicons
          key={i}
          name={i <= Math.round(rating) ? 'star' : 'star-outline'}
          size={size}
          color={i <= Math.round(rating) ? C.primary : C.gray400}
        />
      );
    }
    return <View style={{ flexDirection: 'row', gap: 1 }}>{stars}</View>;
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
        <View style={[styles.header, { borderBottomColor: C.borderLight, backgroundColor: C.white }]}>
          <TouchableOpacity style={[styles.backBtn, { backgroundColor: C.gray200 }]} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={18} color={C.black} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: C.black }]}>{t.loading}</Text>
          <View style={{ width: 34 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={C.primary} size="large" />
        </View>
      </View>
    );
  }

  // =============== GOOGLE PLACE VIEW ===============
  if (googlePlace) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
        <View style={[styles.header, { borderBottomColor: C.borderLight, backgroundColor: C.white }]}>
          <TouchableOpacity style={[styles.backBtn, { backgroundColor: C.gray200 }]} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={18} color={C.black} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: C.black }]} numberOfLines={1}>{googlePlace.name}</Text>
          <View style={{ width: 34 }} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 30 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Photos */}
          {googlePlace.photoUrls.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScroll} contentContainerStyle={styles.photosContainer}>
              {googlePlace.photoUrls.map((url, i) => (
                <Image key={i} source={{ uri: url }} style={styles.photo} />
              ))}
            </ScrollView>
          )}

          {/* Rating + Info */}
          <View style={[styles.ratingBlock, { borderBottomColor: C.border }]}>
            <View style={styles.ratingLeft}>
              {googlePlace.rating > 0 && (
                <>
                  <Text style={[styles.ratingBig, { color: C.black }]}>{googlePlace.rating.toFixed(1)}</Text>
                  {renderStars(googlePlace.rating, 16)}
                  <Text style={[styles.reviewCountText, { color: C.gray700 }]}>{googlePlace.reviewCount} avis Google</Text>
                </>
              )}
              <View style={styles.typePriceRow}>
                <Text style={[styles.typeLabel, { color: C.primary }]}>{getReadableType(googlePlace.types)}</Text>
                {googlePlace.priceLevel !== undefined && (
                  <Text style={[styles.priceLabel, { color: C.gray700 }]}> · {priceLevelToSymbol(googlePlace.priceLevel)}</Text>
                )}
              </View>
            </View>
          </View>

          {/* Address */}
          <View style={[styles.infoSection, { borderBottomColor: C.border }]}>
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={18} color={C.gold} />
              <Text style={[styles.infoText, { color: C.gray800 }]}>{googlePlace.address}</Text>
            </View>
            {googlePlace.phoneNumber && (
              <TouchableOpacity style={styles.infoRow} onPress={() => Linking.openURL(`tel:${googlePlace.phoneNumber}`)}>
                <Ionicons name="call-outline" size={18} color={C.gold} />
                <Text style={[styles.infoText, { color: C.primary }]}>{googlePlace.phoneNumber}</Text>
              </TouchableOpacity>
            )}
            {googlePlace.website && (
              <TouchableOpacity style={styles.infoRow} onPress={() => Linking.openURL(googlePlace.website!)}>
                <Ionicons name="globe-outline" size={18} color={C.gold} />
                <Text style={[styles.infoText, { color: C.primary }]} numberOfLines={1}>Site web</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Opening Hours */}
          {googlePlace.openingHours && googlePlace.openingHours.length > 0 && (
            <View style={[styles.hoursSection, { borderBottomColor: C.border }]}>
              <View style={styles.hoursTitleRow}>
                <Ionicons name="time-outline" size={18} color={C.gold} />
                <Text style={[styles.hoursTitle, { color: C.black }]}>Horaires</Text>
              </View>
              {googlePlace.openingHours.map((line, i) => (
                <Text key={i} style={[styles.hoursLine, { color: C.gray800 }]}>{line}</Text>
              ))}
            </View>
          )}

          {/* Google Reviews */}
          {googlePlace.reviews.length > 0 && (
            <View style={styles.reviewsSection}>
              <Text style={[styles.sectionLabel, { color: C.black }]}>Avis Google ({googlePlace.reviews.length})</Text>
              {googlePlace.reviews.map((review, i) => (
                <View key={i} style={[styles.reviewCard, { borderBottomColor: C.borderLight }]}>
                  <View style={styles.reviewHeader}>
                    <View style={[styles.reviewAvatar, { backgroundColor: C.gray300 }]}>
                      <Ionicons name="person" size={16} color={C.gray600} />
                    </View>
                    <View style={styles.reviewContent}>
                      <View style={styles.reviewTopRow}>
                        <Text style={[styles.reviewAuthorName, { color: C.black }]}>{review.authorName}</Text>
                        <Text style={[styles.reviewTime, { color: C.gray600 }]}>{review.relativeTime}</Text>
                      </View>
                      {renderStars(review.rating, 12)}
                      {review.text ? (
                        <Text style={[styles.reviewText, { color: C.gray800 }]}>{review.text}</Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // =============== LEGACY PLAN PLACE VIEW ===============
  if (!place) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
        <View style={[styles.header, { borderBottomColor: C.borderLight, backgroundColor: C.white }]}>
          <TouchableOpacity style={[styles.backBtn, { backgroundColor: C.gray200 }]} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={18} color={C.black} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: C.black }]}>Lieu introuvable</Text>
          <View style={{ width: 34 }} />
        </View>
      </View>
    );
  }

  const maxBarWidth = 120;
  const maxPercent = Math.max(...place.ratingDistribution, 1);

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: C.white }]}>
      <View style={[styles.header, { borderBottomColor: C.borderLight, backgroundColor: C.white }]}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: C.gray200 }]} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={18} color={C.black} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: C.black }]} numberOfLines={1}>{place.name}</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 30 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.ratingBlock, { borderBottomColor: C.border }]}>
          <View style={styles.ratingLeft}>
            <Text style={[styles.ratingBig, { color: C.black }]}>{place.rating}</Text>
            {renderStars(place.rating, 16)}
            <Text style={[styles.reviewCountText, { color: C.gray700 }]}>{place.reviewCount} {t.place_reviews_proof}</Text>
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={14} color={C.gold} />
              <Text style={[styles.addressText, { color: C.gray700 }]} numberOfLines={2}>{place.address}</Text>
            </View>
          </View>
          <View style={styles.ratingRight}>
            {[5, 4, 3, 2, 1].map((star, index) => {
              const percent = place.ratingDistribution[index];
              const barWidth = (percent / maxPercent) * maxBarWidth;
              return (
                <View key={star} style={styles.histogramRow}>
                  <Text style={[styles.histogramLabel, { color: C.gray700 }]}>{star}</Text>
                  <View style={[styles.histogramTrack, { backgroundColor: C.gray300 }]}>
                    <View style={[styles.histogramBar, { width: Math.max(barWidth, 2), backgroundColor: C.primary }]} />
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {place.reviews.length > 0 && (
          <View style={styles.reviewsSection}>
            <Text style={[styles.sectionLabel, { color: C.black }]}>{t.place_community_reviews}</Text>
            {place.reviews.map((review) => (
              <View key={review.id} style={[styles.reviewCard, { borderBottomColor: C.borderLight }]}>
                <View style={styles.reviewHeader}>
                  <View style={[styles.reviewAvatar, { backgroundColor: review.authorAvatarBg }]}>
                    <Text style={{ fontSize: 12, color: review.authorAvatarColor }}>{review.authorInitials}</Text>
                  </View>
                  <View style={styles.reviewContent}>
                    <View style={styles.reviewTopRow}>
                      <Text style={[styles.reviewAuthorName, { color: C.black }]}>{review.authorName}</Text>
                    </View>
                    {renderStars(review.rating, 12)}
                    <Text style={[styles.reviewText, { color: C.gray800 }]}>{review.text}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1,
  },
  backBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 15, fontFamily: Fonts.serifBold, textAlign: 'center', marginHorizontal: 10 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 120 },

  // Photos
  photosScroll: { flexGrow: 0 },
  photosContainer: { paddingHorizontal: 14, paddingVertical: 14, gap: 8 },
  photo: { width: 220, height: 160, borderRadius: 14 },

  // Rating
  ratingBlock: { flexDirection: 'row', padding: 18, borderBottomWidth: 1 },
  ratingLeft: { flex: 1, marginRight: 16 },
  ratingBig: { fontSize: 48, fontFamily: Fonts.serifBold, lineHeight: 52, marginBottom: 4 },
  reviewCountText: { fontSize: 12, fontFamily: Fonts.serif, marginTop: 4 },
  typePriceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  typeLabel: { fontSize: 13, fontFamily: Fonts.serifSemiBold },
  priceLabel: { fontSize: 13, fontFamily: Fonts.serif },
  ratingRight: { justifyContent: 'center', gap: 4 },
  histogramRow: { flexDirection: 'row', alignItems: 'center' },
  histogramLabel: { fontSize: 11, fontFamily: Fonts.serifSemiBold, width: 14, textAlign: 'right', marginRight: 6 },
  histogramTrack: { width: 120, height: 8, borderRadius: 4, overflow: 'hidden' },
  histogramBar: { height: 8, borderRadius: 4 },

  // Info section
  infoSection: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  infoText: { fontSize: 13, fontFamily: Fonts.serif, flex: 1 },
  addressText: { fontSize: 12, fontFamily: Fonts.serif, flex: 1, lineHeight: 16 },

  // Hours
  hoursSection: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1 },
  hoursTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  hoursTitle: { fontSize: 14, fontFamily: Fonts.serifBold },
  hoursLine: { fontSize: 12, fontFamily: Fonts.serif, lineHeight: 20, paddingLeft: 28 },

  // Reviews
  reviewsSection: { paddingTop: 18 },
  sectionLabel: { fontSize: 14, fontFamily: Fonts.serifBold, letterSpacing: 0.5, paddingHorizontal: 18, marginBottom: 14 },
  reviewCard: { paddingHorizontal: 18, paddingBottom: 14, marginBottom: 14, borderBottomWidth: 1 },
  reviewHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  reviewAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  reviewContent: { flex: 1, marginLeft: 10 },
  reviewTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  reviewAuthorName: { fontSize: 13, fontFamily: Fonts.serifBold },
  reviewTime: { fontSize: 11, fontFamily: Fonts.serif },
  reviewText: { fontSize: 13, fontFamily: Fonts.serif, lineHeight: 18, marginTop: 6 },
});
