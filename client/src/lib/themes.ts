export type ThemeId = "dark" | "light";

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
    id: "dark",
    name: "Dark",
    cssVars: {
      // Backgrounds - rich near-black with subtle depth
      "--color-bg-primary": "#09090B",
      "--color-bg-secondary": "#0F0F12",
      "--color-bg-tertiary": "#18181B",
      "--color-bg-hover": "#1F1F23",
      "--color-bg-active": "#27272B",

      // Borders - subtle, not harsh
      "--color-border": "#27272A",
      "--color-border-focus": "#3F3F46",

      // Text - clear hierarchy
      "--color-text-primary": "#FAFAFA",
      "--color-text-secondary": "#A1A1AA",
      "--color-text-muted": "#71717A",

      // Accent - professional blue
      "--color-accent": "#5B8DEF",
      "--color-accent-hover": "#4A7ADB",
      "--color-accent-muted": "rgba(91, 141, 239, 0.15)",

      // Semantic colors
      "--color-primary": "#5B8DEF",
      "--color-success": "#22C55E",
      "--color-error": "#EF4444",
      "--color-warning": "#F59E0B",
      "--color-link": "#5B8DEF",
      "--color-link-bg-hover": "rgba(91, 141, 239, 0.1)",
    },
    terminal: {
      background: "#0F0F12",
      foreground: "#E4E4E7",
      cursor: "#5B8DEF",
      cursorAccent: "#0F0F12",
      selectionBackground: "#27272A",
    },
  },
  {
    id: "light",
    name: "Light",
    cssVars: {
      // Backgrounds - warm whites
      "--color-bg-primary": "#FFFFFF",
      "--color-bg-secondary": "#FAFAFA",
      "--color-bg-tertiary": "#F4F4F5",
      "--color-bg-hover": "#E4E4E7",
      "--color-bg-active": "#D4D4D8",

      // Borders
      "--color-border": "#E4E4E7",
      "--color-border-focus": "#A1A1AA",

      // Text
      "--color-text-primary": "#09090B",
      "--color-text-secondary": "#52525B",
      "--color-text-muted": "#71717A",

      // Accent - same blue
      "--color-accent": "#5B8DEF",
      "--color-accent-hover": "#4A7ADB",
      "--color-accent-muted": "rgba(91, 141, 239, 0.12)",

      // Semantic colors
      "--color-primary": "#5B8DEF",
      "--color-success": "#16A34A",
      "--color-error": "#DC2626",
      "--color-warning": "#D97706",
      "--color-link": "#5B8DEF",
      "--color-link-bg-hover": "rgba(91, 141, 239, 0.08)",
    },
    terminal: {
      background: "#FAFAFA",
      foreground: "#18181B",
      cursor: "#5B8DEF",
      cursorAccent: "#FAFAFA",
      selectionBackground: "#E4E4E7",
    },
  },
];

const themeById = new Map<ThemeId, Theme>(THEMES.map((theme) => [theme.id, theme]));

export const DEFAULT_THEME_ID: ThemeId = "dark";

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
