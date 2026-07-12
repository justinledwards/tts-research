import type { RevisionBlock } from "../revision";
import {
  countTelepromptWords,
  estimateTelepromptDurationMs,
  formatTelepromptDuration,
  resolveTelepromptBlockIndex,
  totalTelepromptWords,
} from "./telepromptToolbar";

export type TelepromptTheatreMode = "fullscreen" | "inline" | "theatre";

export type TelepromptTheatreViewMode = "manual" | "operator-preview";

export interface TelepromptTheatreSummary {
  readonly activeWordsLabel: string;
  readonly confidenceLabel: string;
  readonly cuePositionLabel: string;
  readonly estimatedRemainingLabel: string;
  readonly playbackStatusLabel: string;
  readonly progressPercent: number;
  readonly sourceScopeLabel: string;
  readonly syncStatusLabel: string;
  readonly totalWordsLabel: string;
}

export function buildTelepromptTheatreSummary(input: {
  readonly activeBlockId: string | null;
  readonly blocks: readonly RevisionBlock[];
  readonly estimatedDurationMs: number;
  readonly isPlaybackActive: boolean;
  readonly playbackAvailable: boolean;
  readonly scopeLabel: string;
  readonly sourceLabel: string;
}): TelepromptTheatreSummary {
  const activeBlockIndex = resolveTelepromptBlockIndex(input.blocks, input.activeBlockId);
  const activeBlock = activeBlockIndex >= 0 ? input.blocks[activeBlockIndex] : null;
  const totalWords = totalTelepromptWords(input.blocks);
  const activeWords = activeBlock ? countTelepromptWords(activeBlock.spokenText) : 0;
  const remainingWords =
    activeBlockIndex >= 0 ? totalTelepromptWords(input.blocks.slice(activeBlockIndex)) : totalWords;
  const progressPercent =
    activeBlockIndex >= 0 && input.blocks.length > 0
      ? Math.round(((activeBlockIndex + 1) / input.blocks.length) * 100)
      : 0;
  const remainingMs =
    input.estimatedDurationMs > 0 && totalWords > 0
      ? Math.round(input.estimatedDurationMs * (remainingWords / totalWords))
      : estimateTelepromptDurationMs(remainingWords);
  const confidence =
    typeof activeBlock?.confidence === "number" && Number.isFinite(activeBlock.confidence)
      ? `${Math.round(activeBlock.confidence * 100).toString()}% confidence`
      : "Confidence pending";
  let playbackStatusLabel = "Recording rehearsal";
  if (input.isPlaybackActive) {
    playbackStatusLabel = "Playback running";
  } else if (input.playbackAvailable) {
    playbackStatusLabel = "Playback ready";
  }
  return {
    activeWordsLabel: `${activeWords.toLocaleString()} words in cue`,
    confidenceLabel: confidence,
    cuePositionLabel:
      activeBlockIndex >= 0
        ? `Cue ${(activeBlockIndex + 1).toString()} of ${Math.max(1, input.blocks.length).toString()}`
        : "No active cue",
    estimatedRemainingLabel: `${formatTelepromptDuration(remainingMs)} remaining`,
    playbackStatusLabel,
    progressPercent,
    sourceScopeLabel: `${input.sourceLabel} · ${input.scopeLabel}`,
    syncStatusLabel: input.playbackAvailable ? "Audio-follow cue sync ready" : "Manual cue sync",
    totalWordsLabel: `${totalWords.toLocaleString()} total words`,
  };
}
