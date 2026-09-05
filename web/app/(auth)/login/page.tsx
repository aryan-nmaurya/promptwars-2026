"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

import {
  CredentialFields,
  validateCredentials,
  type CredentialErrors,
} from "@/components/auth/CredentialFields";
import { Button, StatusRegion } from "@/components/ui";
import { toErrorMessage } from "@/lib/api";
import { signIn } from "@/lib/auth";
import { useRecentProjects } from "@/lib/project-access";

export default function LoginPage() {
  const router = useRouter();
  const recentProjects = useRecentProjects();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<CredentialErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function validate(): boolean {
    const found = validateCredentials(email, password, { requireStrongPassword: false });
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!validate()) return;

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
    } catch (cause: unknown) {
      setServerError(toErrorMessage(cause));
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
        <CredentialFields
          mode="sign-in"
          email={email}
          password={password}
          errors={errors}
          disabled={pending}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onBlurValidate={validate}
        />

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
