# TTS Research

A research scaffold for converting technical or long-form text into accurate listenable audio through a chain of typed agents.

## Stack

- Backend: Go Fiber
- Frontend: Vite, React, Tailwind, strict TypeScript
- Tooling: mise, pnpm, Biome, ESLint with SonarJS and Unicorn, Husky

## Quick Start

```sh
mise install
mise setup
mise start
```

Use `mise doctor` for the built-in mise health check, then `mise run doctor` for Voice Studio runtime directories, provider setup, and tracked artifact hygiene.
Provider setup and repo cleanup details live in [docs/runtime-setup.md](docs/runtime-setup.md) and [docs/repo-hygiene.md](docs/repo-hygiene.md).

### Fast Resume (local providers, no fallback)

```sh
LOCAL_FALLBACK_ON_BOOTSTRAP_FAILURE=0 TTS_PROVIDER=kokoro VOICE_CHECKER_PROVIDER=qwen mise start -- pnpm start:local
```

The backend listens on `http://localhost:8080`.
The frontend listens on `http://localhost:5173`.

The default startup path is self-contained: rules-based optimization, mock TTS, and mock checking.
That gives you a usable full stack without external providers or model downloads.

`mise start` runs a preflight check and then starts the same stack as `pnpm start`.
Pass an alternate startup command with `--`:

```sh
mise start -- pnpm start:local
TTS_PROVIDER=kokoro VOICE_CHECKER_PROVIDER=qwen mise start
```

If you want startup to fail loudly instead of falling back to mock providers when a local bootstrap step runs out of disk or fails, set:

```sh
LOCAL_FALLBACK_ON_BOOTSTRAP_FAILURE=0 mise start -- pnpm start:local
```

`pnpm start` loads `.env` and `backend/.env` when present, fills local defaults, starts both servers, and stops both when you press `Ctrl-C`.
Use `pnpm start:local` to run with the local Kokoro + Qwen stack (local model downloads) using the rules optimizer.
This local startup path also provisions optional KokoClone dependencies required for reference-voice synthesis on first run.
Use `pnpm start:local-bonsai` for Bonsai optimization on macOS.
Use `pnpm start:mock` for an explicit mock-only mode.
Reference-voice synthesis requirements are resolved from your KokoClone checkout (`.koko-clone`) and automatically installed when missing, then cached in the active backend environment.
Use `mise setup:supertonic` to install the isolated Supertonic 3 runtime and run a Swedish smoke synthesis in ignored local output.
Use `mise setup:dramabox` to clone DramaBox as an ignored upstream and report diagnostics; local inference stays gated unless you explicitly opt into heavy dependency install or configure `DRAMABOX_BASE_URL`.
Use targeted provider flags to avoid installing unnecessary providers for local work:

```sh
TTS_PROVIDER=kokoro VOICE_CHECKER_PROVIDER=mock pnpm start
TTS_PROVIDER=mock VOICE_CHECKER_PROVIDER=qwen pnpm start
```

Equivalent with `mise start`:

```sh
TTS_PROVIDER=kokoro VOICE_CHECKER_PROVIDER=qwen LOCAL_FALLBACK_ON_BOOTSTRAP_FAILURE=0 mise start -- pnpm start:local
```

### Tmpfs / shm (Linux)

`pnpm start` defaults to tmpfs-backed working directories for Kokoro/Qwen when `/dev/shm` is available. This keeps transient scratch I/O in RAM and only persists final audio outputs in `VOICE_JOB_DATA_DIR` (`./data/jobs` by default).
It also uses a tmpfs-backed temporary directory (`TMPDIR`) by default in that mode, which avoids large pip wheel extractions from filling disk.

If you need to disable tmpfs usage:

```sh
export TTS_RESEARCH_USE_TMPFS=0
```

This routes transient Kokoro/Qwen working directories to RAM. Use only if you have enough free memory:
- per-job segment WAVs and temporary ASR inputs are written there,
- UV and pip caches are moved to `${TTS_RESEARCH_TMPFS_ROOT}/uv-cache` and `${TTS_RESEARCH_TMPFS_ROOT}/pip-cache` by default.

If you prefer to keep caches on disk, override them before launch:

```sh
export UV_CACHE_DIR=~/.cache/uv
export PIP_CACHE_DIR=~/.cache/pip
```

You can also keep Hugging Face caches on RAM if your provider/runtime supports it:

