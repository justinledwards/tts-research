import { useEffect } from "react";
import {
  nextReaderPlaybackRate,
  readerKeyboardCommandForKey,
  shouldIgnoreReaderKeyboardTarget,
  type ReaderKeyboardCommand,
} from "./model";

export interface ReaderPlaybackKeyboardControls {
  isAvailable: boolean;
  playbackRate: number;
  setPlaybackRate?: (rate: number) => void;
  skipBy?: (seconds: number) => void;
}

export interface ReaderKeyboardControlOptions {
  canBookmark?: boolean;
  onBookmark?: () => void;
  onClose: () => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onSkip: (seconds: number) => void;
  playbackControls: ReaderPlaybackKeyboardControls;
}

export function useReaderKeyboardControls({
  canBookmark = false,
  onBookmark,
  onClose,
  onPlayPause,
  onRestart,
  onSkip,
  playbackControls,
}: ReaderKeyboardControlOptions) {
  useEffect(() => {
    const actions = readerKeyboardActions({
      canBookmark,
      onBookmark,
      onClose,
      onPlayPause,
      onRestart,
      onSkip,
      playbackControls,
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      const command = readerKeyboardCommandForKey(event.key);
      if (!command) {
        return;
      }
      if (command !== "close" && shouldIgnoreReaderKeyboardTarget(event.target)) {
        return;
      }
      const action = actions[command];
      if (!action) {
        return;
      }
      event.preventDefault();
      action();
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
    };
  }, [canBookmark, onBookmark, onClose, onPlayPause, onRestart, onSkip, playbackControls]);
}

export function readerKeyboardActions({
  canBookmark = false,
  onBookmark,
  onClose,
  onPlayPause,
  onRestart,
  onSkip,
  playbackControls,
}: ReaderKeyboardControlOptions): Partial<Record<ReaderKeyboardCommand, () => void>> {
  const actions: Partial<Record<ReaderKeyboardCommand, () => void>> = {
    close: onClose,
  };
  if (canBookmark && onBookmark) {
    actions.bookmark = onBookmark;
  }
  if (playbackControls.isAvailable) {
    actions.restart = onRestart;
    actions.togglePlayback = onPlayPause;
  }
  if (playbackControls.skipBy) {
    actions.seekBackward = () => {
      onSkip(-10);
    };
    actions.seekForward = () => {
      onSkip(10);
    };
  }
  const setPlaybackRate = playbackControls.setPlaybackRate;
  if (setPlaybackRate) {
    actions.speedDown = () => {
      setPlaybackRate(nextReaderPlaybackRate(playbackControls.playbackRate, -1));
    };
    actions.speedUp = () => {
      setPlaybackRate(nextReaderPlaybackRate(playbackControls.playbackRate, 1));
    };
  }
  return actions;
}
