import { useEffect, useRef, type ReactNode } from "react";
import { ReaderCanvasFrame } from "../../components/reader/ReaderCanvasFrame";
import { Button } from "../../design";
import { MarkdownRenderer } from "../../MarkdownRenderer";
import { bookScopeLabel, bookSourceName, type BookCinemaTextSize } from "../book-cinema/model";
import {
  READER_LINE_SPACING_CLASS,
  READER_MEASURE_CLASS,
  READER_TEXT_SCALE_CLASS,
  readerDataAttributes,
  readerScrollBehavior,
  type ReaderAccessibilitySettings,
} from "../reader-accessibility";
import { readingSurfaceClassName, readingSurfaceDataAttributes } from "../reading-surface";
import {
  readAlongAnchorForBlock,
  readAlongAnchorForWord,
  readAlongShouldHighlightBlock,
  readAlongShouldHighlightWord,
  scrollReadAlongAnchor,
  type ReadAlongHighlightStyle,
  type ReadAlongHighlightVisualMode,
  type ReadAlongScrollFollow,
} from "../readalong";
import type {
  BookScope,
  BookSource,
  BookSourceScopeContent,
  BookSourceWordSpan,
  NarrationBlock,
} from "../../types";

export function BookDocumentReaderStage({
  activeWordIndex,
  book,
  scope,
  scopedSpans,
  scopedText,
  scopeContent,
  accessibilitySettings,
  canvasFirst = false,
  highlightStyle,
  pointerLabel,
  phraseWordEnd,
  phraseWordStart,
  readAlongVisualMode = "word",
  scrollFollow,
  theatreActive = false,
  onAccessibilitySettingsChange,
}: Readonly<{
  activeWordIndex: number;
  book: BookSource;
  scope: BookScope;
  scopedSpans: NonNullable<BookSource["wordSpans"]>;
  scopedText: string;
  scopeContent: BookSourceScopeContent | null;
  accessibilitySettings: ReaderAccessibilitySettings;
  canvasFirst?: boolean;
  highlightStyle: ReadAlongHighlightStyle;
  pointerLabel: string | null;
  phraseWordEnd?: number;
  phraseWordStart?: number;
  readAlongVisualMode?: ReadAlongHighlightVisualMode;
  scrollFollow: ReadAlongScrollFollow;
  theatreActive?: boolean;
  onAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
}>) {
  const readerRef = useRef<HTMLDivElement | null>(null);
  const activeSpan = scopedSpans.find((span) => span.index === activeWordIndex) ?? null;
  const activeBlock = bookCinemaActiveBlock(scopeContent?.blocks ?? [], activeSpan);
  const highlight = bookMarkdownHighlight(activeBlock, activeSpan, scopedSpans);
  const textClass = `${READER_TEXT_SCALE_CLASS[accessibilitySettings.textScale]} ${
    READER_LINE_SPACING_CLASS[accessibilitySettings.lineSpacing]
  }`;
  const scrollBehavior = readerScrollBehavior(accessibilitySettings);
  const canHighlightWord = readAlongShouldHighlightWord(readAlongVisualMode);
  const hasPhraseRange = phraseWordStart !== undefined && phraseWordEnd !== undefined;
  const canHighlightBlock =
    readAlongShouldHighlightBlock(readAlongVisualMode) ||
    readAlongVisualMode === "phrase" ||
    hasPhraseRange;

  useEffect(() => {
    if (activeWordIndex < 0) {
      return;
    }
    const anchor =
      activeSpan && canHighlightWord
        ? readAlongAnchorForWord({
            fallbackTextQuote: activeSpan.text,
            nodeId: activeBlock?.id,
            sourceId: book.id,
            tokenOffset: highlight.wordOffset,
            wordIndex: activeWordIndex,
          })
        : readAlongAnchorForBlock({
            fallbackTextQuote: activeBlock?.text ?? activeBlock?.spokenText,
            nodeId: activeBlock?.id,
            sourceId: book.id,
          });
    scrollReadAlongAnchor(readerRef.current, anchor, {
      autoFollow: true,
      fallbackSelectors: [".markdown-cinema-word-active", ".markdown-cinema-block-active"],
      mode: readAlongVisualMode,
      scrollFollow,
      settings: accessibilitySettings,
      surface: "document",
    });
  }, [
    accessibilitySettings,
    activeBlock,
    activeSpan,
    activeWordIndex,
    book.id,
    canHighlightWord,
    highlight.wordOffset,
    readAlongVisualMode,
    scrollFollow,
  ]);

  useEffect(() => {
    const label = pointerLabel?.trim();
    if (!label) {
      return;
    }
    const heading = [...(readerRef.current?.querySelectorAll("h1,h2,h3,h4,h5,h6") ?? [])].find(
      (element) => element.textContent.trim() === label,
    );
    heading?.scrollIntoView({ block: "start", inline: "nearest", behavior: scrollBehavior });
  }, [pointerLabel, scrollBehavior]);

  return (
    <ReaderCanvasFrame
      canvasFirst={canvasFirst}
      contentClassName="min-h-0 flex-1 overflow-y-auto px-8 py-8 sm:px-12 lg:px-10 xl:px-12"
      contentDataAttributes={{
        ...readerDataAttributes(accessibilitySettings),
        ...readingSurfaceDataAttributes({ kind: "spoken" }),
        "data-readalong-highlight-style": highlightStyle,
        "data-readalong-scroll-follow": scrollFollow,
      }}
      contentRef={readerRef}
      frameMode="reading"
      measureClassName={READER_MEASURE_CLASS[accessibilitySettings.measure]}
      toolbar={
        theatreActive ? null : (
          <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 vs-border">
            <BookDocumentHeading book={book} scope={scope} />
            <div className="flex items-center gap-1">
              <BookDocumentTextButton
                label="Decrease text size"
                onClick={() => {
                  onAccessibilitySettingsChange({
                    ...accessibilitySettings,
                    textScale: decreaseBookTextSize(accessibilitySettings.textScale),
                  });
                }}
              >
                A-
              </BookDocumentTextButton>
              <BookDocumentTextButton
                label="Increase text size"
                onClick={() => {
                  onAccessibilitySettingsChange({
                    ...accessibilitySettings,
                    textScale: increaseBookTextSize(accessibilitySettings.textScale),
                  });
                }}
              >
                A+
              </BookDocumentTextButton>
            </div>
          </div>
        )
      }
    >
      <MarkdownRenderer
        artifactRendering="document-cinema"
        blockHighlight={
          canHighlightBlock && highlight.blockHighlight
            ? {
                ...highlight.blockHighlight,
                cueRole: "current",
                nodeId: activeBlock?.id,
                sourceId: book.id,
                timingState: "trusted",
              }
            : undefined
        }
        className={`markdown-cinema prose-markdown readalong-markdown-renderer mx-auto ${readingSurfaceClassName(
          "spoken",
        )} ${textClass} text-[var(--vs-text)]`}
        wordHighlight={
          canHighlightWord && highlight.wordHighlight
            ? {
                ...highlight.wordHighlight,
                activeWordIndex,
                cueRole: "current",
                nodeId: activeBlock?.id,
                sourceId: book.id,
                timingState: "trusted",
              }
            : undefined
        }
      >
        {scopedText}
      </MarkdownRenderer>
    </ReaderCanvasFrame>
  );
}

