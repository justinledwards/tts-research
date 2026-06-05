import type { ReactNode } from "react";
import { Button, Panel, StatusChip } from "../../design";
import { overlayDataAttributes } from "../layout";
import {
  selectContextPanelTab,
  type ContextPanelDisplayState,
  type ContextPanelSurface,
  type ContextPanelTabDefinition,
} from "./contextPanelModel";
import type { ContextPanelTabId } from "./contextPanelTabs";

export function ContextPanel({
  activeTabId,
  className = "",
  collapsedSummary,
  displayState = "expanded",
  headingDetail,
  headingTitle,
  label = "Inspector",
  pinned = false,
  surface,
  tabs,
  onDisplayStateChange,
  onPinnedChange,
  onTabChange,
}: Readonly<{
  activeTabId: ContextPanelTabId | null;
  className?: string;
  collapsedSummary?: ReactNode;
  displayState?: ContextPanelDisplayState;
  headingDetail?: string;
  headingTitle?: string;
  label?: string;
  pinned?: boolean;
  surface: ContextPanelSurface;
  tabs: readonly ContextPanelTabDefinition[];
  onDisplayStateChange?: (state: ContextPanelDisplayState) => void;
  onPinnedChange?: (pinned: boolean) => void;
  onTabChange: (tabId: ContextPanelTabId) => void;
}>) {
  const activeTab = selectContextPanelTab(tabs, activeTabId);
  if (!activeTab) {
    return null;
  }

  const tabPanelId = `context-panel-${surface}-${activeTab.id}`;
  const activeTabOwners = uniquePanelOwners(activeTab);
  const activeAdvancedReason = activeTab.advanced
    ? `${activeTab.title} is an operator-facing panel for diagnostics and internals. It stays hidden from Read mode unless selected or pinned intentionally.`
    : null;
  const resolvedDisplayState: ContextPanelDisplayState = pinned ? "pinned" : displayState;
  const visibleHeadingTitle = headingTitle ?? activeTab.title;
  const visibleHeadingDetail = headingDetail ?? activeTab.detail;
  if (resolvedDisplayState === "collapsed") {
    return (
      <Panel
        aria-label={label}
        className={`overflow-hidden ${className}`}
        data-context-panel-active-tab={activeTab.id}
        data-context-panel-display-state={resolvedDisplayState}
        data-context-panel-owner={activeTabOwners.join(",")}
        data-context-panel-surface={surface}
        {...overlayDataAttributes("context-panel", "context-panel")}
      >
        <div className="grid gap-3 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] vs-muted">
                Inspector
              </p>
              <h3 className="mt-1 text-sm font-semibold break-words">{visibleHeadingTitle}</h3>
              <p className="mt-1 text-xs leading-5 break-words vs-muted">{visibleHeadingDetail}</p>
            </div>
            <Button
              className="shrink-0"
              onClick={() => {
                onDisplayStateChange?.("expanded");
              }}
              size="sm"
              variant="secondary"
            >
              Expand Inspector
            </Button>
          </div>
          {collapsedSummary ?? (
            <p className="text-xs leading-5 vs-muted">{activeTab.sections[0]?.detail}</p>
          )}
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      aria-label={label}
      className={`overflow-hidden ${className}`}
      data-context-panel-advanced={activeTab.advanced ? "true" : "false"}
      data-context-panel-active-tab={activeTab.id}
      data-context-panel-display-state={resolvedDisplayState}
      data-context-panel-owner={activeTabOwners.join(",")}
      data-context-panel-reason={activeAdvancedReason ?? ""}
      data-context-panel-surface={surface}
      {...overlayDataAttributes("context-panel", "context-panel")}
    >
      <div className="border-b p-3 vs-border">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] vs-muted">
              Inspector
            </p>
            <h3 className="mt-1 text-sm font-semibold break-words">{visibleHeadingTitle}</h3>
            <p className="mt-1 text-xs leading-5 break-words vs-muted">{visibleHeadingDetail}</p>
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
          {onDisplayStateChange && !pinned ? (
            <Button
              className="shrink-0"
              onClick={() => {
                onDisplayStateChange("collapsed");
              }}
              size="sm"
              variant="ghost"
            >
              Collapse
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
                    <span className="min-w-0 text-sm font-semibold break-words">{tab.title}</span>
                    {tab.advanced ? (
                      <StatusChip className="py-0.5 text-[0.65rem]" tone="warning">
                        Advanced
                      </StatusChip>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-left text-xs leading-5 break-words vs-muted">
                    {tab.detail}
                  </span>
                </Button>
              );
            })}
          </div>
        ) : null}
        {activeAdvancedReason ? (
          <div
            className="mt-3 rounded-md border border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] p-2 text-xs leading-5 text-[var(--vs-status-warning)] dark:text-[var(--vs-status-warning)]"
            data-context-panel-advanced-reason={activeAdvancedReason}
          >
            <span className="font-semibold">Advanced: </span>
            {activeAdvancedReason}
          </div>
        ) : null}
      </div>
      <div className="grid gap-3 p-3" id={tabPanelId} role="tabpanel">
        {activeTab.sections.map((section) => {
          const sectionAdvancedReason = section.debugOnly
            ? debugSectionReason(section.title, section.detail)
            : "";
          return (
            <section
              aria-label={section.title}
              className="grid gap-2 rounded-lg border bg-[var(--vs-surface)] p-3 vs-border"
              data-context-section-advanced-reason={sectionAdvancedReason}
              data-context-section-allowed-surfaces={(section.allowedSurfaces ?? []).join(",")}
              data-context-section-debug-only={section.debugOnly ? "true" : "false"}
              data-context-section-empty-state={section.emptyState ?? ""}
              data-context-section-kind={section.kind}
              data-context-section-owner={section.owner ?? ""}
              data-context-section-panel-id={section.panelId ?? activeTab.id}
              data-context-section-priority={section.priority}
              data-context-section-relevance={section.relevance ?? ""}
              key={section.id}
            >
              <div className="min-w-0">
                <h4 className="text-sm font-semibold break-words">{section.title}</h4>
                <p className="mt-1 text-xs leading-5 break-words vs-muted">{section.detail}</p>
              </div>
              {sectionAdvancedReason ? (
                <p
                  className="rounded-md border border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] px-2 py-1 text-xs leading-5 text-[var(--vs-status-warning)] dark:text-[var(--vs-status-warning)]"
                  data-context-section-advanced-reason-visible="true"
                >
                  Advanced: {sectionAdvancedReason}
                </p>
              ) : null}
              {section.children}
            </section>
          );
        })}
      </div>
    </Panel>
  );
}

function uniquePanelOwners(tab: ContextPanelTabDefinition): string[] {
  return [...new Set(tab.sections.map((section) => section.owner).filter(Boolean))] as string[];
}

function debugSectionReason(title: string, detail: string): string {
  return `${title} is visible only in Diagnostics for operator review: ${detail}`;
}
