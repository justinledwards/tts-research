# Product / market-fit verdict

**Verdict:** The north star is coherent and worth pursuing, but it is **not differentiated by broad source support alone**. Current TTS reader products already claim broad import coverage: Speechify markets PDF/web/document reading and browser reading, ElevenReader lists PDFs, URLs, docs, and text, and NaturalReader advertises OCR plus PDF/Word/ePub/web support. Broad-format TTS is table stakes, not the wedge. ([Speechify][1])

The differentiated product is narrower and sharper: **trustworthy ASAP read-along for serious long-form sources**. That means the user can start reading from a source before the entire source/audio/alignment pipeline is done, can trust what was extracted, can see degraded extraction/sync instead of being misled, and can resume exactly after navigation or failure. The archive already points in this direction: the product brief names ASAP read-along, durable resume, responsive feel, broad source provenance, and visible partial failure as non-negotiables (`docs/product/best-in-class-tts-aid-brief.md:10-26`). The code also has relevant primitives: Content IR v1 with source locators/provenance (`docs/contracts/content-ir.md`, `backend/internal/contentir/*`), segment audio endpoints and partial audio manifests (`backend/internal/httpapi/voice_job_routes.go:226-261`, `backend/internal/pipeline/service.go:2560-2615`), persisted progress/session state (`backend/internal/pipeline/progress.go`), and performance budgets (`docs/performance.md:64-141`).

**Strongest plausible wedge:** readers of serious sources who need synchronized text/audio faster and more reliably than a generic “upload and listen” app: PDFs/books/articles/docs with structure, provenance, extraction confidence, repair states, and durable resume. Use `Design for the Real World` as the target in-app long-form source context to validate that wedge, not as a special-case demo.

**Strongest plausible failure mode:** TTS-Research becomes a dense “Voice Studio” toolkit with voice cloning, teleprompting, dashboards, policies, diagnostics, command palette, temporary-source management, and provider setup before it proves the first five minutes of reading are better than existing readers. The archive already shows this risk: many secondary surfaces exist, while the current generation path still optimizes/render-spoken-form over the whole input before segmentation (`backend/internal/pipeline/service.go:1240-1365`, `backend/internal/pipeline/service.go:1768-1828`), and Quick Listen file support is currently limited to lightweight text-ish files rather than the full PDF/EPUB/DOCX/image north star (`frontend/src/features/quick-listen/QuickListenPanel.tsx:66-68`).

# User jobs and target segments

**1. Serious long-form readers: researchers, students, professionals, and book/article readers.**
Primary v0/v1 job: “I have a long source; let me start reading with audio quickly, keep my place, and trust the source structure.” This is the best fit for `Design for the Real World`. It forces the architecture to handle chapters, sections, pages, locators, progress, and partial artifacts.

**2. Accessibility/read-along users who rely on synchronized visual/audio support.**
Primary job: “Keep my eyes and ears aligned without lying about word accuracy.” This segment justifies phrase fallback, reduced motion, keyboard support, exact resume, visible confidence, and repair. It also keeps the product from becoming just an audio exporter.

**3. Professional document reviewers: policy, legal, technical, research, enterprise knowledge work.**
Primary job: “Read this messy PDF/DOCX/web source, show me what was extracted, what was skipped, and where each spoken passage came from.” This makes provenance and extraction confidence a product feature, not an implementation detail.

**4. Quick Listen users with temporary sources.**
Primary job: “I want this pasted text or URL audible now without polluting project history.” This is a good activation wedge, but it should share the same source lifecycle, Content IR, progress, partial audio, and resume contracts as durable project sources. It must not become a parallel toy flow.

**Explicitly defer:** audiobook marketplace/library features, voice-cloning enthusiasm as the core value prop, podcast/audiobook production tooling, full screen-reader replacement, Kindle/DRM ingestion, LMS/admin workflows, multi-user collaboration, cloud sync, browser extension, AI chat/summarization/QA, rich note-taking, and broad language-learning curriculum. Some of these can exist later, but they should not define the first architecture batch.

# Best-in-class bar

“Best-in-class TTS aid” should mean the following operationally:

**ASAP read-along:** the user should see usable source structure and a read-along surface before full-source processing finishes whenever the adapter can safely emit prefix-stable structure. First playable audio should come from the earliest safe segment, not from a completed whole-document assembly. The existing partial audio manifest and segment audio endpoints are the right direction, but the source model must also become incremental; otherwise PDFs/books still wait on whole-source extraction and whole-input optimization.

