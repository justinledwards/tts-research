import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../tokens";

export type PanelVariant =
  | "primary"
  | "secondary"
  | "inspector"
  | "raised"
  | "surface"
  | "subtle"
  | "dashed";
export type PanelElement = "aside" | "div" | "li" | "nav" | "section";

export function Panel({
  as = "section",
  actions,
  children,
  className,
  eyebrow,
  highlighted = false,
  pinned = false,
  title,
  variant = "raised",
  ...sectionProps
}: Readonly<
  HTMLAttributes<HTMLElement> & {
    as?: PanelElement;
    actions?: ReactNode;
    children: ReactNode;
    eyebrow?: ReactNode;
    highlighted?: boolean;
    pinned?: boolean;
    title?: ReactNode;
    variant?: PanelVariant;
  }
>) {
  const Component = as;
  return (
    <Component
      {...sectionProps}
      className={cx(
        "min-w-0 rounded-lg border border-[var(--vs-border-subtle)] transition",
        (variant === "primary" || variant === "raised") &&
          "bg-[var(--vs-surface-primary)] shadow-sm",
        (variant === "secondary" || variant === "surface") && "bg-[var(--vs-surface-secondary)]",
        variant === "inspector" && "bg-[var(--vs-surface-inspector)]",
        variant === "subtle" && "bg-transparent",
        variant === "dashed" && "border-dashed bg-[var(--vs-surface-primary)]",
        highlighted &&
          "border-[var(--vs-selected-border)] bg-[var(--vs-selected)] ring-2 ring-[var(--vs-focus-ring-soft)]",
        pinned && "border-[var(--vs-pinned-border)] bg-[var(--vs-pinned)]",
        className,
      )}
    >
      {title || eyebrow || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--vs-border-subtle)] p-3">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] vs-muted">
                {eyebrow}
              </p>
            ) : null}
            {title ? <h3 className="mt-1 text-base font-semibold">{title}</h3> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </Component>
  );
}
