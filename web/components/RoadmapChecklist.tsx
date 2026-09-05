"use client";

import { useState } from "react";

import { PhaseReveal } from "@/components/PhaseReveal";
import { ProgressBar, StatusRegion } from "@/components/ui";
import { api, toErrorMessage, type RoadmapStep } from "@/lib/api";
import { useCanEditProject } from "@/lib/auth";
import { projectEditHeaders, useProjectEditToken } from "@/lib/project-access";

interface StepGroup {
  phase: string;
  steps: RoadmapStep[];
}

function groupByPhase(steps: RoadmapStep[]): StepGroup[] {
  const groups: StepGroup[] = [];
  for (const step of steps) {
    const last = groups[groups.length - 1];
    if (last && last.phase === step.phase) {
      last.steps.push(step);
    } else {
      groups.push({ phase: step.phase, steps: [step] });
    }
  }
  return groups;
}

/**
 * Optimistic checklist: the box flips immediately and rolls back if the
 * request fails, so ticking never feels laggy on a slow connection.
 */
export function RoadmapChecklist({
  projectId,
  projectOwnerId,
  initialSteps,
}: {
  projectId: string;
  projectOwnerId?: string | null;
  initialSteps: RoadmapStep[];
}) {
  const editToken = useProjectEditToken(projectId);
  const canEdit = useCanEditProject(projectId, projectOwnerId);
  const [steps, setSteps] = useState(initialSteps);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const done = steps.filter((s) => s.is_done).length;

  async function toggle(step: RoadmapStep, next: boolean): Promise<void> {
    if (!canEdit) return;
    setSteps((current) =>

      current.map((s) => (s.id === step.id ? { ...s, is_done: next } : s)),
    );
    setError(null);
    setAnnouncement(`${step.title} marked ${next ? "done" : "not done"}.`);
    try {
      await api.patch<RoadmapStep>(
        `/projects/${projectId}/steps/${step.id}`,
        { is_done: next },
        { headers: projectEditHeaders(editToken) },
      );
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

      {!canEdit ? (
        <p className="rounded-md border border-surface-border bg-surface-2 px-3 py-2 text-xs text-ink-muted">
          This is a read-only roadmap. Only its owner can update progress.
        </p>
      ) : null}

      {groupByPhase(steps).map((group, index) => (
        <PhaseReveal key={group.phase} index={index}>
          <section aria-label={group.phase} className="flex flex-col gap-2">
            <h3 className="flex items-baseline gap-2.5">
              <span
                aria-hidden="true"
                className="font-mono text-lg font-semibold leading-none text-amber"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="font-display text-sm font-bold uppercase tracking-wider text-ink">
                {group.phase}
              </span>
            </h3>
            <ul className="flex flex-col gap-1">
              {group.steps.map((step) => (
                <li key={step.id}>
                  <label
                    className={[
                      "flex items-start gap-3 rounded-md border border-surface-border bg-surface p-3 transition-colors",
                      !canEdit
                        ? "cursor-default"
                        : "cursor-pointer hover:border-control-border",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={step.is_done}
                      onChange={(e) => void toggle(step, e.target.checked)}
                      disabled={!canEdit}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-amber disabled:opacity-70"
                    />

                    <span className="flex flex-col gap-0.5">
                      <span
                        className={
                          step.is_done
                            ? "text-sm font-medium text-ink-muted line-through"
                            : "text-sm font-medium text-ink"
                        }
                      >
                        {step.title}
                      </span>
                      {step.detail ? (
                        <span className="text-xs text-ink-muted">{step.detail}</span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        </PhaseReveal>
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
