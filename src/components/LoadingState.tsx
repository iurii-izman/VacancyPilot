import type { ReactNode } from "react";
import { colors, fontSizes, spacing, fontFamily } from "../styles";

interface LoadingStateProps {
  /** Optional message; defaults to "Loading…". */
  message?: string;
}

/**
 * Minimal loading placeholder.
 * Used when data is being fetched or computed asynchronously.
 * Uses shared design tokens for visual consistency.
 */
export function LoadingState({
  message = "Loading\u2026",
}: LoadingStateProps): ReactNode {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.empty,
        fontFamily,
        fontSize: fontSizes.body,
        color: colors.textPlaceholder,
      }}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
