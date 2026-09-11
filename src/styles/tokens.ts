/**
 * Design tokens shared across all VacancyPilot UI surfaces.
 * Use these instead of hardcoded values for visual consistency.
 */

// ── Palette ──

export const colors = {
  /** Primary heading, active state text */
  navy: "#1a3a5c",
  /** Primary interactive (buttons, active tab, link) */
  blue: "#4a90d9",
  /** Success, positive signal */
  green: "#2a8",
  /** Medium-positive score */
  greenMuted: "#6a6",
  /** Warning / medium score */
  amber: "#e6a817",
  /** Danger, negative signal, error text */
  red: "#c44",
  /** Light error background border */
  redBorder: "#e0b0b0",
  /** Dark amber text (passive status hints) */
  amberText: "#8a7010",
  /** Card / nav background */
  cardBg: "#fafafa",
  /** Raised surface used for primary workspace cards */
  surface: "#ffffff",
  /** Active / selected row background */
  activeBg: "#f0f6ff",
  /** Neutral background (page status, etc.) */
  neutralBg: "#f5f5f5",
  /** Error background */
  errorBg: "#fff5f5",
  /** Warning/notice background */
  warningBg: "#fff8e6",
  /** API key warning background */
  keyWarningBg: "#fffdf0",
  /** API key warning border */
  keyWarningBorder: "#f0d060",
  /** API key warning text */
  keyWarningText: "#b08010",
  /** Action error background */
  actionErrorBg: "#fff3f3",
  /** Action error border */
  actionErrorBorder: "#fcc",
  /** Border default */
  border: "#e0e0e0",
  /** Slightly stronger border for interactive controls */
  borderStrong: "#cbd5e1",
  /** Border light */
  borderLight: "#ddd",
  /** Border very light */
  borderHairline: "#eee",
  /** Text body default */
  text: "#333",
  /** Text secondary */
  textSecondary: "#555",
  /** Text muted */
  textMuted: "#666",
  /** Text faint / metadata */
  textFaint: "#888",
  /** Text disabled / placeholder */
  textPlaceholder: "#999",
  /** Text very faint */
  textVeryFaint: "#aaa",
  /** White */
  white: "#fff",
  /** Granted badge background */
  grantedBadgeBg: "#e6f7e6",
  /** Granted badge text */
  grantedBadgeText: "#2a8",
  /** Keyboard focus ring */
  focus: "#2563eb",
} as const;

// ── Typography ──

export const fontSizes = {
  xs: 10,
  sm: 11,
  md: 12,
  body: 13,
  cardHeading: 14,
  title: 15,
  sectionHeading: 16,
  pageTitle: 22,
  icon: 32,
} as const;

export const fontWeights = {
  normal: 400,
  semibold: 600,
  bold: 700,
} as const;

// ── Spacing ──

export const spacing = {
  xs2: 2,
  xs3: 3,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  xxl: 14,
  xxxl: 16,
  section: 20,
  empty: 24,
  emptyLarge: 32,
  page: 24,
} as const;

// ── Borders ──

export const borderRadius = {
  sm: 3,
  md: 4,
  lg: 6,
  xl: 8,
  pill: 999,
} as const;

export const fontFamily = `system-ui, -apple-system, sans-serif` as const;
