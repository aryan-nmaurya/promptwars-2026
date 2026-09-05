import type { Evaluation } from "@/lib/api";

import { PlannedVsBuilt } from "./PlannedVsBuilt";
import { ScoreBreakdown, clampScore } from "./ScoreBreakdown";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function Headline({ evaluation }: { evaluation: Evaluation }) {
  const score = clampScore(evaluation.overall_score);
  const commitUrl = `${evaluation.repository.url.replace(/\/$/, "")}/tree/${encodeURIComponent(
    evaluation.repository.commit_sha,
  )}`;

  return (
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
  );
}

function TopFixes({ fixes }: { fixes: Evaluation["top_fixes"] }) {
  return (
    <section aria-labelledby="top-fixes">
      <h3 id="top-fixes" className="text-sm font-semibold text-ink">
        Fix these next
      </h3>
      <ol className="mt-3 grid gap-2 sm:grid-cols-3">
        {fixes.map((fix, index) => (
          <li
            key={`${fix.title}-${index}`}
            className="rounded-md border border-control-border bg-surface-2 p-3"
          >
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
  );
}

function Coverage({ evaluation }: { evaluation: Evaluation }) {
  const { coverage, limitations } = evaluation;
  const facts = [
    { term: "Tree", value: coverage.tree_complete ? "Complete" : "Truncated" },
    { term: "Considered", value: `${coverage.files_considered} files` },
    { term: "Analyzed", value: `${coverage.files_analyzed} files` },
    { term: "Evidence size", value: formatBytes(coverage.bytes_analyzed) },
  ];

  return (
    <details className="rounded-md border border-surface-border bg-bg p-3">
      <summary className="cursor-pointer text-xs font-medium text-ink">
        Analysis coverage and limitations
      </summary>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.term}>
            <dt className="text-ink-muted">{fact.term}</dt>
            <dd className="mt-0.5 text-ink">{fact.value}</dd>
          </div>
        ))}
      </dl>
      {limitations.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-ink-muted">
          {limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}

/** The finished Planned-vs-Built report for one commit. */
export function EvaluationReport({ evaluation }: { evaluation: Evaluation }) {
  return (
    <div className="flex flex-col gap-6">
      <Headline evaluation={evaluation} />
      <ScoreBreakdown
        scores={evaluation.scores}
        unassessedCount={evaluation.unassessed_categories.length}
      />
      <PlannedVsBuilt items={evaluation.planned_vs_built} />
      {evaluation.top_fixes.length > 0 ? <TopFixes fixes={evaluation.top_fixes} /> : null}
      <Coverage evaluation={evaluation} />
    </div>
  );
}
