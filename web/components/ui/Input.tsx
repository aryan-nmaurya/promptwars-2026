"use client";

import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  /** Required. There is no unlabelled variant of this component on purpose. */
  label: string;
  /** Helper text below the field. Wired to the input via aria-describedby. */
  hint?: ReactNode;
  /** Error text. Sets aria-invalid and takes over the description. */
  error?: string;
  /** Renders the label visually hidden but still announced. */
  labelHidden?: boolean;
}

/**
 * The label is always linked with `htmlFor` pointing at a generated id, so it
 * is impossible to ship an input whose label is not associated. `hint` and
 * `error` are wired through `aria-describedby`.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, labelHidden = false, className = "", required, ...rest },
  ref,
) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className={labelHidden ? "sr-only" : "text-sm font-medium text-ink"}
      >
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            {" *"}
          </span>
        ) : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>

      <input
        ref={ref}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={[
          "h-10 rounded-md bg-bg px-3 text-sm text-ink",
          "border placeholder:text-ink-muted",
          error ? "border-danger" : "border-control-border",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        ].join(" ")}
        {...rest}
      />

      {hint && !error ? (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
});
