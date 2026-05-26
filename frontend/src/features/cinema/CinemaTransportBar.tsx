import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button, fieldControlClassName } from "../../design";
import { READER_PLAYBACK_RATES, READER_SEEK_SECONDS } from "../reader-accessibility";
import {
  generatedAudioLifecycleFromPlaybackState,
  playbackActionDataAttributes,
  playbackActionDisabledReason,
  type PlaybackActionKey,
} from "../playback";
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
  const primaryAction = cinemaPrimaryActionForState(model.playbackState);
  const lifecycle = generatedAudioLifecycleFromPlaybackState(model.playbackState);
  return (
    <TransportFooter>
      <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
        <Button
          {...playbackActionDataAttributes(primaryAction, lifecycle, { primary: true })}
          className={`h-14 min-w-44 gap-2 px-5 shadow-lg ${model.primary.className}`}
          disabled={model.primary.disabled}
          disabledReason={cinemaPrimaryDisabledReason(model, primaryAction, lifecycle)}
          onClick={model.primary.onClick}
          size="lg"
          variant="primary"
        >
          {model.primary.icon}
          {model.primary.label}
        </Button>
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
  const primaryAction = cinemaPrimaryActionForState(model.playbackState);
  const lifecycle = generatedAudioLifecycleFromPlaybackState(model.playbackState);

  return (
    <TransportFooter>
      <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
        <Button
          {...playbackActionDataAttributes(primaryAction, lifecycle, { primary: true })}
          className={`h-14 min-w-44 gap-2 px-5 shadow-lg ${model.primary.className}`}
          disabled={model.primary.disabled}
          disabledReason={cinemaPrimaryDisabledReason(model, primaryAction, lifecycle)}
          onClick={model.primary.onClick}
          size="lg"
          variant="primary"
        >
          {model.primary.icon}
          {model.primary.label}
        </Button>
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
  const primaryAction = cinemaPrimaryActionForState(model.playbackState);
  const lifecycle = generatedAudioLifecycleFromPlaybackState(model.playbackState);
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
          <Button
            {...playbackActionDataAttributes(primaryAction, lifecycle, { primary: true })}
            className={`h-12 min-w-36 gap-2 shadow ${model.primary.className}`}
            disabled={model.primary.disabled}
            disabledReason={cinemaPrimaryDisabledReason(model, primaryAction, lifecycle)}
            onClick={model.primary.onClick}
            size="lg"
            variant="primary"
          >
            {model.primary.icon}
            {model.primary.label}
          </Button>
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
  const lifecycle = generatedAudioLifecycleFromPlaybackState(model.playbackState);
  const visibility: PlaybackTransportVisibility = {
    bookmark: Boolean(model.bookmark && shouldShowControl(model.bookmark)),
    displayControls: Boolean(model.displayControls),
    playbackRate: model.playbackRate.visible ?? !model.playbackRate.disabled,
    restart: shouldShowControl(model.restart),
    skipBackward: shouldShowControl(model.skipBackward),
    skipForward: shouldShowControl(model.skipForward),
  };

  return (
    <TransportFooter>
      <DesktopPlaybackTransport lifecycle={lifecycle} model={model} visibility={visibility} />
      <MobilePlaybackTransport
        lifecycle={lifecycle}
        model={model}
        progressRatio={progressRatio}
        visibility={visibility}
      />
    </TransportFooter>
  );
}

interface PlaybackTransportVisibility {
  bookmark: boolean;
  displayControls: boolean;
  playbackRate: boolean;
  restart: boolean;
  skipBackward: boolean;
  skipForward: boolean;
}

function DesktopPlaybackTransport({
  lifecycle,
  model,
  visibility,
}: Readonly<{
  lifecycle: ReturnType<typeof generatedAudioLifecycleFromPlaybackState>;
  model: CinemaTransportModel;
  visibility: PlaybackTransportVisibility;
}>) {
  const displayPopover = useCinemaDisplayPopover(visibility.displayControls);

  return (
    <div
      className="hidden min-w-0 grid-cols-[auto_minmax(14rem,1fr)_auto] items-center gap-3 lg:grid"
      data-cinema-footer-row="desktop-transport"
      data-cinema-primary-playback-group=""
    >
      <div className="flex min-w-0 items-center gap-2">
        {visibility.restart ? (
          <Button
            data-ui-action-owner="cinema"
            aria-keyshortcuts="Home"
            className="h-11 gap-2"
            disabled={model.restart.disabled}
            onClick={model.restart.onClick}
            size="md"
            variant="secondary"
          >
            {model.restart.icon}
            {model.restart.label ?? "Restart"}
          </Button>
        ) : null}
        {visibility.skipBackward ? (
          <Button
            data-ui-action-owner="cinema"
            aria-keyshortcuts="ArrowLeft J"
            className="h-11 min-w-14 gap-1 px-3"
            disabled={model.skipBackward.disabled}
            onClick={model.skipBackward.onClick}
            size="md"
            variant="secondary"
          >
            {model.skipBackward.icon}-{READER_SEEK_SECONDS.toString()}s
          </Button>
        ) : null}
        <Button
          {...playbackActionDataAttributes("play", lifecycle, { primary: true })}
          aria-keyshortcuts="Space K"
          className={`h-12 min-w-32 gap-2 rounded-full px-5 text-sm shadow-md ${model.primary.className}`}
          disabled={model.primary.disabled}
          disabledReason={cinemaPrimaryDisabledReason(model, "play", lifecycle)}
          onClick={model.primary.onClick}
          size="lg"
          variant="primary"
        >
          {model.primary.icon}
          {model.primary.label}
        </Button>
        {visibility.skipForward ? (
          <Button
            data-ui-action-owner="cinema"
            aria-keyshortcuts="ArrowRight L"
            className="h-11 min-w-14 gap-1 px-3"
            disabled={model.skipForward.disabled}
            onClick={model.skipForward.onClick}
            size="md"
            variant="secondary"
          >
            {model.skipForward.icon}+{READER_SEEK_SECONDS.toString()}s
          </Button>
        ) : null}
      </div>
      <div className="min-w-0">
        {model.progress.waveform}
        <div className="mt-0.5 flex items-center justify-between text-xs tabular-nums vs-muted">
          <span>{model.progress.currentLabel}</span>
          <span>{model.progress.durationLabel}</span>
        </div>
      </div>
      <div className="flex min-w-0 items-center justify-end gap-2">
        {visibility.playbackRate ? <PlaybackRateSelect model={model} /> : null}
        {visibility.bookmark && model.bookmark ? (
          <Button
            data-ui-action-owner="cinema"
            aria-keyshortcuts="B"
            className="h-11"
            disabled={model.bookmark.disabled}
            onClick={model.bookmark.onClick}
            size="md"
            variant="secondary"
          >
            {model.bookmark.label ?? "Bookmark"}
          </Button>
        ) : null}
        {visibility.displayControls ? (
          <ReaderDisplayPopoverButton model={model} popover={displayPopover} />
        ) : null}
      </div>
    </div>
  );
}

function ReaderDisplayPopoverButton({
  model,
  popover,
}: Readonly<{
  model: CinemaTransportModel;
  popover: ReturnType<typeof useCinemaDisplayPopover>;
}>) {
  return (
    <div className="relative">
      <Button
        data-ui-action-owner="cinema-display"
        aria-controls={popover.id}
        aria-expanded={popover.open}
        aria-haspopup="dialog"
        aria-label="Open reader display settings"
        className="h-11"
        onClick={popover.toggle}
        ref={popover.buttonRef}
        selected={popover.open}
        size="md"
        variant="secondary"
      >
        Display
      </Button>
      {popover.open ? (
        <div
          aria-label="Reader display settings"
          className="absolute right-0 bottom-[calc(100%+0.5rem)] z-30 w-[min(26rem,calc(100vw-2rem))] rounded-md border bg-[var(--vs-raised)] p-4 shadow-xl vs-border"
          data-cinema-display-popover=""
          id={popover.id}
          onKeyDown={popover.onKeyDown}
          ref={popover.popoverRef}
          role="dialog"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--vs-text)]">Reader display</p>
            <p className="text-xs vs-muted">Applies to this reader</p>
          </div>
          {model.displayControls}
        </div>
      ) : null}
    </div>
  );
}

