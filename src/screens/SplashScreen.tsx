import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Colors, Typography } from '../constants';

export const SplashScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 1500,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      navigation.replace('Onboarding');
    }, 2000);

    return () => clearTimeout(timer);
  }, [navigation, opacity]);

  return (
    <View style={styles.container}>
      <Animated.View style={{ opacity }}>
        <Text style={styles.logo}>
          proof<Text style={styles.dot}>.</Text>
        </Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    ...Typography.logo,
    fontSize: 38,
    color: Colors.black,
  },
  dot: {
    color: Colors.primary,
  },
});
