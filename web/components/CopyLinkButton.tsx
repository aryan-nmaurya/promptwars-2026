"use client";

import { useEffect, useRef, useState } from "react";

import { Button, StatusRegion } from "@/components/ui";

/** Copies the current URL, with an aria-live confirmation rather than a silent state flip. */
export function CopyLinkButton() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  async function copy(): Promise<void> {
    try {
      const shareUrl = `${window.location.origin}${window.location.pathname}`;
      await navigator.clipboard.writeText(shareUrl);
      setMessage("Read-only link copied — send it to your professor.");
    } catch {
      setMessage("Could not copy automatically. Copy the address bar instead.");
    }
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 4000);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button variant="secondary" size="sm" onClick={() => void copy()}>
        Copy read-only link
      </Button>
      <StatusRegion className="min-h-[1rem]">
        {message ? (
          <span className="font-mono text-[11px] text-amber">{message}</span>
        ) : null}
      </StatusRegion>
    </div>
  );
}
