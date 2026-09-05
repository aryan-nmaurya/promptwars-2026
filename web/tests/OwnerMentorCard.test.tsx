/**
 * The mentor is owner-only, but "owner-only" must not mean "invisible". A
 * supervisor opening the shared link should be able to see the feature exists
 * without being able to read a word of the conversation or spend a request.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OwnerMentorCard } from "@/components/OwnerMentorCard";

const get = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, get: (...args: unknown[]) => get(...args) } };
});

const PROJECT_ID = "proj-abc123";

describe("OwnerMentorCard", () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue({ items: [], meta: { total: 0, limit: 50, offset: 0 } });
  });

  it("explains the mentor to a shared viewer instead of rendering nothing", () => {
    render(<OwnerMentorCard projectId={PROJECT_ID} />);

    expect(screen.getByRole("heading", { name: /project mentor/i })).toBeInTheDocument();
    expect(screen.getByText(/private to the student/i)).toBeInTheDocument();
    expect(screen.getByText(/powered by gemini/i)).toBeInTheDocument();
  });

  it("still refuses to fetch or expose the conversation for a shared viewer", () => {
    render(<OwnerMentorCard projectId={PROJECT_ID} />);

    // No history request, and no way to ask a question that would bill a call.
    expect(get).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("textbox", { name: /ask the mentor a question/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the live chat once the device holds the edit capability", async () => {
    localStorage.setItem(`ideaforge.project.edit-token.${PROJECT_ID}`, "raw-edit-capability");

    render(<OwnerMentorCard projectId={PROJECT_ID} />);

    expect(
      await screen.findByRole("textbox", { name: /ask the mentor a question/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/private to the student/i)).not.toBeInTheDocument();
  });
});
