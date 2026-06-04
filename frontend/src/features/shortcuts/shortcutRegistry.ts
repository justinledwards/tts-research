export type ShortcutCategory =
  | "Global"
  | "Navigation"
  | "Playback"
  | "Review"
  | "Teleprompt"
  | "Theatre"
  | "Status"
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
  readonly scope: "global" | "reader" | "review" | "teleprompt" | "theatre";
  readonly bindings: readonly ShortcutBinding[];
}

export type ShortcutPreferences = Record<string, string>;

export type ShortcutAvailabilityState = "available" | "blocked" | "disabled";

export interface ShortcutAvailability {
  readonly reason?: string;
  readonly state: ShortcutAvailabilityState;
}

export interface ShortcutEventLike {
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly key: string;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
}

export interface ResolvedShortcutCommand {
  readonly bindingId: string;
  readonly commandId: ShortcutCommandId;
}

export const SHORTCUT_STORAGE_KEY = "tts-shortcut-preferences-v1";

export const SHORTCUT_COMMANDS = [
  {
    bindings: [
      { id: "mod-k", key: "k", label: "Ctrl+K / Cmd+K", primaryModifier: true },
      { id: "mod-p", key: "p", label: "Ctrl+P / Cmd+P", primaryModifier: true },
      { altKey: true, id: "alt-k", key: "k", label: "Alt+K" },
    ],
    category: "Global",
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
    category: "Global",
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
    category: "Global",
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
    category: "Global",
    configurable: true,
    defaultBindingId: "shift-f1",
    description: "Open contextual workflow help.",
    id: "help.open",
    label: "Open help",
    scope: "global",
  },
  {
    bindings: [
      { altKey: true, id: "alt-shift-a", key: "a", label: "Alt+Shift+A", shiftKey: true },
      { id: "f8", key: "F8", label: "F8" },
    ],
    category: "Status",
    configurable: true,
    defaultBindingId: "alt-shift-a",
    description: "Open Command Center Activity for current narration work.",
    id: "status.openActivity",
    label: "Open Activity",
    scope: "global",
  },
  {
    bindings: [
      { altKey: true, id: "alt-shift-i", key: "i", label: "Alt+Shift+I", shiftKey: true },
      { id: "f9", key: "F9", label: "F9" },
    ],
    category: "Status",
    configurable: true,
    defaultBindingId: "alt-shift-i",
    description: "Inspect the selected or first active status issue.",
    id: "status.inspectIssue",
    label: "Inspect status issue",
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
    bindings: [
      { id: "space", key: " ", label: "Space" },
      { id: "k", key: "k", label: "K" },
    ],
    category: "Playback",
    configurable: false,
    defaultBindingId: "space",
    description: "Play or pause reader and teleprompt playback.",
    id: "playback.toggle",
    label: "Play or pause",
    scope: "reader",
  },
  {
    bindings: [
      { id: "left", key: "ArrowLeft", label: "Left" },
      { id: "j", key: "j", label: "J" },
    ],
    category: "Playback",
    configurable: false,
    defaultBindingId: "left",
    description: "Seek backward in reader playback.",
    id: "playback.seekBackward",
    label: "Seek backward",
    scope: "reader",
  },
  {
    bindings: [
      { id: "right", key: "ArrowRight", label: "Right" },
      { id: "l", key: "l", label: "L" },
    ],
    category: "Playback",
    configurable: false,
    defaultBindingId: "right",
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
    bindings: [
      { id: "left-bracket", key: "[", label: "[" },
      { id: "right-bracket", key: "]", label: "]" },
    ],
    category: "Playback",
    configurable: false,
    defaultBindingId: "left-bracket",
    description: "Adjust reader playback speed.",
    id: "playback.speed",
    label: "Speed down or up",
    scope: "reader",
  },
  {
    bindings: [
      { altKey: true, id: "alt-left", key: "ArrowLeft", label: "Alt+Left" },
      { altKey: true, id: "alt-up", key: "ArrowUp", label: "Alt+Up" },
    ],
    category: "Review",
    configurable: false,
    defaultBindingId: "alt-left",
    description: "Move to the previous Review or Preview block.",
    id: "review.previousBlock",
    label: "Previous block",
    scope: "review",
  },
  {
    bindings: [
      { altKey: true, id: "alt-right", key: "ArrowRight", label: "Alt+Right" },
      { altKey: true, id: "alt-down", key: "ArrowDown", label: "Alt+Down" },
    ],
    category: "Review",
    configurable: false,
    defaultBindingId: "alt-right",
    description: "Move to the next Review or Preview block.",
    id: "review.nextBlock",
    label: "Next block",
    scope: "review",
  },
  {
    bindings: [{ altKey: true, id: "alt-j", key: "j", label: "Alt+J" }],
    category: "Playback",
    configurable: false,
    defaultBindingId: "alt-j",
    description: "Jump playback to the selected Review or Preview block timing.",
    id: "review.jumpToAudio",
    label: "Jump to selected audio",
    scope: "review",
  },
  {
    bindings: [
      { id: "a", key: "a", label: "A" },
      { altKey: true, id: "alt-a", key: "a", label: "Alt+A" },
    ],
    category: "Review",
    configurable: true,
    defaultBindingId: "a",
    description: "Approve the current review block.",
    id: "review.approve",
    label: "Approve current block",
    scope: "review",
  },
  {
    bindings: [
      { id: "e", key: "e", label: "E" },
      { altKey: true, id: "alt-e", key: "e", label: "Alt+E" },
    ],
    category: "Review",
    configurable: true,
    defaultBindingId: "e",
    description: "Focus the inline speech editor for the current block.",
    id: "review.edit",
    label: "Edit current block",
    scope: "review",
  },
  {
    bindings: [
      { id: "r", key: "r", label: "R" },
      { altKey: true, id: "alt-r", key: "r", label: "Alt+R" },
    ],
    category: "Review",
    configurable: true,
    defaultBindingId: "r",
    description: "Request a retry for the current review block.",
    id: "review.retry",
    label: "Retry current block",
    scope: "review",
  },
  {
    bindings: [
      { id: "g", key: "g", label: "G" },
      { altKey: true, id: "alt-g", key: "g", label: "Alt+G" },
    ],
    category: "Review",
    configurable: true,
    defaultBindingId: "g",
    description: "Regenerate the current review block.",
    id: "review.regenerate",
    label: "Regenerate current block",
    scope: "review",
  },
  {
    bindings: [
      { id: "i", key: "i", label: "I" },
      { altKey: true, id: "alt-i", key: "i", label: "Alt+I" },
    ],
    category: "Review",
    configurable: true,
    defaultBindingId: "i",
    description: "Open source structure or inspector context for the current review item.",
    id: "review.inspector",
    label: "Open inspector",
    scope: "review",
  },
  {
    bindings: [
      { id: "n", key: "n", label: "N" },
      { altKey: true, id: "alt-n", key: "n", label: "Alt+N" },
    ],
    category: "Review",
    configurable: true,
    defaultBindingId: "n",
    description: "Move to the next Review block that needs attention.",
    id: "review.nextIssue",
    label: "Next review issue",
    scope: "review",
  },
  {
    bindings: [{ altKey: true, id: "alt-left", key: "ArrowLeft", label: "Alt+Left" }],
    category: "Review",
    configurable: false,
    defaultBindingId: "alt-left",
    description: "Move to the previous Review or Preview block.",
    id: "playback.previousBlock",
    label: "Previous block",
    scope: "reader",
  },
  {
    bindings: [{ altKey: true, id: "alt-right", key: "ArrowRight", label: "Alt+Right" }],
    category: "Review",
    configurable: false,
    defaultBindingId: "alt-right",
    description: "Move to the next Review or Preview block.",
    id: "playback.nextBlock",
    label: "Next block",
    scope: "reader",
  },
  {
    bindings: [{ altKey: true, id: "alt-j", key: "j", label: "Alt+J" }],
    category: "Playback",
    configurable: false,
    defaultBindingId: "alt-j",
    description: "Jump playback to the selected Review or Preview block timing.",
    id: "playback.jumpToAudio",
    label: "Jump to selected audio",
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
    bindings: [
      { id: "arrow-left", key: "ArrowLeft", label: "Left" },
      { id: "arrow-up", key: "ArrowUp", label: "Up" },
    ],
    category: "Teleprompt",
    configurable: false,
    defaultBindingId: "arrow-left",
    description: "Move to the previous Teleprompt cue.",
    id: "teleprompt.previousCue",
    label: "Previous cue",
    scope: "teleprompt",
  },
  {
    bindings: [
      { id: "space", key: " ", label: "Space" },
      { id: "k", key: "k", label: "K" },
    ],
    category: "Teleprompt",
    configurable: false,
    defaultBindingId: "space",
    description: "Play or pause Teleprompt playback.",
    id: "teleprompt.playPause",
    label: "Play or pause",
    scope: "teleprompt",
  },
  {
    bindings: [
      { id: "arrow-right", key: "ArrowRight", label: "Right" },
      { id: "arrow-down", key: "ArrowDown", label: "Down" },
    ],
    category: "Teleprompt",
    configurable: false,
    defaultBindingId: "arrow-right",
    description: "Move to the next Teleprompt cue.",
    id: "teleprompt.nextCue",
    label: "Next cue",
    scope: "teleprompt",
  },
  {
    bindings: [{ id: "teleprompt-home", key: "Home", label: "Home" }],
    category: "Teleprompt",
    configurable: false,
    defaultBindingId: "teleprompt-home",
    description: "Restart Teleprompt or Theatre playback.",
    id: "teleprompt.restart",
    label: "Restart Teleprompt playback",
    scope: "teleprompt",
  },
  {
    bindings: [
      { id: "left-bracket", key: "[", label: "[" },
      { id: "right-bracket", key: "]", label: "]" },
    ],
    category: "Teleprompt",
    configurable: false,
    defaultBindingId: "left-bracket",
    description: "Adjust Teleprompt playback speed.",
    id: "teleprompt.speed",
    label: "Teleprompt speed",
    scope: "teleprompt",
  },
  {
    bindings: [
      { altKey: true, id: "alt-j", key: "j", label: "Alt+J" },
      { id: "j", key: "j", label: "J" },
    ],
    category: "Teleprompt",
    configurable: false,
    defaultBindingId: "alt-j",
    description: "Jump Theatre focus to the current audio cue.",
    id: "teleprompt.jumpCurrentAudio",
    label: "Jump to audio cue",
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
    bindings: [
      { id: "v", key: "v", label: "V" },
      { id: "p", key: "p", label: "P" },
    ],
    category: "Teleprompt",
    configurable: false,
    defaultBindingId: "v",
    description: "Return from Teleprompt to Preview.",
    id: "teleprompt.returnPreview",
    label: "Back to Preview",
    scope: "teleprompt",
  },
  {
    bindings: [{ id: "teleprompt-c", key: "c", label: "C" }],
    category: "Teleprompt",
    configurable: false,
    defaultBindingId: "teleprompt-c",
    description: "Create audio and listen from Teleprompt.",
    id: "teleprompt.createListen",
    label: "Create & Listen",
    scope: "teleprompt",
  },
  {
    bindings: [
      { id: "teleprompt-t", key: "t", label: "T" },
      { altKey: true, id: "alt-t", key: "t", label: "Alt+T" },
    ],
    category: "Teleprompt",
    configurable: false,
    defaultBindingId: "teleprompt-t",
    description: "Open Teleprompt Theatre from the current cue.",
    id: "teleprompt.openTheatre",
    label: "Open Theatre",
    scope: "teleprompt",
  },
  {
    bindings: [{ id: "escape", key: "Escape", label: "Esc" }],
    category: "Theatre",
    configurable: false,
    defaultBindingId: "escape",
    description: "Exit Theatre and return to the previous narration view.",
    id: "theatre.exit",
    label: "Exit Theatre",
    scope: "theatre",
  },
  {
    bindings: [
      { id: "space", key: " ", label: "Space" },
      { id: "k", key: "k", label: "K" },
    ],
    category: "Theatre",
    configurable: false,
    defaultBindingId: "space",
    description: "Play or pause Theatre playback.",
    id: "theatre.playPause",
    label: "Play or pause",
    scope: "theatre",
  },
  {
    bindings: [{ id: "home", key: "Home", label: "Home" }],
    category: "Theatre",
    configurable: false,
    defaultBindingId: "home",
    description: "Restart Theatre playback.",
    id: "theatre.restart",
    label: "Restart playback",
    scope: "theatre",
  },
  {
    bindings: [
      { id: "left-bracket", key: "[", label: "[" },
      { id: "right-bracket", key: "]", label: "]" },
    ],
    category: "Theatre",
    configurable: false,
    defaultBindingId: "left-bracket",
    description: "Adjust Theatre playback speed.",
    id: "theatre.speed",
    label: "Theatre speed",
    scope: "theatre",
  },
  {
    bindings: [
      { id: "arrow-left", key: "ArrowLeft", label: "Left" },
      { id: "arrow-up", key: "ArrowUp", label: "Up" },
    ],
    category: "Theatre",
    configurable: false,
    defaultBindingId: "arrow-left",
    description: "Move to the previous Theatre cue.",
    id: "theatre.previousCue",
    label: "Previous cue",
    scope: "theatre",
  },
  {
    bindings: [
      { id: "arrow-right", key: "ArrowRight", label: "Right" },
      { id: "arrow-down", key: "ArrowDown", label: "Down" },
    ],
    category: "Theatre",
    configurable: false,
    defaultBindingId: "arrow-right",
    description: "Move to the next Theatre cue.",
    id: "theatre.nextCue",
    label: "Next cue",
    scope: "theatre",
  },
  {
    bindings: [{ id: "j", key: "j", label: "J" }],
    category: "Theatre",
    configurable: false,
    defaultBindingId: "j",
    description: "Jump Theatre focus to the current audio cue.",
    id: "theatre.jumpCurrentAudio",
    label: "Jump to audio cue",
    scope: "theatre",
  },
  {
    bindings: [{ id: "t", key: "t", label: "T" }],
    category: "Theatre",
    configurable: false,
    defaultBindingId: "t",
    description: "Show or hide Theatre controls.",
    id: "theatre.toggleControls",
    label: "Toggle controls",
    scope: "theatre",
  },
  {
    bindings: [
      { id: "question", key: "?", label: "?", shiftKey: true },
      { id: "f1", key: "F1", label: "F1" },
    ],
    category: "Theatre",
    configurable: false,
    defaultBindingId: "question",
    description: "Show the Theatre shortcut help overlay.",
    id: "theatre.shortcutHelp",
    label: "Theatre shortcut help",
    scope: "theatre",
  },
  {
    bindings: [{ id: "f", key: "f", label: "F" }],
    category: "Theatre",
    configurable: false,
    defaultBindingId: "f",
    description: "Request native fullscreen for Theatre.",
    id: "theatre.fullscreen",
    label: "Native fullscreen",
    scope: "theatre",
  },
  {
    bindings: [{ id: "o", key: "o", label: "O" }],
    category: "Theatre",
    configurable: false,
    defaultBindingId: "o",
    description: "Show or hide the Theatre operator panel.",
    id: "theatre.operator",
    label: "Operator panel",
    scope: "theatre",
  },
  {
    bindings: [{ id: "m", key: "m", label: "M" }],
    category: "Theatre",
    configurable: false,
    defaultBindingId: "m",
    description: "Toggle mirrored Theatre text.",
    id: "theatre.mirror",
    label: "Mirror text",
    scope: "theatre",
  },
  {
    bindings: [{ id: "h", key: "h", label: "H" }],
    category: "Theatre",
    configurable: false,
    defaultBindingId: "h",
    description: "Toggle high contrast Theatre text.",
    id: "theatre.highContrast",
    label: "High contrast",
    scope: "theatre",
  },
  {
    bindings: [{ id: "l", key: "l", label: "L" }],
    category: "Theatre",
    configurable: false,
    defaultBindingId: "l",
    description: "Apply the large text Theatre preset.",
    id: "theatre.largeText",
    label: "Large text",
    scope: "theatre",
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

export function shortcutBindingsForCommand(
  commandId: string,
  preferences: ShortcutPreferences,
): ShortcutBinding[] {
  const command = shortcutCommandById(commandId);
  if (!command) {
    return [];
  }
  if (!command.configurable) {
    return [...command.bindings];
  }
  const binding = shortcutBindingForCommand(commandId, preferences);
  return binding ? [binding] : [];
}

export function shortcutLabelForCommand(
  commandId: string,
  preferences: ShortcutPreferences,
): string | undefined {
  const bindings = shortcutBindingsForCommand(commandId, preferences);
  if (bindings.length === 0) {
    return undefined;
  }
  return bindings.map((binding) => binding.label).join(" / ");
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
  event: ShortcutEventLike,
  preferences: ShortcutPreferences,
): ShortcutCommandId | null {
  return resolveShortcutCommand(event, preferences, "global");
}

export function resolveShortcutCommand(
  event: ShortcutEventLike,
  preferences: ShortcutPreferences,
  scope: ShortcutCommand["scope"],
): ShortcutCommandId | null {
  return resolveShortcutCommandBinding(event, preferences, scope)?.commandId ?? null;
}

export function resolveShortcutCommandBinding(
  event: ShortcutEventLike,
  preferences: ShortcutPreferences,
  scope: ShortcutCommand["scope"],
): ResolvedShortcutCommand | null {
  for (const command of SHORTCUT_COMMANDS) {
    if (command.scope !== scope) {
      continue;
    }
    const binding = shortcutBindingsForCommand(command.id, preferences).find((candidate) =>
      eventMatchesShortcutBinding(event, candidate),
    );
    if (binding) {
      return { bindingId: binding.id, commandId: command.id };
    }
  }
  return null;
}

export function eventMatchesShortcutBinding(
  event: ShortcutEventLike,
  binding: ShortcutBinding,
): boolean {
  if (!shortcutKeysMatch(event, binding)) {
    return false;
  }
  const eventCtrlKey = event.ctrlKey === true;
  const eventMetaKey = event.metaKey === true;
  const eventAltKey = event.altKey === true;
  const eventShiftKey = event.shiftKey === true;
  const ctrlOrMeta = eventCtrlKey || eventMetaKey;
  if (binding.primaryModifier && !ctrlOrMeta) {
    return false;
  }
  if (!binding.primaryModifier && eventCtrlKey !== (binding.ctrlKey === true)) {
    return false;
  }
  if (!binding.primaryModifier && eventMetaKey !== (binding.metaKey === true)) {
    return false;
  }
  return eventAltKey === (binding.altKey === true) && eventShiftKey === (binding.shiftKey === true);
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

export function shouldIgnoreNarrationShortcutTarget(target: EventTarget | null): boolean {
  if (shouldIgnoreGlobalShortcutTarget(target)) {
    return true;
  }
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(
    target.closest("[data-reader-ignore-shortcuts], [data-book-cinema-ignore-shortcuts]"),
  );
}

export function shouldIgnoreNarrationShortcutEvent(
  event: ShortcutEventLike & { readonly target?: EventTarget | null },
): boolean {
  if (shouldIgnoreNarrationShortcutTarget(event.target ?? null)) {
    return true;
  }
  return shouldPreserveNativeShortcutBehavior(event);
}

export function shortcutAvailability(
  available: boolean,
  reason?: string,
  blocked = false,
): ShortcutAvailability {
  if (available) {
    return { state: "available" };
  }
  return { reason, state: blocked ? "blocked" : "disabled" };
}

export function shortcutAvailabilityReason(
  availability: ShortcutAvailability | undefined,
): string | undefined {
  return availability?.state === "available" ? undefined : availability?.reason;
}

export function shortcutAvailabilityDisabled(
  availability: ShortcutAvailability | undefined,
): boolean {
  return availability?.state === "blocked" || availability?.state === "disabled";
}

export function shortcutAriaKeyShortcutsForCommand(
  commandId: string,
  preferences: ShortcutPreferences,
): string | undefined {
  const tokens = shortcutBindingsForCommand(commandId, preferences).map((binding) =>
    shortcutBindingAriaToken(binding),
  );
  return tokens.length > 0 ? tokens.join(" ") : undefined;
}

export function shortcutTooltip(
  label: string,
  commandId: string | undefined,
  preferences: ShortcutPreferences,
  disabledReason?: string,
): string {
  if (disabledReason) {
    return disabledReason;
  }
  const shortcut = commandId ? shortcutLabelForCommand(commandId, preferences) : undefined;
  return shortcut ? `${label} (${shortcut})` : label;
}

export interface ShortcutConflict {
  readonly commandIds: readonly string[];
  readonly label: string;
  readonly scope: ShortcutCommand["scope"];
}

export function shortcutPreferenceConflicts(preferences: ShortcutPreferences): ShortcutConflict[] {
  const collisions = new Map<
    string,
    { label: string; commandIds: string[]; scope: ShortcutCommand["scope"] }
  >();
  for (const command of SHORTCUT_COMMANDS) {
    for (const binding of shortcutBindingsForCommand(command.id, preferences)) {
      const key = `${command.scope}:${shortcutBindingSignature(binding)}`;
      const existing = collisions.get(key);
      if (existing) {
        existing.commandIds.push(command.id);
      } else {
        collisions.set(key, {
          commandIds: [command.id],
          label: binding.label,
          scope: command.scope,
        });
      }
    }
  }
  return [...collisions.values()].filter((item) => item.commandIds.length > 1);
}

export function shortcutCommandsByCategory(preferences: ShortcutPreferences): {
  category: ShortcutCategory;
  commands: { binding: ShortcutBinding | null; command: ShortcutCommand; shortcutLabel: string }[];
}[] {
  const categories: ShortcutCategory[] = [
    "Global",
    "Playback",
    "Review",
    "Teleprompt",
    "Theatre",
    "Status",
    "Navigation",
    "Settings",
    "Diagnostics",
  ];
  return categories
    .map((category) => ({
      category,
      commands: SHORTCUT_COMMANDS.filter((command) => command.category === category).map(
        (command) => ({
          binding: shortcutBindingForCommand(command.id, preferences),
          shortcutLabel: shortcutLabelForCommand(command.id, preferences) ?? "Unset",
          command,
        }),
      ),
    }))
    .filter((group) => group.commands.length > 0);
}

function normalizeShortcutKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

function shortcutKeysMatch(event: ShortcutEventLike, binding: ShortcutBinding): boolean {
  const eventKey = normalizeShortcutKey(event.key);
  const bindingKey = normalizeShortcutKey(binding.key);
  if (eventKey === bindingKey) {
    return true;
  }
  return binding.key === "?" && Boolean(event.shiftKey) && eventKey === "/";
}

function shortcutBindingAriaToken(binding: ShortcutBinding): string {
  if (binding.primaryModifier) {
    const key = shortcutAriaKeyName(binding.key);
    return `Control+${key} Meta+${key}`;
  }
  const parts: string[] = [];
  if (binding.ctrlKey) {
    parts.push("Control");
  }
  if (binding.metaKey) {
    parts.push("Meta");
  }
  if (binding.altKey) {
    parts.push("Alt");
  }
  if (binding.shiftKey) {
    parts.push("Shift");
  }
  parts.push(shortcutAriaKeyName(binding.key));
  return parts.join("+");
}

function shortcutAriaKeyName(key: string): string {
  if (key === " ") {
    return "Space";
  }
  if (key === "Escape") {
    return "Escape";
  }
  return key;
}

function shortcutBindingSignature(binding: ShortcutBinding): string {
  return [
    binding.primaryModifier ? "primary" : "",
    binding.ctrlKey ? "ctrl" : "",
    binding.metaKey ? "meta" : "",
    binding.altKey ? "alt" : "",
    binding.shiftKey ? "shift" : "",
    normalizeShortcutKey(binding.key),
  ].join(":");
}

function shouldPreserveNativeShortcutBehavior(
  event: ShortcutEventLike & { readonly target?: EventTarget | null },
): boolean {
  if (!nativeNavigationKey(event.key)) {
    return false;
  }
  if (typeof HTMLElement === "undefined" || !(event.target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(event.target.closest(NATIVE_SHORTCUT_TARGET_SELECTOR));
}

function nativeNavigationKey(key: string): boolean {
  return (
    key === " " ||
    key === "Enter" ||
    key === "ArrowDown" ||
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "ArrowUp"
  );
}

const NATIVE_SHORTCUT_TARGET_SELECTOR = [
  "a[href]",
  "button",
  "[role='button']",
  "[role='checkbox']",
  "[role='combobox']",
  "[role='link']",
  "[role='listbox']",
  "[role='menuitem']",
  "[role='menuitemcheckbox']",
  "[role='menuitemradio']",
  "[role='option']",
  "[role='radio']",
  "[role='slider']",
  "[role='spinbutton']",
  "[role='switch']",
  "[role='tab']",
  "[data-preserve-native-shortcuts]",
].join(",");
