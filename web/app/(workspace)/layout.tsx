"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

import { GeminiStatusCard } from "@/components/GeminiStatusCard";
import { signOut, useSession } from "@/lib/auth";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, status } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerTitleId = useId();

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  /**
   * Modal behaviour, done by hand because this is a plain element rather than
   * a <dialog>: focus moves in on open, Tab is trapped inside while it is
   * open, Escape closes it, and focus returns to the button that opened it.
   * Without the last part a keyboard user is dropped at the top of the
   * document every time they dismiss the menu.
   */
  useEffect(() => {
    if (!drawerOpen) return;
    const opener = toggleRef.current;
    const panel = drawerRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        return;
      }
      if (event.key !== "Tab" || panel === null) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, [drawerOpen]);

  const isProjectPage = pathname.startsWith("/projects/") && pathname !== "/projects";

  const navItems = [
    {
      title: "Overview",
      desc: "Scope and frozen promises",
      href: isProjectPage ? `${pathname}#overview` : "/projects",
      active: pathname === "/projects",
      icon: (
        <svg aria-hidden="true" className="h-5 w-5 stroke-current" fill="none" viewBox="0 0 24 24" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
        </svg>
      ),
    },
    {
      title: "Roadmap",
      desc: "Phased build plan",
      href: isProjectPage ? `${pathname}#roadmap` : "/onboarding",
      active: pathname === "/onboarding",
      icon: (
        <svg aria-hidden="true" className="h-5 w-5 stroke-current" fill="none" viewBox="0 0 24 24" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      ),
    },
    {
      title: "Evaluation",
      desc: "Planned vs built",
      href: isProjectPage ? `${pathname}#evaluation` : "/projects",
      active: false,
      icon: (
        <svg aria-hidden="true" className="h-5 w-5 stroke-current" fill="none" viewBox="0 0 24 24" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
      ),
    },
    {
      title: "Mentor",
      desc: "Project-aware guidance",
      href: isProjectPage ? `${pathname}#mentor` : "/projects",
      active: false,
      icon: (
        <svg aria-hidden="true" className="h-5 w-5 stroke-current" fill="none" viewBox="0 0 24 24" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
        </svg>
      ),
    },
  ];

  const sidebarContent = (
    <div className="flex h-full flex-col p-4">
      {/* Brand block */}
      <div className="flex items-center gap-3 border-b border-surface-border pb-4">
        <Link href="/" className="flex items-center gap-3 focus-visible:outline">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber/30 bg-amber/10 font-mono text-sm font-bold text-amber">
            PP
          </div>
          <div>
            <span className="font-display text-base font-bold tracking-tight text-ink sm:text-lg">
              Project<span className="text-amber">Pilot</span>
            </span>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
              Project Desk
            </p>
          </div>
        </Link>
      </div>

      {/* Section label */}
      <div className="mt-5 px-2">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
          My Workspace
        </p>
      </div>

      {/* Nav items */}
      <nav aria-label="Workspace" className="mt-2 flex flex-col gap-1.5">
        <ul className="flex flex-col gap-1.5">
          {navItems.map((item) => (
            <li key={item.title}>
              <Link
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={[
                  "group flex items-center gap-3 rounded-lg p-2.5 transition-colors focus-visible:outline",
                  item.active
                    ? "border border-surface-border bg-surface text-ink"
                    : "text-ink-muted hover:border-surface-border/80 hover:bg-surface/50 hover:text-ink",
                ].join(" ")}
              >
                <div
                  className={[
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                    item.active
                      ? "border border-amber/30 bg-amber/10 text-amber"
                      : "border border-surface-border bg-surface text-ink-muted group-hover:text-ink",
                  ].join(" ")}
                >
                  {item.icon}
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-medium leading-snug text-ink">{item.title}</span>
                  <span className="truncate text-xs text-ink-muted">{item.desc}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom block pinned with mt-auto */}
      <div className="mt-auto flex flex-col gap-3 border-t border-surface-border pt-4">
        <div className="flex flex-col gap-1 text-xs">
          <Link
            href="/onboarding"
            className="flex items-center gap-2 rounded-md px-2.5 py-2 text-ink-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-control-border text-xs">
              +
            </span>
            <span>New project plan</span>
          </Link>

          <Link
            href="/projects"
            className="flex items-center gap-2 rounded-md px-2.5 py-2 text-ink-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-control-border text-xs">
              ▤
            </span>
            <span>All local projects</span>
          </Link>
        </div>

        <GeminiStatusCard />

        {/* User / Auth status */}
        <div className="flex items-center justify-between px-1 pt-1 text-xs">
          {status === "authenticated" && user ? (
            <div className="flex w-full items-center justify-between gap-2 overflow-hidden">
              <span className="truncate font-mono text-[11px] text-ink-muted" title={user.email}>
                {user.email}
              </span>
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  router.push("/login");
                }}
                className="shrink-0 rounded text-[11px] text-amber underline-offset-4 hover:underline focus-visible:outline"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex w-full items-center justify-between text-ink-muted">
              <span>Read-only view</span>
              <Link href="/login" className="text-amber underline-offset-4 hover:underline">
                Sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink lg:flex-row">
      {/* Mobile Top Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-surface-border bg-bg/95 px-4 py-3 backdrop-blur-md lg:hidden">
        <Link href="/" className="flex items-center gap-2 font-display font-bold text-ink">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-amber/30 bg-amber/10 font-mono text-xs text-amber">
            PP
          </span>
          <span>
            Project<span className="text-amber">Pilot</span>
          </span>
        </Link>
        <button
          ref={toggleRef}
          type="button"
          onClick={() => setDrawerOpen((prev) => !prev)}
          aria-label={drawerOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={drawerOpen}
          aria-haspopup="dialog"
          className="rounded-md border border-control-border bg-surface p-2 text-ink focus-visible:outline"
        >
          <svg aria-hidden="true" className="h-5 w-5 stroke-current" fill="none" viewBox="0 0 24 24" strokeWidth="1.5">
            {drawerOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            )}
          </svg>
        </button>
      </header>

      {/* Mobile Drawer Backdrop & Slide-over */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Pointer-only dismissal. It is deliberately out of the
              accessibility tree: keyboard users get Escape and the explicit
              close button below, and a second control sharing the same name
              would just be a decoy in the tab order. */}
          <div
            aria-hidden="true"
            onClick={closeDrawer}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={drawerTitleId}
            className="absolute inset-y-0 left-0 flex h-full w-[280px] flex-col overflow-y-auto border-r border-surface-border bg-bg"
          >
            <h2 id={drawerTitleId} className="sr-only">
              Workspace navigation
            </h2>
            {/* Inside the trap, so the dismiss control is always reachable:
                the header toggle sits outside the dialog and cannot be
                tabbed to while it is open. */}
            <div className="flex justify-end px-4 pt-4">
              <button
                type="button"
                onClick={closeDrawer}
                className="rounded-md border border-control-border bg-surface px-2.5 py-1.5 text-xs text-ink focus-visible:outline"
              >
                <span aria-hidden="true">✕ </span>
                Close menu
              </button>
            </div>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop Persistent Sidebar (260px) */}
      <aside className="hidden w-[260px] shrink-0 border-r border-surface-border bg-bg lg:block">
        <div className="sticky top-0 h-screen">{sidebarContent}</div>
      </aside>

      {/* Main Content Area */}
      <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto w-full max-w-4xl">{children}</div>
      </main>
    </div>
  );
}
