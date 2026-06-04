import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { controlSizeClassName } from "../spacing";
import { cx, disabledStateClassName, focusRingClassName, touchTargetClassName } from "../tokens";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "soft"
  | "ghost"
  | "warning"
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
    "border-transparent bg-[var(--vs-action-primary)] text-[var(--vs-action-primary-text)] shadow-sm hover:bg-[var(--vs-action-primary-hover)]",
  secondary:
    "border-[var(--vs-action-secondary-border)] bg-[var(--vs-action-secondary-bg)] text-[var(--vs-action-secondary-text)] shadow-sm hover:bg-[var(--vs-action-secondary-hover)]",
  tertiary:
    "border-transparent bg-[var(--vs-action-tertiary-bg)] text-[var(--vs-action-tertiary-text)] hover:bg-[var(--vs-action-tertiary-hover)] hover:text-[var(--vs-text-primary)]",
  soft: "border-[var(--vs-action-soft-border)] bg-[var(--vs-action-soft-bg)] text-[var(--vs-action-soft-text)] hover:bg-[var(--vs-action-soft-hover)]",
  ghost:
    "border-transparent bg-transparent text-[var(--vs-text-muted)] hover:border-[var(--vs-border-subtle)] hover:bg-[var(--vs-action-tertiary-hover)] hover:text-[var(--vs-text-primary)]",
  warning:
    "border-[var(--vs-action-warning-border)] bg-[var(--vs-action-warning-bg)] text-[var(--vs-action-warning)] hover:bg-[var(--vs-action-warning-hover)]",
  destructive:
    "border-[var(--vs-action-destructive-border)] bg-[var(--vs-action-destructive-bg)] text-[var(--vs-action-destructive)] hover:bg-[var(--vs-action-destructive-hover)]",
  mode: "border-transparent bg-transparent text-[var(--vs-text-secondary)] hover:bg-[var(--vs-action-tertiary-hover)] hover:text-[var(--vs-text-primary)]",
  pinned:
    "border-[var(--vs-pinned-border)] bg-[var(--vs-pinned)] text-[var(--vs-pinned-text)] hover:bg-[var(--vs-action-soft-hover)]",
};

const selectedClassName =
  "border-[var(--vs-selected-border)] bg-[var(--vs-selected)] text-[var(--vs-selected-text)] shadow-sm ring-1 ring-[var(--vs-selected-border)]";

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
    style,
    title,
    type = "button",
    variant = "secondary",
    ...buttonProps
  },
  ref,
) {
  const shouldApplySelected =
    selected && variant !== "primary" && variant !== "destructive" && variant !== "warning";
  const scrollSafeStyle = {
    scrollMarginBottom: "calc(var(--overlay-activity-footer-reserved, 5rem) + 1rem)",
    ...style,
  };
  return (
    <button
      {...buttonProps}
      aria-pressed={buttonProps["aria-pressed"] ?? (selected ? true : undefined)}
      className={cx(
        touchTargetClassName,
        focusRingClassName,
        disabledStateClassName,
        "inline-flex shrink-0 rounded-md border font-semibold transition-colors",
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
      style={scrollSafeStyle}
      title={title ?? (buttonProps.disabled && disabledReason ? disabledReason : undefined)}
      type={type}
    >
      {icon}
      {children}
    </button>
  );
});
