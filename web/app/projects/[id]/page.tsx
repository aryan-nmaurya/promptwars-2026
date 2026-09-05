import { notFound } from "next/navigation";

import { CopyLinkButton } from "@/components/CopyLinkButton";
import { ElapsedCounter } from "@/components/ElapsedCounter";
import { FallbackBanner } from "@/components/FallbackBanner";
import { MentorChat } from "@/components/MentorChat";
import { RoadmapChecklist } from "@/components/RoadmapChecklist";
import { Card, ErrorState } from "@/components/ui";
import { ApiError, api, type MentorMessage, type Page, type Project } from "@/lib/api";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const project = await api.get<Project>(`/projects/${id}`);
    return { title: project.title };
  } catch (cause: unknown) {
    // generateMetadata runs before the page body, so without this a missing
    // project renders the 404 page under a "Project" tab title.
    if (cause instanceof ApiError && cause.status === 404) return { title: "Not found" };
    return { title: "Project" };
  }
}

/**
 * The shareable artefact. No auth: anyone with the URL can read it, which is
 * how a student shows a professor. Ids are random tokens, so the URL cannot
 * be guessed by counting.
 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let project: Project;
  let history: Page<MentorMessage>;
  try {
    // Two independent reads - fetch them concurrently, not one after the other.
    [project, history] = await Promise.all([
      api.get<Project>(`/projects/${id}`),
      api.get<Page<MentorMessage>>(`/projects/${id}/mentor`),
    ]);
  } catch (cause: unknown) {
    if (cause instanceof ApiError && cause.status === 404) notFound();
    return (
      <ErrorState
        title="Could not load this project"
        message={cause instanceof Error ? cause.message : "Unknown error"}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-4xl">
          {project.title}
        </h1>
        <p className="max-w-2xl text-base text-ink-muted">{project.summary}</p>

        <dl className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs">
          <div className="flex gap-2">
            <dt className="text-ink-muted">Feasibility</dt>
            <dd className="text-amber">{project.feasibility}/10</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-muted">Built with</dt>
            <dd className="text-ink">{project.tech_stack.join(" · ") || "your choice"}</dd>
          </div>
        </dl>

        <CopyLinkButton />
      </header>

      {project.used_fallback ? <FallbackBanner what="this roadmap" /> : null}

      <Card title="The problem it solves" as="h2">
        <p className="text-sm text-ink">{project.problem_solved}</p>
      </Card>

      <Card
        title="Your roadmap"
        as="h2"
        description="Tick steps off as you finish them. Progress is saved to this URL."
      >
        <RoadmapChecklist projectId={project.id} initialSteps={project.steps} />
      </Card>

      <Card
        title="Project mentor"
        as="h2"
        description="Grounded in this project's title, stack, roadmap and your progress."
      >
        <MentorChat projectId={project.id} initialMessages={history.items} />
      </Card>

      <ElapsedCounter since={project.created_at} />
    </div>
  );
}
