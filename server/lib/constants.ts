// Centralized constants - no more magic numbers scattered in code

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

  /** Minimum rows to display */
  MIN_ROWS: 5,

  /** Default columns */
  DEFAULT_COLS: 120,

  /** Default rows */
  DEFAULT_ROWS: 30,
} as const;

// ============================================
// File Operations
// ============================================

export const FILES = {
  /** Maximum file size to read (bytes) - 1MB */
  MAX_FILE_SIZE: 1024 * 1024,

  /** Bytes to check for binary detection */
  BINARY_CHECK_SIZE: 8192,

  /** Polling interval for file changes (ms) - used until WebSocket push implemented */
  POLL_INTERVAL_MS: 5000,

  /** Debounce delay for file watcher events (ms) */
  WATCHER_DEBOUNCE_MS: 300,
} as const;

// ============================================
// Server Configuration
// ============================================

export const SERVER = {
  /** Default port */
  DEFAULT_PORT: 8000,

  /** Graceful shutdown timeout (ms) */
  SHUTDOWN_TIMEOUT_MS: 5000,

  /** WebSocket close code for server shutdown */
  WS_CLOSE_GOING_AWAY: 1001,
} as const;

// ============================================
// Theme Colors
// ============================================

export const THEME = {
  terminal: {
    background: "#1a1a2e",
    foreground: "#eaeaea",
    cursor: "#eaeaea",
    cursorAccent: "#1a1a2e",
    selectionBackground: "#3d3d5c",
  },
} as const;

// ============================================
// UI Constants
// ============================================

export const UI = {
  /** Session name max length */
  SESSION_NAME_MAX_LENGTH: 100,

  /** Folder name max length */
  FOLDER_NAME_MAX_LENGTH: 255,

  /** iOS keyboard scroll delay (ms) */
  IOS_KEYBOARD_DELAY_MS: 300,
} as const;
