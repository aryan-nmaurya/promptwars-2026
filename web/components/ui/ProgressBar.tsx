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
        <span className="text-sm font-medium text-fg">{label}</span>
        <span className="text-sm tabular-nums text-muted">
          {done} of {total} done ({percent}%)
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-border"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
