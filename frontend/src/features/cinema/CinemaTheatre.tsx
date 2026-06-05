import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  exitTheatreFullscreen,
  isTheatreFullscreenActive,
  requestTheatreFullscreen,
  subscribeTheatreFullscreenChange,
  theatreFullscreenAvailability,
  type TheatreFullscreenAvailability,
} from "../theatre/fullscreen";
import {
  FOCUSED_THEATRE_TOGGLE_CONTROLS_SELECTOR,
  FocusedTheatreChrome,
  useFocusedTheatreControls,
  type FocusedTheatreProgress,
  type FocusedTheatreRevealIntent,
} from "../theatre/FocusedTheatreShell";
import { theatreRuntimeShellState, type TheatreAvailabilityState } from "../theatre/model";
import { READER_SEEK_SECONDS } from "../reader-accessibility";
import { LocalizedPlaybackToolbar, type LocalizedPlaybackToolbarModel } from "../playback";
import type { CinemaTransportModel } from "./CinemaTransportBar";
import type { CinemaPlaybackState, CinemaRendererLifecycleState } from "./model";

const CINEMA_THEATRE_FULLSCREEN_FALLBACK =
  "Cinema Theatre keeps the reader-first listening view in the browser window.";

export interface CinemaTheatreController {
  readonly active: boolean;
  readonly controlsVisible: boolean;
  readonly fullscreenActive: boolean;
  readonly fullscreenAvailability: TheatreFullscreenAvailability;
  readonly exit: () => void;
  readonly hideControls: () => void;
  readonly open: () => void;
  readonly requestFullscreen: () => void;
  readonly revealControls: (intent?: FocusedTheatreRevealIntent) => void;
  readonly toggleControls: () => void;
}

export function useCinemaTheatreController(
  rootRef: RefObject<HTMLElement | null>,
): CinemaTheatreController {
  const [active, setActive] = useState(false);
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [fullscreenAvailability, setFullscreenAvailability] =
    useState<TheatreFullscreenAvailability>(() =>
      theatreFullscreenAvailability(globalThis.document, CINEMA_THEATRE_FULLSCREEN_FALLBACK),
    );
  const focusedControls = useFocusedTheatreControls({ active, initialVisible: false });
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const exit = useCallback(() => {
    const ownerDocument = rootRef.current?.ownerDocument ?? globalThis.document;
    void exitTheatreFullscreen(ownerDocument);
    setActive(false);
    setFullscreenActive(false);
    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(() => {
        returnFocusRef.current?.focus({ preventScroll: true });
        returnFocusRef.current = null;
      });
      return;
    }
    globalThis.setTimeout(() => {
      returnFocusRef.current?.focus({ preventScroll: true });
      returnFocusRef.current = null;
    }, 0);
  }, [rootRef]);

  const open = useCallback(() => {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      returnFocusRef.current = document.activeElement;
    }
    const ownerDocument = rootRef.current?.ownerDocument ?? globalThis.document;
    setFullscreenAvailability(
      theatreFullscreenAvailability(ownerDocument, CINEMA_THEATRE_FULLSCREEN_FALLBACK),
    );
    setActive(true);
    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(() => {
        rootRef.current?.focus({ preventScroll: true });
      });
      return;
    }
    globalThis.setTimeout(() => {
      rootRef.current?.focus({ preventScroll: true });
    }, 0);
  }, [rootRef]);

  const requestFullscreen = useCallback(() => {
    const ownerDocument = rootRef.current?.ownerDocument ?? globalThis.document;
    const availability = theatreFullscreenAvailability(
      ownerDocument,
      CINEMA_THEATRE_FULLSCREEN_FALLBACK,
    );
    setFullscreenAvailability(availability);
    if (!availability.supported) {
      return;
    }
    void requestTheatreFullscreen(rootRef.current, CINEMA_THEATRE_FULLSCREEN_FALLBACK).then(
      (result) => {
        setFullscreenActive(result === "fullscreen");
      },
    );
  }, [rootRef]);

  useEffect(() => {
    const ownerDocument = rootRef.current?.ownerDocument ?? globalThis.document;
    return subscribeTheatreFullscreenChange(ownerDocument, () => {
      setFullscreenActive(isTheatreFullscreenActive(ownerDocument));
    });
  }, [rootRef]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const revealControls = () => {
      focusedControls.revealControls("passive");
    };
    const intentionallyRevealControls = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(FOCUSED_THEATRE_TOGGLE_CONTROLS_SELECTOR)
      ) {
        return;
      }
      focusedControls.revealControls();
    };
    const focusControls = () => {
      focusedControls.focusControls();
    };
    const blurControls = () => {
      focusedControls.blurControls();
    };
    root.addEventListener("pointermove", revealControls);
    root.addEventListener("pointerdown", intentionallyRevealControls);
    root.addEventListener("focusin", focusControls);
    root.addEventListener("focusout", blurControls);
    return () => {
      root.removeEventListener("pointermove", revealControls);
      root.removeEventListener("pointerdown", intentionallyRevealControls);
      root.removeEventListener("focusin", focusControls);
      root.removeEventListener("focusout", blurControls);
    };
  }, [active, focusedControls, rootRef]);

  return useMemo(
    () => ({
      active,
      controlsVisible: focusedControls.controlsVisible,
      exit,
      fullscreenActive,
      fullscreenAvailability,
      hideControls: focusedControls.hideControls,
      open,
      revealControls: focusedControls.revealControls,
      requestFullscreen,
      toggleControls: focusedControls.toggleControls,
    }),
    [
      active,
      exit,
      focusedControls,
      fullscreenActive,
      fullscreenAvailability,
      open,
      requestFullscreen,
    ],
  );
}

