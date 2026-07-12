import type { CSSProperties, ReactNode } from "react";
import { readAlongAnchorForWord } from "./domAnchorResolver";
import {
  normalizeReadAlongVisualMode,
  readAlongHighlightClassName,
  readAlongHighlightDataAttributes,
  readAlongShouldHighlightPhrase,
  readAlongShouldHighlightWord,
  type ReadAlongHighlightSurface,
  type ReadAlongHighlightVisualMode,
} from "./highlightVisualModes";
import type { ReadAlongHighlightStyle } from "./readAlongPreferences";
import {
  readAlongSemanticDataAttributes,
  readAlongSemanticCueClassName,
  readAlongSemanticWordClassName,
  readAlongWordRoleForIndex,
  type ReadAlongCueRole,
  type ReadAlongTimingState,
  type ReadAlongWordRole,
} from "./highlightSemantics";

export type HighlightRendererTokenTransformation =
  | "normal"
  | "expanded"
  | "skipped"
  | "transformed"
  | "generated"
  | "unknown";

export interface HighlightRendererToken {
  key?: string;
  nodeId?: string;
  pageIndex?: number;
  sourceId?: string;
  sourceWordId?: string;
  sourceWordIndex?: number;
  spokenTokenId?: string;
  text: string;
  title?: string;
  timingConfidence?: number;
  tokenOffset?: number;
  trailingText?: string;
  transformation?: HighlightRendererTokenTransformation;
  wordIndex: number;
}

export interface HighlightRendererWordState {
  active: boolean;
  cueRole: ReadAlongCueRole;
  phrase: boolean;
  role: ReadAlongWordRole;
  timingState: ReadAlongTimingState;
  token: HighlightRendererToken;
  visualMode: ReadAlongHighlightVisualMode;
}

export interface HighlightRendererProps {
  activeSourceWordId?: string | null;
  activeWordIndex?: number | null;
  classNameForWord?: (state: HighlightRendererWordState) => string | undefined;
  cueRole?: ReadAlongCueRole;
  dataEffect?: string;
  highlightStyle?: ReadAlongHighlightStyle;
  mode: ReadAlongHighlightVisualMode;
  nodeId?: string;
  phraseWordEnd?: number | null;
  phraseWordStart?: number | null;
  sourceId?: string;
  surface: ReadAlongHighlightSurface;
  text?: string;
  timingState?: ReadAlongTimingState;
  tokens?: readonly HighlightRendererToken[];
  wordRole?: ReadAlongWordRole;
  wordRoleForWord?: (state: Omit<HighlightRendererWordState, "role">) => ReadAlongWordRole;
  wordStyle?: (state: HighlightRendererWordState) => CSSProperties | undefined;
}

