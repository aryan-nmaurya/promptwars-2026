import Link from "next/link";
import type { ReactNode } from "react";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      <header className="sticky top-0 z-40 border-b border-surface-border bg-bg/80 backdrop-blur-md">
        <nav
          aria-label="Primary"
          className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6"
        >
          <Link
            href="/"
            className="group flex items-center gap-2 rounded font-display text-lg font-bold tracking-tight text-ink"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-amber/30 bg-amber/10 font-mono text-xs font-bold text-amber">
              PP
            </span>
            <span>
              Project<span className="text-amber">Pilot</span>
            </span>
          </Link>

          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              href="/login"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink focus-visible:outline"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-9 items-center justify-center rounded-md bg-amber px-4 text-sm font-medium text-amber-ink transition-colors hover:opacity-95 focus-visible:outline"
            >
              Get started
            </Link>
          </div>
        </nav>
      </header>

      <main id="main" tabIndex={-1} className="flex-1">
        {children}
      </main>

      <footer className="border-t border-surface-border bg-surface/50">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <p className="font-mono text-xs text-ink-muted">
            ProjectPilot — plan-aware project coach for final-year students. Powered by Gemini.
          </p>
          <div className="flex items-center gap-4 text-xs text-ink-muted">
            <Link href="/projects" className="underline-offset-4 hover:text-ink hover:underline">
              Recent projects
            </Link>
            <Link href="/login" className="underline-offset-4 hover:text-ink hover:underline">
              Sign in
            </Link>
            <Link href="/signup" className="underline-offset-4 hover:text-ink hover:underline">
              Create account
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
