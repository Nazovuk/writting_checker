from __future__ import annotations

import re
from typing import Any, Literal
from urllib.parse import quote

import httpx
from app.config import settings
from app.models import WordInsightResponse
from app.services.translation_service import translate_text

LOCAL_LEXICON: dict[str, dict[str, Any]] = {
    "rain": {
        "lemma": "rain",
        "pos": "noun",
        "cefr": "A2",
        "meaning": "Water that falls from clouds as drops.",
        "usage": "Common in weather descriptions and daily conversation.",
        "grammar": "As a noun: 'the rain'. As a verb: 'it rains'.",
        "examples": [
            "Heavy rain is expected this evening.",
            "The rain stopped after lunch.",
        ],
        "meaning_tr": "Bulutlardan damlalar halinde düşen su.",
        "usage_tr": "Hava durumunu anlatırken ve günlük konuşmada sık kullanılır.",
        "grammar_tr": "İsim olarak: 'the rain'. Fiil olarak: 'it rains'.",
        "examples_tr": [
            "Bu akşam şiddetli yağmur bekleniyor.",
            "Yağmur öğle yemeğinden sonra durdu.",
        ],
        "meaning_bg": "Вода, която пада от облаците под формата на капки.",
        "usage_bg": "Често се използва в описания за времето и ежедневна реч.",
        "grammar_bg": "Като съществително: 'the rain'. Като глагол: 'it rains'.",
        "examples_bg": [
            "Тази вечер се очаква силен дъжд.",
            "Дъждът спря след обяд.",
        ],
    },
    "raining": {
        "lemma": "rain",
        "pos": "verb",
        "cefr": "A2",
        "meaning": "Falling as rain right now or around now.",
        "usage": "Used in progressive form with 'is/was': 'It is raining.'",
        "grammar": "Usually appears with a dummy subject: 'It is raining.'",
        "examples": [
            "It is raining outside.",
            "It was raining all morning.",
        ],
        "meaning_tr": "Şu anda veya bu dönemde yağmur yağıyor olma durumu.",
        "usage_tr": "Sürekli zamanda 'is/was' ile kullanılır: 'It is raining.'",
        "grammar_tr": "Genellikle öznesiz yapı ile geçer: 'It is raining.'",
        "examples_tr": [
            "Dışarıda yağmur yağıyor.",
            "Bütün sabah yağmur yağıyordu.",
        ],
        "meaning_bg": "Вали в момента или в текущ период.",
        "usage_bg": "Използва се в продължително време с 'is/was': 'It is raining.'",
        "grammar_bg": "Обикновено се използва с формален подлог: 'It is raining.'",
        "examples_bg": [
            "Навън вали.",
            "Цяла сутрин валеше.",
        ],
    },
    "pub": {
        "lemma": "pub",
        "pos": "noun",
        "cefr": "B1",
        "meaning": "A place where alcoholic drinks and often food are served.",
        "usage": "Mostly British English; in American English, 'bar' is more common.",
        "grammar": "Countable noun: 'a pub', 'the pub', 'pubs'.",
        "examples": [
            "They met at the pub after work.",
            "The pub was crowded on Friday night.",
        ],
        "meaning_tr": "Alkollü içeceklerin ve çoğu zaman yiyeceklerin servis edildiği yer.",
        "usage_tr": "Daha çok Britanya İngilizcesinde kullanılır; Amerikan İngilizcesinde 'bar' daha yaygındır.",
        "grammar_tr": "Sayılabilir isim: 'a pub', 'the pub', 'pubs'.",
        "examples_tr": [
            "İşten sonra pub'da buluştular.",
            "Cuma gecesi pub çok kalabalıktı.",
        ],
        "meaning_bg": "Място, където се сервират алкохолни напитки и често храна.",
        "usage_bg": "По-често в британски английски; в американски английски 'bar' е по-употребявано.",
        "grammar_bg": "Броимо съществително: 'a pub', 'the pub', 'pubs'.",
        "examples_bg": [
            "След работа се срещнаха в пъба.",
            "В петък вечер пъбът беше претъпкан.",
        ],
    },
    "library": {
        "lemma": "library",
        "pos": "noun",
        "cefr": "B1",
        "meaning": "A place where people read, study, and borrow books or other materials.",
        "usage": "Used for public, school, university, or digital collections of books and resources.",
        "grammar": "Countable noun: 'a library', 'the library', 'libraries'.",
        "examples": [
            "I go to the library after school.",
            "She borrowed two books from the library.",
            "The city library stays open until nine.",
        ],
        "meaning_tr": "İnsanların kitap ve diğer materyalleri okuduğu, çalıştığı ve ödünç aldığı yer.",
        "usage_tr": "Halk, okul, üniversite veya dijital kaynak koleksiyonları için kullanılır.",
        "grammar_tr": "Sayılabilir isim: 'a library', 'the library', 'libraries'.",
        "examples_tr": [
            "Okuldan sonra kütüphaneye giderim.",
            "Kütüphaneden iki kitap ödünç aldı.",
            "Şehir kütüphanesi dokuza kadar açık kalır.",
        ],
        "meaning_bg": "Място, където хората четат, учат и заемат книги или други материали.",
        "usage_bg": "Използва се за обществени, училищни, университетски или дигитални колекции.",
        "grammar_bg": "Броимо съществително: 'a library', 'the library', 'libraries'.",
        "examples_bg": [
            "Отивам в библиотеката след училище.",
            "Тя взе две книги от библиотеката.",
            "Градската библиотека е отворена до девет.",
        ],
    },
}


