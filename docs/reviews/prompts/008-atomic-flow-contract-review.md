We need one more architecture/project-management review before creating Linear issues.

You previously returned `AGREED LINEAR BATCH` with 17 new issues. The human asked us to process that response further, ensure the issues are truly atomic, and document the complete project flowchart/invariants/contracts before creating issues.

Current Linear constraint:
- Project: TTS-Research
- Active issue cap: <=20
- Existing active issue: QQP-4 "Quick Narrate Pasted URL"
- Therefore we may create at most 19 new active issues.
- Do not create a duplicate Quick Listen issue; QQP-4 remains the capture anchor and should be linked/rescoped.

Validated existing contracts/scripts before this prompt:

```bash
mise exec -- pnpm generate:contracts
mise exec -- pnpm validate:ir
mise exec -- pnpm test:adapters
```

Result: schema/type bundles generated; 4 Content IR fixtures, 22 public contract fixtures, and 3 adapter files validated; adapter tests passed (Markdown/HTML/EPUB/DOCX Node tests 10/10; PDF unittest 8 passed, 1 skipped).

I created these repo-local draft artifacts:
- `docs/architecture/source-reader-flow-invariants.md`
- `docs/project-management/linear/tts-research-first-batch-atomicity-review.md`
- `docs/project-management/linear/tts-research-first-batch.draft.manifest.json`

Below are their contents with line numbers stripped. Please review them as architecture/PM source of truth candidates, not as final implementation code.

--- FLOW / INVARIANTS / CONTRACT MAP ---

