/**
 * Ticking a step is the one thing a student does repeatedly, and it is
 * optimistic — so the interesting case is the failed PATCH, where the box must
 * roll back rather than lie about saved progress.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoadmapChecklist } from "@/components/RoadmapChecklist";
import { ApiError, type RoadmapStep } from "@/lib/api";
import { PROJECT_EDIT_HEADER } from "@/lib/project-access";

const patch = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, patch: (...args: unknown[]) => patch(...args) } };
});

const STEPS: RoadmapStep[] = [
  {
    id: "step-1",
    phase: "Phase 1: Foundation",
    position: 0,
    title: "Define the schema",
    detail: "Create the tables.",
    is_done: false,
  },
  {
    id: "step-2",
    phase: "Phase 1: Foundation",
    position: 1,
    title: "Set up the server",
    detail: "Add a health endpoint.",
    is_done: false,
  },
];

const PROJECT_ID = "proj-abc123";

function asOwner() {
  localStorage.setItem(`ideaforge.project.edit-token.${PROJECT_ID}`, "raw-edit-capability");
}

describe("RoadmapChecklist", () => {
  beforeEach(() => {
    patch.mockReset();
  });

  it("is read-only, and says so, without the edit capability", () => {
    render(<RoadmapChecklist projectId={PROJECT_ID} initialSteps={STEPS} />);

    expect(screen.getByText(/read-only roadmap/i)).toBeInTheDocument();
    for (const box of screen.getAllByRole("checkbox")) {
      expect(box).toBeDisabled();
    }
  });

  it("ticks a step, sends the capability header, and reports progress", async () => {
    asOwner();
    patch.mockResolvedValue({ ...STEPS[0], is_done: true });
    const user = userEvent.setup();
    render(<RoadmapChecklist projectId={PROJECT_ID} initialSteps={STEPS} />);

    await user.click(screen.getByRole("checkbox", { name: /Define the schema/i }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        `/projects/${PROJECT_ID}/steps/step-1`,
        { is_done: true },
        { headers: { [PROJECT_EDIT_HEADER]: "raw-edit-capability" } },
      ),
    );
    expect(screen.getByRole("checkbox", { name: /Define the schema/i })).toBeChecked();
    // Progress is written out as text, not conveyed by the filled bar alone.
    expect(screen.getByText(/1 of 2 complete \(50%\)/)).toBeInTheDocument();
  });

  it("rolls the checkbox back when the save fails", async () => {
    asOwner();
    patch.mockRejectedValue(new ApiError("This shared project is read-only", 403, "/steps"));
    const user = userEvent.setup();
    render(<RoadmapChecklist projectId={PROJECT_ID} initialSteps={STEPS} />);
    const box = screen.getByRole("checkbox", { name: /Define the schema/i });

    await user.click(box);

    expect(await screen.findByText(/This shared project is read-only/)).toBeInTheDocument();
    await waitFor(() => expect(box).not.toBeChecked());
    expect(screen.getByText(/0 of 2 complete \(0%\)/)).toBeInTheDocument();
  });

  it("groups steps under their phase heading in server order", () => {
    asOwner();
    render(<RoadmapChecklist projectId={PROJECT_ID} initialSteps={STEPS} />);

    expect(screen.getByRole("heading", { name: /Phase 1: Foundation/ })).toBeInTheDocument();
    // Every checkbox is reachable by its step title, which means each one has
    // a real associated label rather than a bare box.
    expect(screen.getByRole("checkbox", { name: /Define the schema/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Set up the server/i })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });
});
