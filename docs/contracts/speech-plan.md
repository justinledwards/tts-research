# Speech Plan Contract

`speech-plan.v1` is the canonical preprocessing output for synthesis, CLI, SDK, and future reader integrations.

Source-scoped plans are persisted beside `content-ir.json` as `speech-plan.v1.json` and exposed at:

```text
GET /api/content-ir/:id/speech-plan
```

Job-scoped plans capture session-resolved synthesis text and are exposed at:

```text
GET /api/voice-jobs/:id/speech-plan
```

Each segment includes ordered text, language, resolved speech policy, policy trace, locator envelope, pronunciation refs, lexicon entry IDs, and serializer targets for plain text, SSML, PLS refs, and highlight marks.

Policy trace order is explicit:

1. market profile default
2. project override
3. source override
4. session override

Only speakable segments are included. Skipped policy nodes remain represented in Content IR, but they do not become synthesis segments.
