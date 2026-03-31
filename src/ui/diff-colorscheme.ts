import type { CSSProperties } from "react";

/**
 * Syntax highlighting themes supported by @pierre/diffs (shiki-based).
 * "pierre-dark" and "pierre-light" are built-in. Other names are shiki themes.
 * See https://diffs.com/docs#themes for the full list.
 */
export const THEME_OPTIONS = [
  { value: "", label: "Default (pierre-dark)" },
  { value: "github-dark", label: "GitHub Dark" },
  { value: "github-dark-dimmed", label: "GitHub Dark Dimmed" },
  { value: "dracula", label: "Dracula" },
  { value: "nord", label: "Nord" },
  { value: "one-dark-pro", label: "One Dark Pro" },
  { value: "tokyo-night", label: "Tokyo Night" },
  { value: "vitesse-dark", label: "Vitesse Dark" },
  { value: "custom", label: "Custom..." },
] as const;

/**
 * UI chrome colors derived from each theme's palette.
 * Keeps the app shell (buttons, accents, borders) consistent with the diffs.
 */
interface ThemePalette {
  "--ui-addition": string;
  "--ui-addition-muted": string;
  "--ui-deletion": string;
  "--ui-deletion-muted": string;
  "--ui-accent": string;
}

const DEFAULT_PALETTE: ThemePalette = {
  "--ui-addition": "#3fb950",
  "--ui-addition-muted": "#238636",
  "--ui-deletion": "#f85149",
  "--ui-deletion-muted": "#da3633",
  "--ui-accent": "#388bfd",
};

const THEME_PALETTES: Record<string, ThemePalette> = {
  "github-dark": { ...DEFAULT_PALETTE },
  "github-dark-dimmed": {
    "--ui-addition": "#57ab5a",
    "--ui-addition-muted": "#347d39",
    "--ui-deletion": "#e5534b",
    "--ui-deletion-muted": "#c93c37",
    "--ui-accent": "#539bf5",
  },
  "dracula": {
    "--ui-addition": "#50fa7b",
    "--ui-addition-muted": "#2d8b4e",
    "--ui-deletion": "#ff5555",
    "--ui-deletion-muted": "#b83a3a",
    "--ui-accent": "#bd93f9",
  },
  "nord": {
    "--ui-addition": "#A3BE8C",
    "--ui-addition-muted": "#6b8a5e",
    "--ui-deletion": "#BF616A",
    "--ui-deletion-muted": "#8b3d44",
    "--ui-accent": "#81A1C1",
  },
  "one-dark-pro": {
    "--ui-addition": "#98c379",
    "--ui-addition-muted": "#5f8a46",
    "--ui-deletion": "#e06c75",
    "--ui-deletion-muted": "#a34a52",
    "--ui-accent": "#61afef",
  },
  "tokyo-night": {
    "--ui-addition": "#9ece6a",
    "--ui-addition-muted": "#5f8a3e",
    "--ui-deletion": "#f7768e",
    "--ui-deletion-muted": "#b34d5e",
    "--ui-accent": "#7aa2f7",
  },
  "vitesse-dark": {
    "--ui-addition": "#4d9375",
    "--ui-addition-muted": "#366b53",
    "--ui-deletion": "#cb7676",
    "--ui-deletion-muted": "#944f4f",
    "--ui-accent": "#4fc1ff",
  },
};

export function getThemePalette(theme: string): ThemePalette {
  return THEME_PALETTES[theme] ?? DEFAULT_PALETTE;
}

/**
 * Parse raw CSS variable declarations into key-value pairs.
 * Accepts lines like: --diffs-added-dark: #3d8b4f;
 */
export function parseCustomCSS(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = /^\s*(--[\w-]+)\s*:\s*(.+?)\s*;?\s*$/.exec(line);
    if (match) {
      result[match[1]] = match[2];
    }
  }
  return result;
}

export function getCustomCSSStyles(customCSS: string): CSSProperties {
  if (!customCSS.trim()) return {};
  return parseCustomCSS(customCSS) as CSSProperties;
}
