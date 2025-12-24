module.exports = {
  root: true,
  rules: {
    "zustand-local/no-object-selector": [
      "error",
      {
        hooks: ["useAppStore", "useStore", "useBoundStore"],
        allowUseShallow: true
      }
    ]
  },
  plugins: [require.resolve("../../eslint-rules/zustand")]
};
