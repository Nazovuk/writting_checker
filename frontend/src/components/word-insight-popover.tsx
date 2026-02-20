"use client";

import { useState } from "react";
import { WordInsight } from "@/lib/word-insight";
import { SupportedLang } from "@/lib/types";

type Props = {
  insight: WordInsight;
  textLang: SupportedLang;
  insightLang: SupportedLang;
  onChangeInsightLang: (lang: SupportedLang) => void;
  x: number;
  y: number;
  onClose: () => void;
  onSaveWord: (word: string) => void;
  onAddToQuiz: (word: string) => void;
};

type Tab = "meaning" | "usage" | "grammar" | "examples";

export function WordInsightPopover({ insight, textLang, insightLang, onChangeInsightLang, x, y, onClose, onSaveWord, onAddToQuiz }: Props) {
  const [tab, setTab] = useState<Tab>("meaning");

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className="absolute w-[320px] max-w-[90vw] rounded-2xl border border-black/10 bg-white p-3 shadow-2xl"
        style={{ left: Math.max(12, x), top: Math.max(12, y + 10) }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-base">{insight.token}</p>
          <div className="flex items-center gap-2">
            <select
              value={insightLang}
              onChange={(e) => onChangeInsightLang(e.target.value as SupportedLang)}
              className="rounded-lg border border-black/15 bg-white px-2 py-1 text-[11px]"
              title="Explanation language"
            >
              <option value="en">EN</option>
              <option value="tr">TR</option>
              <option value="bg">BG</option>
            </select>
            <button type="button" onClick={onClose} className="text-xs text-black/55">Close</button>
          </div>
        </div>
        <p className="text-xs text-black/50">Lemma: {insight.lemma} · Text: {textLang.toUpperCase()}</p>
        <div className="mt-2 flex gap-2 text-xs">
          <span className="rounded-full bg-black/5 px-2 py-1">{insight.pos}</span>
          <span className="rounded-full bg-black/5 px-2 py-1">CEFR {insight.cefr}</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {[
            ["meaning", "Meaning"],
            ["usage", "Usage"],
            ["grammar", "Grammar"],
            ["examples", "Examples"]
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key as Tab)}
              className={`rounded-full border px-2 py-1 text-[11px] ${tab === key ? "bg-ink text-white border-ink" : "bg-white border-black/15"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3 text-sm">
          {tab === "meaning" ? <p><b>Meaning:</b> {insight.meaning}</p> : null}
          {tab === "usage" ? <p><b>Usage:</b> {insight.usage}</p> : null}
          {tab === "grammar" ? <p><b>Grammar:</b> {insight.grammar}</p> : null}
          {tab === "examples" ? (
            <ul className="list-disc pl-5 text-xs text-black/70">
              {insight.examples.map((ex) => <li key={ex}>{ex}</li>)}
            </ul>
          ) : null}
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onSaveWord(insight.lemma)}
            className="rounded-lg bg-ink px-3 py-1.5 text-xs text-white"
          >
            Save word
          </button>
          <button
            type="button"
            onClick={() => onAddToQuiz(insight.lemma)}
            className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-xs"
          >
            Add to quiz
          </button>
        </div>
      </div>
    </div>
  );
}
