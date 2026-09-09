import type { ReactNode } from "react";
import { colors, fontSizes, fontWeights, spacing, fontFamily, borderRadius } from "../styles";

interface EmptyStateProps {
  /** Icon or emoji to show above the message. */
  icon?: string;
  /** Primary message. */
  message: string;
  /** Optional secondary description. */
  description?: string;
  /** Optional next action for actionable empty/setup states. */
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Placeholder for screens that have no data yet.
 * Uses shared design tokens for visual consistency.
 */
export function EmptyState({
  icon = "📋",
  message,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps): ReactNode {
  return (
    <div
      style={{
        maxWidth: 360,
        minWidth: 200,
        margin: "48px auto",
        padding: spacing.emptyLarge,
        fontFamily,
        fontSize: fontSizes.body,
        color: colors.textPlaceholder,
        textAlign: "center",
        lineHeight: 1.5,
        wordBreak: "break-word",
      }}
    >
      <span
        style={{
          display: "block",
          fontSize: fontSizes.icon,
          marginBottom: spacing.md,
          lineHeight: 1,
        }}
      >
        {icon}
      </span>
      <p
        style={{
          margin: `0 0 ${spacing.sm}px`,
          fontWeight: fontWeights.semibold,
          color: colors.textMuted,
        }}
      >
        {message}
      </p>
      {description && (
        <p style={{ margin: 0, fontSize: fontSizes.md, lineHeight: 1.5 }}>
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          style={{
            marginTop: spacing.lg,
            minHeight: 34,
            padding: `0 ${spacing.xl}px`,
            border: "none",
            borderRadius: borderRadius.lg,
            background: colors.blue,
            color: colors.white,
            fontWeight: fontWeights.semibold,
            cursor: "pointer",
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
