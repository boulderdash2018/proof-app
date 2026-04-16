import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { Colors, Layout } from '../constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type SkeletonVariant = 'feed' | 'explore' | 'saves' | 'profile' | 'list';

interface LoadingSkeletonProps {
  count?: number;
  variant?: SkeletonVariant;
}

// ── Pulse wrapper ──
const Pulse: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
};

// ── Skeleton shapes ──
const Box: React.FC<{ w?: number | string; h: number; r?: number; mb?: number; flex?: number }> = ({
  w, h, r = 8, mb = 0, flex,
}) => (
  <View style={{ width: w as any, height: h, borderRadius: r, backgroundColor: Colors.bgTertiary, marginBottom: mb, flex }} />
);

// ── Feed card skeleton (existing design) ──
const FeedSkeleton = () => (
  <Pulse>
    <View style={s.feedCard}>
      <View style={s.row}>
        <Box w={36} h={36} r={18} />
        <Box w={120} h={14} r={7} />
      </View>
      <Box h={148} r={16} mb={12} />
      <View style={[s.row, { gap: 8, marginBottom: 12 }]}>
        <Box w={80} h={26} r={20} />
        <Box w={70} h={26} r={20} />
      </View>
      <View style={[s.row, { gap: 16 }]}>
        <Box w={60} h={12} r={6} />
        <Box w={60} h={12} r={6} />
        <Box w={60} h={12} r={6} />
      </View>
    </View>
  </Pulse>
);

// ── Explore: 2 rows of category chips + grid cards ──
const ExploreSkeleton = () => {
  const cardW = (SCREEN_WIDTH - Layout.screenPadding * 2 - 10) / 2;
  return (
    <Pulse>
      <View style={s.exploreWrap}>
        {/* Chip row */}
        <View style={[s.row, { gap: 8, marginBottom: 12 }]}>
          <Box w={72} h={32} r={16} />
          <Box w={60} h={32} r={16} />
          <Box w={80} h={32} r={16} />
          <Box w={55} h={32} r={16} />
        </View>
        <View style={[s.row, { gap: 8, marginBottom: 16 }]}>
          <Box w={90} h={32} r={16} />
          <Box w={75} h={32} r={16} />
          <Box w={65} h={32} r={16} />
        </View>
        {/* Grid */}
        <View style={[s.row, { gap: 10, flexWrap: 'wrap' }]}>
          <Box w={cardW} h={110} r={16} mb={10} />
          <Box w={cardW} h={110} r={16} mb={10} />
          <Box w={cardW} h={110} r={16} mb={10} />
          <Box w={cardW} h={110} r={16} mb={10} />
        </View>
      </View>
    </Pulse>
  );
};

// ── Saves: cards with banner ──
const SavesSkeleton = () => (
  <Pulse>
    <View style={s.savesWrap}>
      {/* Tab bar */}
      <View style={[s.row, { gap: 8, marginBottom: 14 }]}>
        <Box h={36} r={12} flex={1} />
        <Box h={36} r={12} flex={1} />
      </View>
      {/* Cards */}
      {[1, 2, 3].map((i) => (
        <View key={i} style={s.savesCard}>
          <Box h={100} r={0} mb={0} />
          <View style={{ padding: 12 }}>
            <View style={[s.row, { gap: 6, marginBottom: 8 }]}>
              <Box w={80} h={10} r={5} />
              <Box w={40} h={10} r={5} />
              <Box w={50} h={10} r={5} />
            </View>
            <View style={[s.row, { gap: 6 }]}>
              <Box w={60} h={22} r={12} />
              <Box w={75} h={22} r={12} />
            </View>
          </View>
        </View>
      ))}
    </View>
  </Pulse>
);

// ── Profile skeleton ──
const ProfileSkeleton = () => (
  <Pulse>
    <View style={s.profileWrap}>
      <View style={{ alignItems: 'center', marginBottom: 20 }}>
        <Box w={72} h={72} r={36} mb={12} />
        <Box w={140} h={16} r={8} mb={6} />
        <Box w={90} h={12} r={6} mb={12} />
      </View>
      <View style={[s.row, { justifyContent: 'space-around', marginBottom: 20 }]}>
        <View style={{ alignItems: 'center' }}>
          <Box w={30} h={18} r={6} mb={4} />
          <Box w={50} h={10} r={5} />
        </View>
        <View style={{ alignItems: 'center' }}>
          <Box w={30} h={18} r={6} mb={4} />
          <Box w={50} h={10} r={5} />
        </View>
        <View style={{ alignItems: 'center' }}>
          <Box w={30} h={18} r={6} mb={4} />
          <Box w={50} h={10} r={5} />
        </View>
      </View>
      {[1, 2].map((i) => (
        <View key={i} style={s.feedCard}>
          <Box h={120} r={14} mb={10} />
          <Box w={180} h={14} r={7} mb={6} />
          <Box w={120} h={10} r={5} />
        </View>
      ))}
    </View>
  </Pulse>
);

// ── Generic list skeleton ──
const ListSkeleton = () => (
  <Pulse>
    <View style={s.listWrap}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[s.row, { gap: 12, marginBottom: 16 }]}>
          <Box w={44} h={44} r={12} />
          <View style={{ flex: 1 }}>
            <Box w="70%" h={14} r={7} mb={6} />
            <Box w="50%" h={10} r={5} />
          </View>
        </View>
      ))}
    </View>
  </Pulse>
);

// ── Map variant → component ──
const VARIANTS: Record<SkeletonVariant, React.FC> = {
  feed: FeedSkeleton,
  explore: ExploreSkeleton,
  saves: SavesSkeleton,
  profile: ProfileSkeleton,
  list: ListSkeleton,
};

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ count = 3, variant = 'feed' }) => {
  const Component = VARIANTS[variant];
  if (variant !== 'feed') return <Component />;
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <Component key={i} />
      ))}
    </View>
  );
};

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  feedCard: {
    backgroundColor: Colors.white,
    borderRadius: Layout.cardRadius,
    marginHorizontal: Layout.screenPadding,
    marginBottom: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  exploreWrap: { paddingHorizontal: Layout.screenPadding, paddingTop: 8 },
  savesWrap: { paddingHorizontal: Layout.screenPadding },
  savesCard: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, marginBottom: 12 },
  profileWrap: { paddingHorizontal: Layout.screenPadding, paddingTop: 12 },
  listWrap: { paddingHorizontal: Layout.screenPadding, paddingTop: 12 },
});