function BookDocumentHeading({ book, scope }: Readonly<{ book: BookSource; scope: BookScope }>) {
  return (
    <div>
      <p className="vs-muted text-sm font-semibold uppercase tracking-[0.2em]">
        {book.kind.toUpperCase()}
      </p>
      <h3 className="mt-2 text-2xl font-semibold tracking-normal sm:text-3xl">
        {bookScopeLabel(scope)}
      </h3>
      <p className="vs-muted mt-2 text-sm">{bookSourceName(book)}</p>
    </div>
  );
}

function BookDocumentTextButton({
  children,
  label,
  onClick,
}: Readonly<{ children: ReactNode; label: string; onClick: () => void }>) {
  return (
    <Button
      aria-label={label}
      className="grid place-items-center text-lg font-medium"
      onClick={onClick}
      size="icon"
      variant="ghost"
    >
      {children}
    </Button>
  );
}

function bookCinemaActiveBlock(
  blocks: NarrationBlock[],
  activeSpan: BookSourceWordSpan | null,
): NarrationBlock | null {
  if (blocks.length === 0) {
    return null;
  }
  if (!activeSpan) {
    return blocks.find((block) => block.speakMode !== "skip") ?? blocks[0];
  }
  return (
    blocks.find(
      (block) =>
        activeSpan.startOffset >= block.startOffset && activeSpan.startOffset <= block.endOffset,
    ) ??
    blocks.find((block) => block.speakMode !== "skip") ??
    blocks[0]
  );
}

function bookMarkdownHighlight(
  activeBlock: NarrationBlock | null,
  activeSpan: BookSourceWordSpan | null,
  spans: BookSourceWordSpan[],
): BookMarkdownHighlight {
  if (!activeBlock) {
    return { blockHighlight: undefined, wordHighlight: undefined, wordOffset: undefined };
  }
  const blockHighlight = {
    blockEndOffset: activeBlock.endOffset,
    blockStartOffset: activeBlock.startOffset,
  };
  if (!activeSpan) {
    return { blockHighlight, wordHighlight: undefined, wordOffset: undefined };
  }
  const activeWordOffset = spans.filter(
    (span) =>
      span.index < activeSpan.index &&
      span.startOffset >= activeBlock.startOffset &&
      span.startOffset <= activeBlock.endOffset,
  ).length;
  return {
    blockHighlight,
    wordOffset: activeWordOffset,
    wordHighlight: {
      activeWordOffset,
      blockEndOffset: activeBlock.endOffset,
      blockStartOffset: activeBlock.startOffset,
    },
  };
}

interface BookMarkdownHighlight {
  blockHighlight:
    | {
        blockEndOffset: number;
        blockStartOffset: number;
      }
    | undefined;
  wordHighlight:
    | {
        activeWordOffset: number;
        blockEndOffset: number;
        blockStartOffset: number;
      }
    | undefined;
  wordOffset: number | undefined;
}

function decreaseBookTextSize(size: BookCinemaTextSize): BookCinemaTextSize {
  const order: BookCinemaTextSize[] = ["compact", "comfortable", "large", "giant"];
  return order[Math.max(0, order.indexOf(size) - 1)] ?? "comfortable";
}

function increaseBookTextSize(size: BookCinemaTextSize): BookCinemaTextSize {
  const order: BookCinemaTextSize[] = ["compact", "comfortable", "large", "giant"];
  return order[Math.min(order.length - 1, order.indexOf(size) + 1)] ?? "large";
}
