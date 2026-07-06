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
