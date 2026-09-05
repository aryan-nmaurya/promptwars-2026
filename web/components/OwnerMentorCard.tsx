"use client";

import { MentorChat } from "@/components/MentorChat";
import { Card, GeminiBadge } from "@/components/ui";
import { useCanEditProject } from "@/lib/auth";

/**
 * The mentor, or an honest account of why it is not here.
 *
 * Mentor history is private to the device or account that owns the project —
 * a shared viewer must not be able to read the student's conversation,
 * nor spend their Gemini quota.
 */
export function OwnerMentorCard({
  projectId,
  projectOwnerId,
}: {
  projectId: string;
  projectOwnerId?: string | null;
}) {
  const canEdit = useCanEditProject(projectId, projectOwnerId);

  if (!canEdit) {
    return (
      <Card
        title="Project mentor"
        as="h2"
        description="Project-aware guidance grounded in this project's stack, roadmap and progress."
      >
        <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-control-border p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span aria-hidden="true" className="text-amber">
              ◉
            </span>
            <p className="text-sm font-medium text-ink">Private to the student</p>
            <GeminiBadge label="Powered by Gemini" />
          </div>
          <p className="max-w-prose text-xs text-ink-muted">
            The student asks the mentor questions about this project and it answers using the
            title, stack, roadmap and which steps are already ticked off. The conversation stays
            on the device that created the project — a shared link can read the plan and its
            evaluation, but never the private mentor history.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Project mentor"
      as="h2"
      description="Private, project-aware guidance grounded in your stack, roadmap and progress."
    >
      <MentorChat projectId={projectId} projectOwnerId={projectOwnerId} />
    </Card>
  );
}

