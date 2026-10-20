const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const pressableNeedsRole = require("./eslint-rules/pressable-needs-role");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "graphify-out/*", "out/*"],
  },
  {
    files: ["app/**/*.{js,jsx,ts,tsx}", "components/**/*.{js,jsx,ts,tsx}"],
    plugins: {
      a11y: {
        rules: {
          "pressable-needs-role": pressableNeedsRole,
        },
      },
    },
    rules: {
      // Promote to "error" once A11Y-P1 migration finishes (SPEC-ACCESSIBILITY §5).
      "a11y/pressable-needs-role": "warn",
    },
  },
]);
