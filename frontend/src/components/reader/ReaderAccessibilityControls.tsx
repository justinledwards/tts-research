import { fieldControlClassName, Toggle } from "../../design";
import {
  READER_LINE_SPACING_LABELS,
  READER_LINE_SPACING_OPTIONS,
  READER_MEASURE_LABELS,
  READER_MEASURE_OPTIONS,
  READER_TEXT_SCALE_LABELS,
  READER_TEXT_SCALE_OPTIONS,
  normalizeReaderAccessibilitySettings,
  type ReaderAccessibilitySettings,
  type ReaderLineSpacing,
  type ReaderMeasure,
  type ReaderTextScale,
} from "../../features/reader-accessibility";

export function ReaderAccessibilityControls({
  className = "",
  settings,
  variant = "inline",
  onChange,
}: Readonly<{
  className?: string;
  settings: ReaderAccessibilitySettings;
  variant?: "inline" | "panel";
  onChange: (settings: ReaderAccessibilitySettings) => void;
}>) {
  const normalized = normalizeReaderAccessibilitySettings(settings);
  const rootClassName =
    variant === "panel"
      ? `grid gap-3 ${className}`
      : `flex flex-wrap items-center gap-2 ${className}`;

  return (
    <div className={rootClassName} data-reader-ignore-shortcuts="">
      <ReaderToggle
        checked={normalized.reducedMotion}
        label="Reduced motion"
        onChange={(checked) => {
          onChange({ ...normalized, reducedMotion: checked });
        }}
      />
      <ReaderToggle
        checked={normalized.highContrast}
        label="High contrast"
        onChange={(checked) => {
          onChange({ ...normalized, highContrast: checked });
        }}
      />
      <ReaderSelect
        label="Text scale"
        onChange={(textScale) => {
          onChange({ ...normalized, textScale });
        }}
        options={READER_TEXT_SCALE_OPTIONS}
        value={normalized.textScale}
        valueLabels={READER_TEXT_SCALE_LABELS}
      />
      <ReaderSelect
        label="Line spacing"
        onChange={(lineSpacing) => {
          onChange({ ...normalized, lineSpacing });
        }}
        options={READER_LINE_SPACING_OPTIONS}
        value={normalized.lineSpacing}
        valueLabels={READER_LINE_SPACING_LABELS}
      />
      <ReaderSelect
        label="Measure"
        onChange={(measure) => {
          onChange({ ...normalized, measure });
        }}
        options={READER_MEASURE_OPTIONS}
        value={normalized.measure}
        valueLabels={READER_MEASURE_LABELS}
      />
    </div>
  );
}

function ReaderToggle({
  checked,
  label,
  onChange,
}: Readonly<{ checked: boolean; label: string; onChange: (checked: boolean) => void }>) {
  return <Toggle checked={checked} label={label} onChange={onChange} />;
}

function ReaderSelect<T extends ReaderLineSpacing | ReaderMeasure | ReaderTextScale>({
  label,
  options,
  value,
  valueLabels,
  onChange,
}: Readonly<{
  label: string;
  options: readonly T[];
  value: T;
  valueLabels: Record<T, string>;
  onChange: (value: T) => void;
}>) {
  return (
    <label className="grid min-w-[8rem] gap-1 text-xs font-semibold vs-muted">
      <span>{label}</span>
      <select
        className={`${fieldControlClassName} h-11`}
        onChange={(event) => {
          onChange(event.currentTarget.value as T);
        }}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {valueLabels[option]}
          </option>
        ))}
      </select>
    </label>
  );
}
