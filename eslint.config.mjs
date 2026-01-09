// eslint.config.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";

import js from "@eslint/js";
import globals from "globals";

// Flat config で legacy extends を使いたい時の互換
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

export default [
  // ✅ CI/生成物は無視（ここ重要）
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.expo/**",
      "**/.next/**",
      "**/coverage/**",
      "**/*.min.*",
      "**/*.generated.*",
      "**/android/**",
      "**/ios/**",
      "**/__tests__/**",
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/zustand_rule_probe.tsx",
    ],
  },

  // ✅ JS 推奨
  js.configs.recommended,

  // ✅ TypeScript / React / Expo など（legacy extends を互換で読み込み）
  ...compat.extends(
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "expo"
  ),

  // ✅ 共通ルール（プロジェクトに合わせて最小限）
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      // React 17+ / RN/Expo で不要になりがち
      "react/react-in-jsx-scope": "off",

      // TS側で型チェックするなら、JS向けのルールは緩める
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],

      // any型は warning に下げる（error だと既存コードで大量エラー）
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // ✅ Node系（apps/gs-api 等）だけ強めたい場合の例
  {
    files: ["apps/gs-api/**/*.{js,ts,tsx}", "packages/**/*.{js,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
