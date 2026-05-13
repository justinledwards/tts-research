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

optimizer_uses_bonsai() {
  local provider
  provider="$(printf '%s' "$VOICE_OPTIMIZER_PROVIDER" | tr '[:upper:]' '[:lower:]')"
  [[ "$provider" == "bonsai" || "$provider" == "auto" ]]
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM

  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi

  wait >/dev/null 2>&1 || true
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

load_env_file "$ROOT_DIR/.env"
load_env_file "$ROOT_DIR/backend/.env"

export BACKEND_PORT="${BACKEND_PORT:-8080}"
export FRONTEND_PORT="${FRONTEND_PORT:-5173}"
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://localhost:${BACKEND_PORT}}"
export VOICE_OPTIMIZER_PROVIDER="${VOICE_OPTIMIZER_PROVIDER:-bonsai}"
export BONSAI_MODEL="${BONSAI_MODEL:-prism-ml/Bonsai-8B-mlx-1bit}"
export BONSAI_PYTHON_PATH="${BONSAI_PYTHON_PATH:-./.venv-bonsai/bin/python}"
export BONSAI_SCRIPT_PATH="${BONSAI_SCRIPT_PATH:-./scripts/bonsai_optimize.py}"
export BONSAI_PRELOAD="${BONSAI_PRELOAD:-true}"
export BONSAI_MAX_TOKENS="${BONSAI_MAX_TOKENS:-0}"
export BONSAI_TIMEOUT_SECONDS="${BONSAI_TIMEOUT_SECONDS:-600}"
export BONSAI_TEMPERATURE="${BONSAI_TEMPERATURE:-0.1}"
export BONSAI_TOP_P="${BONSAI_TOP_P:-0.9}"
export BONSAI_TOP_K="${BONSAI_TOP_K:-20}"
export OPENROUTER_MODEL="${OPENROUTER_MODEL:-openrouter/free}"
export OPENROUTER_TIMEOUT_SECONDS="${OPENROUTER_TIMEOUT_SECONDS:-180}"
export TTS_PROVIDER="${TTS_PROVIDER:-kokoro}"
export VOICE_CHECKER_PROVIDER="${VOICE_CHECKER_PROVIDER:-qwen}"
export QWEN_ASR_MODEL="${QWEN_ASR_MODEL:-Qwen/Qwen3-ASR-1.7B}"
export QWEN_ASR_LANGUAGE="${QWEN_ASR_LANGUAGE:-English}"
export QWEN_ASR_DEVICE="${QWEN_ASR_DEVICE:-auto}"
export QWEN_ASR_PERSISTENT="${QWEN_ASR_PERSISTENT:-true}"
export QWEN_ASR_PRELOAD="${QWEN_ASR_PRELOAD:-true}"
export QWEN_ASR_MAX_NEW_TOKENS="${QWEN_ASR_MAX_NEW_TOKENS:-256}"
export QWEN_ASR_TIMEOUT_SECONDS="${QWEN_ASR_TIMEOUT_SECONDS:-600}"
export VOICE_SEGMENT_MAX_RUNES="${VOICE_SEGMENT_MAX_RUNES:-300}"

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

  if [[ ! -x "$ROOT_DIR/backend/.venv/bin/python" ]]; then
    echo "Creating backend Python environment..."
    (cd "$ROOT_DIR/backend" && run_with_mise uv sync)
  fi

  if optimizer_uses_bonsai; then
    if [[ ! -x "$ROOT_DIR/backend/.venv-bonsai/bin/python" ]]; then
      echo "Creating Bonsai Python environment..."
      (cd "$ROOT_DIR/backend" && run_with_mise uv venv .venv-bonsai --python 3.13 --seed)
    fi

    if ! "$ROOT_DIR/backend/.venv-bonsai/bin/python" -c "import mlx.core, mlx_lm" >/dev/null 2>&1; then
      echo "Installing Bonsai Python dependencies..."
      (
        cd "$ROOT_DIR/backend"
        "$ROOT_DIR/backend/.venv-bonsai/bin/pip" install "mlx-lm==0.31.2"
        CMAKE_ARGS="-DPython_EXECUTABLE=${ROOT_DIR}/backend/.venv-bonsai/bin/python -DPython3_EXECUTABLE=${ROOT_DIR}/backend/.venv-bonsai/bin/python" \
          "$ROOT_DIR/backend/.venv-bonsai/bin/pip" install --force-reinstall --no-deps "mlx @ git+https://github.com/PrismML-Eng/mlx.git@prism"
      )
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
echo "  Checker: ${VOICE_CHECKER_PROVIDER} (${QWEN_ASR_DEVICE})"
echo "  Checker persistent: ${QWEN_ASR_PERSISTENT}, preload: ${QWEN_ASR_PRELOAD}"
echo "  Segment size: ${VOICE_SEGMENT_MAX_RUNES} runes"
echo

(
  cd "$ROOT_DIR/backend"
  run_with_mise go run ./cmd/api
) &
BACKEND_PID=$!

(
  cd "$ROOT_DIR/frontend"
  run_with_mise pnpm exec vite --host 0.0.0.0 --port "$FRONTEND_PORT"
) &
FRONTEND_PID=$!

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
