You agreed at the resume/retry/state layer with `AGREED RESUME/RETRY STATE MODEL`:

Move from job-centric resume to source/manifest/revision-centric durable state. Backend/local storage is authoritative. Progress points to source revision, extraction revision, manifest, repair overlay set, reading unit, locator, source word/phrase/block, segment, audio artifact, and highlight map. Retry is artifact- and segment-scoped. Repairs and promotion fork/supersede through explicit crosswalks. Reload and navigation recover into current, degraded, interrupted, stale, failed, or superseded states without pretending precision survived.

Answers to your pressure-test questions:

1. Interrupted backend restart during synthesis/checking:
   - First batch should mark as `interrupted_retriable`, requiring user action.
   - Do not silently auto-resume provider work yet.

2. Quick Listen promotion:
   - Default keep progress, bookmarks, generated artifacts, and repair history when promoting into a durable project.
   - Show storage/provenance warnings where appropriate.

3. Repair before saved position:
   - High-confidence remap resumes automatically in repaired version.
   - Low-confidence remap offers explicit choice: resume in old version or repaired version.

Now continue the planned sequence.

Focus of this prompt: Responsiveness architecture — UI scheduling, worker split, cache boundaries, performance budgets, and low-resource degradation.

Attachment context is still the same archive from the previous turns (`tts-research-chatgpt-adc8d07.zip`, SHA256 `ac7b61be37079609a24cceeeb958a6d780f03373a83e170e0c61893540e9c182`). Treat it as current implementation truth.

Required output:

# Responsiveness verdict
- State whether the current architecture can deliver “feels responsive while generation/source processing continues.”
- Identify top blockers and likely UI/backend bottlenecks.

# Responsiveness architecture
Define the target architecture for:
- route/navigation during active jobs;
- source extraction updates;
- partial manifest updates;
- playback/control interactions;
- read-along highlight updates;
- rendering large source documents;
- repair overlays and remap operations;
- low-resource degradation.

# Client scheduling and state locality
Recommend high-level boundaries for React state, memoization/selectors, external stores, workers, virtualization, throttling/debouncing, and persistence.

# Backend/event architecture
Recommend high-level boundaries for SSE/events, polling, event coalescing, job progress, source progress, artifact readiness, and cache invalidation.

# Performance budgets and gates
Propose concrete budgets/gates for:
- route change latency during active processing;
- click/control response latency;
- read-along highlight frame stability;
- first visible source text;
- first playable segment;
- low-resource fallback behavior;
- screenshot/UI regression evidence.

# Trade-offs / anti-goals
List what should stay out of the first <=20 issue batch.

# Agreement candidate
End with either `AGREED RESPONSIVENESS ARCHITECTURE` or `NOT AGREED`.
If agreed, provide the responsiveness direction to carry into complete UI/screenshot review.
If not agreed, state the blocking change.

# Pressure-test questions
Ask only questions that materially change architecture direction and are not answerable from the archive or answers above.