import React, { useEffect, useMemo } from 'react';
import { Animated, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { Colors, Fonts } from '../constants';

/**
 * Horizontal pull-to-refresh indicator for the feed.
 *
 * Sits behind the first card. When the user overscrolls right (the first
 * card slides right under their finger, revealing empty space to the left),
 * the dot scales in and the Fraunces label updates as they cross the
 * threshold. On release, the parent triggers a refresh and we show a
 * spinner until the new data lands.
 *
 * All scaling/opacity uses the native driver — the JS side only flips the
 * label text via the `pastThreshold` boolean.
 */
export interface PullToRefreshIndicatorProps {
  /** Parent FlatList horizontal scroll position (negative when pulling). */
  scrollX: Animated.Value;
  /** Pixels of pull required to commit a refresh. */
  threshold: number;
  /** True once the user has pulled past `threshold` (drives label). */
  pastThreshold: boolean;
  /** True while the refresh is in flight (shows spinner, locks UI). */
  isRefreshing: boolean;
}

export const PullToRefreshIndicator: React.FC<PullToRefreshIndicatorProps> = ({
  scrollX,
  threshold,
  pastThreshold,
  isRefreshing,
}) => {
  // Convert "scrollX in [-threshold*1.5, 0]" into "overscroll in [0, threshold*1.5]"
  // so the math below reads naturally as a positive pull amount.
  const overscroll = useMemo(
    () =>
      scrollX.interpolate({
        inputRange: [-threshold * 1.5, 0],
        outputRange: [threshold * 1.5, 0],
        extrapolate: 'clamp',
      }),
    [scrollX, threshold],
  );

  // Whole indicator fades in starting at ~10px of pull, fully visible at threshold.
  const containerOpacity = useMemo(
    () =>
      overscroll.interpolate({
        inputRange: [10, threshold],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    [overscroll, threshold],
  );

  // Indicator slides in from the left edge as the user reveals the space.
  const containerTranslateX = useMemo(
    () =>
      overscroll.interpolate({
        inputRange: [0, threshold],
        outputRange: [-12, 0],
        extrapolate: 'clamp',
      }),
    [overscroll, threshold],
  );

  // The Proof "." dot grows from 0 to full size, with a tiny over-pop past the threshold.
  const dotScale = useMemo(
    () =>
      overscroll.interpolate({
        inputRange: [10, threshold, threshold * 1.3],
        outputRange: [0, 1, 1.08],
        extrapolate: 'clamp',
      }),
    [overscroll, threshold],
  );

  // Soft pulse when the threshold is crossed (purely cosmetic feedback).
  const labelOpacity = useMemo(
    () =>
      overscroll.interpolate({
        inputRange: [threshold * 0.5, threshold],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    [overscroll, threshold],
  );

  // Hide the indicator entirely once we're not interacting (no overscroll, not refreshing).
  // Prevents stale opacity flashes on first mount before the listener has fired.
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        {
          opacity: isRefreshing ? 1 : containerOpacity,
          transform: [{ translateX: isRefreshing ? 0 : containerTranslateX }],
        },
      ]}
    >
      {isRefreshing ? (
        <View style={styles.dotPlaceholder}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      ) : (
        <Animated.View style={[styles.dot, { transform: [{ scale: dotScale }] }]} />
      )}
      <Animated.Text
        style={[
          styles.label,
          { opacity: isRefreshing ? 1 : labelOpacity },
        ]}
        numberOfLines={1}
      >
        {isRefreshing ? 'Rafraîchissement…' : pastThreshold ? 'Lâchez pour rafraîchir' : 'Tirez pour rafraîchir'}
      </Animated.Text>
    </Animated.View>
  );
};

const DOT_SIZE = 18;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 26,
    top: 0,
    bottom: 0,
    width: 110,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  } as any,
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  dotPlaceholder: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 12,
    fontFamily: Fonts.displayItalic,
    color: Colors.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.1,
  },
});