```sh
export TTS_RESEARCH_TMPFS_HF_CACHE=1
```

That moves HF cache directories (if the providers use them) into `${TTS_RESEARCH_TMPFS_ROOT}`.

Python package installs are still required for any local provider and are cached by `uv` after the first successful bootstrap.
Model files are downloaded separately by the providers (`hexgrad/Kokoro-82M`, `Qwen/Qwen3-ASR-1.7B`) and are usually the largest remaining download.
If local runtime bootstrap runs out of disk or otherwise fails, startup will not keep retrying package downloads and falls back to mock providers unless you set:

```sh
export LOCAL_FALLBACK_ON_BOOTSTRAP_FAILURE=0
```

If package install IO is still a bottleneck, you can pin Python caches to your tmpfs mount too:

```sh
export TTS_RESEARCH_TMPDIR=/dev/shm/tts-research/tmp
export UV_CACHE_DIR=/dev/shm/tts-research/uv-cache
export PIP_CACHE_DIR=/dev/shm/tts-research/pip-cache
export HF_HOME=/dev/shm/tts-research/hf
```

## Checks

```sh
pnpm check
```

`pnpm check` stays the fast commit-time guard used by Husky. Before merging, run the local
validation authority:

```sh
mise doctor
mise run validate:local
mise run bench:local
```

Equivalent pnpm entrypoints are available:

```sh
pnpm validate:local
pnpm bench:local
pnpm e2e:book-cinema
```

Validation writes `output/validate-local/latest/summary.json`, `report.md`, `report.html`, and
per-step logs. Benchmark fixtures and thresholds are checked in under `benches/`.

## Agent Pipeline

1. `VoiceOptimization` rewrites technical text so it flows naturally when spoken.
2. `TTSAgent` converts optimized text into audio.
3. `VoiceChecker` transcribes generated audio and compares it with optimized text.
4. The pipeline retries bounded cutoff recovery work when audio appears incomplete.

Long optimized text is split into smaller synthesis/checking segments with `VOICE_SEGMENT_MAX_RUNES`, which defaults to `300`.
Reference-voice cloning jobs use `VOICE_SEGMENT_WORKERS_STUDIO` / `VOICE_SEGMENT_MAX_RUNES_STUDIO` for throughput tuning.
By default, studio concurrency is capped at 2 workers to avoid memory pressure; tune it with `VOICE_SEGMENT_WORKERS` / `VOICE_SEGMENT_WORKERS_STUDIO` and adaptive counterparts if your GPU headroom allows.
The frontend subscribes to `GET /api/voice-jobs/:id/events` for server-sent progress updates while each segment runs.
Completed job audio is saved as `audio.wav` under `backend/data/jobs/<job-id>/` by default, with `metadata.json` next to it.

Kokoro synthesis uses `hexgrad/Kokoro-82M` through the Python `kokoro` package.
Local voice optimization uses `prism-ml/Bonsai-8B-mlx-1bit` through MLX when the bonsai optimizer is selected; otherwise it uses local rules optimization.
Local ASR checking uses `Qwen/Qwen3-ASR-1.7B` through the Python `qwen-asr` package.
The mock TTS path still generates silent WAV data so tests and fallback development work without model downloads.

### KokoClone / FlashAttention bootstrap

Reference-voice synthesis (`VoiceProfileID` jobs) can use FlashAttention if present, but it is optional.
To avoid long source builds, keep the bootstrap binary-only and opt-in:

```sh
export KOKOCLONE_PYTHON_PATH=./backend/.venv-kokoclone/bin/python
export KOKOCLONE_PYTHON_VERSION=3.11
export KOKOCLONE_BOOTSTRAP_FLASH_ATTENTION_ON_BOOT=1
export KOKOCLONE_FLASH_ATTENTION_WHEEL_ONLY=1
export KOKOCLONE_ALLOW_FLASH_ATTENTION_SOURCE=0
export KOKOCLONE_INSTALL_FLASH_ATTENTION=1
```

If your main backend remains on Python 3.13, this split runtime keeps the heavy clone/FlashAttention stack isolated so it can run on a 3.11 interpreter while the rest of TTS Research stays on the primary env.

For fastest startup with no clone dependency cost:

```sh
export KOKOCLONE_BOOTSTRAP_FLASH_ATTENTION_ON_BOOT=0
```

If no compatible wheel exists, startup continues with SDPA fallback unless `KOKOCLONE_REQUIRE_FLASH_ATTENTION=1`.

