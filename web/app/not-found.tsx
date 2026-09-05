import Link from "next/link";

import { Button } from "@/components/ui";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-bold tracking-tight text-fg">This page does not exist</h1>
      <p className="max-w-prose text-sm text-muted">
        The link may be mistyped, or the project it pointed to was never created.
      </p>
      <Link href="/" className="rounded">
        <Button>Start a new project</Button>
      </Link>
    </div>
  );
}
