import { SupportedLang } from "@/lib/types";

export type WordInsight = {
  token: string;
  lemma: string;
  pos: "noun" | "verb" | "adjective" | "adverb" | "pronoun" | "other";
  cefr: "A1" | "A2" | "B1" | "B2" | "C1";
  meaning: string;
  usage: string;
  grammar: string;
  examples: string[];
};

const DICT: Record<string, Partial<WordInsight>> = {
  improve: {
    lemma: "improve",
    pos: "verb",
    cefr: "B1",
    meaning: "to make something better",
    usage: "Common in academic and business writing.",
    grammar: "Often followed by an object: improve results/skills.",
    examples: ["You can improve your writing by revising daily.", "This change improves readability."]
  },
  significant: {
    lemma: "significant",
    pos: "adjective",
    cefr: "B2",
    meaning: "important or noticeable",
    usage: "Frequent in formal and analytical texts.",
    grammar: "Usually before a noun: significant effect.",
    examples: ["The update had a significant impact.", "There is a significant difference."]
  }
};

function normalize(token: string): string {
  return token.toLowerCase().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
}

function guessPos(token: string): WordInsight["pos"] {
  const lower = token.toLowerCase();
  if (/(ing|ed)$/.test(lower)) return "verb";
  if (/(ly)$/.test(lower)) return "adverb";
  if (/(ous|ful|ive|able|al)$/.test(lower)) return "adjective";
  if (/(i|you|he|she|we|they|it)$/i.test(lower)) return "pronoun";
  return "noun";
}

function guessCefr(token: string): WordInsight["cefr"] {
  if (token.length <= 4) return "A1";
  if (token.length <= 6) return "A2";
  if (token.length <= 8) return "B1";
  if (token.length <= 10) return "B2";
  return "C1";
}

export function getWordInsight(token: string, lang: SupportedLang): WordInsight {
  const clean = normalize(token) || token;
  const fromDict = DICT[clean.toLowerCase()];

  return {
    token,
    lemma: fromDict?.lemma ?? clean.toLowerCase(),
    pos: fromDict?.pos ?? guessPos(clean),
    cefr: fromDict?.cefr ?? guessCefr(clean),
    meaning: fromDict?.meaning ?? `Contextual meaning of \"${clean}\" in ${lang.toUpperCase()} text.`,
    usage: fromDict?.usage ?? "Check register (formal/informal) before replacing this word.",
    grammar: fromDict?.grammar ?? "Confirm agreement and collocation with nearby words.",
    examples: fromDict?.examples ?? [
      `Example 1: Use \"${clean}\" in a short sentence.`,
      `Example 2: Rewrite a sentence using \"${clean}\" with a different tone.`
    ]
  };
}
