"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Spinner, StatusRegion } from "@/components/ui";
import {
  api,
  toErrorMessage,
  type Idea,
  type IdeaSet,
  type ProjectCreateResponse,
} from "@/lib/api";
import { rememberOwnedProject } from "@/lib/project-access";

/** Feasibility shown as a number and a word, never colour alone. */
function feasibilityLabel(score: number): string {
  if (score >= 8) return "Very achievable";
  if (score >= 6) return "Achievable";
  return "Ambitious";
}

export function IdeaPicker({
  ideas,
  interests,
  skills,
}: {
  ideas: Idea[];
  interests: string;
  skills: string;
}) {
  const router = useRouter();
  const [choosing, setChoosing] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = choosing !== null || regenerating;

  async function regenerate(): Promise<void> {
    setRegenerating(true);
    setError(null);
    try {
      const set = await api.post<IdeaSet>(
        "/ideas",
        { interests, skills },
        { query: { refresh: true } },
      );
      router.push(`/ideas/${set.id}`);
    } catch (cause: unknown) {
      setError(toErrorMessage(cause));
      setRegenerating(false);
    }
  }

  async function choose(ideaId: string): Promise<void> {
    setChoosing(ideaId);
    setError(null);
    try {
      const created = await api.post<ProjectCreateResponse>(
        "/projects",
        { idea_id: ideaId },
        { timeoutMs: 55_000 },
      );
      rememberOwnedProject(created.project, created.edit_token);
      router.push(`/projects/${created.project.id}`);
    } catch (cause: unknown) {
      setError(toErrorMessage(cause));
      setChoosing(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ul className="grid gap-4">
        {ideas.map((idea) => (
          <li
            key={idea.id}
            className="flex flex-col gap-3 rounded-card border border-surface-border bg-surface p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="font-display text-lg font-bold tracking-tight text-ink">
                {idea.title}
              </h2>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-mono text-xs text-ink-muted">
                  Feasibility{" "}
                  <span className="text-ink">{idea.feasibility}/10</span> ·{" "}
                  {feasibilityLabel(idea.feasibility)}
                </span>
                <span
                  role="meter"
                  aria-valuenow={idea.feasibility}
                  aria-valuemin={0}
                  aria-valuemax={10}
                  aria-label={`Feasibility ${idea.feasibility} out of 10`}
                  className="flex h-1.5 w-28 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-surface-border"
                >
                  <span
                    aria-hidden="true"
                    className="h-full rounded-full bg-amber"
                    style={{ width: `${idea.feasibility * 10}%` }}
                  />
                </span>
              </div>
            </div>

            <p className="text-sm text-ink">{idea.summary}</p>

            <div>
              <h3 className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">
                Problem it solves
              </h3>
              <p className="mt-1 text-sm text-ink-muted">{idea.problem_solved}</p>
            </div>

            {idea.core_features.length > 0 ? (
              <div>
                <h3 className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">
                  Core deliverables
                </h3>
                <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
                  {idea.core_features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-xs text-ink">
                      <span aria-hidden="true" className="text-amber">
                        ✓
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div>
              <h3 className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">
                Suggested stack
              </h3>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {idea.tech_stack.map((tech) => (
                  <li
                    key={tech}
                    className="rounded border border-surface-border bg-bg px-2 py-0.5 text-xs text-ink"
                  >
                    {tech}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <Button
                onClick={() => void choose(idea.id)}
                loading={choosing === idea.id}
                loadingLabel="Building your roadmap"
                disabled={busy}
              >
                {choosing === idea.id ? "Building roadmap…" : "Choose this idea"}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void regenerate()}
          loading={regenerating}
          loadingLabel="Regenerating ideas"
          disabled={busy}
        >
          {regenerating ? "Regenerating…" : "Regenerate ideas"}
        </Button>
        <span className="font-mono text-[11px] text-ink-muted">
          Same interests and skills, a fresh set.
        </span>
      </div>

      <StatusRegion className="min-h-[1.5rem]">
        {regenerating ? (
          <span className="flex items-center gap-2 text-sm text-ink-muted">
            <Spinner size="sm" label="Regenerating ideas" />
            Asking Gemini for a different three.
          </span>
        ) : null}
        {choosing ? (
          <span className="flex items-center gap-2 text-sm text-ink-muted">
            <Spinner size="sm" label="Building your roadmap" />
            Asking Gemini to break this into a phased build plan.
          </span>
        ) : null}
        {error ? (
          <span className="text-sm font-medium text-danger">
            <span aria-hidden="true">✕ </span>
            {error}
          </span>
        ) : null}
      </StatusRegion>
    </div>
  );
}
