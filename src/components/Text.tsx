/**
 * Typography primitives so Fredoka/Inter are applied consistently and we never
 * scatter raw fontFamily strings through the screens.
 */
import { Text as RNText, StyleSheet, type TextProps } from 'react-native';

import { colors, fonts } from '../theme';

type Props = TextProps & { children?: React.ReactNode };

/** Fredoka. Headings, totals, button labels. */
export function Display({ style, ...rest }: Props) {
  return <RNText {...rest} style={[styles.display, style]} />;
}

/** Inter regular. Body copy. */
export function Body({ style, ...rest }: Props) {
  return <RNText {...rest} style={[styles.body, style]} />;
}

/** Inter 500/600. Labels, captions, emphasis. */
export function Label({ style, ...rest }: Props) {
  return <RNText {...rest} style={[styles.label, style]} />;
}

/** Monospace — addresses only. */
export function Mono({ style, ...rest }: Props) {
  return <RNText {...rest} style={[styles.mono, style]} />;
}

/** Uppercase section eyebrow, as in the gifts prototype ("1 · Pick an amount each"). */
export function Eyebrow({ style, ...rest }: Props) {
  return <RNText {...rest} style={[styles.eyebrow, style]} />;
}

const styles = StyleSheet.create({
  display: {
    fontFamily: fonts.display,
    color: colors.ink,
    fontSize: 20,
  },
  body: {
    fontFamily: fonts.body,
    color: colors.ink,
    fontSize: 15,
  },
  label: {
    fontFamily: fonts.bodySemi,
    color: colors.inkSoft,
    fontSize: 14,
  },
  mono: {
    fontFamily: fonts.mono,
    color: colors.faint,
    fontSize: 13,
  },
  eyebrow: {
    fontFamily: fonts.bodySemi,
    color: colors.faint,
    fontSize: 12.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
