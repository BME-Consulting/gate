module.exports = {
  root: true,
  extends: [
    "expo",
    "eslint:recommended"
  ],
  plugins: [
    // Local Zustand plugin - prevents object-literal selectors
    require.resolve("../../eslint-rules/zustand")
  ],
  rules: {
    // Enable Zustand plugin rules
    "zustand-local/no-object-selector": [
      "error",
      {
        hooks: [
          "useAppStore",
          "useStore",
          "useBoundStore"
        ],
        allowUseShallow: true
      }
    ]
  },
  overrides: [
    {
      files: ["**/*.ts", "**/*.tsx"],
      extends: [
        "expo",
        "eslint:recommended"
      ],
      rules: {
        "zustand-local/no-object-selector": [
          "error",
          {
            hooks: [
              "useAppStore",
              "useStore",
              "useBoundStore"
            ],
            allowUseShallow: true
          }
        ]
      }
    }
  ]
};
