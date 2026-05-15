#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

load_env_file() {
  local file_path="$1"
  local line key value
  if [[ -f "$file_path" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      line="${line#"${line%%[![:space:]]*}"}"
      line="${line%"${line##*[![:space:]]}"}"
      [[ -z "$line" || "${line:0:1}" == "#" ]] && continue

      if [[ "$line" == export\ * ]]; then
        line="${line#export }"
      fi

      key="${line%%=*}"
      value="${line#*=}"
      key="${key%"${key##*[![:space:]]}"}"
      [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue

      if [[ -z "${!key+x}" ]]; then
        value="${value#"${value%%[![:space:]]*}"}"
        value="${value%"${value##*[![:space:]]}"}"
        if [[ "$value" == \"*\" && "$value" == *\" ]]; then
          value="${value:1:${#value}-2}"
        elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
          value="${value:1:${#value}-2}"
        fi
        export "$key=$value"
      fi
    done <"$file_path"
  fi
}

run_with_mise() {
  if command -v mise >/dev/null 2>&1; then
    mise exec -- "$@"
    return
  fi

  "$@"
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

resolve_kokoro_reference_module_path() {
  local candidate
  local -a candidates=(
    "$ROOT_DIR/backend/.koko-clone"
    "$ROOT_DIR/backend/koko-clone"
    "$ROOT_DIR/backend/koko_clone"
    "$ROOT_DIR/backend/kokoclone"
    "$ROOT_DIR/.koko-clone"
    "$ROOT_DIR/koko-clone"
    "$ROOT_DIR/koko_clone"
    "$ROOT_DIR/kokoclone"
    "$ROOT_DIR/../koko-clone"
    "$ROOT_DIR/../koko_clone"
    "$ROOT_DIR/../kokoclone"
    "$ROOT_DIR/../.koko-clone"
  )

  for candidate in "${candidates[@]}"; do
    if [[ ! -d "$candidate" ]]; then
      continue
    fi
    if [[ -f "$candidate/core/__init__.py" ]] || [[ -f "$candidate/core/cloner.py" ]] || [[ -f "$candidate/__init__.py" ]] || [[ -f "$candidate/cloner.py" ]] \
      || [[ -f "$candidate/src/core/__init__.py" ]] || [[ -f "$candidate/src/core/cloner.py" ]]; then
      printf "%s" "$candidate"
      return 0
    fi
  done

  printf "%s" "$ROOT_DIR/backend/.koko-clone"
}

optimizer_uses_bonsai() {
  local provider
  provider="$(printf '%s' "$VOICE_OPTIMIZER_PROVIDER" | tr '[:upper:]' '[:lower:]')"
  [[ "$provider" == "bonsai" || "$provider" == "auto" ]]
}

tts_uses_kokoro() {
  local provider
  provider="$(printf '%s' "$TTS_PROVIDER" | tr '[:upper:]' '[:lower:]')"
  [[ "$provider" == "kokoro" ]]
}

checker_uses_qwen() {
  local provider
  provider="$(printf '%s' "$VOICE_CHECKER_PROVIDER" | tr '[:upper:]' '[:lower:]')"
  [[ "$provider" == "qwen" || "$provider" == "qwen-asr" ]]
}

profile_analysis_uses_pyannote() {
  [[ -n "${PYANNOTE_AUTH_TOKEN:-}" ||
    -n "${HF_TOKEN:-}" ||
    -n "${VOICE_PROFILE_DIARIZATION_MODEL_PATH:-}" ||
    -n "${VOICE_PROFILE_DIARIZATION_LOCAL_MODEL_DIR:-}" ]]
}

book_pdf_python_fallback_enabled() {
  [[ "${VOICE_BOOK_PDF_ENABLE_PYTHON_FALLBACK:-1}" == "1" ]]
}

python_runtime_needed() {
  tts_uses_kokoro || checker_uses_qwen || profile_analysis_uses_pyannote || book_pdf_python_fallback_enabled
}

local_fallback_enabled() {
  [[ "${LOCAL_FALLBACK_ON_BOOTSTRAP_FAILURE:-1}" == "1" ]]
}

fallback_to_mock_optimizer() {
  if ! local_fallback_enabled; then
    return 1
  fi
  if optimizer_uses_bonsai; then
    echo "Falling back to VOICE_OPTIMIZER_PROVIDER=rules for startup."
    export VOICE_OPTIMIZER_PROVIDER=rules
  fi
}

fallback_to_mock_tts() {
  if ! local_fallback_enabled; then
    return 1
  fi
  if tts_uses_kokoro; then
    echo "Falling back to TTS_PROVIDER=mock for startup."
    export TTS_PROVIDER=mock
  fi
}

fallback_to_mock_checker() {
  if ! local_fallback_enabled; then
    return 1
  fi
  if checker_uses_qwen; then
    echo "Falling back to VOICE_CHECKER_PROVIDER=mock for startup."
    export VOICE_CHECKER_PROVIDER=mock
  fi
}

configure_tmpfs_paths() {
  if [[ "${TTS_RESEARCH_USE_TMPFS:-0}" != "1" ]]; then
    return
  fi

  local tmpfs_root="${TTS_RESEARCH_TMPFS_ROOT:-/dev/shm/tts-research}"
  if [[ ! -d "/dev/shm" ]]; then
    echo "TTS_RESEARCH_USE_TMPFS=1 but /dev/shm is not available; using disk paths."
    return
  fi
  if ! mkdir -p "$tmpfs_root" 2>/dev/null; then
    echo "Unable to create tmpfs root ${tmpfs_root}; using disk paths."
    return
  fi
  if ! [[ -w "$tmpfs_root" ]]; then
    echo "No write access to ${tmpfs_root}; using disk paths."
    return
  fi

  export KOKORO_DATA_DIR="${KOKORO_DATA_DIR:-$tmpfs_root/kokoro}"
  export QWEN_ASR_DATA_DIR="${QWEN_ASR_DATA_DIR:-$tmpfs_root/qwen}"
  export TTS_RESEARCH_TMPFS_ROOT="$tmpfs_root"
  mkdir -p "$KOKORO_DATA_DIR" "$QWEN_ASR_DATA_DIR"
  export VOICE_JOB_DATA_DIR="${VOICE_JOB_DATA_DIR:-$tmpfs_root/jobs}"
  export VOICE_PROFILE_DATA_DIR="${VOICE_PROFILE_DATA_DIR:-$tmpfs_root/voice-profiles}"
  mkdir -p "$VOICE_JOB_DATA_DIR" "$VOICE_PROFILE_DATA_DIR"
  export UV_CACHE_DIR="${UV_CACHE_DIR:-$tmpfs_root/uv-cache}"
  export PIP_CACHE_DIR="${PIP_CACHE_DIR:-$tmpfs_root/pip-cache}"
  mkdir -p "$UV_CACHE_DIR" "$PIP_CACHE_DIR"

  local tmp_mount="${TTS_RESEARCH_TMPDIR:-$tmpfs_root/tmp}"
  if ! mkdir -p "$tmp_mount" 2>/dev/null; then
    echo "Unable to create tmp directory ${tmp_mount}; using default temp location."
  elif ! [[ -w "$tmp_mount" ]]; then
    echo "No write access to ${tmp_mount}; using default temp location."
  else
    export TMPDIR="${TMPDIR:-$tmp_mount}"
  fi

  if [[ "${TTS_RESEARCH_TMPFS_HF_CACHE:-0}" == "1" ]]; then
    export HF_HOME="${HF_HOME:-$tmpfs_root/hf}"
    export HUGGINGFACE_HUB_CACHE="${HUGGINGFACE_HUB_CACHE:-${HF_HOME}/hub}"
    export TORCH_HOME="${TORCH_HOME:-$tmpfs_root/torch}"
    mkdir -p "$HF_HOME" "$HUGGINGFACE_HUB_CACHE" "$TORCH_HOME"
  fi
}

ensure_backend_python_env() {
  if python_requirements_present "$ROOT_DIR/backend/.venv/bin/python"; then
    return 0
  fi

  if ! [[ -x "$ROOT_DIR/backend/.venv/bin/python" ]]; then
    echo "Creating backend Python environment..."
  else
    echo "Backend Python environment is incomplete. Reinstalling dependencies..."
  fi

  if ! sync_backend_python_deps; then
    echo "Unable to repair backend Python environment."
    return 1
  fi

  if python_requirements_present "$ROOT_DIR/backend/.venv/bin/python"; then
    return 0
  fi

  echo "Backend Python environment still missing required packages."
  return 1
}

ensure_kokoro_clone_python_env() {
  local clone_python_path="${KOKOCLONE_PYTHON_PATH}"
  local clone_python_dir=""
  local venv_dir=""
  local -a venv_args=()

  if [[ -x "$clone_python_path" ]]; then
    return 0
  fi

  if [[ "$clone_python_path" != *"/bin/python" ]]; then
    echo "Cannot auto-create KOKOCLONE_PYTHON_PATH=${clone_python_path}; expected a virtualenv interpreter path (e.g. .venv-kokoclone/bin/python)."
    return 1
  fi

  clone_python_dir="$(dirname "$(dirname "$clone_python_path")")"
  if [[ "$clone_python_dir" = /* ]]; then
    venv_dir="$clone_python_dir"
  else
    venv_dir="$ROOT_DIR/$clone_python_dir"
  fi

  if [[ -z "${KOKOCLONE_PYTHON_VERSION:-}" ]]; then
    venv_args=("$venv_dir")
  else
    venv_args=(--python "$KOKOCLONE_PYTHON_VERSION" "$venv_dir")
  fi

  echo "Creating KokoClone Python environment..."
  if ! (cd "$ROOT_DIR" && run_with_mise uv venv "${venv_args[@]}"); then
    echo "Unable to create KokoClone Python environment."
    return 1
  fi

  if [[ ! -x "$clone_python_path" ]]; then
    echo "Created KokoClone environment, but interpreter is still missing at ${clone_python_path}."
    return 1
  fi

  return 0
}

sync_backend_python_deps() {
  local -a sync_args=()
  if tts_uses_kokoro; then
    sync_args+=("--extra" "kokoro")
  fi
  if checker_uses_qwen; then
    sync_args+=("--extra" "qwen")
  fi
  if profile_analysis_uses_pyannote; then
    sync_args+=("--extra" "profile-analysis")
  fi
  if book_pdf_python_fallback_enabled; then
    sync_args+=("--extra" "book")
  fi

  if [[ ${#sync_args[@]} -eq 0 ]]; then
    return 0
  fi

  if (cd "$ROOT_DIR/backend" && run_with_mise uv sync --frozen "${sync_args[@]}"); then
    return 0
  fi

  (cd "$ROOT_DIR/backend" && run_with_mise uv sync "${sync_args[@]}")
}

python_requirements_present() {
  local python_path="$1"
  local -a required_modules=()
  local module
  if tts_uses_kokoro; then
    required_modules+=("numpy" "soundfile" "kokoro")
  fi
  if checker_uses_qwen; then
    required_modules+=("torch" "qwen_asr")
  fi
  if profile_analysis_uses_pyannote; then
    required_modules+=("torch" "pyannote.audio" "soundfile")
  fi
  if book_pdf_python_fallback_enabled; then
    required_modules+=("pypdf")
  fi

  if [[ ${#required_modules[@]} -eq 0 ]]; then
    return 0
  fi

  if [[ ! -x "$python_path" ]]; then
    return 1
  fi

  for module in "${required_modules[@]}"; do
    if ! "$python_path" -c "import ${module}" >/dev/null 2>&1; then
      echo "Missing Python module in ${python_path}: ${module}"
      return 1
    fi
  done

  return 0
}

book_pdf_text_extractor_available() {
  if command -v pdftotext >/dev/null 2>&1; then
    return 0
  fi
  if [[ -x "$ROOT_DIR/backend/.venv/bin/python" ]] &&
    "$ROOT_DIR/backend/.venv/bin/python" "$ROOT_DIR/backend/scripts/pdf_extract.py" --check >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

ensure_kokoro_reference_dependencies() {
  local reference_script="$ROOT_DIR/backend/scripts/kokoro_clone.py"
  local reference_python_path="$KOKOCLONE_PYTHON_PATH"
  local -a ensure_args=("--ensure-dependencies")

  if [[ -n "${KOKORO_REFERENCE_SCRIPT_PATH:-}" ]] && [[ -f "$ROOT_DIR/backend/${KOKORO_REFERENCE_SCRIPT_PATH}" ]]; then
    reference_script="$ROOT_DIR/backend/${KOKORO_REFERENCE_SCRIPT_PATH}"
  fi

  if [[ ! -x "$reference_python_path" ]]; then
    echo "Skipping reference bootstrap: backend Python runtime is missing."
    return 1
  fi

  if [[ ! -f "$reference_script" ]]; then
    echo "Skipping reference bootstrap: kokoro_clone.py is missing."
    return 1
  fi

  if [[ -n "${KOKORO_REFERENCE_MODULE_PATH:-}" ]]; then
    ensure_args+=( "--module-path" "$KOKORO_REFERENCE_MODULE_PATH" )
  fi

  echo "Checking reference voice synthesis dependencies..."
  if (cd "$ROOT_DIR/backend" && "$reference_python_path" "$reference_script" "${ensure_args[@]}"); then
    return 0
  fi

  echo "Unable to ensure KokoClone reference synthesis dependencies."
  return 1
}

_python_import_probe() {
  local python_path="$1"
  local module_name="$2"

  "$python_path" -c "import ${module_name}" >/dev/null 2>&1
}

_torch_cuda_wheel_tag() {
  local python_path="$1"
  local cuda_version
  cuda_version="$("$python_path" -c 'import torch; print(getattr(torch.version, "cuda", "") or "")' 2>/dev/null | tr -d '\r' | tr -d '\n')"

  if [[ -z "$cuda_version" ]]; then
    return 1
  fi

  if [[ "${cuda_version}" =~ ^([0-9]+)\.([0-9]+)$ ]]; then
    printf "cu%s%s" "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
    return 0
  fi

  return 1
}

install_flash_attention_compat_shim() {
  local python_path="$1"

  "$python_path" - <<'PY'
import pathlib
import sysconfig

site_dir = sysconfig.get_paths().get("purelib")
if not site_dir:
  raise SystemExit(1)

shim_path = pathlib.Path(site_dir) / "flash_attn.py"
shim_path.write_text(
"""from flash_attn_interface import (
    flash_attn_func,
    flash_attn_with_kvcache,
    flash_attn_qkvpacked_func,
)

__all__ = [
    "flash_attn_func",
    "flash_attn_with_kvcache",
    "flash_attn_qkvpacked_func",
]
""",
    encoding="utf-8",
)
print(shim_path)
PY
}

ensure_kokoro_flash_attention() {
  local python_path="$KOKOCLONE_PYTHON_PATH"
  local -a primary_install_args=( )
  local -a fallback_install_args=( )
  local -a source_install_args=( )
  local cuda_tag
  local -a pip_cmd=( )
  local flash_attn_pkg="${KOKOCLONE_FLASH_ATTENTION_PACKAGE:-flash-attn==${KOKOCLONE_FLASH_ATTENTION_VERSION:-2.8.3}}"
  local flash_attn_fallback_pkg="${KOKOCLONE_FLASH_ATTENTION_FALLBACK_PACKAGE:-}"
  local flash_attn_import_module="${KOKOCLONE_FLASH_ATTENTION_IMPORT_MODULE:-flash_attn}"

  if [[ ! -x "$python_path" ]]; then
    echo "Unable to probe FlashAttention: backend Python runtime is missing."
    KOKOCLONE_FLASH_ATTENTION_STATUS="unavailable"
    return 1
  fi

  if [[ "${KOKOCLONE_INSTALL_FLASH_ATTENTION:-1}" != "1" ]]; then
    if [[ "${KOKOCLONE_REQUIRE_FLASH_ATTENTION:-0}" == "1" ]]; then
      echo "FlashAttention bootstrap is disabled but required (KOKOCLONE_REQUIRE_FLASH_ATTENTION=1)."
      KOKOCLONE_FLASH_ATTENTION_STATUS="required-disabled"
      return 1
    fi

    echo "Skipping FlashAttention bootstrap (KOKOCLONE_INSTALL_FLASH_ATTENTION!=1)."
    KOKOCLONE_FLASH_ATTENTION_STATUS="disabled"
    return 0
  fi

  if [[ "${KOKOCLONE_BOOTSTRAP_FLASH_ATTENTION_ON_BOOT:-0}" != "1" ]]; then
    echo "Skipping FlashAttention bootstrap (KOKOCLONE_BOOTSTRAP_FLASH_ATTENTION_ON_BOOT!=1)."
    KOKOCLONE_FLASH_ATTENTION_STATUS="disabled-on-demand"
    if [[ "${KOKOCLONE_REQUIRE_FLASH_ATTENTION:-0}" == "1" ]]; then
      KOKOCLONE_FLASH_ATTENTION_STATUS="required-disabled"
      return 1
    fi
    return 0
  fi

  if _python_import_probe "$python_path" "$flash_attn_import_module"; then
    KOKOCLONE_FLASH_ATTENTION_STATUS="available"
    return 0
  fi

  echo "FlashAttention not available; attempting bootstrap install in KokoClone environment..."

  cuda_tag="$(_torch_cuda_wheel_tag "$python_path" || true)"
  if [[ "$flash_attn_pkg" == flash-attn-3* ]]; then
    primary_install_args=( "--index-url" "https://download.pytorch.org/whl/flash-attn-3" )
    if [[ -n "$cuda_tag" ]]; then
      primary_install_args+=( "--extra-index-url" "https://download.pytorch.org/whl/${cuda_tag}" )
    fi
    primary_install_args+=( "--extra-index-url" "https://pypi.org/simple" )
  else
    if [[ -n "$cuda_tag" ]]; then
      primary_install_args=( "--index-url" "https://download.pytorch.org/whl/${cuda_tag}" )
      primary_install_args+=( "--extra-index-url" "https://pypi.org/simple" )
    fi
  fi

  if [[ "$flash_attn_fallback_pkg" == flash-attn-3* ]]; then
    fallback_install_args=( "--index-url" "https://download.pytorch.org/whl/flash-attn-3" )
    if [[ -n "$cuda_tag" ]]; then
      fallback_install_args+=( "--extra-index-url" "https://download.pytorch.org/whl/${cuda_tag}" )
    fi
    fallback_install_args+=( "--extra-index-url" "https://pypi.org/simple" )
  else
    fallback_install_args=( "${primary_install_args[@]}" )
  fi

  if [[ "${KOKOCLONE_FLASH_ATTENTION_WHEEL_ONLY:-1}" == "1" ]]; then
    primary_install_args+=( "--only-binary=:all:" )
    fallback_install_args+=( "--only-binary=:all:" )
  fi

  source_install_args=()
  for arg in "${primary_install_args[@]}"; do
    if [[ "$arg" != "--only-binary=:all:" ]]; then
      source_install_args+=( "$arg" )
    fi
  done

  pip_cmd=( run_with_mise uv pip install --python "$python_path" --no-build-isolation "${primary_install_args[@]}" "$flash_attn_pkg" )
  if (cd "$ROOT_DIR/backend" && "${pip_cmd[@]}"); then
    if [[ "$flash_attn_import_module" == "flash_attn" ]] && [[ "$flash_attn_pkg" == flash-attn-3* ]]; then
      install_flash_attention_compat_shim "$python_path" || true
    fi
    if _python_import_probe "$python_path" "$flash_attn_import_module"; then
      KOKOCLONE_FLASH_ATTENTION_STATUS="installed"
      return 0
    fi
  fi

  if [[ -n "$flash_attn_fallback_pkg" ]]; then
    echo "Primary FlashAttention install failed; trying fallback package: ${flash_attn_fallback_pkg}"
    if (cd "$ROOT_DIR/backend" && run_with_mise uv pip install --python "$python_path" --no-build-isolation "${fallback_install_args[@]}" "$flash_attn_fallback_pkg"); then
      if [[ "$flash_attn_import_module" == "flash_attn" ]] && [[ "$flash_attn_fallback_pkg" == flash-attn-3* ]]; then
        install_flash_attention_compat_shim "$python_path" || true
      fi
      if _python_import_probe "$python_path" "$flash_attn_import_module"; then
        KOKOCLONE_FLASH_ATTENTION_STATUS="installed"
        return 0
      fi
    fi
  fi

  if [[ "${KOKOCLONE_ALLOW_FLASH_ATTENTION_SOURCE:-0}" == "1" ]]; then
    if (cd "$ROOT_DIR/backend" && run_with_mise uv pip install --python "$python_path" --no-build-isolation "${source_install_args[@]}" "$flash_attn_pkg"); then
      if _python_import_probe "$python_path" "$flash_attn_import_module"; then
        KOKOCLONE_FLASH_ATTENTION_STATUS="installed-fallback"
        return 0
      fi
    fi
  fi

  if [[ "${KOKOCLONE_FLASH_ATTENTION_WHEEL_ONLY:-1}" == "1" ]]; then
    echo "No prebuilt flash-attn wheel matched this Python/CUDA/runtime combination."
    echo "Set KOKOCLONE_FLASH_ATTENTION_WHEEL_ONLY=0 and KOKOCLONE_ALLOW_FLASH_ATTENTION_SOURCE=1 to allow source install."
    echo "Alternatively set KOKOCLONE_FLASH_ATTENTION_FALLBACK_PACKAGE=flash-attn-3 for wheel-only flash-attn-3 installs."
    echo "Or keep it off and continue without FlashAttention (SDPA fallback)."
  fi

  echo "Unable to install flash-attn in KokoClone environment."
  if [[ "${KOKOCLONE_REQUIRE_FLASH_ATTENTION:-0}" == "1" ]]; then
    KOKOCLONE_FLASH_ATTENTION_STATUS="failed-required"
    return 1
  fi

  KOKOCLONE_FLASH_ATTENTION_STATUS="unavailable"
  return 0
}

ensure_bonsai_env() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "Bonsai bootstrap is currently supported on macOS only in this project."
    echo "Set VOICE_OPTIMIZER_PROVIDER=rules (or install/build Bonsai deps manually) on Linux."
    return 1
  fi

  if [[ ! -x "$ROOT_DIR/backend/.venv-bonsai/bin/python" ]]; then
    echo "Creating Bonsai Python environment..."
    if ! (cd "$ROOT_DIR/backend" && run_with_mise uv venv .venv-bonsai --python 3.13 --seed); then
      echo "Unable to create Bonsai Python environment."
      return 1
    fi
  fi

  if "$ROOT_DIR/backend/.venv-bonsai/bin/python" -c "import mlx.core, mlx_lm" >/dev/null 2>&1; then
    return 0
  fi

  echo "Installing Bonsai Python dependencies..."
  if (
    cd "$ROOT_DIR/backend"
    "$ROOT_DIR/backend/.venv-bonsai/bin/pip" install "mlx-lm==0.31.2"
    CMAKE_ARGS="-DPython_EXECUTABLE=${ROOT_DIR}/backend/.venv-bonsai/bin/python -DPython3_EXECUTABLE=${ROOT_DIR}/backend/.venv-bonsai/bin/python" \
      "$ROOT_DIR/backend/.venv-bonsai/bin/pip" install --force-reinstall --no-deps "mlx @ git+https://github.com/PrismML-Eng/mlx.git@prism"
  ); then
    return 0
  fi

  echo "Unable to install Bonsai Python dependencies."
  return 1
}

start_service() {
  local -n pid_ref="$1"
  local work_dir="$2"
  shift 2
  local -a service_cmd=("$@")
  local old_dir pid

  old_dir="$(pwd -P)"
  cd "$work_dir"
  run_with_mise "${service_cmd[@]}" &
  pid=$!
  cd "$old_dir"

  if ! kill -0 "$pid" >/dev/null 2>&1; then
    echo "Failed to launch service command in ${work_dir}: ${service_cmd[*]}"
    return 1
  fi

  pid_ref="$pid"
}

service_listening_on_port() {
  local port="$1"

  if command -v ss >/dev/null 2>&1; then
    if ss -ltn "sport = :${port}" 2>/dev/null | grep -q "LISTEN"; then
      return 0
    fi
    return 1
  fi

  if command -v lsof >/dev/null 2>&1; then
    if lsof -iTCP:"${port}" -sTCP:LISTEN -nP >/dev/null 2>&1; then
      return 0
    fi
    return 1
  fi

  return 0
}

wait_for_service() {
  local label="$1"
  local pid="$2"
  local port="$3"
  local timeout="${4:-30}"
  local elapsed=0

  while (( elapsed < timeout )); do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      echo "  ${label} exited before listening on port ${port}."
      wait "$pid" || return $?
    fi

    if service_listening_on_port "$port"; then
      echo "  ${label} is listening on :${port} (pid ${pid})."
      return 0
    fi

    sleep 1
    ((elapsed++))
  done

  echo "  Timed out waiting for ${label} to listen on port ${port}."
  return 1
}

kill_service() {
  local pid="$1"
  if [[ -z "$pid" ]]; then
    return 0
  fi

  if ! kill -0 "$pid" >/dev/null 2>&1; then
    return 0
  fi

  if command -v pkill >/dev/null 2>&1; then
    pkill -TERM -P "$pid" >/dev/null 2>&1 || true
  fi
  kill "$pid" >/dev/null 2>&1 || true
  wait "$pid" 2>/dev/null || true
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM HUP QUIT

  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill_service "$BACKEND_PID"
  fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill_service "$FRONTEND_PID"
  fi

  if [[ -n "${BACKEND_PID:-}" ]]; then
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    wait "$FRONTEND_PID" 2>/dev/null || true
  fi
  exit "$exit_code"
}

trap cleanup EXIT INT TERM HUP QUIT

load_env_file "$ROOT_DIR/.env"
load_env_file "$ROOT_DIR/backend/.env"

export BACKEND_PORT="${BACKEND_PORT:-8080}"
export FRONTEND_PORT="${FRONTEND_PORT:-5173}"
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://localhost:${BACKEND_PORT}}"
export VOICE_OPTIMIZER_PROVIDER="${VOICE_OPTIMIZER_PROVIDER:-rules}"
export BONSAI_MODEL="${BONSAI_MODEL:-prism-ml/Bonsai-8B-mlx-1bit}"
export BONSAI_PYTHON_PATH="${BONSAI_PYTHON_PATH:-./.venv-bonsai/bin/python}"
export BONSAI_SCRIPT_PATH="${BONSAI_SCRIPT_PATH:-./scripts/bonsai_optimize.py}"
export BONSAI_PRELOAD="${BONSAI_PRELOAD:-true}"
export BONSAI_MAX_TOKENS="${BONSAI_MAX_TOKENS:-0}"
export BONSAI_CHUNK_RUNES="${BONSAI_CHUNK_RUNES:-1600}"
export BONSAI_TIMEOUT_SECONDS="${BONSAI_TIMEOUT_SECONDS:-600}"
export BONSAI_TEMPERATURE="${BONSAI_TEMPERATURE:-0.1}"
export BONSAI_TOP_P="${BONSAI_TOP_P:-0.9}"
export BONSAI_TOP_K="${BONSAI_TOP_K:-20}"
export OPENROUTER_MODEL="${OPENROUTER_MODEL:-openrouter/free}"
export OPENROUTER_TIMEOUT_SECONDS="${OPENROUTER_TIMEOUT_SECONDS:-180}"
export TTS_PROVIDER="${TTS_PROVIDER:-mock}"
export KOKORO_REFERENCE_MODULE_PATH="${KOKORO_REFERENCE_MODULE_PATH:-$(resolve_kokoro_reference_module_path)}"
export KOKORO_DEVICE="${KOKORO_DEVICE:-auto}"
export KOKOCLONE_WORKER_COUNT="${KOKOCLONE_WORKER_COUNT:-2}"
export KOKOCLONE_INSTALL_FLASH_ATTENTION="${KOKOCLONE_INSTALL_FLASH_ATTENTION:-1}"
export KOKOCLONE_FLASH_ATTENTION_PACKAGE="${KOKOCLONE_FLASH_ATTENTION_PACKAGE:-flash-attn==${KOKOCLONE_FLASH_ATTENTION_VERSION:-2.8.3}}"
export KOKOCLONE_FLASH_ATTENTION_FALLBACK_PACKAGE="${KOKOCLONE_FLASH_ATTENTION_FALLBACK_PACKAGE:-}"
export KOKOCLONE_FLASH_ATTENTION_IMPORT_MODULE="${KOKOCLONE_FLASH_ATTENTION_IMPORT_MODULE:-flash_attn}"
export KOKOCLONE_PYTHON_PATH="${KOKOCLONE_PYTHON_PATH:-./.venv-kokoclone/bin/python}"
export KOKOCLONE_PYTHON_VERSION="${KOKOCLONE_PYTHON_VERSION:-3.12}"
export KOKOCLONE_BOOTSTRAP_FLASH_ATTENTION_ON_BOOT="${KOKOCLONE_BOOTSTRAP_FLASH_ATTENTION_ON_BOOT:-0}"
export KOKOCLONE_FLASH_ATTENTION_WHEEL_ONLY="${KOKOCLONE_FLASH_ATTENTION_WHEEL_ONLY:-1}"
export KOKOCLONE_ALLOW_FLASH_ATTENTION_SOURCE="${KOKOCLONE_ALLOW_FLASH_ATTENTION_SOURCE:-0}"
export KOKOCLONE_FLASH_ATTENTION_VERSION="${KOKOCLONE_FLASH_ATTENTION_VERSION:-2.8.3}"
export KOKOCLONE_REQUIRE_FLASH_ATTENTION="${KOKOCLONE_REQUIRE_FLASH_ATTENTION:-0}"
export VOICE_CHECKER_PROVIDER="${VOICE_CHECKER_PROVIDER:-mock}"
export TTS_RESEARCH_USE_TMPFS="${TTS_RESEARCH_USE_TMPFS:-1}"
export TTS_RESEARCH_TMPFS_ROOT="${TTS_RESEARCH_TMPFS_ROOT:-/dev/shm/tts-research}"
export TTS_RESEARCH_TMPFS_HF_CACHE="${TTS_RESEARCH_TMPFS_HF_CACHE:-0}"
export VOICE_SEGMENT_MAX_RUNES="${VOICE_SEGMENT_MAX_RUNES:-300}"
export VOICE_SEGMENT_WORKERS="${VOICE_SEGMENT_WORKERS:-2}"
export VOICE_SEGMENT_MAX_RUNES_STUDIO="${VOICE_SEGMENT_MAX_RUNES_STUDIO:-220}"
export VOICE_SEGMENT_WORKERS_STUDIO="${VOICE_SEGMENT_WORKERS_STUDIO:-2}"
export VOICE_SEGMENT_WORKERS_STUDIO_ADAPTIVE="${VOICE_SEGMENT_WORKERS_STUDIO_ADAPTIVE:-2}"
export VOICE_SEGMENT_MAX_RUNES_STUDIO_ADAPTIVE="${VOICE_SEGMENT_MAX_RUNES_STUDIO_ADAPTIVE:-180}"
export VOICE_PROFILE_MAX_BYTES="${VOICE_PROFILE_MAX_BYTES:-0}"
export VOICE_PROFILE_ANALYSIS_PYTHON_PATH="${VOICE_PROFILE_ANALYSIS_PYTHON_PATH:-./.venv/bin/python}"
export VOICE_PROFILE_DENOISE_PROVIDER="${VOICE_PROFILE_DENOISE_PROVIDER:-ffmpeg}"
export VOICE_PROFILE_DENOISE_STRENGTH="${VOICE_PROFILE_DENOISE_STRENGTH:-balanced}"
export VOICE_PROFILE_EMBEDDING_MODEL="${VOICE_PROFILE_EMBEDDING_MODEL:-pyannote/embedding}"
export VOICE_PROFILE_EMBEDDING_SCRIPT_PATH="${VOICE_PROFILE_EMBEDDING_SCRIPT_PATH:-./scripts/profile_likeness.py}"
export VOICE_PROFILE_LIKENESS_TIMEOUT_SECONDS="${VOICE_PROFILE_LIKENESS_TIMEOUT_SECONDS:-120}"
export SUPERTONIC_PYTHON="${SUPERTONIC_PYTHON:-./.venv-supertonic/bin/python}"
export SUPERTONIC_SCRIPT_PATH="${SUPERTONIC_SCRIPT_PATH:-./scripts/supertonic_synth.py}"
export SUPERTONIC_MODEL_DIR="${SUPERTONIC_MODEL_DIR:-./model-cache/supertonic}"
export SUPERTONIC_AUTO_DOWNLOAD="${SUPERTONIC_AUTO_DOWNLOAD:-false}"
export SUPERTONIC_DEFAULT_VOICE="${SUPERTONIC_DEFAULT_VOICE:-M1}"
export SUPERTONIC_DEFAULT_LANG="${SUPERTONIC_DEFAULT_LANG:-sv}"
export SUPERTONIC_TIMEOUT_SECONDS="${SUPERTONIC_TIMEOUT_SECONDS:-180}"
export DRAMABOX_BASE_URL="${DRAMABOX_BASE_URL:-}"
export SCENEMA_AUDIO_BASE_URL="${SCENEMA_AUDIO_BASE_URL:-}"
export VOICE_BOOK_PDF_ENABLE_PYTHON_FALLBACK="${VOICE_BOOK_PDF_ENABLE_PYTHON_FALLBACK:-1}"
export VOICE_BOOK_PDF_PYTHON_PATH="${VOICE_BOOK_PDF_PYTHON_PATH:-./.venv/bin/python}"
export VOICE_BOOK_PDF_EXTRACTOR_SCRIPT_PATH="${VOICE_BOOK_PDF_EXTRACTOR_SCRIPT_PATH:-./scripts/pdf_extract.py}"
export VOICE_BOOK_PDF_REQUIRE_TEXT_EXTRACTOR="${VOICE_BOOK_PDF_REQUIRE_TEXT_EXTRACTOR:-0}"
export LOCAL_FALLBACK_ON_BOOTSTRAP_FAILURE="${LOCAL_FALLBACK_ON_BOOTSTRAP_FAILURE:-1}"
export KOKORO_DATA_DIR="${KOKORO_DATA_DIR:-}"
export QWEN_ASR_DATA_DIR="${QWEN_ASR_DATA_DIR:-}"

configure_tmpfs_paths

if [[ -z "$KOKORO_DATA_DIR" ]]; then
  KOKORO_DATA_DIR="./data/kokoro"
fi
if [[ -z "$QWEN_ASR_DATA_DIR" ]]; then
  QWEN_ASR_DATA_DIR="./data/asr"
fi
if [[ -z "${VOICE_JOB_DATA_DIR:-}" ]]; then
  VOICE_JOB_DATA_DIR="./data/jobs"
fi
if [[ -z "${VOICE_PROFILE_DATA_DIR:-}" ]]; then
  VOICE_PROFILE_DATA_DIR="./data/voice-profiles"
fi
export KOKORO_DATA_DIR
export QWEN_ASR_DATA_DIR
export VOICE_JOB_DATA_DIR
export VOICE_PROFILE_DATA_DIR

export QWEN_ASR_MODEL="${QWEN_ASR_MODEL:-Qwen/Qwen3-ASR-1.7B}"
export QWEN_ASR_LANGUAGE="${QWEN_ASR_LANGUAGE:-English}"
export QWEN_ASR_DEVICE="${QWEN_ASR_DEVICE:-auto}"
export QWEN_ASR_PERSISTENT="${QWEN_ASR_PERSISTENT:-true}"
export QWEN_ASR_PRELOAD="${QWEN_ASR_PRELOAD:-true}"
export QWEN_ASR_MAX_NEW_TOKENS="${QWEN_ASR_MAX_NEW_TOKENS:-256}"

if [[ "${KOKOCLONE_PYTHON_PATH}" != /* ]]; then
  export KOKOCLONE_PYTHON_PATH="${ROOT_DIR}/${KOKOCLONE_PYTHON_PATH}"
fi
export QWEN_ASR_TIMEOUT_SECONDS="${QWEN_ASR_TIMEOUT_SECONDS:-600}"

require_command bash
if ! command -v mise >/dev/null 2>&1; then
  require_command pnpm
  require_command go
  require_command uv
fi

if [[ "${SKIP_BOOTSTRAP:-0}" != "1" ]]; then
  if [[ ! -d "$ROOT_DIR/node_modules" || ! -d "$ROOT_DIR/frontend/node_modules" ]]; then
    echo "Installing Node dependencies..."
    (cd "$ROOT_DIR" && run_with_mise pnpm install)
  fi

  if python_runtime_needed; then
    if ! ensure_backend_python_env; then
      if profile_analysis_uses_pyannote; then
        echo "Voice profile source analysis is configured, but profile-analysis Python dependencies could not be installed."
        echo "Run: cd backend && uv sync --extra profile-analysis"
        exit 1
      fi
      fallback_to_mock_tts || true
      fallback_to_mock_checker || true
      if local_fallback_enabled; then
        echo "Continuing with mock providers after bootstrap failure."
        echo "To fail fast on bootstrap failures, set LOCAL_FALLBACK_ON_BOOTSTRAP_FAILURE=0."
      else
        exit 1
      fi
    fi

    if tts_uses_kokoro; then
      if ! ensure_kokoro_clone_python_env; then
        fallback_to_mock_tts || true
        if local_fallback_enabled; then
          echo "Continuing with mock providers after clone Python bootstrap failure."
          echo "To fail fast on bootstrap failures, set LOCAL_FALLBACK_ON_BOOTSTRAP_FAILURE=0."
        else
          exit 1
        fi
      fi

      if ! ensure_kokoro_reference_dependencies; then
        fallback_to_mock_tts || true
        if local_fallback_enabled; then
          echo "Continuing with mock providers after reference dependency bootstrap failure."
          echo "To fail fast on bootstrap failures, set LOCAL_FALLBACK_ON_BOOTSTRAP_FAILURE=0."
        else
          exit 1
        fi
      fi

      if ! ensure_kokoro_flash_attention; then
        if local_fallback_enabled; then
          echo "Continuing startup with FlashAttention unavailable (falling back to SDPA)."
          echo "To fail fast on bootstrap failures, set LOCAL_FALLBACK_ON_BOOTSTRAP_FAILURE=0."
        else
          exit 1
        fi
      fi
    fi
  else
    echo "Skipping backend Python environment bootstrap (mock-only providers)."
  fi

  if [[ "${VOICE_BOOK_PDF_REQUIRE_TEXT_EXTRACTOR}" == "1" ]] && ! book_pdf_text_extractor_available; then
    echo "VOICE_BOOK_PDF_REQUIRE_TEXT_EXTRACTOR=1 but no PDF text extractor is available."
    echo "Install poppler-utils for pdftotext or keep VOICE_BOOK_PDF_ENABLE_PYTHON_FALLBACK=1 so pypdf is bootstrapped."
    exit 1
  fi

  if optimizer_uses_bonsai; then
    if ! ensure_bonsai_env; then
      if ! fallback_to_mock_optimizer; then
        exit 1
      fi
      echo "Falling back to rules optimizer for bootstrap-safe startup."
      echo "To fail fast on bootstrap failures, set LOCAL_FALLBACK_ON_BOOTSTRAP_FAILURE=0."
    fi
  fi
fi


echo "Starting TTS Research"
echo "  Backend:  http://localhost:${BACKEND_PORT}"
echo "  Frontend: http://localhost:${FRONTEND_PORT}"
echo "  Optimizer: ${VOICE_OPTIMIZER_PROVIDER}"
if optimizer_uses_bonsai; then
  echo "  Bonsai model: ${BONSAI_MODEL}, preload: ${BONSAI_PRELOAD}"
fi
echo "  TTS: ${TTS_PROVIDER}"
echo "  TTS device: ${KOKORO_DEVICE}"
echo "  Supertonic: ${SUPERTONIC_PYTHON} (model dir: ${SUPERTONIC_MODEL_DIR}, auto-download: ${SUPERTONIC_AUTO_DOWNLOAD})"
if [[ -n "${DRAMABOX_BASE_URL}" ]]; then
  echo "  DramaBox: warm server ${DRAMABOX_BASE_URL}"
else
  echo "  DramaBox: gated experimental (set DRAMABOX_BASE_URL for warm server)"
fi
if [[ "$TTS_RESEARCH_USE_TMPFS" == "1" ]]; then
echo "  tmpfs paths: ${TTS_RESEARCH_TMPFS_ROOT} (enabled)"
echo "  Kokoro data: ${KOKORO_DATA_DIR}"
echo "  Qwen data: ${QWEN_ASR_DATA_DIR}"
echo "  Job data: ${VOICE_JOB_DATA_DIR}"
echo "  Voice profile data: ${VOICE_PROFILE_DATA_DIR}"
echo "  Voice profile denoise: ${VOICE_PROFILE_DENOISE_PROVIDER} (${VOICE_PROFILE_DENOISE_STRENGTH})"
  if book_pdf_text_extractor_available; then
    if command -v pdftotext >/dev/null 2>&1; then
      echo "  Book PDF extractor: pdftotext"
    else
      echo "  Book PDF extractor: python fallback"
    fi
  else
    echo "  Book PDF extractor: unavailable"
  fi
  if [[ "${TTS_RESEARCH_TMPFS_HF_CACHE:-0}" == "1" ]]; then
    echo "  HF cache: ${HF_HOME}"
  fi
else
  echo "  tmpfs paths: disabled"
fi
echo "  Checker: ${VOICE_CHECKER_PROVIDER} (${QWEN_ASR_DEVICE})"
echo "  Checker persistent: ${QWEN_ASR_PERSISTENT}, preload: ${QWEN_ASR_PRELOAD}"
echo "  Segment size: ${VOICE_SEGMENT_MAX_RUNES} runes"
echo "  Segment workers: ${VOICE_SEGMENT_WORKERS}"
echo "  Studio segment size: ${VOICE_SEGMENT_MAX_RUNES_STUDIO:-0} runes"
echo "  Studio segment workers: ${VOICE_SEGMENT_WORKERS_STUDIO:-0}"
echo "  Studio adaptive segment size: ${VOICE_SEGMENT_MAX_RUNES_STUDIO_ADAPTIVE:-0} runes"
echo "  Studio adaptive segment workers: ${VOICE_SEGMENT_WORKERS_STUDIO_ADAPTIVE:-0}"
echo "  Clone workers: ${KOKOCLONE_WORKER_COUNT} (KOKORO_REFERENCE script)"
echo "  KOKOCLONE Python: ${KOKOCLONE_PYTHON_PATH}"
echo "  FlashAttention: ${KOKOCLONE_FLASH_ATTENTION_STATUS:-unknown}"
echo

echo "Starting backend service..."
start_service BACKEND_PID "$ROOT_DIR/backend" go run ./cmd/api
echo "  backend pid: ${BACKEND_PID}"

echo "Starting frontend service..."
start_service FRONTEND_PID "$ROOT_DIR/frontend" pnpm exec vite --host 0.0.0.0 --port "$FRONTEND_PORT"
echo "  frontend pid: ${FRONTEND_PID}"

if ! wait_for_service "Backend" "$BACKEND_PID" "$BACKEND_PORT" 120; then
  echo "Backend failed to start. Check bootstrap and startup logs above."
  exit 1
fi

if ! wait_for_service "Frontend" "$FRONTEND_PID" "$FRONTEND_PORT" 120; then
  echo "Frontend failed to start. Check startup logs above."
  exit 1
fi

while true; do
  if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    wait "$BACKEND_PID" || exit $?
    exit 0
  fi
  if ! kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    wait "$FRONTEND_PID" || exit $?
    exit 0
  fi
  sleep 1
done
