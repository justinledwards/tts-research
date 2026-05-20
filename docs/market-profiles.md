# Market Profiles

Voice Studio policy profiles decide how prose and structured source elements become spoken reader text. `Enterprise` remains the default for existing and newly created projects.

## Override Order

Policy resolution has one precedence order across prepared sources, book sources, previews, jobs, Content IR speech plans, and reader explanations:

1. Session profile and session overrides win for the current preview or job request.
2. Explicit source pins on a prepared source or book source apply next and remain durable across project profile changes.
3. The project profile, including custom project profiles, is the default for unpinned sources.
4. `Enterprise` is the fallback when a project or profile cannot be resolved.

Old sources are not retroactively frozen. A source follows the current project profile until `sourceSpeechPolicyProfile` or `sourceSpeechPolicyOverrides` is set. Source pins can be cleared with the source speech-policy PATCH endpoints.

Reader and settings surfaces show project defaults, source pins, session overrides, and the current resolved profile as separate chips. See `docs/settings-scope.md` for shared scope labels and `docs/wayfinding-scope-ux.md` for the reader UI contract.

## Profile Matrix

| Profile | mode | tableMode | tableHeaderMode | codeMode | mathMode | footnoteMode | imageMode | captionMode | citationMode | listMarkerMode | admonitionMode | quoteMode |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Enterprise | speak | summary | column | skip | skip | onDemand | altFirst | speak | onDemand | omit | speak | speak |
| Education | speak | summary | column | summary | semantic | inline | describeShort | speak | inline | announce | speak | speak |
| Accessibility | speak | rowLinear | rowAndColumn | syntaxAware | semantic | inline | describeLong | speak | inline | announce | speak | speak |
| TechnicalDocs | speak | rowLinear | rowAndColumn | syntaxAware | literalsafe | endnote | altFirst | speak | endnote | announce | speak | speak |
| LanguageLearning | speak | summary | column | literal | semantic | inline | describeShort | speak | inline | announce | speak | speak |

## Reader Behaviour

Prose is spoken by default in every profile. Reader explanations use the same resolved policy trace as the serialized Content IR and speech plans.

Code is skipped in `Enterprise`, summarised in `Education`, read with syntax-aware framing in `Accessibility` and `TechnicalDocs`, and read literally in `LanguageLearning`.

Tables are summarised in `Enterprise`, `Education`, and `LanguageLearning`. `Accessibility` and `TechnicalDocs` read tables row by row and traverse row and column headers.

Math is skipped in `Enterprise`, read semantically in `Education`, `Accessibility`, and `LanguageLearning`, and read in literal-safe form in `TechnicalDocs`.

Captions, citations, admonitions, list markers, quotes, images, and notes are all public policy fields. When any of these are skipped, summarised, read literally, available on demand, or handled structurally, Book Cinema surfaces a Policy Note explaining why.

## API Fields

Prepared sources and book sources may include durable pins:

- `sourceSpeechPolicyProfile?: string`
- `sourceSpeechPolicyOverrides?: SpeechPolicyOverrides`

Session-level requests keep using:

- `speechPolicyProfile?: string`
- `speechPolicyOverrides?: SpeechPolicyOverrides`

Use `PATCH /api/source-preps/:id/speech-policy` or `PATCH /api/book-sources/:id/speech-policy` with `{ "profile": "...", "overrides": { ... } }` to set a source pin, or `{ "clear": true }` to clear it.
