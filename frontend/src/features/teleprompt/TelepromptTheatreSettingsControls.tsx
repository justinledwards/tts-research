import { Panel, SegmentedControl, Toggle, fieldControlClassName } from "../../design";
import {
  TELEPROMPT_THEATRE_CUE_FONT_SIZES,
  TELEPROMPT_THEATRE_CUE_WIDTHS,
  TELEPROMPT_THEATRE_FULLSCREEN_PREFERENCES,
  TELEPROMPT_THEATRE_NEXT_CUE_PLACEMENTS,
  TELEPROMPT_THEATRE_OPERATOR_POSITIONS,
  TELEPROMPT_THEATRE_PRESET_IDS,
  TELEPROMPT_THEATRE_SCROLL_MODES,
  TELEPROMPT_THEATRE_VERTICAL_POSITIONS,
  applyTelepromptTheatrePreset,
  telepromptTheatrePreset,
  type TelepromptTheatreCueFontSize,
  type TelepromptTheatreCueWidth,
  type TelepromptTheatreFullscreenPreference,
  type TelepromptTheatreNextCuePlacement,
  type TelepromptTheatreOperatorPosition,
  type TelepromptTheatreCountdownSeconds,
  type TelepromptTheatreCuePreviewCount,
  type TelepromptTheatreScrollMode,
  type TelepromptTheatreSettings,
  type TelepromptTheatreVerticalPosition,
} from "./telepromptTheatreSettings";

