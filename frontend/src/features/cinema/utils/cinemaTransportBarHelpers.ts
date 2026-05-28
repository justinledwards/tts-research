import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  generatedAudioLifecycleFromPlaybackState,
  playbackActionDisabledReason,
  type PlaybackActionKey,
} from "../playback";
import type { CinemaPlaybackState } from "./model";

export const PLAYBACK_TRANSPORT_STATES = new Set<CinemaPlaybackState>([
  "playable",
  "playing",
  "paused",
  "completed",
]);

export function useCinemaDisplayPopover(available: boolean) {
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

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function labelId(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replaceAll("+", "plus")
    .replaceAll("-", "minus")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

export function shouldShowControl(control: { disabled: boolean; visible?: boolean }): boolean {
  return control.visible ?? !control.disabled;
}

export function cinemaPrimaryActionForState(playbackState: CinemaPlaybackState): PlaybackActionKey {
  if (playbackState === "degraded") {
    return "rebuildAudio";
  }
  if (playbackState === "preAudio" || playbackState === "generating") {
    return "createAndListen";
  }
  return "play";
}

export function cinemaPrimaryDisabledReason(
  model: {
    primary: {
      disabled: boolean;
      disabledReason?: string;
    };
    stateSummary?: {
      detail?: string;
    };
  },
  action: PlaybackActionKey,
  lifecycle: ReturnType<typeof generatedAudioLifecycleFromPlaybackState>,
): string | undefined {
  if (!model.primary.disabled) {
    return undefined;
  }
  if (model.primary.disabledReason) {
    return model.primary.disabledReason;
  }
  return playbackActionDisabledReason({
    action,
    fallbackReason:
      model.stateSummary?.detail ??
      "Playback controls are unavailable until the reader can attach to generated audio.",
    lifecycle,
  });
}
