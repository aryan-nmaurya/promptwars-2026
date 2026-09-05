import type { Idea } from "@/lib/api";

const GENERIC = [
  "Build a web app with a login page",
  "Use whatever framework is popular",
  "Figure out the steps as you go",
] as const;

/**
 * Contrasts the advice a student normally gets with what IdeaForge produced.
 *
 * The right column pulls real values from the generated idea — its actual
 * stack, feasibility and roadmap length — so the claim is evidenced by this
 * student's own output rather than by marketing copy.
 */
export function ComparisonBlock({ idea, stepCount }: { idea: Idea; stepCount: number }) {
  const specifics = [
    `Build "${idea.title}"`,
    `Use ${idea.tech_stack.slice(0, 3).join(", ") || "a stack matched to your skills"}`,
    `Follow ${stepCount} concrete steps across 4 phases`,
  ];

  return (
    <section aria-labelledby="compare" className="flex flex-col gap-4">
      <h2 id="compare" className="font-display text-lg font-bold tracking-tight text-ink">
        Why this beats the advice you usually get
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-card border border-surface-border bg-surface p-4">
          <h3 className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">
            Generic advice
          </h3>
          <ul className="mt-3 flex flex-col gap-2">
            {GENERIC.map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-sm">
                <span aria-hidden="true" className="mt-0.5 font-mono text-ink-muted">
                  ✕
                </span>
                <span className="text-ink-muted line-through">{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-card border border-amber-dim bg-amber/10 p-4">
          <h3 className="font-mono text-[11px] uppercase tracking-widest text-amber">
            Your IdeaForge roadmap
          </h3>
          <ul className="mt-3 flex flex-col gap-2">
            {specifics.map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-sm">
                <span aria-hidden="true" className="mt-0.5 font-mono font-bold text-amber">
                  ✓
                </span>
                <span className="text-ink">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
