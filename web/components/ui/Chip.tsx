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
 *   Unselected text is `--ink` (16:1), and the border is `--control-border`
 *   (4.42:1 dark, 3.27:1 light) in every state, hover included: `--amber-dim`
 *   measures 2.73:1 and would drop a control boundary below WCAG 1.4.11's 3:1.
 * - When `onRemove` is given, the remove control is a SIBLING button, never a
 *   descendant of the toggle. Nesting one interactive element inside another
 *   is invalid HTML and leaves the inner control unreachable in some screen
 *   readers, which is exactly where a "remove this tag" control must work.
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
  const surface = selected
    ? "border-amber bg-amber text-amber-ink shadow-sm"
    : "border-control-border bg-surface text-ink hover:bg-surface-2";

  return (
    <span className="inline-flex items-center">
      <button
        ref={ref}
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={onClick}
        className={[
          "group inline-flex min-h-[40px] select-none items-center justify-center gap-1.5 border px-3.5 py-2 text-sm font-medium",
          "transition-[background-color,border-color,transform] duration-140 active:scale-[0.98]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          onRemove ? "rounded-l-md border-r-0" : "rounded-md",
          surface,
          className,
        ].join(" ")}
        {...rest}
      >
        <span>{children}</span>
      </button>
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          disabled={disabled}
          onClick={onRemove}
          className={[
            "inline-flex min-h-[40px] select-none items-center justify-center rounded-r-md border px-2.5 text-sm",
            "transition-[background-color,border-color,transform] duration-140 active:scale-[0.98]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            surface,
          ].join(" ")}
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </span>
  );
});
