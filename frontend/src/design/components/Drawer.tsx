import { forwardRef, type ReactNode } from "react";
import { HeaderContextSummary } from "../../features/header";
import { Button } from "./Button";
import { cx } from "../tokens";

export interface DrawerProps {
  children: ReactNode;
  className?: string;
  label: string;
  metadata?: { label: string; value: string }[];
  onClose: () => void;
  scopeTitle?: string;
  title: string;
}

export const Drawer = forwardRef<HTMLElement, DrawerProps>(function Drawer(
  { children, className, label, metadata = [], onClose, scopeTitle, title },
  ref,
) {
  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/25" role="presentation">
      <aside
        aria-label={label}
        aria-modal="true"
        className={cx(
          "vs-app ml-auto flex h-full w-full max-w-[860px] flex-col border-l shadow-2xl md:w-[820px] vs-border",
          className,
        )}
        ref={ref}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex items-center justify-between gap-3 border-b px-5 py-4 vs-border">
          <HeaderContextSummary
            density="compact"
            metadata={metadata}
            scopeTitle={scopeTitle}
            sourceTitle={title}
            surfaceName={label}
          />
          <Button aria-label={`Close ${label}`} onClick={onClose} size="sm" variant="ghost">
            Close
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  );
});
