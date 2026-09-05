import { notFound } from "next/navigation";

import { ClaimEditToken } from "@/components/ClaimEditToken";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { FallbackBanner } from "@/components/FallbackBanner";
import { OwnerMentorCard } from "@/components/OwnerMentorCard";
import { ProjectAccessNotice } from "@/components/ProjectAccessNotice";
import { RepositoryEvaluator } from "@/components/RepositoryEvaluator";
import { RoadmapChecklist } from "@/components/RoadmapChecklist";
import { Card, ErrorState } from "@/components/ui";
import { ApiError, api, type Project } from "@/lib/api";

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
  try {
    project = await api.get<Project>(`/projects/${id}`);
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
        <ClaimEditToken project={project} />
        <ProjectAccessNotice projectId={project.id} />
      </header>

      {project.used_fallback ? <FallbackBanner what="this roadmap" /> : null}

      <RepositoryEvaluator
        projectId={project.id}
        initialEvaluation={project.latest_evaluation ?? null}
      />

      <Card
        title="Scope contract"
        as="h2"
        description="The frozen plan your repository evaluation is measured against."
      >
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">
              Problem to solve
            </h3>
            <p className="mt-1 text-sm text-ink">{project.problem_solved}</p>
          </div>

          <div>
            <h3 className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">
              Core deliverables
            </h3>
            {project.core_features.length > 0 ? (
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {project.core_features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 rounded-md border border-surface-border bg-bg p-3 text-sm text-ink"
                  >
                    <span aria-hidden="true" className="text-amber">
                      ✓
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-ink-muted">No core deliverables recorded.</p>
            )}
          </div>

          {project.stretch_goals.length > 0 ? (
            <div>
              <h3 className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">
                Stretch goals · only after the core works
              </h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {project.stretch_goals.map((goal) => (
                  <li
                    key={goal}
                    className="rounded-full border border-surface-border bg-surface-2 px-3 py-1 text-xs text-ink-muted"
                  >
                    {goal}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Card>

      <Card
        title="Your roadmap"
        as="h2"
        description="A phased build plan with progress saved for the owner."
      >
        <RoadmapChecklist projectId={project.id} initialSteps={project.steps} />
      </Card>

      <OwnerMentorCard projectId={project.id} />
    </div>
  );
}
