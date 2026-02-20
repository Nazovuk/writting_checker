from __future__ import annotations

import re

try:
    from langdetect import detect, LangDetectException
except Exception:  # pragma: no cover
    detect = None

    class LangDetectException(Exception):
        pass

SUPPORTED = {"en", "tr", "bg"}


def detect_language(text: str, requested: str = "auto") -> str:
    if requested in SUPPORTED:
        return requested

    if detect is None:
        # Lightweight alphabet-based heuristic fallback when langdetect is unavailable.
        if re.search(r"[ğüşöçıİĞÜŞÖÇ]", text):
            return "tr"
        if re.search(r"[А-Яа-я]", text):
            return "bg"
        return "en"

    try:
        detected = detect(text)
    except LangDetectException:
        return "en"

    if detected not in SUPPORTED:
        return "en"
    return detected
