import { TextStyle } from 'react-native';

// ── Font families ───────────────────────────────────────────
// ONE font for the whole app: Inter (clean modern sans-serif).
// The display* aliases (originally mapped to Fraunces serif) and the serif*
// legacy aliases all point to Inter — so every existing Fonts.xxx reference
// across the codebase automatically renders in Inter.
export const Fonts = {
  // ── Display (was Fraunces serif) — now Inter ──
  display: 'Inter_400Regular',
  displayMedium: 'Inter_500Medium',
  displaySemiBold: 'Inter_600SemiBold',
  displayBold: 'Inter_700Bold',
  displayItalic: 'Inter_400Regular_Italic',
  displaySemiBoldItalic: 'Inter_600SemiBold_Italic',

  // ── Body (Inter) ──
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',

  // ── Backward-compat aliases (serif → Inter) ──
  serif: 'Inter_400Regular',
  serifMedium: 'Inter_500Medium',
  serifSemiBold: 'Inter_600SemiBold',
  serifBold: 'Inter_700Bold',

  // ── Brand logo — Playfair Display (original Proof logo font, pre-refonte) ──
  // Reserved for the "proof." wordmark only. Do not use for body/UI.
  logo: 'PlayfairDisplay_700Bold',
  logoBlack: 'PlayfairDisplay_900Black',
} as const;

// ── Typography presets ──────────────────────────────────────
export const Typography: Record<string, TextStyle> = {
  // Display
  displayHero: { fontSize: 48, fontFamily: Fonts.displaySemiBold, letterSpacing: -0.96, lineHeight: 50 },
  displayXL: { fontSize: 36, fontFamily: Fonts.displaySemiBold, letterSpacing: -0.72, lineHeight: 40 },
  displayLG: { fontSize: 28, fontFamily: Fonts.displaySemiBold, letterSpacing: -0.28, lineHeight: 32 },
  displayMD: { fontSize: 22, fontFamily: Fonts.displaySemiBold, letterSpacing: -0.22, lineHeight: 26 },

  // Body
  bodyLG: { fontSize: 17, fontFamily: Fonts.body, lineHeight: 26 },
  bodyMD: { fontSize: 15, fontFamily: Fonts.body, lineHeight: 23 },
  bodySM: { fontSize: 13, fontFamily: Fonts.body, letterSpacing: 0.13, lineHeight: 19 },
  bodyXS: { fontSize: 11, fontFamily: Fonts.bodyMedium, letterSpacing: 0.55, textTransform: 'uppercase', lineHeight: 15 },
  button: { fontSize: 15, fontFamily: Fonts.bodySemiBold, letterSpacing: 0.075, lineHeight: 15 },

  // Legacy presets
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
