import Link from "next/link";

import { Button } from "@/components/ui";

export const metadata = { title: "Not found" };

/**
 * The global 404 renders under the root layout only, so it has to supply its
 * own `<main id="main">` — the skip link in that layout points at `#main`, and
 * without this the only page every mistyped URL lands on had no main landmark
 * and a skip link that went nowhere.
 */
export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-8">
      <div className="flex flex-col items-start gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-ink">This page does not exist</h1>
        <p className="max-w-prose text-sm text-ink-muted">
          The link may be mistyped, or the project it pointed to was never created.
        </p>
        <Link href="/" className="rounded">
          <Button>Start a new project</Button>
        </Link>
      </div>
    </main>
  );
}
