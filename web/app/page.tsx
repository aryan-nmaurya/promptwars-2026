import { IdeaForm } from "@/components/IdeaForm";
import { Card } from "@/components/ui";

const STEPS = [
  { title: "Scope it", body: "Choose a feasible idea with explicit core features and stretch goals." },
  { title: "Build it", body: "Follow a phased roadmap and ask a mentor that knows your project." },
  { title: "Prove it", body: "Compare your plan with repository evidence and fix the biggest gaps." },
] as const;

/** Server Component - only the form below needs the client. */
export default function HomePage() {
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Turn what you know into a final-year project you can finish
        </h1>
        <p className="max-w-2xl text-base text-ink-muted">
          Describe your interests and skills. IdeaForge generates three scoped project
          ideas, freezes a realistic scope, and later checks your GitHub repository to
          show what is implemented, partial, or still missing.
        </p>
      </section>

      <Card title="Start here" as="h2">
        <IdeaForm />
      </Card>

      <section aria-labelledby="how" className="flex flex-col gap-4">
        <h2 id="how" className="text-lg font-semibold text-ink">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-card border border-surface-border bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber">
                Step {index + 1}
              </p>
              <h3 className="mt-1 font-semibold text-ink">{step.title}</h3>
              <p className="mt-1 text-sm text-ink-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
