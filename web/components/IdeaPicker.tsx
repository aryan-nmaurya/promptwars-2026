"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Spinner, StatusRegion } from "@/components/ui";
import { api, toErrorMessage, type Idea, type Project } from "@/lib/api";

/** Feasibility shown as a number and a word, never colour alone. */
function feasibilityLabel(score: number): string {
  if (score >= 8) return "Very achievable";
  if (score >= 6) return "Achievable";
  return "Ambitious";
}

export function IdeaPicker({ ideas }: { ideas: Idea[] }) {
  const router = useRouter();
  const [choosing, setChoosing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(ideaId: string): Promise<void> {
    setChoosing(ideaId);
    setError(null);
    try {
      const project = await api.post<Project>("/projects", { idea_id: ideaId });
      router.push(`/projects/${project.id}`);
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
            className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-fg">{idea.title}</h3>
              <span className="shrink-0 rounded-full border border-border-strong px-2.5 py-1 text-xs font-medium text-muted">
                Feasibility {idea.feasibility}/10 · {feasibilityLabel(idea.feasibility)}
              </span>
            </div>

            <p className="text-sm text-fg">{idea.summary}</p>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Problem it solves
              </h4>
              <p className="mt-1 text-sm text-muted">{idea.problem_solved}</p>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Suggested stack
              </h4>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {idea.tech_stack.map((tech) => (
                  <li
                    key={tech}
                    className="rounded border border-border bg-bg px-2 py-0.5 text-xs text-fg"
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
                disabled={choosing !== null}
              >
                {choosing === idea.id ? "Building roadmap…" : "Choose this idea"}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <StatusRegion className="min-h-[1.5rem]">
        {choosing ? (
          <span className="flex items-center gap-2 text-sm text-muted">
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