**Durable resume:** reopening must restore source, job, partial audio, progress, active block/word or phrase, selected mode, repair state, and degraded state. The archive’s stated bar is exact source/audio/progress resume (`docs/product/best-in-class-tts-aid-brief.md:18-20`). The existing performance budget says reader resume should be `<=500ms`, with a stable restoring state after `250ms` and degraded fallback recorded when locator resume fails (`docs/performance.md:88`, `docs/performance.md:128-141`).

**Responsive feel:** app and reader controls must remain interactive during ingestion, segmentation, synthesis, checking, and alignment. Existing measurable budgets are a good baseline: app cold usable `<=2200ms`, source switch `<=1200ms`, studio route switch `<=600ms`, Book Cinema open `<=450ms`, transport interaction latency `<=850ms`, settings open `<=850ms`, and reader resume `<=500ms` (`docs/performance.md:64-101`). Treat these as product standards, not QA trivia.

**Read-along sync quality:** exact word highlighting should appear only when timing is trusted. Estimated or low-confidence timing should fall back to phrase/block emphasis. The existing benchmark thresholds are appropriately strict for a serious reader: median/p95 word drift `<=150ms`, phrase drift `<=350ms`, wrong node/word/stale highlight counts `0`, scroll jumps `0`, and degraded time `<=35%` (`benches/thresholds.json#readAlongSync`). If these cannot be met for a source, the UI should say so and degrade calmly.

**Source excellence:** every adapter output should carry stable structure, source locators, extraction provenance, confidence, warnings, and speech policy hints. The current Content IR contract already names Markdown, HTML, EPUB, PDF, DOCX, and OCR/image locators (`docs/contracts/content-ir.md:14-25`), and the PDF adapter already models tiered extraction, confidence, OCR, tables, and warnings (`adapters/pdf/orchestrator.py`). The product bar should be: no silent drops; low-confidence extraction is visible; skipped/poorly extracted content is reviewable; repair does not require re-importing the whole source.

**UX bar:** Read mode must be canvas-first and calm. Diagnostics, policy notes, debug overlays, and operator controls must be reachable but hidden by default. The archive already states this in the surface-complexity budget: Read mode is “calm,” diagnostics are hidden by default, and the command palette must not become a dumping ground (`docs/surface-complexity-budget.md:39-58`).

# Product architecture implications

The product wedge implies these platform decisions:

**Content IR must be a platform contract, not an adapter convenience.**
All source types need the same guarantees: stable node IDs, order keys, locators, provenance, confidence, warnings, speech text vs display text, and repair hooks. EPUB/PDF/DOCX/HTML/OCR differences belong inside adapter locators and metadata, not in separate UI paths.

**Source lifecycle must be unified across project and temporary sources.**
The archive’s temporary-source model is conceptually right: temporary sessions are siblings of project sources, not hidden projects (`docs/temporary-source-domain-model.md:3-12`). The shared platform object should be a `SourceLifecycleEnvelope` with ownership, readiness, phase state, partial artifacts, expiry/promotion if temporary, and durable progress if project-owned.

**ASAP pipeline needs source phases, not just audio phases.**
The current backend can expose partial audio once segments are ready, but the pipeline still largely assumes a complete text payload before segmentation. To fulfill the north star, ingestion must emit prefix-stable source units, speech units, and segment manifests early. Synthesis should consume the earliest safe segment while later pages/chapters/OCR/table extraction continue.

**Partial artifacts must be first-class durable state.**
Partial Content IR, speech plans, audio segments, timing artifacts, extraction warnings, and repair state must be persisted and addressable. Retrying should reuse validated phases/segments. The existing `AudioReadySegments`, `FirstPlayableAt`, segment WAVs, partial manifest, and persisted job metadata are good primitives; they need to become part of a whole-source artifact contract, not only job internals.

**The read-along sync spine must use canonical source identity.**
The handoff doc already identifies the correct direction: `audioTime -> sourceWordId -> rendered token`, replacing cue-local or segment-local ordinals (`docs/handoff/whole-app-followalong-sync-spine.md`). This should be platform infrastructure. Word index fallback is acceptable only as degraded compatibility.

