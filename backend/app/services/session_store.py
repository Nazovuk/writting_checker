from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import Lock
from uuid import uuid4


@dataclass
class SessionRecord:
    text: str
    issues: list[dict]
    created_at: datetime


class InMemorySessionStore:
    def __init__(self, ttl_seconds: int = 900):
        self.ttl_seconds = ttl_seconds
        self._lock = Lock()
        self._store: dict[str, SessionRecord] = {}

    def _cleanup(self) -> None:
        now = datetime.now(timezone.utc)
        expired = [
            sid
            for sid, item in self._store.items()
            if now - item.created_at > timedelta(seconds=self.ttl_seconds)
        ]
        for sid in expired:
            self._store.pop(sid, None)

    def put(self, text: str, issues: list[dict]) -> str:
        with self._lock:
            self._cleanup()
            sid = str(uuid4())
            self._store[sid] = SessionRecord(
                text=text,
                issues=issues,
                created_at=datetime.now(timezone.utc),
            )
            return sid

    def get(self, sid: str) -> SessionRecord | None:
        with self._lock:
            self._cleanup()
            return self._store.get(sid)


session_store = InMemorySessionStore()
