# ChatGPT peer checkpoint — QQP-433 sync fidelity gates

- Date: 2026-07-08
- Project: TTS-Research
- Thread: https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a4dbf8e-e71c-83ed-9e84-5784730077bc
- Archive: /tmp/tts-research-qqp433-peer-20260708-050613-5faeec3-dirty.zip
- Archive SHA-256: 41cddbb93f2e76b8103be0a90e55914f56a5fa80b89b266a064511ba01615801
- Verdict: PEER REQUEST_CHANGES

---

PEER REQUEST_CHANGES

Verdict summary. QQP-433 should not be marked Done yet. The new decision object and artifact-compatible/low-resource/timing gates are mostly in place, but the current “valid source-word mapping” gate can still pass for mechanically generated, semantically wrong word mappings. That directly violates the core QQP-433 acceptance bar for exact word sync.

Release-blocking issue.

Blocker: exact word sync can still be over-claimed when synthesized text diverges from source text.

Evidence:

backend/internal/pipeline/timing_artifacts.go:36-60 builds highlight maps from scopeContent.Text / scopeContent.WordSpans, while timing tokens come from normalized synthesized job segments.

backend/internal/pipeline/book_sources.go:332-350 returns raw book scope text and raw book word spans for book-source timing scope.

backend/internal/pipeline/service.go:1322-1366 can synthesize optimized/rendered speech text, so the tokens being aligned can differ from the raw source words.

backend/internal/highlightmap/build_v2.go:144-170 maps each timing token to a source word purely by token index.

backend/internal/highlightmap/build_v2.go:374-381 turns that positional index into a sourceWordId.

backend/internal/pipeline/sync_fidelity_decisions.go:180-204 treats mapping as valid if word entries have sourceId, sourceWordIndex, sourceWordId, nodeId, speechPlanId, and tokenIndex; it never verifies that the source word identity actually matches the token text or an explicit transform/crosswalk.

backend/internal/pipeline/sync_fidelity_decisions.go:67-71 then allows exact_word when this presence-only mapping check combines with reliable timing and compatible audio.

Realistic runtime path:

A book source uses speech policy, text preprocessing, or speech rendering that removes/rewrites/skips text.

Alignment is enabled through the existing provider/forced-alignment paths and yields word-level reliable timing.

Audio passes checker evidence.

The synthesized tokens are mapped by ordinal position onto raw source spans, so mappingValid=true even when the token no longer corresponds to that source word.

exactAllowed=true can be emitted for a map that should be phrase/block at best.

Why SPEC PASS / QUALITY APPROVED likely missed it:

The focused tests exercise synthetic exact evidence and prepared-source/mock heuristic paths, but not a book-source path where source text and spoken/optimized text diverge while word timing is reliable.

The review appears to have checked that mapping fields exist, not that the mapping is semantically trustworthy.

Non-blocking follow-ups.

Non-blocking: Runtime SyncFidelityDecision can omit schema-required IDs such as sourceRevisionId on source-less/audio-only decisions because the struct uses omitempty. This is not the blocker above because exact is denied in those paths, but it should be tightened if runtime metadata is expected to validate against sync-fidelity-decision.v1.

Non-blocking: source_only / none are implemented but not covered as directly as exact/phrase/block/audio-only. Add focused helper tests later.

Non-blocking: Legacy persisted jobs whose metadata predates syncFidelity can hydrate timing URLs without deriving backfilled syncFidelity. Acceptable as an additive migration follow-up unless product requires backfill.

Exact word sync over-claim check. Yes, exact word sync can still be over-claimed in a realistic current runtime path: book-source raw word spans plus optimized/rendered speech tokens plus reliable word timing can pass the exact gate because exactWordMappingValid only validates field presence, not token-to-source-word equivalence or an explicit source/spoken crosswalk.

Stale metadata check. For the normal new final path, refreshTimingArtifacts(..., final=true) derives syncFidelity, stores it on job.Timing, and the completion metadata write persists it again, so I did not find a final-completion/reload staleness blocker for newly generated jobs. Staleness remains possible for legacy hydrated timing summaries without syncFidelity, and temporary-source promotion can carry nested decision IDs from the source job, but those are acceptable follow-ups given the stated QQP-433 scope.

Scope check. The blocker is inside QQP-433 scope. It is not a UI-label, transport, resume, repair, or promotion issue; it is the backend/runtime exact-fidelity decision layer still accepting an unproven source-word mapping.