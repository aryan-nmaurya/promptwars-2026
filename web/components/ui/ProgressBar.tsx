export interface ProgressBarProps {
  done: number;
  total: number;
  label: string;
}

/**
 * Roadmap progress. The percentage is announced through `role="progressbar"`
 * and also written out as text, so the filled bar is never the only signal.
 */
export function ProgressBar({ done, total, label }: ProgressBarProps) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-xs uppercase tracking-widest text-ink-muted">{label}</span>
        <span className="font-mono text-xs tabular-nums text-ink">
          {done} of {total} complete ({percent}%)
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-surface-border"
      >
        <div
          className="h-full rounded-full bg-amber transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
