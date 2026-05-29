# Agent Learning Ledger

## Repo Rules

- Keep caretaker refactors narrow and behavior-preserving.
- Backend code lives in `backend/` and uses Go Fiber.
- Frontend code lives in `frontend/` and uses Vite, React, Tailwind, and strict TypeScript.
- Root JavaScript tooling is managed with `pnpm`.
- Run targeted checks for the touched area plus `pnpm check` before handoff.
- TypeScript lint prefers `readonly T[]` for readonly array parameters rather than `ReadonlyArray<T>`.

## Validation Quirks

- In this sandbox, `pnpm check` can fail in `backend/internal/pipeline` tests that call `httptest.NewServer` because local TCP listeners are denied (`operation not permitted`); observed at `TestPreparedSourceURLIngestHonorsPrivateNetworkDefault` and `TestCreateBookSourceFromURLUsesHTMLContentType`. Treat as environment-related when frontend-only changes have separate passing validation.
- `pnpm exec biome check <file>` includes assist checks such as import organization; for focused validation without applying unrelated import sorting, use `pnpm exec biome format <file>` plus `pnpm exec biome lint <file>`.

## Rotation Notes

- Prefer targets not recently covered by the caretaker rotation.

## Run History

### 2026-05-29 00:07 CEST

- Refactor target: `frontend/src/AppShell.tsx` project/chapter selector markup in `TopProductBar`.
- Theme: Extract a private same-file component to reduce render-function scan cost.
- Files changed: `frontend/src/AppShell.tsx`, `docs/agent-learning-ledger.md`, `WORKINGLOG.md`.
- Validation: `pnpm exec biome check frontend/src/AppShell.tsx` passed; `pnpm --filter @tts-research/frontend typecheck` passed; `pnpm --filter @tts-research/frontend test` passed; `pnpm check` failed at backend `TestPreparedSourceURLIngestHonorsPrivateNetworkDefault` due sandbox TCP listener denial.
- Repo lessons: Full project validation may require a host that permits local test TCP listeners.
- Suggested next safe target: `frontend/src/features/cinema/model.ts` readiness display helper extraction, with existing model tests as coverage.

### 2026-05-29 02:05 CEST

- Refactor target: `frontend/src/features/cinema/model.ts` renderer lifecycle readiness branch in `deriveCinemaReadinessDisplay`.
- Theme: Extract a private same-file helper to name non-ready renderer readiness display construction.
- Files changed: `frontend/src/features/cinema/model.ts`, `docs/agent-learning-ledger.md`, `WORKINGLOG.md`.
- Validation: `pnpm exec biome check frontend/src/features/cinema/model.ts` passed; `pnpm --filter @tts-research/frontend exec vitest run src/features/cinema/model.test.tsx` passed; `pnpm --filter @tts-research/frontend typecheck` passed; `git diff --check` passed; `pnpm check` failed at backend `TestPreparedSourceURLIngestHonorsPrivateNetworkDefault` due sandbox TCP listener denial.
- Repo lessons: No new durable rule; the existing sandbox TCP listener quirk repeated.
- Suggested next safe target: resolve or commit the existing dirty caretaker worktree first; then inspect `frontend/src/features/cinema/PreparedSourceCinemaTransport.tsx` for a local lifecycle display helper extraction.

### 2026-05-29 04:05 CEST

- Refactor target: `frontend/src/features/cinema/PreparedSourceCinemaBase.tsx` prepared-source select option rendering.
- Theme: Replace duplicated local option mapping with a private same-file helper.
- Files changed: `frontend/src/features/cinema/PreparedSourceCinemaBase.tsx`, `docs/agent-learning-ledger.md`, `WORKINGLOG.md`.
- Validation: `pnpm exec biome check frontend/src/features/cinema/PreparedSourceCinemaBase.tsx` failed on pre-existing `assist/source/organizeImports`; `pnpm exec biome format frontend/src/features/cinema/PreparedSourceCinemaBase.tsx` passed; `pnpm exec biome lint frontend/src/features/cinema/PreparedSourceCinemaBase.tsx` passed; `pnpm --filter @tts-research/frontend exec vitest run src/features/cinema/model.test.tsx src/features/cinema/preparedSourceModel.test.tsx` passed; `pnpm --filter @tts-research/frontend typecheck` passed; `git diff --check` passed; `pnpm check` failed at backend `TestPreparedSourceURLIngestHonorsPrivateNetworkDefault` due sandbox TCP listener denial.
- Repo lessons: File-level `biome check` may report assist-only import ordering that the project `format:check` and `lint` gates do not fail on.
- Suggested next safe target: avoid the currently dirty cinema files until the pending caretaker changes are committed or cleared; inspect an untouched high-churn frontend helper such as `frontend/src/features/settings/SettingsPanel.tsx`.

### 2026-05-29 06:06 CEST

