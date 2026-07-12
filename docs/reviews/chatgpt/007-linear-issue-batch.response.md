# Issue-batch verdict

**READY FOR LINEAR BATCH**

The architecture/product/UI discussion is sufficient to create the first capped Linear batch. The batch should not attempt “all formats best-in-class.” It should establish the source-reader spine, prove it on paste/URL/clean HTML and EPUB/structured HTML, and leave PDF/DOCX/OCR as contract-conformant follow-ons until they have evidence.

Existing active issue:

* `QQP-4` — “Quick Narrate Pasted URL”

Do **not** create a duplicate Quick Listen issue. Re-scope/link `QQP-4` so it uses the same source envelope, manifest, partial audio, resume, and promotion model as the durable project reader.

# First batch principles

The batch must preserve these decisions:

* **Reader is the product spine.** `Cinema` / `Theatre` can remain shell/display terms, but the user-facing primary path is `Reader`.
* **Source/manifest/revision state beats job state.** Durable resume must point to source revision, extraction revision, read-along manifest, repair overlay set, unit, locator, segment, audio artifact, and highlight map.
* **ASAP means safe staged upgrades.** Start with source-only readable state, then block/phrase/audio/word as evidence permits.
* **No exact-sync lie.** Word highlight is allowed only when source and timing evidence pass gates. Otherwise show phrase, block, audio-only, or source-only.
* **EPUB/structured HTML is the first long-form proof path.** PDF is the first messy-document follow-up, not first proof.
* **Quick Listen is fast capture, not a separate product.** It must be promotable into durable project state without losing source, artifacts, progress, bookmarks, or repair history.
* **Local-first state and artifacts are product guarantees.** Raw fetched source, partial artifacts, progress, repair overlays, and evidence must be persisted locally.
* **Responsive feel is non-negotiable.** Navigation, controls, read-along, and route switches must remain interactive during extraction, synthesis, checking, alignment, and retry.
* **Linear cap remains binding.** With `QQP-4` already active, create fewer than 19 new issues unless a true blocker appears.

Explicitly out of scope for the first batch:

* full PDF/DOCX/OCR best-in-class parity;
* browser extension;
* cloud sync/accounts/collaboration;
* new TTS providers or voice cloning;
* AI chat, summaries, notes, quizzes, study mode;
* full repair workbench;
* non-contiguous playback;
* full app/router/global-state rewrite;
* WebSocket rewrite before SSE is proven insufficient;
* full visual redesign/theme work;
* command palette expansion;
* Teleprompt/Theatre redesign;
* audiobook marketplace/library features;
* full Readium/EPUB CFI implementation beyond local resume compatibility.

# Proposed Linear issues

I recommend **17 new issues**. That leaves **2 spare active slots** under the cap for unexpected blockers.

## 1. `readalong-contracts`

**Title:** Define source/manifest/revision read-along contracts
**Priority:** 1
**Dependencies:** none

**Description:**
Add durable repo contracts for the agreed product spine: source envelope, source revision, extraction revision, read-along manifest, reading unit readiness, segment artifact state, sync level, repair overlay, revision/remap sidecar, promotion crosswalk, and stale/superseded state. Keep `content-ir.v1` as the finalized node contract; add sidecar contracts rather than forcing pipeline state into Content IR.

**Acceptance criteria:**

* Contract docs define required fields for:

  * `SourceEnvelope`
  * `SourceRevision`
  * `ExtractionRevision`
  * `ReadingUnitManifest`
  * `ReadalongManifest`
  * `ReadalongSegment`
  * `ArtifactCompatibility`
  * `RevisionMap`
  * `RepairOverlay`
  * `PromotionCrosswalk`
* Contracts explicitly model:

  * readable / narratable / alignable readiness;
  * unchecked / checked / stale / replaced / failed audio;
  * word / phrase / block / audio-only / source-only sync levels;
  * source revision and repair overlay identity;
  * stable unit IDs and sparse `orderKey`;
  * degraded resume state.
* Fixture examples exist for:

  * paste/Markdown;
  * clean HTML;
  * EPUB/structured HTML;
  * PDF/DOCX/OCR as contract-fit examples, not best-in-class claims.
* Existing Content IR contract remains valid.

**Deterministic verification commands/evidence:**

