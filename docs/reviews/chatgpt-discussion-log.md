# ChatGPT Discussion Log

## 2026-07-07 00:53 CEST — Setup / project preflight

- Repo moved to `/home/phoenix/projects/repos/tts-research`; legacy path `/home/phoenix/git/tts-research` is a symlink.
- ChatGPT Camofox health: OK at `http://127.0.0.1:9378` with profile `hermes-deep-research`.
- Visible ChatGPT project evidence: pinned `TTS-Research` project appears in the sidebar.
- Initial mistake: interpreted `Design for the Real World` as a ChatGPT project name.

## 2026-07-07 01:09 CEST — Corrected project mapping

- User clarified: `Design for the Real World` is a Voice Studio project inside the TTS-Research app, not a ChatGPT project.
- ChatGPT project URL provided for official discussion loop: https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/project
- Repo record updated at `integrations/chatgpt/project.json`.

Next required action:

1. Verify the ChatGPT `TTS-Research` project composer through Camofox.
2. Run `mise exec -- pnpm review:chatgpt` and record archive path/SHA.
3. Start prompt sequence from `docs/reviews/chatgpt-architecture-discussion-plan.md`, using `Design for the Real World` as the target Voice Studio project context.

## 2026-07-07 01:12 CEST — Product / market-fit discussion submitted

- Prompt: `docs/reviews/prompts/001-product-market-fit.md`
- ChatGPT conversation: https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a4c345f-67d8-83eb-a85a-9cebcb33d4f8
- Archive: `/home/phoenix/projects/repos/tts-research/output/chatgpt-review-packages/tts-research-chatgpt-adc8d07.zip`
- Archive SHA256: `ac7b61be37079609a24cceeeb958a6d780f03373a83e170e0c61893540e9c182`
- Submission verification: project composer showed `New chat in tts-research`, attached zip chip, and exactly one submitted `You said` turn.
- Current state: submitted/running; ChatGPT is still finalizing the answer.

Result:

- ChatGPT returned `AGREEMENT CANDIDATE`.
- Agreed product direction: serious ASAP read-along platform for long-form and messy sources; differentiated by early safe reading, durable resume, explicit provenance/confidence, honest sync degradation, and recoverable partial extraction.
- Material pressure-test answers selected for next round:
  - first batch may focus on paste/URL/clean HTML/Markdown and one book/document path, but architecture must be source-neutral;
  - phrase/block fallback is required when word alignment is not trustworthy;
  - durable project reading is primary, Quick Listen is the fastest capture/promote path;
  - local-first is strategic while keeping providers pluggable.
- Full response saved: `docs/reviews/chatgpt/001-product-market-fit.response.md`

## 2026-07-07 01:20 CEST — Source-model discussion submitted

- Prompt: `docs/reviews/prompts/002-source-model.md`
- Conversation: https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a4c345f-67d8-83eb-a85a-9cebcb33d4f8
- State: follow-up submitted in the same ChatGPT discussion thread.

Result:

- ChatGPT returned `AGREED SOURCE MODEL`.
- Agreed source direction: keep `content-ir.v1` as finalized node contract, add source-neutral lifecycle envelope, partial extraction manifest, per-unit quality/readiness states, and revision/remap sidecars.
- Material pressure-test answers selected for next round:
  - first long-form proof path: EPUB / structured HTML;
  - repairs: immutable extraction plus repair overlay;
  - stable reading-unit identity wins over exact emitted order; use sparse/order-key insertion and revision maps.
- Full response saved: `docs/reviews/chatgpt/002-source-model.response.md`

## 2026-07-07 01:31 CEST — ASAP read-along pipeline discussion submitted

- Prompt: `docs/reviews/prompts/003-asap-readalong-pipeline.md`
- Conversation: https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a4c345f-67d8-83eb-a85a-9cebcb33d4f8
- State: follow-up submitted in the same ChatGPT discussion thread.

Result:

