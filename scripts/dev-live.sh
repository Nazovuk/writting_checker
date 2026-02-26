#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

BACKEND_PORT=8000
FRONTEND_PORT=3000
API_BASE="http://127.0.0.1:${BACKEND_PORT}"

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "${BACKEND_PID}" >/dev/null 2>&1; then
    kill "${BACKEND_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

echo "==> Cleaning old listeners..."
pkill -9 -f "uvicorn app.main:app" >/dev/null 2>&1 || true
pkill -9 -f "python -m uvicorn" >/dev/null 2>&1 || true
pkill -9 -f "next dev" >/dev/null 2>&1 || true
pkill -9 -f "next/dist/bin/next" >/dev/null 2>&1 || true

echo "==> Starting backend on ${API_BASE} ..."
cd "$BACKEND_DIR"
if [[ ! -d ".venv" ]]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
export PWC_LANGUAGETOOL_URL="https://api.languagetool.org/v2/check"
export PWC_REQUIRE_LANGUAGETOOL=true
export PWC_LIBRETRANSLATE_URL="https://translate.argosopentech.com/translate"
python -m uvicorn app.main:app --host 127.0.0.1 --port "${BACKEND_PORT}" >/tmp/pwc-backend-live.log 2>&1 &
BACKEND_PID=$!

for _ in $(seq 1 80); do
  if curl -fsS "${API_BASE}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
if ! curl -fsS "${API_BASE}/health" >/dev/null 2>&1; then
  echo "ERROR: Backend did not start."
  tail -n 120 /tmp/pwc-backend-live.log || true
  exit 1
fi

echo "==> Starting frontend on http://localhost:${FRONTEND_PORT} ..."
cd "$FRONTEND_DIR"
printf 'NEXT_PUBLIC_API_BASE=%s\n' "${API_BASE}" > .env.local

echo
echo "LIVE MODE"
echo "- Backend health: ${API_BASE}/health"
echo "- Frontend:       http://localhost:${FRONTEND_PORT}"
echo
echo "Keep this terminal open."
echo

exec npm run dev
