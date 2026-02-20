from __future__ import annotations

import httpx
from app.config import settings


async def translate_text(text: str, source: str, target: str) -> str:
    if source == target:
        return text

    payload = {
        "q": text,
        "source": source,
        "target": target,
        "format": "text",
    }

    try:
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            response = await client.post(settings.libretranslate_url, json=payload)
            response.raise_for_status()
            body = response.json()
            translated = body.get("translatedText")
            if isinstance(translated, str) and translated.strip():
                return translated
    except Exception:
        # Fail-open for MVP: keep original content if translation provider is unavailable.
        return text

    return text
