// Centralized constants for client-side code

// ============================================
// Terminal Configuration
// ============================================

export const TERMINAL = {
  /** Number of lines to keep in scrollback buffer */
  SCROLLBACK_LINES: 5000,

  /** Font size for desktop displays */
  FONT_SIZE_DESKTOP: 14,

  /** Font size for mobile displays */
  FONT_SIZE_MOBILE: 12,

  /** Breakpoint for mobile detection (px) */
  MOBILE_BREAKPOINT: 768,

  /** Delay before resize handler runs (ms) */
  RESIZE_DEBOUNCE_MS: 200,

  /** Touch scroll sensitivity threshold (px) */
  TOUCH_SCROLL_THRESHOLD: 30,

  /** Extra row buffer for mobile keyboards */
  MOBILE_ROW_BUFFER: 10,

  /** Extra row buffer for desktop layout */
  DESKTOP_ROW_BUFFER: 2,

  /** Minimum rows to display */
  MIN_ROWS: 5,
} as const;

// ============================================
// UI Constants
// ============================================

export const UI = {
  /** iOS keyboard scroll delay (ms) */
  IOS_KEYBOARD_DELAY_MS: 300,
} as const;
