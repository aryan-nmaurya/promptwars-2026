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
import { signUp, useAdoptableProjects } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const adoptableProjects = useAdoptableProjects();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<CredentialErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function validate(): boolean {
    const found = validateCredentials(email, password, { requireStrongPassword: true });
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!validate()) return;

    setPending(true);
    setServerError(null);
    try {
      await signUp(email, password, adoptableProjects);
      router.push("/onboarding");
    } catch (cause: unknown) {
      setServerError(toErrorMessage(cause));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
          Create an account
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Turn your interests into a scoped capstone project with a phased build plan.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <CredentialFields
          mode="sign-up"
          email={email}
          password={password}
          errors={errors}
          disabled={pending}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onBlurValidate={validate}
        />

        {adoptableProjects.length > 0 ? (
          <div className="rounded-md border border-amber/30 bg-amber/10 p-3 text-xs text-ink">
            <span className="font-semibold text-amber">◆ Linking existing project:</span> Your
            local project on this device will automatically be connected to your new account.
          </div>
        ) : null}

        <Button
          type="submit"
          size="lg"
          loading={pending}
          loadingLabel="Creating account"
          className="mt-2 w-full"
        >
          Create account
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
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-amber underline-offset-4 hover:underline focus-visible:outline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
