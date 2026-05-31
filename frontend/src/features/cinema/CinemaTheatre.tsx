import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Button, StatusChip } from "../../design";
import {
  exitTheatreFullscreen,
  isTheatreFullscreenActive,
  requestTheatreFullscreen,
  subscribeTheatreFullscreenChange,
  theatreFullscreenAvailability,
  type TheatreFullscreenAvailability,
} from "../theatre/fullscreen";
import { READER_SEEK_SECONDS } from "../reader-accessibility";
import { readingSurfaceDataAttributes } from "../reading-surface";
import { LocalizedPlaybackToolbar, type LocalizedPlaybackToolbarModel } from "../playback";
import type { CinemaTransportModel } from "./CinemaTransportBar";

const CINEMA_THEATRE_FULLSCREEN_FALLBACK =
  "Cinema Theatre keeps the reader-first listening view in the browser window.";

export interface CinemaTheatreController {
  readonly active: boolean;
  readonly controlsVisible: boolean;
  readonly fullscreenActive: boolean;
  readonly fullscreenAvailability: TheatreFullscreenAvailability;
  readonly exit: () => void;
  readonly open: () => void;
  readonly requestFullscreen: () => void;
  readonly toggleControls: () => void;
}

export function useCinemaTheatreController(
  rootRef: RefObject<HTMLElement | null>,
): CinemaTheatreController {
  const [active, setActive] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [fullscreenAvailability, setFullscreenAvailability] =
    useState<TheatreFullscreenAvailability>(() =>
      theatreFullscreenAvailability(globalThis.document, CINEMA_THEATRE_FULLSCREEN_FALLBACK),
    );
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const exit = useCallback(() => {
    const ownerDocument = rootRef.current?.ownerDocument ?? globalThis.document;
    void exitTheatreFullscreen(ownerDocument);
    setActive(false);
    setControlsVisible(true);
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
    setControlsVisible(true);
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

  const toggleControls = useCallback(() => {
    setControlsVisible((current) => !current);
  }, []);

  return useMemo(
    () => ({
      active,
      controlsVisible,
      exit,
      fullscreenActive,
      fullscreenAvailability,
      open,
      requestFullscreen,
      toggleControls,
    }),
    [
      active,
      controlsVisible,
      exit,
      fullscreenActive,
      fullscreenAvailability,
      open,
      requestFullscreen,
      toggleControls,
    ],
  );
}

export function CinemaTheatreChrome({
  activePassage,
  controlsVisible,
  fullscreenActive,
  fullscreenAvailability,
  highContrast,
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
  scopeLabel: string;
  sourceLabel: string;
  surfaceName: string;
  onExit: () => void;
  onRequestFullscreen: () => void;
  onToggleControls: () => void;
}>) {
  return (
    <header
      className={`grid gap-2 border-b bg-zinc-950 px-4 py-3 text-white ${
        highContrast ? "border-white" : "border-white/15"
      }`}
      data-testid="cinema-theatre-chrome"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <StatusChip tone="success">
            {fullscreenActive ? "Native fullscreen" : "Cinema Theatre"}
          </StatusChip>
          <span className="truncate text-sm font-semibold">{surfaceName}</span>
          <span className="truncate text-xs text-zinc-300">
            {sourceLabel} · {scopeLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="border-white/20 bg-white/10 text-white hover:bg-white/15"
            data-testid="ui-action-cinema-theatre-toggle-controls"
            onClick={onToggleControls}
            selected={controlsVisible}
            size="sm"
            variant="secondary"
          >
            {controlsVisible ? "Hide controls" : "Show controls"}
          </Button>
          <Button
            className="border-white/20 bg-white/10 text-white hover:bg-white/15"
            data-testid="ui-action-cinema-theatre-native-fullscreen"
            disabled={!fullscreenAvailability.supported}
            disabledReason={fullscreenAvailability.reason ?? undefined}
            onClick={onRequestFullscreen}
            size="sm"
            variant="secondary"
          >
            {fullscreenActive ? "Fullscreen active" : "Native fullscreen"}
          </Button>
          <Button
            className="border-white/25 bg-white text-zinc-950 hover:bg-zinc-200"
            data-testid="ui-action-cinema-theatre-exit"
            onClick={onExit}
            size="sm"
            variant="primary"
          >
            Exit Theatre
          </Button>
        </div>
      </div>
      <p
        className="line-clamp-2 max-w-5xl text-sm leading-6 text-zinc-200"
        data-testid="cinema-theatre-passage"
        {...readingSurfaceDataAttributes({ kind: "source" })}
      >
        {activePassage || "Current passage will appear as playback or selection advances."}
      </p>
    </header>
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
  return (
    <footer
      className="relative shrink-0 border-t border-white/15 bg-zinc-950 px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] text-white shadow-[0_-10px_30px_rgba(0,0,0,0.35)] lg:px-7"
      data-cinema-theatre-controls={controlsVisible ? "visible" : "hidden"}
      data-cinema-theatre-transport=""
      data-cinema-transport-footer=""
      data-testid="cinema-theatre-transport"
    >
      <div className="grid gap-2">
        {controlsVisible ? (
          <LocalizedPlaybackToolbar model={theatreToolbarModel} />
        ) : (
          <p className="text-center text-xs font-semibold text-zinc-400">
            Theatre controls hidden. Use Toggle Theatre controls or the top bar to show them.
          </p>
        )}
      </div>
    </footer>
  );
}
