"use client";

import { MouseEvent, useState } from "react";
import { SupportedLang } from "@/lib/types";
import { getWordInsight } from "@/lib/word-insight";
import { WordInsightPopover } from "@/components/word-insight-popover";

type Props = {
  text: string;
  lang: SupportedLang;
  onSaveWord: (word: string) => void;
  onAddToQuiz: (word: string) => void;
};

type PopState = {
  x: number;
  y: number;
  token: string;
} | null;

export function WordText({ text, lang, onSaveWord, onAddToQuiz }: Props) {
  const [pop, setPop] = useState<PopState>(null);

  if (!text) {
    return <p className="text-sm text-black/45">No content to display.</p>;
  }

  const parts = text.split(/(\s+)/);

  function handleWordClick(token: string, e: MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setPop({ x: rect.left, y: rect.bottom, token });
  }

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
          insight={getWordInsight(pop.token, lang)}
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
