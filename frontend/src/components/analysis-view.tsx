"use client";

import { useState } from "react";
import { AnalyzeResponse } from "@/lib/types";
import { HighlightedText } from "@/components/highlighted-text";
import { WordText } from "@/components/word-text";
import { InlineDiff } from "@/components/inline-diff";

type ViewMode = "original" | "corrected" | "side" | "diff";

type Props = {
  sourceText: string;
  result: AnalyzeResponse | null;
  activeIssueId?: string;
  onPickIssue: (id: string) => void;
  onSaveWord: (word: string) => void;
  onAddToQuiz: (word: string) => void;
};

export function AnalysisView({ sourceText, result, activeIssueId, onPickIssue, onSaveWord, onAddToQuiz }: Props) {
  const [mode, setMode] = useState<ViewMode>("side");

  const original = sourceText;
  const corrected = result?.correctedTextPreview ?? sourceText;
  const lang = result?.detectedLang ?? "en";

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {[
          { key: "original", label: "Original" },
          { key: "corrected", label: "Corrected" },
          { key: "side", label: "Side-by-side" },
          { key: "diff", label: "Inline diff" }
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setMode(tab.key as ViewMode)}
            className={`rounded-full px-3 py-1 text-xs border ${mode === tab.key ? "bg-ink text-white border-ink" : "bg-white border-black/15"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl bg-white p-4 min-h-[360px] border border-black/5">
        {mode === "original" ? (
          <HighlightedText text={original} issues={result?.issues ?? []} activeIssueId={activeIssueId} onPickIssue={onPickIssue} />
        ) : null}

        {mode === "corrected" ? <WordText text={corrected} lang={lang} onSaveWord={onSaveWord} onAddToQuiz={onAddToQuiz} /> : null}

        {mode === "side" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-black/45 mb-2">Original</p>
              <HighlightedText text={original} issues={result?.issues ?? []} activeIssueId={activeIssueId} onPickIssue={onPickIssue} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-black/45 mb-2">Corrected</p>
              <WordText text={corrected} lang={lang} onSaveWord={onSaveWord} onAddToQuiz={onAddToQuiz} />
            </div>
          </div>
        ) : null}

        {mode === "diff" ? <InlineDiff original={original} corrected={corrected} /> : null}
      </div>
    </div>
  );
}
