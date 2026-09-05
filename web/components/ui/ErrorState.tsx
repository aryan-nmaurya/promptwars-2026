"use client";

import { Button } from "./Button";

export interface ErrorStateProps {
  title?: string;
  /** Already normalised - pass `toErrorMessage(err)` from `lib/api`. */
  message: string;
  /** Shows a retry button when provided. */
  onRetry?: () => void;
  retryLabel?: string;
}

/**
 * `role="alert"` is an assertive live region: this interrupts, which is the
 * right call for a failure the user must act on. For non-blocking updates use
 * `StatusRegion` instead.
 */
export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try again",
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-card border border-danger bg-danger/10 p-5"
    >
      <div>
        <p className="font-semibold text-danger">{title}</p>
        <p className="mt-1 text-sm text-ink">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
