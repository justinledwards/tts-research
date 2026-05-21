export type ShortcutCategory =
  | "Navigation"
  | "Playback"
  | "Review"
  | "Teleprompt"
  | "Settings"
  | "Diagnostics";

export interface ShortcutBinding {
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly metaKey?: boolean;
  readonly primaryModifier?: boolean;
  readonly shiftKey?: boolean;
}

export interface ShortcutCommand {
  readonly category: ShortcutCategory;
  readonly configurable: boolean;
  readonly defaultBindingId: string;
  readonly description: string;
  readonly id: string;
  readonly label: string;
  readonly scope: "global" | "reader" | "teleprompt";
  readonly bindings: readonly ShortcutBinding[];
}

export type ShortcutPreferences = Record<string, string>;

export const SHORTCUT_STORAGE_KEY = "tts-shortcut-preferences-v1";

export const SHORTCUT_COMMANDS = [
  {
    bindings: [
      { id: "mod-k", key: "k", label: "Ctrl+K / Cmd+K", primaryModifier: true },
      { id: "mod-p", key: "p", label: "Ctrl+P / Cmd+P", primaryModifier: true },
      { altKey: true, id: "alt-k", key: "k", label: "Alt+K" },
    ],
    category: "Navigation",
    configurable: true,
    defaultBindingId: "mod-k",
    description: "Open or close the command palette.",
    id: "command.palette",
    label: "Open command palette",
    scope: "global",
  },
  {
    bindings: [
      { id: "question", key: "?", label: "?", shiftKey: true },
      { id: "f1", key: "F1", label: "F1" },
      { altKey: true, id: "alt-slash", key: "/", label: "Alt+/" },
    ],
    category: "Settings",
    configurable: true,
    defaultBindingId: "question",
    description: "Open the shortcut cheat sheet.",
    id: "shortcut.cheatsheet",
    label: "Open shortcut cheat sheet",
    scope: "global",
  },
  {
    bindings: [
      { id: "mod-comma", key: ",", label: "Ctrl+, / Cmd+,", primaryModifier: true },
      { altKey: true, id: "alt-s", key: "s", label: "Alt+S" },
      { id: "f10", key: "F10", label: "F10" },
    ],
    category: "Settings",
    configurable: true,
    defaultBindingId: "mod-comma",
    description: "Open the shared Studio Settings drawer.",
    id: "settings.open",
    label: "Open settings",
    scope: "global",
  },
  {
    bindings: [
      { id: "shift-f1", key: "F1", label: "Shift+F1", shiftKey: true },
      { altKey: true, id: "alt-h", key: "h", label: "Alt+H" },
    ],
    category: "Diagnostics",
    configurable: true,
    defaultBindingId: "shift-f1",
    description: "Open contextual workflow help.",
    id: "help.open",
    label: "Open help",
    scope: "global",
  },
  {
    bindings: [
      { id: "mod-enter", key: "Enter", label: "Ctrl+Enter / Cmd+Enter", primaryModifier: true },
      { altKey: true, id: "alt-enter", key: "Enter", label: "Alt+Enter" },
    ],
    category: "Playback",
    configurable: true,
    defaultBindingId: "mod-enter",
    description: "Create narration audio from the active source.",
    id: "playback.createListen",
    label: "Create & Listen",
    scope: "global",
  },
  {
    bindings: [{ id: "space-k", key: " ", label: "Space / K" }],
    category: "Playback",
    configurable: false,
    defaultBindingId: "space-k",
    description: "Play or pause reader and teleprompt playback.",
    id: "playback.toggle",
    label: "Play or pause",
    scope: "reader",
  },
  {
    bindings: [{ id: "left-j", key: "ArrowLeft", label: "Left / J" }],
    category: "Playback",
    configurable: false,
    defaultBindingId: "left-j",
    description: "Seek backward in reader playback.",
    id: "playback.seekBackward",
    label: "Seek backward",
    scope: "reader",
  },
  {
    bindings: [{ id: "right-l", key: "ArrowRight", label: "Right / L" }],
    category: "Playback",
    configurable: false,
    defaultBindingId: "right-l",
    description: "Seek forward in reader playback.",
    id: "playback.seekForward",
    label: "Seek forward",
    scope: "reader",
  },
  {
    bindings: [{ id: "home", key: "Home", label: "Home" }],
    category: "Playback",
    configurable: false,
    defaultBindingId: "home",
    description: "Restart reader playback.",
    id: "playback.restart",
    label: "Restart playback",
    scope: "reader",
  },
  {
    bindings: [{ id: "brackets", key: "[", label: "[ / ]" }],
    category: "Playback",
    configurable: false,
    defaultBindingId: "brackets",
    description: "Adjust reader playback speed.",
    id: "playback.speed",
    label: "Speed down or up",
    scope: "reader",
  },
  {
    bindings: [{ id: "b", key: "b", label: "B" }],
    category: "Review",
    configurable: false,
    defaultBindingId: "b",
    description: "Bookmark the current reader position.",
    id: "wayfinding.bookmark",
    label: "Bookmark position",
    scope: "reader",
  },
  {
    bindings: [{ id: "escape", key: "Escape", label: "Escape" }],
    category: "Navigation",
    configurable: false,
    defaultBindingId: "escape",
    description: "Close the active reader, palette, or drawer.",
    id: "surface.close",
    label: "Close surface",
    scope: "reader",
  },
  {
    bindings: [{ id: "teleprompt-arrows", key: "ArrowRight", label: "Left / Right" }],
    category: "Teleprompt",
    configurable: false,
    defaultBindingId: "teleprompt-arrows",
    description: "Move between Teleprompt cues.",
    id: "teleprompt.cues",
    label: "Previous or next cue",
    scope: "teleprompt",
  },
  {
    bindings: [{ id: "teleprompt-r", key: "r", label: "R" }],
    category: "Teleprompt",
    configurable: false,
    defaultBindingId: "teleprompt-r",
    description: "Return from Teleprompt to Review.",
    id: "teleprompt.returnReview",
    label: "Back to Review",
    scope: "teleprompt",
  },
  {
    bindings: [{ id: "teleprompt-v", key: "v", label: "V / P" }],
    category: "Teleprompt",
    configurable: false,
    defaultBindingId: "teleprompt-v",
    description: "Return from Teleprompt to Preview.",
    id: "teleprompt.returnPreview",
    label: "Back to Preview",
    scope: "teleprompt",
  },
] as const satisfies readonly ShortcutCommand[];