export function HighlightRenderer({
  activeSourceWordId,
  activeWordIndex,
  classNameForWord,
  cueRole = "current",
  dataEffect,
  highlightStyle,
  mode,
  nodeId,
  phraseWordEnd,
  phraseWordStart,
  sourceId,
  surface,
  text,
  timingState = "trusted",
  tokens,
  wordRole,
  wordRoleForWord,
  wordStyle,
}: Readonly<HighlightRendererProps>) {
  const visualMode = normalizeReadAlongVisualMode(mode);
  const resolvedTokens = tokens ?? splitHighlightText(text ?? "", { nodeId, sourceId });
  const canHighlightWord = readAlongShouldHighlightWord(visualMode);
  const canHighlightPhrase = readAlongShouldHighlightPhrase(visualMode);

  return (
    <span
      className={readAlongSemanticCueClassName(cueRole, timingState)}
      {...readAlongHighlightDataAttributes(visualMode, surface)}
      {...readAlongSemanticDataAttributes({ cueRole, timingState })}
      data-readalong-highlight-style={highlightStyle}
    >
      {resolvedTokens.map((token, index) => {
        const phrase =
          canHighlightPhrase &&
          phraseWordStart !== null &&
          phraseWordStart !== undefined &&
          phraseWordEnd !== null &&
          phraseWordEnd !== undefined &&
          token.wordIndex >= phraseWordStart &&
          token.wordIndex <= phraseWordEnd;
        const activeBySourceIdentity =
          activeSourceWordId !== null &&
          activeSourceWordId !== undefined &&
          token.sourceWordId === activeSourceWordId;
        const active =
          canHighlightWord && (activeBySourceIdentity || token.wordIndex === activeWordIndex);
        const baseState: Omit<HighlightRendererWordState, "role"> = {
          active,
          cueRole,
          phrase,
          timingState,
          token,
          visualMode,
        };
        const role =
          wordRole ??
          wordRoleForWord?.(baseState) ??
          readAlongWordRoleForIndex({
            active,
            activeWordIndex,
            cueRole,
            phrase,
            wordIndex: token.wordIndex,
          });
        const state: HighlightRendererWordState = { ...baseState, role };
        const anchor = readAlongAnchorForWord({
          fallbackTextQuote: token.text,
          nodeId: token.nodeId ?? nodeId,
          pageIndex: token.pageIndex,
          sourceId: token.sourceId ?? sourceId,
          tokenOffset: token.tokenOffset,
          wordIndex: token.wordIndex,
        });
        const className = joinClasses(
          readAlongHighlightClassName({
            active,
            highlightStyle,
            mode: visualMode,
            phrase,
            surface,
          }),
          readAlongSemanticWordClassName(role),
          classNameForWord?.(state),
        );
        return (
          <span
            aria-current={active ? "true" : undefined}
            className={className}
            data-book-word={surface === "book" ? String(token.wordIndex) : undefined}
            data-effect={dataEffect}
            data-readalong-anchor-id={anchor.anchorId}
            data-readalong-cue-role={cueRole}
            data-readalong-node-id={token.nodeId ?? nodeId}
            data-readalong-page-index={
              token.pageIndex === undefined ? undefined : String(token.pageIndex)
            }
            data-readalong-source-id={token.sourceId ?? sourceId}
            data-readalong-source-word-index={
              token.sourceWordIndex === undefined ? undefined : String(token.sourceWordIndex)
            }
            data-readalong-spoken-token-id={token.spokenTokenId}
            data-source-word-id={token.sourceWordId}
            data-readalong-token-offset={
              token.tokenOffset === undefined ? undefined : String(token.tokenOffset)
            }
            data-readalong-token-confidence={
              token.timingConfidence === undefined ? undefined : String(token.timingConfidence)
            }
            data-readalong-token-transformation={token.transformation}
            data-readalong-timing-state={timingState}
            data-readalong-word-index={String(token.wordIndex)}
            data-readalong-word-role={role}
            key={token.key ?? `${token.wordIndex.toString()}:${token.text}:${index.toString()}`}
            style={wordStyle?.(state)}
            title={active ? "Current spoken word" : token.title}
          >
            {token.text}
            {token.trailingText}
          </span>
        );
      })}
    </span>
  );
}

export function splitHighlightText(
  value: string,
  defaults: Readonly<{ nodeId?: string; sourceId?: string }> = {},
): HighlightRendererToken[] {
  const parts: HighlightRendererToken[] = [];
  let wordIndex = 0;
  for (const match of value.matchAll(/(\S+)(\s*)/g)) {
    parts.push({
      key: `${wordIndex.toString()}:${String(match.index)}`,
      nodeId: defaults.nodeId,
      sourceId: defaults.sourceId,
      text: match[1],
      tokenOffset: wordIndex,
      trailingText: match[2],
      wordIndex,
    });
    wordIndex += 1;
  }
  return parts;
}

function joinClasses(...classes: (string | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function renderHighlightTextOrFallback(
  renderer: ReactNode,
  fallback: ReactNode,
  enabled: boolean,
): ReactNode {
  return enabled ? renderer : fallback;
}
