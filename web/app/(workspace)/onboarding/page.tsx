"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { InterestStep } from "@/components/onboarding/InterestStep";
import { MAX_PAYLOAD_LENGTH } from "@/components/onboarding/PayloadMeter";
import type { Proficiency } from "@/components/onboarding/ProficiencyToggle";
import { ReviewStep } from "@/components/onboarding/ReviewStep";
import { SkillStep } from "@/components/onboarding/SkillStep";
import { LIMIT_REACHED, MAX_CUSTOM_TAGS } from "@/components/onboarding/steps";
import { StatusRegion } from "@/components/ui";
import { api, toErrorMessage, type IdeaSet } from "@/lib/api";

type Step = 1 | 2 | 3;

const STEP_NAMES: Record<Step, string> = {
  1: "Interests",
  2: "Skills & Proficiency",
  3: "Review & Scope",
};

/** `name (proficiency)`, comma-separated — the shape the prompt expects. */
function serializeSkills(skills: Record<string, Proficiency>): string {
  return Object.entries(skills)
    .map(([name, proficiency]) => `${name} (${proficiency})`)
    .join(", ");
}

/**
 * Three steps, one piece of state each, and one POST at the end.
 *
 * The per-step markup lives in `components/onboarding/*` so this file is only
 * the state machine: what is selected, what would overflow the generator's
 * 500-character budget, and where to go next.
 */
export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const headingRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [customInterests, setCustomInterests] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<Record<string, Proficiency>>({});
  const [customSkills, setCustomSkills] = useState<string[]>([]);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitWarning, setLimitWarning] = useState<string | null>(null);

  const allInterests = [...selectedInterests, ...customInterests];
  const serializedInterests = allInterests.join(", ");
  const serializedSkills = serializeSkills(selectedSkills);

  /**
   * Move focus to the new step. Without this a keyboard or screen-reader user
   * who presses "Continue" is left on a button that no longer exists, at the
   * bottom of a page whose entire contents just changed.
   */
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  function goTo(next: Step) {
    setLimitWarning(null);
    setStep(next);
  }

  function fits(candidate: string): boolean {
    if (candidate.length <= MAX_PAYLOAD_LENGTH) return true;
    setLimitWarning(LIMIT_REACHED);
    return false;
  }

  function toggleInterest(interest: string) {
    setLimitWarning(null);
    if (selectedInterests.includes(interest)) {
      setSelectedInterests((current) => current.filter((item) => item !== interest));
      return;
    }
    if (!fits([...allInterests, interest].join(", "))) return;
    setSelectedInterests((current) => [...current, interest]);
  }

  function addCustomInterest(interest: string) {
    setLimitWarning(null);
    if (customInterests.length >= MAX_CUSTOM_TAGS) {
      setLimitWarning(`Maximum ${MAX_CUSTOM_TAGS} custom interests reached.`);
      return;
    }
    if (allInterests.some((item) => item.toLowerCase() === interest.toLowerCase())) return;
    if (!fits([...allInterests, interest].join(", "))) return;
    setCustomInterests((current) => [...current, interest]);
  }

  function removeCustomInterest(interest: string) {
    setLimitWarning(null);
    setCustomInterests((current) => current.filter((item) => item !== interest));
  }

  function toggleSkill(skill: string) {
    setLimitWarning(null);
    if (selectedSkills[skill]) {
      const next = { ...selectedSkills };
      delete next[skill];
      setSelectedSkills(next);
      return;
    }
    const next: Record<string, Proficiency> = { ...selectedSkills, [skill]: "comfortable" };
    if (!fits(serializeSkills(next))) return;
    setSelectedSkills(next);
  }

  function setSkillProficiency(skill: string, proficiency: Proficiency) {
    setSelectedSkills((current) =>
      current[skill] ? { ...current, [skill]: proficiency } : current,
    );
  }

  function addCustomSkill(skill: string) {
    setLimitWarning(null);
    if (customSkills.length >= MAX_CUSTOM_TAGS) {
      setLimitWarning(`Maximum ${MAX_CUSTOM_TAGS} custom skills reached.`);
      return;
    }
    if (Object.keys(selectedSkills).some((item) => item.toLowerCase() === skill.toLowerCase())) {
      return;
    }
    const next: Record<string, Proficiency> = { ...selectedSkills, [skill]: "comfortable" };
    if (!fits(serializeSkills(next))) return;
    setSelectedSkills(next);
    setCustomSkills((current) => [...current, skill]);
  }

  function removeCustomSkill(skill: string) {
    setLimitWarning(null);
    setSelectedSkills((current) => {
      const next = { ...current };
      delete next[skill];
      return next;
    });
    setCustomSkills((current) => current.filter((item) => item !== skill));
  }

  async function generate(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      // Generation falls through up to five models under the backend's 45s
      // budget, so the browser must outwait it rather than abort a request
      // that is still running and leave an orphaned idea set behind.
      const set = await api.post<IdeaSet>(
        "/ideas",
        { interests: serializedInterests, skills: serializedSkills },
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
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between font-mono text-xs text-ink-muted">
          <span className="uppercase tracking-widest text-amber">Step {step} of 3</span>
          <span>{STEP_NAMES[step]}</span>
        </div>
        <div
          role="progressbar"
          aria-label="Onboarding progress"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={3}
          aria-valuetext={`Step ${step} of 3: ${STEP_NAMES[step]}`}
          className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className="h-full bg-amber transition-[width] duration-220 ease-out"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
      </div>

      <StatusRegion className="sr-only">
        {step === 1 ? `${allInterests.length} interests selected.` : null}
        {step === 2 ? `${Object.keys(selectedSkills).length} skills selected.` : null}
      </StatusRegion>

      <div ref={headingRef} tabIndex={-1} className="focus-visible:outline">
        {step === 1 ? (
          <InterestStep
            selected={selectedInterests}
            custom={customInterests}
            serialized={serializedInterests}
            warning={limitWarning}
            onToggle={toggleInterest}
            onAddCustom={addCustomInterest}
            onRemoveCustom={removeCustomInterest}
            onContinue={() => goTo(2)}
          />
        ) : null}

        {step === 2 ? (
          <SkillStep
            selected={selectedSkills}
            custom={customSkills}
            serialized={serializedSkills}
            warning={limitWarning}
            onToggle={toggleSkill}
            onSetProficiency={setSkillProficiency}
            onAddCustom={addCustomSkill}
            onRemoveCustom={removeCustomSkill}
            onBack={() => goTo(1)}
            onContinue={() => goTo(3)}
          />
        ) : null}

        {step === 3 ? (
          <ReviewStep
            interests={serializedInterests}
            skills={serializedSkills}
            pending={pending}
            error={error}
            onBack={() => goTo(2)}
            onGenerate={generate}
          />
        ) : null}
      </div>
    </div>
  );
}
