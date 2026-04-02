import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Plan, TransportMode } from '../types';
import { Colors, Layout } from '../constants';
import { Avatar } from './Avatar';
import { UserBadge } from './UserBadge';
import { Chip } from './Chip';
import { XpBadge } from './XpBadge';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts hex color strings from a CSS gradient value.
 * e.g. "linear-gradient(135deg, #FF6B35, #FF3B30)" → ["#FF6B35", "#FF3B30"]
 */
export function parseGradient(gradient: string): string[] {
  const matches = gradient.match(/#[0-9A-Fa-f]{3,8}/g);
  return matches ?? [Colors.primary, Colors.black];
}

const TRANSPORT_EMOJI: Record<TransportMode, string> = {
  'Métro': '🚇',
  'Vélo': '🚲',
  'À pied': '🚶',
  'Voiture': '🚗',
  'Trottinette': '🛴',
};

function getTransportEmoji(mode: TransportMode): string {
  return TRANSPORT_EMOJI[mode] ?? '🚶';
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PlanCardProps {
  plan: Plan;
  isLiked: boolean;
  isSaved: boolean;
  onPress: () => void;
  onLike: () => void;
  onSave: () => void;
  onComment: () => void;
  onAuthorPress: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PlanCard: React.FC<PlanCardProps> = ({
  plan,
  isLiked,
  isSaved,
  onPress,
  onLike,
  onSave,
  onComment,
  onAuthorPress,
}) => {
  const gradientColors = parseGradient(plan.gradient);

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.92}
      onPress={onPress}
    >
      {/* ---- User row ---- */}
      <TouchableOpacity
        style={styles.userRow}
        activeOpacity={0.7}
        onPress={onAuthorPress}
      >
        <Avatar
          initials={plan.author.initials}
          bg={plan.author.avatarBg}
          color={plan.author.avatarColor}
          size="M"
          avatarUrl={plan.author.avatarUrl}
        />
        <Text style={styles.displayName}>{plan.author.displayName}</Text>
        <UserBadge type={plan.author.badgeType} small />
        <Text style={styles.timeAgo}>{plan.timeAgo}</Text>
      </TouchableOpacity>

      {/* ---- Gradient banner ---- */}
      <LinearGradient
        colors={gradientColors as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.banner}
      >
        <Text style={styles.bannerTitle}>{plan.title}</Text>
      </LinearGradient>

      {/* ---- Tags row ---- */}
      {plan.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {plan.tags.map((tag, index) => (
            <Chip
              key={tag}
              label={tag}
              variant={index === 0 ? 'filled-black' : 'filled-gray'}
              small
            />
          ))}
        </View>
      )}

      {/* ---- Locations list ---- */}
      {plan.places.length > 0 && (
        <View style={styles.placesList}>
          {plan.places.map((place, index) => (
            <React.Fragment key={place.id}>
              {index > 0 && <View style={styles.placeSeparator} />}
              <View style={styles.placeRow}>
                <View style={styles.orangeDot} />
                <Text style={styles.placeName}>{place.name}</Text>
                <Text style={styles.placeType}>{place.type}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      )}

      {/* ---- Meta row ---- */}
      <View style={styles.metaRow}>
        <Text style={styles.metaItem}>💰 {plan.price}</Text>
        <Text style={styles.metaItem}>⏱ {plan.duration}</Text>
        <Text style={styles.metaItem}>
          {getTransportEmoji(plan.transport)} {plan.transport}
        </Text>
      </View>

      {/* ---- Action bar ---- */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onLike}
          activeOpacity={0.7}
        >
          <Text style={styles.actionIcon}>{isLiked ? '❤️' : '🤍'}</Text>
          <Text style={[styles.actionCount, isLiked && styles.actionCountLiked]}>
            {plan.likesCount}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={onComment}
          activeOpacity={0.7}
        >
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionCount}>{plan.commentsCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={onSave}
          activeOpacity={0.7}
        >
          <Text style={styles.actionIcon}>{isSaved ? '🔖' : '🏷️'}</Text>
        </TouchableOpacity>

        <View style={styles.actionSpacer} />

        <XpBadge xp={plan.xpReward} />
      </View>
    </TouchableOpacity>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Layout.cardRadius,
    marginHorizontal: Layout.screenPadding,
    marginBottom: 14,
    overflow: 'hidden',
  },

  /* User row */
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  displayName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.black,
    marginLeft: 8,
    marginRight: 6,
  },
  timeAgo: {
    fontSize: 12,
    color: Colors.gray700,
    marginLeft: 'auto',
  },

  /* Gradient banner */
  banner: {
    height: 148,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  bannerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.white,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  /* Tags row */
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 14,
    paddingTop: 12,
  },

  /* Places list */
  placesList: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  placeSeparator: {
    height: 1,
    backgroundColor: '#E8E8E8',
    marginVertical: 8,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orangeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.primary,
    marginRight: 8,
  },
  placeName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.black,
    marginRight: 6,
  },
  placeType: {
    fontSize: 12,
    color: Colors.gray700,
  },

  /* Meta row */
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 14,
  },
  metaItem: {
    fontSize: 12,
    color: Colors.gray800,
  },

  /* Action bar */
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  actionIcon: {
    fontSize: 16,
  },
  actionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.gray800,
    marginLeft: 4,
  },
  actionCountLiked: {
    color: Colors.error,
  },
  actionSpacer: {
    flex: 1,
  },
});
