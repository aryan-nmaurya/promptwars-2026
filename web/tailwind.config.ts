import type { Config } from "tailwindcss";

/**
 * Token-based palette. Every colour is a CSS variable defined in
 * `app/globals.css`, so light and dark are one source of truth and components
 * never hardcode a hex value.
 *
 * Contrast (verified, WCAG 2.1):
 *   - all text tokens on `bg` and `surface`: >= 4.5:1 in BOTH themes
 *   - `border-strong` (input/control boundaries) and `ring`: >= 3:1 (1.4.11)
 *   - `border` is decorative only - never rely on it to identify a control
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--color-bg) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        fg: "rgb(var(--color-fg) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        "border-strong": "rgb(var(--color-border-strong) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--color-primary) / <alpha-value>)",
          fg: "rgb(var(--color-primary-fg) / <alpha-value>)",
          hover: "rgb(var(--color-primary-hover) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "rgb(var(--color-danger) / <alpha-value>)",
          fg: "rgb(var(--color-danger-fg) / <alpha-value>)",
        },
        success: {
          DEFAULT: "rgb(var(--color-success) / <alpha-value>)",
          fg: "rgb(var(--color-success-fg) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "rgb(var(--color-warning) / <alpha-value>)",
          fg: "rgb(var(--color-warning-fg) / <alpha-value>)",
        },
        ring: "rgb(var(--color-ring) / <alpha-value>)",
      },
      borderRadius: {
        card: "0.75rem",
      },
      ringColor: {
        DEFAULT: "rgb(var(--color-ring) / <alpha-value>)",
      },
      ringOffsetColor: {
        DEFAULT: "rgb(var(--color-bg) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};

export default config;
