# Reader-First Peer repair v7

Status: owner repair after exact-archive v6 `PEER REQUEST_CHANGES`; no Peer, Linear, or product authorization.

V6 verdict archive binding:

- Archive: `tts-research-reader-first-peer-review-v6.zip`
- SHA-256: `16ac941dd6e1117a7c7989823647b16c364e3b21a8b7858d1fd4793a6f9add8d`
- Preserved verdict: `docs/reviews/chatgpt-reader-first-release-response-v6.md`

## Blocker 1: executable OCR fixture schema

Repaired `fixtures/pdf/scanned_fixture.expected-overlay.json#/requiredResolution/auditFields` to exactly:

1. `sourceNodeId`
2. `sourceEvidence`
3. `sourceOverlayRevision`
4. `reviewedOverlayRevision`
5. `reviewerId`
6. `resolvedRole`
7. `resolvedDisposition`
8. `resolvedAt`

The fixture hash is rotated in the contract and validator evidence bindings. `validateExecutableOcrFixture` independently compares executable fixture fields with both the fixed literal and contract list. Its adversarial test mutates only fixture data from `sourceNodeId` to `nodeId` and fails for `executable OCR fixture resolution audit-field schema drift`, independent of canonical document hashes.

## Blocker 2: authoritative timing-fidelity ownership

RFA-15 now owns timing-fidelity implementation at:

- `frontend/src/features/teleprompt/TelepromptStudio.tsx`
- `frontend/src/features/teleprompt/telepromptStudioComponents.tsx`
- `frontend/src/features/teleprompt/telepromptTheatreCueContent.tsx`
- `frontend/src/features/cinema/BookDocumentReaderStage.tsx`
- `frontend/src/features/theatre/model.ts`

The corresponding exact timing symbols are listed in RFA-15 while media-only waveform symbols remain under RFA-13.

RFA-15-AC05 requires all Reader, Teleprompt, Cinema, and Theatre renderers to consume authoritative fidelity from a timing manifest or server snapshot. Heuristic/estimated phrases remain visibly estimated even when word boundaries or highlight-map data exist; they cannot enable exact read-along. Renderers may not hard-code or default timing to trusted.

Validator fixed ownership checks and adversarial tests independently remove every new RFA-15 path and symbol. The AC05 mutation test replaces the requirement with word-timing-derived trust and must fail.

## Authorization boundary

Owner acceptance does not imply Peer approval. Linear creation and product implementation remain prohibited. The sole graph root remains RFA-01, but no issue is authorized until an exact future archive receives `PEER APPROVED` and the parent explicitly opens the relevant gate.
