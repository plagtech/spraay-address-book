/**
 * Buttons matching the prototypes: solid ink/accent primaries, tinted secondaries,
 * dashed "add" affordances, and plain text links.
 */
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, fonts, radii } from '../theme';
import { Display, Label } from './Text';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'dashed' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** Stretch to the container width. */
  block?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const PADDING: Record<ButtonSize, ViewStyle> = {
  sm: { paddingVertical: 9, paddingHorizontal: 14 },
  md: { paddingVertical: 13, paddingHorizontal: 20 },
  lg: { paddingVertical: 16, paddingHorizontal: 24 },
};

const FONT_SIZE: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 };

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  block = false,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const inert = disabled || loading;

  if (variant === 'link') {
    return (
      <Pressable
        onPress={inert ? undefined : onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityState={{ disabled: inert }}
        style={({ pressed }) => [
          styles.link,
          block && styles.block,
          pressed && !inert && styles.pressed,
          style,
        ]}
      >
        <Label style={[styles.linkText, inert && styles.mutedText]}>{title}</Label>
      </Pressable>
    );
  }

  const surface = surfaceFor(variant, inert);

  return (
    <Pressable
      onPress={inert ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inert }}
      style={({ pressed }) => [
        styles.base,
        PADDING[size],
        surface.container,
        block && styles.block,
        pressed && !inert && styles.pressed,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator size="small" color={surface.text.color} /> : null}
        <Display style={[{ fontSize: FONT_SIZE[size] }, surface.text]}>{title}</Display>
      </View>
    </Pressable>
  );
}

function surfaceFor(variant: ButtonVariant, inert: boolean) {
  if (inert) {
    return {
      container: { backgroundColor: colors.border, borderColor: colors.border },
      text: { color: colors.faint },
    };
  }
  switch (variant) {
    case 'accent':
      return {
        container: { backgroundColor: colors.accent, borderColor: colors.accent },
        text: { color: '#FFFFFF' },
      };
    case 'secondary':
      return {
        container: { backgroundColor: colors.fill, borderColor: colors.fill },
        text: { color: colors.inkSoft },
      };
    case 'dashed':
      return {
        container: {
          backgroundColor: 'transparent',
          borderColor: colors.dashed,
          borderStyle: 'dashed' as const,
        },
        text: { color: colors.inkSoft },
      };
    case 'primary':
    default:
      return {
        container: { backgroundColor: colors.ink, borderColor: colors.ink },
        text: { color: '#FFFFFF' },
      };
  }
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.lg,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  block: { width: '100%' },
  pressed: { opacity: 0.82 },
  link: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  linkText: {
    color: colors.muted,
    fontFamily: fonts.bodySemi,
    fontSize: 14.5,
  },
  mutedText: { color: colors.faint },
});
