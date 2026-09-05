"use client";

import { MentorChat } from "@/components/MentorChat";
import { Card } from "@/components/ui";
import { useProjectEditToken } from "@/lib/project-access";

/** Mentor history is private to the device that owns the project's edit capability. */
export function OwnerMentorCard({ projectId }: { projectId: string }) {
  const editToken = useProjectEditToken(projectId);
  if (editToken === null) return null;

  return (
    <Card
      title="Project mentor"
      as="h2"
      description="Private, project-aware guidance grounded in your stack, roadmap and progress."
    >
      <MentorChat projectId={projectId} />
    </Card>
  );
}
