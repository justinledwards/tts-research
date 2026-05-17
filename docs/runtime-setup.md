# Reproducible Local Runtime Setup

Voice Studio uses `mise` as the top-level reproducibility surface. The goal is that a new local machine can install pinned tools, create ignored runtime directories, install optional provider environments, and run diagnostics without modifying upstream checkouts or committing generated data.

## Base Commands

```sh
mise install
mise setup
mise doctor
mise run doctor
mise start -- pnpm start:local
```

`mise setup` installs Node dependencies when missing, syncs the backend Python environment needed for Book Cinema/source extraction, and creates ignored local runtime folders.

`mise doctor` is the built-in mise health check. `mise run doctor` prints the Voice Studio state of core tools, `ffmpeg`, `pdftotext`, provider environments, ignored runtime paths, and tracked model artifacts.

## Ignored Runtime Layout

- `backend/data/` stores generated jobs, profiles, projects, books, source preps, and progress.
- `backend/model-cache/` stores provider model caches such as Supertonic.
- `backend/.venv-*` stores provider-specific Python environments.
- `.upstreams/` stores cloned upstream projects used for evaluation.
- `output/` stores local smoke-test audio and QA screenshots.

These paths are intentionally ignored. They should be recreated through `mise` tasks, not committed.

## Supertonic 3

Supertonic is the first practical local multilingual evaluation engine in this repo. It runs through an isolated Python environment and the existing backend worker script.

```sh
mise setup:supertonic
```

The task creates `backend/.venv-supertonic`, installs the `supertonic` package, prepares `backend/model-cache/supertonic`, runs diagnostics, and runs a Swedish smoke synthesis by default:

```text
Det var en kylig kväll i Stockholm. Ljuset från gatlyktorna speglade sig i vattnet medan hon öppnade boken och började läsa.
```

The generated smoke WAV is written under ignored `output/supertonic/`.

Useful environment values:

```sh
export SUPERTONIC_PYTHON=./.venv-supertonic/bin/python
export SUPERTONIC_SCRIPT_PATH=./scripts/supertonic_synth.py
export SUPERTONIC_MODEL_DIR=./model-cache/supertonic
export SUPERTONIC_AUTO_DOWNLOAD=true
export SUPERTONIC_DEFAULT_VOICE=M1
export SUPERTONIC_DEFAULT_LANG=sv
export SUPERTONIC_SKIP_SMOKE=1
```

`SUPERTONIC_AUTO_DOWNLOAD=true` is useful for first setup. After the model cache exists, you can set it to `false` for offline-style runs.

## Optional Voice Embed Artifacts

Voice clone artifact modules are optional local research integrations. The app never vendors or
bundles these upstreams. On startup, the UI can prompt the user to clone them into ignored paths:

- `.upstreams/supertonic.embed`
- `.upstreams/kokoro.embed`

Create the isolated artifact-building environment separately from synthesis runtimes:

```sh
mise setup:voice-embed
```

That command creates `backend/.venv-voice-embed` and leaves heavy CUDA/PyTorch dependency
installation off by default. After reviewing the upstream requirements, opt in intentionally:

```sh
VOICE_EMBED_INSTALL_DEPS=1 mise setup:voice-embed
```

Useful environment values:

```sh
export RESEARCH_MODULE_BASE_DIR=../.upstreams
export SUPERTONIC_EMBED_LOCAL_PATH=../.upstreams/supertonic.embed
export KOKORO_EMBED_LOCAL_PATH=../.upstreams/kokoro.embed
export VOICE_PROFILE_ARTIFACT_PYTHON_PATH=./.venv-voice-embed/bin/python
export VOICE_PROFILE_ARTIFACT_SCRIPT_PATH=./scripts/profile_embed_artifact.py
export VOICE_PROFILE_ARTIFACT_TIMEOUT_SECONDS=3600
```

The app stores built artifacts under each voice profile directory as ignored local data. Current
Kokoro Clone and Supertonic preset rendering remain available when no artifact exists.

## DramaBox

DramaBox is treated as an experimental engine because its documented hardware footprint is not a good default for consumer 8 GB GPU systems.

```sh
mise setup:dramabox
```

The task clones the upstream into ignored `.upstreams/DramaBox`, creates an ignored diagnostic environment, and stops there. It does not modify the upstream project and it does not install or start heavy local inference by default.

Preferred evaluation mode:

```sh
export DRAMABOX_BASE_URL=http://localhost:9000
mise start -- pnpm start:local
```

Only opt into local dependency installation intentionally:

```sh
DRAMABOX_INSTALL_DEPS=1 mise setup:dramabox
```

## iOS / Upstream Safety

Any upstream repository used for evaluation belongs under `.upstreams/` and stays ignored. Do not patch upstream install scripts in place for this app. If a platform-specific upstream needs changes, make a separate fork or a local patch file and document it before applying.

## PDF, OCR, Image, And Scholarly Extraction

Book Cinema routes PDFs and standalone image batches through `adapters/pdf/cli.py`. The adapter uses
a tiered local pipeline: tagged PDFs, born-digital geometry extraction, OCR for scanned sources,
ordered image OCR, and an opt-in scholarly profile for GROBID-style extraction.

`mise start -- pnpm start:local` checks `pdftotext` and the managed Python adapter. Optional local
tools improve coverage when installed: PyMuPDF, pdfplumber, OCRmyPDF, Tesseract, GROBID,
layoutparser, and docTR. Missing optional tools are reported in adapter diagnostics instead of
blocking non-OCR imports.

Set strict mode when a host must fail fast:

```sh
export VOICE_BOOK_PDF_REQUIRE_TEXT_EXTRACTOR=1
mise start -- pnpm start:local
```

Run the offline adapter fixture suite with:

```sh
pnpm test:pdf-adapter
```
