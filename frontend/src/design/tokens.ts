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

export const disabledStateClassName = "disabled:cursor-not-allowed disabled:opacity-50";

export const touchTargetClassName = "min-h-11 min-w-11 touch-manipulation";
export const compactHitTargetClassName = "vs-compact-hit-target";

export const fieldControlClassName = cx(
  touchTargetClassName,
  focusRingClassName,
  "rounded-md border bg-[var(--vs-surface)] px-3 text-sm font-semibold text-[var(--vs-text)] outline-none transition disabled:cursor-not-allowed disabled:opacity-50 vs-border",
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
