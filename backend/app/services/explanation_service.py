from __future__ import annotations

from app.models import Issue, LearningCard, SessionSummary


RULE_HINTS = {
    "MORFOLOGY": "Pay attention to word form and agreement.",
    "TYPOS": "Fix spelling for clarity and correctness.",
    "PUNCTUATION": "Use punctuation to improve readability.",
    "CASING": "Capitalize proper sentence starts and names.",
    "STYLE": "Prefer concise and natural phrasing.",
}


def issue_to_card(issue: Issue) -> LearningCard:
    short_rule = RULE_HINTS.get(issue.category, "Follow grammar conventions for this context.")
    correct = issue.replacements[0] if issue.replacements else issue.original

    return LearningCard(
        title=f"{issue.category.title()} improvement",
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
    top_mistakes = [f"{k}: {v}" for k, v in ordered[:3]]

    return SessionSummary(
        topMistakes=top_mistakes,
        vocabularyHints=[
            "Replace repeated words with synonyms.",
            "Mix short and medium-length sentences for better flow.",
        ],
        nextPractice="Rewrite one paragraph by applying the top two corrections.",
    )
