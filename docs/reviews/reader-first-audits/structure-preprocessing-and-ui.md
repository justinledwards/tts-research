# Structure preprocessing, narration UI, and app balance audit

Read-only audit captured 2026-07-10.

## Outcome

- Completed a read-only architecture/RCA at:
  - repo: `/home/phoenix/projects/repos/tts-research`
  - branch: `niklas/voice-studio-follow-up`
  - HEAD: `e97ff6f4932f4429939f1c278e1d4b8361ac6688`
  - remotes match `justinledwards/tts-research` / `niklas-olsson/tts-research`
- The worktree was already heavily dirty. Its porcelain-status hash remained unchanged before and after review: `3e40646020a053958783f81b9bd52af8d29cd4d6b2787a3ad108f19f08cbd150`.
- No files were created or modified.

## RCA: headings and document structure

### Structure is recognized only on selected ingestion paths

- Markdown headings become independent blocks in `backend/internal/pipeline/source_preps.go:1626-1636`, with heading/subheading kinds and pause metadata.
- Born-digital PDF heading inference exists in `adapters/pdf/extract_with_pymupdf.py:149-180`, but it:
  - examines only the first six blocks of each page;
  - uses a page-local median font size;
  - labels the first detected heading `heading` and every later one `subheading`;
  - resets hierarchy on every page;
  - does not infer actual heading level or section ancestry.
- The `pdftotext` fallback emits one body block per page (`extract_with_pymupdf.py:81-97`), losing all headings.
- OCR emits one body block per page/image (`ocr_with_ocrmypdf_or_tesseract.py:25-68`), so OCR headings cannot be recognized.
- Real scanned-PDF OCR is not implemented by this adapter: `extract_pdf` handles embedded fixture markers and otherwise raises an error even when OCR tools exist.
- PDF reading order is only a y-bucket/x sort (`layout_with_layoutparser_or_doctr.py:22-39`), without robust columns, running-header/footer removal, or document-zone analysis.

### The front-matter failure is architectural, not merely an OCR tuning problem

For noisy front matter such as the reported *Design for the Real World* pages, there is no document-level stage that can classify:

- cover/title/copyright/dedication/contents/body/back matter;
- repeated running headers, footers, page numbers, or publisher marks;
- isolated ornament/image captions;
- uncertain text requiring review versus safe narration.

`orchestrator.py:276-352` converts every extracted block directly into Content IR, and almost every non-bibliography/citation node receives `speechText` plus a `speak` policy. Low confidence only adds a warning; it does not quarantine or require review. The canonical source itself was not retained as a repo fixture, so the exact noisy pages could not be replayed from repository evidence.

### Structural semantics are then discarded before synthesis

- Content IR can preserve `kind`, `role`, node identity, parent ID, policy hints, and locators (`backend/internal/contentir/node.go:27-52`).
- PDF currently leaves every `parentId` empty and has no heading level/section path.
- `speechplan.BuildFromContentIR` emits one segment per speakable node (`backend/internal/speechplan/speech_plan.go:100-171`), which could isolate headings by node identity.
- However, `speech-plan.v1` segments do not carry node kind, heading level, structural boundary, or pause-before/after fields.
- `ssmlForNode` only uses `metadata.speechRender.ssml` or plain generic SSML (`speech_plan.go:336-360`); it ignores `Speech.PolicyHint.Emphasis`, `PauseBeforeMS`, and `PauseAfterMS`.
- The active prepared-source generation path bypasses that structural plan:
  - `CreatePreparedSourceJob` flattens selected blocks into `strings.Join(parts, "\n\n")` (`source_preps.go:543-578`);
  - synthesis reparses that flat text using `splitTextSegments` (`service.go:1829-1889`);
  - sentence pieces are coalesced until a rune budget is reached (`service.go:3288-3328`).
- Therefore a short heading followed by prose can become one synthesis segment. Block IDs, heading role, emphasis, and pause hints no longer control the audio boundary.
- `splitLongPiece` exists (`service.go:3370-3408`) but is not called by `splitTextSegments`, explaining the separate long-sentence progressive-playability defect.

**Primary root cause:** the system has two incompatible planning models—node-oriented Content IR/speech-plan artifacts and a legacy flattened-string job path. Structure survives preprocessing and UI rendering in some cases but is not authoritative at synthesis time.

## Target document/speech architecture

Prefer seam migration, not a schema-and-UI rewrite.

### 1. Extraction observations

Keep adapters responsible only for evidence:

- text, geometry, font/style signals, OCR confidence;
- page identity and reading-order candidates;
- extractor provenance;
- repeated-region fingerprints.

Suggested boundary: `adapters/* -> ExtractedDocumentObservations`.

