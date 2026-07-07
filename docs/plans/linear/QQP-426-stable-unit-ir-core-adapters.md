# QQP-426 — Stable unit identity for core adapters

Status: complete
Linear: https://linear.app/niklas-olsson/issue/QQP-426/stable-unit-identity-for-core-adapters
Slug: `stable-unit-ir-core-adapters`

## Selection rationale

QQP-426 is the next selected issue even though QQP-425 is numerically earlier, because the orchestrator handoff keeps Wave 1 focused on contracts and source truth before manifest snapshot/API work. QQP-426 depends only on QQP-423 `readalong-contracts`, which is Done. QQP-424 is also Done and pushed, so the repo is clean and ready for the next Wave 1 backend/adapter slice.

## Atomic deliverable

Make HTML, EPUB, and Markdown core adapters emit stable unit IDs, order keys, fingerprints, locators, and provenance.

## Scope

Core adapters only:

- Markdown adapter.
- HTML adapter.
- EPUB adapter.
- Shared adapter IR helpers used by those adapters.
- Deterministic fixtures/tests for stable unit identity behavior.

Out of scope:

- PDF/DOCX/OCR best-in-class work.
- Lower-tier adapter reports/warnings (`QQP-427`).
- Manifest snapshot storage/API (`QQP-425`).
- Incremental extraction (`QQP-428`).
- Frontend UI/store work.
- Runtime source lifecycle persistence beyond consuming existing source IDs/options.
- Broad Content IR schema redesign.

## Invariants to preserve

- Content IR v1 remains stable and content-only.
- Source identity is not job identity.
- Reading unit IDs should be stable across compatible revisions.
- Insertion/reorder should use sparse/order-preserving keys instead of purely positional identities where practical.
- Provenance must preserve format-specific locators for Markdown, HTML, and EPUB.
- Recoverable/degraded extraction should still produce readable units with honest warnings.
- No issue in this first batch may claim PDF/DOCX/OCR best-in-class behavior.

## Likely implementation files

Inspect before editing:

- `adapters/shared/ir.js`
- `adapters/markdown/emit_ir.js`
- `adapters/markdown/transform.js`
- `adapters/html/emit_ir.js`
- `adapters/html/emit_ir_helpers.js`
- `adapters/epub/emit_ir.js`
- `adapters/markdown/markdown-adapter.test.js`
- `adapters/html/html-adapter.test.js`
- `adapters/epub/epub-adapter.test.js`
- `fixtures/contracts/markdown.content-ir.v1.json` and any core adapter fixtures referenced by tests.

## Implementation expectations

1. Keep changes minimal and adapter-scoped.
2. Add deterministic unit identity helpers where shared behavior is useful.
3. Ensure each Markdown/HTML/EPUB Content IR node has:
   - stable `nodeId` / unit identity from source-local semantic anchors when available;
   - stable sparse/order-preserving `orderKey`;
   - deterministic fingerprint of the unit text/locator/provenance inputs;
   - format-specific locator and provenance preserving source identity;
   - no job-derived identity.
4. Prefer stable source anchors:
   - Markdown: AST path, heading/list/table context, source offsets/line ranges.
   - HTML: fragment/id, CSS-ish structural path, text/source offsets where available.
   - EPUB: spine item href/idref, fragment/id, best-effort CFI, source-local HTML locator.
5. If a perfect stable anchor is unavailable, emit deterministic fallback identity and warning/metadata rather than inventing a mutable runtime identity.
6. Update tests to prove IDs/fingerprints/order keys remain stable across harmless content insertion/reorder cases for Markdown/HTML/EPUB where feasible.
7. Do not modify lower-tier PDF/DOCX/OCR adapters except if a shared helper change requires non-behavioral compatibility updates.

## Expected verification

Focused first:

```bash
mise exec -- pnpm test:adapters
mise exec -- pnpm validate:ir
```

If package contracts or fixtures are touched:

```bash
mise exec -- pnpm --filter @tts-research/schema test:core
```

Before completion, parent orchestrator will run:

```bash
mise exec -- pnpm check
git diff --check
```

## Review gates

- Spec review: PASS (`deleg_f6f93e71`). Scope remained limited to Markdown/HTML/EPUB stable unit identity and shared adapter helpers/tests/snapshots; no QQP-425/427/428 implementation.
- Initial quality review: REQUEST_CHANGES (`deleg_51239600`). Important blockers: duplicate explicit HTML `id`/`name` values could produce duplicate node IDs; no-explicit-id HTML fallback identity churned on harmless sibling insertion.
- First repair: implemented by focused sub-agent `deleg_53340319`; parent probes/gates passed, but targeted quality re-review REQUEST_CHANGES (`deleg_f2d13c2f`) found remaining slug-colliding no-ID sibling insertion churn.
- Second repair: implemented by focused sub-agent `deleg_fb6c3c99`; parent probes confirmed duplicate explicit ID behavior and slug-colliding no-ID stability.
- Final quality re-review: QUALITY APPROVED (`deleg_74f3f163`). Critical: None. Important: None. Minor: None.
- Parent verification evidence before finalization: `node --test adapters/html/html-adapter.test.js`, `mise exec -- pnpm test:adapters`, `mise exec -- pnpm validate:ir`, `mise exec -- pnpm --filter @tts-research/schema test:core`, and `git diff --check` passed.
- Finalization repairs: formatting (`deleg_62974cce`), backend Content IR golden fixture drift (`deleg_0d73c878`), and prepared-source async job test lifecycle race (`deleg_8338fcff`) were resolved by focused sub-agents.
- Final gate: `mise exec -- pnpm check` passed after parent rerun; `git diff --check` passed.