def _local_fallback_translate_text(text: str, target_lang: str) -> str:
    """Deterministic fallback when remote translation is unavailable."""
    stripped = text.strip()
    if not stripped:
        return stripped

    if target_lang in {"tr", "bg"}:
        return stripped
    return stripped


def _generate_fallback_examples(token: str, pos: str) -> list[str]:
    clean = token.strip()
    if not clean:
        return ["Use this word in a short sentence."]

    if pos == "noun":
        return [
            f"The {clean} is open every day.",
            f"I visited the {clean} yesterday.",
        ]
    if pos == "verb":
        return [
            f"They {clean} every morning.",
            f"She can {clean} in difficult situations.",
        ]
    if pos == "adjective":
        return [
            f"This is a {clean} solution for the team.",
            f"The result is clear and {clean}.",
        ]
    if pos == "adverb":
        return [
            f"He responded {clean} to the question.",
            f"They worked {clean} during the workshop.",
        ]
    if pos == "pronoun":
        return [
            f"We used {clean} correctly in the sentence.",
            f"The role of {clean} depends on context.",
        ]
    return [
        f"The word '{clean}' appears in this sentence.",
        f"Try '{clean}' in a formal sentence.",
    ]


def _apply_localized_lexicon(payload: dict[str, Any], local_entry: dict[str, Any], target_lang: str) -> bool:
    meaning_key = f"meaning_{target_lang}"
    usage_key = f"usage_{target_lang}"
    grammar_key = f"grammar_{target_lang}"
    examples_key = f"examples_{target_lang}"

    localized = False
    meaning = local_entry.get(meaning_key)
    usage = local_entry.get(usage_key)
    grammar = local_entry.get(grammar_key)
    examples = local_entry.get(examples_key)

    if isinstance(meaning, str) and meaning.strip():
        payload["meaning"] = meaning.strip()
        localized = True
    if isinstance(usage, str) and usage.strip():
        payload["usage"] = usage.strip()
        localized = True
    if isinstance(grammar, str) and grammar.strip():
        payload["grammar"] = grammar.strip()
        localized = True
    if isinstance(examples, list):
        filtered = [e.strip() for e in examples if isinstance(e, str) and e.strip()]
        if filtered:
            payload["examples"] = filtered[:3]
            localized = True
    return localized


def _normalize_token(token: str) -> str:
    cleaned = re.sub(r"^[^\w]+|[^\w]+$", "", token, flags=re.UNICODE)
    return cleaned.strip().lower()


