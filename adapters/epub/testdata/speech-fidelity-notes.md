# EPUB Speech Fidelity Fixture Notes

This fixture documents the v1 EPUB adapter contract for speech-facing metadata.

## Preserved

- `ssml:ph` on block elements is preserved as node-level `phoneme` and as a pronunciation reference covering the node text.
- `ssml:alphabet` is inherited by descendant pronunciation spans and preserved on generated pronunciation references.
- `link rel="pronunciation"` references are preserved in document metadata and on node metadata for consuming renderers.
- Inline CSS Speech declarations such as `speak-as`, `pause`, `pause-before`, `pause-after`, and `voice-rate` are preserved on node metadata. Pause values are mapped into policy hints when they are parseable CSS times.
- Stylesheet rules containing CSS Speech properties are preserved verbatim in document metadata.

## Downgraded

- EPUB CFIs are best-effort locators derived from spine and fragment ids. They are stable for tests and local resume, but are not a full EPUB CFI structural traversal.
- Stylesheet-level CSS Speech rules are retained for roundtrip visibility but are not selector-cascaded onto individual nodes in v1.

## Intentionally Ignored In V1

- Non-speech CSS declarations are not copied into `cssSpeech`.
- CSS Speech values that require a cascade, computed style, or media query evaluation are not applied to node hints.
- External pronunciation lexicon contents are referenced but not parsed during EPUB import.
