# QQP-4 — Quick Narrate Pasted URL

Linear: https://linear.app/niklas-olsson/issue/QQP-4/quick-narrate-pasted-url

## Goal

Implement the existing Quick Listen capture anchor so a user can paste a URL and start narratable temporary source work without first creating a durable project.

This issue is the capture anchor only. Do not implement the QQP-437 promotion crosswalk here.

## Scope

- Preserve the first-batch source/manifest/revision invariants in `docs/architecture/source-reader-flow-invariants.md`.
- Use temporary-source language from `docs/temporary-source-copy-guide.md` and shared frontend copy where UI text is touched.
- URL Quick Listen should create temporary source work, not a durable project source.
- Temporary source capture should align with the same source envelope / manifest / partial audio / durable progress model used by project Reader paths where the existing runtime supports it.
- Keep project history/source mutation out of this issue except for existing temporary-source storage required to narrate/reopen temporary work.
- Preserve `Keep in project` / promotion as a later QQP-437 concern.

## Acceptance criteria

- Pasted URL flow has deterministic backend and/or frontend tests proving a URL can be submitted as temporary Quick Listen work without a project.
- UI or API behavior clearly identifies the result as a temporary source and preserves local-first/provider-boundary copy.
- Discard/expiry/recent-source behavior remains scoped to temporary work.
- No duplicate Quick Listen issue/surface and no promotion-crosswalk implementation.
- Issue-specific focused commands pass.
- Before closeout: `mise exec -- pnpm check` passes.

## Suggested seams

- Frontend: `frontend/src/features/quick-listen/QuickListenPanel.tsx`, `QuickListenPanel.test.ts`, App handlers/API client around temporary source URL creation.
- Backend: temporary source routes/service and tests under `backend/internal/httpapi` and `backend/internal/pipeline`.
- Shared docs/copy: `docs/temporary-source-copy-guide.md`, `frontend/src/features/temporary-source-copy.ts`.

## Verification plan

Implementer should discover exact focused commands. Expected minimum:

- focused frontend Quick Listen tests, if UI touched;
- focused backend temporary-source route/service tests, if backend touched;
- `mise exec -- pnpm validate:ir` if sidecar/contract evidence changes;
- `git diff --check`;
- parent will run `mise exec -- pnpm check` before commit/Linear Done.