export type ShortcutCommandId = (typeof SHORTCUT_COMMANDS)[number]["id"];

export const DEFAULT_SHORTCUT_PREFERENCES: ShortcutPreferences = Object.fromEntries(
  SHORTCUT_COMMANDS.map((command) => [command.id, command.defaultBindingId]),
);

export function configurableShortcutCommands(): ShortcutCommand[] {
  return SHORTCUT_COMMANDS.filter((command) => command.configurable);
}

export function shortcutCommandById(commandId: string): ShortcutCommand | null {
  return SHORTCUT_COMMANDS.find((command) => command.id === commandId) ?? null;
}

export function shortcutBindingForCommand(
  commandId: string,
  preferences: ShortcutPreferences,
): ShortcutBinding | null {
  const command = shortcutCommandById(commandId);
  if (!command) {
    return null;
  }
  const bindingId = preferences[commandId] ?? command.defaultBindingId;
  return (
    command.bindings.find((binding) => binding.id === bindingId) ??
    command.bindings.find((binding) => binding.id === command.defaultBindingId) ??
    command.bindings[0]
  );
}

export function shortcutLabelForCommand(
  commandId: string,
  preferences: ShortcutPreferences,
): string | undefined {
  return shortcutBindingForCommand(commandId, preferences)?.label;
}

