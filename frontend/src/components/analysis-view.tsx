"use client";

import { useState } from "react";
import { AnalyzeResponse } from "@/lib/types";
import { HighlightedText } from "@/components/highlighted-text";
import { WordText } from "@/components/word-text";
import { InlineDiff } from "@/components/inline-diff";
import { categoryLabel } from "@/lib/labels";

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
  const activeIssue = result?.issues.find((i) => i.id === activeIssueId);

  const selectedSentence = (() => {
    if (!activeIssue || !original) return "";
    const leftBound = Math.max(
      original.lastIndexOf(".", activeIssue.start),
      original.lastIndexOf("!", activeIssue.start),
      original.lastIndexOf("?", activeIssue.start),
      original.lastIndexOf("\n", activeIssue.start),
    );
    const nextDot = original.indexOf(".", activeIssue.end);
    const nextBang = original.indexOf("!", activeIssue.end);
    const nextQ = original.indexOf("?", activeIssue.end);
    const nextNewLine = original.indexOf("\n", activeIssue.end);
    const positives = [nextDot, nextBang, nextQ, nextNewLine].filter((v) => v >= 0);
    const rightBound = positives.length ? Math.min(...positives) : original.length;
    return original.slice(leftBound + 1, rightBound + 1).trim();
  })();

  const issueSeverityTone = activeIssue?.severity === "critical"
    ? "bg-[#fdecee] border-[#efb5be] text-[#7f1d2a]"
    : activeIssue?.severity === "major"
      ? "bg-[#fff4e9] border-[#f1d8bf] text-[#7a3f19]"
      : "bg-[#edf8f5] border-[#b8e3d8] text-[#124d44]";

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
        {activeIssue ? (
          <div className={`mb-3 rounded-xl border px-3 py-2 ${issueSeverityTone}`}>
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide">
              <span className="font-semibold">{categoryLabel(activeIssue.category)}</span>
              <span className="rounded-full border border-current/25 px-2 py-0.5 normal-case tracking-normal">{activeIssue.severity}</span>
              {selectedSentence ? <span className="normal-case tracking-normal opacity-85">"{selectedSentence}"</span> : null}
            </div>
            <p className="mt-1 text-sm leading-relaxed">
              {activeIssue.reason}
              {activeIssue.replacements?.[0] ? <> Best suggestion: <b>{activeIssue.replacements[0]}</b>.</> : null}
            </p>
          </div>
        ) : null}

        {mode === "original" ? (
          <HighlightedText text={original} issues={result?.issues ?? []} activeIssueId={activeIssueId} onPickIssue={onPickIssue} />
        ) : null}

        {mode === "corrected" ? <WordText text={corrected} lang={lang} onSaveWord={onSaveWord} onAddToQuiz={onAddToQuiz} /> : null}

        {mode === "side" ? (
          <div className="relative grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
            <div className="hidden md:flex absolute left-1/2 top-2 bottom-2 -translate-x-1/2 items-center">
              <div className="h-full w-px bg-gradient-to-b from-transparent via-black/20 to-transparent" />
              <span className="absolute -left-3 rounded-full border border-black/10 bg-white px-1.5 py-0.5 text-[10px] text-black/45">
                {"->"}
              </span>
            </div>
            <div className="rounded-xl border border-black/10 bg-white p-3">
              <p className="text-xs uppercase tracking-wide text-black/45 mb-2">Original</p>
              <HighlightedText text={original} issues={result?.issues ?? []} activeIssueId={activeIssueId} onPickIssue={onPickIssue} />
            </div>
            <div className="rounded-xl border border-black/10 bg-[#f9fbfd] p-3">
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
