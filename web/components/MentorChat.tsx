"use client";

import { useEffect, useRef, useState } from "react";
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
import { api, toErrorMessage, type MentorMessage, type Page } from "@/lib/api";
import { projectEditHeaders, useProjectEditToken } from "@/lib/project-access";
import { streamMentorAnswer } from "@/lib/stream";

export function MentorChat({
  projectId,
}: {
  projectId: string;
}) {
  const editToken = useProjectEditToken(projectId);
  const [messages, setMessages] = useState<MentorMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [question, setQuestion] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (editToken === null) return;
    const controller = new AbortController();
    let cancelled = false;
    void api
      .get<Page<MentorMessage>>(`/projects/${projectId}/mentor`, {
        headers: projectEditHeaders(editToken),
        signal: controller.signal,
      })
      .then((history) => {
        if (!cancelled) setMessages(history.items);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(toErrorMessage(cause));
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [editToken, projectId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const asked = question.trim();
    if (asked.length < 3 || pending || editToken === null) return;

    setPending(true);
    setError(null);
    setStreaming("");
    setQuestion("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const done = await streamMentorAnswer(
        projectId,
        asked,
        editToken,
        (piece) => setStreaming((current) => (current ?? "") + piece),
        controller.signal,
      );
      setMessages((current) => [...current, done.question, done.answer]);
    } catch (cause: unknown) {
      const cancelled = cause instanceof DOMException && cause.name === "AbortError";
      setError(cancelled ? "Answer cancelled." : toErrorMessage(cause));
    } finally {
      abortRef.current = null;
      setStreaming(null);
      setPending(false);
      inputRef.current?.focus(); // keyboard users stay in the conversation
    }
  }

  const hasHistory = messages.length > 0 || streaming !== null;

  if (editToken === null) return null;

  return (
    <div className="flex flex-col gap-4">
      {loadingHistory ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner size="sm" label="Loading mentor history" />
          Loading your private mentor history…
        </p>
      ) : !hasHistory ? (
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
          {pending ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => abortRef.current?.abort()}
            >
              Cancel
            </Button>
          ) : null}
          <GeminiBadge label="Answers from Gemini" />
        </div>
      </form>
    </div>
  );
}