* `mise exec -- pnpm generate:contracts`
* `mise exec -- pnpm validate:ir`
* `mise exec -- pnpm test`
* Evidence: updated `docs/contracts/*`, `fixtures/contracts/*`, and schema-bundle output.

**Reference docs/screenshots:**

* `docs/contracts/content-ir.md`
* `docs/contracts/locators.md`
* `docs/contracts/speech-plan.md`
* `docs/product/best-in-class-tts-aid-brief.md`

---

## 2. `source-lifecycle-storage`

**Title:** Add durable source lifecycle and manifest storage
**Priority:** 1
**Dependencies:** `readalong-contracts`

**Description:**
Implement backend/local durable state for source envelopes, source revisions, extraction revisions, read-along manifests, unit manifests, artifact compatibility, and manifest snapshots. This should become the authoritative state spine for both project sources and temporary Quick Listen sources.

**Acceptance criteria:**

* Backend can create and persist a source envelope before extraction completes.
* Raw fetched/uploaded/pasted source artifact is persisted before adapter extraction.
* Source state survives page reload and backend restart.
* Manifest snapshots can be loaded by `sourceId + sourceRevisionId + manifestId`.
* Temporary and project-owned sources use the same lifecycle model.
* Existing job state can coexist, but reader state no longer depends on job ID alone.
* Startup normalization marks orphaned active work as `interrupted_retriable`, not silently active.

**Deterministic verification commands/evidence:**

* `mise exec -- pnpm --filter @tts-research/backend test`
* `mise exec -- pnpm validate:ir`
* Add backend persistence tests for reload/restart of partial source state.
* Evidence: persisted manifest fixtures under backend test data or snapshot output.

**Reference docs/screenshots:**

* `docs/temporary-source-domain-model.md`
* `docs/temporary-source-migration-strategy.md`
* `docs/privacy-local-first.md`
* `docs/product/best-in-class-tts-aid-brief.md`

---

## 3. `stable-unit-ir-adapter-backfill`

**Title:** Backfill stable reading-unit identity and provenance across adapters
**Priority:** 1
**Dependencies:** `readalong-contracts`

**Description:**
Update adapter outputs so Markdown, HTML, and EPUB produce stable, provenance-bearing reading units suitable for durable resume and remap. PDF/DOCX/OCR should be contract-checked as lower-tier sources without claiming best-in-class behavior yet.

**Acceptance criteria:**

* Markdown/HTML/EPUB nodes avoid purely positional IDs as durable reading IDs.
* Units include stable fingerprints, sparse order keys, locator envelopes, text quotes, confidence, and adapter provenance.
* Existing PDF/DOCX/OCR fixtures validate against the source-neutral contract with appropriate lower quality tiers where needed.
* Adapter warnings distinguish unsupported, degraded, skipped, and review-needed content.
* No source type silently drops content without a warning/recoverable state.

**Deterministic verification commands/evidence:**

* `mise exec -- pnpm test:adapters`
* `mise exec -- pnpm validate:ir`
* `mise exec -- pnpm test:markdown-adapter`
* `mise exec -- pnpm test:pdf-adapter`
* Evidence: updated `fixtures/contracts/*.content-ir.v1.json` and adapter quality reports.

**Reference docs/screenshots:**

* `docs/contracts/content-ir.md`
* `docs/adapters/markdown.md`
* `fixtures/contracts/epub.content-ir.v1.json`
* `fixtures/contracts/pdf.content-ir.v1.json`
* `fixtures/contracts/docx.content-ir.v1.json`
* `fixtures/contracts/ocr-image-set.content-ir.v1.json`

---

## 4. `epub-html-incremental-extraction`

**Title:** Stream EPUB and structured HTML units into partial manifests
**Priority:** 1
**Dependencies:** `source-lifecycle-storage`, `stable-unit-ir-adapter-backfill`

**Description:**
Make EPUB/structured HTML the first long-form proof path. The adapter/backend path should emit readable sections/units incrementally so the Reader can show a stable prefix before the whole source is finished.

**Acceptance criteria:**

* Clean HTML and EPUB extraction can emit:

  * source started;
  * spine/section discovered;
  * unit readable;
  * unit failed;
  * extraction complete.