export function TelepromptTheatreSettingsControls({
  memoryEnabled,
  settings,
  variant = "panel",
  onChange,
}: Readonly<{
  memoryEnabled: boolean;
  settings: TelepromptTheatreSettings;
  variant?: "compact" | "panel";
  onChange: (settings: TelepromptTheatreSettings) => void;
}>) {
  const update = (patch: Partial<TelepromptTheatreSettings>) => {
    onChange({ ...settings, ...patch });
  };

  return (
    <Panel
      className={variant === "compact" ? "grid gap-3 p-3" : "grid gap-4 p-3"}
      data-testid="teleprompt-theatre-settings"
      variant="surface"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold">Teleprompt Theatre</h4>
          <p className="vs-muted mt-1 text-xs leading-5">
            Configure presenter distance, operator visibility, cue motion, and fallback behavior.
          </p>
        </div>
        <span className="vs-muted text-xs">
          {memoryEnabled ? "Persisted by UI memory" : "Session only"}
        </span>
      </div>

      <SegmentedControl
        ariaLabel="Teleprompt Theatre preset"
        columns={variant === "compact" ? 2 : 3}
        options={TELEPROMPT_THEATRE_PRESET_IDS.map((id) => ({
          label: telepromptTheatrePreset(id).label,
          testId: `ui-action-teleprompt-theatre-config-preset-${id}`,
          value: id,
        }))}
        value={settings.presetId}
        onChange={(id) => {
          onChange(applyTelepromptTheatrePreset(id));
        }}
      />

      <div className="grid gap-3 md:grid-cols-2">
        <TheatreSelect
          label="Cue font size"
          testId="ui-action-teleprompt-theatre-cue-font-size"
          value={settings.cueFontSize}
          options={TELEPROMPT_THEATRE_CUE_FONT_SIZES}
          labelFor={cueFontSizeLabel}
          onChange={(cueFontSize) => {
            update({ cueFontSize });
          }}
        />
        <TheatreSelect
          label="Cue width"
          testId="ui-action-teleprompt-theatre-cue-width"
          value={settings.cueWidth}
          options={TELEPROMPT_THEATRE_CUE_WIDTHS}
          labelFor={cueWidthLabel}
          onChange={(cueWidth) => {
            update({ cueWidth });
          }}
        />
        <TheatreSelect
          label="Vertical cue position"
          testId="ui-action-teleprompt-theatre-vertical-position"
          value={settings.verticalCuePosition}
          options={TELEPROMPT_THEATRE_VERTICAL_POSITIONS}
          labelFor={verticalPositionLabel}
          onChange={(verticalCuePosition) => {
            update({ verticalCuePosition });
          }}
        />
        <TheatreSelect
          label="Scroll mode"
          testId="ui-action-teleprompt-theatre-scroll-mode"
          value={settings.scrollMode}
          options={TELEPROMPT_THEATRE_SCROLL_MODES}
          labelFor={scrollModeLabel}
          onChange={(scrollMode) => {
            update({ scrollMode });
          }}
        />
        <TheatreSelect
          label="Next cue placement"
          testId="ui-action-teleprompt-theatre-next-placement"
          value={settings.nextCuePlacement}
          options={TELEPROMPT_THEATRE_NEXT_CUE_PLACEMENTS}
          labelFor={nextCuePlacementLabel}
          onChange={(nextCuePlacement) => {
            update({ nextCuePlacement });
          }}
        />
        <TheatreSelect
          label="Operator panel"
          testId="ui-action-teleprompt-theatre-operator-position"
          value={settings.operatorPanelPosition}
          options={TELEPROMPT_THEATRE_OPERATOR_POSITIONS}
          labelFor={operatorPositionLabel}
          onChange={(operatorPanelPosition) => {
            update({ operatorPanelPosition });
          }}
        />
        <TheatreSelect
          label="Fullscreen fallback"
          testId="ui-action-teleprompt-theatre-fullscreen-preference"
          value={settings.fullscreenPreference}
          options={TELEPROMPT_THEATRE_FULLSCREEN_PREFERENCES}
          labelFor={fullscreenPreferenceLabel}
          onChange={(fullscreenPreference) => {
            update({ fullscreenPreference });
          }}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <TheatreRange
          label="Cue preview count"
          max={3}
          min={0}
          testId="ui-action-teleprompt-theatre-preview-count"
          value={settings.cuePreviewCount}
          onChange={(cuePreviewCount) => {
            update({ cuePreviewCount: cuePreviewCount as TelepromptTheatreCuePreviewCount });
          }}
        />
        <TheatreRange
          label="Countdown before playback"
          max={5}
          min={0}
          step={1}
          suffix="s"
          testId="ui-action-teleprompt-theatre-countdown"
          value={settings.countdownSeconds}
          onChange={(value) => {
            update({ countdownSeconds: normalizeCountdownSeconds(value) });
          }}
        />
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <Toggle
          checked={settings.operatorPanelVisible}
          data-testid="ui-action-teleprompt-theatre-operator-visible"
          detail="Show presenter presets, diagnostics, and exit paths while in Theatre."
          label="Show operator panel"
          onChange={(operatorPanelVisible) => {
            update({ operatorPanelVisible });
          }}
        />
        <Toggle
          checked={settings.mirrorMode}
          data-testid="ui-action-teleprompt-theatre-mirror-config"
          detail="Flip cue text for mirror rigs."
          label="Mirror cue"
          onChange={(mirrorMode) => {
            update({ mirrorMode });
          }}
        />
        <Toggle
          checked={settings.metronomeEnabled}
          data-testid="ui-action-teleprompt-theatre-metronome"
          detail="Show a visual tick while playback is running."
          label="Metronome tick"
          onChange={(metronomeEnabled) => {
            update({ metronomeEnabled });
          }}
        />
        <Toggle
          checked={settings.syncOverlayVisible}
          data-testid="ui-action-teleprompt-theatre-sync-overlay"
          detail="Show confidence and sync state in Theatre."
          label="Confidence overlay"
          onChange={(syncOverlayVisible) => {
            update({ syncOverlayVisible });
          }}
        />
      </div>

      <TelepromptTheatreSettingsPreview settings={settings} />
    </Panel>
  );
}

