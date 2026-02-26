# Polyglot Writing Coach MVP

Monorepo structure:

- `/frontend`: Next.js responsive web UI
- `/backend`: FastAPI stateless API
- `/infra`: optional local docker dependencies

## Quickstart

1. Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir app --reload-exclude ".venv/*"
```

2. Optional NLP services
```bash
docker compose -f infra/docker-compose.yml up -d
```

3. Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

## Notes

- No persistent storage is used in MVP.
- If LanguageTool/LibreTranslate are not running, backend uses fallback behavior.
- Input options: paste text, drag-and-drop file, open-anything file picker, and screenshot capture.
- Supported ingestion in `/v1/analyze/file`: image formats, PDF, DOCX, and text-like files (txt/md/csv/rtf/json/xml/yaml).

## Render Auto Deploy (no manual dashboard deploy)

1. In Render backend service settings, create a **Deploy Hook** URL.
2. In GitHub repo settings, add secret:
   - Name: `RENDER_DEPLOY_HOOK_URL`
   - Value: Render deploy hook URL
3. Push to `main` and GitHub Actions will trigger Render deploy automatically.
