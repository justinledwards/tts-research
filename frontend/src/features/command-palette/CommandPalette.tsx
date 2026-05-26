import { useEffect, useMemo, useRef, useState } from "react";
import {
  commandCategoryForEntry,
  commandEntriesByCategory,
  commandShortcutLabel,
  searchCommandEntries,
  type CommandEntry,
} from "./commandRegistry";
import {
  shortcutCommandsByCategory,
  shortcutLabelForCommand,
  type ShortcutPreferences,
} from "../shortcuts/shortcutRegistry";
import { overlayDataAttributes } from "../layout";

export type CommandPaletteView = "commands" | "shortcuts";

export function CommandPalette({
  entries,
  isOpen,
  shortcutPreferences,
  view,
  onClose,
  onCustomizeShortcuts,
  onViewChange,
}: Readonly<{
  entries: CommandEntry[];
  isOpen: boolean;
  shortcutPreferences: ShortcutPreferences;
  view: CommandPaletteView;
  onClose: () => void;
  onCustomizeShortcuts: () => void;
  onViewChange: (view: CommandPaletteView) => void;
}>) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const results = useMemo(() => searchCommandEntries(entries, query, 18), [entries, query]);
  const groupedResults = useMemo(() => commandEntriesByCategory(results), [results]);
  const shortcutGroups = useMemo(
    () => shortcutCommandsByCategory(shortcutPreferences),
    [shortcutPreferences],
  );
  const paletteShortcutLabel =
    shortcutLabelForCommand("command.palette", shortcutPreferences) ?? "Ctrl+K / Cmd+K";
  const cheatSheetShortcutLabel =
    shortcutLabelForCommand("shortcut.cheatsheet", shortcutPreferences) ?? "?";
  const activeEntry = results.at(activeIndex) ?? results.at(0) ?? null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setActiveIndex(0);
    const focusId = globalThis.requestAnimationFrame(() => {
      if (view === "commands") {
        inputRef.current?.focus();
      }
    });
    return () => {
      globalThis.cancelAnimationFrame(focusId);
    };
  }, [isOpen, view]);

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
    <div
      className="fixed inset-0 z-[70] bg-zinc-950/35 px-3 py-6 sm:px-6"
      role="presentation"
      {...overlayDataAttributes("command-palette", "command-palette")}
    >
      <div
        aria-label="Command palette"
        aria-modal="true"
        className="vs-app mx-auto flex max-h-[min(760px,calc(100vh-3rem))] w-full max-w-3xl flex-col overflow-hidden rounded-lg border bg-[var(--vs-raised)] shadow-2xl vs-border"
        role="dialog"
      >
        <div className="border-b p-3 vs-border">
          <div className="mb-3 inline-grid rounded-md border p-1 vs-border vs-surface">
            <div className="grid grid-cols-2 gap-1">
              <button
                aria-pressed={view === "commands"}
                className={`h-9 rounded px-3 text-xs font-semibold transition ${
                  view === "commands"
                    ? "bg-orange-500 text-white"
                    : "vs-muted hover:bg-[var(--vs-raised)]"
                }`}
                data-testid="ui-action-command-palette-view-commands"
                onClick={() => {
                  onViewChange("commands");
                }}
                type="button"
              >
                Commands
              </button>
              <button
                aria-pressed={view === "shortcuts"}
                className={`h-9 rounded px-3 text-xs font-semibold transition ${
                  view === "shortcuts"
                    ? "bg-orange-500 text-white"
                    : "vs-muted hover:bg-[var(--vs-raised)]"
                }`}
                data-testid="ui-action-command-palette-view-shortcuts"
                onClick={() => {
                  onViewChange("shortcuts");
                }}
                type="button"
              >
                Shortcuts
              </button>
            </div>
          </div>
          {view === "commands" ? (
            <>
              <label className="sr-only" htmlFor="command-palette-search">
                Search commands
              </label>
              <input
                aria-activedescendant={
                  activeEntry ? `command-palette-${activeEntry.id}` : undefined
                }
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
            </>
          ) : null}
        </div>
        {view === "commands" ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-2" id="command-palette-results">
            {results.length > 0 ? (
              <div className="grid gap-3" role="listbox">
                {groupedResults.map((group) => (
                  <section className="grid gap-1" key={group.category}>
                    <h3 className="vs-muted px-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em]">
                      {group.category}
                    </h3>
                    {group.entries.map((entry) => {
                      const index = results.findIndex((item) => item.id === entry.id);
                      return (
                        <CommandButton
                          active={index === activeIndex}
                          entry={entry}
                          key={entry.id}
                          shortcut={commandShortcutLabel(entry, shortcutPreferences)}
                          onClick={() => {
                            runCommand(entry);
                          }}
                          onMouseEnter={() => {
                            setActiveIndex(index);
                          }}
                        />
                      );
                    })}
                  </section>
                ))}
              </div>
            ) : (
              <p className="vs-muted px-3 py-8 text-center text-sm">No matching commands.</p>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3 rounded-md border p-3 vs-border vs-surface">
              <div>
                <h3 className="text-sm font-semibold">Shortcut cheat sheet</h3>
                <p className="vs-muted mt-1 text-xs leading-5">
                  Global shortcuts can be changed in Reader settings. Surface shortcuts stay tied to
                  their reader or Teleprompt context.
                </p>
              </div>
              <button
                className="h-10 rounded-md border px-3 text-xs font-semibold transition hover:bg-[var(--vs-raised)] vs-border"
                data-testid="ui-action-command-palette-customize-settings"
                onClick={onCustomizeShortcuts}
                type="button"
              >
                Customize in Settings
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {shortcutGroups.map((group) => (
                <section
                  className="rounded-md border p-3 vs-border vs-surface"
                  key={group.category}
                >
                  <h3 className="text-sm font-semibold">{group.category}</h3>
                  <div className="mt-3 grid gap-2">
                    {group.commands.map(({ binding, command }) => (
                      <div
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm"
                        key={command.id}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{command.label}</p>
                          <p className="vs-muted mt-0.5 line-clamp-2 text-xs leading-5">
                            {command.description}
                          </p>
                        </div>
                        <kbd className="rounded border bg-[var(--vs-raised)] px-2 py-1 text-[0.68rem] font-semibold vs-border">
                          {binding?.label ?? "Unset"}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-[0.68rem] font-semibold vs-border vs-muted">
          <span>{view === "commands" ? "Enter runs · Escape closes" : "Escape closes"}</span>
          <span>
            {paletteShortcutLabel} commands · {cheatSheetShortcutLabel} shortcuts
          </span>
        </div>
      </div>
    </div>
  );
}

function CommandButton({
  active,
  entry,
  shortcut,
  onClick,
  onMouseEnter,
}: Readonly<{
  active: boolean;
  entry: CommandEntry;
  shortcut?: string;
  onClick: () => void;
  onMouseEnter: () => void;
}>) {
  return (
    <button
      aria-disabled={entry.disabled ? "true" : undefined}
      aria-selected={active}
      className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2.5 text-left transition ${
        active
          ? "border-orange-300 bg-orange-500/10"
          : "border-transparent hover:border-[var(--vs-border)] hover:bg-[var(--vs-surface)]"
      } ${entry.disabled ? "opacity-55" : ""}`}
      data-capability-gated={entry.capabilityGated ? "true" : undefined}
      data-capability-reason={entry.capabilityGated ? entry.disabledReason : undefined}
      data-disabled-reason={entry.disabledReason}
      data-provider-capability={entry.capabilityGate}
      disabled={entry.disabled}
      id={`command-palette-${entry.id}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      role="option"
      type="button"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{entry.title}</span>
        <span className="vs-muted mt-1 block truncate text-xs">
          {entry.disabledReason ?? entry.detail ?? commandCategoryForEntry(entry)}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {shortcut ? (
          <kbd className="rounded border bg-[var(--vs-surface)] px-2 py-1 text-[0.65rem] font-semibold vs-border">
            {shortcut}
          </kbd>
        ) : null}
        <span className="rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold vs-border vs-muted">
          {commandCategoryForEntry(entry)}
        </span>
      </span>
    </button>
  );
}