export function CinemaTheatreChrome({
  activePassage,
  controlsVisible,
  fullscreenActive,
  fullscreenAvailability,
  highContrast,
  playbackState,
  progress,
  rendererLifecycle,
  scopeLabel,
  sourceLabel,
  surfaceName,
  onExit,
  onRequestFullscreen,
  onToggleControls,
}: Readonly<{
  activePassage: string;
  controlsVisible: boolean;
  fullscreenActive: boolean;
  fullscreenAvailability: TheatreFullscreenAvailability;
  highContrast: boolean;
  playbackState: CinemaPlaybackState;
  progress?: FocusedTheatreProgress | null;
  rendererLifecycle: CinemaRendererLifecycleState;
  scopeLabel: string;
  sourceLabel: string;
  surfaceName: string;
  onExit: () => void;
  onRequestFullscreen: () => void;
  onToggleControls: () => void;
}>) {
  const runtimeShellState = theatreRuntimeShellState({
    availabilityState: theatreAvailabilityStateForCinema(playbackState, rendererLifecycle),
    playbackAvailable: cinemaPlaybackStateHasAudio(playbackState),
    playbackPlaying: playbackState === "playing",
    requestedMode: "audio-follow",
  });
  let chromeSyncStatusLabel: string | null = null;
  if (runtimeShellState.availabilityState !== "ready") {
    chromeSyncStatusLabel = runtimeShellState.detail;
  } else if (highContrast) {
    chromeSyncStatusLabel = "High contrast";
  }
  return (
    <FocusedTheatreChrome
      availabilityState={runtimeShellState.availabilityState}
      actions={[
        {
          controlZone: "environment",
          disabled: !fullscreenAvailability.supported,
          disabledReason: fullscreenAvailability.reason ?? undefined,
          label: fullscreenActive ? "Fullscreen active" : "Native fullscreen",
          testId: "ui-action-cinema-theatre-native-fullscreen",
          onClick: onRequestFullscreen,
        },
      ]}
      activeLabel={surfaceName}
      activeText={activePassage || "Current passage will appear as playback or selection advances."}
      controlsVisible={controlsVisible}
      persistentAction={{
        controlZone: "emergency",
        label: "Exit Theatre",
        testId: "ui-action-cinema-theatre-exit",
        onClick: onExit,
      }}
      progress={progress}
      runtimeMode={runtimeShellState.mode}
      scopeLabel={scopeLabel}
      sourceLabel={sourceLabel}
      statusLabel={fullscreenActive ? "Native fullscreen" : runtimeShellState.statusLabel}
      surfaceLabel="Cinema Theatre"
      syncStatusLabel={chromeSyncStatusLabel}
      testId="cinema-theatre-chrome"
      toggleControlsTestId="ui-action-cinema-theatre-toggle-controls"
      onToggleControls={onToggleControls}
    />
  );
}

function theatreAvailabilityStateForCinema(
  playbackState: CinemaPlaybackState,
  rendererLifecycle: CinemaRendererLifecycleState,
): TheatreAvailabilityState {
  if (rendererLifecycle === "failed") {
    return "renderer-failed";
  }
  if (playbackState === "degraded") {
    return "generation-failed";
  }
  if (playbackState === "generating" || playbackState === "preAudio") {
    return "waiting-audio";
  }
  return "ready";
}

