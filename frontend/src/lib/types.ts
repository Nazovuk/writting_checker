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

export type AnalyzeResponse = {
  detectedLang: SupportedLang;
  explanationLang: SupportedLang;
  sessionId: string;
  issues: Issue[];
  correctedTextPreview: string;
  learningCards: LearningCard[];
  sessionSummary: SessionSummary;
  warnings: string[];
  extractedText?: string;
  ocrConfidence?: number;
};
