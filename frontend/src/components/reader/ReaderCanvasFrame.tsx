import type { ReactNode, Ref } from "react";

export function ReaderCanvasFrame({
  canvasFirst,
  children,
  className = "",
  contentClassName,
  contentDataAttributes,
  contentRef,
  measureClassName,
  toolbar,
}: Readonly<{
  canvasFirst: boolean;
  children: ReactNode;
  className?: string;
  contentClassName: string;
  contentDataAttributes?: Record<string, string | number>;
  contentRef?: Ref<HTMLDivElement>;
  measureClassName: string;
  toolbar: ReactNode;
}>) {
  return (
    <section className={`min-h-0 min-w-0 overflow-hidden ${className}`}>
      <div
        className={`mx-auto flex h-full flex-col overflow-hidden bg-[var(--vs-raised)] vs-border ${
          canvasFirst
            ? "max-w-none rounded-none border-0 shadow-none"
            : `${measureClassName} rounded-md border shadow-sm max-lg:max-w-none max-lg:border-0 max-lg:shadow-none`
        }`}
      >
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
