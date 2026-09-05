import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Disables the button and shows a spinner. Announced via the spinner's live region. */
  loading?: boolean;
  /** Required when `loading` replaces the label, so the control keeps a name. */
  loadingLabel?: string;
  children: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-amber text-amber-ink hover:bg-amber",
  secondary: "bg-surface text-ink border border-control-border hover:bg-surface-2",
  ghost: "bg-transparent text-amber hover:bg-amber/10",
  danger: "bg-danger text-danger-ink hover:opacity-90",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

/**
 * Never sets `outline: none` without a replacement - the global
 * `:focus-visible` ring in `globals.css` does the work.
 *
 * `disabled` keeps 4.5:1 text contrast via opacity on an already-passing pair,
 * and disabled controls are exempt from contrast minimums regardless.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, loadingLabel = "Loading", className = "", children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      className={[
        "inline-flex items-center justify-center rounded-md font-medium",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(" ")}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner size="sm" label={loadingLabel} />
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
});
