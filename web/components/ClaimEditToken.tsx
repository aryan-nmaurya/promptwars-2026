"use client";

import { useEffect, useState } from "react";

import { rememberOwnedProject } from "@/lib/project-access";
import type { Project } from "@/lib/api";

/**
 * Accepts a one-time `?edit=<token>` capability and moves it into local
 * storage, then strips it from the URL and history.
 *
 * This is the only way an edit capability can reach a second device, since it
 * is otherwise returned once at creation and never re-exposed by any read.
 * The token is removed from the address bar immediately so it is not left in
 * history, and `Referrer-Policy: strict-origin-when-cross-origin` keeps it out
 * of outbound referrers.
 */
export function ClaimEditToken({ project }: { project: Project }) {
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("edit");
    if (!token) return;

    rememberOwnedProject(project, token);
    url.searchParams.delete("edit");
    window.history.replaceState(null, "", url.toString());
    setClaimed(true);
  }, [project]);

  if (!claimed) return null;

  return (
    <p role="status" className="font-mono text-[11px] text-amber">
      Edit access saved to this device. The link in your address bar is now the
      read-only one.
    </p>
  );
}
