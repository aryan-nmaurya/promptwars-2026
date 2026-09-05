"use client";

import { useEffect, useState } from "react";

function format(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/**
 * Time since the project was created. Rendered client-side only: the server
 * and browser clocks differ, so rendering it during SSR guarantees a hydration
 * mismatch. Starts as null and fills in on mount.
 */
export function ElapsedCounter({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState<number | null>(null);

  useEffect(() => {
    const started = new Date(since).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [since]);

  if (elapsed === null) return null;

  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-40 hidden sm:block">
      <p className="rounded-full border border-surface-border bg-surface/90 px-3 py-1.5 font-mono text-[11px] text-ink-muted backdrop-blur">
        <span className="text-amber">{format(elapsed)}</span> since you started building
      </p>
    </div>
  );
}
