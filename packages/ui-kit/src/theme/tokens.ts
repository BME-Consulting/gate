// ==========================================
// MCD3 通門管理 UIテーマトークン
// ==========================================

export const tokens = {
  color: {
    primary: "#106A5A",
    primaryLight: "#1A8A74",
    primaryDark: "#0A4A3A",

    warn: "#F9A825",
    warnLight: "#FFD54F",
    warnDark: "#F57F17",

    danger: "#C62828",
    dangerLight: "#E53935",
    dangerDark: "#B71C1C",

    success: "#2E7D32",
    successLight: "#4CAF50",
    successDark: "#1B5E20",

    text: {
      primary: "#212121",
      secondary: "#757575",
      disabled: "#BDBDBD",
      inverse: "#FFFFFF",
    },

    background: {
      default: "#FFFFFF",
      paper: "#F5F5F5",
      elevated: "#FAFAFA",
    },

    border: {
      default: "#E0E0E0",
      light: "#F5F5F5",
      dark: "#9E9E9E",
    },
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },

  radius: {
    sm: 4,
    md: 12,
    lg: 16,
    xl: 20,
    round: 9999,
  },

  font: {
    size: {
      xs: 12,
      sm: 14,
      base: 16,
      lg: 18,
      xl: 20,
      h3: 24,
      h2: 28,
      h1: 32,
    },
    weight: {
      regular: "400" as const,
      medium: "500" as const,
      semibold: "600" as const,
      bold: "700" as const,
    },
    lineHeight: {
      xs: 16,
      sm: 20,
      base: 24,
      lg: 28,
      xl: 32,
      h3: 32,
      h2: 36,
      h1: 40,
    },
  },

  shadow: {
    sm: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.18,
      shadowRadius: 1.0,
      elevation: 1,
    },
    md: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.23,
      shadowRadius: 2.62,
      elevation: 4,
    },
    lg: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.30,
      shadowRadius: 4.65,
      elevation: 8,
    },
  },
} as const;

export type Tokens = typeof tokens;
