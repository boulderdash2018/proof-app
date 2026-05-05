import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { Colors, Fonts } from '../constants';

interface Props {
  /** Compact variant for inline contexts (feed card author row, etc.) */
  small?: boolean;
}

/**
 * Founder badge — design 'Double-line chevron'.
 *
 * Composition (très éditorial, palette stricte de l'app) :
 *  - Texte 'FOUNDER' en Fraunces italique, capitales, terracotta700,
 *    letter-spacing serré pour un look heritage / press-mark
 *  - Bordures top + bottom uniquement (pas de left/right) en
 *    terracotta700 → effet 'chevron' éditorial
 *  - Petits losanges 4×4 (rotation 45°) aux deux extrémités, qui
 *    encadrent le label sans le surcharger
 *  - Aucun fond coloré, aucune animation — sobriété assumée. Le badge
 *    se fond avec la composition de la card sans la dominer.
 *
 * Anciennement : pill or shimmer animée (sweep + breathing border).
 * Retiré : effet 'gold luxe' jugé trop clinquant et hors-palette.
 */
export const FounderBadge: React.FC<Props> = ({ small }) => {
  return (
    <View style={[styles.badge, small && styles.badgeSmall]}>
      <View style={[styles.diamond, small && styles.diamondSmall]} />
      <Text style={[styles.label, small && styles.labelSmall]}>FOUNDER</Text>
      <View style={[styles.diamond, small && styles.diamondSmall]} />
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.terracotta700,
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
  },
  badgeSmall: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    gap: 4,
  },
  diamond: {
    width: 4,
    height: 4,
    backgroundColor: Colors.terracotta700,
    transform: [{ rotate: '45deg' }],
  },
  diamondSmall: {
    width: 3,
    height: 3,
  },
  label: {
    fontSize: 11,
    fontFamily: Fonts.displaySemiBoldItalic,
    color: Colors.terracotta700,
    letterSpacing: 1.6,
    // textTransform avec une font italique : Fraunces gère le rendu en
    // capitales nativement via la propriété, ce qui garde l'italique.
    textTransform: 'uppercase',
  },
  labelSmall: {
    fontSize: 9,
    letterSpacing: 1.2,
  },
});
