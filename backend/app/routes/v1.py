from __future__ import annotations

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile

from app.config import settings
from app.models import (
    AnalyzeImageResponse,
    AnalyzeResponse,
    AnalyzeTextRequest,
    ApplySuggestionsRequest,
    ApplySuggestionsResponse,
    LanguageCapabilities,
    LanguagesResponse,
    WordInsightResponse,
)
from app.services.explanation_service import build_rewrite_suggestions, build_rewrite_suggestions_detailed, build_summary, issue_to_card
from app.services.file_ingestion_service import extract_text_from_upload
from app.services.grammar_service import LanguageToolUnavailableError, analyze_grammar, apply_suggestions, post_edit_text
from app.services.language_service import detect_language
from app.services.session_store import session_store
from app.services.translation_service import translate_text
from app.services.word_insight_service import build_word_insight

router = APIRouter(prefix="/v1", tags=["v1"])


def _validate_text(text: str) -> str:
    if len(text) > settings.max_text_length:
        raise HTTPException(status_code=400, detail="Text too long")
    return text


async def _build_response(text: str, source_lang: str, explanation_lang: str, mode: str):
    text = _validate_text(text)
    detected_lang = detect_language(text, source_lang)
    target_explanation_lang = detected_lang if explanation_lang == "same" else explanation_lang

    try:
        issues, warnings = await analyze_grammar(text, detected_lang, mode)
    except LanguageToolUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    translated_issues = []
    for issue in issues:
        issue_data = issue.model_dump()
        issue_data["reason"] = await translate_text(
            issue.reason,
            source=detected_lang,
            target=target_explanation_lang,
        )
        translated_issues.append(issue_data)

    preview, _, _ = apply_suggestions(
        text=text,
        issues=translated_issues,
        issue_ids=[i["id"] for i in translated_issues],
        strategy="safe",
    )
    preview = post_edit_text(preview, detected_lang)

    cards = [issue_to_card(issue) for issue in issues[:6]]
    summary = build_summary(issues, detected_lang)

    if target_explanation_lang != detected_lang:
        summary.nextPractice = await translate_text(
            summary.nextPractice,
            source=detected_lang,
            target=target_explanation_lang,
        )

    payload = AnalyzeResponse(
        detectedLang=detected_lang,
        explanationLang=target_explanation_lang,
        sessionId="",
        issues=translated_issues,
        correctedTextPreview=preview,
        rewriteSuggestions=build_rewrite_suggestions(text, preview, issues, detected_lang),
        rewriteSuggestionsDetailed=build_rewrite_suggestions_detailed(text, preview, issues, detected_lang),
        learningCards=cards,
        sessionSummary=summary,
        warnings=warnings,
    )

    sid = session_store.put(text=text, issues=translated_issues)
    payload.sessionId = sid
    return payload, sid


@router.get("/languages", response_model=LanguagesResponse)
async def languages() -> LanguagesResponse:
    return LanguagesResponse(
        supported={
            "en": LanguageCapabilities(grammar=True, ocr=True, explanation=True),
            "tr": LanguageCapabilities(grammar=True, ocr=True, explanation=True),
            "bg": LanguageCapabilities(grammar=True, ocr=True, explanation=True),
        },
        defaults={"sourceLang": "auto", "explanationLang": "same", "mode": "standard"},
    )


@router.post("/analyze/text", response_model=AnalyzeResponse)
async def analyze_text(body: AnalyzeTextRequest):
    payload, sid = await _build_response(
        text=body.text,
        source_lang=body.sourceLang,
        explanation_lang=body.explanationLang,
        mode=body.mode,
    )
    return payload


@router.get("/insights/word", response_model=WordInsightResponse)
async def word_insight(
    token: str,
    textLang: str = "en",
    explanationLang: str = "en",
):
    clean_text_lang = textLang if textLang in {"en", "tr", "bg"} else "en"
    clean_explanation_lang = explanationLang if explanationLang in {"en", "tr", "bg"} else "en"
    if not token.strip():
        raise HTTPException(status_code=400, detail="Token is required")
    return await build_word_insight(token, clean_text_lang, clean_explanation_lang)


@router.post("/analyze/image", response_model=AnalyzeImageResponse)
async def analyze_image(
    file: UploadFile = File(...),
    sourceLang: str = Form("auto"),
    explanationLang: str = Form("same"),
    mode: str = Form("standard"),
):
    data = await file.read()
    if len(data) > settings.max_file_size_bytes:
        raise HTTPException(status_code=400, detail="File too large")

    detected_from_request = "en" if sourceLang == "auto" else sourceLang
    extracted, confidence, boxes, file_warnings, _ = await extract_text_from_upload(
        data,
        filename=file.filename or "upload.bin",
        content_type=file.content_type or "",
        lang=detected_from_request,
    )

    if not extracted.strip():
        raise HTTPException(status_code=400, detail="No extractable text found from uploaded image.")

    payload, sid = await _build_response(
        text=extracted,
        source_lang=sourceLang,
        explanation_lang=explanationLang,
        mode=mode,
    )

    return AnalyzeImageResponse(
        **payload.model_dump(),
        extractedText=extracted,
        ocrConfidence=confidence,
        boxes=boxes,
        warnings=[*payload.warnings, *file_warnings],
    )


@router.post("/analyze/file", response_model=AnalyzeImageResponse)
async def analyze_file(
    file: UploadFile = File(...),
    sourceLang: str = Form("auto"),
    explanationLang: str = Form("same"),
    mode: str = Form("standard"),
):
    data = await file.read()
    if len(data) > settings.max_file_size_bytes:
        raise HTTPException(status_code=400, detail="File too large")

    detected_from_request = "en" if sourceLang == "auto" else sourceLang
    extracted, confidence, boxes, file_warnings, file_type = await extract_text_from_upload(
        data,
        filename=file.filename or "upload.bin",
        content_type=file.content_type or "",
        lang=detected_from_request,
    )
    if not extracted.strip():
        raise HTTPException(
            status_code=400,
            detail=f"No extractable text found for file type '{file_type}'. Upload clearer content.",
        )

    payload, _ = await _build_response(
        text=extracted,
        source_lang=sourceLang,
        explanation_lang=explanationLang,
        mode=mode,
    )

    return AnalyzeImageResponse(
        **payload.model_dump(),
        extractedText=extracted,
        ocrConfidence=confidence,
        boxes=boxes,
        warnings=[*payload.warnings, *file_warnings],
    )


@router.post("/suggestions/apply", response_model=ApplySuggestionsResponse)
async def apply(
    body: ApplySuggestionsRequest,
    x_session_id: str | None = Header(default=None),
):
    issue_list = []

    if x_session_id:
        session = session_store.get(x_session_id)
        if session:
            issue_list = session.issues

    if not issue_list:
        # Fallback path for stateless apply: re-run analysis quickly.
        detected_lang = detect_language(body.text, "auto")
        try:
            detected_issues, _ = await analyze_grammar(body.text, detected_lang, "standard")
        except LanguageToolUnavailableError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        issue_list = [i.model_dump() for i in detected_issues]

    patched, applied_ids, skipped_ids = apply_suggestions(
        text=body.text,
        issues=issue_list,
        issue_ids=body.issueIds,
        strategy=body.strategy,
    )
    detected_lang = detect_language(patched, "auto")
    patched = post_edit_text(patched, detected_lang)

    return ApplySuggestionsResponse(
        patchedText=patched,
        applied=applied_ids,
        skipped=skipped_ids,
    )
