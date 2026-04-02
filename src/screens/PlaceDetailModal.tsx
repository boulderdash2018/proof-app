import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Layout } from '../constants';
import { Avatar } from '../components';
import { Place, Plan } from '../types';
import mockApi from '../services/mockApi';

const renderStars = (rating: number, size: number = 14): React.ReactNode => {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <Text
        key={i}
        style={{
          fontSize: size,
          color: i <= Math.round(rating) ? Colors.primary : Colors.gray400,
        }}
      >
        ★
      </Text>
    );
  }
  return <View style={{ flexDirection: 'row' }}>{stars}</View>;
};

export const PlaceDetailModal: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { placeId, planId } = route.params as { placeId: string; planId: string };

  const [place, setPlace] = useState<Place | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPlace = async () => {
      try {
        const plan = await mockApi.getPlanById(planId);
        if (plan) {
          const found = plan.places.find((p) => p.id === placeId);
          if (found) setPlace(found);
        }
      } finally {
        setLoading(false);
      }
    };
    loadPlace();
  }, [planId, placeId]);

  if (loading || !place) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backChevron}>&#8249;</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Chargement...</Text>
          <View style={{ width: 34 }} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </View>
    );
  }

  const maxBarWidth = 120;
  const maxPercent = Math.max(...place.ratingDistribution, 1);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backChevron}>&#8249;</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {place.name}
        </Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Rating Block */}
        <View style={styles.ratingBlock}>
          {/* Left Column */}
          <View style={styles.ratingLeft}>
            <Text style={styles.ratingBig}>{place.rating}</Text>
            {renderStars(place.rating, 16)}
            <Text style={styles.reviewCountText}>{place.reviewCount} avis Proof</Text>
            <View style={styles.addressRow}>
              <Text style={styles.addressPin}>📍</Text>
              <Text style={styles.addressText} numberOfLines={2}>
                {place.address}
              </Text>
            </View>
          </View>

          {/* Right Column - Histogram */}
          <View style={styles.ratingRight}>
            {[5, 4, 3, 2, 1].map((star, index) => {
              const percent = place.ratingDistribution[index];
              const barWidth = (percent / maxPercent) * maxBarWidth;
              return (
                <View key={star} style={styles.histogramRow}>
                  <Text style={styles.histogramLabel}>{star}</Text>
                  <View style={styles.histogramTrack}>
                    <View
                      style={[
                        styles.histogramBar,
                        { width: Math.max(barWidth, 2) },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Reviews Section */}
        <Text style={styles.sectionLabel}>AVIS DE LA COMMUNAUTÉ PROOF</Text>

        {place.reviews.map((review) => (
          <View key={review.id} style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <Avatar
                initials={review.authorInitials}
                bg={review.authorAvatarBg}
                color={review.authorAvatarColor}
                size="S"
              />
              <View style={styles.reviewContent}>
                <Text style={styles.reviewText}>{review.text}</Text>
                <View style={styles.reviewFooter}>
                  {renderStars(review.rating, 12)}
                  <Text style={styles.reviewAuthor}>{review.authorName}</Text>
                </View>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* CTA Button */}
      <View style={[styles.ctaContainer, { paddingBottom: insets.bottom + 14 }]}>
        <TouchableOpacity style={styles.ctaButton} activeOpacity={0.8}>
          <Text style={styles.ctaText}>📍 Noter ce lieu</Text>
        </TouchableOpacity>
        <Text style={styles.ctaSubtitle}>Valide uniquement si tu as fait le plan</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backChevron: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.black,
    marginTop: -2,
  },
  headerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.black,
    textAlign: 'center',
    marginHorizontal: 10,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: Colors.gray700,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  ratingBlock: {
    flexDirection: 'row',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  ratingLeft: {
    flex: 1,
    marginRight: 16,
  },
  ratingBig: {
    fontSize: 54,
    fontWeight: '700',
    color: Colors.black,
    lineHeight: 58,
    marginBottom: 4,
  },
  reviewCountText: {
    fontSize: 12,
    color: Colors.gray700,
    marginTop: 4,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
  },
  addressPin: {
    fontSize: 13,
    marginRight: 4,
    marginTop: 1,
  },
  addressText: {
    fontSize: 12,
    color: Colors.gray700,
    flex: 1,
    lineHeight: 16,
  },
  ratingRight: {
    justifyContent: 'center',
    gap: 4,
  },
  histogramRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  histogramLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.gray700,
    width: 14,
    textAlign: 'right',
    marginRight: 6,
  },
  histogramTrack: {
    width: 120,
    height: 8,
    backgroundColor: Colors.gray300,
    borderRadius: 4,
    overflow: 'hidden',
  },
  histogramBar: {
    height: 8,
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.black,
    letterSpacing: 0.5,
    paddingHorizontal: 18,
    marginTop: 20,
    marginBottom: 14,
  },
  reviewCard: {
    paddingHorizontal: 18,
    marginBottom: 16,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  reviewContent: {
    flex: 1,
    marginLeft: 10,
  },
  reviewText: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.black,
    marginBottom: 6,
  },
  reviewFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reviewAuthor: {
    fontSize: 11,
    color: Colors.gray700,
  },
  ctaContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    alignItems: 'center',
  },
  ctaButton: {
    backgroundColor: Colors.primary,
    borderRadius: Layout.buttonRadius,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  ctaSubtitle: {
    fontSize: 11,
    color: Colors.gray700,
    marginTop: 6,
  },
});
