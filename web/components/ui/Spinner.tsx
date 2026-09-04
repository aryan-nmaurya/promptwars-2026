export interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  /** Announced to screen readers. Keep it specific: "Loading health status". */
  label?: string;
  className?: string;
}

const SIZES = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-9 w-9 border-[3px]",
} as const;

/**
 * `role="status"` makes this an implicit polite live region, so the label is
 * announced when the spinner appears. The visual ring is `aria-hidden`; the
 * text is visually hidden but present for assistive tech.
 *
 * Honours `prefers-reduced-motion` via the global rule in `globals.css`.
 */
export function Spinner({ size = "md", label = "Loading", className = "" }: SpinnerProps) {
  return (
    <span role="status" className={`inline-flex items-center ${className}`}>
      <span
        aria-hidden="true"
        className={`animate-spin rounded-full border-border-strong border-t-primary ${SIZES[size]}`}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