function cinemaPlaybackStateHasAudio(playbackState: CinemaPlaybackState): boolean {
  return (
    playbackState === "completed" ||
    playbackState === "paused" ||
    playbackState === "playable" ||
    playbackState === "playing"
  );
}

export function CinemaTheatreTransport({
  controlsVisible,
  model,
}: Readonly<{
  controlsVisible: boolean;
  model: CinemaTransportModel;
}>) {
  const showPlaybackRate = model.playbackRate.visible ?? !model.playbackRate.disabled;
  const theatreToolbarModel: LocalizedPlaybackToolbarModel = {
    activeDetail:
      model.stateSummary?.detail ??
      "Reader-first audio controls stay pinned near the current passage.",
    activeLabel: model.stateSummary?.title ?? "Cinema audio",
    jumpToAudio: model.bookmark
      ? {
          disabled: model.bookmark.disabled,
          disabledReason: model.bookmark.disabledReason,
          label: model.bookmark.label ?? "Bookmark",
          onClick: model.bookmark.onClick,
          visible: model.bookmark.visible,
        }
      : undefined,
    next: {
      disabled: model.skipForward.disabled,
      disabledReason: model.skipForward.disabledReason,
      icon: model.skipForward.icon,
      label: `+${READER_SEEK_SECONDS.toString()}s`,
      onClick: model.skipForward.onClick,
      visible: model.skipForward.visible,
    },
    playPause: {
      ariaKeyShortcuts: "Space K",
      ariaLabel: model.primary.label,
      disabled: model.primary.disabled,
      disabledReason: model.primary.disabledReason,
      icon: model.primary.icon,
      label: model.primary.mobileLabel ?? model.primary.label,
      primary: true,
      onClick: model.primary.onClick,
      testId: "ui-action-cinema-play",
    },
    previous: {
      disabled: model.skipBackward.disabled,
      disabledReason: model.skipBackward.disabledReason,
      icon: model.skipBackward.icon,
      label: `-${READER_SEEK_SECONDS.toString()}s`,
      onClick: model.skipBackward.onClick,
      visible: model.skipBackward.visible,
    },
    progress: model.progress,
    restart: {
      ariaKeyShortcuts: "Home",
      disabled: model.restart.disabled,
      disabledReason: model.restart.disabledReason,
      icon: model.restart.icon,
      label: model.restart.label ?? "Restart",
      onClick: model.restart.onClick,
    },
    speed: showPlaybackRate
      ? {
          ariaKeyShortcuts: "[ ]",
          disabled: model.playbackRate.disabled,
          disabledReason: model.playbackRate.disabled
            ? "Playback speed is available after generated audio is loaded."
            : undefined,
          value: model.playbackRate.value,
          onChange: model.playbackRate.onChange,
        }
      : undefined,
    stage: "cinema-theatre",
    statusLabel: model.stateSummary?.title,
    testId: "localized-cinema-theatre-playback-toolbar",
    variant: "theatre",
  };
  const progressRatio = clampTheatreProgress(model.progress.ratio);
  return (
    <footer
      className="relative shrink-0 border-t border-[var(--vs-theatre-panel-border)] bg-[var(--vs-theatre-bg)] px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] text-[var(--vs-theatre-text)] shadow-[0_-10px_30px_rgba(0,0,0,0.35)] lg:px-7"
      data-cinema-theatre-controls={controlsVisible ? "visible" : "hidden"}
      data-cinema-theatre-transport=""
      data-cinema-transport-footer=""
      data-testid="cinema-theatre-transport"
    >
      <div className="grid gap-2">
        <div className="grid gap-1" data-cinema-theatre-mini-progress="">
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--vs-surface-muted)]">
            <div
              className="h-full rounded-full bg-[var(--vs-theatre-accent)]"
              style={{ width: `${Math.round(progressRatio * 100).toString()}%` }}
            />
          </div>
          <div className="flex justify-between gap-3 text-xs tabular-nums text-[var(--vs-text-muted)]">
            <span>{model.progress.currentLabel}</span>
            <span>{model.progress.durationLabel}</span>
          </div>
        </div>
        {controlsVisible ? <LocalizedPlaybackToolbar model={theatreToolbarModel} /> : null}
      </div>
    </footer>
  );
}

function clampTheatreProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}
