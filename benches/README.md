# Local Benchmark Corpus

`fixtures.json` is the source of truth for local benchmark and E2E smoke inputs.
`thresholds.json` is the source of truth for pass/fail benchmark limits.

The tracked corpus is intentionally small:

- alignment uses the checked-in gold timing fixture under `backend/internal/alignment/testdata/gold/`;
- Markdown adapter benchmarks use stable parser fixtures under `fixtures/markdown/`;
- Book Cinema E2E uses tracked Markdown/PDF fixtures and generates tiny EPUB/DOCX containers under ignored `output/`.

Generated validation reports and runtime fixtures stay under `output/validate-local/` and are not committed.