def _guess_pos(token: str) -> Literal["noun", "verb", "adjective", "adverb", "pronoun", "other"]:
    if re.search(r"(ing|ed)$", token):
        return "verb"
    if re.search(r"ly$", token):
        return "adverb"
    if re.search(r"(ous|ful|ive|able|al)$", token):
        return "adjective"
    if token in {"i", "you", "he", "she", "we", "they", "it"}:
        return "pronoun"
    return "noun"


def _guess_cefr(token: str) -> Literal["A1", "A2", "B1", "B2", "C1"]:
    n = len(token)
    if n <= 4:
        return "A1"
    if n <= 6:
        return "A2"
    if n <= 8:
        return "B1"
    if n <= 10:
        return "B2"
    return "C1"


def _grammar_hint(pos: str) -> str:
    if pos == "verb":
        return "Check tense, subject-verb agreement, and common collocations."
    if pos == "noun":
        return "Check article choice, countability, and singular/plural form."
    if pos == "adjective":
        return "Check adjective order and whether a comparative/superlative form is needed."
    if pos == "adverb":
        return "Check placement in the sentence and modifier scope."
    if pos == "pronoun":
        return "Check person, number, and referent clarity."
    return "Check word form and local agreement with neighboring words."


async def _fetch_english_dictionary(token: str) -> dict[str, Any] | None:
    url = f"{settings.dictionary_api_base}/{quote(token)}"
    async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
        response = await client.get(url)
        if response.status_code != 200:
            return None
        body = response.json()
        if not isinstance(body, list) or not body:
            return None
        first = body[0]
        if not isinstance(first, dict):
            return None
        return first


async def _fetch_languagetool_spelling_suggestion(token: str) -> str | None:
    if not token.strip():
        return None

    payload = {
        "text": token,
        "language": "en-US",
    }
    try:
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            # LanguageTool check endpoint expects form payload.
            response = await client.post(settings.languagetool_url, data=payload)
            response.raise_for_status()
            body = response.json()
    except Exception:
        return None

    matches = body.get("matches") if isinstance(body, dict) else None
    if not isinstance(matches, list):
        return None

    for match in matches:
        if not isinstance(match, dict):
            continue
        replacements = match.get("replacements")
        if not isinstance(replacements, list) or not replacements:
            continue
        first = replacements[0]
        if not isinstance(first, dict):
            continue
        value = first.get("value")
        if isinstance(value, str) and value.strip():
            suggestion = _normalize_token(value)
            if suggestion and suggestion != token:
                return suggestion
    return None


def _extract_dictionary_fields(raw: dict[str, Any], token: str) -> dict[str, Any]:
    lemma = str(raw.get("word") or token).lower()
    meanings = raw.get("meanings") if isinstance(raw.get("meanings"), list) else []

    pos = "other"
    meaning = f"No dictionary definition found for '{token}'."
    usage = "Try checking the word in a different sentence for clearer context."
    examples: list[str] = []

    if meanings:
        first_meaning = meanings[0] if isinstance(meanings[0], dict) else {}
        pos_raw = str(first_meaning.get("partOfSpeech") or "").lower()
        if pos_raw in {"noun", "verb", "adjective", "adverb", "pronoun"}:
            pos = pos_raw

        defs = first_meaning.get("definitions") if isinstance(first_meaning.get("definitions"), list) else []
        if defs:
            first_def = defs[0] if isinstance(defs[0], dict) else {}
            definition_text = first_def.get("definition")
            if isinstance(definition_text, str) and definition_text.strip():
                meaning = definition_text.strip()

            first_example = first_def.get("example")
            if isinstance(first_example, str) and first_example.strip():
                examples.append(first_example.strip())

        for meaning_block in meanings:
            if not isinstance(meaning_block, dict):
                continue
            defs = meaning_block.get("definitions")
            if not isinstance(defs, list):
                continue
            for d in defs:
                if not isinstance(d, dict):
                    continue
                ex = d.get("example")
                if isinstance(ex, str) and ex.strip() and ex.strip() not in examples:
                    examples.append(ex.strip())
                if len(examples) >= 3:
                    break
            if len(examples) >= 3:
                break

        usage = "Used in standard written English; confirm tone with surrounding context."

    return {
        "lemma": lemma,
        "pos": pos if pos != "other" else _guess_pos(token),
        "cefr": _guess_cefr(token),
        "meaning": meaning,
        "usage": usage,
        "grammar": _grammar_hint(pos),
        "examples": examples[:3] if examples else _generate_fallback_examples(token, pos if pos != "other" else _guess_pos(token)),
    }


