# Server state, restoration, and completion-health audit

Read-only audit captured 2026-07-10.

## Outcome

Read-only RCA completed. The failure is architectural, not missing project data: the server persists the project, source, completed job, and playable audio, but the browser must reconstruct the active workspace from browser-local state. In a fresh/incognito browser that state is absent, so opening the project remains **Draft**. The later **Audio needs rebuild** and **System critical** labels are client-derived escalations and do not prove that the completed artifact is missing or that the backend is unhealthy.

## Repository attestation

- Repository: `/home/phoenix/projects/repos/tts-research`
- Remote: `origin git@github.com:kanalasolution/tts-research.git`
- Branch: `niklas/voice-studio-follow-up`
- HEAD: `e97ff6f4932f4429939f1c278e1d4b8361ac6688`
- Worktree was already heavily dirty, including modified, deleted, and untracked architecture/docs/scripts.
- I did not create, modify, or delete repository files.

## Reproduction evidence

For project `caa8154de9707018`:

- Persisted project exists as `backend/data/projects/caa8154de9707018/project.json`.
- Project record contains identity and metadata but no authoritative active source, scope, job, stage, or restoration revision.
- Source `0df436ee32183f4f` exists, belongs to the project, is `ready`, and has:
  - 115,387 words
  - 366 pages
  - 24 chapters
  - full extracted text in the detail representation
- Job `2f752faaa77ec7b1` is returned by the live project-jobs API and is:
  - `status: completed`
  - source `0df436ee32183f4f`
  - scope `{type: "book", label: "Full book"}`
  - mode `checkedMaster`
  - voice `af_heart`
  - 1,680 of 1,680 segments ready
  - manifest `ready`, `completeEnough: true`, artifact state `checked`
  - voice check complete, with no resume required
- Both full and partial audio endpoints returned HTTP 200 with an approximately 1.325 GB WAV.
- The live API process uses `VOICE_JOB_DATA_DIR=/dev/shm/tts-research/jobs`; this job’s audio, segment WAVs, metadata, timing, speech plan, and highlight maps are in tmpfs.

A fresh browser opening the project reproduced:

- Active project changes to **Design for the Real World**.
- Workspace remains **Draft text**.
- Server reports two project sources and one ready generated-audio job, but none becomes the active narration workspace.
- Asset view enables **Use in narration** for the ready source.
- Clicking it produces the exact error: **“Book source is not ready yet.”**

## Root causes

### 1. Project restoration is browser-authoritative

`frontend/src/projectState.ts` persists `ProjectWorkspaceState` under `tts-project-state-v1` in `localStorage`. It contains product-critical state including:

- active source kind and IDs
- selected book scope
- active job ID
- workspace stage
- reader and playback position
- selected voice/policy context

`restoreProjectWorkspace` only restores what exists in that browser-local map. In `frontend/src/App.tsx`, opening a project changes `activeProjectId` and then attempts that local restoration. A new/incognito browser has no entry, so the default source remains Draft.

The backend project model and project routes in:

- `backend/internal/pipeline/projects.go`
- `backend/internal/httpapi/project_routes.go`

do not expose or persist a workspace/session restoration record.

This exact risk is already documented in `docs/reviews/chatgpt/004-resume-retry-state-model.response.md`: browser-local memory carries too much product-critical resume meaning.

### 2. Server job metadata cannot bootstrap selection

`frontend/src/features/playback/workbenchAudioRestore.ts` can select a restorable job only after the client already supplies the selected source and compatible scope. It does not infer the active source/scope from the server’s latest completed job.

The reproduction job already identifies:

- project
- source
- full-book scope
- run configuration
- playable artifact

but the client does not use those fields to establish the workspace. This creates a dependency loop:

1. restoring the job requires a selected source;
2. selecting the source requires browser state or a user action;
3. the server job that could supply the selection is therefore ignored.

Existing tests cover selector behavior when source/scope inputs already exist, but not an empty-browser project bootstrap.

### 3. Summary/detail representations violate the action contract

Project-scoped book listing returns summaries. `summarizeBookSource` in `backend/internal/pipeline/book_source_helpers.go` deliberately strips large content such as page text.

The source lifecycle/asset models trust explicit server readiness, so the summary is shown as narratable and **Use in narration** is enabled:

- `frontend/src/features/source-lifecycle/sourceSelectors.ts`
- `frontend/src/features/source-lifecycle/sourceEnvelope.ts`
- `frontend/src/features/assets/assetModels.ts`

But `handleUseBookText` in `frontend/src/App.tsx:7432+` immediately tries to extract narration text from that summary. Since text/page bodies were omitted, it rejects the source as not ready.

Thus the same object is:

- “ready” according to the list/card contract;
- “not ready” according to the action handler.

The frontend has no detail-hydration step before executing the action, despite the full source-detail API containing the required content.

### 4. “Audio needs rebuild” is client currentness, not server artifact state

Currentness is resolved in the browser:

- `frontend/src/features/preview/previewAudioCurrentness.ts`
- `frontend/src/features/playback/generatedAudioLifecycle.ts`
- `frontend/src/App.tsx:4023+`

The current browser-generated request is compared against the restored job’s text, source selection, scope, voice, policy, engine, and configuration. Missing or default browser state can therefore produce mismatch reasons and convert a physically present, checked, completed artifact into lifecycle `stale`.

The server currently does not return an authoritative statement such as:

- artifact compatibility key
- source revision used
- request fingerprint
- current/superseded determination
- explicit stale reason

For the reproduction, the server evidence says the audio is complete and playable. A client-side mismatch can still label it rebuild-required.

### 5. A playback blocker is mislabeled as system critical

`frontend/src/features/workspace/disclosure.ts:405-419` marks any non-ready audio as `blocking` when the current stage requires playback:

```text
blocking = requiresPlayback && lifecycle !== "ready"
```

`frontend/src/features/status-strip/model.ts:325-329` then defines system criticality as:

```text
critical = disclosure.highestPriorityPanel?.status === "blocking"
```

A stale-audio/currentness mismatch can therefore flow as:

1. completed job → client currentness mismatch;
2. lifecycle becomes `stale`;
3. playback stage requires audio;
4. audio disclosure becomes `blocking`;
5. highest-priority disclosure is blocking;
6. system status becomes critical.

This conflates three different facts:

- current selection does not match an artifact;
- the current UI stage cannot play that artifact as current;
- the backend/system is critically unhealthy.

Existing tests explicitly encode this behavior:

- `features/operational-status/operationalStatus.test.ts` expects stale audio to say **Audio needs rebuild**.
- `features/status-strip/model.test.ts` expects stale audio to block the model.
- `features/workspace/disclosure.test.ts` expects required missing audio to become the highest blocking disclosure.

### 6. Persistence durability is split

Project and source metadata are durable under `backend/data`, while this deployment stores job artifacts under `/dev/shm`.

That means “server-side” is not automatically “durable”:

- cross-browser access works while the server and tmpfs contents survive;
- a machine reboot can remove job metadata and 1.3 GB of audio while leaving the project and source;
- after such loss the server must report an explicit artifact-loss/degraded state, not infer currentness from a URL or leave a completed project misleadingly ready.

## Minimal server-authoritative target contract

Introduce a project-scoped restoration resource, for example:

```http
GET /api/projects/{projectId}/workspace
```

Minimal response:

```json
{
  "schemaVersion": 1,
  "revision": "opaque-etag-or-sequence",
  "project": {
    "id": "...",
    "name": "..."
  },
  "selection": {
    "sourceKind": "book",
    "sourceId": "0df436ee32183f4f",
    "scope": {
      "type": "book",
      "label": "Full book"
    },
    "stage": "preview"
  },
  "source": {
    "id": "...",
    "revision": "...",
    "readiness": "narratable",
    "capabilities": {
      "canReview": true,
      "canNarrate": true
    },
    "detailHref": "/api/book-sources/..."
  },
  "generatedAudio": {
    "jobId": "2f752faaa77ec7b1",
    "artifactId": "...",
    "lifecycle": "ready",
    "currentness": "current",
    "currentnessReason": null,
    "requestFingerprint": "...",
    "sourceRevision": "...",
    "playable": true,
    "checked": true,
    "audioHref": "/api/voice-jobs/.../audio"
  },
  "operationalHealth": {
    "state": "healthy",
    "issues": []
  },
  "resume": {
    "source": "persisted-workspace",
    "confidence": "exact"
  }
}
```

Key rules:

