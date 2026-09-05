import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Space_Grotesk } from "next/font/google";
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
    "Turn your interests and skills into a scoped final-year project, then compare the plan with evidence in your GitHub repository.";

export const metadata: Metadata = {
  metadataBase: new URL("https://promptwars-web.vercel.app"),
  title: {
    default: "ProjectPilot — AI project generator and mentor",
    template: "%s | ProjectPilot",
  },
  description: DESCRIPTION,
  applicationName: "ProjectPilot",
  openGraph: {
    title: "ProjectPilot — AI project generator and mentor",
    description: DESCRIPTION,
    type: "website",
    siteName: "ProjectPilot",
  },
  twitter: { card: "summary", title: "ProjectPilot", description: DESCRIPTION },
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
      <body className="min-h-dvh bg-bg text-ink antialiased">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