**Responsiveness requires hard boundaries.**
PDF/OCR/EPUB/DOCX parsing, alignment, waveform decoding, Markdown/Mermaid rendering, diagnostics, and schema viewers must not sit on the initial reader path. The archive’s lazy-loading and bundle-budget rules are the right architectural posture (`docs/performance.md:7-25`).

**Platform vs project/demo-specific split:**

Platform-owned:

* Content IR schema and validators.
* Source adapter capability/diagnostic contracts.
* Source lifecycle and readiness model.
* Partial source/audio/timing manifests.
* Durable progress/bookmark/session model.
* Read-along sync provider and degraded-state model.
* Repair model and provenance-aware recovery.
* Performance budgets and screenshot evidence lanes.
* Temporary vs project ownership semantics.

Project/demo-specific:

* The `Design for the Real World` project content.
* Fixture names such as Kappa EPUB/DOCX or Born Digital PDF.
* Default project voice, policy pins, layout preferences, and demo copy.
* Screenshot fixtures and sample source choices.
* Any project-specific source curation.

Feature-specific but not wedge-critical:

* Teleprompt Theatre.
* Voice Profile Dashboard.
* Command Palette expansion.
* Premium temporary-source management.
* Project bundle import/export polish.
* Advanced diagnostics panels.

# Risks / anti-goals

**Risks that could make the product slow, fragile, or unfocused:**

* Treating “any source” as the first milestone instead of proving a small number of source types with excellent lifecycle behavior.
* Letting whole-source extraction block first read-along.
* Letting whole-input optimization block first synthesis segment.
* Diverging temporary Quick Listen from durable project sources.
* Overclaiming word sync when timing is estimated or low-confidence.
* Building a voice-studio product around voice cloning/provider choice instead of reading outcomes.
* UI density: too many visible modes, badges, settings, drawers, and debug surfaces in the reading path.
* Adapter inconsistency: PDF, EPUB, DOCX, HTML, OCR, and paste all emitting subtly different provenance and warning semantics.
* Local runtime fragility: heavy model/provider setup can undermine the “responsive reading aid” promise.
* Linear sprawl: the active issue cap is `<=20`, and the first batch should not include every ambition visible in the repo.

**Do not put these in the first issue batch:**

* New TTS provider integrations.
* Voice cloning quality improvements.
* Audiobook marketplace/library features.
* Browser extension or native mobile app.
* Cloud sync, accounts, collaboration, sharing.
* AI chat over documents, summaries, quizzes, or note-taking.
* Full EPUB CFI implementation beyond stable local resume needs.
* Full PDF table editor or OCR correction workbench.
* DRM/Kindle/Apple Books ingestion.
* Teleprompt redesign.
* Command Palette expansion beyond required recovery/navigation.
* Voice Dashboard expansion.
* Premium temporary-source shelves/settings/analytics.
* Visual redesign/theme work not required for readability.
* Large language-learning curriculum features.
* Export/import bundle polish unless needed for resume/recovery evidence.

# Pressure-test questions

1. Is the first release allowed to be **“excellent for pasted text, URLs, clean HTML/Markdown, and one long-form book/document path”**, while PDF/OCR/DOCX/EPUB are brought to the same bar sequentially? If not, the architecture must optimize for breadth before excellence, which increases risk sharply.

2. Is the product willing to show **phrase/block fallback prominently** instead of exact word highlighting when alignment is not trustworthy? If not, the sync architecture will be pressured to lie visually.

3. Should Quick Listen be the primary activation path, or should `Design for the Real World`-style durable projects be primary? The answer changes navigation, storage, resume, and promotion priority.

4. Is local-first a strategic differentiator or only a development/runtime convenience? If strategic, provider boundaries, offline partial artifacts, and local storage guarantees become product-critical.

# Agreement candidate

**AGREEMENT CANDIDATE**

Proceed to the source-model discussion with this narrowed product direction: **TTS-Research should be a serious ASAP read-along platform for long-form and messy sources, differentiated by early safe reading, durable resume, explicit provenance/confidence, honest sync degradation, and recoverable partial extraction—not by voice count, studio tooling, or broad-format claims alone.**

[1]: https://speechify.com/?srsltid=AfmBOopYjZaB892rhe4I3869kEfn10m1TNw9RhMGKGW9Ca6aBJOUYtkr&utm_source=chatgpt.com "Speechify: Text to Speech & Voice Typing AI Assistant | 60M+ ..."
