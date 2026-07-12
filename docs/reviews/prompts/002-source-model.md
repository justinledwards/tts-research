You agreed at the product/market-fit layer with `AGREEMENT CANDIDATE`:

TTS-Research should be a serious ASAP read-along platform for long-form and messy sources, differentiated by early safe reading, durable resume, explicit provenance/confidence, honest sync degradation, and recoverable partial extraction—not by voice count, studio tooling, or broad-format claims alone.

Answers to your pressure-test questions:

1. First-release breadth vs excellence:
   - Yes: the first implementation batch may focus on excellence for pasted text, URLs/clean HTML/Markdown, and one long-form book/document path.
   - But the architecture must stay source-neutral from day one: PDF/OCR/DOCX/EPUB must fit the same contracts and evidence gates, even if they reach best-in-class sequentially.
   - We should not claim all formats are best-in-class until each has evidence.

2. Sync fallback honesty:
   - Yes: phrase/block fallback must be prominent when word-level alignment is not trustworthy.
   - The UI must never visually lie about exact word sync.
   - Confidence/provenance should drive whether read-along shows word, phrase, block, or source-only progress.

3. Quick Listen vs durable projects:
   - Durable project reading is primary for `Design for the Real World`-style serious use.
   - Quick Listen should be the fastest capture/start path, but it must be promotable into durable project state without losing source, generated artifacts, progress, or repair history.

4. Local-first:
   - Local-first is strategic: privacy, offline-capable partial artifacts, reproducible evidence, and provider substitution matter.
   - The architecture should remain provider-pluggable, but local artifacts/state are first-class product guarantees.

Now continue the planned sequence.

Focus of this prompt: Source ingestion and Content IR contract for books/docs/web/OCR/paste.

Attachment context is still the same archive from the previous turn (`tts-research-chatgpt-adc8d07.zip`, SHA256 `ac7b61be37079609a24cceeeb958a6d780f03373a83e170e0c61893540e9c182`). Treat it as current implementation truth.

Required output:

# Source-model verdict
- State whether the existing source model / Content IR direction is adequate for the agreed product wedge.
- Identify the top 3 source-model blockers to ASAP read-along + durable resume.

# Canonical source contract
Define the minimal source-neutral contract needed for every source type:
- pasted text / Markdown;
- URL / HTML;
- EPUB / books;
- PDF;
- DOCX;
- image/OCR batches;
- existing project/prepared sources.

For each, state required fields for structure, provenance, confidence, stable IDs, selectable reading units, extraction state, and recoverable errors.

# Partial extraction model
Define how partial source extraction should work so read-along can begin early without corrupting durable state.
Include:
- when a block/section becomes readable;
- when it becomes narratable;
- when it becomes alignable;
- how later extraction corrections update or supersede existing blocks;
- how to keep resume/progress valid after source changes.

# Adapter quality tiers
Propose source adapter quality tiers and gates, including what UX each tier permits or forbids.
Example: exact word spans vs paragraph/block only vs OCR uncertain.

# API/data model implications
Recommend high-level backend/front-end schema/module changes only where needed.
Do not produce implementation code.

# Risks / anti-goals for source ingestion
List what should stay out of the first <=20 issue batch.

# Agreement candidate
End with either `AGREED SOURCE MODEL` or `NOT AGREED`.
If agreed, provide the source-model direction to carry into the ASAP read-along pipeline discussion.
If not agreed, state the blocking change.

# Pressure-test questions
Ask only questions that materially change architecture direction and are not answerable from the archive or answers above.