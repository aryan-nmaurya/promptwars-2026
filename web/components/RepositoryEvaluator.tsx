"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";

import { Button, Card, ErrorState, Input, Spinner, StatusRegion } from "@/components/ui";
import {
  api,
  toErrorMessage,
  type Evaluation,
  type EvaluationScores,
  type EvaluationStatus,
} from "@/lib/api";
import { projectEditHeaders, useProjectEditToken } from "@/lib/project-access";

const SCORE_LABELS: ReadonlyArray<{ key: keyof EvaluationScores; label: string }> = [
  { key: "feature_completion", label: "Features" },
  { key: "architecture", label: "Architecture" },
  { key: "code_quality", label: "Code quality" },
  { key: "testing", label: "Testing" },
  { key: "documentation", label: "Docs" },
  { key: "security", label: "Security" },
];

const STATUS: Record<
  EvaluationStatus,
  { label: string; symbol: string; className: string }
> = {
  implemented: {
    label: "Implemented",
    symbol: "✓",
    className: "border-amber-dim bg-amber/10 text-amber",
  },
  partial: {
    label: "Partial",
    symbol: "◐",
    className: "border-control-border bg-surface-2 text-ink",
  },
  not_found: {
    label: "Not found",
    symbol: "×",
    className: "border-danger bg-danger/10 text-danger",
  },
  insufficient_evidence: {
    label: "Insufficient evidence",
    symbol: "?",
    className: "border-surface-border bg-surface-2 text-ink-muted",
  },
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function confidencePercent(value: number): number {
  return clampScore(value <= 1 ? value * 100 : value);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

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

function ScoreSummary({ evaluation }: { evaluation: Evaluation }) {
  const score = clampScore(evaluation.overall_score);
  const commitUrl = `${evaluation.repository.url.replace(/\/$/, "")}/tree/${encodeURIComponent(
    evaluation.repository.commit_sha,
  )}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 rounded-card border border-amber-dim bg-amber/10 p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:p-5">
        <div
          role="meter"
          aria-label="Overall project health"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
          className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border-4 border-amber bg-bg"
        >
          <span className="font-display text-3xl font-bold tabular-nums text-ink">{score}</span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            of 100
          </span>
        </div>
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold text-ink">Project health</p>
          <p className="mt-1 break-words text-sm text-ink-muted">
            Static review of{" "}
            <a
              href={evaluation.repository.url}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-ink underline decoration-amber underline-offset-4"
            >
              {evaluation.repository.full_name}
            </a>
          </p>
          <p className="mt-2 font-mono text-[11px] text-ink-muted">
            Commit{" "}
            <a
              href={commitUrl}
              target="_blank"
              rel="noreferrer"
              className="text-amber underline underline-offset-2"
            >
              {evaluation.repository.commit_sha.slice(0, 7)}
            </a>{" "}
            · {evaluation.coverage.files_analyzed} files analyzed
          </p>
        </div>
      </div>

      <section aria-labelledby="score-breakdown">
        <h3 id="score-breakdown" className="text-sm font-semibold text-ink">
          Score breakdown
        </h3>
        {evaluation.unassessed_categories.length > 0 ? (
          <p className="mt-1 text-xs text-ink-muted">
            The overall score is weighted across the assessed categories only.
          </p>
        ) : null}
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SCORE_LABELS.map(({ key, label }) => {
            const raw = evaluation.scores[key];
            // A category with no supporting evidence is reported as null, not
            // zero. Showing "0/100" would read as a failing grade for something
            // that was never measured, so it says so instead and draws no bar.
            if (raw === null || raw === undefined) {
              return (
                <div
                  key={key}
                  className="rounded-md border border-dashed border-control-border bg-bg p-3"
                >
                  <dt className="text-xs text-ink-muted">{label}</dt>
                  <dd className="mt-1 text-sm font-medium text-ink-muted">Not assessed</dd>
                  <p className="mt-1 text-xs text-ink-muted">No evidence in the analyzed files</p>
                </div>
              );
            }
            const value = clampScore(raw);
            return (
              <div key={key} className="rounded-md border border-surface-border bg-bg p-3">
                <dt className="text-xs text-ink-muted">{label}</dt>
                <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-ink">
                  {value}
                  <span className="text-xs font-normal text-ink-muted">/100</span>
                </dd>
                <div
                  role="meter"
                  aria-label={`${label} ${value} out of 100`}
                  aria-valuenow={value}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2"
                >
                  <div className="h-full rounded-full bg-amber" style={{ width: `${value}%` }} />
                </div>
              </div>
            );
          })}
        </dl>
      </section>

      <section aria-labelledby="planned-built">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="planned-built" className="text-sm font-semibold text-ink">
            Planned vs built
          </h3>
          <p className="text-xs text-ink-muted">
            Claims are tied to analyzed repository evidence.
          </p>
        </div>
        {evaluation.planned_vs_built.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-control-border p-4 text-sm text-ink-muted">
            No planned features were available to compare.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {evaluation.planned_vs_built.map((item, index) => {
              const status = STATUS[item.status];
              return (
                <li key={`${item.planned_item}-${index}`} className="rounded-md border border-surface-border bg-bg p-3 sm:p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 text-sm font-medium text-ink">
                      {item.planned_item}
                    </p>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${status.className}`}
                    >
                      <span aria-hidden="true">{status.symbol}</span>
                      {status.label}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-ink-muted">
                    {confidencePercent(item.confidence)}% confidence
                  </p>
                  {item.gap ? <p className="mt-2 text-xs text-ink-muted">Gap: {item.gap}</p> : null}
                  {item.evidence.length > 0 ? (
                    <details className="mt-3 rounded border border-surface-border bg-surface p-2.5">
                      <summary className="cursor-pointer text-xs font-medium text-ink">
                        {item.evidence.length} evidence {item.evidence.length === 1 ? "file" : "files"}
                      </summary>
                      <ul className="mt-2 flex flex-col gap-2">
                        {item.evidence.map((evidence) => (
                          <li key={`${evidence.path}-${evidence.reason}`} className="text-xs">
                            <code className="break-all font-mono text-amber">{evidence.path}</code>
                            <p className="mt-0.5 text-ink-muted">{evidence.reason}</p>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {evaluation.top_fixes.length > 0 ? (
        <section aria-labelledby="top-fixes">
          <h3 id="top-fixes" className="text-sm font-semibold text-ink">
            Fix these next
          </h3>
          <ol className="mt-3 grid gap-2 sm:grid-cols-3">
            {evaluation.top_fixes.map((fix, index) => (
              <li key={`${fix.title}-${index}`} className="rounded-md border border-control-border bg-surface-2 p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-amber">
                  Priority {index + 1}
                </p>
                <h4 className="mt-1 text-sm font-semibold text-ink">{fix.title}</h4>
                <p className="mt-1 text-xs text-ink-muted">{fix.why}</p>
                <p className="mt-2 text-xs text-ink">
                  <span className="font-semibold">How:</span> {fix.how}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <details className="rounded-md border border-surface-border bg-bg p-3">
        <summary className="cursor-pointer text-xs font-medium text-ink">
          Analysis coverage and limitations
        </summary>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-ink-muted">Tree</dt>
            <dd className="mt-0.5 text-ink">
              {evaluation.coverage.tree_complete ? "Complete" : "Truncated"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Considered</dt>
            <dd className="mt-0.5 text-ink">{evaluation.coverage.files_considered} files</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Analyzed</dt>
            <dd className="mt-0.5 text-ink">{evaluation.coverage.files_analyzed} files</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Evidence size</dt>
            <dd className="mt-0.5 text-ink">{formatBytes(evaluation.coverage.bytes_analyzed)}</dd>
          </div>
        </dl>
        {evaluation.limitations.length > 0 ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-ink-muted">
            {evaluation.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        ) : null}
      </details>
    </div>
  );
}

export function RepositoryEvaluator({
  projectId,
  initialEvaluation,
}: {
  projectId: string;
  initialEvaluation: Evaluation | null;
}) {
  const editToken = useProjectEditToken(projectId);
  const [repositoryUrl, setRepositoryUrl] = useState(
    initialEvaluation?.repository.url ?? "",
  );
  const [evaluation, setEvaluation] = useState(initialEvaluation);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function evaluate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending || editToken === null) return;

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
        {
          headers: projectEditHeaders(editToken),
          timeoutMs: 58_000,
        },
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
      {editToken === null ? (
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
        <form
          ref={formRef}
          onSubmit={evaluate}
          aria-busy={pending}
          className="mb-6 flex flex-col gap-3"
        >
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
            hint="Static inspection only: IdeaForge never runs or installs repository code."
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
                Reading a bounded set of files and matching evidence to your plan. This can
                take up to a minute.
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
            onRetry={editToken === null ? undefined : () => {
              setError(null);
              formRef.current?.requestSubmit();
            }}
          />
        </div>
      ) : null}

      {evaluation ? <ScoreSummary evaluation={evaluation} /> : null}
    </Card>
  );
}
