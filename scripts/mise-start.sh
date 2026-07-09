#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$ROOT_DIR/scripts/start-port-env.sh"

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

require_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

provider_is() {
  local needle="$1"
  local value="${2,,}"
  [[ "$value" == "$needle" ]]
}

tts_uses_kokoro() {
  local provider="${TTS_PROVIDER:-mock}"
  provider_is "kokoro" "$provider" || provider_is "kokoro-local" "$provider"
}

checker_uses_qwen() {
  local provider="${VOICE_CHECKER_PROVIDER:-mock}"
  provider_is "qwen" "$provider" || provider_is "qwen-asr" "$provider"
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

is_port_in_use() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    return 1
  fi

  if command -v ss >/dev/null 2>&1; then
    if ss -ltnpH 2>/dev/null | awk -v p=":${port}" '$4 ~ p {exit 0} END {exit 1}'; then
      return 0
    fi
    return 1
  fi

  if command -v netstat >/dev/null 2>&1; then
    if netstat -ltn 2>/dev/null | awk -v p=":${port}" '$4 ~ p && $6=="LISTEN" {exit 0} END {exit 1}'; then
      return 0
    fi
    return 1
  fi

  return 1
}

port_listener_summary() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $1" "$2" "$9}'
    return
  fi

  if command -v ss >/dev/null 2>&1; then
    ss -ltnpH 2>/dev/null | awk -v p=":${port}" '$4 ~ p {print $0; exit}'
    return
  fi

  if command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | awk -v p=":${port}" '$4 ~ p && $6=="LISTEN" {print $0; exit}'
    return
  fi

  echo "Port check utility unavailable"
}

preflight_summary() {
  echo "[preflight] Environment"
  echo "  - command: bash, go, pnpm"
  echo "  - git: $(command -v git >/dev/null 2>&1 && echo "available" || echo "missing")"
  echo "  - ffmpeg: $(command -v ffmpeg >/dev/null 2>&1 && echo "available" || echo "missing")"
  echo "  - ffprobe: $(command -v ffprobe >/dev/null 2>&1 && echo "available" || echo "missing")"
  echo "  - pdftotext: $(command -v pdftotext >/dev/null 2>&1 && echo "available" || echo "missing (PDF fallback will use managed Python if available)")"

  if python_runtime_needed; then
    echo "  - uv: $(command -v uv >/dev/null 2>&1 && echo "available" || echo "missing (required for runtime Python providers)")"
    echo "  - Kokoro FlashAttention bootstrap: install=${KOKOCLONE_INSTALL_FLASH_ATTENTION:-1}, require=${KOKOCLONE_REQUIRE_FLASH_ATTENTION:-0}"
    echo "  - pyannote source analysis: $(profile_analysis_uses_pyannote && echo "configured" || echo "not configured")"
    echo "  - source analysis Python: ${VOICE_PROFILE_ANALYSIS_PYTHON_PATH:-./.venv/bin/python}"
    echo "  - Supertonic 3: ${SUPERTONIC_PYTHON:-./.venv-supertonic/bin/python}"
    echo "  - DramaBox: ${DRAMABOX_BASE_URL:-not configured (warm server preferred)}"
  else
    echo "  - uv: not required for mock-only configuration"
  fi
  echo
}

start_command=( "$@" )
if [[ "${#start_command[@]}" -gt 0 && "${start_command[0]}" == "--" ]]; then
  start_command=( "${start_command[@]:1}" )
fi

if [[ "${#start_command[@]}" -eq 0 ]]; then
  start_command=(pnpm start)
fi

[[ -n "${BACKEND_PORT:-}" ]] && START_EXPLICIT_BACKEND_PORT=1
[[ -n "${FRONTEND_PORT:-}" ]] && START_EXPLICIT_FRONTEND_PORT=1
[[ -n "${VITE_API_BASE_URL:-}" ]] && START_EXPLICIT_VITE_API_BASE_URL=1

