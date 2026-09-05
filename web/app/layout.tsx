import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Space_Grotesk } from "next/font/google";
import Link from "next/link";

import "./globals.css";

/**
 * Self-hosted at build time by next/font, so there is no runtime request to
 * Google and no layout shift. Each carries a real fallback stack.
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

const DESCRIPTION =
  "Turn your interests and skills into a scoped final-year project — three AI-generated ideas with feasibility scores, a phased roadmap you tick off, and a mentor that knows your exact project.";

export const metadata: Metadata = {
  metadataBase: new URL("https://promptwars-web.vercel.app"),
  title: {
    default: "IdeaForge — AI project generator and mentor",
    template: "%s | IdeaForge",
  },
  description: DESCRIPTION,
  applicationName: "IdeaForge",
  openGraph: {
    title: "IdeaForge — AI project generator and mentor",
    description: DESCRIPTION,
    type: "website",
    siteName: "IdeaForge",
  },
  twitter: { card: "summary", title: "IdeaForge", description: DESCRIPTION },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0d12" },
    { media: "(prefers-color-scheme: light)", color: "#faf7f1" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${plexMono.variable}`}
    >
      <body className="flex min-h-dvh flex-col">
        <a href="#main" className="skip-link">
          Skip to content
        </a>

        <header className="border-b border-surface-border">
          <nav
            aria-label="Primary"
            className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6"
          >
            <Link href="/" className="rounded font-display text-lg font-bold tracking-tight">
              Idea<span className="text-amber">Forge</span>
            </Link>
            <Link
              href="/projects"
              className="rounded font-mono text-xs uppercase tracking-widest text-ink-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Browse projects
            </Link>
          </nav>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-12"
        >
          {children}
        </main>

        <footer className="border-t border-surface-border">
          <p className="mx-auto w-full max-w-4xl px-4 py-4 font-mono text-xs text-ink-muted sm:px-6">
            IdeaForge — ideas and mentoring powered by Google Gemini.
          </p>
        </footer>
      </body>
    </html>
  );
}
