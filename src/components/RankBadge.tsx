import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Fonts } from '../constants';
import { RankDef } from '../constants/ranks';

interface Props {
  rank: RankDef;
  small?: boolean;
}

export const RankBadge: React.FC<Props> = ({ rank, small }) => {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (rank.shimmer) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(shimmerAnim, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ])
      ).start();
    }
  }, [rank.shimmer]);

  const borderColor = rank.shimmer
    ? shimmerAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [rank.borderColor, rank.color, rank.borderColor],
      })
    : rank.borderColor;

  const shadowOpacity = rank.shimmer
    ? shimmerAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.4, 0] })
    : 0;

  if (rank.shimmer) {
    return (
      <Animated.View
        style={[
          styles.badge,
          { backgroundColor: rank.bgColor, borderColor },
          small && styles.badgeSmall,
          { shadowColor: rank.color, shadowOffset: { width: 0, height: 0 }, shadowRadius: 8, shadowOpacity, elevation: 4 },
        ]}
      >
        <Text style={[styles.emoji, small && styles.emojiSmall]}>{rank.emoji}</Text>
        <Text style={[styles.label, { color: rank.color }, small && styles.labelSmall]}>{rank.name}</Text>
      </Animated.View>
    );
  }

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: rank.bgColor, borderColor: rank.borderColor },
        small && styles.badgeSmall,
      ]}
    >
      <Text style={[styles.emoji, small && styles.emojiSmall]}>{rank.emoji}</Text>
      <Text style={[styles.label, { color: rank.color }, small && styles.labelSmall]}>{rank.name}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    gap: 4,
  },
  badgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  emoji: { fontSize: 11 },
  emojiSmall: { fontSize: 9 },
  label: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: 0.2,
  },
  labelSmall: {
    fontSize: 9,
  },
});
