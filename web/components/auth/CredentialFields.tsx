"use client";

import { useState } from "react";

import { Input } from "@/components/ui";

/** The API enforces this too; the client copy exists to fail fast, not instead. */
export const MIN_PASSWORD_LENGTH = 10;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CredentialErrors {
  email?: string;
  password?: string;
}

/**
 * Validate both fields and return every problem at once.
 *
 * Returning the whole set rather than short-circuiting matters: a form that
 * reveals its second error only after you fix the first one makes a
 * screen-reader user walk the form twice.
 */
export function validateCredentials(
  email: string,
  password: string,
  { requireStrongPassword }: { requireStrongPassword: boolean },
): CredentialErrors {
  const errors: CredentialErrors = {};
  const trimmed = email.trim();

  if (!trimmed) errors.email = "Email is required";
  else if (!EMAIL_SHAPE.test(trimmed)) errors.email = "Please enter a valid email address";

  if (!password) errors.password = "Password is required";
  else if (requireStrongPassword && password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }

  return errors;
}

export interface CredentialFieldsProps {
  email: string;
  password: string;
  errors: CredentialErrors;
  disabled: boolean;
  /** Sign-up asks for a new password and states the length rule up front. */
  mode: "sign-in" | "sign-up";
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onBlurValidate: () => void;
}

/**
 * The email + password pair shared by sign-in and sign-up, including the
 * show/hide control. Both pages had their own copy of all of it, so a fix to
 * one silently left the other behind.
 */
export function CredentialFields({
  email,
  password,
  errors,
  disabled,
  mode,
  onEmailChange,
  onPasswordChange,
  onBlurValidate,
}: CredentialFieldsProps) {
  const [visible, setVisible] = useState(false);
  const signingUp = mode === "sign-up";

  return (
    <>
      <Input
        label="University email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => onEmailChange(event.target.value)}
        onBlur={onBlurValidate}
        error={errors.email}
        disabled={disabled}
        placeholder="student@university.edu"
      />

      <div className="relative">
        <Input
          label="Password"
          type={visible ? "text" : "password"}
          autoComplete={signingUp ? "new-password" : "current-password"}
          required
          minLength={signingUp ? MIN_PASSWORD_LENGTH : undefined}
          hint={signingUp ? `Must be at least ${MIN_PASSWORD_LENGTH} characters long.` : undefined}
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          onBlur={onBlurValidate}
          error={errors.password}
          disabled={disabled}
          placeholder={signingUp ? "••••••••••••" : "••••••••••"}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          disabled={disabled}
          className="absolute right-3 top-[34px] rounded px-1.5 py-0.5 font-mono text-xs text-ink-muted hover:text-ink focus-visible:outline"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </>
  );
}
