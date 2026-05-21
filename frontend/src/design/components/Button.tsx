import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { controlSizeClassName } from "../spacing";
import { cx, disabledStateClassName, focusRingClassName, touchTargetClassName } from "../tokens";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "soft"
  | "ghost"
  | "destructive"
  | "mode"
  | "pinned";

export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  align?: "center" | "start";
  disabledReason?: string;
  fullWidth?: boolean;
  icon?: ReactNode;
  selected?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

const variantClassName: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-[var(--vs-accent)] text-white shadow-sm shadow-orange-500/20 hover:brightness-95",
  secondary:
    "border-[var(--vs-border)] bg-[var(--vs-raised)] text-[var(--vs-text)] shadow-sm hover:bg-[var(--vs-surface)]",
  soft: "border-[var(--vs-selected-border)] bg-[var(--vs-selected)] text-orange-700 hover:bg-orange-500/15",
  ghost:
    "border-transparent bg-transparent text-[var(--vs-muted)] hover:border-[var(--vs-border)] hover:bg-[var(--vs-surface)] hover:text-[var(--vs-text)]",
  destructive:
    "border-[var(--vs-danger-border)] bg-[var(--vs-danger-soft)] text-[var(--vs-danger)] hover:bg-red-500/15",
  mode: "border-[var(--vs-border)] bg-[var(--vs-raised)] text-[var(--vs-text)] shadow-sm hover:bg-[var(--vs-surface)]",
  pinned:
    "border-[var(--vs-pinned-border)] bg-[var(--vs-pinned)] text-orange-700 hover:bg-orange-500/15",
};

const selectedClassName =
  "border-[var(--vs-selected-border)] bg-[var(--vs-selected)] text-orange-700 shadow-sm ring-1 ring-[var(--vs-selected-border)]";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    align = "center",
    children,
    className,
    disabledReason,
    fullWidth = false,
    icon,
    selected = false,
    size = "md",
    type = "button",
    variant = "secondary",
    ...buttonProps
  },
  ref,
) {
  const shouldApplySelected = selected && variant !== "primary" && variant !== "destructive";
  return (
    <button
      {...buttonProps}
      aria-pressed={buttonProps["aria-pressed"] ?? (selected ? true : undefined)}
      className={cx(
        touchTargetClassName,
        focusRingClassName,
        disabledStateClassName,
        "inline-flex shrink-0 rounded-md border font-semibold transition",
        align === "start" ? "items-start justify-start text-left" : "items-center justify-center",
        controlSizeClassName[size],
        variantClassName[variant],
        shouldApplySelected && selectedClassName,
        fullWidth && "w-full",
        className,
      )}
      data-disabled-reason={disabledReason}
      data-selected={selected ? "true" : undefined}
      data-ui-noop-reason={selected ? "Already selected." : undefined}
      ref={ref}
      type={type}
    >
      {icon}
      {children}
    </button>
  );
});
