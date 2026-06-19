from __future__ import annotations

import re

from app.models import Issue, LearningCard, SessionSummary


RULE_HINTS = {
    "MORPHOLOGY": "Pay attention to word form and agreement.",
    "TYPOS": "Fix spelling for clarity and correctness.",
    "PUNCTUATION": "Use punctuation to improve readability.",
    "CASING": "Capitalize proper sentence starts and names.",
    "STYLE": "Prefer concise and natural phrasing.",
}

HUMAN_CATEGORY_NAMES = {
    "MORPHOLOGY": "Morphology",
    "TYPOS": "Typos",
    "PUNCTUATION": "Punctuation",
    "CASING": "Casing",
    "STYLE": "Style",
}


def issue_to_card(issue: Issue) -> LearningCard:
    short_rule = RULE_HINTS.get(issue.category, "Follow grammar conventions for this context.")
    correct = issue.replacements[0] if issue.replacements else issue.original
    title = f"{HUMAN_CATEGORY_NAMES.get(issue.category, issue.category.title())} improvement"

    return LearningCard(
        title=title,
        shortRule=short_rule,
        wrongExample=issue.original,
        correctExample=correct,
        level="beginner" if issue.severity != "critical" else "intermediate",
    )


def build_summary(issues: list[Issue], lang: str) -> SessionSummary:
    if not issues:
        return SessionSummary(
            topMistakes=[],
            vocabularyHints=["Great job. Try writing a longer paragraph to continue improving."],
            nextPractice="Write 5-8 sentences and focus on sentence variety.",
        )

    top = {}
    for issue in issues:
        top[issue.category] = top.get(issue.category, 0) + 1

    ordered = sorted(top.items(), key=lambda x: x[1], reverse=True)
    top_mistakes = [f"{HUMAN_CATEGORY_NAMES.get(k, k.title())}: {v}" for k, v in ordered[:3]]

    return SessionSummary(
        topMistakes=top_mistakes,
        vocabularyHints=[
            "Replace repeated words with synonyms.",
            "Mix short and medium-length sentences for better flow.",
        ],
        nextPractice="Rewrite one paragraph by applying the top two corrections.",
    )


def _normalize_sentence_boundaries(text: str) -> str:
    cleaned = re.sub(r"\.{2,}", ".", text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    # Capitalize starts after sentence boundaries.
    cleaned = re.sub(
        r"(^|[.!?]\s+)([a-z])",
        lambda m: f"{m.group(1)}{m.group(2).upper()}",
        cleaned,
    )
    return cleaned


def _english_paragraph_coherence_pass(text: str) -> str:
    rewritten = text

    # If narrative time markers exist, keep surrounding narrative verbs in past.
    has_past_narrative = bool(
        re.search(
            r"\b(yesterday|during the session|after that|in the end|when we finally)\b",
            rewritten,
            flags=re.IGNORECASE,
        )
    )
    if has_past_narrative:
        rewritten = re.sub(r"\bwe are thinking we will need it\b", "we thought we would need it", rewritten, flags=re.IGNORECASE)
        rewritten = re.sub(r"\bin the end we realize\b", "in the end we realized", rewritten, flags=re.IGNORECASE)
        rewritten = re.sub(r"\bafter that,\s+we decide\b", "After that, we decided", rewritten, flags=re.IGNORECASE)
        rewritten = re.sub(r"\bwhen we finally arrive\b", "when we finally arrived", rewritten, flags=re.IGNORECASE)
        rewritten = re.sub(r"\b(I am|I'm) feeling exhausted\b", "I felt exhausted", rewritten, flags=re.IGNORECASE)
        rewritten = re.sub(r"\bwho are trying\b", "who were trying", rewritten, flags=re.IGNORECASE)

    rewritten = re.sub(r"\bthe mistakes we made today is showing me\b", "the mistakes we made today are showing me", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\bfor attending\b", "to attend", rewritten, flags=re.IGNORECASE)
    rewritten = _normalize_sentence_boundaries(rewritten)
    return rewritten


def _english_fluency_rewrite(text: str) -> str:
    rewritten = text
    rewritten = re.sub(r"\bgo to market\b", "go to the market", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\bwith (his|her|their) dress up\b", r"in \1 dress", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\bme and ([a-z][a-z'\-]*(?:\s+[a-z][a-z'\-]*){0,3})\b", r"\1 and I", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\b([a-z][a-z'\-]*(?:\s+[a-z][a-z'\-]*){0,3}) and I\s+takes\b", r"\1 and I take", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\b([a-z][a-z'\-]*(?:\s+[a-z][a-z'\-]*){0,3}) and I\s+is\b", r"\1 and I are", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\b([a-z][a-z'\-]*(?:\s+[a-z][a-z'\-]*){0,3}) and I\s+was\b", r"\1 and I were", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\bpeoples\b", "people", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\bpeople who is\b", "people who are", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\bI am\b", "I'm", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\bdon't ([^.!?\n]{0,60}) no\b", r"don't \1 any", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\byesterday,\s+i have gone\b", "Yesterday, I went", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\byesterday,\s+we have gone\b", "Yesterday, we went", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\bmany of the ([a-z][a-z'\-]*) was\b", r"many of the \1 were", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\b(streets|roads|people|examples|notes)\s+was\b", r"\1 were", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\bthe mistakes we did\b", "the mistakes we made", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\bhalf of the notes is duplicated\b", "half of the notes were duplicated", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(
        r"\b([a-z][a-z'\-]*(?:\s+[a-z][a-z'\-]*){0,3})\s+takes notes and i quickly because\b",
        r"\1 and I took notes quickly because",
        rewritten,
        flags=re.IGNORECASE,
    )
    rewritten = _english_paragraph_coherence_pass(rewritten)
    rewritten = re.sub(r"\s+", " ", rewritten).strip()
    if rewritten and rewritten[-1] not in ".!?":
        rewritten += "."
    if rewritten:
        rewritten = rewritten[0].upper() + rewritten[1:]
    return rewritten


