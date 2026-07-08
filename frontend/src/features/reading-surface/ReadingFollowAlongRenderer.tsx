import type { CSSProperties } from "react";
import {
  HighlightRenderer,
  type HighlightRendererWordState,
  type ReadAlongCueRole,
  type ReadAlongHighlightStyle,
  type ReadAlongHighlightSurface,
  type ReadAlongHighlightVisualMode,
  type ReadAlongTimingState,
} from "../readalong";
import type { ReadingSurfaceKind } from "./model";
import {
  normalizeReadingFollowAlongCue,
  readingFollowAlongCanClaimExactWord,
  readingFollowAlongDataAttributes,
  readingFollowAlongPhraseRange,
  readingFollowAlongVisualMode,
  readingFollowAlongWordRole,
  type ReadingFollowAlongCue,
  type ReadingFollowAlongCueInput,
  type ReadingFollowAlongDisplayPresetId,
  type ReadingFollowAlongMode,
  type ReadingFollowAlongToken,
} from "./followAlongModel";

export interface ReadingFollowAlongWordRenderState
  extends Omit<HighlightRendererWordState, "token"> {
  readonly cue: ReadingFollowAlongCue;
  readonly followMode: ReadingFollowAlongMode;
  readonly surfaceKind?: ReadingSurfaceKind;
  readonly token: ReadingFollowAlongToken;
}

export interface ReadingFollowAlongRendererProps {
  readonly activeSourceWordId?: string | null;
  readonly activeWordIndex?: number | null;
  readonly className?: string;
  readonly classNameForWord?: (state: ReadingFollowAlongWordRenderState) => string | undefined;
  readonly cue: ReadingFollowAlongCueInput | string;
  readonly cueRole?: ReadAlongCueRole;
  readonly dataEffect?: string;
  readonly exactWordTiming?: boolean;
  readonly highlightStyle?: ReadAlongHighlightStyle;
  readonly lowResourceMode?: boolean | null;
  readonly mode?: ReadingFollowAlongMode;
  readonly phraseWordEnd?: number | null;
  readonly phraseWordStart?: number | null;
  readonly presetId?: ReadingFollowAlongDisplayPresetId;
  readonly recentWindow?: number;
  readonly requestedVisualMode?: ReadAlongHighlightVisualMode | null;
  readonly surface: ReadAlongHighlightSurface;
  readonly surfaceKind?: ReadingSurfaceKind;
  readonly timingState?: ReadAlongTimingState;
  readonly transportCanClaimExactReadAlong?: boolean | null;
  readonly upcomingWindow?: number;
  readonly wordStyle?: (state: ReadingFollowAlongWordRenderState) => CSSProperties | undefined;
}

export function ReadingFollowAlongRenderer({
  activeSourceWordId,
  activeWordIndex,
  className,
  classNameForWord,
  cue: cueInput,
  cueRole = "current",
  dataEffect,
  exactWordTiming,
  highlightStyle,
  lowResourceMode,
  mode = "reading-only",
  phraseWordEnd,
  phraseWordStart,
  presetId,
  recentWindow,
  requestedVisualMode,
  surface,
  surfaceKind,
  timingState = "trusted",
  transportCanClaimExactReadAlong,
  upcomingWindow,
  wordStyle,
}: Readonly<ReadingFollowAlongRendererProps>) {
  const cue = normalizeReadingFollowAlongCue(cueInput);
  const visualMode = readingFollowAlongVisualMode({
    activeWordIndex,
    exactWordTiming,
    lowResourceMode,
    mode,
    phraseWordEnd,
    phraseWordStart,
    requestedVisualMode,
    timingState,
    transportCanClaimExactReadAlong,
  });
  const canClaimExactWord =
    visualMode === "word" &&
    readingFollowAlongCanClaimExactWord({
      exactWordTiming,
      lowResourceMode,
      timingState,
      transportCanClaimExactReadAlong,
    });
  const exactActiveIdentity = resolveReadingFollowAlongExactActiveIdentity({
    activeSourceWordId,
    activeWordIndex,
    canClaimExactWord,
    tokens: cue.tokens,
  });
  const roleContext = resolveReadingFollowAlongRoleContext({
    activeSourceWordId,
    activeWordIndex,
    canClaimExactWord,
    exactActiveIdentity,
    tokens: cue.tokens,
  });
  const phraseRange = readingFollowAlongPhraseRange({
    activeWordIndex,
    phraseWordEnd,
    phraseWordStart,
    visualMode,
    wordIndexes: cue.tokens.map((token) => token.wordIndex),
  });

  return (
    <span
      className={className}
      {...readingFollowAlongDataAttributes({
        canClaimExactWord: exactActiveIdentity.canClaimExactWord,
        displayTextSource: cue.displayTextSource,
        mode,
        presetId,
        timingState,
        visualMode,
      })}
      data-reading-followalong-surface-kind={surfaceKind}
    >
      <HighlightRenderer
        activeSourceWordId={exactActiveIdentity.activeSourceWordId}
        activeWordIndex={exactActiveIdentity.activeWordIndex}
        classNameForWord={(state) =>
          classNameForWord?.(
            readingFollowAlongRenderState({
              cue,
              followMode: mode,
              state,
              surfaceKind,
            }),
          )
        }
        cueRole={cueRole}
        dataEffect={dataEffect}
        highlightStyle={highlightStyle}
        mode={visualMode}
        phraseWordEnd={phraseRange.phraseWordEnd}
        phraseWordStart={phraseRange.phraseWordStart}
        surface={surface}
        timingState={timingState}
        tokens={cue.tokens}
        wordRoleForWord={({ active, phrase, token }) =>
          readingFollowAlongWordRole({
            active,
            activeWordIndex: roleContext.activeWordIndex,
            canClaimExactWord: roleContext.canClaimExactWord,
            cueRole,
            phrase,
            recentWindow,
            token,
            upcomingWindow,
          })
        }
        wordStyle={(state) =>
          wordStyle?.(
            readingFollowAlongRenderState({
              cue,
              followMode: mode,
              state,
              surfaceKind,
            }),
          )
        }
      />
    </span>
  );
}

