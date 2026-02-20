# Polyglot Writing Coach API

## Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Run tests

```bash
pip install -r requirements-dev.txt
pytest -q
```

## Optional local dependencies

```bash
docker compose -f ../infra/docker-compose.yml up -d
```

- LanguageTool: http://localhost:8010
- LibreTranslate: http://localhost:5001

## API

- `POST /v1/analyze/text`
- `POST /v1/analyze/image`
- `POST /v1/analyze/file`
- `POST /v1/suggestions/apply`
- `GET /v1/languages`
