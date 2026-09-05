"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * One-time fade-up as a phase scrolls into view.
 *
 * Purely additive: the content is in the DOM and readable from the first
 * paint, and if IntersectionObserver is missing or the user prefers reduced
 * motion, the element is simply shown immediately.
 */
export function PhaseReveal({ index, children }: { index: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (node === null) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      node.classList.add("is-visible");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            node.classList.add("is-visible");
            observer.disconnect(); // one-time
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="reveal" style={{ transitionDelay: `${Math.min(index, 5) * 90}ms` }}>
      {children}
    </div>
  );
}