### 2. Structure inference

Introduce a source-neutral backend module, e.g. `backend/internal/documentstructure`, that produces immutable structure annotations:

- `nodeId`, `kind`, `headingLevel`, `parentNodeId`, `sectionPath`;
- document zone: `frontMatter | body | backMatter`;
- narration disposition: `speak | skip | onDemand | reviewRequired`;
- confidence, reasons, detector version, and source locator;
- repeated-header/footer and page-number classifications.

Initially publish this as a revision-bound sidecar/overlay referencing Content IR node IDs. This avoids a big-bang `content-ir.v2` migration while preserving replayability and repair/supersession semantics.

Suggested preprocessing state machine:

```text
extracted
  -> structureInferring
  -> structureReady
  -> reviewRequired       (uncertain front matter/order)
  -> readableDegraded     (plain projection remains available)
  -> superseded           (new extraction/repair revision)
```

Low-confidence structure must never silently become ordinary speakable body text.

### 3. Canonical speech-unit planner

Add a single planner between structure/policy and synthesis:

```text
Content IR + structure overlay + policy + pronunciation rendering
  -> OrderedSpeechUnit[]
  -> bounded synthesis segments
```

Each `SpeechUnit` should carry:

- stable `unitId`, `nodeId`, source/revision identity;
- `kind`, `headingLevel`, section identity;
- plain text and SSML;
- hard boundary flags;
- pause/emphasis intent;
- locator/highlight mapping;
- policy decision and warnings;
- synthesis-input hash/reuse key.

Invariant: a speakable heading is exactly one speech unit and a hard synthesis boundary. It cannot merge with preceding or following prose. Long body units may split, but segments must retain the parent speech-unit identity.

Migrate `CreatePreparedSourceJob` and temporary/book-source job creation to consume these units. Remove flattened `strings.Join(parts, "\n\n")` planning only after parity tests pass.

## Narration-mode UI RCA and target

- `App.tsx` is 21,168 lines / 735,610 bytes and owns bootstrap, selection, narration, Cinema gating, playback, diagnostics, overlays, and surface composition.
- Narration mode explicitly mounts `LazyGlobalPreviewPlayer` (`App.tsx:10085-10139`).
- Visibility is deliberately enabled for narration Preview mode (`App.tsx:9577-9587`).
- `GlobalPreviewPlayer` labels normal narration “Preview Player” and its primary action “Audition” (`GlobalPreviewPlayer.tsx:226-289`).
- It computes partial queue availability but then requires terminal `playbackLifecycle === "ready"` (`GlobalPreviewPlayer.tsx:173-177`).
- `canOpenCurrentCinema` also requires terminal audio readiness (`App.tsx:4039`).
- This duplicates playback ownership and conflates narration with voice audition.

### Target surface ownership

- **Narration workbench:** source selection, structure/review status, voice/run settings, one primary `Start narration` action, progress/recovery status, and `Open Reader`.
- **Reader/Cinema:** the only regular narration transport, initially reading-only and upgraded in place as audio arrives.
- **Voice cloning/comparison:** the only owner of Preview/Audition and `GlobalPreviewPlayer`.
- Removing the preview player from Narration mode means removing the mount and state dependencies, not merely setting `hidden=true`.

Retain the existing independent state model from the responsive contract:

- Source session: summary → hydrating → readable / degraded / stale.
- Narration run: idle → accepted → queued → optimizing → synthesizing → checking → completed, with cancellation/failure branches.
- Playback: readingOnly → awaitingAudio → playable → playing/paused/buffering/ended.
- Sync fidelity: sourceOnly → audioOnly → phraseFollow → trustedWordFollow.
- Voice audition: separate preview-ID-based session only.

## Whole-app rebalancing

The dirty responsive architecture packet already correctly addresses most app-level work:

- `RSP-02`: true source-summary DTO and on-demand detail hydration.
- `RSP-03`: SourceSessionStore and source-ready Cinema.
- `RSP-06`: NarrationRunStore.
- `RSP-07`: one playback controller.
- `RSP-08`: Cinema-owned narration transport.
- `RSP-11`: isolate Preview/Audition.
- `RSP-12`: shell/bootstrap extraction and lazy boundaries.
- `RSP-13`: overlay/hit-test invariants.

Measured evidence already recorded in the dirty brief:

- prepared-source list: ~4.34 MB, with 99.33% avoidable detail;
- production main JS: ~254–260 KB gzip versus a 160 KB gate;
- CSS: ~21 KB gzip versus a 15 KB gate;
- initial development load: 250 requests / ~10.2 MB.

Target frontend boundaries:

- `features/app-shell`: providers, routing, top-level error boundaries only.
- `features/source-session`: summary/detail cache, revision pinning, stale-response protection.
- `features/narration-run`: run commands and sequenced server projection.
- `features/playback-session`: sole audio/controller owner.
- `features/sync-fidelity`: independent timing projection.
- `features/reader-session`: locator, reading mode, Cinema ingress.
- `features/voice-audition`: preview IDs and comparison UI.
- route-local loaders and feature-specific API clients instead of the 2,009-line global `api.ts`.

## Dependency-ordered PR slices

1. **Structure contract and fixtures**
   - Add structure-overlay/speech-unit contracts and adversarial fixtures.
   - Include noisy front matter, running headers, false large-font headings, multi-column pages, OCR uncertainty, and Markdown/EPUB parity.

2. **PDF/OCR observation quality**
   - Preserve line/span geometry and OCR confidence.
   - Implement real scanned-PDF OCR invocation and repeated-region evidence.
   - No narration behavior change yet.

3. **Document structure inference**
   - Add zone, hierarchy, confidence, and review-required decisions.
   - Emit immutable overlay bound to extraction revision.

4. **Canonical structure-aware speech planner**
   - Produce hard heading boundaries and structural pause metadata.
   - Add compatibility serialization while keeping current synthesis behind a flag.

5. **Prepared-source synthesis seam migration**
   - Replace flattened block text with ordered speech units.
   - Preserve node/unit IDs through job segments, artifacts, timing, and reuse keys.

6. **Narration surface simplification**
   - Stop mounting GlobalPreviewPlayer in narration mode.
   - Rename regular actions to narration terminology and route transport to Reader/Cinema.
   - Keep Preview/Audition unchanged in voice workflows.

7. **Summary/detail and source-session migration**
   - Implement the existing RSP-02/RSP-03 design before broad App extraction.

8. **Stores/controllers and App extraction**
   - Migrate run, playback, sync, and audition ownership.
   - Reduce `App.tsx` through characterization-first seams, then make it composition-only.

9. **Delete legacy ownership**
   - Remove flat-string planner, narration preview-player state, duplicate playback gates, and App-local mirrors only after parity and performance gates pass.

## Proposed issue reconciliation

Do not create a parallel architecture graph without re-gating the dirty, currently unauthorized RSP packet.

Recommended issue additions/changes:

1. **STR-01 — Freeze document-structure and isolated-heading contracts**
2. **STR-02 — Add canonical noisy-front-matter/PDF/OCR fixture corpus**
3. **STR-03 — Implement PDF/OCR observation and structure-inference seam**
4. **STR-04 — Build structure-preserving speech-unit planner**
5. **STR-05 — Migrate prepared/book/temporary synthesis to speech units**
6. **RSP-11 extension — Remove Preview/Audition from Narration mode**
7. **RSP-02/RSP-03 — Keep unchanged for payload/source ownership**
8. **RSP-12 extension — Extract route-local APIs and structure/narration orchestration**
9. **RSP-14 extension — Add structural narration and front-matter release evidence**

Because the existing packet caps itself at 15 issues and remains `peer_pending_not_authorized`, either fold STR-01 into RSP-01 and STR-04/05 into a split replacement for RSP-04, or explicitly re-open the issue-count/graph review. Do not silently broaden RSP-04; structural inference and bounded media segmentation are independently testable deliverables.

## Acceptance and tests

Required automated evidence:

- Golden adapter/overlay fixtures across Markdown, HTML, EPUB, born-digital PDF, scanned PDF, and images.
- Every recognized heading is one IR node, one speech unit, and one non-merged synthesis boundary.
- Heading pause/emphasis survives policy evaluation, SSML generation, segment publication, retries, and reuse.
- Low-confidence front matter is skipped/on-demand/review-required according to explicit policy, never silently spoken as body.
- Running headers, footers, and page numbers do not enter ordinary narration.
- Repair overlays preserve stable source/node identity and supersede rather than mutate active revisions.
- Narration mode contains no `global-preview-player`, “Preview Player,” or “Audition.”
- Voice-cloning/comparison still exposes Preview/Audition.
- Reader opens without audio and gains the same controller when the first segment arrives.
- Source list stays within the existing ≤64 KiB contract; detail hydrates only on selection.
- Visual evidence at 390, 1100, 1440, and 1920 px with zero action occlusions/hit-test interception.
- Existing bundle, main-thread, render-count, first-useful-shell, and interaction acknowledgement gates remain release-blocking.

## Verification

- PDF heading classifier focused test: passed.
- `go test ./internal/speechplan`: passed.
- `git diff --check`: passed.
- One initial Python test invocation failed because it was launched from `backend/`; rerunning from repository root passed.
- No direct *Design for the Real World* source artifact was available in the repository for replay.
