# EPUB Speech Fidelity

The EPUB adapter preserves speech-facing metadata into Content IR without changing the public schema. The checked-in fidelity test builds a synthetic EPUB in memory and compares the emitted speech metadata with `adapters/epub/testdata/speech-fidelity.golden.json`.

## Preserved Metadata

- Block-level `ssml:ph` becomes node `phoneme` and a pronunciation reference covering the node text.
- Inherited `ssml:alphabet` is applied to descendant pronunciation spans.
- `link rel="pronunciation"` entries are retained in document metadata and node metadata.
- Inline CSS Speech hints are retained in `metadata.cssSpeech`.
- Parseable inline `pause`, `pause-before`, and `pause-after` values are mapped into speech policy hints.
- Stylesheet rules containing CSS Speech declarations are preserved verbatim in document metadata.
- Media overlay references and best-effort EPUB CFI locators continue to roundtrip with the source spine item.

## Downgrades And Ignored Features

Stylesheet-level CSS Speech rules are preserved but not selector-cascaded onto individual nodes in v1. The preserved stylesheet text gives downstream processors enough information to apply a cascade later without losing the original signal.

External pronunciation lexicon files are referenced but not parsed during import. The adapter keeps the `href`, `type`, `hreflang`, title, and relation so a renderer can decide when to fetch or apply the lexicon.

Non-speech CSS declarations are intentionally ignored. CSS Speech values that require computed styles, media queries, or layout evaluation are retained as raw hints only when they are inline on the node.

EPUB CFI output is best effort. It is stable for local resume, bookmarks, and tests, but it is not a full structural EPUB CFI implementation.

## Targeted Validation

Run:

```sh
node --test adapters/epub/epub-adapter.test.js
```

The test covers `ssml:ph`, inherited `ssml:alphabet`, pronunciation lexicon links, inline CSS Speech hints, stylesheet preservation, media overlays, fragments, and best-effort EPUB CFI generation.
