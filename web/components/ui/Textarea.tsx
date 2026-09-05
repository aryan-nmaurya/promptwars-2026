"use client";

import { forwardRef, useId } from "react";
import type { ReactNode, TextareaHTMLAttributes } from "react";

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  /** Required. There is no unlabelled variant, by design. */
  label: string;
  hint?: ReactNode;
  error?: string;
}

/** Label is always linked via htmlFor; hint and error via aria-describedby. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className = "", required, ...rest },
  ref,
) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
        {required ? (
          <>
            <span className="text-danger" aria-hidden="true">
              {" *"}
            </span>
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </label>
      <textarea
        ref={ref}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={[
          "min-h-[5rem] rounded-md bg-bg px-3 py-2 text-sm text-fg",
          "border placeholder:text-muted",
          error ? "border-danger" : "border-border-strong",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        ].join(" ")}
        {...rest}
      />
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted">
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
