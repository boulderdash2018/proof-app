import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Colors, Layout } from '../constants';

interface LoadingSkeletonProps {
  count?: number;
}

const SkeletonCard: React.FC = () => {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={styles.userRow}>
        <View style={styles.avatarPlaceholder} />
        <View style={styles.namePlaceholder} />
      </View>
      <View style={styles.bannerPlaceholder} />
      <View style={styles.tagsRow}>
        <View style={styles.tagPlaceholder} />
        <View style={[styles.tagPlaceholder, { width: 70 }]} />
      </View>
      <View style={styles.metaRow}>
        <View style={styles.metaPlaceholder} />
        <View style={styles.metaPlaceholder} />
        <View style={styles.metaPlaceholder} />
      </View>
    </Animated.View>
  );
};

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ count = 3 }) => (
  <View>
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Layout.cardRadius,
    marginHorizontal: Layout.screenPadding,
    marginBottom: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.gray300,
  },
  namePlaceholder: {
    width: 120,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.gray300,
    marginLeft: 10,
  },
  bannerPlaceholder: {
    height: 148,
    borderRadius: 16,
    backgroundColor: Colors.gray300,
    marginBottom: 12,
  },
  tagsRow: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  tagPlaceholder: {
    width: 80,
    height: 26,
    borderRadius: 20,
    backgroundColor: Colors.gray300,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
  },
  metaPlaceholder: {
    width: 60,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.gray300,
  },
});
