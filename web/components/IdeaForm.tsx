"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

import { Button, GeminiBadge, Spinner, StatusRegion, Textarea } from "@/components/ui";
import { api, toErrorMessage, type IdeaSet } from "@/lib/api";

/**
 * The only interactive part of the landing page, so the rest stays a Server
 * Component. On success it navigates to the generated set's own URL, which
 * means a refresh re-reads the saved ideas instead of paying for Gemini again.
 */
export function IdeaForm() {
  const router = useRouter();
  const [interests, setInterests] = useState("");
  const [skills, setSkills] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const set = await api.post<IdeaSet>("/ideas", { interests, skills });
      router.push(`/ideas/${set.id}`);
    } catch (cause: unknown) {
      setError(toErrorMessage(cause));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" aria-busy={pending}>
      <Textarea
        label="What are you interested in?"
        name="interests"
        required
        minLength={2}
        maxLength={500}
        value={interests}
        onChange={(e) => setInterests(e.target.value)}
        placeholder="healthcare, accessibility, climate…"
        hint="Topics or problems you actually care about."
        disabled={pending}
      />
      <Textarea
        label="What can you already build with?"
        name="skills"
        required
        minLength={2}
        maxLength={500}
        value={skills}
        onChange={(e) => setSkills(e.target.value)}
        placeholder="python, react, sql…"
        hint="Languages, frameworks and tools you know today."
        disabled={pending}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" loading={pending} loadingLabel="Generating ideas">
          {pending ? "Generating…" : "Generate 3 project ideas"}
        </Button>
        <GeminiBadge />
      </div>

      <StatusRegion className="min-h-[1.5rem]">
        {pending ? (
          <span className="flex items-center gap-2 text-sm text-ink-muted">
            <Spinner size="sm" label="Generating ideas" />
            Asking Gemini for ideas tailored to you. This takes a few seconds.
          </span>
        ) : null}
        {error ? (
          <span className="text-sm font-medium text-danger">
            <span aria-hidden="true">✕ </span>
            {error}
          </span>
        ) : null}
      </StatusRegion>
    </form>
  );
}
