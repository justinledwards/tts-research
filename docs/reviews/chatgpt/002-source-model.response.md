# Source-model verdict

The existing **Content IR direction is adequate as the foundation**, but the existing **source model is not yet adequate as the operational model** for the agreed wedge.

The good news: `content-ir.v1` is already source-neutral in shape. It explicitly covers Markdown, HTML, EPUB, PDF, DOCX, and OCR/image locators, and each node already carries display text, normalized text, speech text, provenance, UI hints, speech metadata, warnings, confidence, rights, and adapter version (`docs/contracts/content-ir.md:12-27`; `backend/internal/contentir/schema/content-ir.v1.schema.json:63-85`, `284-531`). The locator envelope contract also points in the right direction for durable resume: source ID, node ID, active word index, internal locator, optional Readium locator, and text quote fallback (`docs/contracts/locators.md:13-25`; `backend/internal/contentir/schema/locator-envelope.v1.schema.json:1-18`).

The bad news: the implementation still behaves like a **whole-source import that eventually produces a finished IR**, not like a **partial, revisable, durable source lifecycle**. `CreateBookSourceWithOptions` runs extraction synchronously and only writes metadata and Content IR after the adapter returns (`backend/internal/pipeline/book_sources.go:82-153`). The book adapter runners execute CLI adapters synchronously and require a complete non-empty document (`backend/internal/pipeline/book_adapters.go:196-303`). Temporary sources likewise fetch/read/preprocess the full source before creating durable artifacts (`backend/internal/pipeline/temporary_sources.go:76-220`). That blocks ASAP read-along for long or messy sources.

## Top 3 source-model blockers

**1. Whole-source extraction is the commit boundary.**
The current system does not have a durable “partial source manifest” where early blocks/pages/chapters can become readable, narratable, and alignable before the whole source is extracted. Content IR exists as a finished document artifact; book and temporary flows are not yet built around incremental unit commits.

**2. Stable source identity is too weak for correction and resume.**
Several adapters generate IDs from order or local index: Markdown uses `block-####` (`adapters/markdown/emit_ir.js:33-56`), DOCX uses `docx-p####` (`adapters/docx/emit_ir.js:183-224`), PDF creates IDs like extractor/kind/index (`adapters/pdf/orchestrator.py:263-339`), and shared IR helpers fall back to positional IDs (`adapters/shared/ir.js:140-228`). These are acceptable for fixtures, but not enough for durable resume across extraction corrections, OCR retries, source edits, or adapter upgrades.

**3. Extraction state and quality are not first-class per reading unit.**
The schema has node confidence and warnings, and PDF has richer extraction provenance including extractor, support tier, step, and confidence (`backend/internal/contentir/schema/content-ir.v1.schema.json:221-248`; `adapters/pdf/orchestrator.py:304-315`). But there is no source-neutral per-unit lifecycle like `discovered`, `readable`, `narratable`, `alignable`, `superseded`, `needsRepair`, or `staleAudio`. Current readiness is mostly whole-source state (`backend/internal/pipeline/models.go:356-390`; `backend/internal/pipeline/source_readiness.go:9-94`). That is too coarse for ASAP read-along and honest degradation.

# Canonical source contract

The platform should treat every source as a **source lifecycle envelope** plus one or more **Content IR revisions**. `content-ir.v1` should remain the finalized/exportable node contract for now. Do not jam every partial state into `content-ir.v1`; the schema is intentionally strict (`additionalProperties: false` at document and node levels in `backend/internal/contentir/schema/content-ir.v1.schema.json:5-7`, `63-66`). Add source-neutral sidecars for lifecycle, partial extraction, quality, and revision mapping.

## Minimal source-neutral contract

Every source type needs these fields, regardless of origin:

