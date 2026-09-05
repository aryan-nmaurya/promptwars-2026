"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState, ErrorState, Spinner } from "@/components/ui";
import { api, toErrorMessage, type Page, type ProjectSummary } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useRecentProjects, type RecentProject } from "@/lib/project-access";

interface Row {
  id: string;
  title: string;
  summary: string;
  created_at: string;
}

function ProjectCard({ project, owned }: { project: Row; owned: boolean }) {
  return (
    <li>
      <Link
        href={`/projects/${project.id}`}
        className="block h-full rounded-card border border-surface-border bg-surface p-4 transition-colors hover:border-control-border"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display font-semibold text-ink">{project.title}</h2>
          {owned ? (
            <span
              title="Owner access is saved on this device"
              aria-label="Owner access saved"
              className="shrink-0 text-amber"
            >
              ◆
            </span>
          ) : null}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{project.summary}</p>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-ink-muted">
          Created {new Date(project.created_at).toLocaleDateString()}
        </p>
      </Link>
    </li>
  );
}

/**
 * The student's projects.
 *
 * Signed in, this is the account's list, read from the server - which is the
 * point of having an account, and what makes the list follow you to another
 * device. Signed out, it falls back to the browser-local index of projects
 * created anonymously on this machine.
 *
 * These were previously the same thing: the list was always browser-local, so
 * every account signed in on one machine showed the same projects regardless
 * of who owned them.
 */
export function RecentProjects() {
  const { status } = useSession();
  const localProjects = useRecentProjects();
  const [remote, setRemote] = useState<ProjectSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      setRemote(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    void api
      .get<Page<ProjectSummary>>("/projects", { signal: controller.signal })
      .then((page) => {
        if (!cancelled) {
          setRemote(page.items);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(toErrorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [status]);

  const signedIn = status === "authenticated";

  if (signedIn && loading && remote === null) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <Spinner size="sm" label="Loading your projects" />
        Loading your projects…
      </p>
    );
  }

  if (signedIn && error !== null && remote === null) {
    return <ErrorState title="Could not load your projects" message={error} />;
  }

  const rows: Row[] = signedIn && remote !== null ? remote : (localProjects as RecentProject[]);

  if (rows.length === 0) {
    return (
      <EmptyState
        title={signedIn ? "No projects in this account yet" : "No projects on this device"}
        description={
          signedIn
            ? "Projects you create while signed in appear here on every device you use."
            : "Projects you create are remembered locally. Sign in to keep them across devices."
        }
        icon="◇"
        action={
          <Link
            href="/onboarding"
            className="inline-flex h-9 items-center justify-center rounded-md bg-amber px-4 text-sm font-medium text-amber-ink"
          >
            Generate project ideas
          </Link>
        }
      />
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {rows.map((project) => (
        <ProjectCard key={project.id} project={project} owned={!signedIn} />
      ))}
    </ul>
  );
}
