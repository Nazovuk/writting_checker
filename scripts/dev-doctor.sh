#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

BACKEND_PORT=8000
FRONTEND_PORT=3000
API_BASE="http://127.0.0.1:${BACKEND_PORT}"

BACKEND_LOG="/tmp/pwc-backend.log"
FRONTEND_LOG="/tmp/pwc-frontend.log"
BACKEND_PID_FILE="/tmp/pwc-backend.pid"
FRONTEND_PID_FILE="/tmp/pwc-frontend.pid"

echo "==> Hard reset local dev processes..."
pkill -9 -f "python -m uvicorn" >/dev/null 2>&1 || true
pkill -9 -f "uvicorn app.main:app" >/dev/null 2>&1 || true
pkill -9 -f "next dev" >/dev/null 2>&1 || true
pkill -9 -f "next/dist/bin/next" >/dev/null 2>&1 || true

for _ in $(seq 1 30); do
  if ! lsof -t -iTCP:${BACKEND_PORT} -sTCP:LISTEN >/dev/null 2>&1 \
    && ! lsof -t -iTCP:${FRONTEND_PORT} -sTCP:LISTEN >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

echo "==> Start backend..."
cd "$BACKEND_DIR"
if [[ ! -d ".venv" ]]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
export PWC_LANGUAGETOOL_URL="https://api.languagetool.org/v2/check"
export PWC_REQUIRE_LANGUAGETOOL=true
export PWC_LIBRETRANSLATE_URL="https://translate.argosopentech.com/translate"
nohup python -m uvicorn app.main:app --host 127.0.0.1 --port "${BACKEND_PORT}" >"${BACKEND_LOG}" 2>&1 &
echo $! >"${BACKEND_PID_FILE}"

for _ in $(seq 1 80); do
  if curl -fsS "${API_BASE}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
if ! curl -fsS "${API_BASE}/health" >/dev/null 2>&1; then
  echo "ERROR: backend is not healthy"
  tail -n 120 "${BACKEND_LOG}" || true
  exit 1
fi

echo "==> Start frontend..."
cd "$FRONTEND_DIR"
printf 'NEXT_PUBLIC_API_BASE=%s\n' "${API_BASE}" > .env.local
# Use project script; this is more stable than `npx next ...` on this machine.
nohup npm run dev >"${FRONTEND_LOG}" 2>&1 &
echo $! >"${FRONTEND_PID_FILE}"

for _ in $(seq 1 80); do
  if curl -fsS "http://127.0.0.1:${FRONTEND_PORT}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done
if ! curl -fsS "http://127.0.0.1:${FRONTEND_PORT}" >/dev/null 2>&1; then
  echo "ERROR: frontend is not ready"
  tail -n 120 "${FRONTEND_LOG}" || true
  exit 1
fi

echo
echo "OK"
echo "Backend:  ${API_BASE}/health"
echo "Frontend: http://localhost:${FRONTEND_PORT}"
echo
echo "Quick API test:"
echo "curl -sS -X POST ${API_BASE}/v1/analyze/text -H 'content-type: application/json' -d '{\"text\":\"I goes to pub\",\"sourceLang\":\"auto\",\"explanationLang\":\"same\",\"mode\":\"standard\"}'"