export function updateShortcutPreference(
  preferences: ShortcutPreferences,
  commandId: string,
  bindingId: string,
): ShortcutPreferences {
  const command = shortcutCommandById(commandId);
  if (!command?.configurable || !command.bindings.some((binding) => binding.id === bindingId)) {
    return preferences;
  }
  return { ...preferences, [commandId]: bindingId };
}

export function normalizeShortcutPreferences(value: unknown): ShortcutPreferences {
  const next = { ...DEFAULT_SHORTCUT_PREFERENCES };
  if (!value || typeof value !== "object") {
    return next;
  }
  const candidate = value as Record<string, unknown>;
  for (const command of SHORTCUT_COMMANDS) {
    const bindingId = candidate[command.id];
    if (
      typeof bindingId === "string" &&
      command.bindings.some((binding) => binding.id === bindingId)
    ) {
      next[command.id] = bindingId;
    }
  }
  return next;
}

export function loadShortcutPreferences(): ShortcutPreferences {
  if (typeof localStorage === "undefined") {
    return { ...DEFAULT_SHORTCUT_PREFERENCES };
  }
  try {
    return normalizeShortcutPreferences(
      JSON.parse(localStorage.getItem(SHORTCUT_STORAGE_KEY) ?? ""),
    );
  } catch {
    return { ...DEFAULT_SHORTCUT_PREFERENCES };
  }
}

export function saveShortcutPreferences(preferences: ShortcutPreferences): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(
    SHORTCUT_STORAGE_KEY,
    JSON.stringify(normalizeShortcutPreferences(preferences)),
  );
}

export function resetShortcutPreferences(): ShortcutPreferences {
  return { ...DEFAULT_SHORTCUT_PREFERENCES };
}

export function resolveGlobalShortcutCommand(
  event: KeyboardEvent,
  preferences: ShortcutPreferences,
): ShortcutCommandId | null {
  for (const command of SHORTCUT_COMMANDS) {
    if (command.scope !== "global") {
      continue;
    }
    const binding = shortcutBindingForCommand(command.id, preferences);
    if (binding && eventMatchesShortcutBinding(event, binding)) {
      return command.id;
    }
  }
  return null;
}

export function eventMatchesShortcutBinding(
  event: KeyboardEvent,
  binding: ShortcutBinding,
): boolean {
  if (!shortcutKeysMatch(event, binding)) {
    return false;
  }
  const ctrlOrMeta = event.ctrlKey || event.metaKey;
  if (binding.primaryModifier && !ctrlOrMeta) {
    return false;
  }
  if (!binding.primaryModifier && event.ctrlKey !== Boolean(binding.ctrlKey)) {
    return false;
  }
  if (!binding.primaryModifier && event.metaKey !== Boolean(binding.metaKey)) {
    return false;
  }
  return event.altKey === Boolean(binding.altKey) && event.shiftKey === Boolean(binding.shiftKey);
}

export function shouldIgnoreGlobalShortcutTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "select" ||
    tagName === "textarea" ||
    Boolean(target.closest("[data-command-palette-ignore-shortcuts]"))
  );
}

export function shortcutCommandsByCategory(preferences: ShortcutPreferences): {
  category: ShortcutCategory;
  commands: { binding: ShortcutBinding | null; command: ShortcutCommand }[];
}[] {
  const categories: ShortcutCategory[] = [
    "Navigation",
    "Playback",
    "Review",
    "Teleprompt",
    "Settings",
    "Diagnostics",
  ];
  return categories
    .map((category) => ({
      category,
      commands: SHORTCUT_COMMANDS.filter((command) => command.category === category).map(
        (command) => ({
          binding: shortcutBindingForCommand(command.id, preferences),
          command,
        }),
      ),
    }))
    .filter((group) => group.commands.length > 0);
}

function normalizeShortcutKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

function shortcutKeysMatch(event: KeyboardEvent, binding: ShortcutBinding): boolean {
  const eventKey = normalizeShortcutKey(event.key);
  const bindingKey = normalizeShortcutKey(binding.key);
  if (eventKey === bindingKey) {
    return true;
  }
  return binding.key === "?" && event.shiftKey && eventKey === "/";
}
