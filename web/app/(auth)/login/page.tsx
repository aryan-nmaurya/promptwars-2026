"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

import { Button, Input, StatusRegion } from "@/components/ui";
import { signIn } from "@/lib/auth";
import { useRecentProjects } from "@/lib/project-access";
import { toErrorMessage } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const recentProjects = useRecentProjects();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [passwordError, setPasswordError] = useState<string | undefined>(undefined);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function validateEmail(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) {
      setEmailError("Email is required");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError("Please enter a valid email address");
      return false;
    }
    setEmailError(undefined);
    return true;
  }

  function validatePassword(value: string): boolean {
    if (!value) {
      setPasswordError("Password is required");
      return false;
    }
    setPasswordError(undefined);
    return true;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);
    if (!isEmailValid || !isPasswordValid) return;

    setPending(true);
    setServerError(null);

    try {
      const user = await signIn(email, password);
      if (!user.onboarding_completed_at) {
        router.push("/onboarding");
      } else if (recentProjects.length > 0) {
        router.push(`/projects/${recentProjects[0]!.id}`);
      } else {
        router.push("/projects");
      }
    } catch (err) {
      setServerError(toErrorMessage(err));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Access your scoped projects, phased roadmaps, and AI mentor.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Input
          label="University email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={(e) => validateEmail(e.target.value)}
          error={emailError}
          disabled={pending}
          placeholder="student@university.edu"
        />

        <div className="flex flex-col gap-1.5">
          <div className="relative">
            <Input
              label="Password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={(e) => validatePassword(e.target.value)}
              error={passwordError}
              disabled={pending}
              placeholder="••••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              disabled={pending}
              className="absolute right-3 top-[34px] rounded px-1.5 py-0.5 font-mono text-xs text-ink-muted hover:text-ink focus-visible:outline"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          size="lg"
          loading={pending}
          loadingLabel="Signing in"
          className="mt-2 w-full"
        >
          Sign in
        </Button>

        <StatusRegion className="min-h-[1.5rem]">
          {serverError ? (
            <p className="text-sm font-medium text-danger">
              <span aria-hidden="true">✕ </span>
              {serverError}
            </p>
          ) : null}
        </StatusRegion>
      </form>

      <p className="text-center text-xs text-ink-muted">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-medium text-amber underline-offset-4 hover:underline focus-visible:outline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
