# Reader-First source-scope ownership audit v5

Status: owner read-only audit; no Peer, Linear, or product authorization.

## RFA-11 — browser-authority retirement

- `frontend/src/projectState.ts`
  - `ProjectWorkspaceState`
  - `PROJECT_WORKSPACE_STATE_PREFIX`
  - `loadProjectWorkspaceState()`
  - `saveProjectWorkspaceState()`
  - `clearProjectWorkspaceState()`
  - `migrateLegacyWorkspaceState()`
  - `clearLegacyWorkspaceState()`
- `frontend/src/App.tsx`, `App()`
  - `activeProjectId` localStorage initialization
  - `restoreProjectWorkspace()`
  - `selectProject()`
  - project-change migration/restoration effect
  - continuous workspace persistence effect

## RFA-13 — bounded append playback

- `frontend/src/App.tsx`
  - `useCompletedWaveformBars()` full-source fetch and `decodeAudioData()` path
  - `ArrivalAudioPlayerQueue()` segment-loading effect
  - `ArrivalAudioPlayerQueue()` `loadRequests` / `Promise.all` fan-out
  - `missingSegmentIndexes` bounded scheduler replacement

The v4 packet incorrectly named this legacy owner as `VoiceJobPlayer segment-load effect`; v5 replaces that stale symbol with the repository-real `ArrivalAudioPlayerQueue()` owner.

## RFA-16 — global Preview ownership

- `frontend/src/App.tsx`, `App()`
  - `playbackCursorSec`
  - `isPlaybackActive`
  - `playbackControls`
  - `handlePlaybackControlsChange()`
  - `globalPreviewOwner`
  - `globalPreviewVisible`
  - `LazyGlobalPreviewPlayer` mount
  - `PlaybackControllerHost()`
  - `StreamingAudioPanel()` ownership bridge

## RFA-17 — frontend global-critical inference

- `frontend/src/features/status-strip/model.ts`
  - `resolveNarrationStatusModel()`
  - `resolveNarrationOperationalIssues()`
  - `resolveOperationalSystemIssue()`
  - `highestPriorityPanel.status === "blocking"` critical inference
- `frontend/src/App.tsx`
  - `narrationStatusModel` / disclosure input call site

## Gate

Issue IDs and dependency edges remain unchanged. Peer approval, Linear creation, and product implementation remain false and fail closed.
