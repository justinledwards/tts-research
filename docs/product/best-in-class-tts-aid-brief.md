# Best-in-Class TTS Aid Brief

Status: pre-issue architecture brief
Updated: 2026-07-07 00:53 CEST

## Product north star

TTS-Research should become a best-in-class TTS aid for reading along with any reasonable source: pasted text, URLs, PDFs, EPUB/books, DOCX/documents, image/OCR batches, and project-local prepared sources.

The critical user promise is: start reading along as soon as possible after generation begins, keep the page responsive while work continues, and let the user leave and later resume at the exact source/audio/progress position.

## Non-negotiable user outcomes

1. ASAP read-along
   - generation can start from any supported source;
   - first usable text/read-along surface appears before full source processing finishes when possible;
   - first playable audio appears from the earliest safe segment, not only after whole-source completion.
2. Durable resume
   - leaving/reopening preserves source, job, partial artifacts, playback progress, active block/word, selected mode, and repair state;
   - retries resume from validated reusable phases/segments instead of forcing full restart.
3. Responsive feel
   - navigation and controls remain interactive during ingestion, segmentation, synthesis, checking, and alignment;
   - expensive parsing/rendering/highlight work is off the critical interaction path or scheduled safely.
4. Broad source excellence
   - every source adapter emits explicit structure/provenance and a stable Content IR;
   - poor or partial extraction is visible and recoverable, not silently degraded.
5. Reviewable architecture
   - ChatGPT review packages must include source, architecture docs, Linear snapshot, and complete UI screenshots for phone, constrained desktop, desktop, and large desktop.

## Scope boundaries for first issue batch

- Linear active issue cap: 20.
- Do not create more Linear issues until ChatGPT architecture/product/UI discussions have converged to `AGREED ARCHITECTURE` or an explicit non-agreement/blocker is recorded.
- Prefer 10-20 large but focused issues over dozens of fine-grained tickets.
- Linear is execution source; ChatGPT threads are advisory architecture/review records; repo docs are durable design source.

## Required architecture discussion sequence

1. Product purpose, user jobs, market fit, and differentiation.
2. Source ingestion and Content IR contract for books/docs/web/OCR/paste.
3. ASAP read-along pipeline: source phases, streaming segments, partial manifests, and read-along sync.
4. Resume/retry/state model across navigation, reloads, failures, and partial artifacts.
5. Responsiveness architecture: UI scheduling, worker split, cache boundaries, and performance budgets.
6. Complete UI review across expected screen sizes and source types using committed screenshots.
7. Linear issue-batch review under the <=20 active issue cap.
