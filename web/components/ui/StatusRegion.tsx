"use client";

import type { ReactNode } from "react";

export interface StatusRegionProps {
  /**
   * The live region is ALWAYS in the DOM, even when empty. This is the whole
   * trick: a region inserted at the same time as its content is usually not
   * announced. Render it once, then change what is inside it.
   */
  children?: ReactNode;
  className?: string;
  /** Use "assertive" only for errors that interrupt the user. */
  politeness?: "polite" | "assertive";
}

export function StatusRegion({
  children,
  className = "",
  politeness = "polite",
}: StatusRegionProps) {
  return (
    <div role="status" aria-live={politeness} aria-atomic="true" className={className}>
      {children}
    </div>
  );
}
