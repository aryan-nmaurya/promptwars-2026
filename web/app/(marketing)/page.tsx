import Link from "next/link";

export const metadata = {
  title: "ProjectPilot — Plan-Aware Project Coach for Final-Year Students",
  description:
    "ProjectPilot freezes what you promised to build, reads your repository, and shows exactly what's implemented, partial, and missing — citing the file that proves it.",
};

const MOCK_ROWS = [
  {
    planned: "JWT authentication with refresh rotation",
    status: "implemented",
    badge: "Implemented",
    file: "src/auth/jwt_handler.py",
    note: "Verified in token rotation handler",
  },
  {
    planned: "Background batch evaluation worker",
    status: "implemented",
    badge: "Implemented",
    file: "app/workers/evaluator.py",
    note: "Found Redis queue consumer & worker loop",
  },
  {
    planned: "Repository drift analysis pipeline",
    status: "partial",
    badge: "Partial",
    file: "app/services/drift.py",
    note: "AST parser present; comparison stage missing",
  },
  {
    planned: "Automated test suite with >80% coverage",
    status: "not_found",
    badge: "Not found",
    file: "tests/test_integration.py",
    note: "No matching integration suite detected",
  },
] as const;

export default function LandingPage() {
  return (
    <div className="flex flex-col gap-24 pb-20 pt-8 sm:gap-32 sm:pt-16">
      {/* Hero Section */}
      <section className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 text-center sm:px-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber/30 bg-surface px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-amber">
          <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden="true" />
          PLAN-AWARE PROJECT COACH
        </div>

        <h1 className="mt-6 max-w-4xl font-display text-4xl font-bold tracking-tight text-ink sm:text-6xl sm:leading-[1.1]">
          Most final-year projects don&apos;t fail.{" "}
          <span className="text-amber">They drift.</span>
        </h1>

        <p className="mt-6 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">
          You scope something ambitious in week one. By week ten the hard features are quietly
          gone, and nobody notices until the viva. ProjectPilot freezes what you promised to
          build, then reads your repository and shows exactly what&apos;s implemented, what&apos;s
          partial, and what&apos;s still missing.
        </p>

        {/* The primary CTA goes straight to the generator. Pointing it at
            /signup put an account between a visitor and the thing the product
            does, even though no flow requires one. */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/onboarding"
            className="inline-flex h-12 items-center justify-center rounded-md bg-amber px-6 text-base font-semibold text-amber-ink transition-transform duration-140 hover:opacity-95 active:scale-[0.98] focus-visible:outline"
          >
            Start with what you know →
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex h-12 items-center justify-center rounded-md border border-control-border bg-surface px-6 text-base font-medium text-ink transition-colors hover:border-amber-dim hover:bg-surface-2 focus-visible:outline"
          >
            See how it works
          </a>
        </div>

        <p className="mt-4 text-xs text-ink-muted">
          No account needed.{" "}
          <Link href="/signup" className="text-amber underline-offset-4 hover:underline">
            Create one
          </Link>{" "}
          only if you want your projects to follow you to another device.
        </p>

        {/* Visual Centrepiece: Static Planned-vs-Built Mock */}
        <div className="mt-14 w-full max-w-3xl text-left">
          <div className="rounded-card border border-surface-border bg-surface p-5 shadow-2xl sm:p-7">
            <div className="flex items-center justify-between border-b border-surface-border pb-4">
              <div className="flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-full bg-danger/80" />
                <span className="h-3 w-3 rounded-full bg-amber/80" />
                <span className="h-3 w-3 rounded-full bg-glow/80" />
                <span className="ml-2 font-mono text-xs text-ink-muted">
                  Planned vs. Built Evaluation
                </span>
              </div>
              <span className="rounded border border-control-border bg-surface-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber">
                Example
              </span>
            </div>

            <div className="mt-4 flex flex-col divide-y divide-surface-border font-sans">
              {MOCK_ROWS.map((row) => (
                <div
                  key={row.planned}
                  className="flex flex-col gap-2 py-3.5 first:pt-2 last:pb-1 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-ink">{row.planned}</span>
                    <span className="font-mono text-xs text-ink-muted">
                      {row.file} · <span className="opacity-80">{row.note}</span>
                    </span>
                  </div>
                  <div className="shrink-0">
                    {row.status === "implemented" && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/30 bg-amber/10 px-2.5 py-1 text-xs font-semibold text-amber">
                        <span aria-hidden="true">✓</span>
                        {row.badge}
                      </span>
                    )}
                    {row.status === "partial" && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-glow/30 bg-glow/10 px-2.5 py-1 text-xs font-semibold text-glow">
                        <span aria-hidden="true">◐</span>
                        {row.badge}
                      </span>
                    )}
                    {row.status === "not_found" && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger">
                        <span aria-hidden="true">✕</span>
                        {row.badge}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Proof Strip */}
      <section className="border-y border-surface-border bg-surface-2/40 py-6 text-center">
        <p className="mx-auto max-w-4xl px-4 font-mono text-sm font-medium uppercase tracking-wider text-ink sm:text-base">
          Every claim cites a file.{" "}
          <span className="text-amber">No file, no credit.</span>
        </p>
      </section>

      {/* Three-Panel Section: The gap nobody checks */}
      <section id="how-it-works" className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-amber">
            The project lifecycle
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink sm:text-4xl">
            The gap nobody checks
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-ink-muted sm:text-base">
            From the first week of brainstorming to the final presentation viva.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          <div className="flex flex-col rounded-card border border-surface-border bg-surface p-6 sm:p-7">
            <span className="font-mono text-xs uppercase tracking-widest text-amber">01</span>
            <h3 className="mt-2 font-display text-xl font-semibold text-ink">Scope it</h3>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              Three ideas matched to skills you actually have, each with explicit core features
              and a stated scope boundary — so &ldquo;done&rdquo; means something.
            </p>
          </div>

          <div className="flex flex-col rounded-card border border-surface-border bg-surface p-6 sm:p-7">
            <span className="font-mono text-xs uppercase tracking-widest text-amber">02</span>
            <h3 className="mt-2 font-display text-xl font-semibold text-ink">Build it</h3>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              A phased roadmap where every task traces to a promised feature, and a mentor
              that has read your project, not just your last message.
            </p>
          </div>

          <div className="flex flex-col rounded-card border border-surface-border bg-surface p-6 sm:p-7">
            <span className="font-mono text-xs uppercase tracking-widest text-amber">03</span>
            <h3 className="mt-2 font-display text-xl font-semibold text-ink">Prove it</h3>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              Point it at your GitHub repo. Get a Planned-vs-Built matrix with the file path
              behind every claim, and the three fixes worth doing next.
            </p>
          </div>
        </div>
      </section>

      {/* Closing Band */}
      <section className="mx-auto w-full max-w-4xl px-4 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-6 rounded-card border border-amber/30 bg-surface p-8 text-center sm:flex-row sm:p-10 sm:text-left">
          <div className="max-w-xl">
            <h2 className="font-display text-xl font-bold text-ink sm:text-2xl">
              Bring your repo the night before.
            </h2>
            <p className="mt-2 text-sm text-ink-muted sm:text-base">
              Find out what&apos;s missing while there&apos;s still time to fix it.
            </p>
          </div>
          <Link
            href="/onboarding"
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-md bg-amber px-5 text-sm font-semibold text-amber-ink transition-transform duration-140 hover:opacity-95 active:scale-[0.98] focus-visible:outline"
          >
            Start with what you know
          </Link>
        </div>
      </section>
    </div>
  );
}
