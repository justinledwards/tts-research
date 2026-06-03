import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { RevisionBlock } from "../revision";
import { cx } from "../../design";
import {
  buildTelepromptWordCuesFromIndex,
  type TeleprompterHighlightSettings,
  type TeleprompterToken,
} from "../../teleprompter";
import type { ReadAlongTimingState, ReadAlongWordRole } from "../readalong";
import {
  ReadingFollowAlongRenderer,
  readingSurfaceClassName,
  readingSurfaceDataAttributes,
} from "../reading-surface";
import type { TelepromptCueWordTiming } from "./telepromptCueTimeline";
import {
  telepromptTheatreCrawlOffset,
  telepromptTheatreCrawlRowKey,
  telepromptTheatreCueElement,
  telepromptTheatreCueKindClassName,
  telepromptTheatreCueSectionKindAttribute,
  telepromptTheatreCueSections,
  telepromptTheatreRenderedCueSections,
  type TelepromptTheatreCrawlRow,
} from "./telepromptTheatreCueContentHelpers";

export function TelepromptTheatreCueText({
  activeBlock,
  blockKind,
  currentSourceWordId,
  currentWordIndex,
  fallbackText,
  highlightSettings,
  mirrorMode,
  previewBlocks = [],
  timingState = "trusted",
  text,
  textClassName,
  widthClassName,
  wordTimings = [],
  wordSpacing,
}: Readonly<{
  activeBlock?: RevisionBlock | null;
  blockKind?: string | null;
  currentSourceWordId?: string | null;
  currentWordIndex?: number | null;
  fallbackText: string;
  highlightSettings: TeleprompterHighlightSettings;
  mirrorMode: boolean;
  previewBlocks?: readonly RevisionBlock[];
  timingState?: ReadAlongTimingState;
  text: string;
  textClassName: string;
  widthClassName: string;
  wordTimings?: readonly TelepromptCueWordTiming[];
  wordSpacing?: string;
}>) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const lastCueIdentityRef = useRef<string | null>(null);
  const lastCrawlRowKeyRef = useRef<string | null>(null);
  const [crawlOffsetPx, setCrawlOffsetPx] = useState(0);
  const prefersReducedMotion = usePrefersReducedMotion();
  const displayText = text.trim() || fallbackText;
  const sections = useMemo(
    () =>
      telepromptTheatreCueSections({
        activeBlock,
        blockKind,
        previewBlocks,
        text: displayText,
      }),
    [activeBlock, blockKind, displayText, previewBlocks],
  );
  const sourceWordIdByCueIndex = useMemo(() => {
    const values = new Map<number, string>();
    for (const timing of wordTimings) {
      const sourceWordId = timing.sourceWordId;
      if (typeof sourceWordId === "string" && sourceWordId.length > 0) {
        values.set(timing.wordIndex, sourceWordId);
      }
    }
    return values;
  }, [wordTimings]);
  const renderedSections = useMemo(
    () => telepromptTheatreRenderedCueSections(sections, sourceWordIdByCueIndex),
    [sections, sourceWordIdByCueIndex],
  );
  const cueIdentity = sections.map((section) => `${section.id}:${section.text}`).join("|");
  const wordCueTokens = useMemo<TeleprompterToken[]>(
    () =>
      renderedSections.flatMap((section) =>
        section.tokens.map((token) => ({
          kind: "word" as const,
          text: token.text,
          wordIndex: token.wordIndex,
        })),
      ),
    [renderedSections],
  );
  const wordCues = useMemo(
    () =>
      typeof currentWordIndex === "number" && currentWordIndex >= 0
        ? buildTelepromptWordCuesFromIndex(wordCueTokens, currentWordIndex, highlightSettings)
        : [],
    [currentWordIndex, highlightSettings, wordCueTokens],
  );
  const cueByIndex = useMemo(
    () => new Map(wordCues.map((cue) => [cue.wordIndex, cue])),
    [wordCues],
  );
  const style: CSSProperties = {
    transform: telepromptTheatreCueTransform({
      mirrorMode,
      translateYPx: crawlOffsetPx,
    }),
    transition: prefersReducedMotion ? "none" : "transform 360ms ease-out",
    wordSpacing,
  };

  useEffect(() => {
    if (lastCueIdentityRef.current !== cueIdentity) {
      lastCueIdentityRef.current = cueIdentity;
      lastCrawlRowKeyRef.current = null;
      setCrawlOffsetPx(0);
    }
  }, [cueIdentity]);

  useEffect(() => {
    if (prefersReducedMotion || currentWordIndex === null || currentWordIndex === undefined) {
      lastCrawlRowKeyRef.current = null;
      setCrawlOffsetPx(0);
      return;
    }
    const viewport = viewportRef.current;
    const content = contentRef.current;
    const activeWord = content?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!viewport || !content || !activeWord) {
      return;
    }
    const row = telepromptTheatreActiveRow(activeWord);
    if (!row) {
      return;
    }
    const rowKey = `${cueIdentity}:${telepromptTheatreCrawlRowKey(row)}`;
    if (lastCrawlRowKeyRef.current === rowKey) {
      return;
    }
    lastCrawlRowKeyRef.current = rowKey;
    setCrawlOffsetPx((currentOffsetPx) =>
      telepromptTheatreCrawlOffset({
        activeCenterY: row.top + row.height / 2 + currentOffsetPx,
        contentHeight: content.scrollHeight,
        currentOffsetPx,
        reducedMotion: prefersReducedMotion,
        viewportHeight: viewport.clientHeight,
      }),
    );
  }, [cueIdentity, currentWordIndex, prefersReducedMotion]);

  if (sections.length === 1 && (sections[0].kind === "code" || sections[0].kind === "table")) {
    const section = sections[0];
    return (
      <pre
        className={cx(
          "mx-auto whitespace-pre-wrap text-left font-mono",
          readingSurfaceClassName("theatre"),
          widthClassName,
          telepromptTheatreCueKindClassName(section.kind),
          textClassName,
        )}
        {...readingSurfaceDataAttributes({ active: true, kind: "theatre" })}
        data-teleprompt-theatre-cue-kind={section.kind}
        style={{ transform: mirrorMode ? "scaleX(-1)" : undefined, wordSpacing }}
      >
        {section.text}
      </pre>
    );
  }

  return (
    <div
      className="teleprompt-theatre-crawl-viewport grid h-full min-h-0 w-full place-items-center overflow-hidden"
      data-teleprompt-theatre-crawl-motion={prefersReducedMotion ? "reduced" : "cinematic"}
      data-teleprompt-theatre-cue-kind={telepromptTheatreCueSectionKindAttribute(sections)}
      ref={viewportRef}
    >
      <div
        className={cx(
          "mx-auto grid gap-6 text-center",
          readingSurfaceClassName("theatre"),
          widthClassName,
          textClassName,
        )}
        {...readingSurfaceDataAttributes({ active: true, kind: "theatre" })}
        data-teleprompt-theatre-crawl-content=""
        ref={contentRef}
        style={style}
      >
        {renderedSections.map((section) => {
          const CueElement = telepromptTheatreCueElement(section.kind);
          return (
            <CueElement
              className={cx(
                "whitespace-pre-wrap",
                telepromptTheatreCueKindClassName(section.kind),
                sections.length > 1 && section.kind === "body" && "font-medium",
              )}
              data-teleprompt-theatre-section-kind={section.kind}
              key={section.id}
            >
              <ReadingFollowAlongRenderer
                activeSourceWordId={currentSourceWordId}
                activeWordIndex={currentWordIndex}
                classNameForWord={({ role, token }) => {
                  const cue = cueByIndex.get(token.wordIndex);
                  return cx(
                    "teleprompter-word rounded px-1 py-0.5",
                    `teleprompter-word--${telepromptTheatreVisualWordState(cue?.state, role)}`,
                    role === "active" && "teleprompt-theatre-word--active",
                  );
                }}
                cue={{
                  cueText: section.text,
                  spokenText: section.text,
                  tokens: section.tokens,
                }}
                cueRole="current"
                dataEffect={highlightSettings.effectStyle}
                mode="audio-follow"
                surface="teleprompt"
                surfaceKind="theatre"
                timingState={timingState}
                wordStyle={({ role, token }) => {
                  const cue = cueByIndex.get(token.wordIndex);
                  return {
                    "--teleprompter-accent": "#f97316",
                    "--teleprompter-intensity": String(
                      telepromptTheatreVisualWordIntensity(cue?.intensity, role),
                    ),
                  } as CSSProperties;
                }}
              />
            </CueElement>
          );
        })}
      </div>
    </div>
  );
}

