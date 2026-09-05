"use client";

import { Button, Chip } from "@/components/ui";

import { AddCustomTag } from "./AddCustomTag";
import { PayloadMeter } from "./PayloadMeter";
import { PRESET_INTERESTS } from "./steps";

export function InterestStep({
  selected,
  custom,
  serialized,
  warning,
  onToggle,
  onAddCustom,
  onRemoveCustom,
  onContinue,
}: {
  selected: string[];
  custom: string[];
  serialized: string;
  warning: string | null;
  onToggle: (interest: string) => void;
  onAddCustom: (interest: string) => void;
  onRemoveCustom: (interest: string) => void;
  onContinue: () => void;
}) {
  const total = selected.length + custom.length;

  return (
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
        {PRESET_INTERESTS.map((interest) => (
          <Chip
            key={interest}
            selected={selected.includes(interest)}
            onClick={() => onToggle(interest)}
          >
            {interest}
          </Chip>
        ))}

        {custom.map((interest) => (
          <Chip
            key={interest}
            selected
            onRemove={() => onRemoveCustom(interest)}
            removeLabel={`Remove custom interest ${interest}`}
          >
            {interest}
          </Chip>
        ))}
      </div>

      <AddCustomTag
        id="custom-interest-input"
        label="Add your own (up to 5)"
        placeholder="e.g. quantum algorithms, bio-informatics"
        onAdd={onAddCustom}
      />

      <PayloadMeter value={serialized} warning={warning} />

      <div className="flex justify-end pt-2">
        <Button size="lg" disabled={total === 0} onClick={onContinue}>
          Continue to skills →
        </Button>
      </div>
    </section>
  );
}
