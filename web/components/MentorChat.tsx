"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";

import {
  Button,
  EmptyState,
  GeminiBadge,
  Input,
  Markdown,
  Spinner,
  StatusRegion,
} from "@/components/ui";
import { toErrorMessage, type MentorMessage } from "@/lib/api";
import { streamMentorAnswer } from "@/lib/stream";

export function MentorChat({
  projectId,
  initialMessages,
}: {
  projectId: string;
  initialMessages: MentorMessage[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [question, setQuestion] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const asked = question.trim();
    if (asked.length < 3 || pending) return;

    setPending(true);
    setError(null);
    setStreaming("");
    setQuestion("");
    try {
      const done = await streamMentorAnswer(projectId, asked, (piece) =>
        setStreaming((current) => (current ?? "") + piece),
      );
      setMessages((current) => [...current, done.question, done.answer]);
    } catch (cause: unknown) {
      setError(toErrorMessage(cause));
    } finally {
      setStreaming(null);
      setPending(false);
      inputRef.current?.focus(); // keyboard users stay in the conversation
    }
  }

  const hasHistory = messages.length > 0 || streaming !== null;

  return (
    <div className="flex flex-col gap-4">
      {!hasHistory ? (
        <EmptyState
          title="No questions yet"
          description="Ask anything about this project — the mentor knows its stack, roadmap and what you have already finished."
          icon="✦"
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.map((message) => (
            <li
              key={message.id}
              className={
                message.role === "user"
                  ? "rounded-card border border-control-border bg-surface-2 p-3"
                  : "rounded-card border border-amber-dim bg-amber/10 p-3"
              }
            >
              <p className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">
                {message.role === "user" ? "You asked" : "Mentor"}
              </p>
              <div className="mt-1.5">
                {message.role === "user" ? (
                  <p className="whitespace-pre-wrap text-sm text-ink">{message.content}</p>
                ) : (
                  <Markdown>{message.content}</Markdown>
                )}
              </div>
            </li>
          ))}

          {streaming !== null ? (
            <li className="rounded-card border border-amber-dim bg-amber/10 p-3">
              <p className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">
                Mentor
              </p>
              <div className="mt-1.5">
                {streaming === "" ? (
                  <span className="flex items-center gap-2 text-sm text-ink-muted">
                    <Spinner size="sm" label="Mentor is thinking" />
                    Thinking about your project…
                  </span>
                ) : (
                  <>
                    <Markdown>{streaming}</Markdown>
                    <span aria-hidden="true" className="ml-0.5 inline-block animate-pulse text-amber">
                      ▍
                    </span>
                  </>
                )}
              </div>
            </li>
          ) : null}
        </ul>
      )}

      <StatusRegion className="min-h-[1.25rem]">
        {pending ? <span className="sr-only">Mentor is answering.</span> : null}
        {error ? (
          <span className="font-mono text-xs font-medium text-danger">
            <span aria-hidden="true">✕ </span>
            {error}
          </span>
        ) : null}
      </StatusRegion>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Input
          ref={inputRef}
          label="Ask the mentor a question"
          name="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What should I build first, and why?"
          minLength={3}
          maxLength={1000}
          disabled={pending}
          required
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={pending} loadingLabel="Asking the mentor">
            {pending ? "Asking…" : "Ask the mentor"}
          </Button>
          <GeminiBadge label="Answers from Gemini" />
        </div>
      </form>
    </div>
  );
}
