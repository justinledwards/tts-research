# Reproducible Local Runtime Setup

Voice Studio uses `mise` as the top-level reproducibility surface. The goal is that a new local machine can install pinned tools, create ignored runtime directories, install optional provider environments, and run diagnostics without modifying upstream checkouts or committing generated data.

## Base Commands

```sh
mise install
mise setup
mise doctor
pnpm start:mock
mise run doctor
mise start -- pnpm start:local
```

`mise setup` installs Node dependencies when missing, syncs the backend Python environment needed for Book Cinema/source extraction, and creates ignored local runtime folders.

Use `pnpm start:mock` for the first run. It starts the same app with deterministic mock providers so
contributors can open **Try the Studio** and walk through Intake, Review, Preview, Teleprompt, and
Cinema without external services. See `docs/first-run-demo.md` and `docs/contributor-quickstart.md`.

`mise doctor` is the built-in mise health check. `mise run doctor` prints the Voice Studio state of core tools, `ffmpeg`, `pdftotext`, provider environments, ignored runtime paths, and tracked model artifacts.

## Local Validation Authority

Use the fast local validation lane during normal development. It runs format, lint, typecheck,
package checks, adapter tests, backend/frontend tests, Content IR validation, package smoke, and
CLI parity without launching browser QA:

```sh
mise doctor
mise run validate:local
```

Run browser QA as its own lane when UI flows, reader behavior, responsive layouts, accessibility,
or action inventory coverage are in scope:

```sh
mise run validate:local:e2e
```

The E2E lane starts one mock backend and one Vite server, then passes
`E2E_USE_EXISTING_SERVERS=1`, `E2E_API_BASE_URL`, and `E2E_APP_BASE_URL` into the browser scripts so
each suite reuses the same service pair.

Before merging, use the release lane. It preserves the former local validation authority:
fast checks, frontend bundle budget, alignment benchmark, browser QA, accessibility gate artifacts,
and generated reports.

```sh
mise run validate:local:release
mise run bench:local
```

The same entrypoints are available through pnpm:

```sh
pnpm validate:local
pnpm validate:local:e2e
pnpm validate:local:release
pnpm bench:local
pnpm e2e:book-cinema
```

Reports are written under `output/validate-local/latest/`:

- `summary.json` is the machine-readable contract;
- `report.md` and `report.html` are generated from that JSON;
- `logs/` and `artifacts/` contain per-step logs and E2E screenshots.

Benchmark fixtures and thresholds live in `benches/`. GitHub Actions templates are intentionally
disabled under `.github/workflows.examples/` and `.github/workflows.disabled/`; there is no active
`.github/workflows/` gate.

## Ignored Runtime Layout

- `backend/data/` stores generated jobs, profiles, projects, books, source preps, and progress.
- `backend/model-cache/` stores provider model caches such as Supertonic.
- `backend/.venv-*` stores provider-specific Python environments.
- `.venv-kokoclone` stores the isolated KokoClone runtime and can be several GiB.
- `.upstreams/` stores cloned upstream projects used for evaluation.
- `output/` stores local smoke-test audio and QA screenshots.

These paths are intentionally ignored. They should be recreated through `mise` tasks, not committed.
Use `pnpm local:bloat` to inspect their current sizes. Use `pnpm local:clean` only for safe
generated output cleanup; it reports but does not remove Python runtimes, model caches, upstream
clones, dependencies, or demo media.

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
