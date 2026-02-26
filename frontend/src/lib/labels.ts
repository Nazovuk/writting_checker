export const CATEGORY_LABELS: Record<string, string> = {
  MORPHOLOGY: "Morphology",
  TYPOS: "Typos",
  PUNCTUATION: "Punctuation",
  CASING: "Casing",
  STYLE: "Style"
};

export function categoryLabel(value: string): string {
  return CATEGORY_LABELS[value] ?? value;
}