function TheatreSelect<T extends string>({
  label,
  labelFor,
  options,
  testId,
  value,
  onChange,
}: Readonly<{
  label: string;
  labelFor: (value: T) => string;
  options: readonly T[];
  testId: string;
  value: T;
  onChange: (value: T) => void;
}>) {
  return (
    <label className="grid gap-1 text-xs font-semibold vs-muted">
      <span>{label}</span>
      <select
        className={fieldControlClassName}
        data-testid={testId}
        value={value}
        onChange={(event) => {
          onChange(event.currentTarget.value as T);
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labelFor(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function TheatreRange({
  label,
  max,
  min,
  step = 1,
  suffix = "",
  testId,
  value,
  onChange,
}: Readonly<{
  label: string;
  max: number;
  min: number;
  step?: number;
  suffix?: string;
  testId: string;
  value: number;
  onChange: (value: number) => void;
}>) {
  return (
    <label className="vs-muted grid gap-2 text-xs font-medium">
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="font-semibold text-[var(--vs-text)]">
          {value.toString()}
          {suffix}
        </span>
      </span>
      <input
        className="accent-orange-500"
        data-testid={testId}
        max={max}
        min={min}
        onChange={(event) => {
          onChange(Number(event.currentTarget.value));
        }}
        step={step}
        type="range"
        value={value}
      />
    </label>
  );
}

function TelepromptTheatreSettingsPreview({
  settings,
}: Readonly<{ settings: TelepromptTheatreSettings }>) {
  return (
    <div
      className="grid min-h-48 overflow-hidden rounded-lg border border-[var(--vs-border-strong)] bg-[var(--vs-theatre-bg)] p-3 text-[var(--vs-theatre-text)]"
      data-testid="teleprompt-theatre-settings-preview"
    >
      <div className="flex items-center justify-between gap-3 text-[0.68rem] font-semibold uppercase text-[var(--vs-theatre-accent)]">
        <span>{telepromptTheatrePreset(settings.presetId).label}</span>
        <span>{settings.operatorPanelVisible ? "Operator panel" : "Presenter clean"}</span>
      </div>
      <div className={previewPositionClassName(settings.verticalCuePosition)}>
        <p
          className={`${previewWidthClassName(settings.cueWidth)} ${previewTextClassName(
            settings.cueFontSize,
          )} mx-auto whitespace-pre-wrap text-center font-semibold`}
          style={{ transform: settings.mirrorMode ? "scaleX(-1)" : undefined }}
        >
          Take a breath. Follow the current phrase and let the next cue wait in the margin.
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--vs-text-secondary)]">
        <span>{settings.cuePreviewCount.toString()} cue preview</span>
        <span>{scrollModeLabel(settings.scrollMode)}</span>
        <span>
          {settings.countdownSeconds > 0
            ? `${settings.countdownSeconds.toString()}s count`
            : "No count"}
        </span>
      </div>
    </div>
  );
}

function normalizeCountdownSeconds(value: number): TelepromptTheatreCountdownSeconds {
  if (value >= 5) {
    return 5;
  }
  if (value >= 3) {
    return 3;
  }
  return 0;
}

export function cueFontSizeLabel(value: TelepromptTheatreCueFontSize): string {
  return {
    comfortable: "Comfortable",
    giant: "Giant",
    large: "Large",
    massive: "Massive",
  }[value];
}

export function cueWidthLabel(value: TelepromptTheatreCueWidth): string {
  return {
    balanced: "Balanced",
    full: "Full width",
    narrow: "Narrow",
    wide: "Wide",
  }[value];
}

function verticalPositionLabel(value: TelepromptTheatreVerticalPosition): string {
  return {
    center: "Center",
    lower: "Lower third",
    upper: "Upper third",
  }[value];
}

function scrollModeLabel(value: TelepromptTheatreScrollMode): string {
  return {
    continuous: "Teleprompt continuous",
    paged: "Paged",
    smooth: "Smooth follow",
  }[value];
}

function nextCuePlacementLabel(value: TelepromptTheatreNextCuePlacement): string {
  return {
    below: "Below cue",
    hidden: "Hidden",
    side: "Operator side",
  }[value];
}

function operatorPositionLabel(value: TelepromptTheatreOperatorPosition): string {
  return {
    bottom: "Bottom",
    left: "Left",
    right: "Right",
  }[value];
}

function fullscreenPreferenceLabel(value: TelepromptTheatreFullscreenPreference): string {
  return {
    browser: "Browser window",
    native: "Prefer native fullscreen",
    theatre: "Theatre fallback",
  }[value];
}

function previewPositionClassName(value: TelepromptTheatreVerticalPosition): string {
  return {
    center: "grid min-h-32 place-items-center",
    lower: "grid min-h-32 items-end",
    upper: "grid min-h-32 items-start",
  }[value];
}

function previewTextClassName(value: TelepromptTheatreCueFontSize): string {
  return {
    comfortable: "text-lg leading-8",
    giant: "text-3xl leading-tight",
    large: "text-2xl leading-9",
    massive: "text-4xl leading-tight",
  }[value];
}

function previewWidthClassName(value: TelepromptTheatreCueWidth): string {
  return {
    balanced: "max-w-xl",
    full: "max-w-none",
    narrow: "max-w-md",
    wide: "max-w-3xl",
  }[value];
}
