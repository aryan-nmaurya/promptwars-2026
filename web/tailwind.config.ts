import type { Config } from "tailwindcss";

/**
 * Every colour resolves to a CSS custom property defined in app/globals.css,
 * so light and dark are one source of truth and no component hardcodes a hex.
 * Contrast for both themes is verified there.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-border": "var(--surface-border)",
        "control-border": "var(--control-border)",
        ink: "var(--ink)",
        "ink-muted": "var(--ink-muted)",
        amber: "var(--amber)",
        "amber-dim": "var(--amber-dim)",
        "amber-ink": "var(--amber-ink)",
        glow: "var(--glow)",
        danger: "var(--danger)",
        "danger-ink": "var(--danger-ink)",
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: { card: "0.75rem" },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "none" },
        },
      },
      animation: { "fade-up": "fade-up 420ms ease-out both" },
    },
  },
  plugins: [],
};

export default config;
