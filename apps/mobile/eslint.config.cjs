const path = require("path");

// ローカル実装した plugin を直接require
const zustandPlugin = require(path.resolve(__dirname, "../../eslint-rules/zustand"));

let tsParser = null;
try {
  tsParser = require("@typescript-eslint/parser");
} catch (e) {
  // なくてもJSはlintできる
  tsParser = null;
}

module.exports = [
  // TS/TSX対象
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser || undefined,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      zustand: zustandPlugin,
    },
    rules: {
      "zustand/no-object-selector": "error",
    },
  },

  // JS/JSX対象
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      zustand: zustandPlugin,
    },
    rules: {
      "zustand/no-object-selector": "error",
    },
  },
];
