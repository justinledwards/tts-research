You agreed at the responsiveness layer with `AGREED RESPONSIVENESS ARCHITECTURE`:

Responsiveness should be achieved by keeping route/UI state narrow, moving source/read-along truth into manifest-scoped external stores, using source/manifest SSE events instead of whole-job snapshots, isolating playback/highlight from broad React renders, windowing large source documents, and degrading visibly under low resources rather than blocking or lying. Backend/local storage remains authoritative; frontend caches are narrow and disposable; diagnostics and heavy surfaces stay lazy.

Answers to your pressure-test questions:

1. Low-resource degradation:
   - Yes: low-resource mode may downgrade exact word highlighting to phrase/block highlighting for performance stability even when timing evidence technically permits word sync.
   - Stable controls and honest lower-fidelity sync beat jittery exact-word sync.

2. Backend CPU reservation:
   - Yes: when an active read surface is open, local-first runtime should cap synthesis/alignment/checking concurrency to reserve CPU/GPU headroom for the reader.

3. Virtualization/windowing:
   - Yes: use a small internal virtualization/windowing utility for the first EPUB/structured HTML proof path.
   - Source anchors, read-along spans, repair overlays, and resume locators are product-specific enough to justify internal first.

Now continue the planned sequence.

Focus of this prompt: Complete UI review across expected screen sizes and source types using the committed screenshots in the attached archive.

Attachment context is still the same archive from the previous turns (`tts-research-chatgpt-adc8d07.zip`, SHA256 `ac7b61be37079609a24cceeeb958a6d780f03373a83e170e0c61893540e9c182`). Treat it as current implementation truth. The archive includes `reviewer-screenshot-manifest.md` and committed screenshots for phone, constrained desktop, desktop, large desktop/taskbar, website/document/book/PDF/DOCX cinema/read-along surfaces, modes, menus, and failure states.

Required output:

# UI / screenshot verdict
- State whether the current UI direction can support the agreed best-in-class TTS aid direction.
- Identify the top UI blockers to ASAP read-along, durable resume, and responsive feel.

# Screen-size review
Review the expected screen-size classes:
- phone 390;
- constrained desktop 1100;
- desktop 1440;
- large desktop/taskbar 1920.

For each, call out what must be true for source reading, controls, progress/resume, and degradation states.

# Source-surface review
Review the expected source surfaces:
- Quick Listen / pasted text;
- website / HTML;
- EPUB / structured book;
- PDF;
- DOCX;
- image/OCR batches where currently visible or implied;
- existing project/prepared source, specifically `Design for the Real World` style durable project reading.

# Mode and state review
Pressure-test:
- read/review/debug/inspect modes;
- failure states;
- partial/unchecked/stale states;
- repair overlays;
- More menus / advanced diagnostics;
- teleprompt/theatre surfaces if relevant;
- source promotion from temporary to durable project.

# UI architecture implications
Recommend high-level UI architecture rules and component boundaries only where needed.
Do not produce implementation code.

# First-batch UI scope
List UI changes that belong in the first <=20 issue batch and UI changes that should be deferred.

# Agreement candidate
End with either `AGREED UI DIRECTION` or `NOT AGREED`.
If agreed, provide the UI direction to carry into the Linear issue-batch review.
If not agreed, state the blocking change.

# Pressure-test questions
Ask only questions that materially change architecture or issue batching and are not answerable from the archive or answers above.