# CLI Examples

```bash
voice-studio ir validate fixtures/contracts/markdown.content-ir.v1.json
voice-studio speech-plan build fixtures/contracts/markdown.content-ir.v1.json --out /tmp/speech-plan.json
voice-studio timing inspect --highlight-map fixtures/contracts/markdown.highlight-map.v1.json
```

API-backed commands use `--api-url`, then `VOICE_STUDIO_API_URL`, then `http://127.0.0.1:8080`.

```bash
voice-studio import --project default --file fixtures/markdown/plain.md --kind prepared --json
voice-studio bundle export default --out /tmp/default.voice-studio.zip
```