* First readable unit can be committed before later sections finish.
* Later corrections insert/reorder using sparse order keys and revision maps, not renumbering prior units.
* Raw remote HTML is persisted locally before extraction begins.
* UI can distinguish pending later sections from failed sections.
* Born-digital PDF remains out of this proof path except for contract compatibility.

**Deterministic verification commands/evidence:**

* `mise exec -- pnpm test:adapters`
* `mise exec -- pnpm --filter @tts-research/backend test`
* Add/extend deterministic fixture test for incremental EPUB/HTML extraction.
* Evidence: partial manifest snapshots showing readable prefix before complete extraction.

**Reference docs/screenshots:**

* `docs/epub-speech-fidelity.md`
* `docs/contracts/content-ir.md`
* `reviewer-screenshots/e2e-book-cinema/book-cinema-epub-long-focus-read.png`
* `reviewer-screenshots/e2e-book-cinema/website-cinema-focus-read.png`

---

## 5. `source-manifest-events-store`

**Title:** Replace whole-job progress snapshots with source/manifest events and client store
**Priority:** 1
**Dependencies:** `source-lifecycle-storage`

**Description:**
Add sequenced source/manifest events and a narrow frontend source-manifest store. Events should be patch/invalidation hints; backend manifest snapshots remain authoritative.

**Acceptance criteria:**

* Backend emits sequenced events for:

  * source revision created;
  * unit readable;
  * unit narratable;
  * unit failed;
  * segment planned;
  * segment audio unchecked;
  * segment checked;
  * check failed;
  * sync ready;
  * artifact stale;
  * manifest superseded.
* SSE supports reconnect with sequence recovery or snapshot fallback.
* Frontend store is keyed by `sourceId + sourceRevisionId + manifestId`.
* Whole-job polling remains fallback, not primary reader progress.
* Events are coalesced to avoid React rendering per unit/word/segment tick.

**Deterministic verification commands/evidence:**

* `mise exec -- pnpm --filter @tts-research/backend test`
* `mise exec -- pnpm --filter @tts-research/frontend test`
* Add event sequencing/reconnect tests.
* Evidence: event log fixture for partial EPUB/HTML source and first playable segment.

**Reference docs/screenshots:**

* `docs/performance.md`
* `docs/ui-memory.md`
* `docs/app-shell-navigation.md`

---

## 6. `incremental-speech-plan-segmentation`

**Title:** Generate speech plans from narratable units incrementally
**Priority:** 1
**Dependencies:** `epub-html-incremental-extraction`, `source-manifest-events-store`

**Description:**
Move segmentation from whole-input text toward manifest-bound narratable units. The first narratable unit should be able to produce a segment plan before the whole source is complete.

**Acceptance criteria:**

* Speech plan segments reference:

  * source ID;
  * source revision;
  * extraction revision;
  * manifest ID;
  * unit IDs;
  * node IDs;
  * speech text hash;
  * voice/engine/policy hash.
* First narratable unit can enqueue synthesis while later units are still extracting.
* Skipped/non-narratable units remain visible in source state.
* Segment reuse is based on unit identity and speech text hash, not only raw contiguous text.
* Existing whole-text jobs continue to work through compatibility path.

**Deterministic verification commands/evidence:**

* `mise exec -- pnpm validate:ir`
* `mise exec -- pnpm --filter @tts-research/backend test`
* `mise exec -- pnpm e2e:golden-minute`
* Evidence: speech-plan fixture showing source-linked segments.

**Reference docs/screenshots:**

* `docs/contracts/speech-plan.md`
* `docs/product/best-in-class-tts-aid-brief.md`
* `fixtures/golden-minute/expected-speech-plan.json`

---

## 7. `partial-audio-artifact-states`

**Title:** Make partial audio segments source-aware with unchecked/checked/stale states
**Priority:** 1
**Dependencies:** `incremental-speech-plan-segmentation`

**Description:**
Extend partial audio handling so the UI can play the earliest contiguous segment while honestly distinguishing unchecked, checked, failed, stale, replaced, and superseded audio.

**Acceptance criteria:**

* Partial audio manifest includes source revision, manifest ID, segment IDs, unit IDs, audio artifact IDs, and segment status.
* Earliest contiguous prefix is playable before full-source synthesis completes.
* First playable unchecked audio is clearly represented in backend state.
* Checking failure marks only the affected segment failed/stale unless source-level failure is real.
* Replacement audio gets new artifact identity; old artifact becomes `replaced` or `superseded`.
* Segment-level retry preserves unaffected ready prefix.

