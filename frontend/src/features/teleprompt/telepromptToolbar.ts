import { revisionBlockIsSpeakable, type RevisionBlock } from "../revision";
import { playbackActionLabel } from "../playback";
import {
  DEFAULT_SHORTCUT_PREFERENCES,
  resolveShortcutCommandBinding,
  shouldIgnoreNarrationShortcutEvent,
  shouldIgnoreNarrationShortcutTarget,
  type ShortcutCommandId,
  type ShortcutPreferences,
} from "../shortcuts/shortcutRegistry";

export type TelepromptShortcutAction =
  | "createListen"
  | "jumpCurrentAudio"
  | "nextCue"
  | "openTheatre"
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
  {
    action: "openTheatre",
    description: "Open Theatre from the current cue",
    key: "T",
    label: "Open Theatre",
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
  shortcutPreferences: ShortcutPreferences = DEFAULT_SHORTCUT_PREFERENCES,
): TelepromptShortcutAction | null {
  if (shouldIgnoreTelepromptShortcutEvent(event)) {
    return null;
  }
  return telepromptActionForShortcutCommand(
    resolveShortcutCommandBinding(event, shortcutPreferences, "teleprompt"),
  );
}

export function shouldIgnoreTelepromptShortcutTarget(target: EventTarget | null | undefined) {
  return shouldIgnoreNarrationShortcutTarget(target ?? null);
}

export function shouldIgnoreTelepromptShortcutEvent(event: TelepromptKeyboardEventLike) {
  return shouldIgnoreNarrationShortcutEvent(event);
}

function telepromptActionForShortcutCommand(
  resolved: Readonly<{ bindingId: string; commandId: ShortcutCommandId }> | null,
): TelepromptShortcutAction | null {
  if (!resolved) {
    return null;
  }
  switch (resolved.commandId) {
    case "teleprompt.playPause": {
      return "playPause";
    }
    case "teleprompt.createListen": {
      return "createListen";
    }
    case "teleprompt.jumpCurrentAudio": {
      return "jumpCurrentAudio";
    }
    case "teleprompt.openTheatre": {
      return "openTheatre";
    }
    case "teleprompt.nextCue": {
      return "nextCue";
    }
    case "teleprompt.previousCue": {
      return "previousCue";
    }
    case "teleprompt.restart": {
      return "restart";
    }
    case "teleprompt.returnPreview": {
      return "returnPreview";
    }
    case "teleprompt.returnReview": {
      return "returnReview";
    }
    case "teleprompt.speed": {
      return resolved.bindingId === "right-bracket" ? "speedUp" : "speedDown";
    }
    default: {
      return null;
    }
  }
}

export function countTelepromptWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function totalTelepromptWords(blocks: readonly RevisionBlock[]): number {
  let total = 0;
  for (const block of blocks) {
    if (telepromptBlockIsCueProgressionCandidate(block)) {
      total += countTelepromptWords(block.spokenText);
    }
  }
  return total;
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
  if (currentIndex === -1) {
    return null;
  }
  for (
    let index = Math.min(blocks.length - 1, Math.max(0, currentIndex + direction));
    index >= 0 && index < blocks.length;
    index += direction
  ) {
    const block = blocks[index];
    if (telepromptBlockIsCueProgressionCandidate(block)) {
      return block.id;
    }
    if (index === 0 && direction < 0) {
      break;
    }
    if (index === blocks.length - 1 && direction > 0) {
      break;
    }
  }
  const currentBlock = blocks[currentIndex];
  return telepromptBlockIsCueProgressionCandidate(currentBlock)
    ? currentBlock.id
    : firstTelepromptCueBlockId(blocks);
}

export function firstTelepromptCueBlockId(blocks: readonly RevisionBlock[]): string | null {
  return blocks.find((block) => telepromptBlockIsCueProgressionCandidate(block))?.id ?? null;
}

export function telepromptBlockIsCueProgressionCandidate(block: RevisionBlock): boolean {
  return revisionBlockIsSpeakable(block);
}