## Custom Voice Profiles

Create cloned voice profiles in **Voice Studio** from the left rail.
Upload any file containing an audio stream (audio-only or video containers), and the backend normalizes it once for speaker-aware source analysis.
The review-first source flow uses local pyannote diarization to detect voices, score clean single-speaker spans, build preview clips, and compile bounded reference WAV candidates.
Users can preview, name, and create one or more profiles from the detected speakers in a single source file.
Speaker-aware analysis requires `PYANNOTE_AUTH_TOKEN` or `HF_TOKEN`; without a token the source analysis fails clearly and does not create lower-quality profiles silently.
Install the optional Python stack with `uv sync --extra profile-analysis` inside `backend/`.
Reference candidates target `VOICE_PROFILE_REFERENCE_TARGET_SECONDS` (default `45`) and must fall between `VOICE_PROFILE_REFERENCE_MIN_SECONDS` (default `20`) and `VOICE_PROFILE_REFERENCE_MAX_SECONDS` (default `60`).
Set `VOICE_PROFILE_MAX_BYTES` to a positive byte count to enforce a local upload cap; the default `0` leaves reference media size up to disk/runtime capacity.
Profile metadata includes source duration, reference duration, selected span manifest, source speaker, reference score, and clone-quality metrics.

## Voice Optimization

The default mock startup uses `VOICE_OPTIMIZER_PROVIDER=rules` (no external dependencies).
To run Bonsai locally, set `VOICE_OPTIMIZER_PROVIDER=bonsai`.
`pnpm start` creates a separate `backend/.venv-bonsai` environment for Bonsai because `mlx-lm` and `qwen-asr` currently require incompatible `transformers` versions.

```sh
export VOICE_OPTIMIZER_PROVIDER=bonsai
export BONSAI_MODEL=prism-ml/Bonsai-8B-mlx-1bit
export BONSAI_PRELOAD=true
```

`start:local-bonsai` is currently supported on macOS only. On Linux, Bonsai/MLX builds are not supported.

The Bonsai dependency requires the Xcode Metal toolchain:

```sh
xcodebuild -downloadComponent metalToolchain
```

Use `VOICE_OPTIMIZER_PROVIDER=rules` to force the simple local rules optimizer, or `VOICE_OPTIMIZER_PROVIDER=openrouter` to use OpenRouter explicitly when `OPENROUTER_API_KEY` is set.

## Voice Checking

By default, the mock startup path uses `VOICE_CHECKER_PROVIDER=mock`.
For local ASR verification set `VOICE_CHECKER_PROVIDER=qwen`:

```sh
export VOICE_CHECKER_PROVIDER=qwen
export QWEN_ASR_MODEL=Qwen/Qwen3-ASR-1.7B
export QWEN_ASR_LANGUAGE=English
```

The checker accepts common short language codes such as `en`, detects clean cutoffs, retries remaining text up to the configured limit, and merges resumed WAV segments.
By default the Qwen checker runs as a persistent worker, so every segment is still verified by ASR without reloading the model for every segment.

Kokoro uses `KOKORO_DEVICE` and Qwen uses `QWEN_ASR_DEVICE`. Both default to `auto`, so they prefer CUDA first and then MPS/CPU.
You can pin a platform explicitly when needed.

For NVIDIA GPUs, request CUDA explicitly:

```sh
export KOKORO_DEVICE=cuda
export QWEN_ASR_DEVICE=cuda
```

For Apple Silicon, prefer `mps` when you want explicit Metal acceleration:

```sh
export KOKORO_DEVICE=mps
export QWEN_ASR_DEVICE=mps
export KOKORO_TIMEOUT_SECONDS=180
export KOKORO_REFERENCE_TIMEOUT_SECONDS=180
export KOKORO_REFERENCE_WORKER_READY_TIMEOUT_SECONDS=180
```

If CUDA is available but detection still reports `cpu`, confirm your Torch build supports CUDA:

```sh
cd backend
./.venv/bin/python - <<'PY'
import torch
print("torch", torch.__version__)
print("cuda", torch.version.cuda, torch.cuda.is_available())
PY
```

To enable the long-checker defaults and persistence you may also want:

```sh
export QWEN_ASR_PERSISTENT=true
export QWEN_ASR_PRELOAD=true
export QWEN_ASR_TIMEOUT_SECONDS=600
```
