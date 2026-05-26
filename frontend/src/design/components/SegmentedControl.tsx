import type { ReactNode } from "react";
import { Button } from "./Button";
import { cx } from "../tokens";

export interface SegmentedControlOption<T extends string> {
  ariaLabel?: string;
  disabled?: boolean;
  label: ReactNode;
  testId?: string;
  value: T;
}

export function SegmentedControl<T extends string>({
  ariaLabel,
  className,
  columns,
  options,
  value,
  onChange,
}: Readonly<{
  ariaLabel: string;
  className?: string;
  columns?: 2 | 3 | 4 | 5;
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
}>) {
  let columnClassName = "grid-cols-2";
  if (columns === 3) {
    columnClassName = "grid-cols-3";
  }
  if (columns === 4) {
    columnClassName = "grid-cols-2 lg:grid-cols-4";
  }
  if (columns === 5) {
    columnClassName = "grid-cols-2 lg:grid-cols-5";
  }
  return (
    <fieldset
      className={cx(
        "grid rounded-md border bg-[var(--vs-surface)] p-1 text-xs font-semibold shadow-sm vs-border",
        columnClassName,
        className,
      )}
      data-segmented-control={ariaLabel}
    >
      <legend className="sr-only">{ariaLabel}</legend>
      {options.map((option) => (
        <Button
          aria-label={option.ariaLabel}
          className="min-w-0 whitespace-nowrap border-transparent shadow-none"
          data-segmented-option={option.value}
          data-testid={option.testId}
          disabled={option.disabled}
          key={option.value}
          onClick={() => {
            onChange(option.value);
          }}
          selected={value === option.value}
          size="sm"
          variant="mode"
        >
          {option.label}
        </Button>
      ))}
    </fieldset>
  );
}
