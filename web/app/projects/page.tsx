import Link from "next/link";

import { Button, EmptyState, ErrorState } from "@/components/ui";
import { api, type Page, type ProjectSummary } from "@/lib/api";

export const metadata = { title: "All projects" };

const PAGE_SIZE = 10;

function parseOffset(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** Paginated list of every generated project. Server Component throughout. */
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string }>;
}) {
  const offset = parseOffset((await searchParams).offset);

  let page: Page<ProjectSummary>;
  try {
    page = await api.get<Page<ProjectSummary>>("/projects", {
      query: { limit: PAGE_SIZE, offset },
    });
  } catch (cause: unknown) {
    return (
      <ErrorState
        title="Could not load projects"
        message={cause instanceof Error ? cause.message : "Unknown error"}
      />
    );
  }

  const { items, meta } = page;
  const hasPrev = meta.offset > 0;
  const hasNext = meta.offset + items.length < meta.total;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">All projects</h1>
        <p className="text-sm text-muted">
          {meta.total === 0
            ? "No projects yet."
            : `${meta.total} project${meta.total === 1 ? "" : "s"} generated so far.`}
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description="Generate your first set of ideas and choose one to see it listed here."
          icon="◻"
          action={
            <Link href="/" className="inline-block rounded">
              <Button size="sm">Generate ideas</Button>
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3">
          {items.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="block rounded-card border border-border bg-surface p-4 hover:border-border-strong"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold text-fg">{project.title}</h2>
                  <span className="text-xs text-muted">
                    Feasibility {project.feasibility}/10
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{project.summary}</p>
                {project.tech_stack.length > 0 ? (
                  <p className="mt-2 text-xs text-muted">{project.tech_stack.join(" · ")}</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {(hasPrev || hasNext) && (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
          {hasPrev ? (
            <Link href={`/projects?offset=${Math.max(0, meta.offset - PAGE_SIZE)}`} className="rounded">
              <Button variant="secondary" size="sm">
                Previous
              </Button>
            </Link>
          ) : (
            <span />
          )}
          <p className="text-xs text-muted">
            Showing {meta.offset + 1}–{meta.offset + items.length} of {meta.total}
          </p>
          {hasNext ? (
            <Link href={`/projects?offset=${meta.offset + PAGE_SIZE}`} className="rounded">
              <Button variant="secondary" size="sm">
                Next
              </Button>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
