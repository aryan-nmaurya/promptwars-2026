/**
 * The list that was showing every account the same projects.
 *
 * It was always browser-local, so on a shared machine each new sign-up
 * inherited whatever the previous person had created. Signed in it now comes
 * from the account; signed out it stays local.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecentProjects } from "@/components/RecentProjects";
import { ApiError } from "@/lib/api";

const get = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, get: (...args: unknown[]) => get(...args) } };
});

function signIn() {
  localStorage.setItem("ideaforge.auth.token", "session-token");
  localStorage.setItem(
    "ideaforge.auth.user",
    JSON.stringify({
      id: "u1",
      email: "a@b.co",
      created_at: "2026-09-05T10:00:00Z",
      onboarding_completed_at: "2026-09-05T10:00:00Z",
    }),
  );
}

function seedLocalProject(id: string, title: string) {
  localStorage.setItem(
    "ideaforge.recent-projects",
    JSON.stringify([{ id, title, summary: "local summary", created_at: "2026-09-05T10:00:00Z" }]),
  );
}

const REMOTE = {
  items: [
    {
      id: "server-1",
      title: "From my account",
      summary: "server summary",
      feasibility: 8,
      tech_stack: ["Python"],
      created_at: "2026-09-05T10:00:00Z",
    },
  ],
  meta: { total: 1, limit: 25, offset: 0 },
};

describe("RecentProjects", () => {
  beforeEach(() => {
    get.mockReset();
  });

  it("shows the account's projects, not the browser's, when signed in", async () => {
    signIn();
    seedLocalProject("local-1", "Left over from the last person");
    get.mockResolvedValue(REMOTE);

    render(<RecentProjects />);

    expect(await screen.findByText("From my account")).toBeInTheDocument();
    expect(screen.queryByText("Left over from the last person")).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/projects", expect.anything());
  });

  it("falls back to the device-local index when signed out", async () => {
    seedLocalProject("local-1", "Made anonymously here");

    render(<RecentProjects />);

    expect(await screen.findByText("Made anonymously here")).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it("tells a signed-in user with no projects that the account is empty", async () => {
    signIn();
    get.mockResolvedValue({ items: [], meta: { total: 0, limit: 25, offset: 0 } });

    render(<RecentProjects />);

    expect(await screen.findByText(/no projects in this account yet/i)).toBeInTheDocument();
  });

  it("surfaces a failure rather than silently showing the wrong list", async () => {
    signIn();
    seedLocalProject("local-1", "Left over from the last person");
    get.mockRejectedValue(new ApiError("Invalid or expired session token", 401, "/projects"));

    render(<RecentProjects />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/expired session token/i);
    await waitFor(() =>
      expect(screen.queryByText("Left over from the last person")).not.toBeInTheDocument(),
    );
  });
});
