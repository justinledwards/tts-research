# Content IR Contract

`content-ir.v1` remains the default app, API, and on-disk compatibility contract. Existing callers of
`GET /api/content-ir/:id` receive v1 unless they explicitly request another version.

`content-ir.v1_1` is the additive SDK-facing contract:

- request with `GET /api/content-ir/:id?schemaVersion=content-ir.v1_1`;
- read existing v1 documents through the migration layer;
- down-convert v1_1 to v1 by removing v1_1-only node fields and mapping EPUB locators back to the v1 HTML payload.

## v1_1 Additions

- EPUB provenance uses `locator.type = "epub"` with an `epub` payload instead of an HTML payload.
- Nodes may expose `pronunciationRefs`, `lexiconEntryIds`, `phoneme`, `alphabet`, `sayAs`, and `markId`.
- Pronunciation refs carry stable lexicon entry IDs plus text offsets so SDKs can preserve custom terms across export/import.

Schemas live in `backend/internal/contentir/schema/`. Public examples live in `fixtures/contracts/`.

## Compatibility Rules

- v1 remains valid and readable.
- v1_1 is opt-in until SDKs are ready to depend on it.
- New serializers should consume v1_1, but should still accept v1 and run `v1 -> v1_1` migration before processing.
