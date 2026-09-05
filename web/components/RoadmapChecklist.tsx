"use client";

import { useState } from "react";

import { ProgressBar, StatusRegion } from "@/components/ui";
import { api, groupByPhase, toErrorMessage, type RoadmapStep } from "@/lib/api";

/**
 * Optimistic checklist: the box flips immediately and rolls back if the
 * request fails, so ticking never feels laggy on a slow connection.
 */
export function RoadmapChecklist({
  projectId,
  initialSteps,
}: {
  projectId: string;
  initialSteps: RoadmapStep[];
}) {
  const [steps, setSteps] = useState(initialSteps);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const done = steps.filter((s) => s.is_done).length;

  async function toggle(step: RoadmapStep, next: boolean): Promise<void> {
    setSteps((current) =>
      current.map((s) => (s.id === step.id ? { ...s, is_done: next } : s)),
    );
    setError(null);
    setAnnouncement(`${step.title} marked ${next ? "done" : "not done"}.`);
    try {
      await api.patch<RoadmapStep>(`/projects/${projectId}/steps/${step.id}`, {
        is_done: next,
      });
    } catch (cause: unknown) {
      setSteps((current) =>
        current.map((s) => (s.id === step.id ? { ...s, is_done: !next } : s)),
      );
      setError(toErrorMessage(cause));
      setAnnouncement("");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <ProgressBar done={done} total={steps.length} label="Roadmap progress" />

      {groupByPhase(steps).map((group) => (
        <section key={group.phase} aria-label={group.phase} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">
            {group.phase}
          </h3>
          <ul className="flex flex-col gap-1">
            {group.steps.map((step) => (
              <li key={step.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-bg p-3 hover:border-border-strong">
                  <input
                    type="checkbox"
                    checked={step.is_done}
                    onChange={(e) => void toggle(step, e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span
                      className={
                        step.is_done ? "text-sm font-medium text-muted line-through" : "text-sm font-medium text-fg"
                      }
                    >
                      {step.title}
                    </span>
                    {step.detail ? (
                      <span className="text-xs text-muted">{step.detail}</span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <StatusRegion className="min-h-[1.25rem]">
        {error ? (
          <span className="text-sm font-medium text-danger">
            <span aria-hidden="true">✕ </span>
            {error}
          </span>
        ) : (
          <span className="sr-only">{announcement}</span>
        )}
      </StatusRegion>
    </div>
  );
}
