export type CommandSection =
  | "Workspace"
  | "Cinema"
  | "Settings"
  | "Help"
  | "Projects"
  | "Sources"
  | "Wayfinding"
  | "Playback";

export interface CommandActionContext {
  close: () => void;
  source: "palette" | "shortcut" | "surface";
}

export interface CommandEntry {
  detail?: string;
  disabled?: boolean;
  disabledReason?: string;
  id: string;
  keywords?: string[];
  perform: (context: CommandActionContext) => void | Promise<void>;
  section: CommandSection;
  shortcut?: string;
  title: string;
}

export interface CommandMetadata<TTarget = unknown> {
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

export function scoreCommandEntry(
  entry: Pick<CommandEntry, "detail" | "keywords" | "section" | "title">,
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
  const keywordText = normalizeCommandText(entry.keywords?.join(" ") ?? "");
  const haystack = `${title} ${detail} ${section} ${keywordText}`.trim();
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
    } else if (section.includes(token)) {
      score += 5;
    }
  }
  return score;
}

export function isCommandPaletteShortcut(event: KeyboardEvent): boolean {
  return event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.shiftKey;
}

export function shouldIgnoreCommandShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
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

export function normalizeCommandText(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim();
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
