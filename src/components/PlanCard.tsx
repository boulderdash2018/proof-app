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
import { useColors } from '../hooks/useColors';
import { Avatar } from './Avatar';
import { UserBadge } from './UserBadge';
import { Chip } from './Chip';
import { XpBadge } from './XpBadge';

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
  const C = useColors();
  const gradientColors = parseGradient(plan.gradient);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: C.white }]}
      activeOpacity={0.92}
      onPress={onPress}
    >
      <TouchableOpacity style={styles.userRow} activeOpacity={0.7} onPress={onAuthorPress}>
        <Avatar initials={plan.author.initials} bg={plan.author.avatarBg} color={plan.author.avatarColor} size="M" avatarUrl={plan.author.avatarUrl} />
        <Text style={[styles.displayName, { color: C.black }]}>{plan.author.displayName}</Text>
        <UserBadge type={plan.author.badgeType} small />
        <Text style={[styles.timeAgo, { color: C.gray700 }]}>{plan.timeAgo}</Text>
      </TouchableOpacity>

      <LinearGradient colors={gradientColors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
        <Text style={styles.bannerTitle}>{plan.title}</Text>
      </LinearGradient>

      {plan.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {plan.tags.map((tag, index) => (
            <Chip key={tag} label={tag} variant={index === 0 ? 'filled-black' : 'filled-gray'} small />
          ))}
        </View>
      )}

      {plan.places.length > 0 && (
        <View style={styles.placesList}>
          {plan.places.map((place, index) => (
            <React.Fragment key={place.id}>
              {index > 0 && <View style={[styles.placeSeparator, { backgroundColor: C.border }]} />}
              <View style={styles.placeRow}>
                <View style={[styles.orangeDot, { backgroundColor: C.primary }]} />
                <Text style={[styles.placeName, { color: C.black }]}>{place.name}</Text>
                <Text style={[styles.placeType, { color: C.gray700 }]}>{place.type}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      )}

      <View style={styles.metaRow}>
        <Text style={[styles.metaItem, { color: C.gray800 }]}>💰 {plan.price}</Text>
        <Text style={[styles.metaItem, { color: C.gray800 }]}>⏱ {plan.duration}</Text>
        <Text style={[styles.metaItem, { color: C.gray800 }]}>{getTransportEmoji(plan.transport)} {plan.transport}</Text>
      </View>

      <View style={[styles.actionBar, { borderTopColor: C.borderLight }]}>
        <TouchableOpacity style={styles.actionButton} onPress={onLike} activeOpacity={0.7}>
          <Text style={styles.actionIcon}>{isLiked ? '❤️' : '🤍'}</Text>
          <Text style={[styles.actionCount, { color: isLiked ? C.error : C.gray800 }]}>{plan.likesCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={onComment} activeOpacity={0.7}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={[styles.actionCount, { color: C.gray800 }]}>{plan.commentsCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={onSave} activeOpacity={0.7}>
          <Text style={styles.actionIcon}>{isSaved ? '🔖' : '🏷️'}</Text>
        </TouchableOpacity>
        <View style={styles.actionSpacer} />
        <XpBadge xp={plan.xpReward} />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: Layout.cardRadius, marginHorizontal: Layout.screenPadding, marginBottom: 14, overflow: 'hidden' },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10 },
  displayName: { fontSize: 14, fontWeight: '700', marginLeft: 8, marginRight: 6 },
  timeAgo: { fontSize: 12, marginLeft: 'auto' },
  banner: { height: 148, justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 14 },
  bannerTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, paddingTop: 12 },
  placesList: { paddingHorizontal: 14, paddingTop: 12 },
  placeSeparator: { height: 1, marginVertical: 8 },
  placeRow: { flexDirection: 'row', alignItems: 'center' },
  orangeDot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 8 },
  placeName: { fontSize: 13, fontWeight: '700', marginRight: 6 },
  placeType: { fontSize: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, gap: 14 },
  metaItem: { fontSize: 12 },
  actionBar: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  actionButton: { flexDirection: 'row', alignItems: 'center', marginRight: 16 },
  actionIcon: { fontSize: 16 },
  actionCount: { fontSize: 12, fontWeight: '600', marginLeft: 4 },
  actionSpacer: { flex: 1 },
});
