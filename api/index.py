from fastapi import FastAPI
from backend.app.main import app as original_app

app = FastAPI()
app.mount("/api/py", original_app)