function MobilePlaybackTransport({
  lifecycle,
  model,
  progressRatio,
  visibility,
}: Readonly<{
  lifecycle: ReturnType<typeof generatedAudioLifecycleFromPlaybackState>;
  model: CinemaTransportModel;
  progressRatio: number;
  visibility: PlaybackTransportVisibility;
}>) {
  const primaryMobileLabel = model.primary.mobileLabel ?? model.primary.label;

  return (
    <div className="grid gap-3 lg:hidden">
      <div
        className="grid grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm tabular-nums vs-muted"
        data-cinema-footer-row="mobile-progress"
      >
        <span>{model.progress.currentLabel}</span>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--vs-surface)]">
          <div
            className="h-full rounded-full vs-accent-bg"
            style={{ width: `${Math.round(progressRatio * 100).toString()}%` }}
          />
        </div>
        <span className="text-right">{model.progress.durationLabel}</span>
      </div>
      <div
        className="grid grid-cols-5 items-center gap-2"
        data-cinema-footer-row="mobile-primary"
        data-cinema-primary-playback-group=""
      >
        {visibility.skipBackward ? (
          <IconTransportButton
            disabled={model.skipBackward.disabled}
            label={`-${READER_SEEK_SECONDS.toString()}s`}
            onClick={model.skipBackward.onClick}
            uiActionOwner="cinema"
          >
            {model.skipBackward.icon}
          </IconTransportButton>
        ) : (
          <span aria-hidden="true" />
        )}
        <Button
          {...playbackActionDataAttributes("play", lifecycle, { primary: true })}
          aria-keyshortcuts="Space K"
          className={`col-span-2 h-16 gap-3 px-4 text-base shadow-lg ${model.primary.className}`}
          disabled={model.primary.disabled}
          disabledReason={cinemaPrimaryDisabledReason(model, "play", lifecycle)}
          onClick={model.primary.onClick}
          size="lg"
          variant="primary"
        >
          {model.primary.icon}
          <span>{primaryMobileLabel}</span>
        </Button>
        {visibility.skipForward ? (
          <IconTransportButton
            disabled={model.skipForward.disabled}
            label={`+${READER_SEEK_SECONDS.toString()}s`}
            onClick={model.skipForward.onClick}
            uiActionOwner="cinema"
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
      <div
        className="flex items-center justify-center gap-2"
        data-cinema-footer-row="mobile-secondary"
      >
        {visibility.playbackRate ? <PlaybackRateSelect model={model} mobile /> : null}
        {visibility.bookmark && model.bookmark ? (
          <Button
            data-ui-action-owner="cinema"
            aria-keyshortcuts="B"
            className="h-11"
            disabled={model.bookmark.disabled}
            onClick={model.bookmark.onClick}
            size="md"
            variant="secondary"
          >
            {model.bookmark.label ?? "Bookmark"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function useCinemaDisplayPopover(available: boolean) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!available) {
      setOpen(false);
    }
  }, [available]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  return {
    buttonRef,
    id,
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Escape") {
        return;
      }
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    },
    open,
    popoverRef,
    toggle: () => {
      setOpen((current) => !current);
    },
  };
}

