import type React from "react";
import {
  colors,
  fontSizes,
  fontWeights,
  spacing,
  borderRadius,
  fontFamily,
} from "./tokens";

// ── Section / Content ──

/** h2-style heading for section titles (About, Permissions, Privacy, Onboarding, etc.) */
export const sectionHeading: React.CSSProperties = {
  fontSize: fontSizes.sectionHeading,
  fontWeight: fontWeights.bold,
  margin: "0 0 6px",
  color: colors.navy,
};

/** Consistent workspace title and lead copy. */
export const pageTitle: React.CSSProperties = {
  fontSize: fontSizes.pageTitle,
  lineHeight: 1.2,
  fontWeight: fontWeights.bold,
  margin: 0,
  color: colors.navy,
};

export const pageIntro: React.CSSProperties = {
  maxWidth: 760,
  margin: "6px 0 18px",
  fontSize: fontSizes.body,
  lineHeight: 1.5,
  color: colors.textMuted,
};

/** Card container used across trust surfaces and vacancy detail panels. */
export const card: React.CSSProperties = {
  padding: spacing.xxl,
  border: `1px solid ${colors.border}`,
  borderRadius: borderRadius.xl,
  background: colors.surface,
  marginBottom: spacing.xl,
};

export const compactCard: React.CSSProperties = {
  ...card,
  padding: spacing.xl,
};

/** h3-style heading inside a card. */
export const cardHeading: React.CSSProperties = {
  fontSize: fontSizes.cardHeading,
  fontWeight: fontWeights.semibold,
  margin: "0 0 6px",
  color: colors.navy,
};

/** Paragraph body text. */
export const para: React.CSSProperties = {
  fontSize: fontSizes.md,
  color: colors.textSecondary,
  margin: "0 0 10px",
  lineHeight: 1.6,
};

/** List style used in trust disclosure cards. */
export const listStyle: React.CSSProperties = {
  margin: "4px 0 0",
  paddingLeft: 18,
  fontSize: fontSizes.md,
  color: colors.textSecondary,
  lineHeight: 1.7,
};

/** Very muted metadata line. */
export const muted: React.CSSProperties = {
  fontSize: fontSizes.sm,
  color: colors.textFaint,
  margin: "0 0 4px",
};

// ── Panel / Shell ──

/** Shell wrapper for popup-content, side-panel body, dashboard main area. */
export const shellBody: React.CSSProperties = {
  fontFamily,
  fontSize: fontSizes.body,
  color: colors.text,
};

/** Header bar used in popup, side panel, and dashboard sidebar. */
export const panelHeader: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

/** App title style (h1 or strong label) used in all surfaces. */
export const appTitle: React.CSSProperties = {
  fontSize: fontSizes.title,
  fontWeight: fontWeights.bold,
  margin: 0,
  color: colors.navy,
};

/** Subtitle below app title. */
export const appSubtitle: React.CSSProperties = {
  margin: "2px 0 0",
  fontSize: fontSizes.xs,
  color: colors.textPlaceholder,
};

/** Header container with bottom border (side panel header, dashboard sidebar header). */
export const headerBar: React.CSSProperties = {
  padding: `${spacing.lg}px ${spacing.xxl}px`,
  borderBottom: `1px solid ${colors.border}`,
  background: colors.cardBg,
};

/** Content area with scroll (side panel tab content, dashboard main). */
export const scrollArea: React.CSSProperties = {
  flex: 1,
  overflow: "auto",
  padding: spacing.xxl,
};

/** Page status / info chip background. */
export const infoChip: React.CSSProperties = {
  padding: `${spacing.sm}px ${spacing.md}px`,
  background: colors.neutralBg,
  borderRadius: borderRadius.md,
};

/** Warning chip for passive HH status hints. */
export const warningChip: React.CSSProperties = {
  padding: `${spacing.sm}px ${spacing.md}px`,
  background: colors.warningBg,
  border: `1px solid #e6d58c`,
  borderRadius: borderRadius.md,
  fontSize: fontSizes.md,
  color: colors.amberText,
};

/** Error chip for action errors. */
export const errorChip: React.CSSProperties = {
  padding: `${spacing.sm}px ${spacing.md}px`,
  background: colors.actionErrorBg,
  border: `1px solid ${colors.actionErrorBorder}`,
  borderRadius: borderRadius.md,
};

// ── Buttons ──

const buttonBase: React.CSSProperties = {
  cursor: "pointer",
  border: "none",
  borderRadius: borderRadius.lg,
};

/** Primary action button. */
export const primaryButton: React.CSSProperties = {
  ...buttonBase,
  minHeight: 34,
  padding: `0 ${spacing.section}px`,
  fontSize: fontSizes.body,
  background: colors.blue,
  color: colors.white,
  fontWeight: fontWeights.semibold,
  boxShadow: "0 1px 2px rgba(26, 58, 92, 0.12)",
};

/** Secondary / outline button. */
export const secondaryButton: React.CSSProperties = {
  ...buttonBase,
  minHeight: 32,
  padding: `0 ${spacing.lg}px`,
  fontSize: fontSizes.md,
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: borderRadius.md,
  background: colors.white,
  color: colors.text,
};

