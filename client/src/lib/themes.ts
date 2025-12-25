export type ThemeId = "midnight" | "sandstone" | "verdant";

export type Theme = {
  id: ThemeId;
  name: string;
  cssVars: Record<string, string>;
  terminal: {
    background: string;
    foreground: string;
    cursor: string;
    cursorAccent: string;
    selectionBackground: string;
  };
};

export const THEMES: Theme[] = [
  {
    id: "midnight",
    name: "Midnight",
    cssVars: {
      "--color-bg-primary": "#0f0f1a",
      "--color-bg-secondary": "#16162a",
      "--color-bg-tertiary": "#1a1a2e",
      "--color-bg-hover": "#2d2d4a",
      "--color-bg-active": "#1e1e3a",
      "--color-border": "#2d2d4a",
      "--color-border-focus": "#5d5d8b",
      "--color-text-primary": "#eaeaea",
      "--color-text-secondary": "#b0b0c0",
      "--color-text-muted": "#666666",
      "--color-accent": "#3d3d6b",
      "--color-accent-hover": "#4d4d7b",
      "--color-primary": "#6366f1",
      "--color-success": "#22c55e",
      "--color-error": "#ff6666",
      "--color-link": "#7dd3fc",
      "--color-link-bg-hover": "#1e3a5f",
    },
    terminal: {
      background: "#1a1a2e",
      foreground: "#eaeaea",
      cursor: "#eaeaea",
      cursorAccent: "#1a1a2e",
      selectionBackground: "#3d3d5c",
    },
  },
  {
    id: "sandstone",
    name: "Sandstone",
    cssVars: {
      "--color-bg-primary": "#15120d",
      "--color-bg-secondary": "#1c1812",
      "--color-bg-tertiary": "#231e16",
      "--color-bg-hover": "#2e271c",
      "--color-bg-active": "#262017",
      "--color-border": "#3a3124",
      "--color-border-focus": "#9a7f55",
      "--color-text-primary": "#f2e6d5",
      "--color-text-secondary": "#cbb89f",
      "--color-text-muted": "#7f6d58",
      "--color-accent": "#8b6b3f",
      "--color-accent-hover": "#a67f4a",
      "--color-primary": "#e0b76f",
      "--color-success": "#8bcf9b",
      "--color-error": "#f08a6b",
      "--color-link": "#a5d6ff",
      "--color-link-bg-hover": "#2a2a2a",
    },
    terminal: {
      background: "#1e1a13",
      foreground: "#f2e6d5",
      cursor: "#f2e6d5",
      cursorAccent: "#1e1a13",
      selectionBackground: "#3a3024",
    },
  },
  {
    id: "verdant",
    name: "Verdant",
    cssVars: {
      "--color-bg-primary": "#0f1612",
      "--color-bg-secondary": "#151f19",
      "--color-bg-tertiary": "#1a241e",
      "--color-bg-hover": "#243128",
      "--color-bg-active": "#1d281f",
      "--color-border": "#2a3a30",
      "--color-border-focus": "#4f8b6c",
      "--color-text-primary": "#e2f2e6",
      "--color-text-secondary": "#b5d2bf",
      "--color-text-muted": "#6c8a76",
      "--color-accent": "#2f6a4b",
      "--color-accent-hover": "#3a7a57",
      "--color-primary": "#3cc07a",
      "--color-success": "#4fd18a",
      "--color-error": "#f07b6a",
      "--color-link": "#8fd3b7",
      "--color-link-bg-hover": "#243128",
    },
    terminal: {
      background: "#18231c",
      foreground: "#e2f2e6",
      cursor: "#e2f2e6",
      cursorAccent: "#18231c",
      selectionBackground: "#2c3a30",
    },
  },
];

const themeById = new Map<ThemeId, Theme>(THEMES.map((theme) => [theme.id, theme]));

export const DEFAULT_THEME_ID: ThemeId = "midnight";

export function getTheme(themeId: ThemeId): Theme {
  return themeById.get(themeId) || themeById.get(DEFAULT_THEME_ID)!;
}

export function applyTheme(themeId: ThemeId): void {
  const theme = getTheme(themeId);
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.cssVars)) {
    root.style.setProperty(key, value);
  }
  root.dataset.theme = theme.id;
}
