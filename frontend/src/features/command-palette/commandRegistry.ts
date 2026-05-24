import {
  resolveGlobalShortcutCommand,
  shortcutLabelForCommand,
  shouldIgnoreGlobalShortcutTarget,
  type ShortcutCommandId,
  type ShortcutPreferences,
} from "../shortcuts/shortcutRegistry";

export const COMMAND_CATEGORIES = [
  "Navigation",
  "Project",
  "Source",
  "Voice",
  "Playback",
  "Review",
  "Teleprompt",
  "Settings",
  "Diagnostics",
] as const;

export type CommandCategory = (typeof COMMAND_CATEGORIES)[number];

export type LegacyCommandSection =
  | "Workspace"
  | "Cinema"
  | "Settings"
  | "Help"
  | "Projects"
  | "Sources"
  | "Wayfinding"
  | "Playback";

export type CommandSection = CommandCategory | LegacyCommandSection;

export interface CommandActionContext {
  close: () => void;
  source: "palette" | "shortcut" | "surface";
}

export interface CommandEntry {
  capabilityGate?: string;
  capabilityGated?: boolean;
  category?: CommandCategory;
  detail?: string;
  disabled?: boolean;
  disabledReason?: string;
  id: string;
  keywords?: string[];
  perform: (context: CommandActionContext) => void | Promise<void>;
  section: CommandSection;
  shortcut?: string;
  shortcutCommandId?: ShortcutCommandId;
  title: string;
}

export interface CommandMetadata<TTarget = unknown> {
  category?: CommandCategory;
  detail?: string;
  id: string;
  keywords?: string[];
  section: CommandSection;
  target: TTarget;
  title: string;
}

interface RankedCommand {
  entry: CommandEntry;
  index: number;
  score: number;
}

export function searchCommandEntries(
  entries: readonly CommandEntry[],
  query: string,
  limit = 12,
): CommandEntry[] {
  const normalizedQuery = normalizeCommandText(query);
  if (!normalizedQuery) {
    return entries.slice(0, limit);
  }
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  const ranked = entries
    .map((entry, index) => ({
      entry,
      index,
      score: scoreCommandEntry(entry, tokens, normalizedQuery),
    }))
    .filter((item) => item.score > 0);
  return insertSortedCommands(ranked)
    .slice(0, limit)
    .map((item) => item.entry);
}

export function commandEntriesByCategory(
  entries: readonly CommandEntry[],
): { category: CommandCategory; entries: CommandEntry[] }[] {
  return COMMAND_CATEGORIES.map((category) => ({
    category,
    entries: entries.filter((entry) => commandCategoryForEntry(entry) === category),
  })).filter((group) => group.entries.length > 0);
}

export function commandCategoryForEntry(
  entry: Pick<CommandEntry, "category" | "section">,
): CommandCategory {
  if (entry.category) {
    return entry.category;
  }
  if (isCommandCategory(entry.section)) {
    return entry.section;
  }
  switch (entry.section) {
    case "Projects": {
      return "Project";
    }
    case "Sources": {
      return "Source";
    }
    case "Help": {
      return "Diagnostics";
    }
    case "Cinema": {
      return "Diagnostics";
    }
    default: {
      return "Navigation";
    }
  }
}

export function commandShortcutLabel(
  entry: Pick<CommandEntry, "shortcut" | "shortcutCommandId">,
  preferences: ShortcutPreferences,
): string | undefined {
  if (entry.shortcut) {
    return entry.shortcut;
  }
  if (!entry.shortcutCommandId) {
    return undefined;
  }
  return shortcutLabelForCommand(entry.shortcutCommandId, preferences);
}

export function scoreCommandEntry(
  entry: Pick<CommandEntry, "category" | "detail" | "keywords" | "section" | "title">,
  tokensOrQuery: readonly string[] | string,
  normalizedQuery = typeof tokensOrQuery === "string" ? tokensOrQuery : tokensOrQuery.join(" "),
): number {
  const tokens =
    typeof tokensOrQuery === "string"
      ? normalizeCommandText(tokensOrQuery).split(" ").filter(Boolean)
      : tokensOrQuery;
  if (tokens.length === 0) {
    return 1;
  }
  const title = normalizeCommandText(entry.title);
  const detail = normalizeCommandText(entry.detail ?? "");
  const section = normalizeCommandText(entry.section);
  const category = normalizeCommandText(commandCategoryForEntry(entry));
  const keywordText = normalizeCommandText(entry.keywords?.join(" ") ?? "");
  const haystack = `${title} ${detail} ${section} ${category} ${keywordText}`.trim();
  if (!tokens.every((token) => haystack.includes(token))) {
    return 0;
  }

  let score = 10;
  if (title === normalizedQuery) {
    score += 200;
  }
  if (title.startsWith(normalizedQuery)) {
    score += 100;
  }
  for (const token of tokens) {
    if (title.startsWith(token)) {
      score += 40;
    } else if (title.includes(token)) {
      score += 24;
    } else if (keywordText.includes(token)) {
      score += 14;
    } else if (detail.includes(token)) {
      score += 8;
    } else if (category.includes(token)) {
      score += 6;
    } else if (section.includes(token)) {
      score += 5;
    }
  }
  return score;
}

export function isCommandPaletteShortcut(
  event: KeyboardEvent,
  preferences: ShortcutPreferences,
): boolean {
  return resolveGlobalShortcutCommand(event, preferences) === "command.palette";
}

export function shouldIgnoreCommandShortcutTarget(target: EventTarget | null): boolean {
  return shouldIgnoreGlobalShortcutTarget(target);
}

export function normalizeCommandText(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim();
}

function isCommandCategory(value: CommandSection): value is CommandCategory {
  return COMMAND_CATEGORIES.includes(value as CommandCategory);
}

function compareRankedCommands(left: RankedCommand, right: RankedCommand): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  if (left.entry.disabled !== right.entry.disabled) {
    return left.entry.disabled ? 1 : -1;
  }
  return left.index - right.index;
}

function insertSortedCommands(items: RankedCommand[]): RankedCommand[] {
  const sorted: RankedCommand[] = [];
  for (const item of items) {
    const insertAt = sorted.findIndex((existing) => compareRankedCommands(item, existing) < 0);
    if (insertAt === -1) {
      sorted.push(item);
    } else {
      sorted.splice(insertAt, 0, item);
    }
  }
  return sorted;
}
