import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  /** A primary action, e.g. a <Button> that opens a create form. */
  action?: ReactNode;
  /** Decorative glyph. Kept out of the accessibility tree. */
  icon?: ReactNode;
}

/** Nothing here yet - which is a normal state, not an error. */
export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border-strong px-6 py-12 text-center">
      {icon ? (
        <span aria-hidden="true" className="text-2xl text-muted">
          {icon}
        </span>
      ) : null}
      <p className="text-base font-semibold text-fg">{title}</p>
      {description ? <p className="max-w-prose text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
