import React, { useEffect, useRef } from 'react';
import { Text, StyleSheet, Animated, Easing } from 'react-native';
import { Fonts } from '../constants';

interface Props {
  small?: boolean;
}

export const FounderBadge: React.FC<Props> = ({ small }) => {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    ).start();
  }, []);

  const borderColor = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['#333333', '#888888', '#333333'],
  });

  const shadowOpacity = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.2, 0.6, 0.2],
  });

  return (
    <Animated.View
      style={[
        styles.badge,
        small && styles.badgeSmall,
        {
          borderColor,
          shadowColor: '#FFFFFF',
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: 6,
          shadowOpacity,
          elevation: 4,
        },
      ]}
    >
      <Text style={[styles.label, small && styles.labelSmall]}>FOUNDER</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1.5,
    backgroundColor: '#0D0D0D',
  },
  badgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  label: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.8,
    color: '#D4AF37',
    fontFamily: Fonts.serifBold,
  },
  labelSmall: {
    fontSize: 8,
    letterSpacing: 1.4,
  },
});
