"use client";

import { useState } from "react";
import type { KeyboardEvent } from "react";

import { Button } from "@/components/ui";

/**
 * "Add your own" for both interests and skills — the two steps had a
 * byte-identical copy of this input, its Enter/comma handling and its Add
 * button.
 */
export function AddCustomTag({
  id,
  label,
  placeholder,
  onAdd,
}: {
  id: string;
  label: string;
  placeholder: string;
  onAdd: (value: string) => void;
}) {
  const [draft, setDraft] = useState("");

  function submit() {
    // Commas separate tags in the serialized payload, so one inside a tag
    // would silently split it in two.
    const trimmed = draft.replace(/,/g, "").trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2 pt-2">
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </label>
      <div className="flex gap-2 sm:max-w-md">
        <input
          id={id}
          type="text"
          maxLength={40}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className="h-10 flex-1 rounded-md border border-control-border bg-surface px-3 text-sm text-ink placeholder:text-ink-muted focus-visible:outline"
        />
        <Button variant="secondary" size="md" onClick={submit} disabled={!draft.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}
