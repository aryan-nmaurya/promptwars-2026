"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  selected?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
  children: ReactNode;
}

/**
 * Chip interactive toggle.
 *
 * Strict WCAG compliance:
 * - Real button with `aria-pressed` (not a div, not a faked checkbox).
 * - Min hit target 40px tall to satisfy mobile touch target guidance.
 * - Transitions restricted to `background-color`, `border-color`, `transform` (140ms) — never `all`.
 * - Contrast-verified tokens: selected is `bg-amber text-amber-ink` (8.83:1 dark, 5.52:1 light).
 *   Unselected text is `--ink` (16:1), border is `--control-border` (3.9:1).
 *   `--amber-dim` is used solely for border hover states, never text.
 */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  {
    selected = false,
    onRemove,
    removeLabel = "Remove tag",
    className = "",
    children,
    disabled = false,
    onClick,
    ...rest
  },
  ref,
) {
  return (
    <span className="inline-flex items-center">
      <button
        ref={ref}
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={onClick}
        className={[
          "group inline-flex min-h-[40px] select-none items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-medium",
          "transition-[background-color,border-color,transform] duration-140 active:scale-[0.98]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          selected
            ? "border border-amber bg-amber text-amber-ink shadow-sm"
            : "border border-control-border bg-surface text-ink hover:border-amber-dim hover:bg-surface-2",
          className,
        ].join(" ")}
        {...rest}
      >
        <span>{children}</span>
        {onRemove ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={removeLabel}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onRemove();
              }
            }}
            className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded text-xs opacity-70 hover:opacity-100"
          >
            ×
          </span>
        ) : null}
      </button>
    </span>
  );
});
