import { useEffect, useMemo, useRef, useState } from "react";
import {
  isCommandPaletteShortcut,
  searchCommandEntries,
  shouldIgnoreCommandShortcutTarget,
  type CommandEntry,
} from "./model";

export function useCommandPaletteShortcut({
  isOpen,
  onClose,
  onOpen,
}: Readonly<{ isOpen: boolean; onClose: () => void; onOpen: () => void }>) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isCommandPaletteShortcut(event)) {
        return;
      }
      if (!isOpen && shouldIgnoreCommandShortcutTarget(event.target)) {
        return;
      }
      event.preventDefault();
      if (isOpen) {
        onClose();
        return;
      }
      onOpen();
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, onOpen]);
}

export function CommandPalette({
  entries,
  isOpen,
  onClose,
}: Readonly<{
  entries: CommandEntry[];
  isOpen: boolean;
  onClose: () => void;
}>) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const results = useMemo(() => searchCommandEntries(entries, query, 14), [entries, query]);
  const activeEntry = results.at(activeIndex) ?? results.at(0) ?? null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setActiveIndex(0);
    const focusId = globalThis.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => {
      globalThis.cancelAnimationFrame(focusId);
    };
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, results.length - 1)));
  }, [results.length]);

  if (!isOpen) {
    return null;
  }

  const runCommand = (entry: CommandEntry | null) => {
    if (!entry || entry.disabled) {
      return;
    }
    onClose();
    void entry.perform({ close: onClose, source: "palette" });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-zinc-950/35 px-3 py-6 sm:px-6" role="presentation">
      <div
        aria-label="Command palette"
        aria-modal="true"
        className="vs-app mx-auto flex max-h-[min(680px,calc(100vh-3rem))] w-full max-w-2xl flex-col overflow-hidden rounded-lg border bg-[var(--vs-raised)] shadow-2xl vs-border"
        role="dialog"
      >
        <div className="border-b p-3 vs-border">
          <label className="sr-only" htmlFor="command-palette-search">
            Search commands
          </label>
          <input
            aria-activedescendant={activeEntry ? `command-palette-${activeEntry.id}` : undefined}
            aria-autocomplete="list"
            aria-controls="command-palette-results"
            aria-expanded="true"
            className="h-12 w-full rounded-md border bg-[var(--vs-surface)] px-4 text-base font-semibold outline-none transition placeholder:text-[var(--vs-muted)] focus:border-orange-400 focus:ring-2 focus:ring-orange-100 vs-border"
            id="command-palette-search"
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((current) => Math.min(results.length - 1, current + 1));
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((current) => Math.max(0, current - 1));
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                runCommand(activeEntry);
              }
            }}
            placeholder="Search actions, settings, sources, bookmarks..."
            ref={inputRef}
            role="combobox"
            spellCheck={false}
            value={query}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2" id="command-palette-results">
          {results.length > 0 ? (
            <div className="grid gap-1" role="listbox">
              {results.map((entry, index) => (
                <div key={entry.id} role="presentation">
                  <button
                    aria-disabled={entry.disabled ? "true" : undefined}
                    aria-selected={index === activeIndex}
                    className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2.5 text-left transition ${
                      index === activeIndex
                        ? "border-orange-300 bg-orange-500/10"
                        : "border-transparent hover:border-[var(--vs-border)] hover:bg-[var(--vs-surface)]"
                    } ${entry.disabled ? "opacity-55" : ""}`}
                    disabled={entry.disabled}
                    id={`command-palette-${entry.id}`}
                    onClick={() => {
                      runCommand(entry);
                    }}
                    onMouseEnter={() => {
                      setActiveIndex(index);
                    }}
                    role="option"
                    type="button"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{entry.title}</span>
                      <span className="vs-muted mt-1 block truncate text-xs">
                        {entry.disabledReason ?? entry.detail ?? entry.section}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {entry.shortcut ? (
                        <kbd className="rounded border bg-[var(--vs-surface)] px-2 py-1 text-[0.65rem] font-semibold vs-border">
                          {entry.shortcut}
                        </kbd>
                      ) : null}
                      <span className="rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold vs-border vs-muted">
                        {entry.section}
                      </span>
                    </span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="vs-muted px-3 py-8 text-center text-sm">No matching commands.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-[0.68rem] font-semibold vs-border vs-muted">
          <span>Enter runs · Escape closes</span>
          <span>Ctrl/⌘ K opens Actions</span>
        </div>
      </div>
    </div>
  );
}
