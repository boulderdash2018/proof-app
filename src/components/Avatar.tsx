import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

interface AvatarProps {
  initials: string;
  bg: string;
  color: string;
  size?: 'XS' | 'SS' | 'S' | 'M' | 'L';
  avatarUrl?: string;
  borderColor?: string;
}

const SIZES = { XS: 16, SS: 20, S: 32, M: 36, L: 74 };
const FONT_SIZES = { XS: 6, SS: 8, S: 11, M: 13, L: 24 };

export const Avatar: React.FC<AvatarProps> = ({
  initials,
  bg,
  color,
  size = 'M',
  avatarUrl,
  borderColor,
}) => {
  const dim = SIZES[size];
  const fontSize = FONT_SIZES[size];

  return (
    <View
      style={[
        styles.container,
        {
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          backgroundColor: bg,
        },
        borderColor ? { borderWidth: 2.5, borderColor } : null,
      ]}
    >
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: dim, height: dim, borderRadius: dim / 2 }}
        />
      ) : (
        <Text style={[styles.initials, { fontSize, color }]}>{initials}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    fontWeight: '700',
  },
});
