"use client";

import { Button, Card, GeminiBadge, Spinner, StatusRegion } from "@/components/ui";

import { MAX_PAYLOAD_LENGTH } from "./PayloadMeter";

function Payload({ title, value }: { title: string; value: string }) {
  return (
    <Card title={title} as="h2">
      <div className="flex flex-col gap-2">
        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-surface-border bg-bg p-3 font-mono text-xs text-ink">
          {value || "(none selected)"}
        </pre>
        <p className="text-right font-mono text-[11px] text-ink-muted">
          {value.length} / {MAX_PAYLOAD_LENGTH} characters
        </p>
      </div>
    </Card>
  );
}

export function ReviewStep({
  interests,
  skills,
  pending,
  error,
  onBack,
  onGenerate,
}: {
  interests: string;
  skills: string;
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onGenerate: () => void;
}) {
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Review your prompt
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          This is exactly what is sent to Gemini to generate your 3 tailored project ideas.
        </p>
      </div>

      <Payload title="Interests payload" value={interests} />
      <Payload title="Skills & proficiency payload" value={skills} />

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-surface-border pt-4">
        <Button variant="secondary" size="lg" disabled={pending} onClick={onBack}>
          ← Edit skills
        </Button>

        <div className="flex items-center gap-3">
          <Button size="lg" loading={pending} loadingLabel="Generating ideas" onClick={onGenerate}>
            {pending ? "Generating ideas…" : "Generate 3 project ideas"}
          </Button>
          <GeminiBadge />
        </div>
      </div>

      <StatusRegion className="min-h-[2rem]">
        {pending ? (
          <span className="flex items-center gap-2 text-sm text-ink-muted">
            <Spinner size="sm" label="Generating ideas" />
            Asking Gemini for ideas tailored to your stack. This takes a few seconds.
          </span>
        ) : null}
        {error ? (
          <span className="text-sm font-medium text-danger">
            <span aria-hidden="true">✕ </span>
            {error}
          </span>
        ) : null}
      </StatusRegion>
    </section>
  );
}
