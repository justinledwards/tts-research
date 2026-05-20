import type { ReactNode } from "react";
import { READER_PLAYBACK_RATES, READER_SEEK_SECONDS } from "../reader-accessibility";
import type { CinemaPlaybackState } from "./model";

interface CinemaTransportButtonModel {
  disabled: boolean;
  icon?: ReactNode;
  label?: string;
  onClick: () => void;
  visible?: boolean;
}

export interface CinemaTransportModel {
  bookmark?: CinemaTransportButtonModel;
  displayControls?: ReactNode;
  estimatedReadyLabel?: string;
  generationSettings?: ReactNode;
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
    visible?: boolean;
  };
  playbackState: CinemaPlaybackState;
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
  restart: CinemaTransportButtonModel;
  skipBackward: CinemaTransportButtonModel;
  skipForward: CinemaTransportButtonModel;
  stateSummary?: {
    detail: string;
    title: string;
  };
}

const PLAYBACK_TRANSPORT_STATES = new Set<CinemaPlaybackState>([
  "playable",
  "playing",
  "paused",
  "completed",
]);

export function CinemaTransportBar({ model }: Readonly<{ model: CinemaTransportModel }>) {
  if (model.playbackState === "preAudio") {
    return <PreAudioTransport model={model} />;
  }
  if (model.playbackState === "generating") {
    return <GeneratingTransport model={model} />;
  }
  if (model.playbackState === "degraded") {
    return <DegradedTransport model={model} />;
  }
  if (PLAYBACK_TRANSPORT_STATES.has(model.playbackState)) {
    return <PlaybackTransport model={model} />;
  }
  return <PreAudioTransport model={model} />;
}

function PreAudioTransport({ model }: Readonly<{ model: CinemaTransportModel }>) {
  return (
    <TransportFooter>
      <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
        <button
          className={`cinema-touch-target inline-flex h-14 min-w-44 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold shadow-lg disabled:opacity-50 ${model.primary.className}`}
          disabled={model.primary.disabled}
          onClick={model.primary.onClick}
          type="button"
        >
          {model.primary.icon}
          {model.primary.label}
        </button>
        <TransportStateSummary
          detail={model.stateSummary?.detail ?? "Audio has not been generated for this source yet."}
          title={model.stateSummary?.title ?? "Ready to create audio"}
        />
        <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 lg:justify-end">
          {model.generationSettings}
          {model.mobileMore ? (
            <TextTransportButton
              active={model.mobileMore.active}
              ariaControls={model.mobileMore.controlsId}
              label={model.mobileMore.label ?? "More"}
              onClick={model.mobileMore.onClick}
            >
              {model.mobileMore.icon}
              {model.mobileMore.label ?? "More"}
            </TextTransportButton>
          ) : null}
        </div>
      </div>
    </TransportFooter>
  );
}

function GeneratingTransport({ model }: Readonly<{ model: CinemaTransportModel }>) {
  const progressRatio = clampProgress(model.progress.ratio);
  const progressWidth =
    progressRatio > 0 ? `${Math.round(progressRatio * 100).toString()}%` : "35%";

  return (
    <TransportFooter>
      <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
        <button
          className={`cinema-touch-target inline-flex h-14 min-w-44 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold shadow-lg disabled:opacity-50 ${model.primary.className}`}
          disabled={model.primary.disabled}
          onClick={model.primary.onClick}
          type="button"
        >
          {model.primary.icon}
          {model.primary.label}
        </button>
        <div className="min-w-0">
          <TransportStateSummary
            detail={
              model.stateSummary?.detail ?? "The reader stays available while narration builds."
            }
            title={model.stateSummary?.title ?? "Creating audio"}
          />
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--vs-surface)]">
            <div
              className={`h-full rounded-full vs-accent-bg ${progressRatio > 0 ? "" : "animate-pulse"}`}
              style={{ width: progressWidth }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-xs tabular-nums vs-muted">
            <span>{model.progress.currentLabel}</span>
            <span>{model.estimatedReadyLabel ?? model.progress.durationLabel}</span>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 lg:justify-end">
          {model.generationSettings}
          {model.mobileMore ? (
            <TextTransportButton
              active={model.mobileMore.active}
              ariaControls={model.mobileMore.controlsId}
              label={model.mobileMore.label ?? "More"}
              onClick={model.mobileMore.onClick}
            >
              {model.mobileMore.icon}
              {model.mobileMore.label ?? "More"}
            </TextTransportButton>
          ) : null}
        </div>
      </div>
    </TransportFooter>
  );
}

function DegradedTransport({ model }: Readonly<{ model: CinemaTransportModel }>) {
  return (
    <TransportFooter>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <TransportStateSummary
          detail={
            model.stateSummary?.detail ?? "Audio is unavailable, but the reader remains usable."
          }
          title={model.stateSummary?.title ?? "Audio needs attention"}
        />
        <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 lg:justify-end">
          <button
            className={`cinema-touch-target inline-flex h-12 min-w-36 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold shadow disabled:opacity-50 ${model.primary.className}`}
            disabled={model.primary.disabled}
            onClick={model.primary.onClick}
            type="button"
          >
            {model.primary.icon}
            {model.primary.label}
          </button>
          {model.mobileMore ? (
            <TextTransportButton
              active={model.mobileMore.active}
              ariaControls={model.mobileMore.controlsId}
              label={model.mobileMore.label ?? "More"}
              onClick={model.mobileMore.onClick}
            >
              {model.mobileMore.icon}
              {model.mobileMore.label ?? "More"}
            </TextTransportButton>
          ) : null}
        </div>
      </div>
    </TransportFooter>
  );
}

