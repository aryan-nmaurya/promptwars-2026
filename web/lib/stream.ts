import { ApiError, apiBaseUrl } from "./api";
import type { MentorMessage } from "./api";
import { getSessionToken } from "./auth";
import { projectEditHeaders } from "./project-access";

export interface StreamDone {
  question: MentorMessage;
  answer: MentorMessage;
  used_fallback: boolean;
}

const SESSION_KEY = "ideaforge.session";

function sessionHeader(): Record<string, string> {
  try {
    const id = window.localStorage.getItem(SESSION_KEY);
    return id ? { "x-session-id": id } : {};
  } catch {
    return {};
  }
}

/**
 * Consume the mentor's server-sent event stream.
 *
 * `onChunk` fires for each piece of text as it arrives; the promise resolves
 * with the terminal frame, which carries the persisted rows. Parsing is done
 * by hand rather than with EventSource because EventSource cannot POST.
 */
export async function streamMentorAnswer(
  projectId: string,
  question: string,
  editToken: string | null | undefined,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamDone> {
  const url = `${apiBaseUrl()}/projects/${projectId}/mentor/stream`;
  const auth = getSessionToken();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...sessionHeader(),
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...projectEditHeaders(editToken),
    },
    body: JSON.stringify({ question }),
    signal,
  });


  if (!response.ok || response.body === null) {
    throw new ApiError(
      response.status === 429
        ? "You are asking a bit fast — give it a moment."
        : "The mentor could not be reached.",
      response.status,
      url,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done: StreamDone | null = null;

  for (;;) {
    const { value, done: finished } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });

    // Frames are separated by a blank line; keep any partial frame in the buffer.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const event = /^event: (.+)$/m.exec(frame)?.[1];
      const data = /^data: (.+)$/m.exec(frame)?.[1];
      if (!event || !data) continue;
      if (event === "chunk") {
        onChunk((JSON.parse(data) as { text: string }).text);
      } else if (event === "done") {
        done = JSON.parse(data) as StreamDone;
      } else if (event === "error") {
        // The server emits this when a stream dies mid-answer: the partial
        // text is deliberately not persisted, so the client must surface the
        // real reason rather than the generic "ended unexpectedly" below.
        const payload = JSON.parse(data) as { error?: string };
        throw new ApiError(
          payload.error ?? "The mentor response was interrupted. Please retry.",
          503,
          url,
        );
      }
    }
  }

  if (done === null) throw new ApiError("The answer ended unexpectedly.", 0, url);
  return done;
}
