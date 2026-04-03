export const Colors = {
  primary: '#FF6B35',
  black: '#111111',
  white: '#FFFFFF',
  success: '#0F9B68',
  successBg: '#EDFAF5',
  successBorder: '#B8EDD8',
  error: '#FF3B30',
  errorBg: '#FFF0F0',
  purple: '#534AB7',
  purpleBg: '#F0EEFF',
  gold: '#B07800',
  goldBg: '#FFF8E6',
  goldBorder: '#FFE099',
  pink: '#D4537E',
  pinkBg: '#FFF0F5',

  gray100: '#F8F8F8',
  gray200: '#F5F5F5',
  gray300: '#F0F0F0',
  gray400: '#EEEEEE',
  gray500: '#CCCCCC',
  gray600: '#AAAAAA',
  gray700: '#888888',
  gray800: '#555555',

  border: '#EEEEEE',
  borderLight: '#F5F5F5',

  unreadBg: '#FFF8F5',
} as const;

export const DarkColors = {
  primary: '#FF6B35',
  black: '#EEEEEE',
  white: '#121212',
  success: '#0F9B68',
  successBg: '#1A2E25',
  successBorder: '#1A3D2A',
  error: '#FF6B6B',
  errorBg: '#2D1A1A',
  purple: '#7B6FDB',
  purpleBg: '#1E1B2E',
  gold: '#D4A017',
  goldBg: '#2D2510',
  goldBorder: '#3D3318',
  pink: '#E87DA0',
  pinkBg: '#2D1A22',

  gray100: '#1A1A1A',
  gray200: '#1E1E1E',
  gray300: '#252525',
  gray400: '#2A2A2A',
  gray500: '#444444',
  gray600: '#666666',
  gray700: '#999999',
  gray800: '#BBBBBB',

  border: '#2A2A2A',
  borderLight: '#1E1E1E',

  unreadBg: '#1F1510',
} as const;

export type ThemeColors = typeof Colors;
