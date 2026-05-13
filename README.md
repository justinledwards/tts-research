# TTS Research

A research scaffold for converting technical or long-form text into accurate listenable audio through a chain of typed agents.

## Stack

- Backend: Go Fiber
- Frontend: Vite, React, Tailwind, strict TypeScript
- Tooling: mise, pnpm, Biome, ESLint with SonarJS and Unicorn, Husky

## Quick Start

```sh
mise install
pnpm install
cd backend && uv sync && cd ..
pnpm start
```

The backend listens on `http://localhost:8080`.
The frontend listens on `http://localhost:5173`.

The default backend TTS provider is Kokoro and the default checker is local Qwen3-ASR.
Set `TTS_PROVIDER=mock` or `VOICE_CHECKER_PROVIDER=mock` when you want fast local fallback behavior.

`pnpm start` loads `.env` and `backend/.env` when present, fills local defaults, starts both servers, and stops both when you press `Ctrl-C`.
Use `pnpm start:mock` for a fast no-model smoke run.

## Checks

```sh
pnpm check
```

## Agent Pipeline

1. `VoiceOptimization` rewrites technical text so it flows naturally when spoken.
2. `TTSAgent` converts optimized text into audio.
3. `VoiceChecker` transcribes generated audio and compares it with optimized text.
4. The pipeline retries bounded cutoff recovery work when audio appears incomplete.

Long optimized text is split into smaller synthesis/checking segments with `VOICE_SEGMENT_MAX_RUNES`, which defaults to `300`.
The frontend subscribes to `GET /api/voice-jobs/:id/events` for server-sent progress updates while each segment runs.
Completed job audio is saved as `audio.wav` under `backend/data/jobs/<job-id>/` by default, with `metadata.json` next to it.

Kokoro synthesis uses `hexgrad/Kokoro-82M` through the Python `kokoro` package.
Local ASR checking uses `Qwen/Qwen3-ASR-1.7B` through the Python `qwen-asr` package.
The mock TTS path still generates silent WAV data so tests and fallback development work without model downloads.

## Voice Optimization

The backend defaults to `VOICE_OPTIMIZER_PROVIDER=auto`. In auto mode it uses OpenRouter when `OPENROUTER_API_KEY` is set, otherwise it falls back to the local rule-based optimizer.
OpenRouter optimization streams partial spoken-form output into the job over the existing job events stream.

```sh
export OPENROUTER_API_KEY
export OPENROUTER_MODEL=openrouter/free
export OPENROUTER_TIMEOUT_SECONDS=180
```

Use `VOICE_OPTIMIZER_PROVIDER=rules` to force the local optimizer, or `VOICE_OPTIMIZER_PROVIDER=openrouter` to fail fast when the key is missing.

## Voice Checking

The backend defaults to local Qwen ASR:

```sh
export VOICE_CHECKER_PROVIDER=qwen
export QWEN_ASR_MODEL=Qwen/Qwen3-ASR-1.7B
export QWEN_ASR_LANGUAGE=English
```

The checker accepts common short language codes such as `en`, detects clean cutoffs, retries remaining text up to the configured limit, and merges resumed WAV segments.
By default the Qwen checker runs as a persistent worker, so every segment is still verified by ASR without reloading the model for every segment.

For long local checks, prefer MPS on Apple Silicon when available:

```sh
export QWEN_ASR_DEVICE=mps
export QWEN_ASR_PERSISTENT=true
export QWEN_ASR_PRELOAD=true
export QWEN_ASR_TIMEOUT_SECONDS=600
```
