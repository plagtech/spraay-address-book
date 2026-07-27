/**
 * Design tokens lifted from the reference prototypes
 * (spraay-book-prototype.jsx, spraay-payout-entry.jsx, spraay-gifts-prototype.jsx).
 * Fonts: Fredoka for display, Inter for body — spec §3.
 */

export const colors = {
  bg: '#FBFBF9',
  surface: '#FFFFFF',
  ink: '#101828',
  inkSoft: '#344054',
  muted: '#667085',
  faint: '#98A2B3',
  hairline: '#EFF1F4',
  border: '#EAECF0',
  fill: '#F2F4F7',
  dashed: '#CBD5E1',

  accent: '#0EA5E9',
  accentSoft: '#E0F2FE',
  accentDeep: '#0369A1',
  accentTint: '#F0F9FF',

  success: '#10B981',
  successSoft: '#D1FAE5',
  successDeep: '#047857',
  danger: '#D92D20',
  dangerSoft: '#FEE2E2',
  warn: '#F59E0B',
  warnSoft: '#FEF3C7',
} as const;

export const fonts = {
  display: 'Fredoka_700Bold',
  displayMedium: 'Fredoka_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  mono: 'monospace',
} as const;

export const radii = {
  sm: 10,
  md: 12,
  lg: 14,
  xl: 16,
  xxl: 18,
  sheet: 22,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 28,
} as const;

/** Contact labels — colors from the book prototype. */
export const LABELS = {
  family: { name: 'Family', color: '#F59E0B', soft: '#FEF3C7' },
  team: { name: 'Team', color: '#0EA5E9', soft: '#E0F2FE' },
  primary: { name: 'Primary', color: '#8B5CF6', soft: '#EDE9FE' },
  burner: { name: 'Burner', color: '#EF4444', soft: '#FEE2E2' },
  friend: { name: 'Friend', color: '#10B981', soft: '#D1FAE5' },
} as const;

export type LabelKey = keyof typeof LABELS;

export const LABEL_KEYS = Object.keys(LABELS) as LabelKey[];

/** Phone-shaped column, matching the prototypes' maxWidth: 420. */
export const CONTENT_MAX_WIDTH = 420;
