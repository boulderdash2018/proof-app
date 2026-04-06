// Maison de Nuit — warm dark luxury palette
export const Colors = {
  primary: '#D4845A',        // softened terracotta
  black: '#E8E0D6',          // cream text (semantic: "foreground")
  white: '#1C1917',          // warm brown-black (semantic: "background")

  success: '#5B9A7B',
  successBg: '#1E2A22',
  successBorder: '#2D3D30',
  error: '#C96B5A',
  errorBg: '#2D1F1A',
  errorBorder: '#3D2D25',
  purple: '#8B7BA0',
  purpleBg: '#2A2530',
  gold: '#C9A84C',
  goldBg: '#2D2510',
  goldBorder: '#3D3318',
  pink: '#B07888',
  pinkBg: '#2D1F25',

  gray100: '#1E1B18',
  gray200: '#292421',        // card surface / input bg
  gray300: '#332E29',
  gray400: '#3D352E',
  gray500: '#5A5249',
  gray600: '#8B7B6B',        // secondary text
  gray700: '#A09585',
  gray800: '#C4B8AA',

  border: '#3D352E',
  borderLight: '#292421',

  unreadBg: '#2A2118',

  // Card accents
  cardBorder: '#3D352E',
  cardGlow: 'rgba(212, 132, 90, 0.08)',
  accentLine: '#D4845A',
} as const;

export type ThemeColors = typeof Colors;
