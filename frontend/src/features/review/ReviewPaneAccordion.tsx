import type { ReactNode } from "react";
import type { ReviewPane } from "./model";

export interface ReviewPaneItem {
  children: ReactNode;
  detail: string;
  id: ReviewPane;
  title: string;
}

export function ReviewPaneAccordion({
  activePane,
  panes,
  onActivePaneChange,
}: Readonly<{
  activePane: ReviewPane;
  panes: ReviewPaneItem[];
  onActivePaneChange: (pane: ReviewPane) => void;
}>) {
  return (
    <div className="grid min-w-0 gap-2">
      {panes.map((pane) => {
        const isActive = pane.id === activePane;
        return (
          <section
            className={`overflow-hidden rounded-lg border vs-border ${
              isActive ? "bg-[var(--vs-raised)] shadow-sm" : "bg-[var(--vs-surface)]"
            }`}
            key={pane.id}
          >
            <button
              aria-expanded={isActive}
              className="flex min-h-12 w-full min-w-0 items-center justify-between gap-3 px-3 py-2 text-left"
              onClick={() => {
                onActivePaneChange(pane.id);
              }}
              type="button"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[var(--vs-text)]">
                  {pane.title}
                </span>
                <span className="mt-0.5 block truncate text-xs vs-muted">{pane.detail}</span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-orange-700">
                {isActive ? "Active" : "Open"}
              </span>
            </button>
            {isActive ? <div className="border-t p-3 vs-border">{pane.children}</div> : null}
          </section>
        );
      })}
    </div>
  );
}
