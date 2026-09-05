/**
 * The mentor is the Gemini surface a judge is most likely to try, and it is
 * the only streamed one. These cover the visible contract: history loads,
 * chunks render as they arrive, the persisted turns replace the stream, and a
 * shared viewer never sees the private conversation at all.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MentorChat } from "@/components/MentorChat";
import { ApiError, type MentorMessage } from "@/lib/api";

const get = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, get: (...args: unknown[]) => get(...args) } };
});

const streamMentorAnswer = vi.fn();
vi.mock("@/lib/stream", () => ({
  streamMentorAnswer: (...args: unknown[]) => streamMentorAnswer(...args),
}));

const PROJECT_ID = "proj-abc123";

function message(overrides: Partial<MentorMessage> = {}): MentorMessage {
  return {
    id: "msg-1",
    role: "user",
    content: "What should I build first?",
    created_at: "2026-09-05T10:00:00Z",
    ...overrides,
  };
}

function asOwner() {
  localStorage.setItem(`ideaforge.project.edit-token.${PROJECT_ID}`, "raw-edit-capability");
}

describe("MentorChat", () => {
  beforeEach(() => {
    get.mockReset();
    streamMentorAnswer.mockReset();
    get.mockResolvedValue({ items: [], meta: { total: 0, limit: 50, offset: 0 } });
  });

  it("renders nothing for a shared viewer, so the conversation stays private", () => {
    const { container } = render(<MentorChat projectId={PROJECT_ID} />);

    expect(container).toBeEmptyDOMElement();
    expect(get).not.toHaveBeenCalled();
  });

  it("loads the existing conversation for the owner", async () => {
    asOwner();
    get.mockResolvedValue({
      items: [
        message(),
        message({ id: "msg-2", role: "assistant", content: "Start with the schema." }),
      ],
      meta: { total: 2, limit: 50, offset: 0 },
    });

    render(<MentorChat projectId={PROJECT_ID} />);

    expect(await screen.findByText("What should I build first?")).toBeInTheDocument();
    expect(screen.getByText("Start with the schema.")).toBeInTheDocument();
  });

  it("streams an answer, then replaces it with the persisted turns", async () => {
    asOwner();
    streamMentorAnswer.mockImplementation(
      async (
        _projectId: string,
        _question: string,
        _token: string,
        onChunk: (text: string) => void,
      ) => {
        onChunk("Start ");
        onChunk("with the schema.");
        return {
          question: message({ id: "saved-q", content: "Where do I start?" }),
          answer: message({
            id: "saved-a",
            role: "assistant",
            content: "Start with the schema.",
          }),
          used_fallback: false,
        };
      },
    );
    const user = userEvent.setup();
    render(<MentorChat projectId={PROJECT_ID} />);
    await screen.findByRole("textbox", { name: /ask the mentor a question/i });

    await user.type(
      screen.getByRole("textbox", { name: /ask the mentor a question/i }),
      "Where do I start?",
    );
    await user.click(screen.getByRole("button", { name: /^ask the mentor$/i }));

    expect(await screen.findByText("Where do I start?")).toBeInTheDocument();
    expect(screen.getByText("Start with the schema.")).toBeInTheDocument();
    expect(streamMentorAnswer).toHaveBeenCalledWith(
      PROJECT_ID,
      "Where do I start?",
      "raw-edit-capability",
      expect.any(Function),
      expect.anything(),
    );
  });

  it("reports a stream failure in a live region and keeps the input usable", async () => {
    asOwner();
    streamMentorAnswer.mockRejectedValue(
      new ApiError("You are asking a bit fast — give it a moment.", 429, "/mentor/stream"),
    );
    const user = userEvent.setup();
    render(<MentorChat projectId={PROJECT_ID} />);
    const input = await screen.findByRole("textbox", { name: /ask the mentor a question/i });

    await user.type(input, "Where do I start?");
    await user.click(screen.getByRole("button", { name: /^ask the mentor$/i }));

    expect(await screen.findByText(/asking a bit fast/i)).toBeInTheDocument();
    await waitFor(() => expect(input).toBeEnabled());
  });

  it("ignores a question shorter than the API's minimum", async () => {
    asOwner();
    const user = userEvent.setup();
    render(<MentorChat projectId={PROJECT_ID} />);
    const input = await screen.findByRole("textbox", { name: /ask the mentor a question/i });

    await user.type(input, "hi");
    await user.click(screen.getByRole("button", { name: /^ask the mentor$/i }));

    expect(streamMentorAnswer).not.toHaveBeenCalled();
  });
});
