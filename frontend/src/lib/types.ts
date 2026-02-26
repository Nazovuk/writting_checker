export type SupportedLang = "en" | "tr" | "bg";

export type Issue = {
  id: string;
  start: number;
  end: number;
  original: string;
  replacements: string[];
  category: string;
  severity: "critical" | "major" | "minor";
  reason: string;
  ruleId: string;
};

export type LearningCard = {
  title: string;
  shortRule: string;
  wrongExample: string;
  correctExample: string;
  level: "beginner" | "intermediate" | "advanced";
};

export type SessionSummary = {
  topMistakes: string[];
  vocabularyHints: string[];
  nextPractice: string;
};

export type RewriteSuggestion = {
  label: string;
  text: string;
  confidence: "safe" | "medium" | "aggressive";
};

export type AnalyzeResponse = {
  detectedLang: SupportedLang;
  explanationLang: SupportedLang;
  sessionId: string;
  issues: Issue[];
  correctedTextPreview: string;
  rewriteSuggestions: string[];
  rewriteSuggestionsDetailed?: RewriteSuggestion[];
  learningCards: LearningCard[];
  sessionSummary: SessionSummary;
  warnings: string[];
  extractedText?: string;
  ocrConfidence?: number;
};

export type WordInsight = {
  token: string;
  lemma: string;
  pos: "noun" | "verb" | "adjective" | "adverb" | "pronoun" | "other";
  cefr: "A1" | "A2" | "B1" | "B2" | "C1";
  explanationLang: SupportedLang;
  translationStatus: "native" | "translated" | "fallback";
  meaning: string;
  usage: string;
  grammar: string;
  examples: string[];
};
