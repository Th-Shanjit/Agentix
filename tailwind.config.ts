import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      colors: {
        surface: {
          DEFAULT: "var(--surface)",
          hover: "var(--surface-hover)",
          inset: "var(--surface-inset)",
          overlay: "var(--surface-overlay)",
        },
        border: "var(--border)",
        ring: "var(--ring)",
        foreground: {
          DEFAULT: "var(--foreground)",
          secondary: "var(--foreground-secondary)",
          muted: "var(--foreground-muted)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          hover: "var(--primary-hover)",
          foreground: "var(--primary-foreground)",
          subtle: "var(--primary-subtle)",
        },
        success: {
          DEFAULT: "var(--success)",
          foreground: "var(--success-foreground)",
          subtle: "var(--success-subtle)",
        },
        shell: {
          bg: "var(--shell-bg)",
        },
      },
      borderRadius: {
        card: "0.875rem",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
      },
    },
  },
  plugins: [],
};

export default config;
