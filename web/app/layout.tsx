import type { Metadata, Viewport } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "IdeaForge — AI project generator and mentor",
    template: "%s | IdeaForge",
  },
  description:
    "Turn your interests and skills into a scoped final-year project, with a phased roadmap and an AI mentor that knows your exact project.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col bg-bg text-fg">
        <a href="#main" className="skip-link">
          Skip to content
        </a>

        <header className="border-b border-border">
          <nav aria-label="Primary" className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Link href="/" className="rounded font-semibold tracking-tight text-fg">
              Idea<span className="text-primary">Forge</span>
            </Link>
            <Link href="/projects" className="rounded text-sm font-medium text-primary underline-offset-4 hover:underline">
              Browse projects
            </Link>
          </nav>
        </header>

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
          {children}
        </main>

        <footer className="border-t border-border">
          <div className="mx-auto w-full max-w-4xl px-4 py-4 text-xs text-muted sm:px-6">
            IdeaForge — project ideas and mentoring powered by Google Gemini.
          </div>
        </footer>
      </body>
    </html>
  );
}
