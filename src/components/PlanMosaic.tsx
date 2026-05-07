import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Dimensions,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Fonts, Layout } from '../constants';
import { Plan } from '../types';

/**
 * PlanMosaic — grille mosaïque "DA Saves V2" pour lister des plans.
 *
 * Layout : 2 cells larges en hero (50% width chacune, ratio 1:1.3) suivies
 * d'une grille 3-col carrée pour le reste. Pattern partagé entre :
 *   • ExploreScreen — résultats d'un filtre catégorie / thème
 *   • SearchScreen — résultats d'une recherche texte
 * pour garantir une cohérence visuelle sur tout l'écosystème de listing.
 *
 * Chaque cell : photo (ou dégradé fallback), pill méta top-left
 * (€ · durée · ❤), titre Fraunces italique blanc en bas. Animations :
 * stagger fade-in + press scale ressort.
 */

const { width } = Dimensions.get('window');
const HERO_W = (width - Layout.screenPadding * 2 - 8) / 2;
const HERO_H = HERO_W * 1.3;
const SQ = (width - Layout.screenPadding * 2 - 8 * 2) / 3;

// Helpers (privés au module) ───────────────────────────────────
const parseGradientColors = (gradient: string): string[] => {
  const matches = gradient.match(/#[0-9A-Fa-f]{6}/g);
  return matches && matches.length >= 2 ? matches : ['#8B6A50', '#5C4030'];
};

const getPlanPhoto = (plan: Plan): string | null => {
  if (plan.coverPhotos && plan.coverPhotos.length > 0) return plan.coverPhotos[0];
  for (const place of plan.places ?? []) {
    if (place.photoUrls && place.photoUrls.length > 0) return place.photoUrls[0];
  }
  return null;
};

// ResultCell sub-component ─────────────────────────────────────
interface ResultCellProps {
  plan: Plan;
  size: 'large' | 'square';
  delay: number;
  onPress: () => void;
}

const ResultCell: React.FC<ResultCellProps> = ({ plan, size, delay, onPress }) => {
  const entryAnim = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(entryAnim, {
      toValue: 1, friction: 8, tension: 60,
      delay, useNativeDriver: true,
    }).start();
  }, [entryAnim, delay]);

  const onPressIn = () => {
    Animated.spring(pressScale, { toValue: 0.96, friction: 7, tension: 200, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    Animated.spring(pressScale, { toValue: 1, friction: 5, tension: 200, useNativeDriver: true }).start();
  };
  const handleTap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  const photo = getPlanPhoto(plan);
  const gradientColors = parseGradientColors(plan.gradient) as [string, string];
  const cellStyle = size === 'large' ? cellStyles.large : cellStyles.square;
  const titleStyle = size === 'large' ? cellStyles.titleLarge : cellStyles.titleSquare;
  const showAuthorByline = size === 'large';

  return (
    <Animated.View
      style={{
        opacity: entryAnim,
        transform: [
          { scale: pressScale },
          { translateY: entryAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
        ],
      }}
    >
      <Pressable onPress={handleTap} onPressIn={onPressIn} onPressOut={onPressOut} style={cellStyle}>
        {photo ? (
          <Image source={{ uri: photo }} style={StyleSheet.absoluteFillObject as any} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={gradientColors as any}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}

        {/* Dégradé sombre bas — lisibilité du titre blanc */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.7)']}
          locations={[0.4, 0.7, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Mini pill méta top-left */}
        <View style={cellStyles.metaPill}>
          <Ionicons name="cash-outline" size={10} color={Colors.gold} />
          <Text style={cellStyles.metaPillText}>{plan.price}</Text>
          <View style={cellStyles.metaSep} />
          <Ionicons name="hourglass-outline" size={10} color={Colors.gold} />
          <Text style={cellStyles.metaPillText}>{plan.duration}</Text>
          <View style={cellStyles.metaSep} />
          <Ionicons name="heart" size={10} color={Colors.primary} />
          <Text style={cellStyles.metaPillText}>{plan.likesCount}</Text>
        </View>

        {/* Bottom : auteur byline (large only) + titre */}
        <View style={cellStyles.bottom}>
          {showAuthorByline && plan.author?.username && (
            <Text style={cellStyles.authorByline} numberOfLines={1}>
              PAR {(plan.author.username || '').toUpperCase()}
              {plan.duration ? ` · ${plan.duration.toUpperCase()}` : ''}
            </Text>
          )}
          <Text style={titleStyle} numberOfLines={2}>{plan.title}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
};

// Public component ─────────────────────────────────────────────
interface PlanMosaicProps {
  plans: Plan[];
  onPlanPress: (plan: Plan) => void;
  /** Label en haut de la mosaïque (ex: "12 plans"). Si null/undefined, pas de label. */
  label?: string | null;
}

export const PlanMosaic: React.FC<PlanMosaicProps> = ({ plans, onPlanPress, label }) => {
  if (plans.length === 0) return null;
  const heroPlans = plans.slice(0, 2);
  const gridPlans = plans.slice(2);

  return (
    <View style={mosaicStyles.wrap}>
      {label != null && (
        <Text style={mosaicStyles.sectionLabel}>{label}</Text>
      )}
      {/* Hero row — 2 cells larges */}
      {heroPlans.length > 0 && (
        <View style={mosaicStyles.heroRow}>
          {heroPlans.map((plan, i) => (
            <ResultCell
              key={plan.id}
              plan={plan}
              size="large"
              delay={Math.min(i, 8) * 45}
              onPress={() => onPlanPress(plan)}
            />
          ))}
          {/* Filler quand il n'y a qu'un seul plan en hero — sinon le 1ᵉʳ
              prendrait 100 % width et le ratio se casse. */}
          {heroPlans.length === 1 && <View style={mosaicStyles.heroFiller} />}
        </View>
      )}
      {/* Grid 3-col pour le reste */}
      {gridPlans.length > 0 && (
        <View style={mosaicStyles.grid}>
          {gridPlans.map((plan, i) => (
            <ResultCell
              key={plan.id}
              plan={plan}
              size="square"
              delay={Math.min(i + 2, 8) * 45}
              onPress={() => onPlanPress(plan)}
            />
          ))}
        </View>
      )}
    </View>
  );
};

// Styles ───────────────────────────────────────────────────────
const cellStyles = StyleSheet.create({
  large: {
    width: HERO_W,
    height: HERO_H,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: Colors.bgTertiary,
  },
  square: {
    width: SQ,
    height: SQ,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Colors.bgTertiary,
  },
  titleLarge: {
    fontSize: 17,
    fontFamily: Fonts.displaySemiBoldItalic,
    color: '#FFF',
    letterSpacing: -0.25,
    lineHeight: 21,
  },
  titleSquare: {
    fontSize: 12.5,
    fontFamily: Fonts.displaySemiBoldItalic,
    color: '#FFF',
    letterSpacing: -0.1,
    lineHeight: 15,
  },
  metaPill: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    borderRadius: 99,
    backgroundColor: 'rgba(20,16,14,0.62)',
  },
  metaPillText: {
    fontSize: 9.5,
    fontFamily: Fonts.bodySemiBold,
    color: '#FFF',
    letterSpacing: -0.05,
  },
  metaSep: {
    width: 1, height: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 1,
  },
  bottom: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
  },
  authorByline: {
    fontSize: 9.5,
    fontFamily: Fonts.bodySemiBold,
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: 1.1,
    marginBottom: 4,
  },
});

const mosaicStyles = StyleSheet.create({
  wrap: {
    paddingTop: 6,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
    fontFamily: Fonts.bodySemiBold,
    color: Colors.textSecondary,
  } as any,
  heroRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  } as any,
  heroFiller: {
    width: HERO_W,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  } as any,
});