**Deterministic verification commands/evidence:**

* `mise exec -- pnpm --filter @tts-research/backend test`
* `mise exec -- pnpm e2e:golden-minute`
* Add/extend e2e fixture showing unchecked → checked and unchecked → check failed.
* Evidence: partial audio manifest with segment state transitions.

**Reference docs/screenshots:**

* `docs/product/best-in-class-tts-aid-brief.md`
* `reviewer-screenshots/e2e-book-cinema/book-cinema-no-audio.png`
* `reviewer-screenshots/e2e-book-cinema/book-cinema-resume-failure.png`

---

## 8. `sync-fidelity-gates`

**Title:** Gate read-along fidelity by source/timing evidence
**Priority:** 1
**Dependencies:** `partial-audio-artifact-states`

**Description:**
Implement the sync decision layer that chooses exact word, phrase, block, audio-only, or source-only based on source quality, artifact currentness, timing confidence, and low-resource state.

**Acceptance criteria:**

* Reader receives a manifest-derived allowed/resolved sync level.
* Exact word highlighting is forbidden when:

  * source revision differs;
  * highlight map is stale;
  * source words cannot map to rendered tokens;
  * timing is heuristic/low-confidence;
  * low-resource mode downgrades fidelity.
* Phrase/block fallback is explicit and user-visible.
* Audio-only progress is used when audio exists but source mapping is stale/missing.
* Source-only mode is used when source is readable but audio is not ready.
* Existing highlight-map fixtures remain valid or are migrated.

**Deterministic verification commands/evidence:**

* `mise exec -- pnpm e2e:readalong-sync`
* `mise exec -- pnpm e2e:read-along-fidelity`
* `mise exec -- pnpm bench:readalong-sync`
* Evidence: sync report showing word/phrase/block/audio/source-only cases and zero stale-word highlight claims.

**Reference docs/screenshots:**

* `docs/handoff/whole-app-followalong-sync-spine.md`
* `docs/reading-followalong-renderer.md`
* `fixtures/contracts/markdown-word.highlight-map.v2.json`
* `fixtures/contracts/markdown-phrase.highlight-map.v2.json`
* `fixtures/contracts/markdown-degraded.highlight-map.v2.json`

---

## 9. `durable-progress-resume-resolver`

**Title:** Persist and resolve manifest-aware reading progress
**Priority:** 1
**Dependencies:** `source-lifecycle-storage`, `sync-fidelity-gates`

**Description:**
Replace job-only or browser-local resume with durable progress keyed to source revision, extraction revision, manifest, repair overlay set, unit, locator, segment, audio artifact, and highlight map.

**Acceptance criteria:**

* Progress stores exact and fallback targets:

  * source revision;
  * extraction revision;
  * manifest;
  * repair overlay set;
  * unit/node;
  * word/phrase/block;
  * locator envelope;
  * text quote;
  * segment;
  * audio time.
* Resume resolution order is implemented:

  1. exact revision/unit/source word;
  2. same revision locator;
  3. revision map;
  4. text quote/fingerprint;
  5. block-level;
  6. audio time;
  7. source-only degraded.
* Browser local storage stores only reopen pointers and non-critical layout memory.
* Reload after partial extraction/synthesis restores the correct degraded/current state.
* Progress survives project/source switching.

**Deterministic verification commands/evidence:**

* `mise exec -- pnpm --filter @tts-research/backend test`
* `mise exec -- pnpm --filter @tts-research/frontend test`
* Add/extend e2e reload/resume test for partial source and stale highlight map.
* Evidence: progress resolver snapshots for exact, remapped, and degraded resume.

**Reference docs/screenshots:**

* `docs/ui-memory.md`
* `docs/contracts/locators.md`
* `reviewer-screenshots/e2e-book-cinema/book-cinema-resume-failure.png`

---

## 10. `retry-interrupted-artifact-semantics`

**Title:** Add artifact-scoped retry and interrupted-retriable semantics
**Priority:** 1
**Dependencies:** `partial-audio-artifact-states`, `durable-progress-resume-resolver`

**Description:**
Implement retry semantics for extraction, speech plan/render, segment synthesis, alignment/checking, cancellation, provider failure, backend restart, and repair supersession. Retry should reuse valid artifacts and avoid whole-source restarts where possible.