| Area                     | Required fields                                                                                                                                                                                       |                                                                                              |                                                        |      |                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---- | ---------------------------------------------------------------------------------------------- |
| Source identity          | `sourceId`, `sourceOwner: project                                                                                                                                                                     | temporary`, `projectId`or`temporarySourceId`, `sourceType`, `sourceName`, `originKind: paste | url                                                    | file | prepared`, `mimeType`, `contentHash`, `createdAt`, `updatedAt`, `adapterId`, `adapterVersion`. |
| Revision identity        | `sourceRevisionId`, `baseRevisionId`, `revisionReason`, `contentIrVersion`, `artifactCompatibility`, `supersedesRevisionIds`.                                                                         |                                                                                              |                                                        |      |                                                                                                |
| Structure                | Ordered tree of `sections`, `blocks`, `pages`, `spineItems`, or equivalent; every unit has `nodeId`, `parentId`, `orderKey`, `kind`, `role`, `title?`, `depth?`, `scopeKey`, and `readingOrderIndex`. |                                                                                              |                                                        |      |                                                                                                |
| Text surfaces            | `displayText`, `normalisedText`, `speechText`, `language`, `script`, `dir`, `speakMode`, `speechPolicyHint`, resolved speech policy when available.                                                   |                                                                                              |                                                        |      |                                                                                                |
| Provenance               | Format-specific locator, source offsets where possible, `textQuote`, extractor chain, adapter step, original file/hash/URL, and repair provenance if manually edited.                                 |                                                                                              |                                                        |      |                                                                                                |
| Confidence               | Numeric `extractionConfidence`, `textConfidence`, `structureConfidence`, `locatorConfidence`, `speechConfidence`, plus derived `qualityTier`. Avoid only `high                                        | medium                                                                                       | low`; those can be labels derived from numeric fields. |      |                                                                                                |
| Selectable reading units | `canDisplay`, `canRead`, `canNarrate`, `canAlign`, `allowedHighlightLevels`, `preferredHighlightLevel`, `isPrefixStable`, `isFinalForRevision`.                                                       |                                                                                              |                                                        |      |                                                                                                |
| Extraction state         | Per-unit state: `pending`, `extracting`, `readable`, `narratable`, `alignable`, `blocked`, `needsReview`, `failed`, `superseded`, `stale`.                                                            |                                                                                              |                                                        |      |                                                                                                |
| Recoverable errors       | `errorCode`, `stage`, `severity`, `affectedUnitIds`, `retryAction`, `repairAction`, `details`, `preserveProgressHint`, `alternateCandidates?`.                                                        |                                                                                              |                                                        |      |                                                                                                |
| Resume/remap             | `stableFingerprint`, `previousNodeIds`, `supersedesNodeIds`, `supersededByNodeId`, `locatorEnvelope`, `sourceWordIds`, `textQuote`, `prefixQuote`, `suffixQuote`, fuzzy recovery hints.               |                                                                                              |                                                        |      |                                                                                                |
| Artifacts                | Pointers to partial/full Content IR, speech plan, audio segments, highlight maps, validation report, extraction report, repair patches, bookmarks/progress.                                           |                                                                                              |                                                        |      |                                                                                                |

## Per-source required contract

### 1. Pasted text / Markdown

| Requirement        | Contract                                                                                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Structure          | Document → headings, paragraphs, list items, blockquotes, code blocks, tables, frontmatter, footnotes, directives, skipped embedded content. Markdown already has semantic block extraction and warnings for unsupported constructs (`adapters/markdown/transform.js:112-223`, `523-545`). |
| Provenance         | Synthetic path such as `paste:<sourceId>` or file path; Markdown locator with `path`, `lineStart`, `lineEnd`, `columnStart`, `columnEnd`, `astPath`; source offsets and text quote. Current schema supports this (`backend/internal/contentir/schema/content-ir.v1.schema.json:386-413`).  |
| Confidence         | High text confidence for pasted text; structure confidence high for CommonMark; lower confidence for MDX/Myst/directives/tables/math/embedded nodes. Current Markdown adapter already varies confidence for directives and frontmatter (`adapters/markdown/emit_ir.js:132-140`).           |
| Stable IDs         | Do not rely on `block-####`. Use heading path + AST path + normalized text hash + source revision. Preserve IDs across harmless whitespace changes where possible.                                                                                                                         |
| Selectable units   | Paragraphs, headings, list items, blockquotes. Tables/code/math are selectable but may default to summarize, skip, or block-only narration depending on policy.                                                                                                                            |
| Extraction state   | `received → parsed → readable → narratable`; alignable only after speech plan/audio/timing.                                                                                                                                                                                                |
| Recoverable errors | Unsupported directive, unsafe embedded HTML, malformed table, frontmatter parse warning, skipped citation/footnote policy. These should affect units, not fail the whole source.                                                                                                           |

### 2. URL / HTML

