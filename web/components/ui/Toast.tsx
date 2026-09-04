"use client";

import type { ReactNode } from "react";

export type StatusTone = "info" | "success" | "warning" | "danger";

export interface StatusRegionProps {
  /**
   * The live region is ALWAYS in the DOM, even when empty. This is the whole
   * trick: a region inserted at the same time as its content is usually not
   * announced. Render it once, then change what is inside it.
   */
  children?: ReactNode;
  className?: string;
  /** Use "assertive" only for errors that interrupt the user. */
  politeness?: "polite" | "assertive";
}

export function StatusRegion({ children, className = "", politeness = "polite" }: StatusRegionProps) {
  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className={className}
    >
      {children}
    </div>
  );
}

export interface ToastProps {
  tone?: StatusTone;
  title?: string;
  children: ReactNode;
  onDismiss?: () => void;
}

const TONES: Record<StatusTone, string> = {
  info: "border-border-strong bg-surface text-fg",
  success: "border-success/50 bg-success/10 text-fg",
  warning: "border-warning/50 bg-warning/10 text-fg",
  danger: "border-danger/50 bg-danger/10 text-fg",
};

const ICON_TONES: Record<StatusTone, string> = {
  info: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

/**
 * The visual message. Put it INSIDE a `StatusRegion` to have it announced:
 *
 *   <StatusRegion>{message ? <Toast tone="success">{message}</Toast> : null}</StatusRegion>
 *
 * Tone is never the only signal - the title text carries the meaning too, so
 * this does not fail WCAG 1.4.1 (use of colour).
 */
export function Toast({ tone = "info", title, children, onDismiss }: ToastProps) {
  return (
    <div className={`flex items-start gap-3 rounded-md border p-3 text-sm ${TONES[tone]}`}>
      <span aria-hidden="true" className={`mt-0.5 font-bold ${ICON_TONES[tone]}`}>
        {tone === "success" ? "✓" : tone === "danger" ? "✕" : tone === "warning" ? "⚠" : "ℹ"}
      </span>
      <div className="flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className="text-fg">{children}</div>
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded px-1 text-muted hover:text-fg"
        >
          <span aria-hidden="true">{"✕"}</span>
          <span className="sr-only">Dismiss{title ? `: ${title}` : ""}</span>
        </button>
      ) : null}
    </div>
  );
}
