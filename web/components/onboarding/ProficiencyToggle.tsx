"use client";

export type Proficiency = "comfortable" | "learning";

const LEVELS: readonly { value: Proficiency; label: string }[] = [
  { value: "comfortable", label: "Comfortable" },
  { value: "learning", label: "Learning" },
];

/**
 * "Do you know this, or are you still learning it?" for one selected skill.
 *
 * Grouped and named so a screen reader announces which skill the pair belongs
 * to; state is carried by `aria-pressed` and by the visible label, never by
 * the fill colour alone.
 */
export function ProficiencyToggle({
  skill,
  value,
  onChange,
}: {
  skill: string;
  value: Proficiency;
  onChange: (next: Proficiency) => void;
}) {
  return (
    <div
      role="group"
      aria-label={`${skill} proficiency level`}
      className="flex h-[40px] items-center rounded-md border border-amber/40 bg-surface px-1 text-xs"
    >
      {LEVELS.map((level) => (
        <button
          key={level.value}
          type="button"
          onClick={() => onChange(level.value)}
          aria-pressed={value === level.value}
          className={`rounded px-2 py-1 transition-colors ${
            value === level.value
              ? "bg-amber font-semibold text-amber-ink"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          {level.label}
        </button>
      ))}
    </div>
  );
}
