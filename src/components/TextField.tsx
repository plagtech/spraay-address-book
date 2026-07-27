/**
 * Text input matching the prototypes' bordered fields.
 *
 * Kept dumb on purpose — validation lives with the parsers in `src/tx`, and this only
 * renders the invalid state it is told about.
 */
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, fonts, radii } from '../theme';
import { Body } from './Text';

interface TextFieldProps extends TextInputProps {
  /** Message shown under the field. Presence also drives the error styling. */
  error?: string;
  /** Monospace for addresses, so lookalike characters stay distinguishable. */
  mono?: boolean;
}

export function TextField({ error, mono, style, ...rest }: TextFieldProps) {
  return (
    <View style={styles.wrap}>
      <TextInput
        placeholderTextColor={colors.faint}
        autoCapitalize="none"
        autoCorrect={false}
        {...rest}
        style={[
          styles.input,
          mono && styles.monoInput,
          error ? styles.inputError : null,
          style,
        ]}
      />
      {error ? <Body style={styles.error}>{error}</Body> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
  monoInput: { fontFamily: fonts.mono, fontSize: 13.5 },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 12, marginTop: 4 },
});