export const tertiaryButton: React.CSSProperties = {
  ...buttonBase,
  minHeight: 30,
  padding: `0 ${spacing.md}px`,
  fontSize: fontSizes.md,
  border: "1px solid transparent",
  background: "transparent",
  color: colors.blue,
};

export const destructiveButton: React.CSSProperties = {
  ...secondaryButton,
  borderColor: colors.redBorder,
  color: colors.red,
  background: colors.errorBg,
};

export function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    ...secondaryButton,
    minHeight: 34,
    borderColor: active ? colors.blue : colors.borderStrong,
    background: active ? colors.activeBg : colors.white,
    color: active ? colors.navy : colors.textSecondary,
    fontWeight: active ? fontWeights.semibold : fontWeights.normal,
    boxShadow: active ? `inset 0 -2px 0 ${colors.blue}` : "none",
  };
}

export const tabListStyle: React.CSSProperties = {
  display: "flex",
  gap: spacing.sm,
  flexWrap: "wrap",
  marginBottom: spacing.xxxl,
};

/** Small icon/label button (refresh, toggle). */
export const smallButton: React.CSSProperties = {
  padding: `${spacing.xs2}px ${spacing.sm}px`,
  fontSize: fontSizes.sm,
  cursor: "pointer",
  border: `1px solid ${colors.borderLight}`,
  borderRadius: borderRadius.md,
  background: colors.white,
  color: colors.textFaint,
};

/** Expand/collapse toggle button (full-width). */
export const expandToggle: React.CSSProperties = {
  width: "100%",
  padding: `${spacing.xs3}px ${spacing.sm}px`,
  fontSize: fontSizes.sm,
  cursor: "pointer",
  border: `1px solid ${colors.borderLight}`,
  borderRadius: borderRadius.sm,
  background: "#f9f9f9",
  color: colors.textFaint,
  textAlign: "left",
};

// ── Form controls ──

/** Shared label style. */
export const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: fontSizes.sm,
  fontWeight: fontWeights.semibold,
  color: colors.textMuted,
  marginBottom: spacing.xs3,
};

/** Shared text/number input style. */
export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: `${spacing.xs}px ${spacing.sm}px`,
  fontSize: fontSizes.md,
  border: `1px solid ${colors.borderLight}`,
  borderRadius: borderRadius.sm,
  color: colors.text,
};

/** Shared select style. */
export const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: `${spacing.xs}px ${spacing.sm}px`,
  fontSize: fontSizes.md,
  border: `1px solid ${colors.borderLight}`,
  borderRadius: borderRadius.sm,
  background: colors.white,
  color: colors.text,
};

// ── Toggle ──

export const toggleBase: React.CSSProperties = {
  width: 36,
  height: 20,
  borderRadius: 10,
  position: "relative",
  cursor: "pointer",
  border: "none",
  padding: 0,
  transition: "background 0.2s",
};

/** Compute left position for the toggle knob (on/off). */
export function knobLeft(on: boolean): string {
  return on ? "18px" : "2px";
}

// ── Table ──

/** Permission / data table style. */
export const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: fontSizes.md,
};

export const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: `${spacing.xs}px ${spacing.md}px`,
  borderBottom: `1px solid ${colors.borderHairline}`,
  fontWeight: fontWeights.semibold,
  color: colors.textSecondary,
};

export const tdStyle: React.CSSProperties = {
  padding: `${spacing.xs}px ${spacing.md}px`,
  borderBottom: `1px solid ${colors.neutralBg}`,
  color: colors.text,
  verticalAlign: "top",
};

// ── Status badge ──

/** Inline status/granted badge. */
export const grantedBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "1px 6px",
  borderRadius: borderRadius.sm,
  fontSize: fontSizes.xs,
  fontWeight: fontWeights.semibold,
  background: colors.grantedBadgeBg,
  color: colors.grantedBadgeText,
};

export const statusBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 22,
  padding: "0 8px",
  borderRadius: borderRadius.pill,
  fontSize: fontSizes.sm,
  fontWeight: fontWeights.semibold,
  whiteSpace: "nowrap",
};

// ── Row ──

/** Settings / toggle row with label + control. */
export const settingsRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: `${spacing.md}px 0`,
  borderBottom: `1px solid ${colors.borderHairline}`,
};

/** Section description text. */
export const sectionDesc: React.CSSProperties = {
  fontSize: fontSizes.md,
  color: colors.textMuted,
  margin: "0 0 14px",
};

/** Score color helper — maps total score to a display color. */
export function scoreColor(total: number | undefined): string {
  if (total === undefined) return colors.textPlaceholder;
  if (total >= 85) return colors.green;
  if (total >= 70) return colors.greenMuted;
  if (total >= 50) return colors.amber;
  return colors.red;
}

/**
 * Softer score color for compact popup display.
 * Avoids alarm-heavy red for low scores; reserves red for actual risk flags.
 */
export function popupScoreColor(total: number | undefined): string {
  if (total === undefined) return colors.textPlaceholder;
  if (total >= 85) return colors.green;
  if (total >= 70) return colors.greenMuted;
  if (total >= 50) return colors.amber;
  if (total >= 35) return colors.textMuted;
  return colors.amber; // soft amber for very low scores, not alarm red
}
