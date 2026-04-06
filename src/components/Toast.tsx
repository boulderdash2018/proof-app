import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ToastProps {
  message: string;
  type?: 'success' | 'error';
  visible: boolean;
  onHide: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type = 'success', visible, onHide }) => {
  const translateY = useRef(new Animated.Value(100)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();

      const timer = setTimeout(() => {
        Animated.timing(translateY, {
          toValue: 100,
          duration: 300,
          useNativeDriver: true,
        }).start(() => onHide());
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [visible, translateY, onHide]);

  if (!visible) return null;

  const isError = type === 'error';

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          bottom: insets.bottom + 20,
          backgroundColor: isError ? Colors.errorBg : Colors.successBg,
          borderColor: isError ? Colors.errorBorder : Colors.successBorder,
        },
      ]}
    >
      <Text style={styles.icon}>{isError ? '⚠️' : '✅'}</Text>
      <Text style={[styles.text, { color: isError ? Colors.error : Colors.success }]}>
        {message}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  icon: {
    fontSize: 16,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
});
