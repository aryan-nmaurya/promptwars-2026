"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";

import { EvaluationReport } from "@/components/evaluation/EvaluationReport";
import { Button, Card, ErrorState, Input, Spinner, StatusRegion } from "@/components/ui";
import { api, toErrorMessage, type Evaluation } from "@/lib/api";
import { useCanEditProject } from "@/lib/auth";
import { projectEditHeaders, useProjectEditToken } from "@/lib/project-access";

/**
 * Reject obvious mistakes before spending a request. The API re-validates
 * with a much stricter parser; this only exists to answer instantly.
 */
function githubUrlError(value: string): string | null {
  try {
    const url = new URL(value);
    const parts = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
      return "Use a public https://github.com repository URL.";
    }
    if (parts.length !== 2) return "Use the repository URL, not a file or issue URL.";
    return null;
  } catch {
    return "Enter a complete GitHub repository URL.";
  }
}

export function RepositoryEvaluator({
  projectId,
  projectOwnerId,
  initialEvaluation,
}: {
  projectId: string;
  projectOwnerId?: string | null;
  initialEvaluation: Evaluation | null;
}) {
  const editToken = useProjectEditToken(projectId);
  const canEdit = useCanEditProject(projectId, projectOwnerId);
  const [repositoryUrl, setRepositoryUrl] = useState(initialEvaluation?.repository.url ?? "");
  const [evaluation, setEvaluation] = useState(initialEvaluation);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function evaluate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending || !canEdit) return;

    const normalized = repositoryUrl.trim();
    const validationError = githubUrlError(normalized);
    setFieldError(validationError);
    if (validationError !== null) return;

    setPending(true);
    setError(null);
    try {
      const result = await api.post<Evaluation>(
        `/projects/${projectId}/evaluate`,
        { github_url: normalized },
        { headers: projectEditHeaders(editToken), timeoutMs: 58_000 },
      );
      setEvaluation(result);
    } catch (cause: unknown) {
      setError(toErrorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card
      title="Project health"
      as="h2"
      description="Compare the project you planned with evidence in one public GitHub repository."
      className="border-amber-dim"
    >
      {!canEdit ? (
        evaluation === null ? (
          <div className="rounded-md border border-dashed border-control-border p-5 text-center">
            <p className="text-sm font-medium text-ink">No repository evaluation yet</p>
            <p className="mt-1 text-xs text-ink-muted">
              This shared view is read-only. The owner can connect a repository from their
              original device.
            </p>
          </div>
        ) : null
      ) : (

        <form ref={formRef} onSubmit={evaluate} aria-busy={pending} className="mb-6 flex flex-col gap-3">
          <Input
            label="Public GitHub repository"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="https://github.com/owner/repository"
            value={repositoryUrl}
            onChange={(event) => {
              setRepositoryUrl(event.target.value);
              if (fieldError !== null) setFieldError(null);
            }}
            error={fieldError ?? undefined}
            hint="Static inspection only: ProjectPilot never runs or installs repository code."
            disabled={pending}
            required
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={pending} loadingLabel="Evaluating repository">
              {pending
                ? "Evaluating…"
                : evaluation === null
                  ? "Evaluate repository"
                  : "Evaluate latest commit"}
            </Button>
            {!pending ? (
              <span className="text-xs text-ink-muted">Public repositories only</span>
            ) : null}
          </div>
          <StatusRegion className="min-h-[1.25rem]">
            {pending ? (
              <span className="flex items-center gap-2 text-xs text-ink-muted">
                <Spinner size="sm" label="Analyzing repository" />
                Reading a bounded set of files and matching evidence to your plan. This can take
                up to a minute.
              </span>
            ) : null}
          </StatusRegion>
        </form>
      )}

      {error ? (
        <div className="mb-5">
          <ErrorState
            title="Could not evaluate this repository"
            message={error}
            onRetry={
              !canEdit
                ? undefined
                : () => {
                    setError(null);
                    formRef.current?.requestSubmit();
                  }
            }

          />
        </div>
      ) : null}

      {evaluation ? <EvaluationReport evaluation={evaluation} /> : null}
    </Card>
  );
}
