export function normalizeLookupToken(token: string): string {
  const cleaned = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").trim();
  return cleaned.toLowerCase();
}
