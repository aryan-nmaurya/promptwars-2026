/**
 * Shown when Gemini was unreachable and seeded content was served instead.
 * Being explicit is the point: a demo that quietly passes off canned content
 * as live generation is worse than one that admits the provider is down.
 */
export function FallbackBanner({ what }: { what: string }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-card border border-amber-dim bg-amber/10 px-4 py-3"
    >
      <span aria-hidden="true" className="mt-0.5 font-mono text-sm text-amber">
        ▲
      </span>
      <p className="text-sm text-ink">
        <span className="font-mono text-xs uppercase tracking-widest text-amber">
          Fallback mode
        </span>
        <br />
        Gemini was unreachable, so {what} came from ProjectPilot&rsquo;s seeded example rather
        than a live generation.
      </p>
    </div>
  );
}
