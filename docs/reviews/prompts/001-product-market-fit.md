You are a skeptical senior product+architecture partner inside the ChatGPT project `TTS-Research`.

This is an architecture/product discussion prompt, not a code-review prompt. Pressure-test and challenge assumptions; do not merely agree.

Attachment: `tts-research-chatgpt-adc8d07.zip`
Archive SHA256: `ac7b61be37079609a24cceeeb958a6d780f03373a83e170e0c61893540e9c182`
Treat the attached archive as the source of current implementation truth. It includes repo source, product/review docs, Linear setup docs, and committed complete-UI screenshots across phone/constrained desktop/desktop/large desktop and source surfaces.

Context correction:
- The ChatGPT project is `TTS-Research`.
- `Design for the Real World` is a Voice Studio project inside the TTS-Research app, not a ChatGPT project.
- Use `Design for the Real World` as the target in-app project/source context for product and architecture reasoning.

Product north star:
TTS-Research should become a best-in-class TTS aid for reading along with any reasonable source: pasted text, URLs, PDFs, EPUB/books, DOCX/documents, image/OCR batches, and project-local prepared sources.

Non-negotiable user outcomes:
1. ASAP read-along: from starting generation of any source, the user can read along as soon as possible, before whole-source processing finishes when safe.
2. Durable resume: the user can leave the page, reopen it, and resume from where they left off: source, audio/progress, active block/word, selected mode, partial artifacts, and repair state.
3. Responsive feel: navigation and controls remain interactive during ingestion, segmentation, synthesis, checking, and alignment.
4. Broad source excellence: source adapters emit explicit structure/provenance; partial/poor extraction is visible and recoverable.
5. Best-in-class UX: serious reading aid, not just a toy TTS generator.
6. Governance: Linear active issue cap is <=20. Do not recommend a sprawling issue backlog; recommend a capped first batch only after architecture agreement.

Discussion sequence planned after this prompt:
1. Product purpose, user jobs, market fit, and differentiation.  <-- this prompt
2. Source ingestion and Content IR contract for books/docs/web/OCR/paste.
3. ASAP read-along pipeline: source phases, streaming segments, partial manifests, read-along sync.
4. Resume/retry/state model across navigation, reloads, failures, and partial artifacts.
5. Responsiveness architecture: UI scheduling, worker split, cache boundaries, performance budgets.
6. Complete UI review across expected screen sizes and source types using screenshots.
7. Linear issue-batch review under <=20 active issues.

Required output for this prompt:

# Product / market-fit verdict
- State whether the north star is coherent, differentiated, and worth pursuing.
- Identify the strongest plausible wedge and the strongest plausible failure mode.

# User jobs and target segments
- Prioritize 3-5 user segments/jobs for v0/v1.
- Say which segments should be explicitly deferred.

# Best-in-class bar
- Define what "best-in-class TTS aid" means operationally for this product.
- Include concrete UX/performance/quality thresholds or user-observable standards where possible.

# Product architecture implications
- Identify architectural decisions implied by the product wedge.
- Explicitly call out what must be built into the platform vs. what can remain project/demo-specific.

# Risks / anti-goals
- List risks that could make the product slow, fragile, or unfocused.
- Name features that should *not* be in the first issue batch.

# Agreement candidate
- End with either `AGREEMENT CANDIDATE` or `NOT AGREED`.
- If `AGREEMENT CANDIDATE`, state the product direction you think should proceed to the source-model discussion.
- If `NOT AGREED`, state the blocking change needed before proceeding.

# Pressure-test questions
- Ask only questions that materially change product/architecture direction.
- Do not ask for facts visible in the archive.

Be direct, evidence-based, skeptical, and specific. Avoid generic praise.