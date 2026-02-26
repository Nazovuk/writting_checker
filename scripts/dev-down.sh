#!/usr/bin/env bash
set -euo pipefail

BACKEND_PORT=8000
FRONTEND_PORT=3000
BACKEND_PID_FILE="/tmp/pwc-backend.pid"
FRONTEND_PID_FILE="/tmp/pwc-frontend.pid"

kill_by_pid_file() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file" || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
    rm -f "$pid_file"
  fi
}

kill_on_port() {
  local port="$1"
  local pids
  pids="$(lsof -t -iTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids:-}" ]]; then
    kill ${pids} >/dev/null 2>&1 || true
  fi
}

wait_port_free() {
  local port="$1"
  for _ in $(seq 1 30); do
    if ! lsof -t -iTCP:${port} -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.2
  done
  return 1
}

force_kill_on_port() {
  local port="$1"
  local pids
  pids="$(lsof -t -iTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids:-}" ]]; then
    kill -9 ${pids} >/dev/null 2>&1 || true
  fi
}

kill_by_pid_file "${BACKEND_PID_FILE}"
kill_by_pid_file "${FRONTEND_PID_FILE}"

kill_on_port "${BACKEND_PORT}"
kill_on_port "${FRONTEND_PORT}"

# Safety cleanup for common dev commands (including reload parent processes)
for _ in $(seq 1 5); do
  pkill -f "uvicorn app.main:app" >/dev/null 2>&1 || true
  pkill -f "python -m uvicorn" >/dev/null 2>&1 || true
  pkill -f "next dev" >/dev/null 2>&1 || true
  pkill -f "next/dist/bin/next" >/dev/null 2>&1 || true

  wait_port_free "${BACKEND_PORT}" || force_kill_on_port "${BACKEND_PORT}"
  wait_port_free "${FRONTEND_PORT}" || force_kill_on_port "${FRONTEND_PORT}"

  if ! lsof -t -iTCP:${BACKEND_PORT} -sTCP:LISTEN >/dev/null 2>&1 \
    && ! lsof -t -iTCP:${FRONTEND_PORT} -sTCP:LISTEN >/dev/null 2>&1; then
    break
  fi
  sleep 0.3
done

echo "Stopped local backend/frontend (if running)."
