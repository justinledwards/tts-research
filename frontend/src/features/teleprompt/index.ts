export {
  TelepromptStudio,
  type TelepromptPlaybackController,
  type TelepromptStudioProps,
} from "./TelepromptStudio";
export { TelepromptTheatre, type TelepromptTheatreProps } from "./TelepromptTheatre";
export {
  exitTelepromptFullscreen,
  isTelepromptFullscreenActive,
  requestTelepromptFullscreen,
  subscribeTelepromptFullscreenChange,
  telepromptFullscreenAvailability,
  type TelepromptFullscreenAvailability,
} from "./telepromptFullscreen";
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
  TELEPROMPT_RETURN_MEMORY_KEY,
  clearTelepromptReturnMemory,
  normalizeTelepromptReturnTarget,
  readTelepromptReturnSnapshot,
  rememberTelepromptReturnSnapshot,
  telepromptSourceKey,
  workspaceStageToTelepromptReturnTarget,
  type TelepromptReturnSnapshot,
  type TelepromptReturnTarget,
} from "./telepromptReturnMemory";
export {
  resolveTelepromptTheatreShortcut,
  type TelepromptTheatreShortcutAction,
} from "./telepromptTheatreShortcuts";
export {
  buildTelepromptTheatreSummary,
  type TelepromptTheatreMode,
  type TelepromptTheatreSummary,
  type TelepromptTheatreViewMode,
} from "./telepromptTheatreState";
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
