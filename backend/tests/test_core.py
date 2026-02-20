from app.services.language_service import detect_language
from app.services.grammar_service import apply_suggestions, _local_fallback


def test_language_detect_en():
    text = "This is a simple sentence with grammar."
    assert detect_language(text, "auto") in {"en", "tr", "bg"}


def test_apply_suggestions_basic():
    text = "hello world"
    issues = [
        {
            "id": "1",
            "start": 0,
            "end": 1,
            "replacements": ["H"],
            "severity": "minor",
        }
    ]
    patched, applied, skipped = apply_suggestions(text, issues, ["1"], "safe")
    assert patched == "Hello world"
    assert applied == ["1"]
    assert skipped == []


def test_local_fallback_subject_verb_agreement():
    text = "He go to school every day"
    issues = _local_fallback(text)
    assert any(i.ruleId == "LOCAL_EN_SUBJECT_VERB" and "goes" in i.replacements for i in issues)


def test_apply_suggestions_supports_insertions():
    text = "Hello world"
    issues = [
        {
            "id": "1",
            "start": len(text),
            "end": len(text),
            "replacements": ["."],
            "severity": "minor",
        }
    ]
    patched, applied, skipped = apply_suggestions(text, issues, ["1"], "safe")
    assert patched == "Hello world."
    assert applied == ["1"]
    assert skipped == []
