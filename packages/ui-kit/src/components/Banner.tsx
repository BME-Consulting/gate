// ==========================================
// Banner コンポーネント
// ==========================================

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { tokens } from "../theme/tokens";

export interface BannerProps {
  message: string;
  variant?: "info" | "warn" | "danger" | "success";
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
  onClose?: () => void;
}

export function Banner({
  message,
  variant = "info",
  icon,
  style,
  onClose,
}: BannerProps) {
  const defaultIcon = {
    info: "information-circle" as const,
    warn: "warning" as const,
    danger: "close-circle" as const,
    success: "checkmark-circle" as const,
  }[variant];

  return (
    <View style={[styles.banner, styles[variant], style]}>
      <View style={styles.content}>
        <Ionicons
          name={icon || defaultIcon}
          size={24}
          color={styles[`icon_${variant}`].color}
          style={styles.icon}
        />
        <Text style={[styles.message, styles[`text_${variant}`]]}>{message}</Text>
      </View>
      {onClose && (
        <Ionicons
          name="close"
          size={20}
          color={styles[`icon_${variant}`].color}
          onPress={onClose}
          style={styles.closeIcon}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: tokens.spacing.md,
    borderRadius: tokens.radius.md,
    borderLeftWidth: 4,
  },

  content: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },

  icon: {
    marginRight: tokens.spacing.sm,
  },

  closeIcon: {
    marginLeft: tokens.spacing.sm,
  },

  message: {
    flex: 1,
    fontSize: tokens.font.size.sm,
    lineHeight: 20,
  },

  // Variants
  info: {
    backgroundColor: tokens.color.primary + "10",
    borderLeftColor: tokens.color.primary,
  },
  warn: {
    backgroundColor: tokens.color.warn + "10",
    borderLeftColor: tokens.color.warn,
  },
  danger: {
    backgroundColor: tokens.color.danger + "10",
    borderLeftColor: tokens.color.danger,
  },
  success: {
    backgroundColor: tokens.color.success + "10",
    borderLeftColor: tokens.color.success,
  },

  // Text colors
  text_info: {
    color: tokens.color.primaryDark,
  },
  text_warn: {
    color: tokens.color.warnDark,
  },
  text_danger: {
    color: tokens.color.dangerDark,
  },
  text_success: {
    color: tokens.color.successDark,
  },

  // Icon colors
  icon_info: {
    color: tokens.color.primary,
  },
  icon_warn: {
    color: tokens.color.warn,
  },
  icon_danger: {
    color: tokens.color.danger,
  },
  icon_success: {
    color: tokens.color.success,
  },
});
