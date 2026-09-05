import { RecentProjects } from "@/components/RecentProjects";

export const metadata = { title: "My projects" };

/** A private-on-device index: public projects are never globally enumerated. */
export default function ProjectsPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-widest text-amber">Private index</p>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">My projects</h1>
        <p className="text-sm text-ink-muted">
          Only projects created in this browser appear here. A shared project URL remains
          read-only on other devices.
        </p>
      </header>
      <RecentProjects />
    </div>
  );
}
