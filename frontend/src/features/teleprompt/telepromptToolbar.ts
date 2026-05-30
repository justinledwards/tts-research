import type { RevisionBlock } from "../revision";
import { playbackActionLabel } from "../playback";

export type TelepromptShortcutAction =
  | "createListen"
  | "jumpCurrentAudio"
  | "nextCue"
  | "playPause"
  | "previousCue"
  | "restart"
  | "returnPreview"
  | "returnReview"
  | "speedDown"
  | "speedUp";

export interface TelepromptShortcutDefinition {
  readonly action: TelepromptShortcutAction;
  readonly description: string;
  readonly key: string;
  readonly label: string;
}

export const TELEPROMPT_SHORTCUTS: readonly TelepromptShortcutDefinition[] = [
  {
    action: "playPause",
    description: "Play or pause playback",
    key: "Space",
    label: "Play/Pause",
  },
  {
    action: "restart",
    description: "Restart playback",
    key: "Home",
    label: "Restart",
  },
  {
    action: "speedDown",
    description: "Slow playback speed",
    key: "[",
    label: "Speed down",
  },
  {
    action: "speedUp",
    description: "Increase playback speed",
    key: "]",
    label: "Speed up",
  },
  {
    action: "jumpCurrentAudio",
    description: "Jump to the current audio cue",
    key: "Alt+J",
    label: "Jump to audio",
  },
  {
    action: "previousCue",
    description: "Move to the previous cue",
    key: "Left",
    label: "Previous cue",
  },
  {
    action: "nextCue",
    description: "Move to the next cue",
    key: "Right",
    label: "Next cue",
  },
  {
    action: "returnReview",
    description: "Return to Review",
    key: "R",
    label: "Back to Review",
  },
  {
    action: "returnPreview",
    description: "Return to Preview",
    key: "V",
    label: "Back to Preview",
  },
  {
    action: "createListen",
    description: "Create audio and listen",
    key: "C",
    label: playbackActionLabel("createAndListen"),
  },
];

export interface TelepromptKeyboardEventLike {
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly key: string;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly target?: EventTarget | null;
}

export function resolveTelepromptShortcut(
  event: TelepromptKeyboardEventLike,
): TelepromptShortcutAction | null {
  if (shouldIgnoreTelepromptShortcutTarget(event.target)) {
    return null;
  }
  const key = event.key.toLowerCase();
  if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && key === "j") {
    return "jumpCurrentAudio";
  }
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return null;
  }
  if (key === " " || key === "spacebar" || key === "k") {
    return "playPause";
  }
  if (key === "home") {
    return "restart";
  }
  if (key === "[") {
    return "speedDown";
  }
  if (key === "]") {
    return "speedUp";
  }
  if (key === "arrowleft" || key === "arrowup") {
    return "previousCue";
  }
  if (key === "arrowright" || key === "arrowdown") {
    return "nextCue";
  }
  if (key === "r") {
    return "returnReview";
  }
  if (key === "v" || key === "p") {
    return "returnPreview";
  }
  if (key === "c") {
    return "createListen";
  }
  return null;
}

export function shouldIgnoreTelepromptShortcutTarget(target: EventTarget | null | undefined) {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "select" ||
    tagName === "textarea" ||
    target.isContentEditable ||
    Boolean(target.closest("[data-command-palette-ignore-shortcuts]"))
  );
}

export function countTelepromptWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function totalTelepromptWords(blocks: readonly RevisionBlock[]): number {
  return blocks.reduce((total, block) => total + countTelepromptWords(block.spokenText), 0);
}

export function estimateTelepromptDurationMs(wordCount: number, wordsPerMinute = 155): number {
  if (!Number.isFinite(wordCount) || wordCount <= 0) {
    return 0;
  }
  return Math.round((wordCount / Math.max(1, wordsPerMinute)) * 60_000);
}

export function formatTelepromptDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "0:00";
  }
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString()}:${seconds.toString().padStart(2, "0")}`;
}

export function resolveTelepromptBlockIndex(
  blocks: readonly RevisionBlock[],
  activeBlockId: string | null,
): number {
  if (blocks.length === 0) {
    return -1;
  }
  const index = activeBlockId ? blocks.findIndex((block) => block.id === activeBlockId) : -1;
  return Math.max(0, index);
}

export function adjacentTelepromptBlockId(
  blocks: readonly RevisionBlock[],
  activeBlockId: string | null,
  direction: -1 | 1,
): string | null {
  const currentIndex = resolveTelepromptBlockIndex(blocks, activeBlockId);
  if (currentIndex < 0) {
    return null;
  }
  const nextIndex = Math.min(blocks.length - 1, Math.max(0, currentIndex + direction));
  return blocks[nextIndex]?.id ?? null;
}
