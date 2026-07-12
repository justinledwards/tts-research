You agreed at the ASAP read-along pipeline layer with `AGREED ASAP READ-ALONG PIPELINE`:

The pipeline should be source-first and manifest-driven. Source units become readable, narratable, and alignable independently. The earliest contiguous narratable segment may synthesize and become playable before the full source is complete. Partial manifests must bind source revision, unit IDs, speech segments, audio artifacts, sync level, confidence, stale state, and recovery metadata. The UI starts in source-only/readable mode and upgrades to block, phrase, or word sync only as evidence permits.

Answers to your pressure-test questions:

1. First playable before ASR/checking:
   - Yes, unchecked first playable audio is allowed if clearly labeled and recoverable.
   - The UI must distinguish unchecked audio, checked audio, stale audio, failed audio, and replaced audio.
   - If later checking fails, the segment must be visibly stale/failed and safely replaceable.

2. Contiguous-prefix playback:
   - Yes, contiguous-prefix playback is acceptable for the first implementation.
   - Non-contiguous out-of-order playback should be deferred until the source lifecycle is proven.

3. Repair overlay during active synthesis:
   - Fork/supersede the active manifest.
   - Do not mutate the running manifest in place.
   - Running jobs should finish into their original manifest or be cancelled/superseded explicitly.

4. Remote HTML persistence:
   - Yes, raw fetched content should be fully persisted locally before extraction begins.
   - Local-first reproducibility and auditability are more important than shaving a small amount of network-stream latency.

Now continue the planned sequence.

Focus of this prompt: Resume/retry/state model across navigation, reloads, failures, partial artifacts, and project promotion.

Attachment context is still the same archive from the previous turns (`tts-research-chatgpt-adc8d07.zip`, SHA256 `ac7b61be37079609a24cceeeb958a6d780f03373a83e170e0c61893540e9c182`). Treat it as current implementation truth.

Required output:

# Resume/retry/state verdict
- State whether the current state model can support durable leave/reopen/resume for the agreed product.
- Identify top blockers and highest-risk state transitions.

# Canonical durable state model
Define the minimal durable state needed for:
- project identity and source identity;
- source revision and extraction revision;
- reading unit identity/order/remap;
- narration job/manifest identity;
- playback position and active unit/word/phrase/block;
- UI mode and selected source/read-along surface;
- repair overlay state;
- temporary source promotion into durable project state;
- stale/superseded/failure states.

# Retry and resume semantics
Define exact semantics for:
- retry from source extraction;
- retry from structure/render spoken form;
- retry from segment synthesis;
- retry from alignment/checking;
- retry after user cancellation;
- retry after provider failure;
- retry after source repair/supersession.

# Navigation/reload behavior
Define what must happen when the user:
- leaves during extraction;
- leaves during synthesis;
- leaves during checking/alignment;
- closes/reopens browser;
- switches project/source;
- promotes Quick Listen / temporary source into a durable project.

# Conflict and staleness rules
Define how to detect and show stale source, stale audio, stale highlight map, stale repair overlay, and stale playback position.

# API/data model implications
Recommend high-level backend/front-end schema/module changes only where needed.
Do not produce implementation code.

# Risks / anti-goals for state/retry work
List what should stay out of the first <=20 issue batch.

# Agreement candidate
End with either `AGREED RESUME/RETRY STATE MODEL` or `NOT AGREED`.
If agreed, provide the state-model direction to carry into the responsiveness architecture discussion.
If not agreed, state the blocking change.

# Pressure-test questions
Ask only questions that materially change architecture direction and are not answerable from the archive or answers above.