- ChatGPT returned `AGREED ASAP READ-ALONG PIPELINE`.
- Agreed pipeline direction: source-first and manifest-driven; source units become readable/narratable/alignable independently; earliest contiguous narratable segment may synthesize and become playable before full-source completion; UI starts source-only/readable and upgrades to block/phrase/word sync only as evidence permits.
- Full response saved: `docs/reviews/chatgpt/003-asap-readalong-pipeline.response.md`

## 2026-07-07 01:43 CEST — Resume/retry/state-model discussion submitted

- Prompt: `docs/reviews/prompts/004-resume-retry-state-model.md`
- Conversation: https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a4c345f-67d8-83eb-a85a-9cebcb33d4f8
- State: follow-up submitted in the same ChatGPT discussion thread.

Result:

- ChatGPT returned `AGREED RESUME/RETRY STATE MODEL`.
- Agreed state direction: source/manifest/revision-centric durable state; backend/local storage authoritative; progress points through source revision, extraction revision, manifest, repair overlays, reading unit, locator, segment/audio artifact, and highlight map; retry is artifact/segment-scoped; repairs and promotion fork/supersede through explicit crosswalks.
- Full response saved: `docs/reviews/chatgpt/004-resume-retry-state-model.response.md`

## 2026-07-07 01:57 CEST — Responsiveness architecture discussion submitted

- Prompt: `docs/reviews/prompts/005-responsiveness-architecture.md`
- Conversation: https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a4c345f-67d8-83eb-a85a-9cebcb33d4f8
- State: follow-up submitted in the same ChatGPT discussion thread.

Result:

- ChatGPT returned `AGREED RESPONSIVENESS ARCHITECTURE`.
- Agreed responsiveness direction: narrow route/UI state, manifest-scoped external stores, source/manifest SSE events, isolated playback/highlight rendering, windowed large documents, and visible low-resource degradation instead of blocking/lying.
- Full response saved: `docs/reviews/chatgpt/005-responsiveness-architecture.response.md`

## 2026-07-07 02:11 CEST — UI/screenshot review submitted

- Prompt: `docs/reviews/prompts/006-ui-screenshot-review.md`
- Conversation: https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a4c345f-67d8-83eb-a85a-9cebcb33d4f8
- State: follow-up submitted in the same ChatGPT discussion thread.

Result:

- ChatGPT returned `AGREED UI DIRECTION`.
- Agreed UI direction: user-facing `Reader` spine with Cinema/Theatre as optional modes/internal shell concepts; phone can open directly to reader; `Design for the Real World` becomes canonical durable-project fixture for first-batch UI evidence.
- Full response saved: `docs/reviews/chatgpt/006-ui-screenshot-review.response.md`

## 2026-07-07 02:25 CEST — Linear issue-batch review submitted

- Prompt: `docs/reviews/prompts/007-linear-issue-batch.md`
- Conversation: https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a4c345f-67d8-83eb-a85a-9cebcb33d4f8
- State: follow-up submitted in the same ChatGPT discussion thread.

Result:

- ChatGPT returned `AGREED LINEAR BATCH` with 17 proposed new issues.
- Human requested an extra atomicity pass plus project flowchart/invariant/contract agreement before Linear creation.
- Full response saved: `docs/reviews/chatgpt/007-linear-issue-batch.response.md`

## 2026-07-07 11:27 CEST — Atomic flow/contract/Linear batch review

- Prompt: `docs/reviews/prompts/008-atomic-flow-contract-review.md`
- Conversation: https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/project
- Inputs: `docs/architecture/source-reader-flow-invariants.md`, `docs/project-management/linear/tts-research-first-batch-atomicity-review.md`, `docs/project-management/linear/tts-research-first-batch.draft.manifest.json`
- Validation before submission: `mise exec -- pnpm generate:contracts`, `mise exec -- pnpm validate:ir`, and `mise exec -- pnpm test:adapters` passed.

Result:

- ChatGPT returned `ATOMIC ENOUGH FOR LINEAR` and `AGREED ATOMIC FLOW AND LINEAR BATCH`.
- Agreed final shape: keep existing `QQP-4`, create 19 new atomic issues, active total after creation = 20.
- Full response saved: `docs/reviews/chatgpt/008-atomic-flow-linear-batch.response.md`
