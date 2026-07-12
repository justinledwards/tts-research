# Contract Schema Changelog

## highlight-map.v2

Adds the canonical read-along timing artifact.

- Uses `schemaVersion: "highlight-map.v2"`.
- Binds each timing entry to source identity, scope, generated audio, speech plan, Content IR version, locator, node id, raw text, normalized text, spoken text, audio time, provider timing, aligned timing, timing source, confidence, drift budget, warnings, and fallback mode.
- Supports word, phrase, sentence, and block timing levels.
- Preserves `highlight-map.v1` for existing consumers while v2 becomes the contract for sync-quality validation.

## content-ir.v1

First public release.

- Uses `schemaVersion: "content-ir.v1"`.
- Defines EPUB provenance as `locator.type = "epub"` with an `epub` payload.
- Includes speech-facing fields on nodes: `pronunciationRefs`, `lexiconEntryIds`, `phoneme`, `alphabet`, `sayAs`, and `markId`.
- Supports stable references from `locator-envelope.v1` and `speech-plan.v1`.

## Pre-release internal v1

Some older checked-in and on-disk artifacts used the same `content-ir.v1` version string before the public contract was frozen. The backend reader upgrades those artifacts privately when it sees EPUB locators encoded with the older HTML payload shape. This pre-release shape is not documented as a public contract.
