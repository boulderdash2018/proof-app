import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Layout } from '../constants';
import { PrimaryButton } from '../components';
import { useTranslation } from '../hooks/useTranslation';

export const OnboardingScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  const SLIDES = [
    { emoji: '🗺️', title: t.onboarding_title_1, subtitle: t.onboarding_sub_1 },
    { emoji: '👥', title: t.onboarding_title_2, subtitle: t.onboarding_sub_2 },
    { emoji: '🏆', title: t.onboarding_title_3, subtitle: t.onboarding_sub_3 },
  ];
  const scrollRef = useRef<ScrollView>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const { width } = useWindowDimensions();

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / width);
    setCurrentPage(page);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.slidesContainer}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {SLIDES.map((slide, index) => (
            <View key={index} style={[styles.slide, { width }]}>
              <Text style={styles.emoji}>{slide.emoji}</Text>
              <Text style={styles.title}>{slide.title}</Text>
              <Text style={styles.subtitle}>{slide.subtitle}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                currentPage === index ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>

        <View style={styles.buttons}>
          <PrimaryButton
            label={currentPage === 2 ? t.onboarding_start : t.next}
            onPress={() => {
              if (currentPage === 2) {
                navigation.navigate('Signup');
              } else {
                scrollRef.current?.scrollTo({ x: (currentPage + 1) * width, animated: true });
              }
            }}
          />
          <Text
            style={styles.loginLink}
            onPress={() => navigation.navigate('Login')}
          >
            {t.onboarding_login}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  slidesContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Layout.screenPadding + 20,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.black,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.gray700,
    textAlign: 'center',
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: 20,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 28,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: Colors.black,
  },
  dotInactive: {
    backgroundColor: Colors.gray500,
  },
  buttons: {
    minHeight: 90,
    gap: 14,
  },
  loginLink: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