load_env_file "$ROOT_DIR/.env"
load_env_file "$ROOT_DIR/backend/.env"

while [[ "${#start_command[@]}" -gt 0 ]]; do
  if [[ "${start_command[0]}" == [A-Za-z_][A-Za-z0-9_]*=* ]]; then
    assignment="${start_command[0]}"
    key="${assignment%%=*}"
    export "$assignment"
    case "$key" in
      BACKEND_PORT)
        START_EXPLICIT_BACKEND_PORT=1
        ;;
      FRONTEND_PORT)
        START_EXPLICIT_FRONTEND_PORT=1
        ;;
      VITE_API_BASE_URL)
        START_EXPLICIT_VITE_API_BASE_URL=1
        ;;
    esac
    start_command=( "${start_command[@]:1}" )
    continue
  fi
  break
done

if [[ "${#start_command[@]}" -eq 0 ]]; then
  echo "No startup command was specified after environment assignments." >&2
  exit 1
fi

if [[ "${start_command[0]}" == "pnpm" ]]; then
  case "${start_command[1]:-}" in
    start:local)
      TTS_PROVIDER="kokoro"
      VOICE_CHECKER_PROVIDER="qwen"
      VOICE_OPTIMIZER_PROVIDER="rules"
      LOCAL_FALLBACK_ON_BOOTSTRAP_FAILURE="${LOCAL_FALLBACK_ON_BOOTSTRAP_FAILURE:-0}"
      KOKOCLONE_PYTHON_PATH="${KOKOCLONE_PYTHON_PATH:-./.venv-kokoclone/bin/python}"
      KOKOCLONE_PYTHON_VERSION="${KOKOCLONE_PYTHON_VERSION:-3.12}"
      KOKOCLONE_BOOTSTRAP_FLASH_ATTENTION_ON_BOOT="${KOKOCLONE_BOOTSTRAP_FLASH_ATTENTION_ON_BOOT:-1}"
      KOKOCLONE_FLASH_ATTENTION_WHEEL_ONLY="${KOKOCLONE_FLASH_ATTENTION_WHEEL_ONLY:-1}"
      KOKOCLONE_ALLOW_FLASH_ATTENTION_SOURCE="${KOKOCLONE_ALLOW_FLASH_ATTENTION_SOURCE:-0}"
      KOKOCLONE_INSTALL_FLASH_ATTENTION="${KOKOCLONE_INSTALL_FLASH_ATTENTION:-1}"
      KOKOCLONE_FLASH_ATTENTION_PACKAGE="${KOKOCLONE_FLASH_ATTENTION_PACKAGE:-flash-attn==2.8.3}"
      KOKOCLONE_FLASH_ATTENTION_FALLBACK_PACKAGE="${KOKOCLONE_FLASH_ATTENTION_FALLBACK_PACKAGE:-flash-attn-3}"
      KOKOCLONE_FLASH_ATTENTION_IMPORT_MODULE="${KOKOCLONE_FLASH_ATTENTION_IMPORT_MODULE:-flash_attn}"
      export LOCAL_FALLBACK_ON_BOOTSTRAP_FAILURE \
        KOKOCLONE_PYTHON_PATH \
        KOKOCLONE_PYTHON_VERSION \
        KOKOCLONE_BOOTSTRAP_FLASH_ATTENTION_ON_BOOT \
        KOKOCLONE_FLASH_ATTENTION_WHEEL_ONLY \
        KOKOCLONE_ALLOW_FLASH_ATTENTION_SOURCE \
        KOKOCLONE_INSTALL_FLASH_ATTENTION \
        KOKOCLONE_FLASH_ATTENTION_PACKAGE \
        KOKOCLONE_FLASH_ATTENTION_FALLBACK_PACKAGE \
        KOKOCLONE_FLASH_ATTENTION_IMPORT_MODULE
      ;;
    start:local-bonsai)
      TTS_PROVIDER="kokoro"
      VOICE_CHECKER_PROVIDER="qwen"
      VOICE_OPTIMIZER_PROVIDER="bonsai"
      ;;
    start:mock)
      TTS_PROVIDER="mock"
      VOICE_CHECKER_PROVIDER="mock"
      VOICE_OPTIMIZER_PROVIDER="rules"
      ;;
    start)
      TTS_PROVIDER="${TTS_PROVIDER:-mock}"
      VOICE_CHECKER_PROVIDER="${VOICE_CHECKER_PROVIDER:-mock}"
      VOICE_OPTIMIZER_PROVIDER="${VOICE_OPTIMIZER_PROVIDER:-rules}"
      ;;
  esac
