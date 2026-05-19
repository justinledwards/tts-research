# Browser SDK Examples

```ts
import { VoiceStudioClient, resolveHighlightCue } from "@tts-research/sdk-ts";

const client = new VoiceStudioClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
});

const map = await client.getHighlightMap("job-id");
const cue = resolveHighlightCue(map, audio.currentTime);

if (cue?.readingPosition) {
  console.log(cue.readingPosition.activeWordIndex);
}
```

Browser usage assumes the app or local dev proxy already handles API origin and CORS.
