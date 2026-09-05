"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { KeyboardEvent } from "react";

import { Button, Card, Chip, GeminiBadge, Spinner, StatusRegion } from "@/components/ui";
import { api, toErrorMessage, type IdeaSet } from "@/lib/api";

const PRESET_INTERESTS = [
  "Healthcare & wellbeing",
  "Mental health",
  "Accessibility",
  "Climate & sustainability",
  "Education & learning",
  "Agriculture & food",
  "Finance & fintech",
  "Public transport & mobility",
  "Civic tech & governance",
  "Security & privacy",
  "Developer tools",
  "E-commerce & retail",
  "Sports & fitness",
  "Music & audio",
  "Gaming",
  "Social impact & NGOs",
  "Logistics & supply chain",
  "Disaster response",
  "Legal tech",
  "Space & astronomy",
] as const;

const SKILL_CATEGORIES = [
  {
    category: "Languages",
    skills: ["Python", "JavaScript", "TypeScript", "Java", "C++", "C#", "Go", "Rust", "Kotlin", "Swift", "PHP", "R", "Dart"],
  },
  {
    category: "Frontend",
    skills: ["React", "Next.js", "Vue", "Angular", "Tailwind CSS", "HTML & CSS", "Flutter", "React Native"],
  },
  {
    category: "Backend",
    skills: ["Node.js / Express", "FastAPI", "Django", "Flask", "Spring Boot", ".NET", "Laravel"],
  },
  {
    category: "Data & AI",
    skills: ["Pandas", "NumPy", "scikit-learn", "PyTorch", "TensorFlow", "OpenCV", "LangChain", "Hugging Face"],
  },
  {
    category: "Databases",
    skills: ["PostgreSQL", "MySQL", "MongoDB", "SQLite", "Redis", "Firebase", "Supabase"],
  },
  {
    category: "Infra & tools",
    skills: ["Docker", "Git & GitHub", "AWS", "GCP", "Azure", "Vercel", "Kubernetes", "CI/CD", "Linux"],
  },
] as const;

type Proficiency = "comfortable" | "learning";

const MAX_STRING_LENGTH = 500;

