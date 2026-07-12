# QQP-427 — Lower-tier adapter contract-fit reports

Status: complete
Linear: https://linear.app/niklas-olsson/issue/QQP-427/lower-tier-adapter-contract-fit-reports
Slug: `lower-tier-adapter-contract-fit`

## Selection rationale

QQP-427 is the next selected issue by the agreed first-batch manifest order after QQP-423, QQP-424, QQP-425, and QQP-426 are Done and pushed.

Dependency gate:

- QQP-423 `readalong-contracts` — Done.

QQP-427 is intentionally a lower-tier report/warning lane before deeper incremental runtime work. It keeps DOCX/PDF/OCR honest without claiming best-in-class behavior.

## Atomic deliverable

Produce deterministic contract-fit reports and warnings for non-core adapters without claiming best-in-class behavior.

## Scope

DOCX/PDF/OCR report/warning lane only:

- Add deterministic contract-fit reporting for DOCX, PDF, and OCR-adjacent extraction paths.
- Surface warnings/capability gaps for lower-tier adapters against the readalong sidecar / Content IR expectations.
- Keep reports machine-readable and deterministic enough for tests and future active-processing evidence gates.
- Include focused tests/fixtures that prove report contents and warning semantics.

Out of scope:

- No best-in-class DOCX/PDF/OCR extraction claims.
- No broad adapter rewrites.
- No HTML/EPUB/Markdown core-adapter runtime expansion.
- No manifest snapshot storage/API changes.
- No source/manifest event stream.
- No frontend source/manifest store.
- No audio artifact state implementation.
- No durable progress/resume resolver.
- No repair overlay, Quick Listen promotion, or active-processing evidence package beyond this issue's deterministic reports.

## Contract references

- `docs/contracts/readalong-sidecars.md`
- `docs/architecture/source-reader-flow-invariants.md`
- `docs/project-management/linear/tts-research-first-batch-atomicity-review.md`
- `docs/project-management/linear/tts-research-first-batch.draft.manifest.json`
- `docs/reviews/chatgpt/008-atomic-flow-linear-batch.response.md`
- Representative lower-tier fixtures and adapters:
  - `adapters/docx/`
  - `adapters/pdf/`
  - `adapters/pdf/ocr_with_ocrmypdf_or_tesseract.py`
  - `fixtures/contracts/ocr-image-set.*.json`

## Existing implementation context

- QQP-423 established readalong sidecar contracts and validation.
- QQP-426 made HTML/EPUB/Markdown core adapters emit stable unit identity.
- DOCX/PDF/OCR are explicitly lower-tier in this first batch and must not be represented as equivalent to core adapters.
- Existing adapter test entrypoints include:
  - `mise exec -- pnpm test:markdown-adapter` (covers JS adapters including DOCX/EPUB/HTML/Markdown)
  - `mise exec -- pnpm test:pdf-adapter`
  - `mise exec -- pnpm test:adapters`

## Implementation expectations

1. Keep implementation deterministic and report-focused.
2. Add or extend a small contract-fit report model/utility for lower-tier adapters rather than hiding warnings in unrelated runtime paths.
3. Reports should distinguish at least:
   - adapter/source kind;
   - supported contract features;
   - known gaps or degraded/lower-tier limitations;
   - warnings/non-claims;
   - evidence/fixture identifiers when available.
4. DOCX/PDF/OCR should be represented honestly as lower-tier / contract-fit report paths, not best-in-class extraction lanes.
5. Do not degrade existing adapter tests or public fixtures.
6. Add deterministic tests for report shape, warning contents, and non-claim behavior.
7. Prefer existing script/test conventions and keep generated output either in tracked fixture/report paths or generated in temp dirs during tests.

## Expected verification

Focused gates:

```bash
mise exec -- pnpm test:adapters
mise exec -- pnpm validate:ir
```

Likely additional focused gates depending on implementation:

```bash
mise exec -- pnpm test:markdown-adapter
mise exec -- pnpm test:pdf-adapter
mise exec -- pnpm test:scripts
```

Full gates before completion:

```bash
mise exec -- pnpm check
git diff --check
```

## Review gates

- Spec review PASS (`deleg_76d7fd87`): confirmed deterministic lower-tier DOCX/PDF/OCR contract-fit reports/warnings, OCR-adjacent coverage, focused tests, and no adjacent runtime scope creep or best-in-class claims.
- Quality review APPROVED (`deleg_25827e9f`): confirmed deterministic report ordering/deduplication, JS/Python report parity, DOCX/PDF/OCR integration, OCR routing, focused coverage, and no unrelated runtime changes.
- Parent focused gates before finalization passed:
  - `mise exec -- pnpm test:adapters`
  - `mise exec -- pnpm validate:ir`
  - `git diff --check`
- Final closeout gates before commit/push:
  - `mise exec -- pnpm check`
  - `git diff --check`
