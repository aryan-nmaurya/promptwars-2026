/**
 * Sign-out has to forget the device, not just the session. The project index
 * and the per-project edit capabilities are browser-scoped, so leaving them
 * behind handed the next account on a shared machine the previous student's
 * projects and the ability to edit them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { signOut } from "@/lib/auth";
import { getProjectEditToken } from "@/lib/project-access";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, post: vi.fn().mockResolvedValue(null) } };
});

describe("signOut", () => {
  beforeEach(() => {
    localStorage.setItem("ideaforge.auth.token", "session-token");
    localStorage.setItem("ideaforge.auth.user", JSON.stringify({ id: "u1", email: "a@b.co" }));
    localStorage.setItem(
      "ideaforge.recent-projects",
      JSON.stringify([
        { id: "p1", title: "T", summary: "S", created_at: "2026-09-05T10:00:00Z" },
      ]),
    );
    localStorage.setItem("ideaforge.project.edit-token.p1", "a-write-capability");
    localStorage.setItem("ideaforge.project.edit-token.p2", "another-capability");
  });

  it("clears the session, the project index and every edit capability", async () => {
    await signOut();

    expect(localStorage.getItem("ideaforge.auth.token")).toBeNull();
    expect(localStorage.getItem("ideaforge.auth.user")).toBeNull();
    expect(localStorage.getItem("ideaforge.recent-projects")).toBeNull();
    expect(getProjectEditToken("p1")).toBeNull();
    expect(getProjectEditToken("p2")).toBeNull();
  });

  it("leaves unrelated keys alone", async () => {
    localStorage.setItem("ideaforge.session", "anonymous-rate-limit-id");

    await signOut();

    expect(localStorage.getItem("ideaforge.session")).toBe("anonymous-rate-limit-id");
  });
});