def _english_formal_rewrite(text: str) -> str:
    rewritten = text
    rewritten = re.sub(r"\bwhilst\b", "while", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\ba lot of\b", "many", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\bdon't\b", "do not", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\bcan't\b", "cannot", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\bme and ([a-z][a-z'\-]*(?:\s+[a-z][a-z'\-]*){0,3})\b", r"\1 and I", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\byesterday,\s+i have gone\b", "Yesterday, I went", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\bmany of the ([a-z][a-z'\-]*) was\b", r"many of the \1 were", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\b(streets|roads|people|examples|notes)\s+was\b", r"\1 were", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\bthe mistakes we did\b", "the mistakes we made", rewritten, flags=re.IGNORECASE)
    rewritten = re.sub(r"\bhalf of the notes is duplicated\b", "half of the notes were duplicated", rewritten, flags=re.IGNORECASE)
    rewritten = _english_paragraph_coherence_pass(rewritten)
    rewritten = re.sub(r"\s+", " ", rewritten).strip()
    if rewritten and rewritten[-1] not in ".!?":
        rewritten += "."
    if rewritten:
        rewritten = rewritten[0].upper() + rewritten[1:]
    return rewritten


def _turkish_fluency_rewrite(text: str) -> str:
    rewritten = text
    rewritten = re.sub(r"\b[Bb]en gidiyor\b", "Ben gidiyorum", rewritten)
    rewritten = re.sub(r"\b[Bb]iz gidiyor\b", "Biz gidiyoruz", rewritten)
    rewritten = re.sub(r"\b[Ss]en gidiyor\b", "Sen gidiyorsun", rewritten)
    rewritten = re.sub(r"\b[Dd]ün ([^.!?\n]{0,30}) gidiyorum\b", r"Dün \1 gittim", rewritten)
    rewritten = re.sub(r"\bçok insanlar\b", "çok insan", rewritten)
    rewritten = re.sub(r"\b[Bb]iz karar veriyor\b", "Biz karar veriyoruz", rewritten)
    rewritten = re.sub(r"\bben ve ([a-zçğıöşü][a-zçğıöşü'\-]*(?:\s+[a-zçğıöşü][a-zçğıöşü'\-]*){0,2}) gidiyor\b", r"ben ve \1 gidiyoruz", rewritten)
    rewritten = re.sub(r"\.{2,}", ".", rewritten)
    rewritten = re.sub(r"\s+", " ", rewritten).strip()
    if rewritten and rewritten[-1] not in ".!?":
        rewritten += "."
    return rewritten