fi

resolve_start_ports
VOICE_OPTIMIZER_PROVIDER="${VOICE_OPTIMIZER_PROVIDER:-rules}"
TTS_PROVIDER="${TTS_PROVIDER:-mock}"
VOICE_CHECKER_PROVIDER="${VOICE_CHECKER_PROVIDER:-mock}"

export VOICE_OPTIMIZER_PROVIDER TTS_PROVIDER VOICE_CHECKER_PROVIDER

require_command bash
require_command go
require_command pnpm

if python_runtime_needed; then
  require_command uv
fi

if [[ "${SKIP_FRONTEND_DEPS_CHECK:-0}" != "1" ]]; then
  if [[ ! -d "$ROOT_DIR/node_modules" || ! -d "$ROOT_DIR/frontend/node_modules" ]]; then
    echo "Installing Node dependencies..."
    (cd "$ROOT_DIR" && pnpm install)
  fi
fi

if [[ "${SKIP_PORT_CHECK:-0}" != "1" ]]; then
  echo "[preflight] Checking listener ports"
  if ! command -v lsof >/dev/null 2>&1 && ! command -v ss >/dev/null 2>&1 && ! command -v netstat >/dev/null 2>&1; then
    echo "Skipping port checks: install lsof, ss, or netstat"
  else
    if [[ "$BACKEND_PORT" == *[^0-9]* || "$FRONTEND_PORT" == *[^0-9]* ]]; then
      echo "Invalid port in configuration (non-numeric)."
      exit 1
    fi

    if is_port_in_use "$BACKEND_PORT"; then
      echo "Cannot start: backend port ${BACKEND_PORT} is already in use."
      echo "  $(port_listener_summary "$BACKEND_PORT")"
      echo "Set BACKEND_PORT or stop the existing service."
      exit 1
    fi

    if is_port_in_use "$FRONTEND_PORT"; then
      echo "Cannot start: frontend port ${FRONTEND_PORT} is already in use."
      echo "  $(port_listener_summary "$FRONTEND_PORT")"
      echo "Set FRONTEND_PORT or stop the existing service."
      exit 1
    fi
  fi
  echo "  - requested ports are free (backend:${BACKEND_PORT}, frontend:${FRONTEND_PORT})"
  echo
fi

preflight_summary

if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "Warning: ffmpeg/ffprobe are not both available. Non-WAV profile uploads will fail until both are installed."
  echo
fi

if ! command -v pdftotext >/dev/null 2>&1; then
  echo "Warning: pdftotext is not available. Book Cinema PDF import will use the managed Python fallback when installed."
  echo "Set VOICE_BOOK_PDF_REQUIRE_TEXT_EXTRACTOR=1 to fail startup if no PDF text extractor is available."
  echo
fi

if python_runtime_needed && [[ "${KOKORO_REFERENCE_MODULE_PATH:-}" == "" ]]; then
  echo "Warning: KOKORO_REFERENCE_MODULE_PATH is not set; runtime startup will attempt automatic resolution."
  echo
fi

echo "[preflight] Starting with command:"
printf "  %q" "${start_command[@]}"
echo
echo

cd "$ROOT_DIR"
exec "${start_command[@]}"
