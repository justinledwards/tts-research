import { fieldControlClassName, Toggle } from "../../design";
import {
  ACCESSIBILITY_PRESETS,
  accessibilityPresetForSettings,
  applyAccessibilityPreset,
  type AccessibilityPresetId,
} from "../../features/accessibility";
import { uiString } from "../../features/i18n";
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
      <label className="grid min-w-[10rem] gap-1 text-xs font-semibold vs-muted">
        <span>{uiString("accessibility.preset")}</span>
        <select
          className={`${fieldControlClassName} h-11`}
          data-testid="ui-action-reader-accessibility-preset"
          data-ui-action-surface="Settings"
          onChange={(event) => {
            onChange(applyAccessibilityPreset(event.currentTarget.value as AccessibilityPresetId));
          }}
          value={accessibilityPresetForSettings(normalized)}
        >
          <option value="custom">Custom</option>
          {ACCESSIBILITY_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      <ReaderToggle
        checked={normalized.reducedMotion}
        label={uiString("accessibility.reducedMotion")}
        testId="ui-action-reader-reduced-motion"
        onChange={(checked) => {
          onChange({ ...normalized, reducedMotion: checked });
        }}
      />
      <ReaderToggle
        checked={normalized.highContrast}
        label={uiString("accessibility.highContrast")}
        testId="ui-action-reader-high-contrast"
        onChange={(checked) => {
          onChange({ ...normalized, highContrast: checked });
        }}
      />
      <ReaderSelect
        label={uiString("accessibility.textScale")}
        onChange={(textScale) => {
          onChange({ ...normalized, textScale });
        }}
        options={READER_TEXT_SCALE_OPTIONS}
        testId="ui-action-reader-text-scale"
        value={normalized.textScale}
        valueLabels={READER_TEXT_SCALE_LABELS}
      />
      <ReaderSelect
        label={uiString("accessibility.lineSpacing")}
        onChange={(lineSpacing) => {
          onChange({ ...normalized, lineSpacing });
        }}
        options={READER_LINE_SPACING_OPTIONS}
        testId="ui-action-reader-line-spacing"
        value={normalized.lineSpacing}
        valueLabels={READER_LINE_SPACING_LABELS}
      />
      <ReaderSelect
        label={uiString("accessibility.measure")}
        onChange={(measure) => {
          onChange({ ...normalized, measure });
        }}
        options={READER_MEASURE_OPTIONS}
        testId="ui-action-reader-measure"
        value={normalized.measure}
        valueLabels={READER_MEASURE_LABELS}
      />
    </div>
  );
}

function ReaderToggle({
  checked,
  label,
  testId,
  onChange,
}: Readonly<{
  checked: boolean;
  label: string;
  testId: string;
  onChange: (checked: boolean) => void;
}>) {
  return (
    <Toggle
      checked={checked}
      data-testid={testId}
      data-ui-action-surface="Settings"
      label={label}
      onChange={onChange}
    />
  );
}

function ReaderSelect<T extends ReaderLineSpacing | ReaderMeasure | ReaderTextScale>({
  label,
  options,
  testId,
  value,
  valueLabels,
  onChange,
}: Readonly<{
  label: string;
  options: readonly T[];
  testId: string;
  value: T;
  valueLabels: Record<T, string>;
  onChange: (value: T) => void;
}>) {
  return (
    <label className="grid min-w-[8rem] gap-1 text-xs font-semibold vs-muted">
      <span>{label}</span>
      <select
        className={`${fieldControlClassName} h-11`}
        data-testid={testId}
        data-ui-action-surface="Settings"
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