interface ReadingFollowAlongExactActiveIdentity {
  readonly activeSourceWordId: string | null;
  readonly activeWordIndex: number | null;
  readonly canClaimExactWord: boolean;
}

function resolveReadingFollowAlongExactActiveIdentity({
  activeSourceWordId,
  activeWordIndex,
  canClaimExactWord,
  tokens,
}: Readonly<{
  activeSourceWordId?: string | null;
  activeWordIndex?: number | null;
  canClaimExactWord: boolean;
  tokens: readonly ReadingFollowAlongToken[];
}>): ReadingFollowAlongExactActiveIdentity {
  if (!canClaimExactWord) {
    return NO_EXACT_ACTIVE_IDENTITY;
  }

  const hasActiveSourceWordId =
    activeSourceWordId !== null &&
    activeSourceWordId !== undefined &&
    activeSourceWordId.length > 0;
  const hasActiveWordIndex =
    typeof activeWordIndex === "number" && Number.isFinite(activeWordIndex);
  if (!hasActiveSourceWordId && !hasActiveWordIndex) {
    return NO_EXACT_ACTIVE_IDENTITY;
  }

  const activeToken = tokens.find((token) => {
    const sourceMatches = !hasActiveSourceWordId || token.sourceWordId === activeSourceWordId;
    const indexMatches = !hasActiveWordIndex || token.wordIndex === activeWordIndex;
    return sourceMatches && indexMatches;
  });
  if (!activeToken) {
    return NO_EXACT_ACTIVE_IDENTITY;
  }

  return {
    activeSourceWordId: hasActiveSourceWordId ? activeSourceWordId : null,
    activeWordIndex: hasActiveWordIndex ? activeWordIndex : null,
    canClaimExactWord: true,
  };
}

const NO_EXACT_ACTIVE_IDENTITY = {
  activeSourceWordId: null,
  activeWordIndex: null,
  canClaimExactWord: false,
} as const;

function resolveReadingFollowAlongRoleContext({
  activeSourceWordId,
  activeWordIndex,
  canClaimExactWord,
  exactActiveIdentity,
  tokens,
}: Readonly<{
  activeSourceWordId?: string | null;
  activeWordIndex?: number | null;
  canClaimExactWord: boolean;
  exactActiveIdentity: ReadingFollowAlongExactActiveIdentity;
  tokens: readonly ReadingFollowAlongToken[];
}>): Pick<ReadingFollowAlongExactActiveIdentity, "activeWordIndex" | "canClaimExactWord"> {
  if (exactActiveIdentity.canClaimExactWord) {
    return {
      activeWordIndex: exactActiveIdentity.activeWordIndex,
      canClaimExactWord: true,
    };
  }
  if (
    !canClaimExactWord ||
    typeof activeWordIndex !== "number" ||
    !Number.isFinite(activeWordIndex)
  ) {
    return NO_EXACT_ACTIVE_IDENTITY;
  }

  const hasActiveSourceWordId =
    activeSourceWordId !== null &&
    activeSourceWordId !== undefined &&
    activeSourceWordId.length > 0;
  const hasSourceMatch =
    hasActiveSourceWordId && tokens.some((token) => token.sourceWordId === activeSourceWordId);
  const hasIndexMatch = tokens.some((token) => token.wordIndex === activeWordIndex);
  const sectionContainsPartialActiveIdentity = hasSourceMatch || hasIndexMatch;
  if (sectionContainsPartialActiveIdentity) {
    return NO_EXACT_ACTIVE_IDENTITY;
  }

  return {
    activeWordIndex,
    canClaimExactWord: true,
  };
}

function readingFollowAlongRenderState({
  cue,
  followMode,
  state,
  surfaceKind,
}: Readonly<{
  cue: ReadingFollowAlongCue;
  followMode: ReadingFollowAlongMode;
  state: HighlightRendererWordState;
  surfaceKind?: ReadingSurfaceKind;
}>): ReadingFollowAlongWordRenderState {
  return {
    ...state,
    cue,
    followMode,
    surfaceKind,
    token: state.token,
  };
}
