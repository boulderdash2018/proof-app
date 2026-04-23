import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Fonts } from '../constants';

interface MosaicParticipant {
  initials: string;
  avatarBg: string;
  avatarColor: string;
  avatarUrl: string | null;
}

interface GroupMosaicAvatarProps {
  participants: MosaicParticipant[];
  size?: number;
  /** Border color for the overlap ring. Defaults to Colors.bgPrimary. */
  borderColor?: string;
}

/**
 * Displays up to 2 participant avatars overlapped diagonally — Messenger-style.
 *
 * • 0 participants → fallback icon (people)
 * • 1 participant  → single circular avatar
 * • 2+ participants → top-left + bottom-right overlap with 2px border
 */
export const GroupMosaicAvatar: React.FC<GroupMosaicAvatarProps> = ({
  participants,
  size = 50,
  borderColor = Colors.bgPrimary,
}) => {
  const shown = participants.slice(0, 2);
  const subSize = Math.round(size * 0.68);

  if (shown.length === 0) {
    return (
      <View
        style={[
          styles.frame,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: Colors.bgTertiary,
          },
        ]}
      >
        <Ionicons name="people" size={Math.round(size * 0.4)} color={Colors.textTertiary} />
      </View>
    );
  }

  if (shown.length === 1) {
    const p = shown[0];
    return (
      <View
        style={[
          styles.frame,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: p.avatarBg,
          },
        ]}
      >
        {p.avatarUrl ? (
          <Image
            source={{ uri: p.avatarUrl }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
          />
        ) : (
          <Text style={[styles.initials, { color: p.avatarColor, fontSize: size * 0.38 }]}>
            {p.initials}
          </Text>
        )}
      </View>
    );
  }

  const [a, b] = shown;
  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      <View
        style={[
          styles.subAvatar,
          {
            top: 0,
            left: 0,
            width: subSize,
            height: subSize,
            borderRadius: subSize / 2,
            backgroundColor: a.avatarBg,
            borderColor,
          },
        ]}
      >
        {a.avatarUrl ? (
          <Image
            source={{ uri: a.avatarUrl }}
            style={{ width: subSize, height: subSize, borderRadius: subSize / 2 }}
          />
        ) : (
          <Text style={[styles.initials, { color: a.avatarColor, fontSize: subSize * 0.4 }]}>
            {a.initials}
          </Text>
        )}
      </View>
      <View
        style={[
          styles.subAvatar,
          {
            top: size - subSize,
            left: size - subSize,
            width: subSize,
            height: subSize,
            borderRadius: subSize / 2,
            backgroundColor: b.avatarBg,
            borderColor,
          },
        ]}
      >
        {b.avatarUrl ? (
          <Image
            source={{ uri: b.avatarUrl }}
            style={{ width: subSize, height: subSize, borderRadius: subSize / 2 }}
          />
        ) : (
          <Text style={[styles.initials, { color: b.avatarColor, fontSize: subSize * 0.4 }]}>
            {b.initials}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  subAvatar: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
  },
  initials: {
    fontFamily: Fonts.bodyBold,
  },
});
