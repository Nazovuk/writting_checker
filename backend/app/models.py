from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field


LangCode = Literal["auto", "en", "tr", "bg"]
SupportedLang = Literal["en", "tr", "bg"]
Mode = Literal["strict", "standard", "fluency"]


class AnalyzeTextRequest(BaseModel):
    text: str = Field(min_length=1)
    sourceLang: LangCode = "auto"
    explanationLang: Literal["same", "en", "tr", "bg"] = "same"
    mode: Mode = "standard"


class Replacement(BaseModel):
    value: str


class Issue(BaseModel):
    id: str
    start: int
    end: int
    original: str
    replacements: list[str]
    category: str
    severity: Literal["critical", "major", "minor"]
    reason: str
    ruleId: str


class LearningCard(BaseModel):
    title: str
    shortRule: str
    wrongExample: str
    correctExample: str
    level: Literal["beginner", "intermediate", "advanced"] = "beginner"


class SessionSummary(BaseModel):
    topMistakes: list[str]
    vocabularyHints: list[str]
    nextPractice: str


class RewriteSuggestion(BaseModel):
    label: str
    text: str
    confidence: Literal["safe", "medium", "aggressive"]
    confidenceReason: str


class AnalyzeResponse(BaseModel):
    detectedLang: SupportedLang
    explanationLang: SupportedLang
    sessionId: str
    issues: list[Issue]
    correctedTextPreview: str
    rewriteSuggestions: list[str] = []
    rewriteSuggestionsDetailed: list[RewriteSuggestion] = []
    learningCards: list[LearningCard]
    sessionSummary: SessionSummary
    warnings: list[str] = []


class AnalyzeImageResponse(AnalyzeResponse):
    extractedText: str
    ocrConfidence: float
    boxes: list[dict] = []


class ApplySuggestionsRequest(BaseModel):
    text: str
    issueIds: list[str]
    strategy: Literal["safe", "all"] = "safe"


class ApplySuggestionsResponse(BaseModel):
    patchedText: str
    applied: list[str]
    skipped: list[str]


class LanguageCapabilities(BaseModel):
    grammar: bool
    ocr: bool
    explanation: bool


class LanguagesResponse(BaseModel):
    supported: dict[SupportedLang, LanguageCapabilities]
    defaults: dict[str, str]


class WordInsightResponse(BaseModel):
    token: str
    lemma: str
    pos: Literal["noun", "verb", "adjective", "adverb", "pronoun", "other"]
    cefr: Literal["A1", "A2", "B1", "B2", "C1"]
    explanationLang: SupportedLang
    translationStatus: Literal["native", "translated", "fallback"]
    meaning: str
    usage: str
    grammar: str
    examples: list[str]
