You agreed at the source-model layer with `AGREED SOURCE MODEL`:

Content IR v1 remains the stable finalized node contract, but the product needs a source-neutral lifecycle envelope, partial extraction manifest, per-unit quality/readiness states, and revision/remap sidecars. Every adapter must emit stable, provenance-bearing reading units that can independently become readable, narratable, and alignable. UI read-along fidelity must be gated by source and timing evidence, not by feature ambition.

Answers to your pressure-test questions:

1. First long-form proof path:
   - Choose EPUB / structured HTML first.
   - Rationale: it proves sections, locators, progress, partial narration, stable IDs, and resume/remap without PDF/OCR layout noise.
   - Born-digital PDF remains the first “messy document” follow-up, not the first proof path.

2. User repairs:
   - Use immutable extraction plus repair overlay.
   - Never directly mutate the extracted source as the source of truth.
   - Repairs should create overlays/revision sidecars that preserve provenance, explain staleness, and allow remap.

3. Stable identity vs exact emitted order:
   - Stable reading-unit identity wins.
   - Use sparse/order-key insertion and revision maps so late extraction corrections can insert/reorder without destroying resume/progress identity.

Now continue the planned sequence.

Focus of this prompt: ASAP read-along pipeline: source phases, streaming segments, partial manifests, and read-along sync.

Attachment context is still the same archive from the previous turns (`tts-research-chatgpt-adc8d07.zip`, SHA256 `ac7b61be37079609a24cceeeb958a6d780f03373a83e170e0c61893540e9c182`). Treat it as current implementation truth.

Required output:

# ASAP read-along verdict
- State whether the current pipeline direction can support early safe read-along.
- Identify the top blockers to “start reading along ASAP from any supported source.”

# Pipeline lifecycle
Define the source-to-readalong lifecycle across:
- source intake;
- extraction;
- structure normalization / Content IR;
- readable unit readiness;
- narratable unit readiness;
- synthesis segment readiness;
- alignment/sync readiness;
- playback/progress resume;
- finalization and stale/superseded artifacts.

# Partial manifest contract
Define the minimal partial artifact/manifest contract required to let the UI start early while remaining honest.
Include fields for source revision, unit IDs, segment IDs, readiness, confidence, audio URLs, highlight/sync level, stale state, and recovery metadata.

# Read-along sync degradation
Define when the UI should show:
- exact word highlight;
- phrase highlight;
- block highlight;
- audio-only progress;
- source-only read mode.

# Performance / responsiveness budgets
Recommend concrete budgets for first readable text, first narratable unit, first playable audio, route navigation under active jobs, and control latency.

# Backend/frontend boundary
Recommend high-level boundaries for events, polling/SSE, client cache, storage, and invalidation.

# Risks / anti-goals for pipeline work
List what should stay out of the first <=20 issue batch.

# Agreement candidate
End with either `AGREED ASAP READ-ALONG PIPELINE` or `NOT AGREED`.
If agreed, provide the pipeline direction to carry into the resume/retry/state-model discussion.
If not agreed, state the blocking change.

# Pressure-test questions
Ask only questions that materially change architecture direction and are not answerable from the archive or answers above.