**Acceptance criteria:**

* Backend startup converts orphaned active work into `interrupted_retriable`.
* Retry from extraction creates a new extraction revision.
* Retry from render/spoken form creates a new speech-plan revision.
* Retry from segment synthesis targets failed/missing/stale segments.
* Retry from checking/alignment reuses audio unless audio is invalid.
* User cancellation preserves readable source and ready audio prefix.
* Provider failure is segment-scoped unless provider config is invalid.
* UI can show “retry segment,” “retry extraction,” and “resume generation” states without implying full restart.

**Deterministic verification commands/evidence:**

* `mise exec -- pnpm --filter @tts-research/backend test`
* Add backend tests for:

  * provider failure;
  * cancellation;
  * backend restart;
  * check failed;
  * segment retry.
* Evidence: retry state transition fixture.

**Reference docs/screenshots:**

* `docs/product/best-in-class-tts-aid-brief.md`
* `docs/performance.md`
* `reviewer-screenshots/e2e-book-cinema/book-cinema-epub-failure.png`
* `reviewer-screenshots/e2e-book-cinema/book-cinema-docx-failure.png`

---

## 11. `minimal-repair-overlay-supersession`

**Title:** Add minimal immutable repair overlay and manifest supersession flow
**Priority:** 2
**Dependencies:** `readalong-contracts`, `durable-progress-resume-resolver`, `retry-interrupted-artifact-semantics`

**Description:**
Implement the first repair overlay flow: user/system repair creates an immutable overlay and a superseding manifest. Running jobs are not mutated in place; affected audio/highlight artifacts become stale.

**Acceptance criteria:**

* Repair overlays can mark affected units and patch display/speech text.
* Applying repair creates/forks a superseding manifest.
* Affected segments and highlight maps become stale.
* Unaffected segments remain reusable when compatibility keys match.
* High-confidence progress remap resumes automatically.
* Low-confidence remap offers old-version vs repaired-version choice.
* Minimal UI shows repaired unit, stale affected artifacts, and superseded manifest.

**Deterministic verification commands/evidence:**

* `mise exec -- pnpm --filter @tts-research/backend test`
* `mise exec -- pnpm --filter @tts-research/frontend test`
* Add e2e evidence for repair-before-saved-position high/low confidence.
* Evidence: repair overlay fixture and supersession screenshot.

**Reference docs/screenshots:**

* `docs/contracts/locators.md`
* `docs/ui-memory.md`
* `reviewer-screenshots/e2e-book-cinema/website-cinema-focus-review.png`
* `reviewer-screenshots/e2e-book-cinema/book-cinema-epub-long-focus-review.png`

---

## 12. `quick-listen-promotion-crosswalk`

**Title:** Promote Quick Listen sources into durable project sources without losing state
**Priority:** 1
**Dependencies:** `QQP-4`, `source-lifecycle-storage`, `partial-audio-artifact-states`, `durable-progress-resume-resolver`

**Description:**
Complete the Quick Listen → durable project path using a promotion crosswalk. This issue should link to existing `QQP-4` rather than duplicating it.

**Acceptance criteria:**

* Quick Listen paste/URL creates the same source envelope and manifest model as durable project sources.
* Promotion defaults to keeping:

  * source;
  * progress;
  * bookmarks;
  * generated artifacts;
  * repair history.
* Promotion records maps for:

  * source IDs;
  * unit IDs;
  * segment IDs;
  * audio artifact IDs;
  * highlight map IDs;
  * progress/bookmark IDs;
  * repair overlay IDs.
* After promotion, user lands in the durable project Reader.
* Temporary source expiry/discard cannot delete promoted project artifacts.
* UI shows storage/provenance warnings where appropriate.
* Phone flow can bypass full workspace and open Reader directly after intake.

**Deterministic verification commands/evidence:**

* `mise exec -- pnpm e2e:temporary-sources`
* `mise exec -- pnpm e2e:responsive-snapshots`
* Add/extend e2e promotion scenario with partial unchecked audio and progress.
* Evidence: promotion crosswalk JSON and phone/desktop screenshots.

**Reference docs/screenshots:**

