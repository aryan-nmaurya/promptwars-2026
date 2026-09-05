import { RecentProjects } from "@/components/RecentProjects";

export const metadata = { title: "My projects" };

/** Account-scoped when signed in, device-local when not. Never globally enumerable. */
export default function ProjectsPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-widest text-amber">Private index</p>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">My projects</h1>
        <p className="text-sm text-ink-muted">
          Signed in, these are your account&rsquo;s projects and follow you to any device.
          Signed out, only projects created in this browser appear. A shared project URL is
          always read-only for anyone else.
        </p>
      </header>
      <RecentProjects />
    </div>
  );
}
