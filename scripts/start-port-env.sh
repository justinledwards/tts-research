#!/usr/bin/env bash

port_value_is_uint() {
  local value="$1"
  [[ -n "$value" && "$value" != *[^0-9]* ]]
}

validate_start_port() {
  local name="$1"
  local value="$2"

  if ! port_value_is_uint "$value"; then
    echo "Invalid ${name}: ${value:-<empty>} (expected a numeric TCP port)." >&2
    exit 1
  fi

  if ((10#$value < 1 || 10#$value > 65535)); then
    echo "Invalid ${name}: ${value} (expected 1-65535)." >&2
    exit 1
  fi
}

resolve_start_ports() {
  local backend_alias_applied="0"

  if [[ -n "${PORT_BASE:-}" ]]; then
    validate_start_port PORT_BASE "$PORT_BASE"
  fi

  if [[ -z "${START_EXPLICIT_FRONTEND_PORT:-}" ]]; then
    if [[ -n "${APP_PORT:-}" ]]; then
      FRONTEND_PORT="$APP_PORT"
    elif [[ -n "${PORT:-}" ]]; then
      FRONTEND_PORT="$PORT"
    elif [[ -n "${PORT_BASE:-}" ]]; then
      FRONTEND_PORT="$PORT_BASE"
    elif [[ -z "${FRONTEND_PORT:-}" ]]; then
      FRONTEND_PORT="5173"
    fi
  fi

  if [[ -z "${START_EXPLICIT_BACKEND_PORT:-}" ]]; then
    if [[ -n "${API_PORT:-}" ]]; then
      BACKEND_PORT="$API_PORT"
      backend_alias_applied="1"
    elif [[ -n "${PORT_BASE:-}" ]]; then
      BACKEND_PORT="$((10#$PORT_BASE + 1))"
      backend_alias_applied="1"
    elif [[ -z "${BACKEND_PORT:-}" ]]; then
      BACKEND_PORT="8080"
    fi
  fi

  if [[ -z "${BACKEND_PORT:-}" ]]; then
    BACKEND_PORT="8080"
  fi
  if [[ -z "${FRONTEND_PORT:-}" ]]; then
    FRONTEND_PORT="5173"
  fi

  if [[ -z "${START_EXPLICIT_VITE_API_BASE_URL:-}" ]]; then
    if [[ "$backend_alias_applied" == "1" || -z "${VITE_API_BASE_URL:-}" ]]; then
      VITE_API_BASE_URL="http://localhost:${BACKEND_PORT}"
    else
      VITE_API_BASE_URL="${VITE_API_BASE_URL}"
    fi
  fi

  validate_start_port FRONTEND_PORT "$FRONTEND_PORT"
  validate_start_port BACKEND_PORT "$BACKEND_PORT"

  export BACKEND_PORT FRONTEND_PORT
  export VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://localhost:${BACKEND_PORT}}"
}
