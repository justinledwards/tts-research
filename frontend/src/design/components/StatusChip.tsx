import type { ReactNode } from "react";
import { cx } from "../tokens";
import { toneClassName } from "../color";

export type StatusChipTone = keyof typeof toneClassName;

export function StatusChip({
  children,
  className,
  tone = "neutral",
}: Readonly<{
  children: ReactNode;
  className?: string;
  tone?: StatusChipTone;
}>) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center rounded-md border px-2 py-1 text-xs font-semibold",
        toneClassName[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
