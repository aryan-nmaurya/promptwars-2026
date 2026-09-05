"use client";

import { useProjectEditToken } from "@/lib/project-access";

export function ProjectAccessNotice({ projectId }: { projectId: string }) {
  const editToken = useProjectEditToken(projectId);

  return editToken === null ? (
    <div className="flex items-start gap-2 rounded-md border border-surface-border bg-surface-2 px-3 py-2 text-xs text-ink-muted">
      <span aria-hidden="true">◉</span>
      <p>
        <strong className="font-semibold text-ink">Read-only shared view.</strong> You can
        inspect the plan and its latest evaluation, but only the owner can make changes.
      </p>
    </div>
  ) : (
    <div className="flex items-center gap-2 text-xs text-ink-muted">
      <span aria-hidden="true" className="text-amber">
        ◆
      </span>
      <span>Owner workspace · edits stay available on this device</span>
    </div>
  );
}
