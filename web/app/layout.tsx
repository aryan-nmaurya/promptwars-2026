import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Starter",
    template: "%s | Starter",
  },
  description: "Hackathon starter. Replace this description with your product.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Follows the OS theme; the token palette covers both.
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
      <body className="min-h-dvh bg-bg text-fg">
        {/* First focusable element on the page, per WCAG 2.4.1. */}
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
          {children}
        </main>
      </body>
    </html>
  );
}
