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
  readonly mode?: ReadingFollowAlongMode;
  readonly phraseWordEnd?: number | null;
  readonly phraseWordStart?: number | null;
  readonly presetId?: ReadingFollowAlongDisplayPresetId;
  readonly recentWindow?: number;
  readonly requestedVisualMode?: ReadAlongHighlightVisualMode | null;
  readonly surface: ReadAlongHighlightSurface;
  readonly surfaceKind?: ReadingSurfaceKind;
  readonly timingState?: ReadAlongTimingState;
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
  mode = "reading-only",
  phraseWordEnd,
  phraseWordStart,
  presetId,
  recentWindow,
  requestedVisualMode,
  surface,
  surfaceKind,
  timingState = "trusted",
  upcomingWindow,
  wordStyle,
}: Readonly<ReadingFollowAlongRendererProps>) {
  const cue = normalizeReadingFollowAlongCue(cueInput);
  const canClaimExactWord = readingFollowAlongCanClaimExactWord({
    exactWordTiming,
    timingState,
  });
  const visualMode = readingFollowAlongVisualMode({
    activeWordIndex,
    exactWordTiming,
    mode,
    phraseWordEnd,
    phraseWordStart,
    requestedVisualMode,
    timingState,
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
        canClaimExactWord,
        displayTextSource: cue.displayTextSource,
        mode,
        presetId,
        timingState,
        visualMode,
      })}
      data-reading-followalong-surface-kind={surfaceKind}
    >
      <HighlightRenderer
        activeSourceWordId={canClaimExactWord ? activeSourceWordId : null}
        activeWordIndex={canClaimExactWord ? activeWordIndex : null}
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
            activeWordIndex,
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
