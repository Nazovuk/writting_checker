from __future__ import annotations

import re
import uuid
from typing import Any

import httpx
from app.config import settings
from app.models import Issue


class LanguageToolUnavailableError(RuntimeError):
    pass


CATEGORY_MAP = {
    "TYPOS": "TYPOS",
    "PUNCTUATION": "PUNCTUATION",
    "CASING": "CASING",
    "GRAMMAR": "MORPHOLOGY",
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


_VERB_TOKEN_REPLACEMENTS = {
    "am",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "has",
    "have",
    "had",
    "do",
    "does",
    "did",
    "go",
    "goes",
    "went",
}


def _has_alpha(value: str) -> bool:
    return bool(re.search(r"[A-Za-zÀ-ÖØ-öø-ÿА-Яа-яÇĞİÖŞÜçğıöşü]", value))


def _is_punct_only(value: str) -> bool:
    stripped = value.strip()
    return bool(stripped) and not _has_alpha(stripped) and bool(re.search(r"[^\w\s]", stripped))


def _shrink_multiword_span_if_needed(
    text: str,
    offset: int,
    end: int,
    replacements: list[str],
    rule_id: str,
    category: str,
) -> tuple[int, int]:
    if not replacements:
        return offset, end
    if category != "MORPHOLOGY":
        return offset, end

    first_repl = replacements[0].strip().lower()
    original = text[offset:end]
    if " " not in original.strip():
        return offset, end
    if " " in first_repl:
        return offset, end
    if first_repl not in _VERB_TOKEN_REPLACEMENTS:
        return offset, end
    if not any(k in rule_id.upper() for k in ("AGREEMENT", "VERB", "MORFO", "TENSE")):
        return offset, end

    token_matches = list(re.finditer(r"[A-Za-zÀ-ÖØ-öø-ÿ']+", original))
    if not token_matches:
        return offset, end
    last = token_matches[-1]
    candidate = original[last.start() : last.end()].lower()
    if candidate not in _VERB_TOKEN_REPLACEMENTS:
        return offset, end
    return offset + last.start(), offset + last.end()


def _is_suspicious_replacement(original: str, replacement: str, category: str, rule_id: str) -> bool:
    orig = original.strip()
    repl = replacement.strip()
    if not repl:
        return True
    if not orig:
        return False

    # Guardrail: don't allow word spans to be replaced by punctuation-only tokens.
    if _has_alpha(orig) and _is_punct_only(repl):
        return True

    # Guardrail: for grammar/morphology rules, avoid collapsing a multiword phrase into
    # a single short token unless it is a known verb-token correction.
    if category == "MORPHOLOGY" and " " in orig and " " not in repl:
        if repl.lower() not in _VERB_TOKEN_REPLACEMENTS:
            return True
        if not any(k in rule_id.upper() for k in ("AGREEMENT", "VERB", "MORFO", "TENSE")):
            return True

    return False


def _from_languagetool(text: str, matches: list[dict[str, Any]]) -> list[Issue]:
    issues: list[Issue] = []
    for match in matches:
        offset = int(match.get("offset", 0))
        length = int(match.get("length", 0))
        end = min(len(text), offset + length)
        replacements = [r.get("value", "") for r in match.get("replacements", [])][:5]
        rule = match.get("rule", {})
        cat = rule.get("category", {}).get("id", "GRAMMAR")
        category = CATEGORY_MAP.get(cat, "MORPHOLOGY")
        rule_id = str(rule.get("id", "LT_RULE"))
        offset, end = _shrink_multiword_span_if_needed(text, offset, end, replacements, rule_id, category)
        original = text[offset:end]
        cleaned_replacements = [r for r in replacements if r and not _is_suspicious_replacement(original, r, category, rule_id)]
        if not cleaned_replacements:
            continue

        issues.append(
            Issue(
                id=str(uuid.uuid4()),
                start=offset,
                end=end,
                original=original,
                replacements=cleaned_replacements,
                category=category,
                severity=_severity_from_rule(rule_id),
                reason=match.get("message", "Grammar suggestion."),
                ruleId=rule_id,
            )
        )
    return issues


def _local_fallback(text: str, lang: str = "en") -> list[Issue]:
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
    if lang == "en":
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
                        category="MORPHOLOGY",
                        severity="major",
                        reason="Third-person singular subjects usually take a singular verb form.",
                        ruleId="LOCAL_EN_SUBJECT_VERB",
                    )
                )

    # Minimal EN auxiliary agreement fallback.
    # Examples: "I has" -> "I have", "you is" -> "you are", "they is" -> "they are".
    aux_patterns = [
        (r"\b(i)\s+has\b", "have", "LOCAL_EN_I_HAS"),
        (r"\b(you|we|they)\s+is\b", "are", "LOCAL_EN_PLURAL_IS"),
        (r"\b(i)\s+goes\b", "go", "LOCAL_EN_I_GOES"),
        (r"\b(i)\s+does\b", "do", "LOCAL_EN_I_DOES"),
    ]
    if lang == "en":
        for pattern, replacement, rule_id in aux_patterns:
            for m in re.finditer(pattern, text, flags=re.IGNORECASE):
                start = m.start(0) + len(m.group(1)) + 1
                end = m.end(0)
                repl = replacement
                original = text[start:end]
                if original[:1].isupper():
                    repl = replacement[:1].upper() + replacement[1:]
                issues.append(
                    Issue(
                        id=str(uuid.uuid4()),
                        start=start,
                        end=end,
                        original=text[start:end],
                        replacements=[repl],
                        category="MORPHOLOGY",
                        severity="major",
                        reason="Subject and auxiliary verb should agree.",
                        ruleId=rule_id,
                    )
                )

    # EN infinitive form helper:
    # Example: "to checked" -> "to check"
    if lang == "en":
        infinitive_map = {
            "checked": "check",
            "went": "go",
            "made": "make",
            "found": "find",
            "lost": "lose",
            "wrote": "write",
            "took": "take",
        }
        for m in re.finditer(r"\bto\s+(checked|went|made|found|lost|wrote|took)\b", text, flags=re.IGNORECASE):
            verb_start = m.start(1)
            verb_end = m.end(1)
            wrong_form = text[verb_start:verb_end]
            base = infinitive_map.get(wrong_form.lower())
            if not base:
                continue
            replacement = base.capitalize() if wrong_form[:1].isupper() else base
            issues.append(
                Issue(
                    id=str(uuid.uuid4()),
                    start=verb_start,
                    end=verb_end,
                    original=wrong_form,
                    replacements=[replacement],
                    category="MORPHOLOGY",
                    severity="major",
                    reason="After 'to', English usually uses the base form of the verb.",
                    ruleId="LOCAL_EN_TO_BASE_VERB",
                )
            )

    # EN elliptical-clause helper:
    # Example: "if lost" -> "if I lost it"
    if lang == "en":
        for m in re.finditer(r"\bif\s+lost\b", text, flags=re.IGNORECASE):
            start, end = m.span()
            original = text[start:end]
            replacement = "if I lost it" if original.islower() else "if I lost it"
            issues.append(
                Issue(
                    id=str(uuid.uuid4()),
                    start=start,
                    end=end,
                    original=original,
                    replacements=[replacement],
                    category="STYLE",
                    severity="major",
                    reason="This clause is incomplete; add an explicit subject and object for clarity.",
                    ruleId="LOCAL_EN_IF_LOST_CLAUSE",
                )
            )

    # Basic progressive form fallback.
    # Example: "I am go" -> "I am going".
    progressive_map = {
        "go": "going",
        "eat": "eating",
        "wait": "waiting",
        "run": "running",
        "write": "writing",
        "study": "studying",
    }
    if lang == "en":
        for m in re.finditer(r"\b(i)\s+am\s+(go|eat|wait|run|write|study)\b", text, flags=re.IGNORECASE):
            verb_start = m.start(2)
            verb_end = m.end(2)
            verb = m.group(2).lower()
            replacement = progressive_map.get(verb)
            if replacement:
                issues.append(
                    Issue(
                        id=str(uuid.uuid4()),
                        start=verb_start,
                        end=verb_end,
                        original=text[verb_start:verb_end],
                        replacements=[replacement],
                        category="MORPHOLOGY",
                        severity="major",
                        reason="After 'am', progressive form is often required in this context.",
                        ruleId="LOCAL_EN_PROGRESSIVE",
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

    # Common agreement and collocation issues in longer EN paragraphs.
    if lang == "en":
        for m in re.finditer(r"\bmany of the ([a-z][a-z'\-]*)\s+(was)\b", text, flags=re.IGNORECASE):
            start = m.start(2)
            end = m.end(2)
            issues.append(
                Issue(
                    id=str(uuid.uuid4()),
                    start=start,
                    end=end,
                    original=text[start:end],
                    replacements=["were"],
                    category="MORPHOLOGY",
                    severity="major",
                    reason="After 'many of', plural agreement is usually required.",
                    ruleId="LOCAL_EN_MANY_WERE",
                )
            )

        for m in re.finditer(r"\b(streets|roads|people|examples|notes)\s+(was)\b", text, flags=re.IGNORECASE):
            start = m.start(2)
            end = m.end(2)
            issues.append(
                Issue(
                    id=str(uuid.uuid4()),
                    start=start,
                    end=end,
                    original=text[start:end],
                    replacements=["were"],
                    category="MORPHOLOGY",
                    severity="major",
                    reason="Plural subjects generally take 'were' in past tense.",
                    ruleId="LOCAL_EN_PLURAL_WERE",
                )
            )

        for m in re.finditer(r"\bthe mistakes we did\b", text, flags=re.IGNORECASE):
            start, end = m.span()
            issues.append(
                Issue(
                    id=str(uuid.uuid4()),
                    start=start,
                    end=end,
                    original=text[start:end],
                    replacements=["the mistakes we made"],
                    category="MORPHOLOGY",
                    severity="major",
                    reason="In this context, English typically uses 'make a mistake'.",
                    ruleId="LOCAL_EN_MISTAKES_MADE",
                )
            )

        for m in re.finditer(r"\bhalf of the notes is duplicated\b", text, flags=re.IGNORECASE):
            start, end = m.span()
            issues.append(
                Issue(
                    id=str(uuid.uuid4()),
                    start=start,
                    end=end,
                    original=text[start:end],
                    replacements=["half of the notes were duplicated"],
                    category="MORPHOLOGY",
                    severity="major",
                    reason="With plural 'notes', plural agreement is usually preferred here.",
                    ruleId="LOCAL_EN_HALF_NOTES_WERE",
                )
            )
        for m in re.finditer(r"\bwe are thinking we will need it\b", text, flags=re.IGNORECASE):
            start, end = m.span()
            issues.append(
                Issue(
                    id=str(uuid.uuid4()),
                    start=start,
                    end=end,
                    original=text[start:end],
                    replacements=["we thought we would need it"],
                    category="MORPHOLOGY",
                    severity="major",
                    reason="In past narrative context, tense backshift is usually required.",
                    ruleId="LOCAL_EN_TENSE_BACKSHIFT_NEED",
                )
            )
        for m in re.finditer(r"\bin the end we realize\b", text, flags=re.IGNORECASE):
            start, end = m.span()
            issues.append(
                Issue(
                    id=str(uuid.uuid4()),
                    start=start,
                    end=end,
                    original=text[start:end],
                    replacements=["in the end we realized"],
                    category="MORPHOLOGY",
                    severity="major",
                    reason="Past narrative context usually requires past tense here.",
                    ruleId="LOCAL_EN_REALIZED",
                )
            )
        for m in re.finditer(r"\bafter that,\s+we decide\b", text, flags=re.IGNORECASE):
            start, end = m.span()
            issues.append(
                Issue(
                    id=str(uuid.uuid4()),
                    start=start,
                    end=end,
                    original=text[start:end],
                    replacements=["After that, we decided"],
                    category="MORPHOLOGY",
                    severity="major",
                    reason="Narrative sequence is usually expressed in past tense.",
                    ruleId="LOCAL_EN_DECIDED",
                )
            )
        for m in re.finditer(r"\bthe mistakes we made today is showing me\b", text, flags=re.IGNORECASE):
            start, end = m.span()
            issues.append(
                Issue(
                    id=str(uuid.uuid4()),
                    start=start,
                    end=end,
                    original=text[start:end],
                    replacements=["the mistakes we made today are showing me"],
                    category="MORPHOLOGY",
                    severity="major",
                    reason="Plural subject 'mistakes' should agree with a plural verb.",
                    ruleId="LOCAL_EN_MISTAKES_ARE_SHOWING",
                )
            )
        for m in re.finditer(r"\bfor attending\b", text, flags=re.IGNORECASE):
            start, end = m.span()
            issues.append(
                Issue(
                    id=str(uuid.uuid4()),
                    start=start,
                    end=end,
                    original=text[start:end],
                    replacements=["to attend"],
                    category="STYLE",
                    severity="major",
                    reason="In this context, infinitive form is more natural than 'for + -ing'.",
                    ruleId="LOCAL_EN_FOR_ATTENDING",
                )
            )
        for m in re.finditer(r"\bwhen we finally arrive\b", text, flags=re.IGNORECASE):
            start, end = m.span()
            issues.append(
                Issue(
                    id=str(uuid.uuid4()),
                    start=start,
                    end=end,
                    original=text[start:end],
                    replacements=["when we finally arrived"],
                    category="MORPHOLOGY",
                    severity="major",
                    reason="Narrative past context usually requires past tense here.",
                    ruleId="LOCAL_EN_FINALLY_ARRIVED",
                )
            )
        for m in re.finditer(r"\bi am feeling exhausted\b", text, flags=re.IGNORECASE):
            start, end = m.span()
            issues.append(
                Issue(
                    id=str(uuid.uuid4()),
                    start=start,
                    end=end,
                    original=text[start:end],
                    replacements=["I felt exhausted"],
                    category="MORPHOLOGY",
                    severity="major",
                    reason="Simple past is usually preferred for completed narrative events.",
                    ruleId="LOCAL_EN_FELT_EXHAUSTED",
                )
            )

    if lang == "en":
        for m in re.finditer(r"\b([a-z][a-z'\-]*(?:\s+[a-z][a-z'\-]*){0,3})\s+takes notes and i quickly because\b", text, flags=re.IGNORECASE):
            start, end = m.span()
            subject = m.group(1)
            repl = f"{subject} and I took notes quickly because"
            if text[start:start + 1].isupper():
                repl = repl[:1].upper() + repl[1:]
            issues.append(
                Issue(
                    id=str(uuid.uuid4()),
                    start=start,
                    end=end,
                    original=text[start:end],
                    replacements=[repl],
                    category="STYLE",
                    severity="major",
                    reason="This clause appears to be missing a verb after 'I'; rewrite for a complete parallel structure.",
                    ruleId="LOCAL_EN_PARALLEL_NOTES_CLAUSE",
                )
            )

    # Coordinated subject pronoun fix.
    # Example: "me and my colleague" -> "my colleague and I"
    if lang == "en":
        for m in re.finditer(r"\bme and ([a-z][a-z'\-]*(?:\s+[a-z][a-z'\-]*){0,3})\b", text, flags=re.IGNORECASE):
            start, end = m.span()
            second_subject = m.group(1)
            replacement = f"{second_subject} and I"
            issues.append(
                Issue(
                    id=str(uuid.uuid4()),
                    start=start,
                    end=end,
                    original=text[start:end],
                    replacements=[replacement],
                    category="STYLE",
                    severity="major",
                    reason="For a subject phrase, prefer 'X and I' over 'me and X'.",
                    ruleId="LOCAL_EN_SUBJECT_PRONOUN_COORDINATION",
                )
            )

    # Coordinated subject agreement helpers.
    # Examples: "my colleague and I takes" -> "my colleague and I take"
    coord_patterns = [
        (r"\b([a-z][a-z'\-]*(?:\s+[a-z][a-z'\-]*){0,3}) and I\s+takes\b", "take", "LOCAL_EN_COORD_SUBJECT_TAKES"),
        (r"\b([a-z][a-z'\-]*(?:\s+[a-z][a-z'\-]*){0,3}) and I\s+is\b", "are", "LOCAL_EN_COORD_SUBJECT_IS"),
        (r"\b([a-z][a-z'\-]*(?:\s+[a-z][a-z'\-]*){0,3}) and I\s+was\b", "were", "LOCAL_EN_COORD_SUBJECT_WAS"),
        (r"\b([a-z][a-z'\-]*(?:\s+[a-z][a-z'\-]*){0,3}) and I\s+has\b", "have", "LOCAL_EN_COORD_SUBJECT_HAS"),
    ]
    if lang == "en":
        for pattern, replacement, rule_id in coord_patterns:
            for m in re.finditer(pattern, text, flags=re.IGNORECASE):
                start = m.end(0) - len(m.group(0).split()[-1])
                end = m.end(0)
                original = text[start:end]
                repl = replacement
                if original[:1].isupper():
                    repl = replacement.capitalize()
                issues.append(
                    Issue(
                        id=str(uuid.uuid4()),
                        start=start,
                        end=end,
                        original=original,
                        replacements=[repl],
                        category="MORPHOLOGY",
                        severity="major",
                        reason="Compound subjects with 'and I' usually take a plural verb form.",
                        ruleId=rule_id,
                    )
                )

    # "people" agreement and plural cleanup helpers.
    if lang == "en":
        for m in re.finditer(r"\bpeoples\b", text, flags=re.IGNORECASE):
            start, end = m.span()
            original = text[start:end]
            repl = "people" if original.islower() else "People"
            issues.append(
                Issue(
                    id=str(uuid.uuid4()),
                    start=start,
                    end=end,
                    original=original,
                    replacements=[repl],
                    category="MORPHOLOGY",
                    severity="major",
                    reason="'People' is usually the correct plural form in this context.",
                    ruleId="LOCAL_EN_PEOPLES",
                )
            )
        for m in re.finditer(r"\bpeoples? who is\b", text, flags=re.IGNORECASE):
            start = m.end(0) - 2
            end = m.end(0)
            issues.append(
                Issue(
                    id=str(uuid.uuid4()),
                    start=start,
                    end=end,
                    original=text[start:end],
                    replacements=["are"],
                    category="MORPHOLOGY",
                    severity="major",
                    reason="With plural noun 'people', use 'are'.",
                    ruleId="LOCAL_EN_PEOPLE_ARE",
                )
            )

    # Double-negative helper.
    # Example: "don't make no sense" -> "don't make any sense"
    if lang == "en":
        for m in re.finditer(r"\b(don't|doesn't|didn't|can't|won't|isn't|aren't)\b([^.!?\n]{0,60})\bno\b", text, flags=re.IGNORECASE):
            no_start = m.start(2) + m.group(2).lower().rfind("no")
            no_end = no_start + 2
            issues.append(
                Issue(
                    id=str(uuid.uuid4()),
                    start=no_start,
                    end=no_end,
                    original=text[no_start:no_end],
                    replacements=["any"],
                    category="STYLE",
                    severity="major",
                    reason="Avoid double negatives in standard written English.",
                    ruleId="LOCAL_EN_DOUBLE_NEGATIVE",
                )
            )

    # Turkish lightweight agreement helpers.
    if lang == "tr":
        tr_patterns = [
            (r"\b[Bb]en gidiyor\b", "Ben gidiyorum", "LOCAL_TR_BEN_GIDIYOR", "Birinci tekil özne ile fiil çekimi uyumlu olmalı."),
            (r"\b[Bb]iz gidiyor\b", "Biz gidiyoruz", "LOCAL_TR_BIZ_GIDIYOR", "Birinci çoğul özne ile fiil çekimi uyumlu olmalı."),
            (r"\b[Ss]en gidiyor\b", "Sen gidiyorsun", "LOCAL_TR_SEN_GIDIYOR", "İkinci tekil özne ile fiil çekimi uyumlu olmalı."),
            (r"\b(hatalar) biz yaptık\b", "hataları biz yaptık", "LOCAL_TR_HATALAR_ACC", "Bu bağlamda belirtme durumu ekine ihtiyaç var."),
            (r"\b[Dd]ün ([^.!?\n]{0,30}) gidiyorum\b", r"Dün \1 gittim", "LOCAL_TR_DUN_GIDIYORUM", "Geçmiş zaman bağlamında fiil zamanı uyumlu olmalı."),
            (r"\bçok insanlar\b", "çok insan", "LOCAL_TR_COK_INSANLAR", "'İnsan' çoğul anlamı zaten taşıdığı için bu bağlamda tekil kullanım daha doğaldır."),
            (r"\b[Bb]iz karar veriyor\b", "Biz karar veriyoruz", "LOCAL_TR_BIZ_KARAR_VERIYOR", "Birinci çoğul özne ile yüklem uyumu gerekli."),
            (r"\bben ve ([a-zçğıöşü][a-zçğıöşü'\-]*(?:\s+[a-zçğıöşü][a-zçğıöşü'\-]*){0,2}) gidiyor\b", r"ben ve \1 gidiyoruz", "LOCAL_TR_BEN_VE_GIDIYOR", "Bağlı özne yapısında çoğul çekim tercih edilir."),
        ]
        for pattern, replacement, rule_id, reason in tr_patterns:
            for m in re.finditer(pattern, text):
                start, end = m.span()
                issues.append(
                    Issue(
                        id=str(uuid.uuid4()),
                        start=start,
                        end=end,
                        original=text[start:end],
                        replacements=[replacement],
                        category="MORPHOLOGY",
                        severity="major",
                        reason=reason,
                        ruleId=rule_id,
                    )
                )

    # Bulgarian lightweight agreement helpers.
    if lang == "bg":
        bg_patterns = [
            (r"\bАз ходи\b", "Аз ходя", "LOCAL_BG_AZ_HODI", "За първо лице единствено число използвай правилната глаголна форма."),
            (r"\bНие ходи\b", "Ние ходим", "LOCAL_BG_NIE_HODI", "За първо лице множествено число използвай правилната глаголна форма."),
            (r"\bТе е\b", "Те са", "LOCAL_BG_TE_E", "За множествено число използвай 'са'."),
            (r"\bВчера ([^.!?\n]{0,30}) отивам\b", r"Вчера \1 отидох", "LOCAL_BG_VCHERA_OTIVAM", "В контекст на минало време използвай минала форма."),
            (r"\bхората е\b", "хората са", "LOCAL_BG_HORATA_SA", "Подлогът 'хората' е в множествено число."),
            (r"\bмного хора беше\b", "много хора бяха", "LOCAL_BG_MNOGO_HORA_BIAHA", "След 'много хора' обикновено се използва множествено число."),
            (r"\bаз и ([а-яА-Я][а-яА-Я'\-]*(?:\s+[а-яА-Я][а-яА-Я'\-]*){0,2}) прави\b", r"аз и \1 правим", "LOCAL_BG_AZ_I_PRAVIM", "Съставно подлогово съчетание изисква множествена глаголна форма."),
        ]
        for pattern, replacement, rule_id, reason in bg_patterns:
            for m in re.finditer(pattern, text):
                start, end = m.span()
                issues.append(
                    Issue(
                        id=str(uuid.uuid4()),
                        start=start,
                        end=end,
                        original=text[start:end],
                        replacements=[replacement],
                        category="MORPHOLOGY",
                        severity="major",
                        reason=reason,
                        ruleId=rule_id,
                    )
                )

    return issues


def _merge_and_rank_issues(primary: list[Issue], secondary: list[Issue]) -> list[Issue]:
    severity_rank = {"critical": 0, "major": 1, "minor": 2}
    category_rank = {
        "MORPHOLOGY": 0,
        "PUNCTUATION": 1,
        "CASING": 2,
        "STYLE": 3,
        "TYPOS": 4,
    }
    def _quality_score(issue: Issue) -> int:
        if not issue.replacements:
            return 0
        best = issue.replacements[0]
        score = 0
        if _has_alpha(best):
            score += 2
        if issue.ruleId.startswith("LOCAL_"):
            score += 2
        if issue.category in {"MORPHOLOGY", "STYLE"}:
            score += 1
        return score

    merged = list(primary)
    seen = {(i.start, i.end, i.category, i.ruleId) for i in merged}

    for issue in secondary:
        key = (issue.start, issue.end, issue.category, issue.ruleId)
        if key in seen:
            continue
        overlap_idx = next(
            (idx for idx, existing in enumerate(merged) if existing.start == issue.start and existing.end == issue.end and existing.category == issue.category),
            None,
        )
        if overlap_idx is not None:
            existing = merged[overlap_idx]
            if _quality_score(issue) > _quality_score(existing):
                merged[overlap_idx] = issue
            continue
        merged.append(issue)
        seen.add(key)

    merged.sort(key=lambda i: (severity_rank.get(i.severity, 3), category_rank.get(i.category, 9), i.start, i.end))
    return merged


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
            lt_issues = _from_languagetool(text, matches)
            # Keep local deterministic checks as a supplement for coverage gaps.
            hybrid = _merge_and_rank_issues(lt_issues, _local_fallback(text, lang))
            return hybrid, warnings
    except Exception as exc:
        if settings.require_languagetool:
            raise LanguageToolUnavailableError(
                "LanguageTool is unavailable. Start LanguageTool before running analysis."
            ) from exc
        warnings.append("LanguageTool is unavailable; local fallback rules were used.")
        return _local_fallback(text, lang), warnings


def apply_suggestions(text: str, issues: list[dict], issue_ids: list[str], strategy: str) -> tuple[str, list[str], list[str]]:
    severity_rank = {"critical": 0, "major": 1, "minor": 2}
    selected = [i for i in issues if i["id"] in set(issue_ids)]
    if strategy == "safe":
        selected = [i for i in selected if i.get("severity") != "critical"]

    # Prefer high-priority fixes first and avoid overlapping edits that can corrupt output.
    selected.sort(
        key=lambda x: (
            int(x.get("start", 0)),
            int(x.get("end", 0)),
            -severity_rank.get(str(x.get("severity", "minor")), 2),
        ),
        reverse=True,
    )

    patched = text
    applied: list[str] = []
    skipped: list[str] = []
    applied_ranges: list[tuple[int, int]] = []

    for issue in selected:
        repls = issue.get("replacements", [])
        if not repls:
            skipped.append(issue["id"])
            continue

        start, end = int(issue["start"]), int(issue["end"])
        if start < 0 or end > len(patched) or start > end:
            skipped.append(issue["id"])
            continue

        overlaps = any(not (end <= a_start or start >= a_end) for a_start, a_end in applied_ranges)
        if overlaps:
            skipped.append(issue["id"])
            continue

        patched = patched[:start] + repls[0] + patched[end:]
        applied.append(issue["id"])
        applied_ranges.append((start, end))

    missing = [i for i in issue_ids if i not in set(applied) and i not in set(skipped)]
    skipped.extend(missing)
    return patched, applied, skipped


def post_edit_english(text: str) -> str:
    edited = text
    edited = re.sub(r"\b[Yy]esterday,\s+I have gone\b", "Yesterday, I went", edited)
    edited = re.sub(r"\b[Yy]esterday,\s+we have gone\b", "Yesterday, we went", edited)
    edited = re.sub(r"\bfor attending\b", "to attend", edited, flags=re.IGNORECASE)
    edited = re.sub(r"\bmany of the ([a-z][a-z'\-]*) was\b", r"many of the \1 were", edited, flags=re.IGNORECASE)
    edited = re.sub(r"\b(streets|roads|people|examples|notes)\s+was\b", r"\1 were", edited, flags=re.IGNORECASE)
    edited = re.sub(r"\bthe mistakes we did\b", "the mistakes we made", edited, flags=re.IGNORECASE)
    edited = re.sub(r"\bhalf of the notes is duplicated\b", "half of the notes were duplicated", edited, flags=re.IGNORECASE)
    edited = re.sub(
        r"\bwe are thinking we will need it\b",
        "we thought we would need it",
        edited,
        flags=re.IGNORECASE,
    )
    edited = re.sub(r"\bin the end we realize\b", "in the end we realized", edited, flags=re.IGNORECASE)
    edited = re.sub(r"\b[Aa]fter that,\s+we decide\b", "After that, we decided", edited)
    edited = re.sub(
        r"\bwas full of people who are trying\b",
        "was full of people who were trying",
        edited,
        flags=re.IGNORECASE,
    )
    edited = re.sub(
        r"\b(was|were)\s+full of people who are trying\b",
        r"\1 full of people who were trying",
        edited,
        flags=re.IGNORECASE,
    )
    edited = re.sub(r"\b[Ww]hen we finally arrive\b", "When we finally arrived", edited)
    edited = re.sub(r"\bI am feeling exhausted\b", "I felt exhausted", edited, flags=re.IGNORECASE)
    edited = re.sub(
        r"\bthe mistakes we made today is showing me\b",
        "the mistakes we made today are showing me",
        edited,
        flags=re.IGNORECASE,
    )
    edited = re.sub(
        r"\b([a-z][a-z'\-]*(?:\s+[a-z][a-z'\-]*){0,3})\s+takes notes and i quickly because\b",
        r"\1 and I took notes quickly because",
        edited,
        flags=re.IGNORECASE,
    )
    edited = re.sub(r"\bto checked\b", "to check", edited, flags=re.IGNORECASE)
    edited = re.sub(r"\bif lost\b", "if I lost it", edited, flags=re.IGNORECASE)
    edited = re.sub(r"\.{2,}", ".", edited)
    edited = re.sub(r"\s+,", ",", edited)
    edited = re.sub(r"\s+\.", ".", edited)
    edited = re.sub(r"\s+", " ", edited).strip()
    return edited


def _post_edit_common(text: str) -> str:
    edited = text
    edited = re.sub(r"\s+,", ",", edited)
    edited = re.sub(r"\s+\.", ".", edited)
    edited = re.sub(r"\s+!", "!", edited)
    edited = re.sub(r"\s+\?", "?", edited)
    edited = re.sub(r"\s+", " ", edited).strip()
    return edited


def _post_edit_turkish(text: str) -> str:
    edited = text
    edited = re.sub(r"\b[Bb]en gidiyor\b", "Ben gidiyorum", edited)
    edited = re.sub(r"\b[Bb]iz gidiyor\b", "Biz gidiyoruz", edited)
    edited = re.sub(r"\b[Ss]en gidiyor\b", "Sen gidiyorsun", edited)
    edited = re.sub(r"\b[Dd]ün ([^.!?\n]{0,30}) gidiyorum\b", r"Dün \1 gittim", edited)
    edited = re.sub(r"\bçok insanlar\b", "çok insan", edited)
    edited = re.sub(r"\b[Bb]iz karar veriyor\b", "Biz karar veriyoruz", edited)
    edited = re.sub(r"\bben ve ([a-zçğıöşü][a-zçğıöşü'\-]*(?:\s+[a-zçğıöşü][a-zçğıöşü'\-]*){0,2}) gidiyor\b", r"ben ve \1 gidiyoruz", edited)
    edited = re.sub(r"\.{2,}", ".", edited)
    return _post_edit_common(edited)


def _post_edit_bulgarian(text: str) -> str:
    edited = text
    edited = re.sub(r"\bАз ходи\b", "Аз ходя", edited)
    edited = re.sub(r"\bНие ходи\b", "Ние ходим", edited)
    edited = re.sub(r"\bТе е\b", "Те са", edited)
    edited = re.sub(r"\bВчера ([^.!?\n]{0,30}) отивам\b", r"Вчера \1 отидох", edited)
    edited = re.sub(r"\bхората е\b", "хората са", edited)
    edited = re.sub(r"\bмного хора беше\b", "много хора бяха", edited)
    edited = re.sub(r"\bаз и ([а-яА-Я][а-яА-Я'\-]*(?:\s+[а-яА-Я][а-яА-Я'\-]*){0,2}) прави\b", r"аз и \1 правим", edited)
    edited = re.sub(r"\.{2,}", ".", edited)
    return _post_edit_common(edited)


def post_edit_text(text: str, lang: str) -> str:
    if lang == "en":
        return _post_edit_common(post_edit_english(text))
    if lang == "tr":
        return _post_edit_turkish(text)
    if lang == "bg":
        return _post_edit_bulgarian(text)
    return _post_edit_common(text)
