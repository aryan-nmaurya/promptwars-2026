import type { EvaluationStatus, PlannedVsBuiltItem } from "@/lib/api";

/** Symbol AND label, so status never depends on colour alone. */
const STATUS: Record<EvaluationStatus, { label: string; symbol: string; className: string }> = {
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

function confidencePercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value <= 1 ? value * 100 : value)));
}

function Row({ item }: { item: PlannedVsBuiltItem }) {
  const status = STATUS[item.status];

  return (
    <li className="rounded-md border border-surface-border bg-bg p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium text-ink">{item.planned_item}</p>
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
}

export function PlannedVsBuilt({ items }: { items: PlannedVsBuiltItem[] }) {
  return (
    <section aria-labelledby="planned-built">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="planned-built" className="text-sm font-semibold text-ink">
          Planned vs built
        </h3>
        <p className="text-xs text-ink-muted">Claims are tied to analyzed repository evidence.</p>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-control-border p-4 text-sm text-ink-muted">
          No planned features were available to compare.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((item, index) => (
            <Row key={`${item.planned_item}-${index}`} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
