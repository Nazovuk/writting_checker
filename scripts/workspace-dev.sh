#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

BACKEND_PORT=8000
FRONTEND_PORT=3000

BACKEND_PID_FILE="/tmp/pwc-backend.pid"
FRONTEND_PID_FILE="/tmp/pwc-frontend.pid"
BACKEND_LOG="/tmp/pwc-backend.log"
FRONTEND_LOG="/tmp/pwc-frontend.log"

kill_pid_file() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file" || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
    rm -f "$pid_file"
  fi
}

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -t -iTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids:-}" ]]; then
    kill -9 ${pids} >/dev/null 2>&1 || true
  fi
}

wait_http_ok() {
  local url="$1"
  for _ in $(seq 1 80); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

stop_all() {
  kill_pid_file "$BACKEND_PID_FILE"
  kill_pid_file "$FRONTEND_PID_FILE"
  pkill -9 -f "uvicorn app.main:app" >/dev/null 2>&1 || true
  pkill -9 -f "python -m uvicorn" >/dev/null 2>&1 || true
  pkill -9 -f "next dev" >/dev/null 2>&1 || true
  pkill -9 -f "next/dist/bin/next" >/dev/null 2>&1 || true
  kill_port "$BACKEND_PORT"
  kill_port "$FRONTEND_PORT"
  rm -f "$FRONTEND_DIR/.next/dev/lock"
}

start_all() {
  stop_all

  cd "$BACKEND_DIR"
  if [[ ! -d ".venv" ]]; then
    python3 -m venv .venv
  fi
  # shellcheck disable=SC1091
  source .venv/bin/activate
  export PWC_LANGUAGETOOL_URL="https://api.languagetool.org/v2/check"
  export PWC_LIBRETRANSLATE_URL="https://translate.argosopentech.com/translate"
  nohup python -m uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT" >"$BACKEND_LOG" 2>&1 &
  echo $! >"$BACKEND_PID_FILE"

  if ! wait_http_ok "http://127.0.0.1:${BACKEND_PORT}/health"; then
    echo "Backend failed to start"
    tail -n 120 "$BACKEND_LOG" || true
    exit 1
  fi

  cd "$FRONTEND_DIR"
  printf 'NEXT_PUBLIC_API_BASE=http://127.0.0.1:%s\n' "$BACKEND_PORT" > .env.local
  rm -f .next/dev/lock
  nohup npm run dev >"$FRONTEND_LOG" 2>&1 &
  echo $! >"$FRONTEND_PID_FILE"

  if ! wait_http_ok "http://127.0.0.1:${FRONTEND_PORT}"; then
    echo "Frontend failed to start"
    tail -n 120 "$FRONTEND_LOG" || true
    exit 1
  fi

  echo "OK"
  echo "Frontend: http://localhost:${FRONTEND_PORT}"
  echo "Backend:  http://127.0.0.1:${BACKEND_PORT}/health"
}

status_all() {
  echo "[Ports]"
  lsof -nP -iTCP:${FRONTEND_PORT} -sTCP:LISTEN || true
  lsof -nP -iTCP:${BACKEND_PORT} -sTCP:LISTEN || true
  echo
  echo "[Health]"
  curl -fsS "http://127.0.0.1:${BACKEND_PORT}/health" || echo "backend: down"
  echo
  curl -I -fsS "http://127.0.0.1:${FRONTEND_PORT}" | head -n 1 || echo "frontend: down"
}

logs_all() {
  echo "--- backend ---"
  tail -n 40 "$BACKEND_LOG" || true
  echo "--- frontend ---"
  tail -n 40 "$FRONTEND_LOG" || true
}

cmd="${1:-}"
case "$cmd" in
  start) start_all ;;
  stop) stop_all; echo "Stopped" ;;
  restart) stop_all; start_all ;;
  status) status_all ;;
  logs) logs_all ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs}"
    exit 1
    ;;
esac