* `docs/temporary-source-domain-model.md`
* `docs/temporary-source-copy-guide.md`
* `docs/temporary-source-migration-strategy.md`
* `reviewer-screenshots/responsive-snapshots/phone-390-website-cinema-calm-read.png`
* `reviewer-screenshots/responsive-snapshots/phone-390-workspace.png`

---

## 13. `reader-shell-state-vocabulary`

**Title:** Reframe primary surface as Reader with manifest-derived state vocabulary
**Priority:** 1
**Dependencies:** `source-manifest-events-store`

**Description:**
Create the user-facing Reader shell over the existing Cinema primitives. The shell should expose calm Read mode, optional Inspect/Review/Debug, mobile bottom sheets, bottom transport, provenance panels, and manifest-derived state chips.

**Acceptance criteria:**

* User-facing labels use `Reader` for the primary reading path.
* `Cinema` / `Theatre` remain optional display modes or internal/shared-shell terms.
* Header/footer state vocabulary includes:

  * source-only;
  * readable;
  * narratable;
  * partial;
  * unchecked;
  * checked;
  * stale;
  * replaced;
  * failed;
  * superseded;
  * degraded.
* Read mode is calm by default; diagnostics are hidden.
* Inspect owns provenance/source quality.
* Review owns repair, skipped content, stale segments, and queues.
* Debug owns timing/operator internals.
* Required recovery actions are not hidden only in More.

**Deterministic verification commands/evidence:**

* `mise exec -- pnpm --filter @tts-research/frontend test`
* `mise exec -- pnpm e2e:ui-actions:guard`
* `mise exec -- pnpm e2e:surface-complexity`
* Evidence: updated Reader screenshots replacing primary “Cinema” framing where user-visible.

**Reference docs/screenshots:**

* `docs/cinema-focus-modes.md`
* `docs/surface-complexity-budget.md`
* `docs/wayfinding-scope-ux.md`
* `reviewer-screenshots/e2e-book-cinema/website-cinema-focus-read.png`
* `reviewer-screenshots/e2e-book-cinema/website-cinema-focus-inspect.png`
* `reviewer-screenshots/e2e-book-cinema/website-cinema-focus-review.png`
* `reviewer-screenshots/e2e-book-cinema/website-cinema-focus-debug.png`

---

## 14. `reader-transport-state-machine`

**Title:** Make Reader transport state-machine driven
**Priority:** 1
**Dependencies:** `partial-audio-artifact-states`, `reader-shell-state-vocabulary`

**Description:**
Unify transport behavior across paste/website/EPUB/document/PDF/DOCX surfaces. The transport should represent pre-audio, generating, partial unchecked, checked, stale, replaced, failed, source-only, and degraded states without layout collisions.

**Acceptance criteria:**

* One shared transport state mapper is used by Reader source surfaces.
* Pre-audio state has one clear primary action.
* Unchecked audio is playable and labeled.
* Checked audio is distinct from unchecked.
* Stale/replaced/failed segment states are visible and recoverable.
* Source-only read mode does not imply audio availability.
* DOCX/Book Cinema footer/pre-audio collision is fixed.
* Transport controls remain reachable at phone 390 and constrained 1100.

**Deterministic verification commands/evidence:**

* `mise exec -- pnpm --filter @tts-research/frontend test`
* `mise exec -- pnpm e2e:book-cinema:responsive`
* `mise exec -- pnpm e2e:responsive-snapshots`
* Evidence: screenshots for no-audio, unchecked, checked, stale, failed states.

**Reference docs/screenshots:**

* `reviewer-screenshots/e2e-book-cinema/book-cinema-no-audio.png`
* `reviewer-screenshots/e2e-book-cinema/book-cinema-docx-failure.png`
* `reviewer-screenshots/e2e-book-cinema/book-cinema-docx-focus-read.png`
* `reviewer-screenshots/responsive-snapshots/phone-390-website-cinema-calm-read.png`
* `reviewer-screenshots/responsive-snapshots/constrained-1100-website-cinema-calm-read.png`

---

## 15. `reader-windowing-highlight-scheduling`

**Title:** Add source windowing and isolated read-along highlight scheduling
**Priority:** 1
**Dependencies:** `sync-fidelity-gates`, `reader-shell-state-vocabulary`, `reader-transport-state-machine`

**Description:**
Add an internal section/block windowing utility for EPUB/structured HTML and keep high-frequency playback/highlight work outside broad React rendering. Low-resource mode may downgrade word highlight to phrase/block for stability.

