// ==========================================
// Button コンポーネント
// ==========================================

import React from "react";
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { tokens } from "../theme/tokens";

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  hapticFeedback?: boolean; // Enable haptic feedback on press
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  fullWidth = false,
  hapticFeedback = true,
  style,
  textStyle,
  icon,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const handlePress = async () => {
    // Trigger haptic feedback if enabled and available
    if (hapticFeedback && !isDisabled) {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch (error) {
        // Silently fail if haptics not available (e.g., on simulator)
      }
    }
    onPress();
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        styles[`size_${size}`],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
      onPress={handlePress}
      disabled={isDisabled}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === "ghost" || variant === "outline" || variant === "secondary"
              ? tokens.color.primary
              : tokens.color.text.inverse
          }
        />
      ) : (
        <>
          {icon && <>{icon}</>}
          <Text style={[styles.text, styles[`text_${variant}`], styles[`textSize_${size}`], textStyle]}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing.lg,
  },

  // Variants
  primary: {
    backgroundColor: tokens.color.primary,
  },
  secondary: {
    backgroundColor: tokens.color.background.paper,
    borderWidth: 1,
    borderColor: tokens.color.border.default,
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: tokens.color.primary,
  },
  danger: {
    backgroundColor: tokens.color.danger,
  },
  ghost: {
    backgroundColor: "transparent",
  },

  // Sizes
  size_sm: {
    height: 32,
    paddingHorizontal: tokens.spacing.md,
  },
  size_md: {
    height: 44,
    paddingHorizontal: tokens.spacing.lg,
  },
  size_lg: {
    height: 56,
    paddingHorizontal: tokens.spacing.xl,
  },

  // Full width
  fullWidth: {
    width: "100%",
  },

  // Disabled
  disabled: {
    opacity: 0.5,
  },

  // Pressed state
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },

  // Text
  text: {
    fontWeight: tokens.font.weight.semibold,
  },
  text_primary: {
    color: tokens.color.text.inverse,
  },
  text_secondary: {
    color: tokens.color.text.primary,
  },
  text_outline: {
    color: tokens.color.primary,
  },
  text_danger: {
    color: tokens.color.text.inverse,
  },
  text_ghost: {
    color: tokens.color.primary,
  },

  // Text sizes
  textSize_sm: {
    fontSize: tokens.font.size.sm,
  },
  textSize_md: {
    fontSize: tokens.font.size.base,
  },
  textSize_lg: {
    fontSize: tokens.font.size.lg,
  },
});
