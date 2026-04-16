import { TextStyle } from 'react-native';

// ── Font families ───────────────────────────────────────────
// Display: Fraunces (serif) — titles, headings, editorial moments
// Body:    Inter (sans-serif) — UI, body text, buttons, labels
export const Fonts = {
  // ── Display serif (Fraunces) ──
  display: 'Fraunces_400Regular',
  displayMedium: 'Fraunces_500Medium',
  displaySemiBold: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  displayItalic: 'Fraunces_400Regular_Italic',
  displaySemiBoldItalic: 'Fraunces_600SemiBold_Italic',

  // ── Body sans-serif (Inter) ──
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',

  // ── Backward-compat aliases (serif → Fraunces) ──
  serif: 'Fraunces_400Regular',
  serifMedium: 'Fraunces_500Medium',
  serifSemiBold: 'Fraunces_600SemiBold',
  serifBold: 'Fraunces_700Bold',
} as const;

// ── Typography presets ──────────────────────────────────────
export const Typography: Record<string, TextStyle> = {
  // Display (Fraunces)
  displayHero: { fontSize: 48, fontFamily: Fonts.displaySemiBold, letterSpacing: -0.96, lineHeight: 50 },
  displayXL: { fontSize: 36, fontFamily: Fonts.displaySemiBold, letterSpacing: -0.72, lineHeight: 40 },
  displayLG: { fontSize: 28, fontFamily: Fonts.displaySemiBold, letterSpacing: -0.28, lineHeight: 32 },
  displayMD: { fontSize: 22, fontFamily: Fonts.displaySemiBold, letterSpacing: -0.22, lineHeight: 26 },

  // Body (Inter)
  bodyLG: { fontSize: 17, fontFamily: Fonts.body, lineHeight: 26 },
  bodyMD: { fontSize: 15, fontFamily: Fonts.body, lineHeight: 23 },
  bodySM: { fontSize: 13, fontFamily: Fonts.body, letterSpacing: 0.13, lineHeight: 19 },
  bodyXS: { fontSize: 11, fontFamily: Fonts.bodyMedium, letterSpacing: 0.55, textTransform: 'uppercase', lineHeight: 15 },
  button: { fontSize: 15, fontFamily: Fonts.bodySemiBold, letterSpacing: 0.075, lineHeight: 15 },

  // Legacy presets (updated families)
  logo: { fontSize: 28, fontFamily: Fonts.displayBold, letterSpacing: -1 },
  pageTitle: { fontSize: 22, fontFamily: Fonts.displaySemiBold, letterSpacing: -0.22 },
  cardTitle: { fontSize: 18, fontFamily: Fonts.displaySemiBold },
  sectionLabel: { fontSize: 10, fontFamily: Fonts.bodySemiBold, textTransform: 'uppercase', letterSpacing: 1.2 },
  body: { fontSize: 13, fontFamily: Fonts.body },
  bodyBold: { fontSize: 13, fontFamily: Fonts.bodySemiBold },
  small: { fontSize: 11, fontFamily: Fonts.body },
  smallBold: { fontSize: 11, fontFamily: Fonts.bodySemiBold },
  micro: { fontSize: 10, fontFamily: Fonts.bodyMedium },
};