**Acceptance criteria:**

* EPUB/structured HTML Reader renders active/nearby units, not the entire long source.
* Exact word spans are rendered only for visible active regions.
* Highlight scheduler consumes manifest-derived sync level.
* Highlight ticks do not trigger React commits per word.
* Low-resource mode can downgrade word → phrase/block with visible reason.
* Auto-scroll is rate-limited and suppressed during user scroll.
* Smooth cursor and heavy visuals disable under low-resource/reduced-motion state.
* Route/control interaction budgets do not regress under active processing.

**Deterministic verification commands/evidence:**

* `mise exec -- pnpm e2e:readalong-performance`
* `mise exec -- pnpm e2e:readalong-sync`
* `mise exec -- pnpm e2e:book-cinema:low-resource`
* `mise exec -- pnpm bundle:local`
* Evidence: performance counters showing no per-word React render path and recorded low-resource degradation.

**Reference docs/screenshots:**

* `docs/reading-followalong-renderer.md`
* `docs/performance.md`
* `docs/reader-accessibility-qa.md`
* `reviewer-screenshots/e2e-book-cinema/book-cinema-epub-long-focus-read.png`
* `reviewer-screenshots/e2e-book-cinema/responsive-book-phone.png`

---

## 16. `active-processing-performance-gates`

**Title:** Add active-processing responsiveness gates and local-resource caps
**Priority:** 2
**Dependencies:** `source-manifest-events-store`, `reader-transport-state-machine`, `reader-windowing-highlight-scheduling`

**Description:**
Extend validation to prove navigation, controls, source rendering, and read-along remain responsive while extraction, synthesis, checking, and alignment continue. Add local-first CPU/GPU headroom behavior when the active read surface is open.

**Acceptance criteria:**

* Active Reader route switch remains within agreed budget.
* Play/pause/seek visual response remains within agreed budget.
* Manifest event propagation and UI patch flush are measured.
* First visible source text and first playable segment are measured for proof fixtures.
* Low-resource mode records explicit degradation states.
* Backend caps synthesis/alignment/checking concurrency when an active Reader surface is open on constrained hardware.
* No new performance waivers are added without explicit rationale.
* Existing performance budgets remain passing or have documented intentional updates.

**Deterministic verification commands/evidence:**

* `mise exec -- pnpm e2e:navigation-under-processing`
* `mise exec -- pnpm e2e:readalong-performance`
* `mise exec -- pnpm e2e:book-cinema:low-resource`
* `mise exec -- pnpm validate:ux-final`
* Evidence:

  * timing summaries;
  * low-resource degradation report;
  * navigation-under-processing report;
  * no missing metrics.

**Reference docs/screenshots:**

* `docs/performance.md`
* `benches/thresholds.json`
* `benches/low-resource-baseline.md`
* `reviewer-screenshots/responsive-snapshots/desktop-1440-website-cinema-calm-read.png`

---

## 17. `design-real-world-reader-evidence`

**Title:** Add canonical Design for the Real World Reader evidence lane
**Priority:** 2
**Dependencies:** `quick-listen-promotion-crosswalk`, `reader-shell-state-vocabulary`, `reader-transport-state-machine`, `reader-windowing-highlight-scheduling`, `active-processing-performance-gates`

**Description:**
Make `Design for the Real World` the canonical durable project/source fixture for product proof. Keep Kappa and adapter fixtures for smoke/adapter coverage, but use `Design for the Real World` to prove the agreed serious reading aid path.

**Acceptance criteria:**

* Evidence lane uses `Design for the Real World` as an in-app durable project/source context.
* Screenshots exist for:

  * phone 390;
  * constrained desktop 1100;
  * desktop 1440;
  * large desktop/taskbar 1920.
* Screenshots cover:

  * project Reader open;
  * partial readable source;
  * first unchecked audio;
  * checked audio;
  * stale/replaced segment;
  * failed segment;
  * phrase/block fallback;
  * exact resume;
  * degraded resume;
  * repair supersession;
  * Quick Listen promotion into durable project source.
* `review:chatgpt` package includes the new evidence.
* Screenshot manifest names project vs temporary/promoted source ownership.
* Kappa remains for adapter/smoke coverage, not the main product proof.

