#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
SUPERTONIC_VENV="${SUPERTONIC_VENV:-$BACKEND_DIR/.venv-supertonic}"
SUPERTONIC_MODEL_DIR="${SUPERTONIC_MODEL_DIR:-$BACKEND_DIR/model-cache/supertonic}"
ALIGNMENT_AENEAS_VENV="${ALIGNMENT_AENEAS_VENV:-$BACKEND_DIR/.venv-aeneas}"
ALIGNMENT_MFA_ENV="${ALIGNMENT_MFA_ENV:-tts-research-mfa}"
ALIGNMENT_GENTLE_IMAGE="${ALIGNMENT_GENTLE_IMAGE:-lowerquality/gentle}"
DRAMABOX_DIR="${DRAMABOX_DIR:-$ROOT_DIR/.upstreams/DramaBox}"
DRAMABOX_VENV="${DRAMABOX_VENV:-$BACKEND_DIR/.venv-dramabox}"
HISTORY_REWRITE_BRANCH="codex/history-rewrite-hygiene"
PURGED_PATHS=(
  "backend/model/kokoro.onnx"
  "backend/voice/voices-v1.0.bin"
)

run_with_mise() {
  if command -v mise >/dev/null 2>&1; then
    mise exec -- "$@"
    return
  fi

  "$@"
}

