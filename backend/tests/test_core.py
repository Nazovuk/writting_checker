from app.services.language_service import detect_language
from app.models import Issue
from app.services.explanation_service import build_rewrite_suggestions, build_rewrite_suggestions_detailed
from app.services.grammar_service import (
    _from_languagetool,
    _local_fallback,
    _merge_and_rank_issues,
    apply_suggestions,
    post_edit_english,
    post_edit_text,
)


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


def test_local_fallback_auxiliary_agreement():
    text = "I has been waiting for a long time"
    issues = _local_fallback(text)
    assert any(i.ruleId == "LOCAL_EN_I_HAS" and "have" in i.replacements for i in issues)


def test_local_fallback_progressive_form():
    text = "I am go to school"
    issues = _local_fallback(text)
    assert any(i.ruleId == "LOCAL_EN_PROGRESSIVE" and "going" in i.replacements for i in issues)


def test_local_fallback_subject_pronoun_coordination():
    text = "Me and my colleague takes notes."
    issues = _local_fallback(text)
    assert any(i.ruleId == "LOCAL_EN_SUBJECT_PRONOUN_COORDINATION" and "and I" in i.replacements[0] for i in issues)


def test_local_fallback_double_negative():
    text = "I don't make no sense."
    issues = _local_fallback(text)
    assert any(i.ruleId == "LOCAL_EN_DOUBLE_NEGATIVE" and "any" in i.replacements for i in issues)


def test_local_fallback_coord_subject_agreement():
    text = "My colleague and I takes notes."
    issues = _local_fallback(text)
    assert any(i.ruleId == "LOCAL_EN_COORD_SUBJECT_TAKES" and "take" in i.replacements for i in issues)


def test_local_fallback_people_who_is():
    text = "The streets were full of peoples who is trying to find a taxi."
    issues = _local_fallback(text)
    assert any(i.ruleId == "LOCAL_EN_PEOPLES" and "people" in i.replacements for i in issues)
    assert any(i.ruleId == "LOCAL_EN_PEOPLE_ARE" and "are" in i.replacements for i in issues)


def test_post_edit_english_common_bariz_patterns():
    text = (
        "Yesterday, I have gone to town, many of the examples was unclear, "
        "the streets was busy, and the mistakes we did are obvious."
    )
    edited = post_edit_english(text)
    assert "Yesterday, I went" in edited
    assert "examples were" in edited
    assert "streets were" in edited
    assert "mistakes we made" in edited


def test_local_fallback_turkish_basic_agreement():
    text = "Ben gidiyor ve biz gidiyor."
    issues = _local_fallback(text, "tr")
    assert any(i.ruleId == "LOCAL_TR_BEN_GIDIYOR" for i in issues)
    assert any(i.ruleId == "LOCAL_TR_BIZ_GIDIYOR" for i in issues)


def test_post_edit_text_bulgarian_basic_agreement():
    text = "Аз ходи и Ние ходи, а Те е тук."
    edited = post_edit_text(text, "bg")
    assert "Аз ходя" in edited
    assert "Ние ходим" in edited
    assert "Те са" in edited


def test_local_fallback_turkish_extended_patterns():
    text = "Dün okula gidiyorum ve çok insanlar vardı. Biz karar veriyor, ben ve arkadaşım gidiyor.."
    issues = _local_fallback(text, "tr")
    assert any(i.ruleId == "LOCAL_TR_DUN_GIDIYORUM" for i in issues)
    assert any(i.ruleId == "LOCAL_TR_COK_INSANLAR" for i in issues)
    assert any(i.ruleId == "LOCAL_TR_BIZ_KARAR_VERIYOR" for i in issues)
    assert any(i.ruleId == "LOCAL_TR_BEN_VE_GIDIYOR" for i in issues)
    edited = post_edit_text(text, "tr")
    assert "Dün okula gittim" in edited
    assert "çok insan" in edited
    assert "Biz karar veriyoruz" in edited or "biz karar veriyoruz" in edited
    assert "ben ve arkadaşım gidiyoruz" in edited
    assert ".." not in edited


def test_post_edit_text_bulgarian_extended_patterns():
    text = "Вчера до офиса отивам. хората е навън и много хора беше тук. аз и колегата ми прави отчет.."
    edited = post_edit_text(text, "bg")
    assert "Вчера до офиса отидох" in edited
    assert "хората са" in edited
    assert "много хора бяха" in edited
    assert "аз и колегата ми правим отчет" in edited
    assert ".." not in edited


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


def test_languagetool_span_shrinks_for_single_token_agreement_replacement():
    text = "many of the examples was confusing."
    matches = [
        {
            "offset": text.index("examples"),
            "length": len("examples was"),
            "message": "Plural agreement required.",
            "replacements": [{"value": "were"}],
            "rule": {"id": "EN_AGREEMENT_EXAMPLE", "category": {"id": "GRAMMAR"}},
        }
    ]
    issues = _from_languagetool(text, matches)
    assert len(issues) == 1
    issue = issues[0]
    assert issue.original.lower() == "was"
    assert issue.replacements[0] == "were"


def test_languagetool_filters_suspicious_punctuation_replacement():
    text = "During the session we took notes"
    matches = [
        {
            "offset": text.index("session"),
            "length": len("session"),
            "message": "Odd punctuation suggestion",
            "replacements": [{"value": "."}],
            "rule": {"id": "CONFUSED_PUNCT", "category": {"id": "GRAMMAR"}},
        }
    ]
    issues = _from_languagetool(text, matches)
    assert issues == []


