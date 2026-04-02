import { TextStyle } from 'react-native';

export const Typography: Record<string, TextStyle> = {
  logo: { fontSize: 26, fontWeight: '800', letterSpacing: -1.5 },
  pageTitle: { fontSize: 21, fontWeight: '800', letterSpacing: -0.5 },
  cardTitle: { fontSize: 18, fontWeight: '800' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  body: { fontSize: 13, fontWeight: '400' },
  bodyBold: { fontSize: 13, fontWeight: '700' },
  small: { fontSize: 11, fontWeight: '400' },
  smallBold: { fontSize: 11, fontWeight: '700' },
  micro: { fontSize: 10, fontWeight: '600' },
};
