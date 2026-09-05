import type { ReactNode } from "react";

export interface CardProps {
  children: ReactNode;
  className?: string;
  /** Optional heading rendered above the content. */
  title?: string;
  /** Heading level. Pick what fits the page outline, not what looks right. */
  as?: "h2" | "h3" | "h4";
  description?: ReactNode;
  footer?: ReactNode;
}

/**
 * A plain server component - no hooks, no generated ids, so it renders
 * identically on server and client.
 *
 * The `<section>` is deliberately left unnamed: an unnamed section is not
 * exposed as a landmark, and the heading inside already gives screen-reader
 * users a navigation target. If you need it announced as a named region, pass
 * your own `aria-labelledby` from the caller.
 */
export function Card({
  children,
  className = "",
  title,
  as: Heading = "h2",
  description,
  footer,
}: CardProps) {
  return (
    <section className={["rounded-card border border-surface-border bg-surface p-5 sm:p-6", className].join(" ")}>
      {title ? (
        <header className="mb-4">
          <Heading className="text-lg font-semibold text-ink">{title}</Heading>
          {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
        </header>
      ) : null}

      {children}

      {footer ? <footer className="mt-5 border-t border-surface-border pt-4">{footer}</footer> : null}
    </section>
  );
}
