import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Button, cx, fieldControlClassName } from "../../design";
import { READER_PLAYBACK_RATES } from "../reader-accessibility";
import {
  DEFAULT_SHORTCUT_PREFERENCES,
  shortcutAriaKeyShortcutsForCommand,
  shortcutTooltip,
  type ShortcutCommandId,
  type ShortcutPreferences,
} from "../shortcuts/shortcutRegistry";

export type LocalizedPlaybackToolbarStage =
  | "cinema-theatre"
  | "preview"
  | "review"
  | "teleprompt"
  | "theatre";

export type LocalizedPlaybackToolbarVariant = "compact" | "normal" | "theatre" | "theatre-compact";

export interface LocalizedPlaybackToolbarAction {
  readonly ariaKeyShortcuts?: string;
  readonly ariaLabel?: string;
  readonly dataAttributes?: Record<string, string | undefined>;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly icon?: ReactNode;
  readonly label: string;
  readonly primary?: boolean;
  readonly shortcutCommandId?: ShortcutCommandId;
  readonly testId?: string;
  readonly visible?: boolean;
  readonly onClick: () => void;
}

export interface LocalizedPlaybackToolbarSpeedControl {
  readonly ariaKeyShortcuts?: string;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly rates?: readonly number[];
  readonly shortcutCommandId?: ShortcutCommandId;
  readonly testId?: string;
  readonly value: number;
  readonly onChange?: (rate: number) => void;
}

export interface LocalizedPlaybackToolbarProgress {
  readonly currentLabel?: string;
  readonly durationLabel?: string;
  readonly markers?: readonly LocalizedPlaybackToolbarProgressMarker[];
  readonly ratio: number;
  readonly seek?: LocalizedPlaybackToolbarProgressSeek;
  readonly waveform?: ReactNode;
  readonly waveformBars?: readonly number[] | null;
}

export interface LocalizedPlaybackToolbarProgressMarker {
  readonly active?: boolean;
  readonly id: string;
  readonly label: string;
  readonly ratio: number;
}

export interface LocalizedPlaybackToolbarProgressSeek {
  readonly currentSec: number;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly durationSec: number;
  readonly onSeekSeconds: (seconds: number) => void;
}

export interface LocalizedPlaybackToolbarModel {
  readonly activeDetail?: string;
  readonly activeLabel: string;
  readonly jumpToAudio?: LocalizedPlaybackToolbarAction;
  readonly next?: LocalizedPlaybackToolbarAction;
  readonly playPause: LocalizedPlaybackToolbarAction;
  readonly previous?: LocalizedPlaybackToolbarAction;
  readonly progress: LocalizedPlaybackToolbarProgress;
  readonly restart?: LocalizedPlaybackToolbarAction;
  readonly speed?: LocalizedPlaybackToolbarSpeedControl;
  readonly stage: LocalizedPlaybackToolbarStage;
  readonly statusLabel?: string;
  readonly testId?: string;
  readonly variant?: LocalizedPlaybackToolbarVariant;
}

