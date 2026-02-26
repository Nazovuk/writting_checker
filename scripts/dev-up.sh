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

echo "==> Stopping old local servers (if any)..."
"$ROOT_DIR/scripts/dev-down.sh" >/dev/null 2>&1 || true

echo "==> Preparing backend venv..."
cd "$BACKEND_DIR"
if [[ ! -d ".venv" ]]; then
  python3 -m venv .venv
fi
source .venv/bin/activate

export PWC_LANGUAGETOOL_URL="https://api.languagetool.org/v2/check"
export PWC_REQUIRE_LANGUAGETOOL=true
export PWC_LIBRETRANSLATE_URL="https://translate.argosopentech.com/translate"

echo "==> Starting backend on ${API_BASE} ..."
nohup python -m uvicorn app.main:app \
  --host 127.0.0.1 \
  --port "${BACKEND_PORT}" \
  >"${BACKEND_LOG}" 2>&1 &
echo $! >"${BACKEND_PID_FILE}"

echo "==> Waiting for backend health..."
for _ in $(seq 1 60); do
  if curl -fsS "${API_BASE}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
if ! curl -fsS "${API_BASE}/health" >/dev/null 2>&1; then
  echo "Backend did not become healthy. Last logs:"
  tail -n 80 "${BACKEND_LOG}" || true
  exit 1
fi

echo "==> Writing frontend env..."
cd "$FRONTEND_DIR"
touch .env.local
grep -v '^NEXT_PUBLIC_API_BASE=' .env.local > .env.local.tmp || true
printf 'NEXT_PUBLIC_API_BASE=%s\n' "${API_BASE}" >> .env.local.tmp
mv .env.local.tmp .env.local

echo "==> Starting frontend on http://localhost:${FRONTEND_PORT} ..."
nohup npm run dev >"${FRONTEND_LOG}" 2>&1 &
echo $! >"${FRONTEND_PID_FILE}"

echo "==> Waiting for frontend..."
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${FRONTEND_PORT}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
if ! curl -fsS "http://127.0.0.1:${FRONTEND_PORT}" >/dev/null 2>&1; then
  echo "Frontend did not become ready. Last logs:"
  tail -n 80 "${FRONTEND_LOG}" || true
  exit 1
fi

echo
echo "DONE"
echo "- Backend:  ${API_BASE}/health"
echo "- Frontend: http://localhost:${FRONTEND_PORT}"
echo "- Backend log:  ${BACKEND_LOG}"
echo "- Frontend log: ${FRONTEND_LOG}"
echo
echo "Follow logs:"
echo "  tail -f ${BACKEND_LOG}"
echo "  tail -f ${FRONTEND_LOG}"
echo
echo "Stop all:"
echo "  ${ROOT_DIR}/scripts/dev-down.sh"