| Requirement        | Contract                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structure          | Article/main/body root; headings, paragraphs, lists, tables, figures, captions, code, landmarks; preserve title, canonical URL, fetched URL, language, direction, and section tree. Current HTML extraction already searches for article/main roots and emits semantic blocks (`adapters/html/emit_ir.js:85-161`; `adapters/html/emit_ir_helpers.js:66-145`). |
| Provenance         | HTML locator with `href`, `fragment`, `textQuote`, `progression`; also record DOM path/html path, fetched timestamp, content hash, canonical URL, fetch status, and selector if supplied. Schema supports `href`, `fragment`, `textQuote`, `progression`, and optional `epubCfi` (`backend/internal/contentir/schema/content-ir.v1.schema.json:415-437`).     |
| Confidence         | Root-selection confidence, boilerplate-removal confidence, per-block text confidence, locator confidence. Body fallback should be visibly lower-confidence than article/main extraction.                                                                                                                                                                      |
| Stable IDs         | Prefer existing element IDs/fragments. If missing, use DOM path + normalized text hash + source content hash. Do not use fragile sequential IDs alone.                                                                                                                                                                                                        |
| Selectable units   | Semantic blocks and sections. Tables and code can be narratable only under explicit policy. Figures/images require alt/caption or become source-only/skipped units.                                                                                                                                                                                           |
| Extraction state   | `fetched → parsed → readable`; `narratable` after speech policy resolves; `alignable` after audio/timing.                                                                                                                                                                                                                                                     |
| Recoverable errors | Fetch failure, unsafe URL, empty readable article, clutter/body fallback, changed content hash, missing alt text, table flattening warning.                                                                                                                                                                                                                   |

### 3. EPUB / books

| Requirement        | Contract                                                                                                                                                                                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structure          | Package metadata, spine order, manifest item, nav/TOC, chapters/sections, frontmatter/body/backmatter/appendix roles. The current EPUB adapter traverses manifest/spine/nav and emits section metadata (`adapters/epub/emit_ir.js:30-151`, `350-362`).                                                            |
| Provenance         | EPUB locator with `href`, `fragment`, `spineId`, `textQuote`, `progression`, and CFI when reliable. Current EPUB locator supports these fields, but current CFI is best-effort and warns accordingly (`backend/internal/contentir/schema/content-ir.v1.schema.json:439-465`; `adapters/epub/emit_ir.js:175-218`). |
| Confidence         | High for valid XHTML spine text; separate confidence for TOC/nav quality, CFI reliability, media overlay reliability, and section role classification.                                                                                                                                                            |
| Stable IDs         | Spine item href + manifest ID + element fragment or structural path + normalized text hash. Do not depend only on generated href slug/local index.                                                                                                                                                                |
| Selectable units   | Chapter, section, paragraph/list item/block. Avoid one giant chapter-as-node for read-along; legacy conversion can use chapters, but the reader needs block-level units.                                                                                                                                          |
| Extraction state   | Per spine item: `queued → extracting → readable`. Per block: `readable → narratable → alignable`. Later spine items must not block early chapters.                                                                                                                                                                |
| Recoverable errors | Missing spine item, unreadable XHTML, broken nav, missing fragment, unreliable CFI, media overlay mismatch, unsupported embedded resource.                                                                                                                                                                        |

### 4. PDF

| Requirement        | Contract                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structure          | Document → pages → blocks/lines/tables/figures/captions; optional outline-derived sections; reading order index; table/figure regions. The PDF adapter already classifies support tiers A-E and emits page/layout/table/OCR metadata (`adapters/pdf/orchestrator.py:117-142`).                                                                                            |
| Provenance         | PDF locator with `pageIndex`, `bbox`, `polygon`, `readingOrderIndex`, `textQuote`, extractor chain, support tier, extraction step, and confidence. Schema supports page/bbox/polygon/reading order (`backend/internal/contentir/schema/content-ir.v1.schema.json:466-489`), and current PDF nodes include extraction provenance (`adapters/pdf/orchestrator.py:304-315`). |
| Confidence         | Separate confidence for text extraction, reading order, OCR, table parsing, and locator precision. PDF support tier is adapter evidence, not automatically a UX permission.                                                                                                                                                                                               |
| Stable IDs         | File hash + page index + region geometry + reading order + normalized text hash. If text changes after OCR/repair, preserve region anchor and create a new revision/supersession.                                                                                                                                                                                         |
| Selectable units   | Page, block, paragraph-like region, table region, figure caption. Exact word selection only when word spans and timing both validate.                                                                                                                                                                                                                                     |
| Extraction state   | Per page: `queued → extracting → readable`. Per block: `readable` once text/geometry/order are stable enough; `narratable` when speech text and policy are resolved; `alignable` only after timing validation.                                                                                                                                                            |
| Recoverable errors | Missing OCR tool, scanned page, low OCR confidence, uncertain reading order, table flattening, duplicated headers/footers, hyphenation/split-word uncertainty. These should degrade affected pages/blocks, not poison the whole document.                                                                                                                                 |

