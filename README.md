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

The default local stack is Bonsai for pre-TTS text optimization, Kokoro for speech synthesis, and Qwen3-ASR for verification.
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

Long optimized text is split into smaller synthesis/checking segments with `VOICE_SEGMENT_MAX_RUNES`, which defaults to `220`.
The backend runs up to `TTS_WORKER_COUNT=2` synthesis workers by default and publishes contiguous verified audio as soon as it is ready, so playback can begin before the whole job completes.
The frontend subscribes to `GET /api/voice-jobs/:id/events` for server-sent progress updates while each segment runs.
Completed job audio is saved as `audio.wav` under `backend/data/jobs/<job-id>/` by default, with `metadata.json` next to it.

Kokoro synthesis uses `hexgrad/Kokoro-82M` through the Python `kokoro` package.
Built-in Kokoro voices and uploaded KokoClone reference voices are exposed through `GET /api/voices`.
Clone uploads use `POST /api/voices` with an audio or video file; `ffmpeg` extracts the first audio stream and writes a mono 24 kHz PCM WAV reference under `backend/data/voices/`.
Local voice optimization uses `prism-ml/Bonsai-8B-mlx-1bit` through MLX and streams partial rewritten text into the job state.
Local ASR checking uses `Qwen/Qwen3-ASR-1.7B` through the Python `qwen-asr` package.
The mock TTS path still generates silent WAV data so tests and fallback development work without model downloads.

## Voice Optimization

The backend defaults to `VOICE_OPTIMIZER_PROVIDER=bonsai`, which keeps the pre-TTS rewrite fully local on Apple Silicon through the Prism MLX fork.
`pnpm start` creates a separate `backend/.venv-bonsai` environment for Bonsai because `mlx-lm` and `qwen-asr` currently require incompatible `transformers` versions.

```sh
export VOICE_OPTIMIZER_PROVIDER=bonsai
export BONSAI_MODEL=prism-ml/Bonsai-8B-mlx-1bit
export BONSAI_PRELOAD=true
```

The Bonsai dependency requires the Xcode Metal toolchain:

```sh
xcodebuild -downloadComponent metalToolchain
```

Use `VOICE_OPTIMIZER_PROVIDER=rules` to force the simple local rules optimizer, or `VOICE_OPTIMIZER_PROVIDER=openrouter` to use OpenRouter explicitly when `OPENROUTER_API_KEY` is set.

## Voices And Cloning

The voice picker includes built-in Kokoro voices plus local cloned voices. Uploaded clone clips are converted with `ffmpeg`, stored locally, and used as KokoClone reference audio when that voice is selected.

```sh
export TTS_WORKER_COUNT=2
export VOICE_DATA_DIR=./data/voices
export KOKOCLONE_REPO_DIR=./data/kokoclone/repo
```

`pnpm start` clones `Ashish-Patnaik/kokoclone` into `backend/data/kokoclone/repo` when needed and installs the extra Python dependencies into the backend virtual environment.

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
