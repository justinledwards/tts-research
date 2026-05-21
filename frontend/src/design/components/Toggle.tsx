import type { InputHTMLAttributes, ReactNode } from "react";
import { cx, focusRingClassName, touchTargetClassName } from "../tokens";

export interface ToggleProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> {
  checked: boolean;
  detail?: ReactNode;
  label: ReactNode;
  onChange: (checked: boolean) => void;
}

export function Toggle({
  checked,
  className,
  detail,
  disabled,
  label,
  onChange,
  ...inputProps
}: Readonly<ToggleProps>) {
  return (
    <label
      className={cx(
        touchTargetClassName,
        "flex cursor-pointer items-start justify-between gap-4 rounded-md border bg-[var(--vs-raised)] px-3 py-2 text-sm transition hover:bg-[var(--vs-surface)] vs-border",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block font-semibold text-[var(--vs-text)]">{label}</span>
        {detail ? <span className="mt-1 block text-xs leading-5 vs-muted">{detail}</span> : null}
      </span>
      <input
        {...inputProps}
        checked={checked}
        className={cx("mt-1 h-5 w-5 accent-orange-500", focusRingClassName)}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.currentTarget.checked);
        }}
        type="checkbox"
      />
    </label>
  );
}
