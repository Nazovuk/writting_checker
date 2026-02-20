.PHONY: backend-test backend-run frontend-dev

backend-test:
	cd backend && PYTHONPATH=. pytest -q

backend-run:
	cd backend && PYTHONPATH=. uvicorn app.main:app --reload --port 8000

frontend-dev:
	cd frontend && npm run dev
