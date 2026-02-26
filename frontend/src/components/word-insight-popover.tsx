"use client";

import { useState } from "react";
import { SupportedLang, WordInsight } from "@/lib/types";

type Props = {
  insight: WordInsight | null;
  token: string;
  loading: boolean;
  error: string | null;
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

export function WordInsightPopover({ insight, token, loading, error, textLang, insightLang, onChangeInsightLang, x, y, onClose, onSaveWord, onAddToQuiz }: Props) {
  const [tab, setTab] = useState<Tab>("meaning");
  const ui = {
    en: {
      close: "Close",
      lemma: "Lemma",
      text: "Text",
      meaning: "Meaning",
      usage: "Usage",
      grammar: "Grammar",
      examples: "Examples",
      saveWord: "Save word",
      addToQuiz: "Add to quiz",
    },
    tr: {
      close: "Kapat",
      lemma: "Kök",
      text: "Metin",
      meaning: "Anlam",
      usage: "Kullanım",
      grammar: "Gramer",
      examples: "Örnekler",
      saveWord: "Kelimeyi kaydet",
      addToQuiz: "Quize ekle",
    },
    bg: {
      close: "Затвори",
      lemma: "Лема",
      text: "Текст",
      meaning: "Значение",
      usage: "Употреба",
      grammar: "Граматика",
      examples: "Примери",
      saveWord: "Запази дума",
      addToQuiz: "Добави в тест",
    },
  }[insightLang];

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className="absolute w-[320px] max-w-[90vw] rounded-2xl border border-black/10 bg-white p-3 shadow-2xl"
        style={{ left: Math.max(12, x), top: Math.max(12, y + 10) }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-base">{insight?.token ?? token}</p>
          <div className="flex items-center gap-2">
            <select
              value={insightLang}
              onChange={(e) => onChangeInsightLang(e.target.value as SupportedLang)}
              className="rounded-lg border border-black/15 bg-white px-2 py-1 text-[11px]"
              title={ui.text}
            >
              <option value="en">EN</option>
              <option value="tr">TR</option>
              <option value="bg">BG</option>
            </select>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-black/10 text-sm text-black/60 transition hover:bg-black/5"
              aria-label="Close"
              title={ui.close}
            >
              x
            </button>
          </div>
        </div>
        {insight && insightLang !== "en" ? (
          <p
            className={
              insight.translationStatus === "translated"
                ? "mt-1 text-[11px] text-emerald-700"
                : "mt-1 text-[11px] text-black/45"
            }
          >
            {insight.translationStatus === "translated"
              ? `Content translated to ${insight.explanationLang.toUpperCase()}.`
              : `Live translation unavailable. Showing source content.`}
          </p>
        ) : null}
        <p className="text-xs text-black/50">{ui.lemma}: {insight?.lemma ?? "-"} · {ui.text}: {textLang.toUpperCase()}</p>
        <div className="mt-2 flex gap-2 text-xs">
          <span className="rounded-full bg-black/5 px-2 py-1">{insight?.pos ?? "other"}</span>
          <span className="rounded-full bg-black/5 px-2 py-1">CEFR {insight?.cefr ?? "-"}</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {[
            ["meaning", ui.meaning],
            ["usage", ui.usage],
            ["grammar", ui.grammar],
            ["examples", ui.examples]
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
          {loading ? <p className="text-black/60">Loading insight...</p> : null}
          {error ? <p className="text-warn">{error}</p> : null}
          {!loading && !error && tab === "meaning" ? <p><b>{ui.meaning}:</b> {insight?.meaning}</p> : null}
          {!loading && !error && tab === "usage" ? <p><b>{ui.usage}:</b> {insight?.usage}</p> : null}
          {!loading && !error && tab === "grammar" ? <p><b>{ui.grammar}:</b> {insight?.grammar}</p> : null}
          {!loading && !error && tab === "examples" ? (
            <ul className="list-disc pl-5 text-xs text-black/70">
              {(insight?.examples ?? []).map((ex) => <li key={ex}>{ex}</li>)}
            </ul>
          ) : null}
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => insight?.lemma && onSaveWord(insight.lemma)}
            className="rounded-lg bg-ink px-3 py-1.5 text-xs text-white"
            disabled={!insight}
          >
            {ui.saveWord}
          </button>
          <button
            type="button"
            onClick={() => insight?.lemma && onAddToQuiz(insight.lemma)}
            className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-xs"
            disabled={!insight}
          >
            {ui.addToQuiz}
          </button>
        </div>
      </div>
    </div>
  );
}
