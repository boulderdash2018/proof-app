// Crème × Terracotta — warm organic palette
// Aesop / Le Labo / céramiques japonaises / architecture méditerranéenne
export const Colors = {
  // ── Backgrounds ─────────────────────────────────────────────
  bgPrimary: '#F5F0E8',        // Main app background (papier non blanchi)
  bgSecondary: '#FAF7F2',      // Cards, panels, inputs, modals
  bgTertiary: '#EDE5D8',       // Sunken areas, chips, skeleton loaders

  // ── Accent (Terracotta) ────────────────────────────────────
  primary: '#C4704B',           // Argile cuite au soleil — CTA, active icons, links
  primaryDeep: '#A85A38',       // Hover / pressed — argile mouillée

  // ── Text ───────────────────────────────────────────────────
  textPrimary: '#2C2420',       // Quasi-noir chaud — headings, body
  textSecondary: '#6B5D52',     // Bois patiné — subtitles, descriptions
  textTertiary: '#A09181',      // Taupe — placeholders, timestamps
  textOnAccent: '#FFF8F0',      // Crème clair — text on terracotta bg

  // ── Borders & Separators ───────────────────────────────────
  borderSubtle: 'rgba(44, 36, 32, 0.08)',
  borderMedium: 'rgba(44, 36, 32, 0.15)',

  // ── Feedback states ────────────────────────────────────────
  success: '#7B9971',           // Vert sauge terreux
  successBg: '#F0F5EE',
  successBorder: '#D4E0D0',
  error: '#C45C4D',             // Rouge brique
  errorBg: '#FDF0EE',
  errorBorder: '#F0D4CF',
  warning: '#D4A04A',           // Ocre / ambre
  warningBg: '#FDF6EC',
  warningBorder: '#F0E0C4',
  info: '#7E96A8',              // Bleu-gris ardoise
  infoBg: '#EFF3F6',
  infoBorder: '#D4DEE6',

  purple: '#8B7BA0',
  purpleBg: '#F3F0F6',
  gold: '#D4A04A',
  goldBg: '#FDF6EC',
  goldBorder: '#F0E0C4',
  pink: '#B07888',
  pinkBg: '#F6F0F2',

  // ── Terracotta scale ───────────────────────────────────────
  terracotta50:  '#FDF5F0',
  terracotta100: '#F9E8DD',
  terracotta200: '#F0CEBC',
  terracotta300: '#E0A88E',
  terracotta400: '#D4885F',
  terracotta500: '#C4704B',     // = primary
  terracotta600: '#A85A38',     // = primaryDeep
  terracotta700: '#8C4830',
  terracotta800: '#6B3724',
  terracotta900: '#4A2518',

  // ── Warm grays ─────────────────────────────────────────────
  gray100: '#F5F0E8',           // ≈ bgPrimary
  gray200: '#EDE5D8',           // ≈ bgTertiary
  gray300: '#DDD4C8',
  gray400: '#C4B8AA',
  gray500: '#A09181',           // ≈ textTertiary
  gray600: '#6B5D52',           // ≈ textSecondary
  gray700: '#4A3F37',
  gray800: '#2C2420',           // ≈ textPrimary

  // ── Semantic aliases (backward compat) ─────────────────────
  black: '#2C2420',             // = textPrimary (foreground)
  white: '#FAF7F2',             // = bgSecondary (surface)

  // ── Card / surface tokens ──────────────────────────────────
  border: 'rgba(44, 36, 32, 0.15)',
  borderLight: 'rgba(44, 36, 32, 0.08)',
  cardBorder: 'rgba(44, 36, 32, 0.08)',
  cardGlow: 'rgba(196, 112, 75, 0.08)',
  accentLine: '#C4704B',
  unreadBg: '#FDF5F0',
} as const;

export type ThemeColors = typeof Colors;
