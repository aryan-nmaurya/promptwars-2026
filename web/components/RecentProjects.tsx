"use client";

import Link from "next/link";

import { EmptyState } from "@/components/ui";
import { useRecentProjects } from "@/lib/project-access";

export function RecentProjects() {
  const projects = useRecentProjects();

  if (projects.length === 0) {
    return (
      <EmptyState
        title="No projects on this device"
        description="Projects you create are remembered locally, without publishing a directory of student work."
        icon="◇"
        action={
          <Link
            href="/"
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
      {projects.map((project) => (
        <li key={project.id}>
          <Link
            href={`/projects/${project.id}`}
            className="block h-full rounded-card border border-surface-border bg-surface p-4 transition-colors hover:border-control-border"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display font-semibold text-ink">{project.title}</h2>
              <span
                title="Owner access is saved on this device"
                aria-label="Owner access saved"
                className="shrink-0 text-amber"
              >
                ◆
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{project.summary}</p>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-ink-muted">
              Created {new Date(project.created_at).toLocaleDateString()}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