### 5. DOCX

| Requirement        | Contract                                                                                                                                                                                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structure          | Paragraphs, headings, lists, tables, comments, footnotes, endnotes, images/alt text, bookmarks, relationships, sections. The DOCX adapter already extracts many of these surfaces (`adapters/docx/emit_ir.js:28-108`, `110-140`).                                                             |
| Provenance         | DOCX locator with `paragraphIndex`, `runIndex`, `bookmarkId`; also preserve style ID, numbering/list info, relationship IDs, note/comment IDs, and source file hash. Schema supports paragraph/run/bookmark locators (`backend/internal/contentir/schema/content-ir.v1.schema.json:490-507`). |
| Confidence         | High for plain paragraphs/headings; medium for tables, notes, comments, images/alt text; lower when bookmark/relationship provenance is missing.                                                                                                                                              |
| Stable IDs         | Bookmark ID if present; otherwise paragraph structural path + style/list signature + normalized text hash. Avoid plain `docx-p####` as the durable ID.                                                                                                                                        |
| Selectable units   | Paragraphs, headings, list items, tables, notes, comments, images with alt text. Comments/endnotes should be reviewable and policy-controlled, not blindly narrated.                                                                                                                          |
| Extraction state   | `unzipped → document.xml parsed → readable`; `narratable` after policy decides notes/comments/tables/images; `alignable` after audio/timing.                                                                                                                                                  |
| Recoverable errors | Missing `document.xml`, unsupported embedded object, broken relationship, table flattening, missing image alt text, unresolved note/comment reference.                                                                                                                                        |

### 6. Image / OCR batches

| Requirement        | Contract                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structure          | Batch → image/page → regions/blocks/lines/words where available; reading order; rotation/skew/language metadata. PDF image handling and OCR locator support already exist, but need a first-class batch model rather than treating every image as an opaque file (`adapters/pdf/orchestrator.py:117-142`; `backend/internal/contentir/schema/content-ir.v1.schema.json:508-531`). |
| Provenance         | OCR locator with `pageIndex`, `polygon`, `ocrEngine`, `ocrConfidence`; also image hash, file name, dimensions, rotation, preprocessing step, and text quote.                                                                                                                                                                                                                      |
| Confidence         | OCR confidence at word/line/block/page level; reading-order confidence; language/script confidence. Low OCR confidence must directly restrict read-along mode.                                                                                                                                                                                                                    |
| Stable IDs         | Image hash + page index + polygon/region cluster + normalized text hash. Manual correction should supersede text while preserving the region anchor.                                                                                                                                                                                                                              |
| Selectable units   | Page, block, line. Word selection only if OCR word boxes and timing are both reliable; otherwise phrase/block/source-only.                                                                                                                                                                                                                                                        |
| Extraction state   | Per image/page, not whole batch: `queued → OCR running → readable/reviewable → narratable`. Failed pages remain visible and retryable.                                                                                                                                                                                                                                            |
| Recoverable errors | OCR unavailable, unreadable image, low confidence region, skew/rotation uncertainty, unsupported language/script, empty page, duplicate page.                                                                                                                                                                                                                                     |

### 7. Existing project / prepared sources

| Requirement        | Contract                                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structure          | Preserve existing prepared source blocks, section labels, narration blocks, policy state, and generated artifacts. Current `PreparedSource` and `NarrationBlock` models carry blocks, spoken text, confidence, segments, warnings, and metadata, but not explicit source-neutral provenance on each block (`backend/internal/pipeline/models.go:443-467`, `494-534`). |
| Provenance         | If original provenance exists, preserve it. If not, create synthetic provenance such as `prepared:<sourceId>` using Markdown-like line/offset locators or a future prepared-source locator. Record preparation timestamp, policy version, and repair history.                                                                                                         |
| Confidence         | Manual/authored text can be high confidence; migrated or derived text should retain extraction confidence from the original source. Do not upgrade confidence just because it is already in a project.                                                                                                                                                                |
| Stable IDs         | Preserve existing block IDs when they are known stable; otherwise add stable fingerprints and a revision map.                                                                                                                                                                                                                                                         |
| Selectable units   | Existing narration blocks become selectable reading units if they can be mapped to display/speech/provenance. Blocks with missing provenance are narratable but not eligible for exact source resume until repaired or mapped.                                                                                                                                        |
| Extraction state   | `migrated → readable`; `narratable` if speech text/policy exists; `stale` if source text, policy, or artifacts diverge.                                                                                                                                                                                                                                               |
| Recoverable errors | Missing provenance, stale speech plan, orphaned audio artifact, policy mismatch, block deleted but progress points to it.                                                                                                                                                                                                                                             |