export function LocalizedPlaybackToolbar({
  model,
  shortcutPreferences = DEFAULT_SHORTCUT_PREFERENCES,
}: Readonly<{ model: LocalizedPlaybackToolbarModel; shortcutPreferences?: ShortcutPreferences }>) {
  const variant = model.variant ?? "normal";
  const highContrast =
    variant === "theatre" || variant === "theatre-compact" || model.stage === "cinema-theatre";
  const compact = variant === "compact";
  const theatreCompact = variant === "theatre-compact";
  const actions = localizedPlaybackActions(model);
  const toolbarTestId = model.testId ?? `localized-playback-toolbar-${model.stage}`;
  const disabledReasons = localizedPlaybackDisabledReasons(actions, model.speed);

  return (
    <section
      aria-label={`${localizedPlaybackStageLabel(model.stage)} playback controls`}
      className={localizedPlaybackToolbarClassName(variant)}
      data-localized-playback-toolbar={model.stage}
      data-testid={toolbarTestId}
    >
      <div className={cx("grid min-w-0 gap-2", theatreCompact && "hidden")}>
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className={cx(
                "text-xs font-semibold uppercase",
                highContrast ? "text-[var(--vs-theatre-accent)]" : "tracking-[0.14em] vs-muted",
              )}
            >
              {localizedPlaybackStageLabel(model.stage)}
            </p>
            <h3
              className={cx(
                "truncate font-semibold",
                compact ? "text-sm" : "text-base",
                highContrast && "text-[var(--vs-theatre-text)]",
              )}
              title={model.activeLabel}
            >
              {model.activeLabel}
            </h3>
            {model.activeDetail ? (
              <p
                className={cx(
                  "mt-0.5 truncate text-xs",
                  highContrast ? "text-[var(--vs-text-secondary)]" : "vs-muted",
                )}
                title={model.activeDetail}
              >
                {model.activeDetail}
              </p>
            ) : null}
          </div>
          {model.statusLabel ? (
            <span
              className={cx(
                "shrink-0 rounded-full border px-2 py-1 text-xs font-semibold",
                highContrast
                  ? "border-[var(--vs-theatre-panel-border)] bg-[var(--vs-theatre-panel)] text-[var(--vs-theatre-text)]"
                  : "vs-border",
              )}
            >
              {model.statusLabel}
            </span>
          ) : null}
        </div>
        <div className="grid min-w-0 gap-1">
          <ToolbarProgress progress={model.progress} highContrast={highContrast} />
          <div
            className={cx(
              "flex items-center justify-between gap-3 text-xs tabular-nums",
              highContrast ? "text-[var(--vs-text-secondary)]" : "vs-muted",
            )}
          >
            <span>{model.progress.currentLabel ?? "0:00"}</span>
            <span>{model.progress.durationLabel ?? "--:--"}</span>
          </div>
        </div>
      </div>
      <div className={localizedPlaybackControlRowClassName(variant, compact)}>
        {actions.map((action) => (
          <ToolbarButton
            action={action}
            highContrast={highContrast}
            key={action.testId ?? action.label}
            shortcutPreferences={shortcutPreferences}
          />
        ))}
        {model.speed ? (
          <ToolbarSpeedSelect
            highContrast={highContrast}
            phoneHidden={theatreCompact}
            shortcutPreferences={shortcutPreferences}
            speed={model.speed}
          />
        ) : null}
        {disabledReasons.length > 0 ? (
          <p
            className={cx(
              "pointer-events-none basis-full text-xs",
              highContrast ? "text-[var(--vs-theatre-text)]" : "text-[var(--vs-selected-text)]",
            )}
            data-testid={`${toolbarTestId}-disabled-reasons`}
          >
            Unavailable: {disabledReasons.join(" ")}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function localizedPlaybackStageLabel(stage: LocalizedPlaybackToolbarStage): string {
  switch (stage) {
    case "cinema-theatre": {
      return "Cinema Theatre";
    }
    case "preview": {
      return "Preview Playback";
    }
    case "review": {
      return "Review Playback";
    }
    case "teleprompt": {
      return "Teleprompt Playback";
    }
    case "theatre": {
      return "Theatre Playback";
    }
  }
}

function ToolbarProgress({
  highContrast,
  progress,
}: Readonly<{ highContrast: boolean; progress: LocalizedPlaybackToolbarProgress }>) {
  if (progress.waveform) {
    return <div className="min-w-0">{progress.waveform}</div>;
  }
  if (progress.waveformBars?.length) {
    return (
      <ToolbarWaveformProgress
        highContrast={highContrast}
        progress={progress}
        waveformBars={progress.waveformBars}
      />
    );
  }
  return (
    <div
      className={cx(
        "h-2 overflow-hidden rounded-full",
        highContrast ? "bg-[var(--vs-theatre-panel)]" : "bg-[var(--vs-border)]",
      )}
    >
      <div
        className={cx(
          "h-full rounded-full",
          highContrast ? "bg-[var(--vs-theatre-accent)]" : "bg-[var(--vs-action-primary)]",
        )}
        style={{ width: `${Math.round(clampProgress(progress.ratio) * 100).toString()}%` }}
      />
    </div>
  );
}

function ToolbarWaveformProgress({
  highContrast,
  progress,
  waveformBars,
}: Readonly<{
  highContrast: boolean;
  progress: LocalizedPlaybackToolbarProgress;
  waveformBars: readonly number[];
}>) {
  const seekable = progressSeekable(progress.seek);
  const waveformClassName = waveformProgressClassName(highContrast, seekable);
  const waveformGridStyle = {
    gridTemplateColumns: `repeat(${waveformBars.length.toString()}, minmax(0, 1fr))`,
  };
  const waveformContent = (
    <ToolbarWaveformContent
      activeIndex={Math.round(clampProgress(progress.ratio) * waveformBars.length)}
      highContrast={highContrast}
      markers={progress.markers}
      waveformBars={waveformBars}
    />
  );
  if (progress.seek) {
    return (
      <button
        aria-disabled={progress.seek.disabled ? true : undefined}
        aria-label="Playback waveform timeline"
        aria-valuemax={localizedPlaybackSeekValueMax(progress.seek)}
        aria-valuemin={0}
        aria-valuenow={localizedPlaybackSeekValueNow(progress.seek)}
        aria-valuetext={localizedPlaybackSeekValueText(progress)}
        className={cx(waveformClassName, "appearance-none border-0 px-0")}
        data-testid="localized-playback-waveform"
        disabled={!seekable}
        onKeyDown={(event) => {
          handleProgressSeekKeyDown(event, progress.seek);
        }}
        onMouseDown={(event) => {
          handleProgressSeekPointer(event, progress.seek);
        }}
        role="slider"
        style={waveformGridStyle}
        title={progress.seek.disabledReason ?? "Click or use arrow keys to seek audio."}
        type="button"
      >
        {waveformContent}
      </button>
    );
  }
  return (
    <div
      aria-label="Playback waveform"
      className={waveformClassName}
      data-testid="localized-playback-waveform"
      role="img"
      style={waveformGridStyle}
    >
      {waveformContent}
    </div>
  );
}

function ToolbarWaveformContent({
  activeIndex,
  highContrast,
  markers,
  waveformBars,
}: Readonly<{
  activeIndex: number;
  highContrast: boolean;
  markers?: readonly LocalizedPlaybackToolbarProgressMarker[];
  waveformBars: readonly number[];
}>) {
  return (
    <>
      {waveformBars.map((bar, index) => (
        <span
          aria-hidden="true"
          className={cx(
            "w-full rounded-full",
            waveformBarClassName(index, activeIndex, highContrast),
          )}
          key={`localized-waveform-${index.toString()}`}
          style={{ height: `${Math.round(4 + Math.max(0, Math.min(1, bar)) * 24).toString()}px` }}
        />
      ))}
      {markers?.map((marker) => (
        <span
          aria-hidden="true"
          className={cx(
            "pointer-events-none absolute top-1 bottom-1 w-px rounded-full",
            waveformMarkerClassName(Boolean(marker.active), highContrast),
          )}
          data-active={marker.active ? "true" : undefined}
          data-testid="localized-playback-cue-marker"
          key={marker.id}
          style={{ left: `${Math.round(clampProgress(marker.ratio) * 100).toString()}%` }}
          title={marker.label}
        />
      ))}
    </>
  );
}

function waveformProgressClassName(highContrast: boolean, seekable: boolean): string {
  return cx(
    "relative grid h-9 min-w-0 items-center gap-px rounded-md py-1",
    seekable
      ? "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-focus)]"
      : "",
    highContrast ? "bg-[var(--vs-theatre-panel)]" : "bg-[var(--vs-surface)]",
  );
}

function waveformMarkerClassName(active: boolean, highContrast: boolean): string {
  if (active) {
    return "bg-[var(--vs-selected-border)] shadow-[0_0_0_1px_var(--vs-selected-border)]";
  }
  if (highContrast) {
    return "bg-[var(--vs-text-secondary)]";
  }
  return "bg-[var(--vs-border-strong)]";
}

function progressSeekable(
  seek: LocalizedPlaybackToolbarProgressSeek | undefined,
): seek is LocalizedPlaybackToolbarProgressSeek {
  return Boolean(
    seek && !seek.disabled && Number.isFinite(seek.durationSec) && seek.durationSec > 0,
  );
}

function localizedPlaybackSeekValueMax(
  seek: LocalizedPlaybackToolbarProgressSeek,
): number | undefined {
  return seek.durationSec > 0 ? Math.round(seek.durationSec) : undefined;
}

function localizedPlaybackSeekValueNow(
  seek: LocalizedPlaybackToolbarProgressSeek,
): number | undefined {
  if (seek.durationSec <= 0) {
    return undefined;
  }
  return Math.round(Math.max(0, Math.min(seek.durationSec, seek.currentSec)));
}

function localizedPlaybackSeekValueText(progress: LocalizedPlaybackToolbarProgress): string {
  const seek = progress.seek;
  if (!seek) {
    return "";
  }
  return `${progress.currentLabel ?? formatSeekSeconds(seek.currentSec)} of ${
    progress.durationLabel ?? formatSeekSeconds(seek.durationSec)
  }`;
}

function handleProgressSeekPointer(
  event: MouseEvent<HTMLElement>,
  seek: LocalizedPlaybackToolbarProgressSeek | undefined,
): void {
  if (!progressSeekable(seek)) {
    return;
  }
  event.preventDefault();
  const rect = event.currentTarget.getBoundingClientRect();
  const width = rect.width > 0 ? rect.width : 1;
  seek.onSeekSeconds(
    localizedPlaybackSeekSecondsFromPointer(event.clientX, rect.left, width, seek.durationSec),
  );
}

function handleProgressSeekKeyDown(
  event: KeyboardEvent<HTMLElement>,
  seek: LocalizedPlaybackToolbarProgressSeek | undefined,
): void {
  if (!progressSeekable(seek)) {
    return;
  }
  const next = localizedPlaybackSeekSecondsForKey(event.key, seek.currentSec, seek.durationSec);
  if (next === null) {
    return;
  }
  event.preventDefault();
  seek.onSeekSeconds(next);
}

export function localizedPlaybackSeekSecondsFromPointer(
  clientX: number,
  left: number,
  width: number,
  durationSec: number,
): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return 0;
  }
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1;
  const ratio = Math.max(0, Math.min(1, (clientX - left) / safeWidth));
  return ratio * durationSec;
}

export function localizedPlaybackSeekSecondsForKey(
  key: string,
  currentSec: number,
  durationSec: number,
): number | null {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return null;
  }
  const current = Math.max(0, Math.min(durationSec, Number.isFinite(currentSec) ? currentSec : 0));
  switch (key) {
    case "Home": {
      return 0;
    }
    case "End": {
      return durationSec;
    }
    case "ArrowLeft":
    case "ArrowDown": {
      return Math.max(0, current - 5);
    }
    case "ArrowRight":
    case "ArrowUp": {
      return Math.min(durationSec, current + 5);
    }
    case "PageDown": {
      return Math.max(0, current - 30);
    }
    case "PageUp": {
      return Math.min(durationSec, current + 30);
    }
    default: {
      return null;
    }
  }
}

function formatSeekSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainingSeconds = rounded % 60;
  return `${minutes.toString()}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function ToolbarButton({
  action,
  highContrast,
  shortcutPreferences,
}: Readonly<{
  action: LocalizedPlaybackToolbarAction;
  highContrast: boolean;
  shortcutPreferences: ShortcutPreferences;
}>) {
  const ariaKeyShortcuts =
    action.ariaKeyShortcuts ??
    (action.shortcutCommandId
      ? shortcutAriaKeyShortcutsForCommand(action.shortcutCommandId, shortcutPreferences)
      : undefined);
  return (
    <Button
      {...action.dataAttributes}
      aria-keyshortcuts={ariaKeyShortcuts}
      aria-label={action.ariaLabel ?? action.label}
      className={cx(
        action.primary ? "min-w-32 gap-2" : "gap-2",
        highContrast &&
          (action.primary
            ? "border-[var(--vs-selected-border)] bg-[var(--vs-action-primary)] text-[var(--vs-action-primary-text)] hover:bg-[var(--vs-action-primary-hover)]"
            : "border-[var(--vs-theatre-panel-border)] bg-[var(--vs-theatre-panel)] text-[var(--vs-theatre-text)] hover:bg-[var(--vs-theatre-panel)]"),
      )}
      data-testid={action.testId}
      data-shortcut-command-id={action.shortcutCommandId}
      disabled={action.disabled}
      disabledReason={action.disabledReason}
      onClick={action.onClick}
      size={action.primary ? "lg" : "md"}
      title={shortcutTooltip(
        action.label,
        action.shortcutCommandId,
        shortcutPreferences,
        action.disabledReason,
      )}
      variant={action.primary ? "primary" : "secondary"}
    >
      {action.icon}
      {action.label}
    </Button>
  );
}

function ToolbarSpeedSelect({
  highContrast,
  phoneHidden = false,
  shortcutPreferences,
  speed,
}: Readonly<{
  highContrast: boolean;
  phoneHidden?: boolean;
  shortcutPreferences: ShortcutPreferences;
  speed: LocalizedPlaybackToolbarSpeedControl;
}>) {
  const rates = speed.rates ?? READER_PLAYBACK_RATES;
  const ariaKeyShortcuts =
    speed.ariaKeyShortcuts ??
    (speed.shortcutCommandId
      ? shortcutAriaKeyShortcutsForCommand(speed.shortcutCommandId, shortcutPreferences)
      : undefined);
  return (
    <label
      className={cx(
        "grid min-w-28 gap-1 text-xs font-semibold",
        phoneHidden && "hidden",
        highContrast && "text-[var(--vs-theatre-text)]",
      )}
    >
      <span className="sr-only">Playback speed</span>
      <select
        aria-keyshortcuts={ariaKeyShortcuts}
        aria-label="Playback speed"
        className={cx(
          fieldControlClassName,
          "h-11 text-xs font-semibold",
          highContrast &&
            "border-[var(--vs-theatre-panel-border)] bg-[var(--vs-theatre-panel)] text-[var(--vs-theatre-text)]",
        )}
        data-disabled-reason={speed.disabledReason}
        data-shortcut-command-id={speed.shortcutCommandId}
        data-testid={speed.testId}
        disabled={speed.disabled}
        onChange={(event) => {
          speed.onChange?.(Number(event.currentTarget.value));
        }}
        title={shortcutTooltip(
          "Playback speed",
          speed.shortcutCommandId,
          shortcutPreferences,
          speed.disabledReason,
        )}
        value={String(speed.value)}
      >
        {rates.map((rate) => (
          <option
            className={highContrast ? "text-[var(--vs-text-primary)]" : undefined}
            key={rate}
            value={rate}
          >
            {rate.toFixed(rate === 1 ? 0 : 2)}x
          </option>
        ))}
      </select>
    </label>
  );
}

function localizedPlaybackToolbarClassName(variant: LocalizedPlaybackToolbarVariant): string {
  if (variant === "theatre-compact") {
    return "grid gap-2 rounded-lg border border-[var(--vs-theatre-panel-border)] bg-[var(--vs-theatre-panel)] p-2 text-[var(--vs-theatre-text)] shadow-2xl";
  }
  if (variant === "theatre") {
    return "grid gap-2 rounded-lg border border-[var(--vs-theatre-panel-border)] bg-[var(--vs-theatre-panel)] p-2 text-[var(--vs-theatre-text)] shadow-2xl sm:gap-3 sm:p-3";
  }
  if (variant === "compact") {
    return "grid gap-3 rounded-lg border bg-[var(--vs-surface)] p-3 shadow-sm vs-border";
  }
  return "grid gap-3 rounded-lg border bg-[var(--vs-raised)] p-3 shadow-sm vs-border lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center";
}

function localizedPlaybackControlRowClassName(
  variant: LocalizedPlaybackToolbarVariant,
  compact: boolean,
): string {
  if (variant === "theatre-compact") {
    return "flex min-w-0 flex-wrap items-center gap-2 xl:justify-end";
  }
  return cx(
    "flex min-w-0 flex-wrap items-center gap-2",
    compact ? "justify-start" : "lg:justify-end",
  );
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function localizedPlaybackActions(
  model: LocalizedPlaybackToolbarModel,
): LocalizedPlaybackToolbarAction[] {
  const actions: LocalizedPlaybackToolbarAction[] = [];
  for (const action of [
    model.previous,
    model.playPause,
    model.restart,
    model.next,
    model.jumpToAudio,
  ]) {
    if (action && action.visible !== false) {
      actions.push(action);
    }
  }
  return actions;
}

function localizedPlaybackDisabledReasons(
  actions: readonly LocalizedPlaybackToolbarAction[],
  speed?: LocalizedPlaybackToolbarSpeedControl,
): string[] {
  const reasons: string[] = [];
  for (const action of actions) {
    if (action.disabled && action.disabledReason && action.primary) {
      reasons.push(action.disabledReason);
    }
  }
  if (speed?.disabled && speed.disabledReason) {
    reasons.push(speed.disabledReason);
  }
  return [...new Set(reasons)];
}

function waveformBarClassName(index: number, activeIndex: number, highContrast: boolean): string {
  if (index <= activeIndex) {
    return highContrast ? "bg-[var(--vs-theatre-accent)]" : "bg-[var(--vs-action-primary)]";
  }
  return highContrast ? "bg-[var(--vs-theatre-panel)]" : "bg-[var(--vs-border)]";
}
