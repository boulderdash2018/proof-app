import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../constants';
import { PrimaryButton } from './PrimaryButton';

interface EmptyStateProps {
  icon: string;
  title: string;
  subtitle: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  subtitle,
  ctaLabel,
  onCtaPress,
}) => (
  <View style={styles.container}>
    <Text style={styles.icon}>{icon}</Text>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.subtitle}>{subtitle}</Text>
    {ctaLabel && onCtaPress && (
      <View style={styles.ctaWrap}>
        <PrimaryButton label={ctaLabel} onPress={onCtaPress} small />
      </View>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  icon: {
    fontSize: 44,
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.black,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: Colors.gray700,
    textAlign: 'center',
    lineHeight: 18,
  },
  ctaWrap: {
    marginTop: 18,
  },
});
