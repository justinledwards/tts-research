# Repository Hygiene And Local History Rewrite

This repository should keep source code, tests, docs, and small fixtures tracked. Generated audio, downloaded models, provider caches, demo media, local upstream clones, and temporary QA artifacts should stay ignored.

## Daily Checks

```sh
mise doctor
mise run doctor
mise audit:secrets
mise audit:artifacts
```

`mise audit:secrets` scans tracked files and history diffs for common concrete token/private-key patterns such as Hugging Face tokens, GitHub PATs, OpenAI-style keys, and private keys.

`mise audit:artifacts` flags tracked generated/model/cache paths. On the current unrevised history, it is expected to flag the historical Kokoro model blobs until the isolated rewrite branch is evaluated.

## Pre-Merge Local Validation

Hosted GitHub Actions are intentionally disabled for now. Keep workflow examples under
`.github/workflows.examples/` or `.github/workflows.disabled/`, not `.github/workflows/`.

Use the fast lane while iterating:

```sh
mise run validate:local
```

Run browser QA separately when a change touches UI flows or reader behavior:

```sh
mise run validate:local:e2e
```

Before merging, use the release authority:

```sh
mise run validate:local:release
mise run bench:local
```

The generated report lives under ignored `output/validate-local/latest/`.

## Local Bloat Reports

Ignored runtime directories are allowed to be large, but their purpose should stay legible:

```sh
pnpm local:bloat
```

The report is written to `output/local-bloat/latest/` and separates safe generated outputs from
heavy runtime/model/dependency directories. To intentionally remove safe generated outputs:

```sh
pnpm local:clean
```

Cleanup removes `output/`, `backend/output/`, and generated job children under `backend/data/jobs`
older than 14 days by default. It does not remove provider runtimes, model caches, upstream clones,
dependencies, or demo media.

## Known Paths To Keep Out Of Git

- `.upstreams/`
- `backend/model/`
- `backend/voice/`
- `backend/model-cache/`
- `backend/.venv-*`
- `backend/data/`
- `backend/tmp/`
- `demo/`
- `output/`
- `.playwright-cli/`
- `.playwright-mcp/`

## Local-Only Rewrite Experiment

Do not push this rewrite branch until the team has agreed how to coordinate force-pushes and downstream clone recovery.

```sh
git switch host-setup
git status --short
git switch -c codex/history-rewrite-hygiene
mise clean:history:rewrite
```

The rewrite task refuses to run outside `codex/history-rewrite-hygiene`.
It creates a local backup bundle in `.git/history-rewrite-backups/`, then removes these tracked model blobs from that branch history:

- `backend/model/kokoro.onnx`
- `backend/voice/voices-v1.0.bin`

Verify the branch-local purge:

```sh
git ls-files | rg 'backend/model/kokoro.onnx|backend/voice/voices-v1.0.bin'
git rev-list --objects HEAD | rg 'backend/model/kokoro.onnx|backend/voice/voices-v1.0.bin'
mise audit:secrets
```

Because `host-setup` is intentionally preserved as the local recovery point, commands that inspect every local ref, such as `git rev-list --objects --all`, will still see old blobs until those recovery refs are removed. Use branch-specific verification while the safety refs are kept.

## Secret Response

If a real secret ever appears in a committed file or history:

1. Revoke or rotate the secret first.
2. Add the exact path/pattern to the rewrite plan.
3. Run the local rewrite branch flow.
4. Verify the branch-specific history no longer contains the secret.
5. Coordinate before any remote force-push.