async def build_word_insight(token: str, text_lang: str, explanation_lang: str) -> WordInsightResponse:
    clean = _normalize_token(token)
    if not clean:
        clean = token.strip().lower()

    payload = {
        "lemma": clean,
        "pos": _guess_pos(clean),
        "cefr": _guess_cefr(clean),
        "meaning": f"Contextual meaning for '{clean}' in {text_lang.upper()} text.",
        "usage": "Check formal/informal register before replacing this word.",
        "grammar": _grammar_hint(_guess_pos(clean)),
        "examples": _generate_fallback_examples(clean, _guess_pos(clean)),
    }

    local = LOCAL_LEXICON.get(clean)
    if local:
        payload.update(local)
    else:
        try:
            if clean:
                raw = await _fetch_english_dictionary(clean)
                if raw:
                    payload.update(_extract_dictionary_fields(raw, clean))
                else:
                    suggestion = await _fetch_languagetool_spelling_suggestion(clean)
                    if suggestion:
                        suggestion_raw = await _fetch_english_dictionary(suggestion)
                        if suggestion_raw:
                            payload.update(_extract_dictionary_fields(suggestion_raw, suggestion))
                            payload["usage"] = (
                                f"No direct dictionary entry for '{clean}'. "
                                f"Using closest spelling suggestion '{suggestion}'."
                            )
                        else:
                            payload["meaning"] = (
                                f"No reliable dictionary entry found for '{clean}'. "
                                f"Closest suggestion: '{suggestion}'."
                            )
                            payload["usage"] = "Check spelling first, then re-open word insight for a richer definition."
                    else:
                        payload["meaning"] = (
                            f"No reliable dictionary entry found for '{clean}'. "
                            "This token may be misspelled or too domain-specific."
                        )
                        payload["usage"] = "Check spelling and context. For names/brands, meaning may depend on domain."
        except Exception:
            # keep safe fallback payload
            pass

    translation_status: Literal["native", "translated", "fallback"] = "native"
    if explanation_lang != "en":
        if local and _apply_localized_lexicon(payload, local, explanation_lang):
            translation_status = "translated"
        else:
            original_meaning = payload["meaning"]
            original_usage = payload["usage"]
            original_grammar = payload["grammar"]
            original_examples = list(payload["examples"])

            payload["meaning"] = await translate_text(payload["meaning"], source="en", target=explanation_lang)
            payload["usage"] = await translate_text(payload["usage"], source="en", target=explanation_lang)
            payload["grammar"] = await translate_text(payload["grammar"], source="en", target=explanation_lang)
            payload["examples"] = [await translate_text(ex, source="en", target=explanation_lang) for ex in payload["examples"]]

            translated_any = (
                payload["meaning"] != original_meaning
                or payload["usage"] != original_usage
                or payload["grammar"] != original_grammar
                or payload["examples"] != original_examples
            )
            if translated_any:
                translation_status = "translated"
            else:
                # Remote translator unavailable: keep readable source content.
                payload["meaning"] = _local_fallback_translate_text(original_meaning, explanation_lang)
                payload["usage"] = _local_fallback_translate_text(original_usage, explanation_lang)
                payload["grammar"] = _local_fallback_translate_text(original_grammar, explanation_lang)
                payload["examples"] = [_local_fallback_translate_text(ex, explanation_lang) for ex in original_examples]
                translation_status = "fallback"

    return WordInsightResponse(
        token=clean or token,
        lemma=payload["lemma"],
        pos=payload["pos"],
        cefr=payload["cefr"],
        explanationLang=explanation_lang if explanation_lang in {"en", "tr", "bg"} else "en",
        translationStatus=translation_status,
        meaning=payload["meaning"],
        usage=payload["usage"],
        grammar=payload["grammar"],
        examples=payload["examples"],
    )
