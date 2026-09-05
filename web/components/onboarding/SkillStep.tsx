"use client";

import { Button, Chip } from "@/components/ui";

import { AddCustomTag } from "./AddCustomTag";
import { PayloadMeter } from "./PayloadMeter";
import { ProficiencyToggle, type Proficiency } from "./ProficiencyToggle";
import { SKILL_CATEGORIES } from "./steps";

export function SkillStep({
  selected,
  custom,
  serialized,
  warning,
  onToggle,
  onSetProficiency,
  onAddCustom,
  onRemoveCustom,
  onBack,
  onContinue,
}: {
  selected: Record<string, Proficiency>;
  custom: string[];
  serialized: string;
  warning: string | null;
  onToggle: (skill: string) => void;
  onSetProficiency: (skill: string, proficiency: Proficiency) => void;
  onAddCustom: (skill: string) => void;
  onRemoveCustom: (skill: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          What can you already build with?
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Select languages, frameworks and tools you know. Specify whether you are comfortable or
          still learning.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {SKILL_CATEGORIES.map(({ category, skills }) => (
          <fieldset key={category} className="flex flex-col gap-2.5">
            <legend className="font-mono text-xs uppercase tracking-widest text-amber">
              {category}
            </legend>
            <div className="flex flex-wrap gap-2.5">
              {skills.map((skill) => (
                <div key={skill} className="inline-flex items-center gap-1">
                  <Chip selected={Boolean(selected[skill])} onClick={() => onToggle(skill)}>
                    {skill}
                  </Chip>
                  {selected[skill] ? (
                    <ProficiencyToggle
                      skill={skill}
                      value={selected[skill]}
                      onChange={(next) => onSetProficiency(skill, next)}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </fieldset>
        ))}

        {custom.length > 0 ? (
          <fieldset className="flex flex-col gap-2.5">
            <legend className="font-mono text-xs uppercase tracking-widest text-amber">
              Custom skills
            </legend>
            <div className="flex flex-wrap gap-2.5">
              {custom.map((skill) => (
                <div key={skill} className="inline-flex items-center gap-1">
                  <Chip
                    selected
                    onRemove={() => onRemoveCustom(skill)}
                    removeLabel={`Remove custom skill ${skill}`}
                  >
                    {skill}
                  </Chip>
                  <ProficiencyToggle
                    skill={skill}
                    value={selected[skill] ?? "comfortable"}
                    onChange={(next) => onSetProficiency(skill, next)}
                  />
                </div>
              ))}
            </div>
          </fieldset>
        ) : null}
      </div>

      <AddCustomTag
        id="custom-skill-input"
        label="Add custom tool or library (up to 5)"
        placeholder="e.g. WebAssembly, ClickHouse"
        onAdd={onAddCustom}
      />

      <PayloadMeter value={serialized} warning={warning} />

      <div className="flex items-center justify-between pt-2">
        <Button variant="secondary" size="lg" onClick={onBack}>
          ← Back to interests
        </Button>
        <Button size="lg" disabled={Object.keys(selected).length === 0} onClick={onContinue}>
          Review prompt →
        </Button>
      </div>
    </section>
  );
}