def test_merge_prefers_higher_quality_local_overlap():
    primary = [
        Issue(
            id="a",
            start=5,
            end=12,
            original="session",
            replacements=["."],
            category="MORPHOLOGY",
            severity="major",
            reason="bad",
            ruleId="LT_BAD",
        )
    ]
    secondary = [
        Issue(
            id="b",
            start=5,
            end=12,
            original="session",
            replacements=["meeting"],
            category="MORPHOLOGY",
            severity="major",
            reason="good",
            ruleId="LOCAL_BETTER",
        )
    ]
    merged = _merge_and_rank_issues(primary, secondary)
    assert len(merged) == 1
    assert merged[0].replacements[0] == "meeting"


def test_post_edit_english_paragraph_quality_guard():
    text = (
        "Yesterday, I went to the city centre for attending a workshop about product design, and although the speaker "
        "was very experienced, many of the examples were confusing and not clearly connected with the topic. During the "
        "session, my colleague and I took notes quickly because we are thinking we will need it for our presentation, "
        "but in the end we realize that half of the notes were duplicated, and some sentences make no sense at all. "
        "After that, we decide to walk back home instead of taking the bus, whilst it was raining heavily and the "
        "streets were full of people who are trying to find a taxi. When we finally arrive, I am feeling exhausted but "
        "also strangely motivated, because the mistakes we made today is showing me that I need to practice more "
        "carefully and write with better structure.."
    )
    edited = post_edit_english(text)
    assert "to attend a workshop" in edited
    assert "we thought we would need it" in edited
    assert "in the end we realized" in edited
    assert "After that, we decided" in edited
    assert "people who were trying to find a taxi" in edited
    assert "When we finally arrived" in edited
    assert "I felt exhausted" in edited
    assert "mistakes we made today are showing me" in edited
    assert ".." not in edited


def test_local_fallback_detects_narrative_tense_consistency_patterns():
    text = (
        "During the session, we are thinking we will need it, but in the end we realize. "
        "After that, we decide to leave, and the mistakes we made today is showing me progress."
    )
    issues = _local_fallback(text, "en")
    assert any(i.ruleId == "LOCAL_EN_TENSE_BACKSHIFT_NEED" for i in issues)
    assert any(i.ruleId == "LOCAL_EN_REALIZED" for i in issues)
    assert any(i.ruleId == "LOCAL_EN_DECIDED" for i in issues)
    assert any(i.ruleId == "LOCAL_EN_MISTAKES_ARE_SHOWING" for i in issues)


def test_rewrite_suggestions_apply_coherence_pass_for_english():
    text = (
        "Yesterday, I went to the city centre for attending a workshop, "
        "and in the end we realize the mistakes we made today is showing me progress. "
        "When we finally arrive, I am feeling exhausted."
    )
    rewrites = build_rewrite_suggestions(text, text, [], "en")
    joined = " || ".join(rewrites)
    assert "to attend" in joined
    assert "in the end we realized" in joined
    assert "When we finally arrived" in joined
    assert "I felt exhausted" in joined
    assert "mistakes we made today are showing me" in joined


def test_rewrite_suggestions_filter_low_quality_candidates():
    text = "many of the examples was confusing."
    issues = [
        Issue(
            id="1",
            start=12,
            end=24,
            original="examples was",
            replacements=["were"],
            category="MORPHOLOGY",
            severity="major",
            reason="test",
            ruleId="LT_BAD",
        )
    ]
    rewrites = build_rewrite_suggestions(text, text, issues, "en")
    assert all("of the were" not in r.lower() for r in rewrites)


def test_rewrite_suggestions_do_not_repeat_same_text_with_different_labels():
    text = "I goes to school."
    preview = post_edit_text(text, "en")
    rewrites = build_rewrite_suggestions(text, preview, [], "en")
    normalized = [r.split(": ", 1)[1] for r in rewrites if ": " in r]
    assert len(normalized) == len(set(normalized))


def test_rewrite_suggestions_detailed_confidence_labels():
    text = "Yesterday, I have gone whilst it was raining."
    preview = post_edit_text(text, "en")
    detailed = build_rewrite_suggestions_detailed(text, preview, [], "en")
    assert detailed
    assert all(item["confidence"] in {"safe", "medium", "aggressive"} for item in detailed)


def test_regression_double_inflection_instead_of_stay():
    text = "I am go to the party instead of stay at home."
    issues = _local_fallback(text, "en")
    assert any(i.ruleId == "LOCAL_EN_PROGRESSIVE" and "going" in i.replacements for i in issues)
    assert any(i.ruleId == "LOCAL_EN_PREPOSITION_GERUND" and "staying" in i.replacements for i in issues)
    
    # Verify apply_suggestions resolves multiple edits properly without duplicating suffixes
    patched, applied, skipped = apply_suggestions(
        text, 
        [i.model_dump() for i in issues], 
        [i.id for i in issues], 
        "aggressive"
    )
    assert patched == "I am going to the party instead of staying at home."
    
    # Verify rewrite suggestions detailed output
    detailed = build_rewrite_suggestions_detailed(text, patched, issues, "en")
    
    # "I'm going" comes from the english_fluency_rewrite now
    assert any("I'm going to the party instead of staying at home." in c["text"] for c in detailed)
    assert any("I am going to the party instead of staying at home." in c["text"] for c in detailed)
    
    # Double check that 'goinging' does NOT occur
    assert not any("goinging" in c["text"] for c in detailed)
    assert not any("stayinging" in c["text"] for c in detailed)
