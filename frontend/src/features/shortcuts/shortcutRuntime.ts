export interface ShortcutBinding {
  readonly altKey?: boolean;
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly primaryModifier?: boolean;
  readonly shiftKey?: boolean;
}

export type ShortcutPreferences = Record<string, string>;

export type ShortcutCommandId =
  | "command.palette"
  | "shortcut.cheatsheet"
  | "settings.open"
  | "help.open"
  | "playback.createListen";

const SHORTCUT_STORAGE_KEY = "tts-shortcut-preferences-v1";

type RuntimeShortcutCommand = readonly [
  id: ShortcutCommandId,
  defaultBindingId: string,
  bindings: readonly ShortcutBinding[],
];

const GLOBAL_SHORTCUTS = [
  [
    "command.palette",
    "mod-k",
    [
      { id: "mod-k", key: "k", label: "Ctrl+K / Cmd+K", primaryModifier: true },
      { id: "mod-p", key: "p", label: "Ctrl+P / Cmd+P", primaryModifier: true },
      { altKey: true, id: "alt-k", key: "k", label: "Alt+K" },
    ],
  ],
  [
    "shortcut.cheatsheet",
    "question",
    [
      { id: "question", key: "?", label: "?", shiftKey: true },
      { id: "f1", key: "F1", label: "F1" },
      { altKey: true, id: "alt-slash", key: "/", label: "Alt+/" },
    ],
  ],
  [
    "settings.open",
    "mod-comma",
    [
      { id: "mod-comma", key: ",", label: "Ctrl+, / Cmd+,", primaryModifier: true },
      { altKey: true, id: "alt-s", key: "s", label: "Alt+S" },
      { id: "f10", key: "F10", label: "F10" },
    ],
  ],
  [
    "help.open",
    "shift-f1",
    [
      { id: "shift-f1", key: "F1", label: "Shift+F1", shiftKey: true },
      { altKey: true, id: "alt-h", key: "h", label: "Alt+H" },
    ],
  ],
  [
    "playback.createListen",
    "mod-enter",
    [
      { id: "mod-enter", key: "Enter", label: "Ctrl+Enter / Cmd+Enter", primaryModifier: true },
      { altKey: true, id: "alt-enter", key: "Enter", label: "Alt+Enter" },
    ],
  ],
] as const satisfies readonly RuntimeShortcutCommand[];

const DEFAULT_SHORTCUT_PREFERENCES: ShortcutPreferences = Object.fromEntries(
  GLOBAL_SHORTCUTS.map((command) => [command[0], command[1]]),
);

export function loadShortcutPreferences(): ShortcutPreferences {
  if (typeof localStorage === "undefined") {
    return defaultShortcutPreferences();
  }
  try {
    return normalizeShortcutPreferences(
      JSON.parse(localStorage.getItem(SHORTCUT_STORAGE_KEY) ?? ""),
    );
  } catch {
    return defaultShortcutPreferences();
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
  return defaultShortcutPreferences();
}

export function resolveGlobalShortcutCommand(
  event: KeyboardEvent,
  preferences: ShortcutPreferences,
): ShortcutCommandId | null {
  for (const command of GLOBAL_SHORTCUTS) {
    const binding = shortcutBindingForCommand(command[0], preferences);
    if (binding && eventMatchesShortcutBinding(event, binding)) {
      return command[0];
    }
  }
  return null;
}

export function shortcutLabelForCommand(
  commandId: string,
  preferences: ShortcutPreferences,
): string | undefined {
  return shortcutBindingForCommand(commandId, preferences)?.label;
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

function shortcutBindingForCommand(
  commandId: string,
  preferences: ShortcutPreferences,
): ShortcutBinding | null {
  const command = GLOBAL_SHORTCUTS.find((item) => item[0] === commandId);
  if (!command) {
    return null;
  }
  const bindingId = preferences[commandId] ?? command[1];
  return (
    command[2].find((binding) => binding.id === bindingId) ??
    command[2].find((binding) => binding.id === command[1]) ??
    command[2][0]
  );
}

function normalizeShortcutPreferences(value: unknown): ShortcutPreferences {
  const next = defaultShortcutPreferences();
  if (!value || typeof value !== "object") {
    return next;
  }
  const candidate = value as Record<string, unknown>;
  for (const command of GLOBAL_SHORTCUTS) {
    const bindingId = candidate[command[0]];
    if (typeof bindingId === "string" && command[2].some((binding) => binding.id === bindingId)) {
      next[command[0]] = bindingId;
    }
  }
  return next;
}

function defaultShortcutPreferences(): ShortcutPreferences {
  return { ...DEFAULT_SHORTCUT_PREFERENCES };
}

function eventMatchesShortcutBinding(event: KeyboardEvent, binding: ShortcutBinding): boolean {
  const eventKey = normalizeShortcutKey(event.key);
  const bindingKey = normalizeShortcutKey(binding.key);
  if (eventKey !== bindingKey && !(binding.key === "?" && event.shiftKey && eventKey === "/")) {
    return false;
  }
  const ctrlOrMeta = event.ctrlKey || event.metaKey;
  if (binding.primaryModifier && !ctrlOrMeta) {
    return false;
  }
  if (!binding.primaryModifier && (event.ctrlKey || event.metaKey)) {
    return false;
  }
  return event.altKey === Boolean(binding.altKey) && event.shiftKey === Boolean(binding.shiftKey);
}

function normalizeShortcutKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}
