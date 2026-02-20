from __future__ import annotations

import re
import uuid
from typing import Any

import httpx
from app.config import settings
from app.models import Issue


CATEGORY_MAP = {
    "TYPOS": "TYPOS",
    "PUNCTUATION": "PUNCTUATION",
    "CASING": "CASING",
    "GRAMMAR": "MORFOLOGY",
    "STYLE": "STYLE",
}


def _severity_from_rule(rule_id: str) -> str:
    if any(k in rule_id for k in ["MORFO", "AGREEMENT", "VERB", "CASE"]):
        return "major"
    if any(k in rule_id for k in ["TYPO", "SPELL"]):
        return "minor"
    if any(k in rule_id for k in ["PUNCT", "COMMA", "DOT"]):
        return "minor"
    return "major"


def _from_languagetool(text: str, matches: list[dict[str, Any]]) -> list[Issue]:
    issues: list[Issue] = []
    for match in matches:
        offset = int(match.get("offset", 0))
        length = int(match.get("length", 0))
        end = min(len(text), offset + length)
        original = text[offset:end]
        replacements = [r.get("value", "") for r in match.get("replacements", [])][:5]
        rule = match.get("rule", {})
        cat = rule.get("category", {}).get("id", "GRAMMAR")
        category = CATEGORY_MAP.get(cat, "MORFOLOGY")
        rule_id = str(rule.get("id", "LT_RULE"))

        issues.append(
            Issue(
                id=str(uuid.uuid4()),
                start=offset,
                end=end,
                original=original,
                replacements=[r for r in replacements if r],
                category=category,
                severity=_severity_from_rule(rule_id),
                reason=match.get("message", "Grammar suggestion."),
                ruleId=rule_id,
            )
        )
    return issues


def _local_fallback(text: str) -> list[Issue]:
    issues: list[Issue] = []
    # Simple repeated word check.
    for m in re.finditer(r"\b(\w+)\s+\1\b", text, flags=re.IGNORECASE):
        start, end = m.span()
        word = m.group(1)
        issues.append(
            Issue(
                id=str(uuid.uuid4()),
                start=start,
                end=end,
                original=text[start:end],
                replacements=[word],
                category="STYLE",
                severity="minor",
                reason="Repeated word detected.",
                ruleId="LOCAL_REPEAT_WORD",
            )
        )

    # Sentence start capitalization.
    for m in re.finditer(r"(^|[\.!?]\s+)([a-zçğıöşüа-я])", text):
        start = m.start(2)
        end = start + 1
        issues.append(
            Issue(
                id=str(uuid.uuid4()),
                start=start,
                end=end,
                original=text[start:end],
                replacements=[text[start:end].upper()],
                category="CASING",
                severity="minor",
                reason="Sentence should start with an uppercase letter.",
                ruleId="LOCAL_SENTENCE_CAP",
            )
        )

    # Minimal EN subject-verb agreement fallback.
    # Examples: "He go" -> "He goes", "She do" -> "She does", "It have" -> "It has".
    en_sv_map = {
        "go": "goes",
        "do": "does",
        "have": "has",
        "say": "says",
    }
    for m in re.finditer(r"\b(he|she|it)\s+(go|do|have|say)\b", text, flags=re.IGNORECASE):
        verb_start = m.start(2)
        verb_end = m.end(2)
        verb = m.group(2)
        replacement = en_sv_map.get(verb.lower())
        if replacement:
            if verb[:1].isupper():
                replacement = replacement[:1].upper() + replacement[1:]
            issues.append(
                Issue(
                    id=str(uuid.uuid4()),
                    start=verb_start,
                    end=verb_end,
                    original=text[verb_start:verb_end],
                    replacements=[replacement],
                    category="MORFOLOGY",
                    severity="major",
                    reason="Third-person singular subjects usually take a singular verb form.",
                    ruleId="LOCAL_EN_SUBJECT_VERB",
                )
            )

    # Basic punctuation at end.
    if text and text[-1] not in ".!?":
        issues.append(
            Issue(
                id=str(uuid.uuid4()),
                start=len(text),
                end=len(text),
                original="",
                replacements=["."],
                category="PUNCTUATION",
                severity="minor",
                reason="Sentence likely needs ending punctuation.",
                ruleId="LOCAL_END_PUNCT",
            )
        )

    return issues


async def analyze_grammar(text: str, lang: str, mode: str) -> tuple[list[Issue], list[str]]:
    warnings: list[str] = []
    payload = {
        "text": text,
        "language": lang,
        "level": "picky" if mode == "strict" else "default",
    }

    try:
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            response = await client.post(settings.languagetool_url, data=payload)
            response.raise_for_status()
            body = response.json()
            matches = body.get("matches", [])
            return _from_languagetool(text, matches), warnings
    except Exception:
        warnings.append("LanguageTool is unavailable; local fallback rules were used.")
        return _local_fallback(text), warnings


def apply_suggestions(text: str, issues: list[dict], issue_ids: list[str], strategy: str) -> tuple[str, list[str], list[str]]:
    selected = [i for i in issues if i["id"] in set(issue_ids)]
    if strategy == "safe":
        selected = [i for i in selected if i.get("severity") != "critical"]

    selected.sort(key=lambda x: x["start"], reverse=True)

    patched = text
    applied: list[str] = []
    skipped: list[str] = []

    for issue in selected:
        repls = issue.get("replacements", [])
        if not repls:
            skipped.append(issue["id"])
            continue

        start, end = int(issue["start"]), int(issue["end"])
        if start < 0 or end > len(patched) or start > end:
            skipped.append(issue["id"])
            continue

        patched = patched[:start] + repls[0] + patched[end:]
        applied.append(issue["id"])

    missing = [i for i in issue_ids if i not in set(applied) and i not in set(skipped)]
    skipped.extend(missing)
    return patched, applied, skipped
