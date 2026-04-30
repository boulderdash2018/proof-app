import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { CoAuthor, User } from '../types';

interface Author {
  avatarUrl?: string | null;
  initials: string;
  avatarBg: string;
  avatarColor: string;
}

interface Props {
  /** Main author (always rendered first / leftmost). */
  mainAuthor: Author;
  /** Optional co-authors — rendered after the main author with overlap. */
  coAuthors?: CoAuthor[];
  /** Size in px of each avatar. Stack overlaps each subsequent avatar
   *  by ~30 % of this size, so the total width grows roughly linearly. */
  size?: number;
  /** Border ring color around each avatar — gives the visual separation
   *  between overlapped circles. Should match the surface behind (white
   *  on a light card, dark on a dark hero, etc.). */
  borderColor?: string;
  /** Cap the number of visible avatars. Defaults to 3 (Instagram-ish).
   *  Beyond this, the extras are folded into the byline text rather
   *  than stacked further — keeps the row narrow on small screens. */
  maxVisible?: number;
}

/**
 * Instagram-style horizontal avatar stack used on co-authored Plan
 * bylines. The main author sits on the left ; co-authors overlap to
 * the right with a small white ring around each circle for visual
 * separation.
 *
 * If there are no co-authors, falls back to a single avatar — keeps
 * the byline footprint identical to a solo plan in that case.
 *
 * Sizing examples (size = 20) :
 *   • Solo : 20 px wide
 *   • Pair : 32 px wide
 *   • Trio : 44 px wide
 */
export const CoAuthorAvatarStack: React.FC<Props> = ({
  mainAuthor,
  coAuthors,
  size = 20,
  borderColor = '#FFFFFF',
  maxVisible = 3,
}) => {
  // Pre-compute the overlap delta — 30 % of the avatar width.
  const overlap = Math.round(size * 0.3);
  const ringWidth = Math.max(1, Math.round(size / 16));

  // Build the avatar list (main + co-authors), capped to `maxVisible`.
  const allAuthors: Author[] = [
    mainAuthor,
    ...(coAuthors ?? []).map((c) => ({
      avatarUrl: c.avatarUrl,
      initials: c.initials,
      avatarBg: c.avatarBg,
      avatarColor: c.avatarColor,
    })),
  ];
  const visible = allAuthors.slice(0, maxVisible);

  return (
    <View style={[styles.row, { height: size + ringWidth * 2 }]}>
      {visible.map((a, i) => (
        <View
          key={i}
          style={[
            styles.avatarWrap,
            {
              width: size + ringWidth * 2,
              height: size + ringWidth * 2,
              borderRadius: (size + ringWidth * 2) / 2,
              backgroundColor: borderColor,
              marginLeft: i === 0 ? 0 : -overlap,
              zIndex: visible.length - i,
            },
          ]}
        >
          <View
            style={[
              styles.avatar,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: a.avatarBg,
              },
            ]}
          >
            {a.avatarUrl ? (
              <Image
                source={{ uri: a.avatarUrl }}
                style={{ width: size, height: size, borderRadius: size / 2 }}
              />
            ) : (
              <Text
                style={[
                  styles.initials,
                  { color: a.avatarColor, fontSize: Math.round(size * 0.42) },
                ]}
              >
                {a.initials}
              </Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
};

// ══════════════════════════════════════════════════════════════
// Helper — convert a User into the Author shape (used by callers
// that have a User object handy and don't want to spread manually).
// ══════════════════════════════════════════════════════════════
export const userToAuthor = (u: User | null | undefined): Author | null => {
  if (!u) return null;
  return {
    avatarUrl: u.avatarUrl ?? null,
    initials: u.initials,
    avatarBg: u.avatarBg,
    avatarColor: u.avatarColor,
  };
};

// ══════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    fontWeight: '700',
  },
});
