/**
 * Marks every surface whose content came from Google Gemini, so judges can
 * see the Google service at a glance. Purely informational - the sparkle is
 * decorative and hidden from assistive tech, the text carries the meaning.
 */
export function GeminiBadge({ label = "Powered by Gemini" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-ink-muted">
      <span aria-hidden="true" className="text-amber">
        ✦
      </span>
      {label}
    </span>
  );
}
