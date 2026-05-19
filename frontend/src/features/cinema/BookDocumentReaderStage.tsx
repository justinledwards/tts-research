import { useEffect, useRef, type ReactNode } from "react";
import { MarkdownRenderer } from "../../MarkdownRenderer";
import { bookScopeLabel, bookSourceName, type BookCinemaTextSize } from "../../bookCinemaModel";
import {
  READER_LINE_SPACING_CLASS,
  READER_MEASURE_CLASS,
  READER_TEXT_SCALE_CLASS,
  readerScrollBehavior,
  type ReaderAccessibilitySettings,
} from "../reader-accessibility";
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
  pointerLabel,
  onAccessibilitySettingsChange,
}: Readonly<{
  activeWordIndex: number;
  book: BookSource;
  scope: BookScope;
  scopedSpans: NonNullable<BookSource["wordSpans"]>;
  scopedText: string;
  scopeContent: BookSourceScopeContent | null;
  accessibilitySettings: ReaderAccessibilitySettings;
  pointerLabel: string | null;
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

  useEffect(() => {
    if (activeWordIndex < 0) {
      return;
    }
    readerRef.current
      ?.querySelector(".markdown-cinema-word-active, .markdown-cinema-block-active")
      ?.scrollIntoView({ block: "center", inline: "nearest", behavior: scrollBehavior });
  }, [activeWordIndex, scrollBehavior]);

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
    <section className="min-h-0 min-w-0 overflow-hidden">
      <div
        className={`mx-auto flex h-full ${READER_MEASURE_CLASS[accessibilitySettings.measure]} flex-col overflow-hidden rounded-md border bg-[var(--vs-raised)] shadow-sm vs-border max-lg:max-w-none max-lg:border-0 max-lg:shadow-none`}
      >
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
        <div
          className="min-h-0 flex-1 overflow-y-auto px-8 py-8 sm:px-12 lg:px-10 xl:px-12"
          ref={readerRef}
        >
          <MarkdownRenderer
            blockHighlight={highlight.blockHighlight}
            className={`markdown-cinema prose-markdown ${textClass} text-[var(--vs-text)]`}
            wordHighlight={highlight.wordHighlight}
          >
            {scopedText}
          </MarkdownRenderer>
        </div>
      </div>
    </section>
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
    <button
      aria-label={label}
      className="grid h-9 w-10 place-items-center rounded-md text-lg font-medium transition hover:bg-[var(--vs-surface)]"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
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
) {
  if (!activeBlock) {
    return { blockHighlight: undefined, wordHighlight: undefined };
  }
  const blockHighlight = {
    blockEndOffset: activeBlock.endOffset,
    blockStartOffset: activeBlock.startOffset,
  };
  if (!activeSpan) {
    return { blockHighlight, wordHighlight: undefined };
  }
  const activeWordOffset = spans.filter(
    (span) =>
      span.index < activeSpan.index &&
      span.startOffset >= activeBlock.startOffset &&
      span.startOffset <= activeBlock.endOffset,
  ).length;
  return {
    blockHighlight,
    wordHighlight: {
      activeWordOffset,
      blockEndOffset: activeBlock.endOffset,
      blockStartOffset: activeBlock.startOffset,
    },
  };
}

function decreaseBookTextSize(size: BookCinemaTextSize): BookCinemaTextSize {
  const order: BookCinemaTextSize[] = ["compact", "comfortable", "large", "giant"];
  return order[Math.max(0, order.indexOf(size) - 1)] ?? "comfortable";
}

function increaseBookTextSize(size: BookCinemaTextSize): BookCinemaTextSize {
  const order: BookCinemaTextSize[] = ["compact", "comfortable", "large", "giant"];
  return order[Math.min(order.length - 1, order.indexOf(size) + 1)] ?? "large";
}