export default function OnboardingPage() {
  const router = useRouter();
  const liveRegionId = useId();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Interests
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [customInterests, setCustomInterests] = useState<string[]>([]);
  const [newInterestInput, setNewInterestInput] = useState("");

  // Step 2: Skills with proficiency
  const [selectedSkills, setSelectedSkills] = useState<Record<string, Proficiency>>({});
  const [customSkills, setCustomSkills] = useState<string[]>([]);
  const [newSkillInput, setNewSkillInput] = useState("");

  // Step 3: Generation state
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitWarning, setLimitWarning] = useState<string | null>(null);

  // --- Serialization ---
  const allInterests = [...selectedInterests, ...customInterests];
  const serializedInterests = allInterests.join(", ");

  const serializedSkills = Object.entries(selectedSkills)
    .map(([name, prof]) => `${name} (${prof})`)
    .join(", ");

  // --- Handlers for Step 1 ---
  function toggleInterest(interest: string) {
    setLimitWarning(null);
    if (selectedInterests.includes(interest)) {
      setSelectedInterests((prev) => prev.filter((item) => item !== interest));
      return;
    }
    const nextList = [...allInterests, interest];
    if (nextList.join(", ").length > MAX_STRING_LENGTH) {
      setLimitWarning("That's as much as the generator reads — deselect one to add another.");
      return;
    }
    setSelectedInterests((prev) => [...prev, interest]);
  }

  function addCustomInterest() {
    const trimmed = newInterestInput.replace(/,/g, "").trim();
    if (!trimmed) return;
    if (customInterests.length >= 5) {
      setLimitWarning("Maximum 5 custom interests reached.");
      return;
    }
    if (allInterests.some((i) => i.toLowerCase() === trimmed.toLowerCase())) {
      setNewInterestInput("");
      return;
    }
    const nextList = [...allInterests, trimmed];
    if (nextList.join(", ").length > MAX_STRING_LENGTH) {
      setLimitWarning("That's as much as the generator reads — deselect one to add another.");
      return;
    }
    setCustomInterests((prev) => [...prev, trimmed]);
    setNewInterestInput("");
    setLimitWarning(null);
  }

  function removeCustomInterest(tag: string) {
    setCustomInterests((prev) => prev.filter((item) => item !== tag));
    setLimitWarning(null);
  }

  // --- Handlers for Step 2 ---
  function toggleSkill(skill: string) {
    setLimitWarning(null);
    if (selectedSkills[skill]) {
      const next = { ...selectedSkills };
      delete next[skill];
      setSelectedSkills(next);
      return;
    }
    const nextObj = { ...selectedSkills, [skill]: "comfortable" as const };
    const serialized = Object.entries(nextObj)
      .map(([n, p]) => `${n} (${p})`)
      .join(", ");
    if (serialized.length > MAX_STRING_LENGTH) {
      setLimitWarning("That's as much as the generator reads — deselect one to add another.");
      return;
    }
    setSelectedSkills(nextObj);
  }

  function setSkillProficiency(skill: string, prof: Proficiency) {
    setSelectedSkills((prev) => {
      if (!prev[skill]) return prev;
      return { ...prev, [skill]: prof };
    });
  }

  function addCustomSkill() {
    const trimmed = newSkillInput.replace(/,/g, "").trim();
    if (!trimmed) return;
    if (customSkills.length >= 5) {
      setLimitWarning("Maximum 5 custom skills reached.");
      return;
    }
    if (Object.keys(selectedSkills).some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      setNewSkillInput("");
      return;
    }
    const nextObj = { ...selectedSkills, [trimmed]: "comfortable" as const };
    const serialized = Object.entries(nextObj)
      .map(([n, p]) => `${n} (${p})`)
      .join(", ");
    if (serialized.length > MAX_STRING_LENGTH) {
      setLimitWarning("That's as much as the generator reads — deselect one to add another.");
      return;
    }
    setSelectedSkills(nextObj);
    setCustomSkills((prev) => [...prev, trimmed]);
    setNewSkillInput("");
    setLimitWarning(null);
  }

  function removeCustomSkill(skill: string) {
    setSelectedSkills((prev) => {
      const next = { ...prev };
      delete next[skill];
      return next;
    });
    setCustomSkills((prev) => prev.filter((s) => s !== skill));
    setLimitWarning(null);
  }

  // --- Submission ---
  async function onGenerate(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      const set = await api.post<IdeaSet>(
        "/ideas",
        {
          interests: serializedInterests,
          skills: serializedSkills,
        },
        { timeoutMs: 55_000 },
      );
      router.push(`/ideas/${set.id}`);
    } catch (cause: unknown) {
      setError(toErrorMessage(cause));
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      {/* Progress Bar & Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between font-mono text-xs text-ink-muted">
          <span className="uppercase tracking-widest text-amber">Step {step} of 3</span>
          <span>{step === 1 ? "Interests" : step === 2 ? "Skills & Proficiency" : "Review & Scope"}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={3}>
          <div
            className="h-full bg-amber transition-[width] duration-220 ease-out"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
      </div>

      {/* Live Region for Screen Readers */}
      <div id={liveRegionId} className="sr-only" aria-live="polite">
        {step === 1 && `${allInterests.length} interests selected.`}
        {step === 2 && `${Object.keys(selectedSkills).length} skills selected.`}
      </div>

      {/* STEP 1: What are you interested in? */}
      {step === 1 && (
        <section className="flex flex-col gap-6">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              What are you interested in?
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Select problem spaces you actually care about. Pick at least one.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {PRESET_INTERESTS.map((interest) => {
              const isSelected = selectedInterests.includes(interest);
              return (
                <Chip
                  key={interest}
                  selected={isSelected}
                  onClick={() => toggleInterest(interest)}
                >
                  {interest}
                </Chip>
              );
            })}

            {customInterests.map((custom) => (
              <Chip
                key={custom}
                selected
                onRemove={() => removeCustomInterest(custom)}
                removeLabel={`Remove custom interest ${custom}`}
              >
                {custom}
              </Chip>
            ))}
          </div>

          {/* Add custom interest */}
          <div className="flex flex-col gap-2 pt-2">
            <label htmlFor="custom-interest-input" className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
              Add your own (up to 5)
            </label>
            <div className="flex gap-2 sm:max-w-md">
              <input
                id="custom-interest-input"
                type="text"
                maxLength={40}
                value={newInterestInput}
                onChange={(e) => setNewInterestInput(e.target.value)}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addCustomInterest();
                  }
                }}
                placeholder="e.g. quantum algorithms, bio-informatics"
                className="h-10 flex-1 rounded-md border border-control-border bg-surface px-3 text-sm text-ink placeholder:text-ink-muted focus-visible:outline"
              />
              <Button
                variant="secondary"
                size="md"
                onClick={addCustomInterest}
                disabled={!newInterestInput.trim()}
              >
                Add
              </Button>
            </div>
          </div>

          {/* Character counter & warnings */}
          <div className="flex items-center justify-between border-t border-surface-border pt-4 text-xs font-mono">
            <span className={serializedInterests.length > 450 ? "text-amber font-semibold" : "text-ink-muted"}>
              {serializedInterests.length} / {MAX_STRING_LENGTH} chars
            </span>
            {limitWarning && <span className="text-danger font-sans">{limitWarning}</span>}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              size="lg"
              disabled={allInterests.length === 0}
              onClick={() => {
                setLimitWarning(null);
                setStep(2);
              }}
            >
              Continue to skills →
            </Button>
          </div>
        </section>
      )}

      {/* STEP 2: What can you already build with? */}
      {step === 2 && (
        <section className="flex flex-col gap-6">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              What can you already build with?
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Select languages, frameworks and tools you know. Specify whether you are comfortable or still learning.
            </p>
          </div>

          <div className="flex flex-col gap-6">
            {SKILL_CATEGORIES.map(({ category, skills }) => (
              <fieldset key={category} className="flex flex-col gap-2.5">
                <legend className="font-mono text-xs uppercase tracking-widest text-amber">
                  {category}
                </legend>
                <div className="flex flex-wrap gap-2.5">
                  {skills.map((skill) => {
                    const isSelected = Boolean(selectedSkills[skill]);
                    const proficiency = selectedSkills[skill] || "comfortable";
                    return (
                      <div key={skill} className="inline-flex items-center gap-1">
                        <Chip
                          selected={isSelected}
                          onClick={() => toggleSkill(skill)}
                        >
                          {skill}
                        </Chip>
                        {isSelected && (
                          <div
                            className="flex h-[40px] items-center rounded-md border border-amber/40 bg-surface px-1 text-xs"
                            role="group"
                            aria-label={`${skill} proficiency level`}
                          >
                            <button
                              type="button"
                              onClick={() => setSkillProficiency(skill, "comfortable")}
                              aria-pressed={proficiency === "comfortable"}
                              className={`rounded px-2 py-1 transition-colors ${
                                proficiency === "comfortable"
                                  ? "bg-amber text-amber-ink font-semibold"
                                  : "text-ink-muted hover:text-ink"
                              }`}
                            >
                              Comfortable
                            </button>
                            <button
                              type="button"
                              onClick={() => setSkillProficiency(skill, "learning")}
                              aria-pressed={proficiency === "learning"}
                              className={`rounded px-2 py-1 transition-colors ${
                                proficiency === "learning"
                                  ? "bg-amber text-amber-ink font-semibold"
                                  : "text-ink-muted hover:text-ink"
                              }`}
                            >
                              Learning
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ))}

            {/* Custom skill chips */}
            {customSkills.length > 0 && (
              <fieldset className="flex flex-col gap-2.5">
                <legend className="font-mono text-xs uppercase tracking-widest text-amber">
                  Custom skills
                </legend>
                <div className="flex flex-wrap gap-2.5">
                  {customSkills.map((skill) => {
                    const proficiency = selectedSkills[skill] || "comfortable";
                    return (
                      <div key={skill} className="inline-flex items-center gap-1">
                        <Chip
                          selected
                          onRemove={() => removeCustomSkill(skill)}
                          removeLabel={`Remove custom skill ${skill}`}
                        >
                          {skill}
                        </Chip>
                        <div
                          className="flex h-[40px] items-center rounded-md border border-amber/40 bg-surface px-1 text-xs"
                          role="group"
                          aria-label={`${skill} proficiency level`}
                        >
                          <button
                            type="button"
                            onClick={() => setSkillProficiency(skill, "comfortable")}
                            aria-pressed={proficiency === "comfortable"}
                            className={`rounded px-2 py-1 transition-colors ${
                              proficiency === "comfortable"
                                ? "bg-amber text-amber-ink font-semibold"
                                : "text-ink-muted hover:text-ink"
                            }`}
                          >
                            Comfortable
                          </button>
                          <button
                            type="button"
                            onClick={() => setSkillProficiency(skill, "learning")}
                            aria-pressed={proficiency === "learning"}
                            className={`rounded px-2 py-1 transition-colors ${
                              proficiency === "learning"
                                ? "bg-amber text-amber-ink font-semibold"
                                : "text-ink-muted hover:text-ink"
                            }`}
                          >
                            Learning
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            )}
          </div>

          {/* Add custom skill */}
          <div className="flex flex-col gap-2 pt-2">
            <label htmlFor="custom-skill-input" className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
              Add custom tool or library (up to 5)
            </label>
            <div className="flex gap-2 sm:max-w-md">
              <input
                id="custom-skill-input"
                type="text"
                maxLength={40}
                value={newSkillInput}
                onChange={(e) => setNewSkillInput(e.target.value)}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addCustomSkill();
                  }
                }}
                placeholder="e.g. WebAssembly, ClickHouse"
                className="h-10 flex-1 rounded-md border border-control-border bg-surface px-3 text-sm text-ink placeholder:text-ink-muted focus-visible:outline"
              />
              <Button
                variant="secondary"
                size="md"
                onClick={addCustomSkill}
                disabled={!newSkillInput.trim()}
              >
                Add
              </Button>
            </div>
          </div>

          {/* Character counter & warnings */}
          <div className="flex items-center justify-between border-t border-surface-border pt-4 text-xs font-mono">
            <span className={serializedSkills.length > 450 ? "text-amber font-semibold" : "text-ink-muted"}>
              {serializedSkills.length} / {MAX_STRING_LENGTH} chars
            </span>
            {limitWarning && <span className="text-danger font-sans">{limitWarning}</span>}
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                setLimitWarning(null);
                setStep(1);
              }}
            >
              ← Back to interests
            </Button>
            <Button
              size="lg"
              disabled={Object.keys(selectedSkills).length === 0}
              onClick={() => {
                setLimitWarning(null);
                setStep(3);
              }}
            >
              Review prompt →
            </Button>
          </div>
        </section>
      )}

      {/* STEP 3: Review & Generate */}
      {step === 3 && (
        <section className="flex flex-col gap-6">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              Review your prompt
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              Here is the exact prompt that will be sent to Gemini to generate your 3 tailored project ideas.
            </p>
          </div>

          <Card title="Interests payload" as="h2">
            <div className="flex flex-col gap-2">
              <pre className="overflow-x-auto rounded-md border border-surface-border bg-bg p-3 font-mono text-xs text-ink whitespace-pre-wrap break-words">
                {serializedInterests || "(none selected)"}
              </pre>
              <p className="font-mono text-right text-[11px] text-ink-muted">
                {serializedInterests.length} / {MAX_STRING_LENGTH} characters
              </p>
            </div>
          </Card>

          <Card title="Skills & proficiency payload" as="h2">
            <div className="flex flex-col gap-2">
              <pre className="overflow-x-auto rounded-md border border-surface-border bg-bg p-3 font-mono text-xs text-ink whitespace-pre-wrap break-words">
                {serializedSkills || "(none selected)"}
              </pre>
              <p className="font-mono text-right text-[11px] text-ink-muted">
                {serializedSkills.length} / {MAX_STRING_LENGTH} characters
              </p>
            </div>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-surface-border pt-4">
            <Button
              variant="secondary"
              size="lg"
              disabled={pending}
              onClick={() => setStep(2)}
            >
              ← Edit skills
            </Button>

            <div className="flex items-center gap-3">
              <Button
                size="lg"
                loading={pending}
                loadingLabel="Generating ideas"
                onClick={onGenerate}
              >
                {pending ? "Generating ideas…" : "Generate 3 project ideas"}
              </Button>
              <GeminiBadge />
            </div>
          </div>

          <StatusRegion className="min-h-[2rem]">
            {pending ? (
              <span className="flex items-center gap-2 text-sm text-ink-muted">
                <Spinner size="sm" label="Generating ideas" />
                Asking Gemini for ideas tailored to your stack. This takes a few seconds.
              </span>
            ) : null}
            {error ? (
              <span className="text-sm font-medium text-danger">
                <span aria-hidden="true">✕ </span>
                {error}
              </span>
            ) : null}
          </StatusRegion>
        </section>
      )}
    </div>
  );
}
