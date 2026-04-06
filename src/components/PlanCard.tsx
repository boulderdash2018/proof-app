import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Plan, TransportMode } from '../types';
import { Colors, Layout, Fonts } from '../constants';
import { useColors } from '../hooks/useColors';
import { Avatar } from './Avatar';
import { UserBadge } from './UserBadge';
import { Chip } from './Chip';
import { XpBadge } from './XpBadge';

export function parseGradient(gradient: string): string[] {
  const matches = gradient.match(/#[0-9A-Fa-f]{3,8}/g);
  return matches ?? [Colors.primary, Colors.black];
}

const TRANSPORT_ICONS: Record<TransportMode, string> = {
  'Métro': 'train-outline',
  'Vélo': 'bicycle-outline',
  'À pied': 'walk-outline',
  'Voiture': 'car-outline',
  'Trottinette': 'flash-outline',
};

function getTransportIcon(mode: TransportMode): string {
  return TRANSPORT_ICONS[mode] ?? 'walk-outline';
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

  const likeScale = useRef(new Animated.Value(1)).current;
  const saveScale = useRef(new Animated.Value(1)).current;

  const animateBounce = (scale: Animated.Value) => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.35, useNativeDriver: true, friction: 3, tension: 200 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 120 }),
    ]).start();
  };

  const handleLikePress = () => {
    animateBounce(likeScale);
    onLike();
  };

  const handleSavePress = () => {
    animateBounce(saveScale);
    onSave();
  };

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: C.gray200, borderColor: C.border }]}
      activeOpacity={0.92}
      onPress={onPress}
    >
      <TouchableOpacity style={styles.userRow} activeOpacity={0.7} onPress={onAuthorPress}>
        <Avatar initials={plan.author.initials} bg={plan.author.avatarBg} color={plan.author.avatarColor} size="M" avatarUrl={plan.author.avatarUrl} />
        <View style={styles.userInfo}>
          <Text style={[styles.displayName, { color: C.black }]}>{plan.author.displayName}</Text>
          <Text style={[styles.timeAgo, { color: C.gray600 }]}>{plan.timeAgo}</Text>
        </View>
        <UserBadge type={plan.author.badgeType} small />
      </TouchableOpacity>

      <View style={styles.bannerWrap}>
        <LinearGradient colors={gradientColors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
          <Text style={styles.bannerTitle}>{plan.title}</Text>
        </LinearGradient>
      </View>

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
                <View style={[styles.placeIndex, { backgroundColor: C.primary + '18' }]}>
                  <Text style={[styles.placeIndexText, { color: C.primary }]}>{index + 1}</Text>
                </View>
                <View style={styles.placeInfo}>
                  <Text style={[styles.placeName, { color: C.black }]}>{place.name}</Text>
                  <Text style={[styles.placeType, { color: C.gray600 }]}>{place.type}</Text>
                </View>
              </View>
            </React.Fragment>
          ))}
        </View>
      )}

      <View style={[styles.metaRow, { borderTopColor: C.border }]}>
        <View style={[styles.metaPill, { backgroundColor: C.gray300 }]}>
          <Ionicons name="cash-outline" size={13} color={C.gold} style={{ marginRight: 4 }} />
          <Text style={[styles.metaItem, { color: C.gray800 }]}>{plan.price}</Text>
        </View>
        <View style={[styles.metaPill, { backgroundColor: C.gray300 }]}>
          <Ionicons name="time-outline" size={13} color={C.gold} style={{ marginRight: 4 }} />
          <Text style={[styles.metaItem, { color: C.gray800 }]}>{plan.duration}</Text>
        </View>
        <View style={[styles.metaPill, { backgroundColor: C.gray300 }]}>
          <Ionicons name={getTransportIcon(plan.transport) as any} size={13} color={C.gold} style={{ marginRight: 4 }} />
          <Text style={[styles.metaItem, { color: C.gray800 }]}>{plan.transport}</Text>
        </View>
      </View>

      <View style={[styles.actionBar, { borderTopColor: C.border }]}>
        <TouchableOpacity style={styles.actionButton} onPress={handleLikePress} activeOpacity={0.7}>
          <Animated.View style={{ transform: [{ scale: likeScale }] }}>
            <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={18} color={isLiked ? C.primary : C.gray600} />
          </Animated.View>
          <Text style={[styles.actionCount, { color: isLiked ? C.primary : C.gray700 }]}>{plan.likesCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={onComment} activeOpacity={0.7}>
          <Ionicons name="chatbubble-outline" size={16} color={C.gray600} />
          <Text style={[styles.actionCount, { color: C.gray700 }]}>{plan.commentsCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={handleSavePress} activeOpacity={0.7}>
          <Animated.View style={{ transform: [{ scale: saveScale }] }}>
            <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={16} color={isSaved ? C.primary : C.gray600} />
          </Animated.View>
        </TouchableOpacity>
        <View style={styles.actionSpacer} />
        <XpBadge xp={plan.xpReward} />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: Layout.cardRadius,
    marginHorizontal: Layout.screenPadding,
    marginBottom: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  userInfo: { flex: 1, marginLeft: 10, marginRight: 8 },
  displayName: { fontSize: 14, fontFamily: Fonts.serifSemiBold },
  timeAgo: { fontSize: 11, marginTop: 1 },
  bannerWrap: { marginHorizontal: 12, borderRadius: 14, overflow: 'hidden' },
  banner: { height: 148, justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 16 },
  bannerTitle: { fontSize: 20, fontFamily: Fonts.serifBold, color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingTop: 12 },
  placesList: { paddingHorizontal: 16, paddingTop: 12 },
  placeSeparator: { height: 1, marginVertical: 6, marginLeft: 36 },
  placeRow: { flexDirection: 'row', alignItems: 'center' },
  placeIndex: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  placeIndexText: { fontSize: 11, fontWeight: '700' },
  placeInfo: { flex: 1 },
  placeName: { fontSize: 13, fontWeight: '600' },
  placeType: { fontSize: 11, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 8, borderTopWidth: 1 },
  metaPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  metaItem: { fontSize: 11, fontWeight: '500' },
  actionBar: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
  actionButton: { flexDirection: 'row', alignItems: 'center', marginRight: 18 },
  actionCount: { fontSize: 12, fontWeight: '600', marginLeft: 5 },
  actionSpacer: { flex: 1 },
});
