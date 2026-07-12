import { semanticColors, toneClassName } from "./color";
import {
  controlSizeClassName,
  minInteractiveSize,
  radius,
  spacing,
  touchTargetPx,
} from "./spacing";
import { textStyles, truncation } from "./typography";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export const focusRingClassName =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vs-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--vs-bg)]";

export const disabledStateClassName =
  "disabled:cursor-not-allowed disabled:border-[var(--vs-action-disabled-border)] disabled:bg-[var(--vs-action-disabled-bg)] disabled:text-[var(--vs-action-disabled-text)] disabled:shadow-none disabled:hover:bg-[var(--vs-action-disabled-bg)] disabled:hover:text-[var(--vs-action-disabled-text)] disabled:hover:brightness-100";

export const touchTargetClassName = "min-h-11 min-w-11 touch-manipulation";
export const compactHitTargetClassName = "vs-compact-hit-target";

export const fieldControlClassName = cx(
  touchTargetClassName,
  focusRingClassName,
  "rounded-md border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-primary)] px-3 text-sm font-semibold text-[var(--vs-text-primary)] outline-none transition disabled:cursor-not-allowed disabled:border-[var(--vs-action-disabled-border)] disabled:bg-[var(--vs-action-disabled-bg)] disabled:text-[var(--vs-action-disabled-text)]",
);

export const designTokens = {
  colors: semanticColors,
  compactHitTargetClassName,
  componentSizeClassName: controlSizeClassName,
  disabledStateClassName,
  fieldControlClassName,
  focusRingClassName,
  radius,
  spacing,
  textStyles,
  toneClassName,
  minInteractiveSize,
  touchTargetClassName,
  touchTargetPx,
  truncation,
} as const;
