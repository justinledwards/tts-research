import { Button, Panel, StatusChip } from "../../design";
import {
  selectContextPanelTab,
  type ContextPanelSurface,
  type ContextPanelTabDefinition,
} from "./contextPanelModel";
import type { ContextPanelTabId } from "./contextPanelTabs";

export function ContextPanel({
  activeTabId,
  className = "",
  label = "Context panel",
  pinned = false,
  surface,
  tabs,
  onPinnedChange,
  onTabChange,
}: Readonly<{
  activeTabId: ContextPanelTabId | null;
  className?: string;
  label?: string;
  pinned?: boolean;
  surface: ContextPanelSurface;
  tabs: readonly ContextPanelTabDefinition[];
  onPinnedChange?: (pinned: boolean) => void;
  onTabChange: (tabId: ContextPanelTabId) => void;
}>) {
  const activeTab = selectContextPanelTab(tabs, activeTabId);
  if (!activeTab) {
    return null;
  }

  const tabPanelId = `context-panel-${surface}-${activeTab.id}`;

  return (
    <Panel
      aria-label={label}
      className={`overflow-hidden ${className}`}
      data-context-panel-surface={surface}
    >
      <div className="border-b p-3 vs-border">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] vs-muted">
              Context
            </p>
            <h3 className="mt-1 truncate text-sm font-semibold">{activeTab.title}</h3>
            <p className="mt-1 line-clamp-2 text-xs vs-muted">{activeTab.detail}</p>
          </div>
          {onPinnedChange ? (
            <Button
              aria-pressed={pinned}
              className="shrink-0"
              onClick={() => {
                onPinnedChange(!pinned);
              }}
              selected={pinned}
              size="sm"
              variant={pinned ? "pinned" : "ghost"}
            >
              {pinned ? "Pinned" : "Pin"}
            </Button>
          ) : null}
        </div>
        {tabs.length > 1 ? (
          <div aria-label={`${label} tabs`} className="mt-3 grid gap-1.5" role="tablist">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTab.id;
              return (
                <Button
                  align="start"
                  aria-controls={isActive ? tabPanelId : undefined}
                  aria-selected={isActive}
                  className="min-w-0 flex-col gap-1 px-3 py-2"
                  data-testid={`context-panel-${surface}-${tab.id}`}
                  key={tab.id}
                  onClick={() => {
                    onTabChange(tab.id);
                  }}
                  role="tab"
                  selected={isActive}
                  variant={isActive ? "mode" : "secondary"}
                >
                  <span className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold">{tab.title}</span>
                    {tab.advanced ? (
                      <StatusChip className="py-0.5 text-[0.65rem]" tone="warning">
                        Advanced
                      </StatusChip>
                    ) : null}
                  </span>
                  <span className="mt-1 block truncate text-xs vs-muted">{tab.detail}</span>
                </Button>
              );
            })}
          </div>
        ) : null}
      </div>
      <div className="grid gap-3 p-3" id={tabPanelId} role="tabpanel">
        {activeTab.sections.map((section) => (
          <section
            aria-label={section.title}
            className="grid gap-2 rounded-lg border bg-[var(--vs-surface)] p-3 vs-border"
            data-context-section-kind={section.kind}
            key={section.id}
          >
            <div className="min-w-0">
              <h4 className="truncate text-sm font-semibold">{section.title}</h4>
              <p className="mt-1 text-xs vs-muted">{section.detail}</p>
            </div>
            {section.children}
          </section>
        ))}
      </div>
    </Panel>
  );
}