**Deterministic verification commands/evidence:**

* `mise exec -- pnpm e2e:responsive-snapshots`
* `mise exec -- pnpm e2e:book-cinema:responsive`
* `mise exec -- pnpm e2e:ui-actions:guard`
* `mise exec -- pnpm review:chatgpt`
* Evidence:

  * updated `reviewer-screenshot-manifest.md`;
  * committed screenshots under `reviewer-screenshots/*`;
  * generated review archive SHA.

**Reference docs/screenshots:**

* `reviewer-screenshot-manifest.md`
* `docs/reviews/chatgpt-architecture-discussion-plan.md`
* `docs/product/best-in-class-tts-aid-brief.md`
* `reviewer-screenshots/responsive-snapshots/phone-390-website-cinema-calm-read.png`
* `reviewer-screenshots/responsive-snapshots/constrained-1100-website-cinema-calm-read.png`
* `reviewer-screenshots/responsive-snapshots/desktop-1440-website-cinema-calm-read.png`
* `reviewer-screenshots/responsive-snapshots/desktop-1920-taskbar-website-cinema-calm-read.png`

# Dependency order

## Execution waves

**Existing active anchor**

* `QQP-4` — Quick Narrate Pasted URL
  Keep active. Link it into the source envelope / manifest / promotion model.

**Wave 1 — contracts and source truth**

1. `readalong-contracts`
2. `source-lifecycle-storage`
3. `stable-unit-ir-adapter-backfill`

**Wave 2 — first source proof and event spine**

4. `epub-html-incremental-extraction`
5. `source-manifest-events-store`

**Wave 3 — generation, audio, sync, resume**

6. `incremental-speech-plan-segmentation`
7. `partial-audio-artifact-states`
8. `sync-fidelity-gates`
9. `durable-progress-resume-resolver`
10. `retry-interrupted-artifact-semantics`

**Wave 4 — repair and promotion**

11. `minimal-repair-overlay-supersession`
12. `quick-listen-promotion-crosswalk`

**Wave 5 — Reader UI and responsiveness**

13. `reader-shell-state-vocabulary`
14. `reader-transport-state-machine`
15. `reader-windowing-highlight-scheduling`
16. `active-processing-performance-gates`

**Wave 6 — product proof evidence**

17. `design-real-world-reader-evidence`

## Blocking graph

```text
QQP-4
  -> quick-listen-promotion-crosswalk

readalong-contracts
  -> source-lifecycle-storage
  -> stable-unit-ir-adapter-backfill
  -> minimal-repair-overlay-supersession

source-lifecycle-storage
  -> epub-html-incremental-extraction
  -> source-manifest-events-store
  -> durable-progress-resume-resolver
  -> quick-listen-promotion-crosswalk

stable-unit-ir-adapter-backfill
  -> epub-html-incremental-extraction

epub-html-incremental-extraction
  -> incremental-speech-plan-segmentation

source-manifest-events-store
  -> incremental-speech-plan-segmentation
  -> reader-shell-state-vocabulary
  -> active-processing-performance-gates

incremental-speech-plan-segmentation
  -> partial-audio-artifact-states

partial-audio-artifact-states
  -> sync-fidelity-gates
  -> retry-interrupted-artifact-semantics
  -> quick-listen-promotion-crosswalk
  -> reader-transport-state-machine

sync-fidelity-gates
  -> durable-progress-resume-resolver
  -> reader-windowing-highlight-scheduling

durable-progress-resume-resolver
  -> retry-interrupted-artifact-semantics
  -> minimal-repair-overlay-supersession
  -> quick-listen-promotion-crosswalk

reader-shell-state-vocabulary
  -> reader-transport-state-machine
  -> reader-windowing-highlight-scheduling

reader-transport-state-machine
  -> reader-windowing-highlight-scheduling
  -> active-processing-performance-gates

reader-windowing-highlight-scheduling
  -> active-processing-performance-gates

quick-listen-promotion-crosswalk
  -> design-real-world-reader-evidence

active-processing-performance-gates
  -> design-real-world-reader-evidence
```

# Cap check

Existing active issues: **1**

Proposed new issues: **17**

Active issue count if all proposed issues are created: **18**

Remaining capacity under cap: **2**

This respects the `<=20` active issue cap.

# Final agreement marker

`AGREED LINEAR BATCH`