function telepromptTheatreCueTransform({
  mirrorMode,
  translateYPx,
}: Readonly<{ mirrorMode: boolean; translateYPx: number }>): string {
  const translate = `translateY(${Math.round(translateYPx).toString()}px)`;
  return mirrorMode ? `scaleX(-1) ${translate}` : translate;
}

function telepromptTheatreActiveRow(activeWord: HTMLElement): TelepromptTheatreCrawlRow | null {
  const top = activeWord.offsetTop;
  const height = activeWord.offsetHeight || activeWord.getBoundingClientRect().height;
  if (!Number.isFinite(top) || !Number.isFinite(height) || height <= 0) {
    return null;
  }
  return { height, top };
}

function telepromptTheatreVisualWordState(
  cueState: string | undefined,
  role: ReadAlongWordRole,
): string {
  if (role === "active" || role === "recent" || role === "spoken" || role === "upcoming") {
    return cueState ?? "idle";
  }
  return "idle";
}

function telepromptTheatreVisualWordIntensity(
  intensity: number | undefined,
  role: ReadAlongWordRole,
): number {
  return role === "active" || role === "recent" || role === "spoken" || role === "upcoming"
    ? (intensity ?? 0)
    : 0;
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    const matchMedia = (globalThis as typeof globalThis & { matchMedia?: Window["matchMedia"] })
      .matchMedia;
    if (typeof matchMedia !== "function") {
      return;
    }
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setPrefersReducedMotion(media.matches);
    };
    update();
    media.addEventListener("change", update);
    return () => {
      media.removeEventListener("change", update);
    };
  }, []);
  return prefersReducedMotion;
}

export {
  CuePreviewList,
  OperatorFact,
  telepromptTheatreCrawlOffset,
  telepromptTheatreCrawlRowKey,
  telepromptTheatreCueSections,
  telepromptTheatreCuePresentationKind,
  telepromptTheatreCueParagraphs,
  telepromptTheatreRenderedCueSections,
  telepromptTheatreCueSyncTone,
  telepromptTheatreWordLabel,
} from "./telepromptTheatreCueContentHelpers";
export type {
  TelepromptTheatreCrawlOffsetInput,
  TelepromptTheatreCrawlRow,
  TelepromptTheatreCueParagraph,
  TelepromptTheatreCueSection,
  TelepromptTheatreRenderedCueSection,
} from "./telepromptTheatreCueContentHelpers";
