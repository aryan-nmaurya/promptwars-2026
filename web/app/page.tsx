import { IdeaForm } from "@/components/IdeaForm";
import { Card } from "@/components/ui";

const STEPS = [
  { title: "Describe yourself", body: "Your interests and the skills you already have." },
  { title: "Pick an idea", body: "Three tailored ideas, each scored for feasibility." },
  { title: "Build it", body: "A phased roadmap you tick off, plus a mentor that knows your project." },
] as const;

/** Server Component - only the form below needs the client. */
export default function HomePage() {
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          Turn what you know into a final-year project you can finish
        </h1>
        <p className="max-w-2xl text-base text-muted">
          Describe your interests and skills. IdeaForge generates three scoped project
          ideas, builds a phased roadmap for the one you choose, and gives you an AI
          mentor that knows that exact project.
        </p>
      </section>

      <Card title="Start here" as="h2">
        <IdeaForm />
      </Card>

      <section aria-labelledby="how" className="flex flex-col gap-4">
        <h2 id="how" className="text-lg font-semibold text-fg">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-card border border-border bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Step {index + 1}
              </p>
              <h3 className="mt-1 font-semibold text-fg">{step.title}</h3>
              <p className="mt-1 text-sm text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
