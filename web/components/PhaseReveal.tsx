"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * One-time fade-up as a phase scrolls into view.
 *
 * Fail-safe by construction: the CSS leaves `.reveal` fully visible, and JS
 * opts an element into the animation only when it starts below the fold. If
 * JavaScript never runs, throws, or the observer never fires, the roadmap is
 * still readable — a decorative animation must never be able to hide content.
 */
export function PhaseReveal({ index, children }: { index: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (node === null) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") return;

    // Only animate what starts below the fold. Anything already on screen
    // stays visible, which avoids a visible->hidden->visible flash.
    if (node.getBoundingClientRect().top <= window.innerHeight) return;
    node.classList.add("will-reveal");

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
