"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Spinner,
  StatusRegion,
  Toast,
} from "@/components/ui";
import { api, apiBaseUrl, toErrorMessage, type HealthResponse } from "@/lib/api";

type Status =
  | { kind: "loading" }
  | { kind: "ready"; health: HealthResponse }
  | { kind: "error"; message: string };

/**
 * Proves the chain end to end from the browser: Next.js -> NEXT_PUBLIC_API_URL
 * -> FastAPI CORS -> Postgres. If this page renders "db: connected", every
 * layer is wired correctly and you can start writing features.
 *
 * It is a client component on purpose - a server component would call the API
 * from the Vercel runtime and would not exercise CORS, which is exactly the
 * thing that breaks at 2am.
 */
export default function HomePage() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const check = useCallback(async (): Promise<void> => {
    setStatus({ kind: "loading" });
    try {
      const health = await api.get<HealthResponse>("/health");
      setStatus({ kind: "ready", health });
    } catch (error: unknown) {
      setStatus({ kind: "error", message: toErrorMessage(error) });
    } finally {
      setCheckedAt(new Date().toLocaleTimeString());
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
          Stack check
        </h1>
        <p className="text-sm text-muted">
          Delete this page and start building. It exists only to prove the wiring.
        </p>
      </header>

      <Card
        title="Backend connection"
        description={
          <>
            Calling <code className="font-mono text-fg">{apiBaseUrl()}/health</code>
          </>
        }
        footer={
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted">
              {checkedAt ? `Last checked ${checkedAt}` : "Not checked yet"}
            </p>
            <Button
              onClick={() => void check()}
              loading={status.kind === "loading"}
              loadingLabel="Checking the API"
              size="sm"
            >
              Re-check
            </Button>
          </div>
        }
      >
        {/* Live region is mounted once, always - see components/ui/Toast.tsx. */}
        <StatusRegion className="min-h-[3.5rem]">
          {status.kind === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner size="sm" label="Checking the API" />
              <span>Checking the API…</span>
            </div>
          ) : null}

          {status.kind === "ready" ? (
            <Toast
              tone={status.health.db ? "success" : "warning"}
              title={status.health.db ? "API and database reachable" : "API up, database unreachable"}
            >
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-xs">
                <dt className="text-muted">status</dt>
                <dd>{status.health.status}</dd>
                <dt className="text-muted">db</dt>
                <dd>{status.health.db ? "connected" : "not connected"}</dd>
              </dl>
            </Toast>
          ) : null}
        </StatusRegion>

        {status.kind === "error" ? (
          <ErrorState message={status.message} onRetry={() => void check()} />
        ) : null}
      </Card>

      <Card title="Component kit" description="Everything below is in components/ui." as="h2">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button disabled>Disabled</Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Label" name="demo" placeholder="Placeholder" hint="Helper text." />
            <Input label="With error" name="demo-error" defaultValue="oops" error="That value is not valid." />
          </div>

          <EmptyState
            title="Nothing here yet"
            description="Use this whenever a list comes back empty. Empty is not an error."
            icon="◻"
            action={<Button size="sm">Create the first one</Button>}
          />
        </div>
      </Card>
    </div>
  );
}
