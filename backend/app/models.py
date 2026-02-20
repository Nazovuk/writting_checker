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


class AnalyzeResponse(BaseModel):
    detectedLang: SupportedLang
    explanationLang: SupportedLang
    sessionId: str
    issues: list[Issue]
    correctedTextPreview: str
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
