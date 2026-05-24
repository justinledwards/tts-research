import { Button, Panel, fieldControlClassName } from "../../design";
import {
  DEFAULT_SHORTCUT_PREFERENCES,
  configurableShortcutCommands,
  shortcutBindingForCommand,
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
  return (
    <Panel className="grid gap-3 p-3" data-testid="shortcut-settings" variant="surface">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            Keyboard shortcuts
            <ScopeBadge scope="machine" />
          </h4>
          <p className="vs-muted mt-1 text-xs leading-5">
            Set the global shortcuts for commands, Settings, Help, and Create & Listen on this
            machine.
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
  if (commandId === "playback.createListen") {
    return "Create & Listen shortcut";
  }
  return fallback;
}
