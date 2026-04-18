import React, { useEffect, useRef } from 'react';
import { Text, StyleSheet, Animated, Easing, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Fonts } from '../constants';

interface Props {
  /** Compact variant for inline contexts (feed card author row, etc.) */
  small?: boolean;
}

/**
 * Premium Founder badge — signature visual for early adopters.
 *
 * Composition:
 *  - Warm gold gradient background (subtle, not gaudy)
 *  - Crisp amber border that breathes with the shimmer
 *  - A tilted sparkle icon leading the label
 *  - A moving highlight band sweeping across the surface (Apple-Card style)
 *  - Soft gold glow shadow
 */
export const FounderBadge: React.FC<Props> = ({ small }) => {
  const shimmer = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Slow border/glow pulse — used for the breathing effect
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(shimmer, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    ).start();

    // Light sweep across the badge — faster, creates the "premium card" feel
    Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 2800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(900),
        Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const borderColor = shimmer.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['#D4A94A', '#F0CC6A', '#D4A94A'],
  });

  const shadowOpacity = shimmer.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.22, 0.4, 0.22],
  });

  // Sweep travels from -60 to +140 (% of badge width) for a diagonal light pass
  const sweepTranslate = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-60, 140],
  });
  const sweepOpacity = sweep.interpolate({
    inputRange: [0, 0.15, 0.85, 1],
    outputRange: [0, 0.7, 0.7, 0],
  });

  return (
    <Animated.View
      style={[
        styles.badge,
        small && styles.badgeSmall,
        {
          borderColor,
          shadowColor: '#D4AF37',
          shadowOffset: { width: 0, height: 2 },
          shadowRadius: 10,
          shadowOpacity,
          elevation: 5,
        },
      ]}
    >
      {/* Warm gold gradient base */}
      <LinearGradient
        colors={['#FFF4D6', '#F8E3A8', '#F2CF7A', '#E8B74A']}
        locations={[0, 0.35, 0.7, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Moving highlight sweep */}
      <Animated.View
        style={[
          styles.sweep,
          {
            opacity: sweepOpacity,
            transform: [{ translateX: sweepTranslate }, { skewX: '-22deg' }],
          },
        ]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={['transparent', 'rgba(255, 255, 255, 0.85)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Content */}
      <View style={styles.inner}>
        <Ionicons
          name="sparkles"
          size={small ? 8 : 10}
          color="#8B5F10"
          style={styles.sparkle}
        />
        <Text style={[styles.label, small && styles.labelSmall]}>FOUNDER</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  badgeSmall: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 99,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sparkle: {
    // Slight offset for visual balance
    marginTop: -0.5,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1.6,
    color: '#6B4A0A',
    fontFamily: Fonts.bodyBold,
    fontWeight: '800' as const,
  },
  labelSmall: {
    fontSize: 8.5,
    letterSpacing: 1.2,
  },
  sweep: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    width: 28,
  },
});
