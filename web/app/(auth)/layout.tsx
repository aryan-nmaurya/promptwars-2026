import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      <header className="border-b border-surface-border px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded font-display text-lg font-bold tracking-tight text-ink"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-amber/30 bg-amber/10 font-mono text-xs font-bold text-amber">
            IF
          </span>
          <span>
            Idea<span className="text-amber">Forge</span>
          </span>
        </Link>
      </header>

      <main id="main" tabIndex={-1} className="flex flex-1 items-center justify-center p-4 sm:p-8">
        <div className="mx-auto flex w-full max-w-4xl overflow-hidden rounded-card border border-surface-border bg-surface shadow-2xl">
          {/* Left panel: Form (60% on desktop) */}
          <div className="w-full p-6 sm:p-10 md:w-[60%]">{children}</div>

          {/* Right panel: Static Reassurance & Dimmed Mock (40% on desktop, hidden on <md) */}
          <div className="hidden flex-col justify-between border-l border-surface-border bg-surface-2/40 p-8 md:flex md:w-[40%]">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-amber">
                Plan-Aware Engine
              </p>
              <h2 className="mt-2 font-display text-lg font-bold text-ink">
                Built to survive the viva.
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                IdeaForge records every promised feature from day one, giving you a defensible audit trail of your final-year project.
              </p>
            </div>

            {/* Dimmed static mock preview */}
            <div className="mt-8 rounded-md border border-surface-border bg-surface/70 p-4 opacity-75">
              <div className="flex items-center justify-between pb-2">
                <span className="font-mono text-[10px] uppercase text-ink-muted">Evidence Mock</span>
                <span className="rounded bg-amber/20 px-1.5 py-0.5 font-mono text-[9px] text-amber">
                  4 claims
                </span>
              </div>
              <div className="mt-2 flex flex-col gap-2 font-mono text-[11px]">
                <div className="flex items-center justify-between text-ink-muted">
                  <span className="truncate">jwt_handler.py</span>
                  <span className="text-amber">✓ done</span>
                </div>
                <div className="flex items-center justify-between text-ink-muted">
                  <span className="truncate">worker_loop.py</span>
                  <span className="text-amber">✓ done</span>
                </div>
                <div className="flex items-center justify-between text-ink-muted">
                  <span className="truncate">drift_check.py</span>
                  <span className="text-glow">◐ partial</span>
                </div>
                <div className="flex items-center justify-between text-ink-muted">
                  <span className="truncate">tests_suite.py</span>
                  <span className="text-danger">✕ missing</span>
                </div>
              </div>
            </div>

            <p className="mt-8 font-mono text-[10px] text-ink-muted">
              Evidence cited directly from your GitHub commit.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