- Refactor target: `frontend/src/features/settings/SettingsPanel.tsx` performance mode option literals.
- Theme: Replace duplicated local tuple literals with a private same-file constant.
- Files changed: `frontend/src/features/settings/SettingsPanel.tsx`, `docs/agent-learning-ledger.md`, `WORKINGLOG.md`.
- Validation: `pnpm exec biome format frontend/src/features/settings/SettingsPanel.tsx` passed; `pnpm exec biome lint frontend/src/features/settings/SettingsPanel.tsx` passed; `pnpm --filter @tts-research/frontend exec vitest run src/features/settings/SettingsPanel.test.tsx` passed; `pnpm --filter @tts-research/frontend typecheck` passed; `git diff --check` passed; `pnpm check` failed at backend `TestCreateBookSourceFromURLUsesHTMLContentType` due sandbox TCP listener denial.
- Repo lessons: The backend `httptest.NewServer` sandbox quirk affects more than one `backend/internal/pipeline` test.
- Suggested next safe target: after clearing the current mixed worktree, inspect `frontend/src/features/book-cinema/BookCinemaPanel.tsx` for one small render-helper extraction.

### 2026-05-29 08:07 CEST

- Refactor target: `frontend/src/features/book-cinema/BookCinemaPanel.tsx` scope option key lookup.
- Theme: Replace repeated local select-key lookup logic with a private same-file helper.
- Files changed: `frontend/src/features/book-cinema/BookCinemaPanel.tsx`, `docs/agent-learning-ledger.md`, `WORKINGLOG.md`.
- Validation: `pnpm exec biome format frontend/src/features/book-cinema/BookCinemaPanel.tsx` passed after one formatting adjustment; `pnpm exec biome lint frontend/src/features/book-cinema/BookCinemaPanel.tsx` passed; `pnpm --filter @tts-research/frontend exec vitest run src/features/book-cinema/degradedState.test.tsx src/features/book-cinema/model.test.ts src/features/book-cinema/pageStructure.test.ts` passed; `pnpm --filter @tts-research/frontend typecheck` passed; `git diff --check` passed; `pnpm check` failed at backend `TestCreateBookSourceFromURLUsesHTMLContentType` due sandbox TCP listener denial.
- Repo lessons: No new durable rule; the existing backend sandbox TCP listener quirk repeated.
- Suggested next safe target: clear or commit the mixed caretaker worktree before another refactor; then inspect a clean high-churn frontend file such as `frontend/src/features/teleprompt/TelepromptStudio.tsx`.

### 2026-05-29 10:05 CEST

- Refactor target: `frontend/src/features/teleprompt/TelepromptStudio.tsx` block-id lookup.
- Theme: Replace repeated local `blocks.find((block) => block.id === id)` logic with a private same-file helper.
- Files changed: `frontend/src/features/teleprompt/TelepromptStudio.tsx`, `docs/agent-learning-ledger.md`, `WORKINGLOG.md`.
- Validation: `pnpm exec biome format --write frontend/src/features/teleprompt/TelepromptStudio.tsx` passed with no fixes; `pnpm exec biome lint frontend/src/features/teleprompt/TelepromptStudio.tsx` passed; `pnpm --filter @tts-research/frontend exec vitest run src/features/teleprompt/teleprompt.test.ts src/features/teleprompt/telepromptCueSync.test.ts` passed; `pnpm --filter @tts-research/frontend typecheck` passed; `git diff --check` passed; `pnpm check` failed at backend `TestPreparedSourceURLIngestHonorsPrivateNetworkDefault` due sandbox TCP listener denial.
- Repo lessons: No new durable rule; the existing backend sandbox TCP listener quirk repeated.
- Suggested next safe target: clear or commit the mixed caretaker worktree before another refactor; then inspect a clean frontend file outside the recent rotation, such as `frontend/src/features/revision/RevisionPanel.tsx`.

### 2026-05-29 12:05 CEST

- Refactor target: `frontend/src/features/revision/RevisionPanel.tsx` active/base block derivation.
- Theme: Extract a private same-file helper to name the selected block and base block fallback pair.
- Files changed: `frontend/src/features/revision/RevisionPanel.tsx`, `docs/agent-learning-ledger.md`, `WORKINGLOG.md`.
- Validation: `pnpm exec biome format --write frontend/src/features/revision/RevisionPanel.tsx` passed with no fixes; `pnpm exec biome lint frontend/src/features/revision/RevisionPanel.tsx` passed; `pnpm --filter @tts-research/frontend exec vitest run src/features/revision/revision.test.ts` passed; `pnpm --filter @tts-research/frontend typecheck` passed; `git diff --check` passed; `pnpm check` failed at backend `TestCreateBookSourceFromURLUsesHTMLContentType` due sandbox TCP listener denial after format, lint, typecheck, package, script, adapter, and earlier backend tests passed.
- Repo lessons: TypeScript lint enforces `readonly T[]` over `ReadonlyArray<T>` for array type syntax; the existing backend sandbox TCP listener quirk repeated.
- Suggested next safe target: clear or commit the mixed caretaker worktree before another refactor; then inspect `frontend/src/features/intake/IntakeWizard.tsx` for one narrow render-helper extraction.
