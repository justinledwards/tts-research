import type { ReactNode, Ref } from "react";

export function ReaderCanvasFrame({
  canvasFirst,
  children,
  className = "",
  contentClassName,
  contentDataAttributes,
  contentRef,
  frameMode = "panel",
  measureClassName,
  toolbar,
}: Readonly<{
  canvasFirst: boolean;
  children: ReactNode;
  className?: string;
  contentClassName: string;
  contentDataAttributes?: Record<string, string | number>;
  contentRef?: Ref<HTMLDivElement>;
  frameMode?: "panel" | "reading";
  measureClassName: string;
  toolbar: ReactNode;
}>) {
  const readingFrame = frameMode === "reading";
  let frameClassName = "max-w-none rounded-none border-0 bg-transparent shadow-none";
  if (!canvasFirst && readingFrame) {
    frameClassName = `${measureClassName} rounded-none border-0 bg-transparent shadow-none max-lg:max-w-none`;
  }
  if (!canvasFirst && !readingFrame) {
    frameClassName = `${measureClassName} rounded-md border bg-[var(--vs-raised)] shadow-sm max-lg:max-w-none max-lg:border-0 max-lg:shadow-none`;
  }
  return (
    <section className={`min-h-0 min-w-0 overflow-hidden ${className}`}>
      <div className={`mx-auto flex h-full flex-col overflow-hidden vs-border ${frameClassName}`}>
        {canvasFirst ? null : toolbar}
        <div
          className={contentClassName}
          data-cinema-reader-canvas=""
          ref={contentRef}
          tabIndex={-1}
          {...contentDataAttributes}
        >
          {children}
        </div>
      </div>
    </section>
  );
}