function TransportFooter({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <footer
      className="relative shrink-0 border-t bg-[var(--vs-raised)] px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(15,23,42,0.08)] vs-border lg:max-h-[var(--cinema-footer-desktop-max-height)] lg:px-7"
      data-cinema-footer-budgeted=""
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
    <Button
      aria-controls={ariaControls}
      aria-expanded={active}
      aria-label={label}
      className="h-11 gap-2"
      onClick={onClick}
      selected={active}
      size="md"
      variant="secondary"
    >
      {children}
    </Button>
  );
}

function PlaybackRateSelect({
  mobile = false,
  model,
}: Readonly<{ mobile?: boolean; model: CinemaTransportModel }>) {
  return (
    <select
      data-ui-action-owner="cinema"
      aria-label="Playback speed"
      className={`${fieldControlClassName} ${mobile ? "h-11 font-medium" : "h-11 font-semibold"}`}
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
  uiActionOwner,
}: Readonly<{
  ariaControls?: string;
  ariaExpanded?: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  uiActionOwner?: string;
}>) {
  return (
    <Button
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      className="grid h-12 place-items-center"
      data-ui-action-owner={uiActionOwner}
      disabled={disabled}
      onClick={onClick}
      size="icon"
      variant="secondary"
    >
      {children}
      <span className="sr-only">{label}</span>
    </Button>
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

function cinemaPrimaryActionForState(playbackState: CinemaPlaybackState): PlaybackActionKey {
  if (playbackState === "degraded") {
    return "rebuildAudio";
  }
  if (playbackState === "preAudio" || playbackState === "generating") {
    return "createAndListen";
  }
  return "play";
}

function cinemaPrimaryDisabledReason(
  model: CinemaTransportModel,
  action: PlaybackActionKey,
  lifecycle: ReturnType<typeof generatedAudioLifecycleFromPlaybackState>,
): string | undefined {
  if (!model.primary.disabled) {
    return undefined;
  }
  return playbackActionDisabledReason({
    action,
    fallbackReason:
      model.stateSummary?.detail ??
      "Playback controls are unavailable until the reader can attach to generated audio.",
    lifecycle,
  });
}
