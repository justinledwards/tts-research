import type { ReactNode } from "react";
import { READER_PLAYBACK_RATES, READER_SEEK_SECONDS } from "../reader-accessibility";

export interface CinemaTransportModel {
  bookmark?: {
    disabled: boolean;
    label?: string;
    onClick: () => void;
  };
  displayControls?: ReactNode;
  mobileMore?: {
    active: boolean;
    controlsId: string;
    icon?: ReactNode;
    label?: string;
    onClick: () => void;
  };
  playbackRate: {
    disabled: boolean;
    value: number;
    onChange?: (rate: number) => void;
  };
  primary: {
    className: string;
    disabled: boolean;
    icon?: ReactNode;
    label: string;
    mobileLabel?: string;
    onClick: () => void;
  };
  progress: {
    currentLabel: string;
    durationLabel: string;
    ratio: number;
    waveform: ReactNode;
  };
  restart: {
    disabled: boolean;
    icon?: ReactNode;
    label?: string;
    onClick: () => void;
  };
  skipBackward: {
    disabled: boolean;
    icon?: ReactNode;
    onClick: () => void;
  };
  skipForward: {
    disabled: boolean;
    icon?: ReactNode;
    onClick: () => void;
  };
}

export function CinemaTransportBar({ model }: Readonly<{ model: CinemaTransportModel }>) {
  const progressRatio = clampProgress(model.progress.ratio);
  const primaryMobileLabel = model.primary.mobileLabel ?? model.primary.label;

  return (
    <footer
      className="border-t bg-[var(--vs-raised)] px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(15,23,42,0.08)] vs-border lg:px-7"
      data-cinema-transport-footer=""
    >
      <div className="hidden items-center gap-5 lg:flex">
        <button
          aria-keyshortcuts="Home"
          className="cinema-touch-target inline-flex h-12 items-center gap-2 rounded-md border px-4 text-sm font-medium transition hover:bg-[var(--vs-surface)] disabled:opacity-40 vs-border"
          disabled={model.restart.disabled}
          onClick={model.restart.onClick}
          type="button"
        >
          {model.restart.icon}
          {model.restart.label ?? "Restart"}
        </button>
        <button
          aria-keyshortcuts="ArrowLeft J"
          className="cinema-touch-target inline-flex h-12 min-w-16 items-center justify-center gap-1 rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] disabled:opacity-40 vs-border"
          disabled={model.skipBackward.disabled}
          onClick={model.skipBackward.onClick}
          type="button"
        >
          {model.skipBackward.icon}-{READER_SEEK_SECONDS.toString()}s
        </button>
        <button
          aria-keyshortcuts="Space K"
          className={`cinema-touch-target inline-flex h-16 min-w-40 items-center justify-center gap-3 rounded-full px-6 text-base font-semibold shadow-lg disabled:opacity-50 ${model.primary.className}`}
          disabled={model.primary.disabled}
          onClick={model.primary.onClick}
          type="button"
        >
          {model.primary.icon}
          {model.primary.label}
        </button>
        <button
          aria-keyshortcuts="ArrowRight L"
          className="cinema-touch-target inline-flex h-12 min-w-16 items-center justify-center gap-1 rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] disabled:opacity-40 vs-border"
          disabled={model.skipForward.disabled}
          onClick={model.skipForward.onClick}
          type="button"
        >
          {model.skipForward.icon}+{READER_SEEK_SECONDS.toString()}s
        </button>
        <div className="min-w-0 flex-1">
          {model.progress.waveform}
          <div className="mt-1 flex items-center justify-between text-xs tabular-nums vs-muted">
            <span>{model.progress.currentLabel}</span>
            <span>{model.progress.durationLabel}</span>
          </div>
        </div>
        <select
          aria-label="Playback speed"
          className="cinema-touch-target h-12 rounded-md border bg-[var(--vs-surface)] px-3 text-sm font-semibold outline-none disabled:opacity-40 vs-border"
          disabled={model.playbackRate.disabled}
          onChange={(event) => {
            model.playbackRate.onChange?.(Number(event.currentTarget.value));
          }}
          value={String(model.playbackRate.value)}
        >
          {READER_PLAYBACK_RATES.map((rate) => (
            <option key={rate} value={rate}>
              {rate.toFixed(rate === 1 ? 0 : 2)}x
            </option>
          ))}
        </select>
        {model.bookmark ? (
          <button
            aria-keyshortcuts="B"
            className="cinema-touch-target h-12 rounded-md border px-4 text-sm font-semibold transition hover:bg-[var(--vs-surface)] disabled:opacity-40 vs-border"
            disabled={model.bookmark.disabled}
            onClick={model.bookmark.onClick}
            type="button"
          >
            {model.bookmark.label ?? "Bookmark"}
          </button>
        ) : null}
        {model.displayControls}
      </div>

      <div className="grid gap-3 lg:hidden">
        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm tabular-nums vs-muted">
          <span>{model.progress.currentLabel}</span>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--vs-surface)]">
            <div
              className="h-full rounded-full vs-accent-bg"
              style={{ width: `${Math.round(progressRatio * 100).toString()}%` }}
            />
          </div>
          <span className="text-right">{model.progress.durationLabel}</span>
        </div>
        <div className="grid grid-cols-5 items-center gap-2">
          <IconTransportButton
            disabled={model.skipBackward.disabled}
            label={`-${READER_SEEK_SECONDS.toString()}s`}
            onClick={model.skipBackward.onClick}
          >
            {model.skipBackward.icon}
          </IconTransportButton>
          <button
            aria-keyshortcuts="Space K"
            className={`cinema-touch-target col-span-2 inline-flex h-16 items-center justify-center gap-3 rounded-md px-4 text-base font-semibold shadow-lg disabled:opacity-50 ${model.primary.className}`}
            disabled={model.primary.disabled}
            onClick={model.primary.onClick}
            type="button"
          >
            {model.primary.icon}
            <span>{primaryMobileLabel}</span>
          </button>
          <IconTransportButton
            disabled={model.skipForward.disabled}
            label={`+${READER_SEEK_SECONDS.toString()}s`}
            onClick={model.skipForward.onClick}
          >
            {model.skipForward.icon}
          </IconTransportButton>
          {model.mobileMore ? (
            <IconTransportButton
              ariaControls={model.mobileMore.controlsId}
              ariaExpanded={model.mobileMore.active}
              label={model.mobileMore.label ?? "More"}
              onClick={model.mobileMore.onClick}
            >
              {model.mobileMore.icon}
            </IconTransportButton>
          ) : null}
        </div>
        <div className="flex items-center justify-center gap-2">
          <select
            aria-label="Playback speed"
            className="cinema-touch-target h-11 rounded-md border bg-[var(--vs-surface)] px-3 text-sm font-medium outline-none disabled:opacity-40 vs-border"
            disabled={model.playbackRate.disabled}
            onChange={(event) => {
              model.playbackRate.onChange?.(Number(event.currentTarget.value));
            }}
            value={String(model.playbackRate.value)}
          >
            {READER_PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate.toFixed(rate === 1 ? 0 : 2)}x Speed
              </option>
            ))}
          </select>
          {model.bookmark ? (
            <button
              aria-keyshortcuts="B"
              className="cinema-touch-target h-11 rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] disabled:opacity-40 vs-border"
              disabled={model.bookmark.disabled}
              onClick={model.bookmark.onClick}
              type="button"
            >
              {model.bookmark.label ?? "Bookmark"}
            </button>
          ) : null}
        </div>
      </div>
    </footer>
  );
}

function IconTransportButton({
  ariaControls,
  ariaExpanded,
  children,
  disabled = false,
  label,
  onClick,
}: Readonly<{
  ariaControls?: string;
  ariaExpanded?: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}>) {
  return (
    <button
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      className="cinema-touch-target grid h-12 place-items-center rounded-md border text-sm font-semibold transition hover:bg-[var(--vs-surface)] disabled:opacity-40 vs-border"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}
