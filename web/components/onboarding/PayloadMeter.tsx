"use client";

import { StatusRegion } from "@/components/ui";

/** The API caps interests and skills at 500 characters each. */
export const MAX_PAYLOAD_LENGTH = 500;

const WARN_AT = 450;

/**
 * How much of the generator's input budget is spent, plus any limit warning.
 * The count is always visible rather than only appearing once it is too late,
 * and the warning goes through a live region so it is announced when it fires.
 */
export function PayloadMeter({ value, warning }: { value: string; warning: string | null }) {
  const nearLimit = value.length > WARN_AT;

  return (
    <div className="flex items-center justify-between border-t border-surface-border pt-4 font-mono text-xs">
      <span className={nearLimit ? "font-semibold text-amber" : "text-ink-muted"}>
        {value.length} / {MAX_PAYLOAD_LENGTH} chars
      </span>
      <StatusRegion>
        {warning ? (
          <span className="font-sans text-danger">
            <span aria-hidden="true">▲ </span>
            {warning}
          </span>
        ) : null}
      </StatusRegion>
    </div>
  );
}
