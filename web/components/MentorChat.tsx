"use client";

import { useRef, useState } from "react";
import type { FormEvent } from "react";

import {
  Button,
  EmptyState,
  GeminiBadge,
  Input,
  Spinner,
  StatusRegion,
} from "@/components/ui";
import { api, toErrorMessage, type MentorMessage, type MentorReply } from "@/lib/api";

export function MentorChat({
  projectId,
  initialMessages,
}: {
  projectId: string;
  initialMessages: MentorMessage[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const asked = question.trim();
    if (asked.length < 3 || pending) return;

    setPending(true);
    setError(null);
    try {
      const reply = await api.post<MentorReply>(`/projects/${projectId}/mentor`, {
        question: asked,
      });
      setMessages((current) => [...current, reply.question, reply.answer]);
      setQuestion("");
    } catch (cause: unknown) {
      setError(toErrorMessage(cause));
    } finally {
      setPending(false);
      inputRef.current?.focus(); // keyboard users stay in the conversation
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.length === 0 && !pending ? (
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
                  ? "rounded-card border border-border-strong bg-bg p-3"
                  : "rounded-card border border-primary/40 bg-primary/5 p-3"
              }
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {message.role === "user" ? "You asked" : "Mentor"}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-fg">{message.content}</p>
            </li>
          ))}
        </ul>
      )}

      <StatusRegion className="min-h-[1.5rem]">
        {pending ? (
          <span className="flex items-center gap-2 text-sm text-muted">
            <Spinner size="sm" label="Mentor is thinking" />
            Thinking about your project…
          </span>
        ) : null}
        {error ? (
          <span className="text-sm font-medium text-danger">
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
