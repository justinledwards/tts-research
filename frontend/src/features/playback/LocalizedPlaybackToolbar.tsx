import type { ReactNode } from "react";
import { Button, cx, fieldControlClassName } from "../../design";
import { READER_PLAYBACK_RATES } from "../reader-accessibility";
import {
  DEFAULT_SHORTCUT_PREFERENCES,
  shortcutAriaKeyShortcutsForCommand,
  shortcutTooltip,
  type ShortcutCommandId,
} from "../shortcuts/shortcutRegistry";

export type LocalizedPlaybackToolbarStage =
  | "cinema-theatre"
  | "preview"
  | "review"
  | "teleprompt"
  | "theatre";

export type LocalizedPlaybackToolbarVariant = "compact" | "normal" | "theatre";

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
  readonly ratio: number;
  readonly waveform?: ReactNode;
  readonly waveformBars?: readonly number[] | null;
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
}: Readonly<{ model: LocalizedPlaybackToolbarModel }>) {
  const variant = model.variant ?? "normal";
  const highContrast = variant === "theatre" || model.stage === "cinema-theatre";
  const compact = variant === "compact";
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
      <div className="grid min-w-0 gap-2">
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
      <div className={localizedPlaybackControlRowClassName(compact)}>
        {actions.map((action) => (
          <ToolbarButton
            action={action}
            highContrast={highContrast}
            key={action.testId ?? action.label}
          />
        ))}
        {model.speed ? (
          <ToolbarSpeedSelect highContrast={highContrast} speed={model.speed} />
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
    const activeIndex = Math.round(clampProgress(progress.ratio) * progress.waveformBars.length);
    return (
      <div
        aria-label="Playback waveform"
        className={cx(
          "grid h-9 min-w-0 items-center gap-px rounded-md py-1",
          highContrast ? "bg-[var(--vs-theatre-panel)]" : "bg-[var(--vs-surface)]",
        )}
        role="img"
        style={{
          gridTemplateColumns: `repeat(${progress.waveformBars.length.toString()}, minmax(0, 1fr))`,
        }}
      >
        {progress.waveformBars.map((bar, index) => (
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
      </div>
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

function ToolbarButton({
  action,
  highContrast,
}: Readonly<{ action: LocalizedPlaybackToolbarAction; highContrast: boolean }>) {
  const ariaKeyShortcuts =
    action.ariaKeyShortcuts ??
    (action.shortcutCommandId
      ? shortcutAriaKeyShortcutsForCommand(action.shortcutCommandId, DEFAULT_SHORTCUT_PREFERENCES)
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
        DEFAULT_SHORTCUT_PREFERENCES,
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
  speed,
}: Readonly<{ highContrast: boolean; speed: LocalizedPlaybackToolbarSpeedControl }>) {
  const rates = speed.rates ?? READER_PLAYBACK_RATES;
  const ariaKeyShortcuts =
    speed.ariaKeyShortcuts ??
    (speed.shortcutCommandId
      ? shortcutAriaKeyShortcutsForCommand(speed.shortcutCommandId, DEFAULT_SHORTCUT_PREFERENCES)
      : undefined);
  return (
    <label
      className={cx(
        "grid min-w-28 gap-1 text-xs font-semibold",
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
          DEFAULT_SHORTCUT_PREFERENCES,
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
  if (variant === "theatre") {
    return "grid gap-3 rounded-lg border border-[var(--vs-theatre-panel-border)] bg-[var(--vs-theatre-panel)] p-3 text-[var(--vs-theatre-text)] shadow-2xl";
  }
  if (variant === "compact") {
    return "grid gap-3 rounded-lg border bg-[var(--vs-surface)] p-3 shadow-sm vs-border";
  }
  return "grid gap-3 rounded-lg border bg-[var(--vs-raised)] p-3 shadow-sm vs-border lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center";
}

function localizedPlaybackControlRowClassName(compact: boolean): string {
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
    if (action.disabled && action.disabledReason) {
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