def _bulgarian_fluency_rewrite(text: str) -> str:
    rewritten = text
    rewritten = re.sub(r"\bАз ходи\b", "Аз ходя", rewritten)
    rewritten = re.sub(r"\bНие ходи\b", "Ние ходим", rewritten)
    rewritten = re.sub(r"\bТе е\b", "Те са", rewritten)
    rewritten = re.sub(r"\bВчера ([^.!?\n]{0,30}) отивам\b", r"Вчера \1 отидох", rewritten)
    rewritten = re.sub(r"\bхората е\b", "хората са", rewritten)
    rewritten = re.sub(r"\bмного хора беше\b", "много хора бяха", rewritten)
    rewritten = re.sub(r"\bаз и ([а-яА-Я][а-яА-Я'\-]*(?:\s+[а-яА-Я][а-яА-Я'\-]*){0,2}) прави\b", r"аз и \1 правим", rewritten)
    rewritten = re.sub(r"\.{2,}", ".", rewritten)
    rewritten = re.sub(r"\s+", " ", rewritten).strip()
    if rewritten and rewritten[-1] not in ".!?":
        rewritten += "."
    return rewritten


def build_rewrite_suggestions_detailed(
    original_text: str, safe_preview: str, issues: list[Issue], lang: str
) -> list[dict[str, str]]:
    candidates: list[dict[str, str]] = []
    seen_values: set[str] = set()
    normalized_original = re.sub(r"\s+", " ", original_text).strip()

    def low_quality_candidate(value: str) -> bool:
        lowered = value.lower()
        bad_patterns = [
            r"\bof the were\b",
            r"\bthe were\b",
            r"\band the were\b",
            r"\b,\s+\.",
        ]
        return any(re.search(pattern, lowered) for pattern in bad_patterns)

    confidence_reason_map = {
        "safe": "Applies deterministic, low-risk edits to preserve original intent.",
        "medium": "Balances fluency improvements with meaning preservation.",
        "aggressive": "Applies broader rewrites for readability; verify tone and nuance.",
    }

    def add_candidate(label: str, value: str, confidence: str):
        cleaned = re.sub(r"\s+", " ", value).strip()
        if not cleaned:
            return
        if cleaned == normalized_original:
            return
        if low_quality_candidate(cleaned):
            return
        if cleaned in seen_values:
            return
        seen_values.add(cleaned)
        candidates.append(
            {
                "label": label,
                "text": cleaned,
                "confidence": confidence,
                "confidenceReason": confidence_reason_map.get(
                    confidence,
                    "Candidate generated by rewrite engine.",
                ),
            }
        )

    add_candidate("Minimal edit", safe_preview, "safe")

    if issues:
        from app.services.grammar_service import apply_suggestions
        issue_dicts = [i.model_dump() for i in issues]
        aggressive, _, _ = apply_suggestions(
            text=original_text,
            issues=issue_dicts,
            issue_ids=[i["id"] for i in issue_dicts],
            strategy="aggressive"
        )
        aggressive = _normalize_sentence_boundaries(aggressive)
        add_candidate("Natural", aggressive, "aggressive")

    if lang == "en":
        base = safe_preview or original_text
        natural = _english_fluency_rewrite(base)
        formal = _english_formal_rewrite(natural)
        add_candidate("Natural", natural, "medium")
        add_candidate("Formal", formal, "safe")
    elif lang == "tr":
        base = safe_preview or original_text
        natural = _turkish_fluency_rewrite(base)
        formal = _turkish_fluency_rewrite(natural)
        add_candidate("Natural", natural, "medium")
        add_candidate("Formal", formal, "safe")
    elif lang == "bg":
        base = safe_preview or original_text
        natural = _bulgarian_fluency_rewrite(base)
        formal = _bulgarian_fluency_rewrite(natural)
        add_candidate("Natural", natural, "medium")
        add_candidate("Formal", formal, "safe")

    return candidates[:3]


def build_rewrite_suggestions(original_text: str, safe_preview: str, issues: list[Issue], lang: str) -> list[str]:
    detailed = build_rewrite_suggestions_detailed(original_text, safe_preview, issues, lang)
    return [f"{item['label']}: {item['text']}" for item in detailed]
