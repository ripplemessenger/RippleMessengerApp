const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2024,
      },
    },
    ignores: ["dist/*", "node_modules/*"],
  },
  {
    // CommonJS config files at the project root
    files: [
      "*.config.js",
      "babel.config.js",
      "metro.config.js",
      "postcss.config.js",
      "tailwind.config.js",
      "eslint.config.js",
      "index.js",
    ],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },
];
