/**
 * The SSE parser, driven by frames the API actually emits (see
 * `api/app/routers/mentor.py::_stream_events`).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { streamMentorAnswer } from "@/lib/stream";

function sse(...frames: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

const DONE_PAYLOAD = {
  question: { id: "q", role: "user", content: "Q", created_at: "2026-09-05T10:00:00Z" },
  answer: { id: "a", role: "assistant", content: "A", created_at: "2026-09-05T10:00:01Z" },
  used_fallback: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamMentorAnswer", () => {
  it("emits each chunk and resolves with the terminal frame", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sse(
          'event: chunk\ndata: {"text":"Start "}\n\n',
          'event: chunk\ndata: {"text":"here."}\n\n',
          `event: done\ndata: ${JSON.stringify(DONE_PAYLOAD)}\n\n`,
        ),
      ),
    );
    const chunks: string[] = [];

    const done = await streamMentorAnswer("p1", "Q", "token", (text) => chunks.push(text));

    expect(chunks).toEqual(["Start ", "here."]);
    expect(done.answer.content).toBe("A");
  });

  it("reassembles a frame split across network reads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sse(
          'event: chunk\ndata: {"text":"Sta',
          'rt here."}\n\n',
          `event: done\ndata: ${JSON.stringify(DONE_PAYLOAD)}\n\n`,
        ),
      ),
    );
    const chunks: string[] = [];

    await streamMentorAnswer("p1", "Q", "token", (text) => chunks.push(text));

    expect(chunks).toEqual(["Start here."]);
  });

  it("surfaces the server's error frame instead of a generic failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sse(
          'event: chunk\ndata: {"text":"Half an "}\n\n',
          'event: error\ndata: {"error":"The mentor response was interrupted. Please retry.","retryable":true}\n\n',
        ),
      ),
    );

    await expect(
      streamMentorAnswer("p1", "Q", "token", () => {}),
    ).rejects.toThrow(/interrupted. Please retry/);
  });

  it("translates a rate limit into something a student can act on", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 429 })));

    await expect(streamMentorAnswer("p1", "Q", "token", () => {})).rejects.toThrow(
      /asking a bit fast/i,
    );
  });

  it("fails loudly when the stream ends without a terminal frame", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(sse('event: chunk\ndata: {"text":"Half an "}\n\n')),
    );

    await expect(streamMentorAnswer("p1", "Q", "token", () => {})).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});
