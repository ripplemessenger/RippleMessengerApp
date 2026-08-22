/** @type {import('tailwindcss').Config} */

module.exports = {
      darkMode: "class",
      content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
      presets: [require("nativewind/preset")],
      theme: {
            extend: {
                  colors: {
                        // === Casino Gold Theme (from desktop client) ===
                        // Semantic colors are CSS variables so the `dark` class on the app
                        // root (see App.tsx + global.css) switches the whole app's palette.
                        "primary-light":
                              "rgb(var(--primary-light) / <alpha-value>)",
                        primary: "#e6b420",
                        "primary-dark": "#e4c56b",
                        "secondary-light":
                              "rgb(var(--secondary-light) / <alpha-value>)",
                        secondary: "rgb(var(--secondary) / <alpha-value>)",
                        "secondary-dark":
                              "rgb(var(--secondary-dark) / <alpha-value>)",
                        surface: "rgb(var(--surface) / <alpha-value>)",
                        "surface-card":
                              "rgb(var(--surface-card) / <alpha-value>)",
                        "surface-alt":
                              "rgb(var(--surface-alt) / <alpha-value>)",
                        accent: "#e6b420",
                        "text-primary":
                              "rgb(var(--text-primary) / <alpha-value>)",
                        "text-secondary":
                              "rgb(var(--text-secondary) / <alpha-value>)",

                        // Status colors
                        "status-success": "#6aa84f",
                        "status-error": "#d4555a",

                        // Dark mode
                        "dark-primary": "#f0d090",
                        "dark-primary-dark": "#e4c56b",
                        "dark-secondary": "#5e5238",
                        "dark-secondary-dark": "#3e3428",
                        "dark-surface": "#0d0d15",
                        "dark-surface-card": "#161622",
                        "dark-surface-alt": "#1e1e2e",
                        "dark-accent": "#b38922",
                        "dark-text-primary": "#f0ead6",
                        "dark-text-secondary": "#a89f85",
                  },
            },
      },
      plugins: [],
};
