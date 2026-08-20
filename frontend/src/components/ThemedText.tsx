import React from 'react';
import { Text, TextProps, TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

type Variant = 'display' | 'body' | 'bodyMedium' | 'semiBold' | 'mono' | 'label' | 'caption';

interface ThemedTextProps extends TextProps {
  variant?: Variant;
  color?: 'primary' | 'secondary' | 'onSurface';
}

export function ThemedText({ variant = 'body', color = 'onSurface', style, ...rest }: ThemedTextProps) {
  const { colors, typography } = useTheme();

  const variantStyle: TextStyle = (() => {
    switch (variant) {
      case 'display':
        return { fontFamily: typography.fontFamily.display, fontSize: typography.size.xl };
      case 'bodyMedium':
        return { fontFamily: typography.fontFamily.bodyMedium, fontSize: typography.size.md };
      case 'semiBold':
        return { fontFamily: typography.fontFamily.semiBold, fontSize: typography.size.lg };
      case 'mono':
        return { fontFamily: typography.fontFamily.mono, fontSize: typography.size.md };
      case 'label':
        // "label-caps": small, bold-ish mono, wide tracking, always uppercase -
        // callers pass the label text as-is; toUpperCase is applied here so
        // every usage stays consistent.
        return {
          fontFamily: typography.fontFamily.monoSemiBold,
          fontSize: typography.size.xs,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        };
      case 'caption':
        return { fontFamily: typography.fontFamily.body, fontSize: typography.size.xs };
      default:
        return { fontFamily: typography.fontFamily.body, fontSize: typography.size.md };
    }
  })();

  const colorValue =
    color === 'primary' ? colors.primary : color === 'secondary' ? colors.secondary : colors.textPrimary;

  return <Text style={[variantStyle, { color: colorValue }, style]} {...rest} />;
}