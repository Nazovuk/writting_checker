import { AnalyzeResponse, SupportedLang, WordInsight } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
const DEFAULT_TIMEOUT_MS = 15000;

type AnalyzePayload = {
  text: string;
  sourceLang: "auto" | SupportedLang;
  explanationLang: "same" | SupportedLang;
  mode: "strict" | "standard" | "fluency";
};

async function parseApiError(response: Response, fallback: string): Promise<never> {
  const body = await response.json().catch(() => null);
  if (body && typeof body.detail === "string") {
    throw new Error(`${body.detail} (${response.status})`);
  }
  if (body && typeof body.detail === "object") {
    throw new Error(`${fallback} (${response.status})`);
  }
  throw new Error(fallback);
}

async function fetchJson<T>(url: string, init: RequestInit, fallback: string, retries = 1): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      clearTimeout(timeout);
      const isLast = attempt === retries;
      if (!isLast) continue;
      const reason = error instanceof DOMException && error.name === "AbortError"
        ? "Request timed out."
        : "Unable to reach backend service.";
      throw new Error(`${reason} Check API connection (${API_BASE}) and ensure backend is running.`);
    }
    clearTimeout(timeout);
    if (!response.ok) {
      return parseApiError(response, `${fallback} (${response.status})`);
    }
    return (await response.json()) as T;
  }
  throw new Error(`Unexpected network error. Check API connection (${API_BASE}).`);
}

export async function analyzeText(payload: AnalyzePayload): Promise<AnalyzeResponse> {
  return fetchJson<AnalyzeResponse>(`${API_BASE}/v1/analyze/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }, "Text analysis failed");
}

export async function analyzeImage(file: File, options: Omit<AnalyzePayload, "text">): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("sourceLang", options.sourceLang);
  form.append("explanationLang", options.explanationLang);
  form.append("mode", options.mode);

  return fetchJson<AnalyzeResponse>(`${API_BASE}/v1/analyze/image`, {
    method: "POST",
    body: form
  }, "Image analysis failed");
}

export async function analyzeFile(file: File, options: Omit<AnalyzePayload, "text">): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("sourceLang", options.sourceLang);
  form.append("explanationLang", options.explanationLang);
  form.append("mode", options.mode);

  return fetchJson<AnalyzeResponse>(`${API_BASE}/v1/analyze/file`, {
    method: "POST",
    body: form
  }, "File analysis failed");
}

export async function applySuggestions(text: string, issueIds: string[], strategy: "safe" | "all", sessionId?: string) {
  return fetchJson<{ patchedText: string; applied: string[]; skipped: string[] }>(`${API_BASE}/v1/suggestions/apply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionId ? { "x-session-id": sessionId } : {})
    },
    body: JSON.stringify({ text, issueIds, strategy })
  }, "Apply failed");
}

export async function fetchWordInsight(token: string, textLang: SupportedLang, explanationLang: SupportedLang): Promise<WordInsight> {
  const params = new URLSearchParams({
    token,
    textLang,
    explanationLang
  });

  return fetchJson<WordInsight>(`${API_BASE}/v1/insights/word?${params.toString()}`, {}, "Word insight failed");
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}