# Partial extraction model

The platform needs a durable partial extraction model separate from final Content IR. The rule should be: **append early, revise explicitly, never silently mutate durable reading position.**

## 1. When a unit becomes readable

A block/section/page becomes **readable** when the adapter can emit:

* stable-enough `nodeId` or provisional ID plus `stableFingerprint`;
* `orderKey` that will not require renumbering prior units;
* `displayText` and `normalisedText`;
* format-specific locator or explicit `locatorUnavailable`;
* extraction confidence;
* extraction state;
* warnings/errors scoped to that unit.

Readable does **not** mean narratable. A low-confidence OCR region may be readable as source text but still require review before narration. A PDF table may be readable but only as a block/table region, not as word-level text.

## 2. When a unit becomes narratable

A unit becomes **narratable** when it has:

* stable `speechText`;
* language/script/direction;
* speech policy hint and resolved policy;
* speak/skip/summarize mode;
* enough confidence to synthesize without misleading the user;
* no blocking rights, extraction, or safety error.

Narratable units can enter the speech plan before the full source is done. This matches the existing `speech-plan.v1` direction: the plan is source-scoped, only speakable segments are included, and skipped nodes remain in Content IR rather than disappearing (`docs/contracts/speech-plan.md:1-27`).

## 3. When a unit becomes alignable

A unit becomes **alignable** only after audio/timing artifacts exist and the system can map audio time back to source at a declared level.

Required fields:

* `sourceId`;
* `sourceRevisionId`;
* `scopeKey`;
* `nodeId`;
* `generatedAudioId`;
* `speechPlanId`;
* `contentIrVersion`;
* `timingLevel: word | phrase | sentence | block`;
* timing source;
* confidence;
* fallback mode;
* drift budget;
* warnings.

The highlight-map v2 schema already has most of this shape: timing levels, timing sources, fallback modes, confidence, drift budget, degraded state, source locator, node ID, source word ID/index, and traceability (`backend/internal/contentir/schema/highlight-map.v2.schema.json:7-19`, `77-96`, `140-156`, `216-246`, `286-307`, `358-360`). The missing piece is making this eligibility flow from source extraction quality, not merely from timing generation.

## 4. How corrections update or supersede blocks

Corrections must use revision semantics:

* **Metadata-only correction:** same `nodeId`, new `sourceRevisionId`, artifact compatibility preserved if display/speech text and locator did not materially change.
* **Text correction with same source anchor:** same canonical unit identity may remain, but audio/timing artifacts for that unit become stale. Store prior text quote/fingerprint and create a remap entry.
* **Split/merge/reorder correction:** create new node IDs; old nodes get `supersededBy`; new nodes get `supersedes`. Resume maps by stable locator/fingerprint/text quote before falling back to elapsed audio time.
* **Insertion before current progress:** use sparse/rational/string `orderKey` so earlier unit IDs do not get renumbered.
* **Deletion:** keep a tombstone/remap record long enough to recover progress and explain the repair.

Do not silently edit a node that already has audio/progress. That is how durable resume becomes untrustworthy.

## 5. Keeping resume/progress valid after source changes

Progress should store a locator envelope, not just elapsed time:

* `sourceId`;
* `sourceRevisionId`;
* `nodeId`;
* `scopeKey`;
* `activeWordIndex` or `sourceWordId`;
* internal locator;
* optional Readium locator;
* text quote;
* audio artifact ID;
* elapsed time fallback.

On reopen:

1. Resolve exact `sourceRevisionId` and `nodeId`.
2. If superseded, follow revision map.
3. If the node ID fails, resolve by locator.
4. If locator fails, recover by text quote/fingerprint inside the same section/page/spine item.
5. If only audio elapsed time is recoverable, resume with a visible degraded state: block/source-only progress, not exact word sync.

