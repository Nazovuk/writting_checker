import { AnalyzeResponse, SupportedLang } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

type AnalyzePayload = {
  text: string;
  sourceLang: "auto" | SupportedLang;
  explanationLang: "same" | SupportedLang;
  mode: "strict" | "standard" | "fluency";
};

export async function analyzeText(payload: AnalyzePayload): Promise<AnalyzeResponse> {
  const response = await fetch(`${API_BASE}/v1/analyze/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Text analysis failed (${response.status})`);
  }

  return response.json();
}

export async function analyzeImage(file: File, options: Omit<AnalyzePayload, "text">): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("sourceLang", options.sourceLang);
  form.append("explanationLang", options.explanationLang);
  form.append("mode", options.mode);

  const response = await fetch(`${API_BASE}/v1/analyze/image`, {
    method: "POST",
    body: form
  });

  if (!response.ok) {
    throw new Error(`Image analysis failed (${response.status})`);
  }

  return response.json();
}

export async function analyzeFile(file: File, options: Omit<AnalyzePayload, "text">): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("sourceLang", options.sourceLang);
  form.append("explanationLang", options.explanationLang);
  form.append("mode", options.mode);

  const response = await fetch(`${API_BASE}/v1/analyze/file`, {
    method: "POST",
    body: form
  });

  if (!response.ok) {
    throw new Error(`File analysis failed (${response.status})`);
  }

  return response.json();
}

export async function applySuggestions(text: string, issueIds: string[], strategy: "safe" | "all", sessionId?: string) {
  const response = await fetch(`${API_BASE}/v1/suggestions/apply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionId ? { "x-session-id": sessionId } : {})
    },
    body: JSON.stringify({ text, issueIds, strategy })
  });

  if (!response.ok) {
    throw new Error(`Apply failed (${response.status})`);
  }

  return response.json() as Promise<{ patchedText: string; applied: string[]; skipped: string[] }>;
}
