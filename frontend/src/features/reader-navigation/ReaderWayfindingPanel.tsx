import { useState } from "react";
import type {
  ReaderBookmarkItem,
  ReaderNavigationTab,
  ReaderOutlineItem,
  ReaderRecentPositionItem,
} from "./model";
import { formatProgressPercent, formatReaderDateTime } from "./model";

export interface ReaderWayfindingPanelProps<TOutlineTarget = unknown> {
  activeTab?: ReaderNavigationTab;
  bookmarks: ReaderBookmarkItem[];
  canBookmark?: boolean;
  className?: string;
  maxItems?: number;
  outlineItems: ReaderOutlineItem<TOutlineTarget>[];
  recentItems: ReaderRecentPositionItem[];
  title?: string;
  onAddBookmark?: () => void;
  onBookmarkNavigate: (bookmark: ReaderBookmarkItem) => void;
  onOutlineNavigate: (item: ReaderOutlineItem<TOutlineTarget>) => void;
  onRecentNavigate: (item: ReaderRecentPositionItem) => void;
}

export function ReaderWayfindingPanel<TOutlineTarget = unknown>({
  activeTab = "outline",
  bookmarks,
  canBookmark = false,
  className = "",
  maxItems = 8,
  outlineItems,
  recentItems,
  title = "Wayfinding",
  onAddBookmark,
  onBookmarkNavigate,
  onOutlineNavigate,
  onRecentNavigate,
}: Readonly<ReaderWayfindingPanelProps<TOutlineTarget>>) {
  const [tab, setTab] = useState<ReaderNavigationTab>(activeTab);
  const shownOutline = outlineItems.slice(0, maxItems);
  const shownBookmarks = bookmarks.slice(0, maxItems);
  const shownRecent = recentItems.slice(0, maxItems);

  return (
    <section
      className={`min-w-0 rounded-md border bg-[var(--vs-raised)] p-3 shadow-sm vs-border ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {onAddBookmark ? (
          <button
            aria-keyshortcuts="B"
            className="cinema-touch-target rounded-md border px-2 text-xs font-semibold transition hover:bg-[var(--vs-surface)] disabled:opacity-40 vs-border"
            disabled={!canBookmark}
            onClick={onAddBookmark}
            type="button"
          >
            Bookmark
          </button>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-3 rounded-md border p-0.5 text-xs font-semibold vs-border">
        {(["outline", "bookmarks", "recent"] as const).map((item) => (
          <button
            className={`cinema-touch-target rounded px-2 transition ${
              tab === item
                ? "bg-[var(--vs-selected)] text-[var(--vs-action-primary)]"
                : "vs-muted hover:text-[var(--vs-text)]"
            }`}
            key={item}
            onClick={() => {
              setTab(item);
            }}
            type="button"
          >
            {tabLabel(item)}
          </button>
        ))}
      </div>
      <div className="mt-3">
        {tab === "outline" ? (
          <ReaderOutlineList items={shownOutline} onNavigate={onOutlineNavigate} />
        ) : null}
        {tab === "bookmarks" ? (
          <ReaderBookmarkList items={shownBookmarks} onNavigate={onBookmarkNavigate} />
        ) : null}
        {tab === "recent" ? (
          <ReaderRecentList items={shownRecent} onNavigate={onRecentNavigate} />
        ) : null}
      </div>
    </section>
  );
}

function ReaderOutlineList<TOutlineTarget>({
  items,
  onNavigate,
}: Readonly<{
  items: ReaderOutlineItem<TOutlineTarget>[];
  onNavigate: (item: ReaderOutlineItem<TOutlineTarget>) => void;
}>) {
  if (items.length === 0) {
    return <p className="vs-muted text-sm">No outline available.</p>;
  }
  return (
    <div className="grid gap-2" data-reader-wayfinding-list="outline">
      {items.map((item, index) => (
        <button
          className={`cinema-touch-target min-w-0 rounded-md border px-3 py-2 text-left text-sm transition vs-border ${
            item.isActive
              ? "border-[var(--vs-selected-border)] bg-[var(--vs-selected)] text-[var(--vs-action-primary)]"
              : "hover:bg-[var(--vs-surface)]"
          }`}
          key={`${item.id}:${String(index)}`}
          onClick={() => {
            onNavigate(item);
          }}
          style={{
            paddingLeft: `${String(Math.max(0, (item.level ?? 1) - 1) * 0.75 + 0.75)}rem`,
          }}
          type="button"
        >
          <span className="block truncate font-semibold" title={item.label}>
            {item.label}
          </span>
          {item.detail ? (
            <span className="vs-muted mt-1 block truncate text-xs">{item.detail}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function ReaderBookmarkList({
  items,
  onNavigate,
}: Readonly<{
  items: ReaderBookmarkItem[];
  onNavigate: (item: ReaderBookmarkItem) => void;
}>) {
  if (items.length === 0) {
    return <p className="vs-muted text-sm">No bookmarks saved for this narration.</p>;
  }
  return (
    <div className="grid gap-2" data-reader-wayfinding-list="bookmarks">
      {items.map((item, index) => (
        <button
          className="cinema-touch-target min-w-0 rounded-md border px-3 py-2 text-left text-sm transition hover:bg-[var(--vs-surface)] vs-border"
          key={`${item.id}:${String(index)}`}
          onClick={() => {
            onNavigate(item);
          }}
          type="button"
        >
          <span className="block truncate font-semibold" title={item.label}>
            {item.label}
          </span>
          <span className="vs-muted mt-1 block truncate text-xs">
            {item.detail} · {formatReaderDateTime(item.createdAt)}
          </span>
        </button>
      ))}
    </div>
  );
}

function ReaderRecentList({
  items,
  onNavigate,
}: Readonly<{
  items: ReaderRecentPositionItem[];
  onNavigate: (item: ReaderRecentPositionItem) => void;
}>) {
  if (items.length === 0) {
    return <p className="vs-muted text-sm">No recent positions yet.</p>;
  }
  return (
    <div className="grid gap-2" data-reader-wayfinding-list="recent">
      {items.map((item, index) => (
        <button
          className="cinema-touch-target min-w-0 rounded-md border px-3 py-2 text-left text-sm transition hover:bg-[var(--vs-surface)] vs-border"
          key={`${item.id}:${String(index)}`}
          onClick={() => {
            onNavigate(item);
          }}
          type="button"
        >
          <span className="flex min-w-0 items-center justify-between gap-3">
            <span className="truncate font-semibold" title={item.label}>
              {item.label}
            </span>
            <span className="shrink-0 text-xs font-semibold text-[var(--vs-action-primary)]">
              {formatProgressPercent(item.progress)}
            </span>
          </span>
          <span className="vs-muted mt-1 block truncate text-xs">
            {item.detail} · {formatReaderDateTime(item.updatedAt)}
          </span>
        </button>
      ))}
    </div>
  );
}

function tabLabel(tab: ReaderNavigationTab): string {
  if (tab === "bookmarks") {
    return "Bookmarks";
  }
  if (tab === "recent") {
    return "Recent";
  }
  return "Outline";
}