This is consistent with the existing locator-envelope fallback direction (`docs/contracts/locators.md:13-25`) and the existing highlight map’s degraded/fallback model (`backend/internal/contentir/schema/highlight-map.v2.schema.json:86-96`, `140-156`).

# Adapter quality tiers

Keep **source adapter quality tiers** separate from **source-specific extraction support tiers**. PDF support tier A-E is evidence about extraction strategy; it should not automatically grant word-level UI. The UX gate should be source-neutral.

| Tier                                 | Meaning                                                                                           | Required evidence                                                                                                                                 | UX permitted                                                          | UX forbidden                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| Tier 0: Failed / unsupported         | No reliable readable units.                                                                       | Import failed or zero readable units.                                                                                                             | Show failure, retry, adapter diagnostics, alternate import path.      | No narration, no read-along claim.                              |
| Tier 1: Source-visible / review-only | Some text/structure visible, but confidence/provenance too weak for narration by default.         | Unit text exists, but locator/order/text confidence is low or incomplete.                                                                         | Display extracted source, mark warnings, allow repair/confirm.        | No autoplay narration; no word/phrase highlighting.             |
| Tier 2: Narratable block             | Text and speech policy are reliable enough for audio, but source-to-audio traceability is coarse. | Stable block IDs, speech text, policy, block locator, acceptable extraction confidence.                                                           | Synthesize audio; show block/page progress; resume to block.          | Exact word highlight; phrase highlight unless timing validates. |
| Tier 3: Phrase/sentence alignable    | Timing and source mapping are good enough for phrase/sentence read-along.                         | Valid speech plan, audio, phrase/sentence timing, locator envelope, confidence above threshold.                                                   | Phrase/sentence highlight with visible fallback/confidence indicator. | Exact word highlight.                                           |
| Tier 4: Word-sync eligible           | Source tokens, spoken tokens, locators, and timing validate.                                      | Source word IDs or reliable word spans, timing confidence, drift budget, no stale artifacts, highlight map primary level `word`, fallback `none`. | Word highlight, word resume, precise scroll following.                | Hiding confidence/degradation.                                  |
| Tier 5: Authored/native sync         | Source ships reliable sync or provider timing validates strongly.                                 | EPUB media overlays or provider-native word marks plus validation.                                                                                | Same as Tier 4, with native-sync label if useful.                     | Trusting native timing without validation.                      |

Recommended thresholds for v0/v1 evidence gates:

* Tier 2: block extraction confidence roughly `>=0.65`, stable locator, no blocking error.
* Tier 3: timing confidence roughly `>=0.75`, phrase/sentence drift within declared budget, fallback mode explicit.
* Tier 4: source/timing confidence roughly `>=0.85`, no stale audio, no unresolved text correction, word drift within benchmark budget, wrong-node/stale-highlight count zero.

These numbers should become product gates, not marketing claims. If the source fails the gate, the UI must downgrade to phrase, block, or source-only progress.

## Mapping examples

* Clean pasted Markdown: likely Tier 3 quickly; Tier 4 only after timing validates.
* Clean article HTML: Tier 2/3 by default; Tier 4 if DOM/text identity and timing validate.
* EPUB with stable XHTML spine: Tier 3; Tier 4 if token mapping and timing pass; Tier 5 only for validated media overlays.
* Tagged PDF: possibly Tier 3/4, but only after reading-order and token-span validation.
* Born-digital PDF: Tier 2/3 by default; Tier 4 should be earned.
* Scanned PDF or image OCR: Tier 1/2 by default; Tier 3 only for high-confidence OCR; Tier 4 should be rare.
* DOCX: Tier 2/3 for normal paragraphs; tables/comments/images likely lower unless policy and extraction validate.
* Prepared project source: Tier 2/3 if provenance is synthetic but stable; Tier 4 only if source-word identity exists.

# API / data model implications

## Backend

**Add a source lifecycle envelope.**
This should be the durable object that unifies project sources and Quick Listen temporary sources. The existing temporary-source model already has useful lifecycle ideas and artifact kinds (`backend/internal/pipeline/models.go:229-292`, `811-850`), but it should become source-neutral rather than temporary-source-specific.

The envelope should expose:

* source identity and owner;
* source revision;
* extraction phase;
* per-unit readiness;
* quality tier;
* partial artifact pointers;
* recoverable errors;
* promotion state for temporary → project;
* progress/bookmark compatibility.

