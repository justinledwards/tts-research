# Global Preview Mini-Player

The global preview mini-player is the lightweight audition surface for Workspace, Review, Preview,
and Settings. It is hidden inside Teleprompt and Cinema so it does not compete with the dedicated
recording toolbar or the full Cinema transport.

## Transport Semantics

- Outside Cinema, the mini-player owns preview playback controls: previous block, play/pause,
  restart, next block, playback speed, selected segment preview, and whole-source preview.
- Review and Intake use the compact side dock so persistent preview controls do not cover workspace
  actions. Preview and Settings use the full side dock with whole-source preview and A/B controls.
- Inside Book, Document, or Website Cinema, the full shared Cinema transport owns playback.
- The mini-player reuses the same generated-audio playback controller as the right rail audio
  player. It does not create a separate audio engine.
- Disabled preview actions must expose a reason, usually that `Create & Listen` has not produced
  generated audio yet.

## Queue Model

`frontend/src/features/preview/previewQueue.ts` maps Review blocks into a preview queue. Each item
keeps the active block id, source section, spoken text, policy note type, estimated duration,
generated-audio readiness, and a seek range derived from generated segment durations when they are
available.

The `Skip silence` setting skips policy-skipped, on-demand, empty, and effectively silent blocks
when moving between blocks. It does not delete or hide those blocks from Review.

## A/B Comparison

`frontend/src/features/preview/abComparison.ts` compares:

- Voice A vs Voice B
- Speech policy A vs Speech policy B
- Run config A vs Run config B

`Use B` applies only changed settings. It does not auto-generate audio; the next `Create & Listen`
run renders the selected B configuration.

## Local Checks

- `pnpm check`
- `pnpm e2e:workspace-flow`
- `pnpm e2e:ui-actions`
- `pnpm validate:local`
- `pnpm bundle:local`
