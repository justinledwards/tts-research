export {
  TelepromptStudio,
  type TelepromptPlaybackController,
  type TelepromptStudioProps,
} from "./TelepromptStudio";
export {
  TELEPROMPT_PRESET_IDS,
  TELEPROMPT_PRESETS,
  normalizeTelepromptPresetId,
  telepromptPreset,
  telepromptPresetHighlightSettings,
  type TelepromptPreset,
  type TelepromptPresetId,
} from "./telepromptPresets";
export {
  normalizeTelepromptReturnTarget,
  readTelepromptReturnSnapshot,
  rememberTelepromptReturnSnapshot,
  telepromptSourceKey,
  workspaceStageToTelepromptReturnTarget,
  type TelepromptReturnSnapshot,
  type TelepromptReturnTarget,
} from "./telepromptReturnMemory";
export {
  TELEPROMPT_SHORTCUTS,
  adjacentTelepromptBlockId,
  countTelepromptWords,
  estimateTelepromptDurationMs,
  formatTelepromptDuration,
  resolveTelepromptBlockIndex,
  resolveTelepromptShortcut,
  shouldIgnoreTelepromptShortcutTarget,
  totalTelepromptWords,
  type TelepromptShortcutAction,
  type TelepromptShortcutDefinition,
  type TelepromptKeyboardEventLike,
} from "./telepromptToolbar";