1. The server owns source/scope/job identity and artifact compatibility.
2. Summary objects expose capabilities, not fake content completeness.
3. Actions requiring content hydrate detail through `detailHref`.
4. Generated-audio existence, playability, currentness, and checked quality are separate fields.
5. Operational health is independent of stage readiness or a user-facing blocker.
6. Browser storage may retain layout, open panels, theme, and other presentation preferences, but may not override server project truth.
7. Mutations use revision/ETag preconditions to avoid last-write-wins corruption across browsers.
8. Artifact existence is checked against durable storage. Lost artifacts become an explicit `artifact_missing` condition.

## Migration slices and dependencies

1. **Read-only restoration projection**
   - Add the workspace endpoint.
   - Infer selection from an explicit saved workspace if present, otherwise latest compatible project job/source.
   - Return source capability and generated-audio evidence.
   - Dependency: shared backend compatibility/currentness function.

2. **Frontend open-project bootstrap**
   - Fetch the snapshot before rendering a settled workspace.
   - Set source, scope, job, run configuration, and stage atomically.
   - Do not briefly commit Draft as authoritative.
   - Retain local state only as a compatibility fallback.

3. **Detail hydration**
   - Make **Use in narration** fetch source detail/scope content by ID.
   - Never infer “not ready” from an intentionally summary-only payload.
   - Add `representation: summary|detail` or capability metadata if useful.

4. **Persist workspace mutations**
   - Add revisioned `PUT/PATCH /api/projects/{id}/workspace`.
   - Persist source/scope/stage/current job after committed user transitions.
   - Apply optimistic concurrency.

5. **Server currentness**
   - Persist source revision and canonical request fingerprint on every job/artifact.
   - Have the backend return `current`, `superseded`, `incompatible`, or `artifact_missing` with reason codes.
   - Remove frontend timestamp/text heuristics as authority.

6. **Status-domain separation**
   - Audio mismatch remains an audio/workspace issue.
   - `System critical` is reserved for backend unavailability, corrupt state, storage failure, or unrecoverable invariant violation.
   - Stage blockers may be blocking without becoming system-critical.

7. **Durability**
   - Move committed job metadata/audio from `/dev/shm` to durable storage, or implement an atomic promotion from scratch/tmpfs to durable artifact storage before marking a job completed.

## Required tests and acceptance criteria

- Fresh/incognito browser opens the reproduction project directly into the saved book/full-book workspace.
- Source `0df436ee32183f4f` and job `2f752faaa77ec7b1` are selected without pre-existing local storage.
- Completed checked audio is playable without regeneration.
- Clearing all browser storage does not change server restoration.
- Two browsers receive the same authoritative project selection and artifact status.
- Summary-only source card can execute **Use in narration** after detail hydration.
- Missing detail content is not reported as extraction/readiness failure.
- A completed artifact with matching source revision/fingerprint remains `ready/current` across reloads.
- A real source/config change produces `stale/incompatible` with a stable server reason code.
- Stale audio can block Theatre playback without setting system health to critical.
- Actual missing artifact bytes produce `artifact_missing`, not generic text mismatch.
- Backend restart restores committed workspace and job metadata.
- Host reboot either preserves committed audio or reports explicit artifact loss.
- Concurrency test rejects stale workspace updates by revision/ETag.
- Compatibility test migrates existing `tts-project-state-v1` once, then treats server state as authoritative.

## Recommended first implementation issue

**“Restore completed project workspaces from a server-authored snapshot.”**

Scope it narrowly to:

- add `GET /api/projects/{id}/workspace`;
- project selection/source/scope/job projection;
- latest compatible completed-job fallback for legacy projects;
- source detail reference/capabilities;
- server-confirmed artifact playability;
- frontend project-open bootstrap from that response;
- regression test using the reproduction shape with empty `localStorage`.

Defer workspace writes, cross-browser conflict handling, and full status redesign to follow-up issues. This first slice fixes the highest-value failure—opening an existing completed project from any browser—while establishing the contract needed for the later currentness and health cleanup.

## Files and execution

- Files created or modified: **none**.
- Tests were not executed because the task was strictly read-only and test/build tools could create caches or generated files.
- Evidence came from exact source reads, existing tests/docs, live read-only API requests, artifact endpoint checks, process configuration, and browser reproduction.
