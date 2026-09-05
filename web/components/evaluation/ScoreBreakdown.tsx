import type { EvaluationScores } from "@/lib/api";

const SCORE_LABELS: ReadonlyArray<{ key: keyof EvaluationScores; label: string }> = [
  { key: "feature_completion", label: "Features" },
  { key: "architecture", label: "Architecture" },
  { key: "code_quality", label: "Code quality" },
  { key: "testing", label: "Testing" },
  { key: "documentation", label: "Docs" },
  { key: "security", label: "Security" },
];

export function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function NotAssessed({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-control-border bg-bg p-3">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink-muted">Not assessed</dd>
      <p className="mt-1 text-xs text-ink-muted">No evidence in the analyzed files</p>
    </div>
  );
}

function Scored({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-surface-border bg-bg p-3">
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
}

/**
 * A category with no supporting evidence is reported as `null`, not zero.
 * Showing "0/100" would read as a failing grade for something that was never
 * measured, so it says so instead and draws no bar.
 */
export function ScoreBreakdown({
  scores,
  unassessedCount,
}: {
  scores: EvaluationScores;
  unassessedCount: number;
}) {
  return (
    <section aria-labelledby="score-breakdown">
      <h3 id="score-breakdown" className="text-sm font-semibold text-ink">
        Score breakdown
      </h3>
      {unassessedCount > 0 ? (
        <p className="mt-1 text-xs text-ink-muted">
          The overall score is weighted across the assessed categories only.
        </p>
      ) : null}
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SCORE_LABELS.map(({ key, label }) => {
          const raw = scores[key];
          return raw === null || raw === undefined ? (
            <NotAssessed key={key} label={label} />
          ) : (
            <Scored key={key} label={label} value={clampScore(raw)} />
          );
        })}
      </dl>
    </section>
  );
}