1|# Source Reader Flow, Invariants, and Contract Map
2|
3|Status: draft pending ChatGPT agreement  
4|Updated: 2026-07-07 11:27 CEST
5|
6|## Purpose
7|
8|This document is the repo-local operating map for the first TTS-Research / Voice Studio batch. It turns the ChatGPT architecture agreement into a concrete flowchart, contract boundary map, and invariant checklist before Linear issues are created.
9|
10|## Validated existing contracts
11|
12|Validated 2026-07-07 with:
13|
14|```bash
15|mise exec -- pnpm generate:contracts
16|mise exec -- pnpm validate:ir
17|mise exec -- pnpm test:adapters
18|```
19|
20|Result:
21|
22|- generated schema/type bundles successfully;
23|- validated 4 Content IR fixtures, 22 public contract fixtures, and 3 adapter files;
24|- adapter tests passed: Markdown/HTML/EPUB/DOCX Node tests 10/10; PDF unittest 8 passed, 1 skipped.
25|
26|Existing contract coverage:
27|
28|- `docs/contracts/content-ir.md` — stable finalized node/content contract.
29|- `docs/contracts/locators.md` — resume/bookmark/highlight locator envelope.
30|- `docs/contracts/speech-plan.md` — speech segment plan contract.
31|
32|Current gap before first batch:
33|
34|- no durable source lifecycle envelope contract;
35|- no source/extraction/readalong manifest revision contract;
36|- no partial artifact compatibility/staleness contract;
37|- no repair overlay/revision remap/promotion crosswalk contract;
38|- no event contract for source/manifest progress;
39|- no manifest-aware durable progress resolver contract.
40|
41|## Product flowchart
42|
43|```mermaid
44|flowchart TD
45|  A[Intake: paste URL upload project source] --> B[Persist raw source artifact locally]
46|  B --> C[Create SourceEnvelope and SourceRevision]
47|  C --> D[Adapter extraction]
48|  D --> E{Reading unit emitted?}
49|  E -->|yes| F[Persist ReadingUnitManifest snapshot]
50|  E -->|failed/degraded| G[Record recoverable extraction warning]
51|  F --> H{Unit readiness}
52|  H -->|readable| I[Reader may show source-only read mode]
53|  H -->|narratable| J[Incremental speech plan segment]
54|  H -->|alignable after audio/timing| K[Sync fidelity decision]
55|  J --> L[Synthesize earliest contiguous prefix]
56|  L --> M[Partial audio artifact: unchecked]
57|  M --> N[Reader may play labeled unchecked audio]
58|  N --> O[Check/alignment]
59|  O -->|pass| P[Audio checked + timing/highlight candidate]
60|  O -->|fail| Q[Segment failed/stale, retryable]
61|  P --> K
62|  K --> R{Evidence permits}
63|  R -->|exact| S[Word highlight]
64|  R -->|medium| T[Phrase highlight]
65|  R -->|low| U[Block highlight]
66|  R -->|audio only| V[Audio-only progress]
67|  R -->|none| I
68|  S --> W[Persist manifest-aware progress]
69|  T --> W
70|  U --> W
71|  V --> W
72|  I --> W
73|  W --> X[Leave/reopen resolves current degraded stale failed or superseded state]
74|```
75|
76|## Repair and supersession flow
77|
78|```mermaid
79|flowchart TD
80|  A[User/system detects extraction or text problem] --> B[Create immutable RepairOverlay]
81|  B --> C[Create superseding manifest/revision sidecar]
82|  C --> D[Mark affected units/segments/highlight maps stale]
83|  C --> E[Keep compatible unaffected audio artifacts]
84|  D --> F{Progress remap confidence}
85|  F -->|high| G[Auto resume repaired version]
86|  F -->|low| H[Offer old version vs repaired version]
87|  E --> I[Retry only affected extraction/speech/audio/sync artifacts]
88|```
89|
90|## Quick Listen promotion flow
91|
92|```mermaid
93|flowchart TD
94|  A[Quick Listen paste/URL] --> B[Temporary SourceEnvelope]
95|  B --> C[Same manifest/audio/progress model as project source]
96|  C --> D{Promote to durable project?}
97|  D -->|yes| E[Create PromotionCrosswalk]
98|  E --> F[Map source unit segment audio highlight progress repair IDs]
99|  F --> G[Land in durable project Reader]
100|  D -->|discard| H[Temporary expiry may delete only unpromoted artifacts]
101|```
102|
103|## Architecture invariants
104|
105|1. Raw source is persisted locally before adapter extraction for URL/upload/paste sources where bytes are available.
106|2. Source identity is not job identity. Jobs may create artifacts; sources/manifests own durable reading state.
107|3. Content IR v1 remains the finalized node contract; lifecycle/readiness/staleness live in sidecar contracts.
108|4. Reading unit IDs are stable across compatible revisions; insertion/reorder uses sparse order keys and revision maps.
109|5. Readable, narratable, and alignable are separate states.
110|6. Earliest contiguous narratable prefix may synthesize before full extraction completes.
111|7. Unchecked audio may be playable only when explicitly labeled and replaceable.
112|8. Exact word highlight is forbidden unless source revision, text mapping, timing confidence, and low-resource gates all pass.
113|9. Fallback sync is honest: phrase, block, audio-only, or source-only must be visible as such.
114|10. Backend/local storage is authoritative; frontend caches are narrow, keyed, and disposable.
115|11. Browser localStorage stores only reopen/layout hints, never canonical progress or artifact state.
116|12. Backend restart cannot leave active work pretending to run; orphaned active work becomes `interrupted_retriable` for the first batch.
117|13. Retry is artifact/segment scoped whenever source compatibility permits.
118|14. Repairs do not mutate running manifests; they fork/supersede with overlays and crosswalks.
119|15. Promotion from Quick Listen to project source keeps progress/bookmarks/artifacts/repair history by default.
120|16. UI responsiveness beats fidelity: low-resource mode may downgrade exact sync to phrase/block.
121|17. The `Design for the Real World` source/project is the canonical product proof fixture; Kappa remains adapter/smoke evidence.
122|18. Linear is the live PM source; ChatGPT threads are architecture/review records; repo docs are durable design records.
123|
124|## Contract map
125|
126|```mermaid
127|flowchart LR
128|  SourceEnvelope --> SourceRevision
129|  SourceRevision --> ExtractionRevision
130|  ExtractionRevision --> ReadingUnitManifest
131|  ReadingUnitManifest --> ContentIR[content-ir.v1]
132|  ReadingUnitManifest --> ReadalongManifest
133|  ReadalongManifest --> SpeechPlan[speech-plan.v1]
134|  ReadalongManifest --> AudioArtifact
135|  ReadalongManifest --> HighlightMap[highlight-map.v2]
136|  ReadalongManifest --> LocatorEnvelope[locator-envelope.v1]
137|  RepairOverlay --> RevisionMap
138|  RevisionMap --> ReadalongManifest
139|  PromotionCrosswalk --> SourceEnvelope
140|  DurableProgress --> LocatorEnvelope
141|  DurableProgress --> ReadalongManifest
142|  DurableProgress --> AudioArtifact
143|```
144|
145|## First-batch contract status
146|
147|| Contract | Existing? | First-batch action |
148|| --- | --- | --- |
149|| `content-ir.v1` | yes | keep stable; adapter backfills must validate |
150|| `locator-envelope.v1` | yes | use for progress/bookmarks/highlights; extend sidecars not schema unless required |
151|| `speech-plan.v1` | yes | link segments to source/revision/manifest/unit identity |
152|| `highlight-map.v2` | yes | gate with sync fidelity/staleness decisions |
153|| `SourceEnvelope` | partial temporary-source docs | formalize source-neutral contract |
154|| `SourceRevision` / `ExtractionRevision` | no | add sidecar contract |
155|| `ReadingUnitManifest` / `ReadalongManifest` | no | add sidecar contract and snapshots |
156|| `ArtifactCompatibility` | no | add source/audio/highlight staleness/reuse contract |
157|| `RevisionMap` | no | add remap sidecar for repairs/extraction correction |
158|| `RepairOverlay` | no | add immutable minimal overlay contract |
159|| `PromotionCrosswalk` | partial temporary-source docs | formalize temporary-to-project identity map |
160|| Source/manifest event contract | no | add sequenced SSE/snapshot fallback contract |
161|
162|## ChatGPT agreement needed
163|
164|- Confirm flowchart sequencing and state boundaries.
165|- Confirm invariant list is complete enough to protect implementation.
166|- Confirm contract map separates stable Content IR from lifecycle/readiness sidecars correctly.
167|- Confirm the first Linear batch should not be created until the refined issue list maps to this flow.
168|

