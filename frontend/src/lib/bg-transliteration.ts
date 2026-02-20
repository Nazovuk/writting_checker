export type BgTransliterationMode = "phonetic" | "bds_like";

const COMMON_WORD_OVERRIDES: Record<string, string> = {
  bulgaria: "българия",
  balgaria: "българия",
  bylgaria: "българия",
  zdravei: "здравей",
  blagodarya: "благодаря",
  molya: "моля",
  shtastie: "щастие"
};

const MULTI_CHAR_RULES: Array<[string, string]> = [
  ["dzh", "дж"],
  ["sht", "щ"],
  ["zh", "ж"],
  ["sh", "ш"],
  ["ch", "ч"],
  ["ts", "ц"],
  ["ya", "я"],
  ["ja", "я"],
  ["yu", "ю"],
  ["ju", "ю"],
  ["yo", "йо"],
  ["dz", "дз"]
];

const SINGLE_PHONETIC: Record<string, string> = {
  a: "а",
  b: "б",
  c: "ц",
  d: "д",
  e: "е",
  f: "ф",
  g: "г",
  h: "х",
  i: "и",
  j: "й",
  k: "к",
  l: "л",
  m: "м",
  n: "н",
  o: "о",
  p: "п",
  q: "я",
  r: "р",
  s: "с",
  t: "т",
  u: "у",
  v: "в",
  w: "в",
  x: "кс",
  y: "ъ",
  z: "з"
};

const SINGLE_BDS_LIKE: Record<string, string> = {
  ...SINGLE_PHONETIC,
  y: "й",
  q: "я",
  c: "ц"
};

function preserveCase(source: string, target: string): string {
  if (!source) return target;
  if (source.toUpperCase() === source) return target.toUpperCase();
  if (source[0].toUpperCase() === source[0]) return target[0].toUpperCase() + target.slice(1);
  return target;
}

function getSingleMap(mode: BgTransliterationMode): Record<string, string> {
  return mode === "bds_like" ? SINGLE_BDS_LIKE : SINGLE_PHONETIC;
}

export function transliterateLatinToBgWord(word: string, mode: BgTransliterationMode = "phonetic"): string {
  const normalized = word.toLowerCase();
  const override = COMMON_WORD_OVERRIDES[normalized];
  if (override) {
    return preserveCase(word, override);
  }

  let out = "";
  let i = 0;

  const singleMap = getSingleMap(mode);

  while (i < word.length) {
    let matched = false;

    for (const [latin, cyrillic] of MULTI_CHAR_RULES) {
      const chunk = word.slice(i, i + latin.length);
      if (chunk.toLowerCase() === latin) {
        out += preserveCase(chunk, cyrillic);
        i += latin.length;
        matched = true;
        break;
      }
    }

    if (matched) continue;

    const ch = word[i];
    const lower = ch.toLowerCase();

    if (mode === "phonetic" && lower === "y") {
      const isWordEnd = i === word.length - 1;
      if (isWordEnd) {
        out += preserveCase(ch, "й");
        i += 1;
        continue;
      }
    }

    const mapped = singleMap[lower];
    out += mapped ? preserveCase(ch, mapped) : ch;
    i += 1;
  }

  return out;
}

export function transliterateLatinToBgText(text: string, mode: BgTransliterationMode = "phonetic"): string {
  return text.replace(/[A-Za-z]+/g, (word) => transliterateLatinToBgWord(word, mode));
}

export function transliterateLastLatinWord(
  text: string,
  caretPos: number,
  mode: BgTransliterationMode = "phonetic"
): { text: string; caret: number } {
  const before = text.slice(0, caretPos);
  const after = text.slice(caretPos);
  const match = before.match(/([A-Za-z]+)$/);
  if (!match) {
    return { text, caret: caretPos };
  }

  const word = match[1];
  const converted = transliterateLatinToBgWord(word, mode);
  const start = before.length - word.length;
  const updated = before.slice(0, start) + converted + after;
  const delta = converted.length - word.length;
  return { text: updated, caret: caretPos + delta };
}
