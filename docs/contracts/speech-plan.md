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

## Serialisation Example

Every segment carries enough data for consumers to serialise speech and restore highlights without re-reading the source document.

```json
{
  "schemaVersion": "speech-plan.v1",
  "id": "contract-markdown",
  "sourceId": "contract-markdown",
  "projectId": "default",
  "generatedAt": "2026-05-17T01:00:00Z",
  "segments": [
    {
      "segmentId": "seg-0001",
      "index": 1,
      "nodeId": "md-0001",
      "text": "Doctor Nguyen shipped version one.",
      "lang": "en",
      "speechPolicy": {
        "profile": "Enterprise",
        "mode": "speak",
        "explanation": "Prose is spoken."
      },
      "policyTrace": [{ "scope": "marketProfileDefault", "profile": "Enterprise" }],
      "locatorEnvelope": {
        "schemaVersion": "locator-envelope.v1",
        "kind": "highlight",
        "sourceId": "contract-markdown",
        "nodeId": "md-0001"
      },
      "serializerTargets": {
        "plainText": "Doctor Nguyen shipped version one.",
        "ssml": "<speak version=\"1.0\" xml:lang=\"en\">Doctor Nguyen shipped version one.</speak>",
        "highlightMarks": [{ "markId": "mark-md-0001", "nodeId": "md-0001" }]
      }
    }
  ]
}
```