**Add a partial extraction manifest.**
A source can have zero or more manifests:

* `source-manifest.v1`: current unit list, phases, quality, artifact pointers.
* `source-revision-map.v1`: supersession/remap/tombstones.
* `adapter-quality-report.v1`: adapter capabilities, warnings, confidence, support tier.
* `content-ir-fragment` or `content-ir-delta`: units emitted before final Content IR.

**Keep `content-ir.v1` as the finalized contract for now.**
Do not prematurely create `content-ir.v2` just to model pipeline state. Use sidecars and `metadata` for compatibility. Move to v2 only when source-word IDs, revision identity, or unit lifecycle need to become schema-required rather than sidecar-governed.

**Adapter runner should stream units.**
Current CLI adapters return whole documents. The next architecture step should introduce an adapter interface that can emit:

* source started;
* section/page/spine discovered;
* unit readable;
* unit narratable;
* unit failed;
* unit superseded;
* source finalized.

The initial implementation can fake this for simple sources, but the contract must be incremental from day one.

**Add a quality gate evaluator.**
The evaluator decides what the UI may claim: source-only, block progress, phrase highlight, word highlight. It should combine extraction confidence, locator confidence, speech-plan state, timing confidence, fallback mode, and artifact freshness.

## Frontend

**Use one source store for project and Quick Listen.**
Quick Listen should not maintain a separate mental model. It can be the fastest capture route, but once captured, it should produce the same source envelope, unit states, artifacts, progress, repair history, and promotion path.

**Render partial source units.**
The reader should be able to show a stable prefix while later units are still extracting. Each unit needs visible state: extracting, ready, narrating, degraded, failed, repaired, stale.

**Gate read-along UI by quality tier.**
The reader should not have a global “word highlight on/off” assumption. It should ask the source/timing state what levels are allowed for the current unit.

**Resume from locator envelope first.**
Elapsed audio time is fallback, not primary resume state.

# Risks / anti-goals for source ingestion

Do not let the first issue batch turn into “support every format fully.” The first batch should establish the contract and prove it on pasted/Markdown, clean URL/HTML, and one long-form path.

Keep these out of the first `<=20` active issue batch:

* Full best-in-class PDF, DOCX, EPUB, OCR parity at once.
* Full PDF table editor.
* OCR correction workbench.
* DRM, Kindle, Apple Books, or locked ebook ingestion.
* Browser extension.
* Cloud sync, accounts, collaboration, sharing.
* AI chat, summarization, quizzes, notes, or study assistant features.
* New TTS providers or voice-cloning improvements.
* Full Readium integration beyond locator compatibility/resume needs.
* Perfect EPUB CFI implementation unless required for durable local resume.
* Full DOCX track-changes/comment review workflow.
* Visual source-layout debugger.
* Image annotation editor.
* Complex import wizard redesign.
* Command Palette expansion.
* Premium temporary-source shelves or analytics.
* New source types beyond the agreed first proof set.

The first source-ingestion batch should be contract-heavy and format-light: source envelope, partial manifest, revision/remap model, quality gates, project/temporary unification, and one long-form adapter proving the model.

# Pressure-test questions

1. For the first long-form proof path, should the product choose **EPUB/structured HTML** or **born-digital PDF**? My recommendation is EPUB/structured HTML first because it proves sections, locators, progress, and partial narration without OCR/layout noise. If the wedge must prove “messy documents” immediately, choose born-digital PDF instead and accept a slower, riskier first batch.

2. Should user repairs be modeled as **immutable extraction + repair overlay**, or as direct mutation of the extracted source? I strongly recommend immutable extraction plus overlay. Direct mutation is simpler initially but makes provenance, resume, artifact staleness, and reproducible evidence worse.

3. Are we willing to make **stable reading-unit identity** more important than preserving exact adapter-emitted order when later extraction corrections insert or reorder units? If yes, use sparse/order-key insertion and revision maps. If no, resume will be more fragile after repairs.

# Agreement candidate

Carry this into the ASAP read-along pipeline discussion: **Content IR v1 remains the stable finalized node contract, but the product needs a source-neutral lifecycle envelope, partial extraction manifest, per-unit quality/readiness states, and revision/remap sidecars. Every adapter must emit stable, provenance-bearing reading units that can independently become readable, narratable, and alignable. UI read-along fidelity must be gated by source and timing evidence, not by feature ambition.**

`AGREED SOURCE MODEL`
