"use client";

import { useEffect, useState } from "react";

import { StatusRegion } from "@/components/ui";
import { api, type HealthResponse } from "@/lib/api";

type Reachability = "checking" | "live" | "degraded" | "unknown";

const PRESENTATION: Record<
  Reachability,
  { badge: string; symbol: string; className: string; detail: string }
> = {
  checking: {
    badge: "Checking",
    symbol: "…",
    className: "border-control-border bg-surface-2 text-ink-muted",
    detail: "Asking the API whether Gemini is reachable.",
  },
  live: {
    badge: "Live",
    symbol: "●",
    className: "border-amber/30 bg-amber/10 text-amber",
    detail: "Model-backed scoping, roadmaps & repository evaluation",
  },
  degraded: {
    badge: "Degraded",
    symbol: "▲",
    className: "border-danger bg-danger/10 text-danger",
    detail: "Gemini is unreachable, so new work falls back to seeded content.",
  },
  unknown: {
    badge: "Unknown",
    symbol: "?",
    className: "border-control-border bg-surface-2 text-ink-muted",
    detail: "The API could not be reached, so Gemini's status is unknown.",
  },
};

/**
 * Reports Gemini's real reachability rather than asserting it.
 *
 * This badge previously read "LIVE" as a hardcoded string, which meant it
 * claimed the Google dependency was healthy at exactly the moments it was not.
 * `/health` already probes Gemini separately from the database, so the honest
 * answer was one fetch away. The word carries the meaning; the colour and the
 * glyph only reinforce it.
 */
export function GeminiStatusCard() {
  const [state, setState] = useState<Reachability>("checking");

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    void api
      .get<HealthResponse>("/health", { signal: controller.signal, timeoutMs: 6000 })
      .then((health) => {
        if (!cancelled) setState(health.gemini ? "live" : "degraded");
      })
      .catch(() => {
        if (!cancelled) setState("unknown");
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const { badge, symbol, className, detail } = PRESENTATION[state];

  return (
    <div className="rounded-card border border-surface-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-ink">Gemini</span>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase ${className}`}
        >
          <span aria-hidden="true">{symbol}</span>
          {badge}
        </span>
      </div>
      <StatusRegion>
        <p className="mt-1 text-[11px] leading-tight text-ink-muted">{detail}</p>
      </StatusRegion>
    </div>
  );
}
