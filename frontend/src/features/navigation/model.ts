export type {
  CommandActionContext,
  CommandCategory,
  CommandEntry,
  CommandMetadata,
  CommandSection,
  LegacyCommandSection,
} from "../command-palette/commandRegistry";
export {
  COMMAND_CATEGORIES,
  commandCategoryForEntry,
  commandEntriesByCategory,
  commandShortcutLabel,
  isCommandPaletteShortcut,
  normalizeCommandText,
  scoreCommandEntry,
  searchCommandEntries,
  shouldIgnoreCommandShortcutTarget,
} from "../command-palette/commandRegistry";
