/**
 * HUB 2.0 Mobile — Design Tokens
 * Single source of truth for all colors, spacing, typography, shadows.
 */
export const Colors = {
  // Backgrounds
  bgBase:     '#0a0a0f',
  bgSurface:  '#111118',
  bgElevated: '#1a1a26',
  bgGlass:    'rgba(26,26,38,0.85)',

  // Accent
  primary:    '#7c3aed',
  primaryLight:'#a78bfa',
  cyan:       '#06b6d4',

  // Text
  textPrimary:   '#f1f0ff',
  textSecondary: '#a09cb8',
  textMuted:     '#5e5a7a',

  // States
  success: '#10b981',
  error:   '#ef4444',
  warning: '#f59e0b',

  // Borders
  borderSubtle: 'rgba(255,255,255,0.07)',
  borderAccent: 'rgba(124,58,237,0.4)',

  // Overlays
  overlay:      'rgba(0,0,0,0.6)',
  glowViolet:   'rgba(124,58,237,0.3)',
  glowCyan:     'rgba(6,182,212,0.25)',
}

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  40,
  xxl: 64,
}

export const Radius = {
  sm:   6,
  md:   12,
  lg:   20,
  xl:   32,
  full: 9999,
}

export const Typography = {
  xs:    11,
  sm:    13,
  base:  15,
  lg:    17,
  xl:    20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
}

export const FontWeight = {
  normal:  '400',
  medium:  '500',
  semi:    '600',
  bold:    '700',
  extrabold: '800',
}
