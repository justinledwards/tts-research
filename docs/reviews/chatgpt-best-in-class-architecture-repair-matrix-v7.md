# TTS best-in-class architecture v8 → v9 repair matrix

Status: `repairs_in_progress`

Source review:

- `docs/reviews/chatgpt-best-in-class-architecture-response-v8.md`
- conversation `6a50d28a-d148-83eb-b459-39630f09a1fd`
- reviewed archive SHA-256 `e79c59177b3024b34600302c403f74be6669d257a8acb06ee39e70a3944e84f3`

Linear mutation remains prohibited. Replacement issues created: `0`.

## Route inventory lane

1. Preserve lexical receiver bindings across nested blocks and scoped initializers.
2. Account for reachable route calls in invoked receiver methods, invoked function literals, and condition/tag/argument/range/send expressions; emit or fail closed.
3. Detect repeated runtime registrations from repeated helper invocation and loops instead of suppressing by invocation/AST-position caches.
4. Prune static-false branches and terminate continuation after unconditional panic.
5. Honor Go build constraints for route files.

Exact acceptance probes are preserved in the v8 response. Canonical acceptance remains 123 exact routes with no duplicate runtime registration.

Owned files:

- `backend/cmd/flow-route-inventory/main.go`
- `backend/cmd/flow-route-inventory/main_test.go`

Status: `in_progress`

## Executable evidence lane

6. Reject TypeScript runner registrations and assertions under all statically false literal/comparison/short-circuit forms, including assertions, `satisfies`, non-null, and parentheses.
7. Reject Go assertions under false constant expressions and after terminal `testing.T` calls (`Skip*`, `Fatal*`, `FailNow`).
8. Count TypeScript evidence only from files selected by the canonical runner glob.
9. Count Go evidence only from active `_test.go` files under current build constraints.

Canonical acceptance remains 40 evidence references.

Owned files:

- `scripts/validate-flow-registry.mjs`
- `scripts/validate-flow-registry.test.mjs`
- `backend/cmd/flow-symbol-inventory/main.go`
- `backend/cmd/flow-symbol-inventory/main_test.go`

Status: `in_progress`

## Linear packet and validator lane

10. Enforce the exact candidate lifecycle, issue status/disposition, null Linear bindings, zero creations, exact project/team, peer marker, and canonical nonempty creation gates unconditionally.
11. Validate capacity as nonnegative safe integers with complete pagination, exact cap arithmetic, mandatory fresh parent verification, and exact binding to a repository-contained source artifact.
12. Resolve every existing-issue reconciliation identifier exactly once against loaded active/completed source evidence with project/team/classification checks.
13. Make BIC-01 own the minimal reproducible startup benchmark command needed to produce its evidence; BIC-18 may extend it downstream.
14. Replace BIC-02's root-invalid Go command with a root-runnable backend-module command.
15. Give BIC-20 explicit clean-worktree, fetch/upstream, and local/remote equality commands plus negative fixtures.

Owned files:

- `scripts/validate-linear-batch.mjs`
- `scripts/validate-linear-batch.test.mjs`
- canonical packet JSON and generated Markdown
- `package.json` only if required by the exact benchmark command contract

Status: `in_progress`

## V9 submission gate

- [ ] independently rerun every v8 exact probe on final bytes;
- [ ] run focused route/evidence/Linear/archive suites;
- [ ] regenerate deterministic flow and Linear documents;
- [ ] run fresh `pnpm check`, flow, packet, format, and diff gates;
- [ ] advance live candidate status to `candidate_pending_chatgpt_v9_recheck` while preserving historical review artifacts;
- [ ] build and independently audit a source-closed final-byte archive;
- [ ] submit in a fresh `tts-research` Project chat with Pro reasoning;
- [ ] require exact `AGREED TTS BEST-IN-CLASS ARCHITECTURE BATCH` and `Linear creation may proceed: YES.` markers before any Linear mutation.