function PlaybackTransport({ model }: Readonly<{ model: CinemaTransportModel }>) {
  const progressRatio = clampProgress(model.progress.ratio);
  const primaryMobileLabel = model.primary.mobileLabel ?? model.primary.label;
  const showBookmark = Boolean(model.bookmark && shouldShowControl(model.bookmark));
  const showPlaybackRate = model.playbackRate.visible ?? !model.playbackRate.disabled;
  const showRestart = shouldShowControl(model.restart);
  const showSkipBackward = shouldShowControl(model.skipBackward);
  const showSkipForward = shouldShowControl(model.skipForward);

  return (
    <TransportFooter>
      <div className="hidden items-center gap-4 lg:flex">
        {showRestart ? (
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
        ) : null}
        {showSkipBackward ? (
          <button
            aria-keyshortcuts="ArrowLeft J"
            className="cinema-touch-target inline-flex h-12 min-w-16 items-center justify-center gap-1 rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] disabled:opacity-40 vs-border"
            disabled={model.skipBackward.disabled}
            onClick={model.skipBackward.onClick}
            type="button"
          >
            {model.skipBackward.icon}-{READER_SEEK_SECONDS.toString()}s
          </button>
        ) : null}
        <button
          aria-keyshortcuts="Space K"
          className={`cinema-touch-target inline-flex h-16 min-w-36 items-center justify-center gap-3 rounded-full px-6 text-base font-semibold shadow-lg disabled:opacity-50 ${model.primary.className}`}
          disabled={model.primary.disabled}
          onClick={model.primary.onClick}
          type="button"
        >
          {model.primary.icon}
          {model.primary.label}
        </button>
        {showSkipForward ? (
          <button
            aria-keyshortcuts="ArrowRight L"
            className="cinema-touch-target inline-flex h-12 min-w-16 items-center justify-center gap-1 rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] disabled:opacity-40 vs-border"
            disabled={model.skipForward.disabled}
            onClick={model.skipForward.onClick}
            type="button"
          >
            {model.skipForward.icon}+{READER_SEEK_SECONDS.toString()}s
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          {model.progress.waveform}
          <div className="mt-1 flex items-center justify-between text-xs tabular-nums vs-muted">
            <span>{model.progress.currentLabel}</span>
            <span>{model.progress.durationLabel}</span>
          </div>
        </div>
        {showPlaybackRate ? <PlaybackRateSelect model={model} /> : null}
        {showBookmark && model.bookmark ? (
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
          {showSkipBackward ? (
            <IconTransportButton
              disabled={model.skipBackward.disabled}
              label={`-${READER_SEEK_SECONDS.toString()}s`}
              onClick={model.skipBackward.onClick}
            >
              {model.skipBackward.icon}
            </IconTransportButton>
          ) : (
            <span aria-hidden="true" />
          )}
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
          {showSkipForward ? (
            <IconTransportButton
              disabled={model.skipForward.disabled}
              label={`+${READER_SEEK_SECONDS.toString()}s`}
              onClick={model.skipForward.onClick}
            >
              {model.skipForward.icon}
            </IconTransportButton>
          ) : (
            <span aria-hidden="true" />
          )}
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
          {showPlaybackRate ? <PlaybackRateSelect model={model} mobile /> : null}
          {showBookmark && model.bookmark ? (
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
    </TransportFooter>
  );
}

function TransportFooter({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <footer
      className="border-t bg-[var(--vs-raised)] px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(15,23,42,0.08)] vs-border lg:px-7"
      data-cinema-transport-footer=""
    >
      {children}
    </footer>
  );
}

function TransportStateSummary({ detail, title }: Readonly<{ detail: string; title: string }>) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-[var(--vs-text)]">{title}</p>
      <p className="mt-1 line-clamp-2 text-sm leading-5 vs-muted">{detail}</p>
    </div>
  );
}

function TextTransportButton({
  active,
  ariaControls,
  children,
  label,
  onClick,
}: Readonly<{
  active?: boolean;
  ariaControls?: string;
  children: ReactNode;
  label: string;
  onClick: () => void;
}>) {
  return (
    <button
      aria-controls={ariaControls}
      aria-expanded={active}
      aria-label={label}
      className="cinema-touch-target inline-flex h-11 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] vs-border"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function PlaybackRateSelect({
  mobile = false,
  model,
}: Readonly<{ mobile?: boolean; model: CinemaTransportModel }>) {
  return (
    <select
      aria-label="Playback speed"
      className={`cinema-touch-target rounded-md border bg-[var(--vs-surface)] px-3 text-sm outline-none disabled:opacity-40 vs-border ${
        mobile ? "h-11 font-medium" : "h-12 font-semibold"
      }`}
      disabled={model.playbackRate.disabled}
      onChange={(event) => {
        model.playbackRate.onChange?.(Number(event.currentTarget.value));
      }}
      value={String(model.playbackRate.value)}
    >
      {READER_PLAYBACK_RATES.map((rate) => (
        <option key={rate} value={rate}>
          {rate.toFixed(rate === 1 ? 0 : 2)}x{mobile ? " Speed" : ""}
        </option>
      ))}
    </select>
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

function shouldShowControl(control: { disabled: boolean; visible?: boolean }): boolean {
  return control.visible ?? !control.disabled;
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}