command_status() {
  local command_name="$1"
  if command -v "$command_name" >/dev/null 2>&1; then
    printf "available (%s)" "$(command -v "$command_name")"
  else
    printf "missing"
  fi
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

ensure_local_dirs() {
  mkdir -p \
    "$BACKEND_DIR/data" \
    "$BACKEND_DIR/model-cache" \
    "$BACKEND_DIR/tmp" \
    "$ROOT_DIR/output" \
    "$ROOT_DIR/.upstreams"
  touch "$BACKEND_DIR/data/.gitkeep"
}

sync_node_deps() {
  if [[ -d "$ROOT_DIR/node_modules" && -d "$ROOT_DIR/frontend/node_modules" ]]; then
    echo "Node dependencies already present."
    return
  fi

  echo "Installing Node dependencies..."
  (cd "$ROOT_DIR" && run_with_mise pnpm install)
}

sync_backend_base_python() {
  echo "Syncing backend Python dependencies for book/source tooling..."
  if ! (cd "$BACKEND_DIR" && run_with_mise uv sync --frozen --inexact --extra book); then
    (cd "$BACKEND_DIR" && run_with_mise uv sync --inexact --extra book)
  fi
}

setup_base() {
  require_command git
  require_command pnpm
  require_command uv
  ensure_local_dirs
  sync_node_deps
  sync_backend_base_python
  echo "Base setup complete."
}

supertonic_python() {
  printf "%s/bin/python" "$SUPERTONIC_VENV"
}

setup_supertonic() {
  require_command uv
  ensure_local_dirs
  mkdir -p "$SUPERTONIC_MODEL_DIR"

  if [[ ! -x "$(supertonic_python)" ]]; then
    echo "Creating Supertonic 3 environment at $SUPERTONIC_VENV..."
    run_with_mise uv venv --python "${SUPERTONIC_PYTHON_VERSION:-3.12}" "$SUPERTONIC_VENV"
  fi

  if ! "$(supertonic_python)" -c "import supertonic" >/dev/null 2>&1; then
    echo "Installing Supertonic SDK..."
    run_with_mise uv pip install --python "$(supertonic_python)" supertonic
  fi

  echo "Supertonic diagnostics:"
  (
    cd "$BACKEND_DIR"
    SUPERTONIC_MODEL_DIR="$SUPERTONIC_MODEL_DIR" \
      SUPERTONIC_AUTO_DOWNLOAD="${SUPERTONIC_AUTO_DOWNLOAD:-true}" \
      "$(supertonic_python)" ./scripts/supertonic_synth.py --diagnostics
  )

  if [[ "${SUPERTONIC_SKIP_SMOKE:-0}" == "1" ]]; then
    echo "Skipping Swedish smoke synthesis (SUPERTONIC_SKIP_SMOKE=1)."
    return
  fi

  local smoke_dir="$ROOT_DIR/output/supertonic"
  local text_file="$smoke_dir/swedish-smoke.txt"
  local output_wav="$smoke_dir/swedish-smoke.wav"
  mkdir -p "$smoke_dir"
  printf 'Det var en kylig kväll i Stockholm. Ljuset från gatlyktorna speglade sig i vattnet medan hon öppnade boken och började läsa.\n' >"$text_file"

  echo "Running Supertonic Swedish smoke synthesis..."
  (
    cd "$BACKEND_DIR"
    "$(supertonic_python)" ./scripts/supertonic_synth.py \
      --text-file "$text_file" \
      --output "$output_wav" \
      --voice-style "${SUPERTONIC_DEFAULT_VOICE:-M1}" \
      --lang "${SUPERTONIC_DEFAULT_LANG:-sv}" \
      --model-dir "$SUPERTONIC_MODEL_DIR" \
      --auto-download "${SUPERTONIC_AUTO_DOWNLOAD:-true}"
  )
  echo "Wrote ignored smoke output: $output_wav"
}

setup_dramabox() {
  require_command git
  require_command uv
  ensure_local_dirs

  if [[ -n "${DRAMABOX_BASE_URL:-}" ]]; then
    echo "DramaBox warm server endpoint configured: $DRAMABOX_BASE_URL"
    echo "Local heavy runtime bootstrap is not required."
    return
  fi

  if [[ ! -d "$DRAMABOX_DIR/.git" ]]; then
    echo "Cloning DramaBox as ignored upstream source at $DRAMABOX_DIR..."
    git clone --depth 1 https://github.com/resemble-ai/DramaBox.git "$DRAMABOX_DIR"
  else
    echo "DramaBox upstream already present at $DRAMABOX_DIR."
  fi

  if [[ ! -x "$DRAMABOX_VENV/bin/python" ]]; then
    echo "Creating DramaBox diagnostic environment at $DRAMABOX_VENV..."
    run_with_mise uv venv --python "${DRAMABOX_PYTHON_VERSION:-3.12}" "$DRAMABOX_VENV"
  fi

  echo "DramaBox is gated by default on consumer GPUs."
  echo "Set DRAMABOX_BASE_URL to a warm server endpoint for evaluation."
  echo "Set DRAMABOX_INSTALL_DEPS=1 if you intentionally want to install upstream local dependencies."

  if [[ "${DRAMABOX_INSTALL_DEPS:-0}" != "1" ]]; then
    return
  fi

  if [[ -f "$DRAMABOX_DIR/requirements.txt" ]]; then
    run_with_mise uv pip install --python "$DRAMABOX_VENV/bin/python" -r "$DRAMABOX_DIR/requirements.txt"
  else
    echo "No requirements.txt found in DramaBox upstream; leaving source checkout untouched."
  fi
}

setup_alignment() {
  ensure_local_dirs
  echo "Alignment setup"

  if command -v mamba >/dev/null 2>&1 || command -v conda >/dev/null 2>&1; then
    local conda_bin
    conda_bin="$(command -v mamba || command -v conda)"
    if "$conda_bin" env list | awk '{print $1}' | grep -qx "$ALIGNMENT_MFA_ENV"; then
      echo "MFA conda environment already exists: $ALIGNMENT_MFA_ENV"
    else
      echo "Creating MFA conda environment: $ALIGNMENT_MFA_ENV"
      "$conda_bin" create -y -n "$ALIGNMENT_MFA_ENV" -c conda-forge montreal-forced-aligner
    fi
    echo "Set ALIGNMENT_MFA_BIN to run MFA through that environment, for example:"
    echo "  ALIGNMENT_MFA_BIN=\"$conda_bin run -n $ALIGNMENT_MFA_ENV mfa\""
  else
    echo "Skipping MFA install: conda/mamba is not available."
  fi

  if command -v uv >/dev/null 2>&1; then
    if [[ ! -x "$ALIGNMENT_AENEAS_VENV/bin/python" ]]; then
      echo "Creating Aeneas environment at $ALIGNMENT_AENEAS_VENV..."
      run_with_mise uv venv --python "${ALIGNMENT_AENEAS_PYTHON_VERSION:-3.11}" "$ALIGNMENT_AENEAS_VENV"
    fi
    if ! "$ALIGNMENT_AENEAS_VENV/bin/python" -c "import aeneas" >/dev/null 2>&1; then
      echo "Installing Aeneas into isolated environment..."
      run_with_mise uv pip install --python "$ALIGNMENT_AENEAS_VENV/bin/python" aeneas
    fi
    echo "Aeneas Python: $ALIGNMENT_AENEAS_VENV/bin/python"
  else
    echo "Skipping Aeneas install: uv is not available."
  fi

  if command -v docker >/dev/null 2>&1; then
    echo "Pulling Gentle Docker image: $ALIGNMENT_GENTLE_IMAGE"
    docker pull "$ALIGNMENT_GENTLE_IMAGE"
    echo "Run Gentle separately and set ALIGNMENT_GENTLE_URL, for example http://127.0.0.1:8765."
  else
    echo "Skipping Gentle image pull: Docker is not available."
  fi

  echo "Enable post-alignment with ALIGNMENT_ENABLED=true and choose ALIGNMENT_PREFERRED=mfa,aeneas,gentle."
}

artifact_patterns() {
  printf "%s\n" "${PURGED_PATHS[@]}"
  printf "%s\n" \
    "backend/model/" \
    "backend/voice/" \
    "backend/model-cache/" \
    ".upstreams/" \
    ".playwright-cli/" \
    ".playwright-mcp/" \
    "demo/"
}

audit_artifacts() {
  require_command git
  local found=0
  echo "Tracked generated/model/cache path audit:"
  while IFS= read -r pattern; do
    [[ -z "$pattern" ]] && continue
    if git ls-files -- "$pattern" | grep -q .; then
      echo "  tracked: $pattern"
      git ls-files -- "$pattern" | sed 's/^/    - /'
      found=1
    fi
  done < <(artifact_patterns)

  if (( found == 0 )); then
    echo "  no tracked generated/model/cache paths found."
    return
  fi

  echo "Artifact audit failed. Run the history rewrite task only on $HISTORY_REWRITE_BRANCH."
  return 1
}

audit_secrets() {
  require_command git
  local regex='(hf_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----)'
  local files_result history_result

  files_result="$(git grep -nIE "$regex" -- . ':(exclude)pnpm-lock.yaml' || true)"
  if [[ -n "$files_result" ]]; then
    echo "Potential secrets in tracked files:"
    printf "%s\n" "$files_result"
    return 1
  fi

  history_result="$(git log --all -G"$regex" --format='%h %s' -- . ':(exclude)pnpm-lock.yaml' || true)"
  if [[ -n "$history_result" ]]; then
    echo "Potential secrets in history diffs:"
    printf "%s\n" "$history_result"
    return 1
  fi

  echo "Secret audit passed for common token/private-key patterns."
}

print_tracked_artifact_summary() {
  local tracked
  tracked="$(git ls-files backend/model backend/voice 2>/dev/null || true)"
  if [[ -z "$tracked" ]]; then
    echo "  - tracked model artifacts: none"
    return
  fi

  echo "  - tracked model artifacts:"
  printf "%s\n" "$tracked" | sed 's/^/      /'
}

supertonic_status() {
  if [[ -x "$(supertonic_python)" ]] && "$(supertonic_python)" -c "import supertonic" >/dev/null 2>&1; then
    echo "installed ($(supertonic_python))"
    return
  fi
  echo "not installed"
}

dramabox_status() {
  if [[ -n "${DRAMABOX_BASE_URL:-}" ]]; then
    echo "warm server configured ($DRAMABOX_BASE_URL)"
    return
  fi
  if [[ -d "$DRAMABOX_DIR/.git" ]]; then
    echo "upstream cloned, local runtime gated"
    return
  fi
  echo "not configured"
}

alignment_mfa_status() {
  if [[ -n "${ALIGNMENT_MFA_BIN:-}" ]]; then
    echo "configured ($ALIGNMENT_MFA_BIN)"
    return
  fi
  if command -v mfa >/dev/null 2>&1; then
    echo "available ($(command -v mfa))"
    return
  fi
  echo "not configured"
}

alignment_aeneas_status() {
  local python_path="${ALIGNMENT_AENEAS_PYTHON:-$ALIGNMENT_AENEAS_VENV/bin/python}"
  if [[ -x "$python_path" ]] && "$python_path" -c "import aeneas" >/dev/null 2>&1; then
    echo "installed ($python_path)"
    return
  fi
  echo "not installed"
}

alignment_gentle_status() {
  if [[ -n "${ALIGNMENT_GENTLE_URL:-}" ]]; then
    echo "server configured ($ALIGNMENT_GENTLE_URL)"
    return
  fi
  if command -v docker >/dev/null 2>&1 && docker image inspect "$ALIGNMENT_GENTLE_IMAGE" >/dev/null 2>&1; then
    echo "docker image available ($ALIGNMENT_GENTLE_IMAGE)"
    return
  fi
  echo "not configured"
}

doctor() {
  require_command git
  echo "Voice Studio local setup doctor"
  echo
  echo "Tools"
  echo "  - mise: $(command_status mise)"
  echo "  - go: $(command_status go)"
  echo "  - node: $(command_status node)"
  echo "  - pnpm: $(command_status pnpm)"
  echo "  - python: $(command_status python3)"
  echo "  - uv: $(command_status uv)"
  echo "  - ffmpeg: $(command_status ffmpeg)"
  echo "  - ffprobe: $(command_status ffprobe)"
  echo "  - pdftotext: $(command_status pdftotext)"
  echo "  - git-lfs: $(command_status git-lfs)"
  echo
  echo "Runtime directories"
  echo "  - backend data: $BACKEND_DIR/data"
  echo "  - model cache: $BACKEND_DIR/model-cache"
  echo "  - upstreams: $ROOT_DIR/.upstreams"
  echo "  - output: $ROOT_DIR/output"
  echo
  echo "Providers"
  echo "  - Supertonic 3: $(supertonic_status)"
  echo "  - DramaBox: $(dramabox_status)"
  echo "  - Alignment MFA: $(alignment_mfa_status)"
  echo "  - Alignment Aeneas: $(alignment_aeneas_status)"
  echo "  - Alignment Gentle: $(alignment_gentle_status)"
  echo
  echo "Git hygiene"
  echo "  - branch: $(git branch --show-current)"
  print_tracked_artifact_summary
  echo
  echo "Run audits"
  echo "  - mise audit:secrets"
  echo "  - mise audit:artifacts"
}

clean_history_plan() {
  cat <<EOF
Local-only history rewrite plan

1. Commit normal setup/docs work on host-setup.
2. Create the isolated branch:
   git switch -c $HISTORY_REWRITE_BRANCH
3. Run:
   mise clean:history:rewrite
4. Verify branch-local purge:
   git ls-files | rg 'backend/model/kokoro.onnx|backend/voice/voices-v1.0.bin'
   git rev-list --objects HEAD | rg 'backend/model/kokoro.onnx|backend/voice/voices-v1.0.bin'

This task refuses to run unless the current branch is $HISTORY_REWRITE_BRANCH.
It creates a local backup bundle under .git/history-rewrite-backups/ before rewriting.
No remote operations are performed.
EOF
}

assert_clean_worktree() {
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Working tree must be clean before this operation." >&2
    git status --short >&2
    exit 1
  fi
}

history_rewrite_filter_repo() {
  local -a args=(--refs "$HISTORY_REWRITE_BRANCH")
  for path in "${PURGED_PATHS[@]}"; do
    args+=(--path "$path")
  done
  args+=(--invert-paths --force)

  if command -v git-filter-repo >/dev/null 2>&1; then
    git filter-repo "${args[@]}"
    return
  fi

  if command -v uvx >/dev/null 2>&1; then
    uvx git-filter-repo "${args[@]}"
    return
  fi

  echo "git-filter-repo is unavailable and uvx is missing." >&2
  echo "Install git-filter-repo or uv before running the rewrite." >&2
  exit 1
}

clean_history_rewrite() {
  require_command git
  local current_branch backup_dir backup_path timestamp pattern_hits
  current_branch="$(git branch --show-current)"
  if [[ "$current_branch" != "$HISTORY_REWRITE_BRANCH" ]]; then
    echo "Refusing history rewrite on $current_branch; switch to $HISTORY_REWRITE_BRANCH first." >&2
    exit 1
  fi
  assert_clean_worktree

  timestamp="$(date +%Y%m%d-%H%M)"
  backup_dir="$ROOT_DIR/.git/history-rewrite-backups"
  backup_path="$backup_dir/pre-history-rewrite-$timestamp.bundle"
  mkdir -p "$backup_dir"
  git bundle create "$backup_path" host-setup "$HISTORY_REWRITE_BRANCH" >/dev/null
  echo "Created local backup bundle: $backup_path"

  echo "Purging branch history paths:"
  printf "  - %s\n" "${PURGED_PATHS[@]}"
  history_rewrite_filter_repo

  pattern_hits="$(git ls-files | grep -E '^(backend/model/kokoro\.onnx|backend/voice/voices-v1\.0\.bin)$' || true)"
  if [[ -n "$pattern_hits" ]]; then
    echo "Purged paths are still tracked:"
    printf "%s\n" "$pattern_hits"
    exit 1
  fi

  pattern_hits="$(git rev-list --objects HEAD | grep -E 'backend/model/kokoro\.onnx|backend/voice/voices-v1\.0\.bin' || true)"
  if [[ -n "$pattern_hits" ]]; then
    echo "Purged paths still appear in current branch history:"
    printf "%s\n" "$pattern_hits"
    exit 1
  fi

  echo "Branch-local history rewrite completed."
}

main() {
  local command="${1:-doctor}"
  shift || true

  case "$command" in
    setup)
      setup_base "$@"
      ;;
    setup-supertonic)
      setup_supertonic "$@"
      ;;
    setup-dramabox)
      setup_dramabox "$@"
      ;;
    setup-alignment)
      setup_alignment "$@"
      ;;
    doctor)
      doctor "$@"
      ;;
    audit-artifacts)
      audit_artifacts "$@"
      ;;
    audit-secrets)
      audit_secrets "$@"
      ;;
    clean-history-plan)
      clean_history_plan "$@"
      ;;
    clean-history-rewrite)
      clean_history_rewrite "$@"
      ;;
    *)
      echo "Unknown command: $command" >&2
      echo "Usage: $0 {setup|setup-supertonic|setup-dramabox|setup-alignment|doctor|audit-artifacts|audit-secrets|clean-history-plan|clean-history-rewrite}" >&2
      exit 2
      ;;
  esac
}

main "$@"
