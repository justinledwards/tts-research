# Temporary Source Domain Model

Temporary Source Sessions support quick narration without creating durable project assets. They are siblings of project-owned `BookSource` and `PreparedSource` records, not hidden projects or draft projects.

## Product Decision

Users have two distinct intents:

- Build a durable narrated project.
- Make a source audible right now.

Project-owned sources remain durable and appear in project history. Temporary sources remain disposable, scoped to their own session, and appear in project history only after explicit promotion.

## Schema

All source envelopes carry ownership:

```ts
type SourceOwner = "project" | "temporary";
```

Project source envelope:

```ts
type ProjectSourceEnvelope = {
  sourceOwner: "project";
  projectId: string;
  source: BookSource | PreparedSource;
};
```

Temporary source envelope:

```ts
type TemporarySourceEnvelope = {
  sourceOwner: "temporary";
  temporarySourceId: string;
  source: TemporarySourceSession;
};
```

Temporary source session:

```ts
type TemporarySourceSession = {
  id: string;
  temporarySourceId: string;
  sourceOwner: "temporary";
  projectId?: string;
  status: TemporarySourceLifecycleState;
  promotionStatus: "notPromoted" | "promoted" | "promotionFailed";
  promotedProjectId?: string;
  promotedSourceId?: string;
  kind: PreparedSourceKind | BookSourceKind;
  sourceReadiness?: SourceReadiness;
  sourceName: string;
  sourceUrl?: string;
  sourceContentType?: string;
  sourceBytes?: number;
  title?: string;
  text?: string;
  speechText?: string;
  wordCount: number;
  blockCount?: number;
  segmentCount?: number;
  summary?: PreparedSourceSummary;
  blocks?: NarrationBlock[];
  skippedItems?: SkippedSourceItem[];
  reviewNotes?: string[];
  artifacts: SourceArtifactRef[];
  bookmarks?: ProgressBookmark[];
  playbackProgress?: PlaybackProgress;
  sourceSpeechPolicyProfile?: string;
  sourceSpeechPolicyOverrides?: SpeechPolicyOverrides;
  warnings?: string[];
  error?: string;
  createdAt: string;
  lastAccessedAt: string;
  expiresAt: string;
  updatedAt: string;
};
```

Temporary artifacts use `scope: "temporary"` and must not reuse durable project artifact ids. Generated jobs, playback progress, reading positions, and bookmarks can carry `temporarySourceId` alongside `bookSourceId` and `preparedSourceId`.

## Lifecycle

Temporary source states are:

```ts
type TemporarySourceLifecycleState =
  | "created"
  | "importing"
  | "extracted"
  | "needs_metadata"
  | "reviewable"
  | "previewable"
  | "generating"
  | "audio_ready"
  | "stale"
  | "failed"
  | "promoted"
  | "expired"
  | "discarded";
```

Expected transitions:

- `created -> importing -> extracted`
- `extracted -> needs_metadata -> reviewable`
- `extracted -> reviewable`
- `reviewable -> previewable -> generating -> audio_ready`
- Any active state can become `stale` or `failed`.
- Any non-terminal temporary state can become `discarded` or `expired`.
- `reviewable`, `previewable`, or `audio_ready` can become `promoted` after an explicit project promotion.

Terminal states are `promoted`, `expired`, and `discarded`.

## Policy Scope

Temporary session speech-policy overrides are session scoped. They must not become project defaults during preview, generation, or Cinema playback.

Promotion may copy the effective temporary policy into a durable source pin only when the promotion request explicitly asks for that. Otherwise the promoted source follows the target project's default policy.

## API Response Shapes

Project source list routes keep returning project-owned sources:

- `GET /api/projects/:id/book-sources -> BookSource[]`
- `GET /api/projects/:id/source-preps -> PreparedSource[]`

Temporary routes should return envelopes:

- `POST /api/temporary-sources -> TemporarySourceEnvelope`
- `GET /api/temporary-sources/:temporarySourceId -> TemporarySourceEnvelope`
- `POST /api/temporary-sources/:temporarySourceId/voice-jobs -> VoiceJob`
- `POST /api/temporary-sources/:temporarySourceId/promote -> ProjectSourceEnvelope`
- `DELETE /api/temporary-sources/:temporarySourceId -> 204`

Cinema, Review, and Preview should consume the shared `SourceLifecycleEnvelope`. For temporary sessions it has `sourceOwner: "temporary"`, `temporarySourceId`, no `projectId`, session expiry metadata, and `policyScope: "source"`.

## Migration Notes

Existing project source behavior remains unchanged:

- `BookSource.projectId` and `PreparedSource.projectId` remain required for durable source objects.
- Project source list routes continue to filter by `projectId` and do not include temporary sessions.
- Existing persisted project source JSON remains compatible because new ownership fields are optional on durable source records.
- Existing generated audio artifacts remain project/job scoped unless a new job is created with `temporarySourceId`.
- Deleting temporary artifacts can remove only artifacts with `scope: "temporary"` or records beneath the temporary source storage root.

Validation coverage:

- Frontend lifecycle tests assert prepared sources default to `sourceOwner: "project"`.
- Frontend lifecycle tests assert temporary source envelopes can be reviewable without a `projectId`.
