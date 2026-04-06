import { TextStyle } from 'react-native';

export const Fonts = {
  serif: 'PlayfairDisplay_400Regular',
  serifMedium: 'PlayfairDisplay_500Medium',
  serifSemiBold: 'PlayfairDisplay_600SemiBold',
  serifBold: 'PlayfairDisplay_700Bold',
} as const;

export const Typography: Record<string, TextStyle> = {
  logo: { fontSize: 28, fontFamily: Fonts.serifBold, letterSpacing: -1 },
  pageTitle: { fontSize: 22, fontFamily: Fonts.serifBold, letterSpacing: -0.3 },
  cardTitle: { fontSize: 18, fontFamily: Fonts.serifBold },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  body: { fontSize: 13, fontWeight: '400' },
  bodyBold: { fontSize: 13, fontWeight: '600' },
  small: { fontSize: 11, fontWeight: '400' },
  smallBold: { fontSize: 11, fontWeight: '600' },
  micro: { fontSize: 10, fontWeight: '500' },
};
