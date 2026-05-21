import type { ReactNode } from "react";
import { Button, Panel, StatusChip } from "../../design";
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
          <Panel
            className="overflow-hidden"
            key={pane.id}
            variant={isActive ? "raised" : "surface"}
          >
            <Button
              align="start"
              aria-expanded={isActive}
              className="w-full min-w-0 justify-between rounded-none border-0 px-3 py-2 shadow-none"
              onClick={() => {
                onActivePaneChange(pane.id);
              }}
              selected={isActive}
              variant="ghost"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[var(--vs-text)]">
                  {pane.title}
                </span>
                <span className="mt-0.5 block truncate text-xs vs-muted">{pane.detail}</span>
              </span>
              <StatusChip tone={isActive ? "accent" : "neutral"}>
                {isActive ? "Active" : "Open"}
              </StatusChip>
            </Button>
            {isActive ? <div className="border-t p-3 vs-border">{pane.children}</div> : null}
          </Panel>
        );
      })}
    </div>
  );
}
