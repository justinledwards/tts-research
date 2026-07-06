# ChatGPT Discussion Log

## 2026-07-07 00:53 CEST — Setup / project preflight

- Repo moved to `/home/phoenix/projects/repos/tts-research`; legacy path `/home/phoenix/git/tts-research` is a symlink.
- ChatGPT Camofox health: OK at `http://127.0.0.1:9378` with profile `hermes-deep-research`.
- Visible ChatGPT project evidence: pinned `TTS-Research` project appears in the sidebar.
- Requested project blocker: no verified `Design for the Real World` project URL was found in repo files, session history, or the visible ChatGPT sidebar snapshot.
- Decision: do not start the official architecture discussion loop until the requested ChatGPT project URL is verified or the user explicitly authorizes using the visible `TTS-Research` project instead.

Next required action:

1. Verify the intended ChatGPT project URL.
2. Run `mise exec -- pnpm review:chatgpt` and record archive path/SHA.
3. Start prompt sequence from `docs/reviews/chatgpt-architecture-discussion-plan.md`.
