# Node SDK Examples

Install local tarballs produced by `pnpm package:smoke` or `pnpm --filter <package> pack`.

```ts
import {
  VoiceStudioClient,
  buildSpeechPlanFromContentIR,
  validateContentIR,
} from "@tts-research/sdk-ts";

const client = new VoiceStudioClient({
  baseUrl: process.env.VOICE_STUDIO_API_URL ?? "http://127.0.0.1:8080",
});

const source = await client.importPreparedSource("default", {
  kind: "file",
  sourceName: "notes.md",
  text: "# Notes\n\nHello world.",
});

const contentIR = await client.getContentIR(source.id);
const validation = validateContentIR(contentIR);
if (!validation.valid) {
  throw new Error("Content IR failed validation");
}

const speechPlan = buildSpeechPlanFromContentIR(contentIR);
console.log(speechPlan.segments.length);
```
