# Content IR Contract

`content-ir.v1` is the first public Content IR release and the default app, API, on-disk, SDK, and fixture contract.

Fetch it with:

```text
GET /api/content-ir/:id
GET /api/content-ir/:id?schemaVersion=content-ir.v1
```

The released v1 shape includes:

- format-specific locators for Markdown, HTML, EPUB, PDF, DOCX, and OCR/image sources;
- EPUB provenance as `locator.type = "epub"` with an `epub` payload;
- speech-facing fields such as `pronunciationRefs`, `lexiconEntryIds`, `phoneme`, `alphabet`, `sayAs`, and `markId`;
- resolved `speech.speechPolicy` alongside adapter policy hints.

Older in-repo pre-release v1 documents are still accepted by the backend reader and normalized into the released v1 shape. They are not a public compatibility target.

Public schemas live in `backend/internal/contentir/schema/`. Generated schema bundles live in `docs/contracts/schema-bundle.v1.json`. Golden examples live in `fixtures/contracts/`.

## Migration Notes

- Consumers should treat `content-ir.v1` as stable.
- Producers must emit EPUB locators using the `epub` payload, not the older EPUB-as-HTML payload.
- Future breaking changes require a new schema version such as `content-ir.v2`.
