"use client";

import { MouseEvent, useEffect, useState } from "react";
import { SupportedLang } from "@/lib/types";
import { normalizeLookupToken } from "@/lib/word-insight";
import { WordInsightPopover } from "@/components/word-insight-popover";
import { fetchWordInsight } from "@/lib/api";
import { WordInsight } from "@/lib/types";

type Props = {
  text: string;
  lang: SupportedLang;
  onSaveWord: (word: string) => void;
  onAddToQuiz: (word: string) => void;
};

type PopState = {
  x: number;
  y: number;
  rawToken: string;
  lookupToken: string;
} | null;

export function WordText({ text, lang, onSaveWord, onAddToQuiz }: Props) {
  const [pop, setPop] = useState<PopState>(null);
  const [insightLang, setInsightLang] = useState<SupportedLang>("en");
  const [insight, setInsight] = useState<WordInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  function handleWordClick(token: string, e: MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const lookupToken = normalizeLookupToken(token);
    if (!lookupToken) return;
    setPop({ x: rect.left, y: rect.bottom, rawToken: token, lookupToken });
  }

  useEffect(() => {
    let cancelled = false;
    async function loadInsight() {
      if (!pop) return;
      setInsightLoading(true);
      setInsightError(null);
      try {
        const data = await fetchWordInsight(pop.lookupToken, lang, insightLang);
        if (!cancelled) setInsight(data);
      } catch (e) {
        if (!cancelled) {
          setInsight(null);
          setInsightError(e instanceof Error ? e.message : "Insight unavailable");
        }
      } finally {
        if (!cancelled) setInsightLoading(false);
      }
    }
    setInsight(null);
    void loadInsight();
    return () => {
      cancelled = true;
    };
  }, [pop, lang, insightLang]);

  if (!text) {
    return <p className="text-sm text-black/45">No content to display.</p>;
  }

  const parts = text.split(/(\s+)/);

  return (
    <>
      <p className="leading-8 text-[15px] whitespace-pre-wrap break-words">
        {parts.map((part, idx) => {
          if (!part.trim()) return <span key={`space-${idx}`}>{part}</span>;

          return (
            <button
              key={`token-${idx}-${part}`}
              type="button"
              onClick={(e) => handleWordClick(part, e)}
              className="rounded-sm px-0.5 transition hover:bg-cool/20"
            >
              {part}
            </button>
          );
        })}
      </p>
      {pop ? (
        <WordInsightPopover
          insight={insight}
          token={pop.lookupToken}
          loading={insightLoading}
          error={insightError}
          textLang={lang}
          insightLang={insightLang}
          onChangeInsightLang={setInsightLang}
          x={pop.x}
          y={pop.y}
          onClose={() => setPop(null)}
          onSaveWord={(word) => {
            onSaveWord(word);
            setPop(null);
          }}
          onAddToQuiz={(word) => {
            onAddToQuiz(word);
            setPop(null);
          }}
        />
      ) : null}
    </>
  );
}
