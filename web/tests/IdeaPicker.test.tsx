/**
 * The pivot of the demo: three generated ideas on screen, the student picks
 * one, and the app must both navigate to the new project AND keep the edit
 * capability that was returned exactly once. Losing that token silently
 * downgrades the owner to a read-only viewer of their own project.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IdeaPicker } from "@/components/IdeaPicker";
import { ApiError, type Idea } from "@/lib/api";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const post = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, post: (...args: unknown[]) => post(...args) } };
});

function idea(overrides: Partial<Idea> = {}): Idea {
  return {
    id: "idea-1",
    position: 0,
    title: "Voice-First Medication Reminder",
    summary: "A summary of the project.",
    problem_solved: "The problem it solves.",
    feasibility: 9,
    tech_stack: ["Python", "React"],
    core_features: ["Daily schedule", "Dose confirmation"],
    stretch_goals: [],
    ...overrides,
  };
}

const CREATED = {
  project: {
    id: "proj-abc123",
    title: "Voice-First Medication Reminder",
    summary: "A summary of the project.",
    created_at: "2026-09-05T10:00:00Z",
  },
  edit_token: "raw-edit-capability",
};

describe("IdeaPicker", () => {
  beforeEach(() => {
    push.mockReset();
    post.mockReset();
  });

  it("shows feasibility as a number and a word, never colour alone", () => {
    render(<IdeaPicker ideas={[idea({ feasibility: 9 })]} interests="health" skills="python" />);

    expect(screen.getByText(/9\/10/)).toBeInTheDocument();
    expect(screen.getByText(/Very achievable/)).toBeInTheDocument();
  });

  it("stores the one-time edit capability and navigates to the new project", async () => {
    post.mockResolvedValue(CREATED);
    const user = userEvent.setup();
    render(<IdeaPicker ideas={[idea()]} interests="health" skills="python" />);

    await user.click(screen.getByRole("button", { name: /choose this idea/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/projects/proj-abc123"));
    expect(post).toHaveBeenCalledWith("/projects", { idea_id: "idea-1" }, expect.anything());
    expect(localStorage.getItem("ideaforge.project.edit-token.proj-abc123")).toBe(
      "raw-edit-capability",
    );
  });

  it("surfaces a failure instead of navigating, and lets the student retry", async () => {
    post.mockRejectedValue(new ApiError("Rate limit exceeded", 429, "/projects"));
    const user = userEvent.setup();
    render(<IdeaPicker ideas={[idea()]} interests="health" skills="python" />);

    await user.click(screen.getByRole("button", { name: /choose this idea/i }));

    expect(await screen.findByText(/Rate limit exceeded/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    // The button must come back, or a transient 429 ends the demo.
    expect(screen.getByRole("button", { name: /choose this idea/i })).toBeEnabled();
    expect(localStorage.getItem("ideaforge.project.edit-token.proj-abc123")).toBeNull();
  });

  it("announces failures in a live region so they are not silent", async () => {
    post.mockRejectedValue(new ApiError("Could not reach the API.", 0, "/projects"));
    const user = userEvent.setup();
    render(<IdeaPicker ideas={[idea()]} interests="health" skills="python" />);

    await user.click(screen.getByRole("button", { name: /choose this idea/i }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/Could not reach the API/);
  });
});
