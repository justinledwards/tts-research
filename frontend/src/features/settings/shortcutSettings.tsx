import { Button, Panel, fieldControlClassName } from "../../design";
import {
  DEFAULT_SHORTCUT_PREFERENCES,
  configurableShortcutCommands,
  shortcutBindingForCommand,
  shortcutPreferenceConflicts,
  updateShortcutPreference,
  type ShortcutPreferences,
} from "../shortcuts/shortcutRegistry";
import { ScopeBadge } from "./ScopeBadge";

export function ShortcutSettings({
  preferences,
  onChange,
  onReset,
}: Readonly<{
  preferences: ShortcutPreferences;
  onChange: (preferences: ShortcutPreferences) => void;
  onReset: () => void;
}>) {
  const defaultsAlreadyActive = configurableShortcutCommands().every(
    (command) => preferences[command.id] === DEFAULT_SHORTCUT_PREFERENCES[command.id],
  );
  const conflicts = shortcutPreferenceConflicts(preferences).filter((conflict) =>
    conflict.commandIds.some((commandId) =>
      configurableShortcutCommands().some((command) => command.id === commandId),
    ),
  );
  return (
    <Panel className="grid gap-3 p-3" data-testid="shortcut-settings" variant="surface">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            Keyboard shortcuts
            <ScopeBadge scope="machine" />
          </h4>
          <p className="vs-muted mt-1 text-xs leading-5">
            Set safe shortcut alternatives for global commands and review actions on this machine.
          </p>
        </div>
        <Button
          disabled={defaultsAlreadyActive}
          disabledReason="Shortcuts already match the default bindings."
          onClick={onReset}
          size="sm"
          variant="secondary"
        >
          Restore defaults
        </Button>
      </div>
      {conflicts.length > 0 ? (
        <div
          className="rounded-md border border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] px-3 py-2 text-xs font-semibold text-[var(--vs-status-warning)]"
          data-testid="shortcut-settings-conflicts"
        >
          Shortcut conflict:{" "}
          {conflicts.map((conflict) => `${conflict.label} in ${conflict.scope}`).join("; ")}.
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {configurableShortcutCommands().map((command) => (
          <label className="grid gap-1 text-xs font-semibold" key={command.id}>
            <span>{shortcutSettingLabel(command.id, command.label)}</span>
            <select
              className={fieldControlClassName}
              data-testid={`shortcut-setting-${command.id.replaceAll(".", "-")}`}
              onChange={(event) => {
                onChange(
                  updateShortcutPreference(preferences, command.id, event.currentTarget.value),
                );
              }}
              value={
                shortcutBindingForCommand(command.id, preferences)?.id ?? command.defaultBindingId
              }
            >
              {command.bindings.map((binding) => (
                <option key={binding.id} value={binding.id}>
                  {binding.label}
                </option>
              ))}
            </select>
            <span className="vs-muted leading-5">{command.description}</span>
          </label>
        ))}
      </div>
    </Panel>
  );
}

export type { ShortcutPreferences } from "../shortcuts/shortcutRegistry";

function shortcutSettingLabel(commandId: string, fallback: string): string {
  if (commandId === "command.palette") {
    return "Command palette shortcut";
  }
  if (commandId === "shortcut.cheatsheet") {
    return "Cheat sheet shortcut";
  }
  if (commandId === "settings.open") {
    return "Settings shortcut";
  }
  if (commandId === "help.open") {
    return "Help shortcut";
  }
  if (commandId === "status.openActivity") {
    return "Open Activity shortcut";
  }
  if (commandId === "status.inspectIssue") {
    return "Inspect status issue shortcut";
  }
  if (commandId === "playback.createListen") {
    return "Create & Listen shortcut";
  }
  if (commandId === "review.approve") {
    return "Approve block shortcut";
  }
  if (commandId === "review.edit") {
    return "Edit block shortcut";
  }
  if (commandId === "review.retry") {
    return "Retry block shortcut";
  }
  if (commandId === "review.regenerate") {
    return "Regenerate block shortcut";
  }
  if (commandId === "review.inspector") {
    return "Inspector shortcut";
  }
  if (commandId === "review.nextIssue") {
    return "Next issue shortcut";
  }
  return fallback;
}