--- ATOMICITY REVIEW / REFINED ISSUE BATCH ---

1|# TTS-Research First Linear Batch Atomicity Review
2|
3|Status: draft pending ChatGPT atomicity/flow agreement  
4|Updated: 2026-07-07 11:27 CEST
5|
6|## Inputs
7|
8|- ChatGPT batch response: `docs/reviews/chatgpt/007-linear-issue-batch.response.md`
9|- Active Linear project: https://linear.app/niklas-olsson/project/tts-research-9683c18e447c
10|- Active issue cap: <=20
11|- Existing active issue: `QQP-4` — Quick Narrate Pasted URL
12|
13|## Atomicity rule
14|
15|An issue is atomic only if it has one independently verifiable deliverable, one primary owner surface, explicit dependencies, deterministic evidence, and no hidden "also implement the adjacent subsystem" work.
16|
17|Allowed atomic shapes:
18|
19|1. Contract/spec artifact with fixtures and validation.
20|2. Backend persistence/API slice with deterministic tests.
21|3. Frontend state/UI slice with deterministic tests/screenshots.
22|4. Evidence gate that only verifies previously implemented behavior.
23|
24|Disallowed shapes:
25|
26|- backend + frontend + evidence + migration all in one issue;
27|- umbrella work like "make Reader best-in-class";
28|- multiple source formats at best-in-class depth in one issue;
29|- implementation work hidden inside evidence or doc-only issues;
30|- creating a duplicate issue for existing `QQP-4`.
31|
32|## ChatGPT proposal atomicity pass
33|
34|| slug | atomicity | decision |
35|| --- | --- | --- |
36|| readalong-contracts | OK | Single deliverable or acceptable vertical slice. |
37|| source-lifecycle-storage | SPLIT | Mixed source persistence, manifest snapshots, and startup recovery. |
38|| stable-unit-ir-adapter-backfill | SPLIT | First-proof adapters and lower-tier contract reports should be separate. |
39|| epub-html-incremental-extraction | OK | Single deliverable or acceptable vertical slice. |
40|| source-manifest-events-store | SPLIT | Backend event protocol and frontend store are separate atomic deliverables. |
41|| incremental-speech-plan-segmentation | OK | Single deliverable or acceptable vertical slice. |
42|| partial-audio-artifact-states | OK | Single deliverable or acceptable vertical slice. |
43|| sync-fidelity-gates | OK | Single deliverable or acceptable vertical slice. |
44|| durable-progress-resume-resolver | OK | Single deliverable or acceptable vertical slice. |
45|| retry-interrupted-artifact-semantics | OK | Single deliverable or acceptable vertical slice. |
46|| minimal-repair-overlay-supersession | OK | Single deliverable or acceptable vertical slice. |
47|| quick-listen-promotion-crosswalk | OK | Single deliverable or acceptable vertical slice. |
48|| reader-shell-state-vocabulary | OK | Single deliverable or acceptable vertical slice. |
49|| reader-transport-state-machine | OK | Single deliverable or acceptable vertical slice. |
50|| reader-windowing-highlight-scheduling | OK | Single deliverable or acceptable vertical slice. |
51|| active-processing-performance-gates | MERGE | Performance gate and DFRW evidence are one final proof/evidence lane. |
52|| design-real-world-reader-evidence | MERGE | Pure evidence gate depends on all work; combine with active-processing evidence to preserve cap. |
53|
54|## Refined candidate batch
55|
56|This keeps the Linear cap exactly at 20 if all new issues are created: 1 existing active issue + 19 new issues = 20 active issues.
57|
58|| slug | P | deps | atomic goal |
59|| --- | --- | --- | --- |
60|| readalong-contracts | 1 | none | One repo contract pack: schemas/docs/fixtures for source envelope, revisions, read-along manifest, artifact compatibility, repair overlay, revision map, and promotion crosswalk. No runtime implementation. |
61|| source-lifecycle-storage | 1 | readalong-contracts | Backend persistence only for source identity/revisions/raw artifacts and startup interrupted state; no frontend store or event stream. |
62|| manifest-snapshot-storage-api | 1 | readalong-contracts, source-lifecycle-storage | Backend snapshot storage/API for unit/read-along manifests; no SSE/client store. |
63|| stable-unit-ir-core-adapters | 1 | readalong-contracts | Only first-proof adapters get stable unit IDs/order keys/fingerprints/locators/provenance. |
64|| lower-tier-adapter-contract-fit | 2 | readalong-contracts | Contract-fit reports and warnings for follow-on formats; no best-in-class implementation claim. |
65|| epub-html-incremental-extraction | 1 | source-lifecycle-storage, manifest-snapshot-storage-api, stable-unit-ir-core-adapters | One proof path emits readable units incrementally and writes manifest snapshots. |
66|| source-manifest-event-stream | 1 | manifest-snapshot-storage-api | Backend SSE/event protocol and tests only; frontend can still poll/snapshot. |
67|| frontend-source-manifest-store | 1 | source-manifest-event-stream | Client store keyed by source/revision/manifest, reconnect handling, and render coalescing. |
68|| incremental-speech-plan-segmentation | 1 | epub-html-incremental-extraction, frontend-source-manifest-store | Speech-plan segments reference source/revision/manifest/unit identity and can start from first narratable prefix. |
69|| partial-audio-artifact-states | 1 | incremental-speech-plan-segmentation | Audio manifest segment state transitions and reuse/replacement semantics. |
70|| sync-fidelity-gates | 1 | partial-audio-artifact-states | Decision layer for word/phrase/block/audio-only/source-only with no stale exact-word claims. |
71|| durable-progress-resume-resolver | 1 | manifest-snapshot-storage-api, sync-fidelity-gates | Durable progress and deterministic resolution order across exact/remap/degraded resume. |
72|| retry-interrupted-artifact-semantics | 1 | partial-audio-artifact-states, durable-progress-resume-resolver | Artifact/segment retry semantics across cancellation, provider failure, backend restart, and checking failure. |
73|| minimal-repair-overlay-supersession | 2 | readalong-contracts, durable-progress-resume-resolver, retry-interrupted-artifact-semantics | Minimal overlay + superseding manifest + stale affected artifacts; no full repair workbench. |
74|| quick-listen-promotion-crosswalk | 1 | QQP-4, source-lifecycle-storage, partial-audio-artifact-states, durable-progress-resume-resolver | Promotion crosswalk and phone direct-reader landing; existing QQP-4 remains capture anchor, no duplicate issue. |
75|| reader-shell-state-vocabulary | 1 | frontend-source-manifest-store | Reader shell labels/state chips/mode ownership; no visual redesign. |
76|| reader-transport-state-machine | 1 | partial-audio-artifact-states, reader-shell-state-vocabulary | Shared transport states for pre-audio/generating/unchecked/checked/stale/replaced/failed/degraded. |
77|| reader-windowing-highlight-scheduling | 1 | sync-fidelity-gates, reader-shell-state-vocabulary, reader-transport-state-machine | Internal windowing + high-frequency highlight isolation + low-resource downgrade. |
78|| active-processing-evidence-gates | 2 | quick-listen-promotion-crosswalk, reader-windowing-highlight-scheduling | One evidence gate issue proving budgets/screenshots/review package for canonical fixture; no feature implementation beyond test/evidence harnesses. |
79|
80|## Non-negotiable issue invariants
81|
82|- `QQP-4` remains the existing Quick Listen capture anchor; it is linked/rescoped, not duplicated.
83|- No issue may claim PDF/DOCX/OCR best-in-class behavior in this first batch.
84|- Every runtime issue must name the source revision, extraction revision, manifest identity, artifact identity, and stale/superseded behavior it touches.
85|- Every UI issue must name required phone/constrained/desktop/large-desktop evidence or explicitly defer screenshots to `active-processing-evidence-gates`.
86|- Every issue has deterministic commands/evidence; speculative checks are not acceptance criteria.
87|- ChatGPT thread is architecture/review record only; repo docs + Linear are the operational source of truth.
88|
89|## Pending ChatGPT questions
90|
91|1. Are the split/merge decisions above the right way to make the batch atomic while respecting the <=20 cap?
92|2. Is combining active-processing performance gates with Design for the Real World evidence acceptable, or should the batch drop another lower-priority item to keep them separate?
93|3. Does any proposed issue still hide more than one independently releasable deliverable?
94|4. Are dependencies sufficient to prevent implementation from starting before required contracts/invariants exist?
95|

Required output:

# Atomicity verdict
- State whether the refined 19-new-issue batch is atomic enough to create in Linear.
- If not, say `NOT ATOMIC` and list the exact changes required.
- If yes, say `ATOMIC ENOUGH FOR LINEAR`.

# Flowchart verdict
- State whether the flowcharts are sane and complete enough for the first batch.
- Identify missing states/transitions only if they materially affect implementation.

# Invariant/contract verdict
- State whether the invariants and contract map are sane.
- Identify which existing contracts are valid to reuse and which new sidecar contracts must be added.
- Validate the separation of stable Content IR from lifecycle/readiness sidecars.

# Issue-by-issue review
For each of the 19 proposed new slugs, return:
- `keep`, `rename`, `split`, `merge`, or `drop`;
- exact reason;
- corrected title/dependencies/acceptance scope if needed.

# Final batch shape
Return the final issue list to create, with no more than 19 new issues, including:
- stable slug;
- title;
- priority;
- dependencies;
- one atomic deliverable sentence.

# Gate before Linear creation
List the exact repo-local docs/manifests that must be updated before Linear creation.

# Agreement marker
End with exactly one of:
- `AGREED ATOMIC FLOW AND LINEAR BATCH`
- `NOT AGREED`
