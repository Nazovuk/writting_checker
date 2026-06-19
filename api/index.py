import sys
import os

# Add the backend directory to sys.path so that absolute imports like `from app.config import settings`
# inside the backend folder work correctly in Vercel's serverless environment where the root is the monorepo root.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from fastapi import FastAPI
from backend.app.main import app as original_app

app = FastAPI()

# Mount the backend app under /api/py
app.mount("/api/py", original_app)
