"use client";

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { analyzeFile, analyzeText, applySuggestions } from "@/lib/api";
import { AnalyzeResponse, SupportedLang } from "@/lib/types";
import { AnalysisView } from "@/components/analysis-view";
import { BgVirtualKeyboard } from "@/components/bg-virtual-keyboard";
import { IssueList } from "@/components/issue-list";
import { BgTransliterationMode, transliterateLastLatinWord, transliterateLatinToBgText } from "@/lib/bg-transliteration";

const sourceLangs: Array<{ label: string; value: "auto" | SupportedLang }> = [
  { label: "Auto", value: "auto" },
  { label: "English", value: "en" },
  { label: "Turkish", value: "tr" },
  { label: "Bulgarian", value: "bg" }
];

const explanationLangs: Array<{ label: string; value: "same" | SupportedLang }> = [
  { label: "Same as source", value: "same" },
  { label: "English", value: "en" },
  { label: "Turkish", value: "tr" },
  { label: "Bulgarian", value: "bg" }
];

export function Analyzer() {
  const [inputText, setInputText] = useState("");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIssueId, setActiveIssueId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [sourceLang, setSourceLang] = useState<"auto" | SupportedLang>("auto");
  const [explanationLang, setExplanationLang] = useState<"same" | SupportedLang>("same");
  const [mode, setMode] = useState<"strict" | "standard" | "fluency">("standard");
  const [dragActive, setDragActive] = useState(false);
  const [savedWords, setSavedWords] = useState<string[]>([]);
  const [quizWords, setQuizWords] = useState<string[]>([]);
  const [enableBgKeyboard, setEnableBgKeyboard] = useState(false);
  const [autoTransliterateBg, setAutoTransliterateBg] = useState(false);
  const [bgTranslitMode, setBgTranslitMode] = useState<BgTransliterationMode>("phonetic");
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const displayText = result?.extractedText ?? inputText;
  const activeIssue = useMemo(() => result?.issues.find((i) => i.id === activeIssueId), [result, activeIssueId]);

  async function runTextAnalysis() {
    if (!inputText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await analyzeText({ text: inputText, sourceLang, explanationLang, mode });
      setResult(response);
      setActiveIssueId(response.issues[0]?.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  async function runFileAnalysis(file: File) {
    setLoading(true);
    setError(null);
    try {
      const response = await analyzeFile(file, { sourceLang, explanationLang, mode });
      setInputText(response.extractedText ?? "");
      setResult(response);
      setActiveIssueId(response.issues[0]?.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  async function captureScreenshotAndAnalyze() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      const imageCapture = new ImageCapture(track);
      const bitmap = await imageCapture.grabFrame();
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");
      ctx.drawImage(bitmap, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      track.stop();
      stream.getTracks().forEach((t) => t.stop());

      if (!blob) throw new Error("Screenshot capture failed");
      await runFileAnalysis(new File([blob], "screenshot.png", { type: "image/png" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Screenshot failed");
    }
  }

  function onDropFiles(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    void runFileAnalysis(file);
  }

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items?.length) return;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            void runFileAnalysis(file);
            return;
          }
        }
      }
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [sourceLang, explanationLang, mode]);

  async function applyAll(strategy: "safe" | "all") {
    if (!result || !displayText) return;

    setLoading(true);
    setError(null);
    try {
      const response = await applySuggestions(
        displayText,
        result.issues.map((i) => i.id),
        strategy,
        result.sessionId
      );
      setInputText(response.patchedText);
      const reanalyzed = await analyzeText({ text: response.patchedText, sourceLang, explanationLang, mode });
      setResult(reanalyzed);
      setActiveIssueId(reanalyzed.issues[0]?.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setLoading(false);
    }
  }

  function saveWord(word: string) {
    setSavedWords((prev) => (prev.includes(word) ? prev : [word, ...prev].slice(0, 20)));
  }

  function addQuizWord(word: string) {
    setQuizWords((prev) => (prev.includes(word) ? prev : [word, ...prev].slice(0, 20)));
  }

  function insertAtCursor(value: string) {
    const el = textAreaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? inputText.length;
    const end = el.selectionEnd ?? inputText.length;
    const next = inputText.slice(0, start) + value + inputText.slice(end);
    setInputText(next);

    requestAnimationFrame(() => {
      el.focus();
      const caret = start + value.length;
      el.setSelectionRange(caret, caret);
    });
  }

  function backspaceAtCursor() {
    const el = textAreaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? inputText.length;
    const end = el.selectionEnd ?? inputText.length;
    if (start !== end) {
      const next = inputText.slice(0, start) + inputText.slice(end);
      setInputText(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start, start);
      });
      return;
    }

    if (start <= 0) return;
    const next = inputText.slice(0, start - 1) + inputText.slice(start);
    setInputText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start - 1, start - 1);
    });
  }

  function handleTextKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (sourceLang !== "bg" || !autoTransliterateBg) return;
    if (e.key !== " " && e.key !== "Enter" && e.key !== "Tab") return;

    const el = e.currentTarget;
    const caret = el.selectionStart ?? inputText.length;
    const { text, caret: nextCaret } = transliterateLastLatinWord(inputText, caret, bgTranslitMode);
    if (text !== inputText) {
      setInputText(text);
      requestAnimationFrame(() => {
        el.setSelectionRange(nextCaret, nextCaret);
      });
    }
  }

  function transliterateWholeText() {
    setInputText((prev) => transliterateLatinToBgText(prev, bgTranslitMode));
  }

  useEffect(() => {
    if (sourceLang !== "bg") {
      setEnableBgKeyboard(false);
      setAutoTransliterateBg(false);
    }
  }, [sourceLang]);

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-[1400px] mx-auto">
        <header className="mb-6 md:mb-8">
          <p className="text-xs uppercase tracking-[0.25em] text-ink/60">Polyglot Writing Coach</p>
          <h1 className="font-[var(--font-heading)] text-4xl md:text-6xl leading-tight text-ink">Write Better. Learn Faster.</h1>
          <p className="mt-2 text-black/65 max-w-2xl">
            Grammar correction in original language, explanations in your chosen language, and focused learning cards.
          </p>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-6">
          <section className="card p-4 md:p-5 xl:col-span-3">
            <h2 className="font-semibold text-lg">Input</h2>
            <div
              className={`mt-3 rounded-2xl border-2 border-dashed p-3 transition ${dragActive ? "border-cool bg-cool/5" : "border-black/15 bg-white/40"}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                onDropFiles(e.dataTransfer.files);
              }}
            >
              <p className="text-xs text-black/55 mb-2">Write directly, paste text, drag-and-drop files, or open anything.</p>
              <textarea
                ref={textAreaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleTextKeyDown}
                className="w-full min-h-[220px] rounded-xl border border-black/10 bg-white p-3 outline-none focus:ring-2 focus:ring-cool/40"
                placeholder="Write directly or paste your text here..."
              />
            </div>

            {sourceLang === "bg" ? (
              <div className="mt-2 rounded-xl border border-black/10 bg-white p-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setEnableBgKeyboard((v) => !v)}
                    className={`rounded-lg px-2 py-1 text-xs border ${enableBgKeyboard ? "bg-ink text-white border-ink" : "bg-white border-black/15"}`}
                  >
                    {enableBgKeyboard ? "Hide BG keyboard" : "Show BG keyboard"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoTransliterateBg((v) => !v)}
                    className={`rounded-lg px-2 py-1 text-xs border ${autoTransliterateBg ? "bg-cool text-white border-cool" : "bg-white border-black/15"}`}
                  >
                    {autoTransliterateBg ? "Auto transliteration ON" : "Auto transliteration OFF"}
                  </button>
                  <button type="button" onClick={transliterateWholeText} className="rounded-lg px-2 py-1 text-xs border border-black/15 bg-white">
                    Convert Latin to Cyrillic
                  </button>
                  <select
                    value={bgTranslitMode}
                    onChange={(e) => setBgTranslitMode(e.target.value as BgTransliterationMode)}
                    className="rounded-lg px-2 py-1 text-xs border border-black/15 bg-white"
                  >
                    <option value="phonetic">Phonetic mode</option>
                    <option value="bds_like">BDS-like mode</option>
                  </select>
                </div>
                <p className="mt-2 text-[11px] text-black/55">Useful for Q keyboard users writing Bulgarian without native Cyrillic layout.</p>
                {enableBgKeyboard ? (
                  <BgVirtualKeyboard onInsert={insertAtCursor} onBackspace={backspaceAtCursor} onSpace={() => insertAtCursor(" ")} />
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
              <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value as "auto" | SupportedLang)} className="rounded-lg border border-black/10 bg-white px-2 py-2 text-sm">
                {sourceLangs.map((lang) => <option key={lang.value} value={lang.value}>{lang.label}</option>)}
              </select>
              <select value={explanationLang} onChange={(e) => setExplanationLang(e.target.value as "same" | SupportedLang)} className="rounded-lg border border-black/10 bg-white px-2 py-2 text-sm">
                {explanationLangs.map((lang) => <option key={lang.value} value={lang.value}>{lang.label}</option>)}
              </select>
            </div>

            <select value={mode} onChange={(e) => setMode(e.target.value as "strict" | "standard" | "fluency")} className="w-full rounded-lg border border-black/10 bg-white px-2 py-2 text-sm mt-2">
              <option value="strict">Strict</option>
              <option value="standard">Standard</option>
              <option value="fluency">Fluency</option>
            </select>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
              <button type="button" disabled={loading} onClick={runTextAnalysis} className="rounded-xl bg-ink text-white px-3 py-2 text-sm font-medium disabled:opacity-50">{loading ? "Analyzing..." : "Analyze text"}</button>
              <label className="rounded-xl bg-cool text-white px-3 py-2 text-sm font-medium cursor-pointer text-center">
                Open anything
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.tiff,.gif,.txt,.md,.csv,.rtf,.json,.xml,.yaml,.yml,.docx,image/*,text/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) runFileAnalysis(file);
                  }}
                />
              </label>
            </div>

            <button type="button" onClick={captureScreenshotAndAnalyze} className="mt-2 w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm font-medium">
              Capture screenshot
            </button>

            {error ? <p className="mt-3 text-sm text-warn">{error}</p> : null}
          </section>

          <section className="card p-4 md:p-5 xl:col-span-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-lg">Text Workspace</h2>
              <div className="flex gap-2">
                <button type="button" onClick={() => applyAll("safe")} className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-xs">Apply safe fixes</button>
                <button type="button" onClick={() => applyAll("all")} className="rounded-lg bg-accent text-white px-3 py-1.5 text-xs">Apply all</button>
              </div>
            </div>
            <p className="text-xs text-black/55 mt-2">Tap any word in corrected text to open dictionary and usage insights.</p>
            <div className="mt-2">
              <AnalysisView
                sourceText={displayText}
                result={result}
                activeIssueId={activeIssueId}
                onPickIssue={setActiveIssueId}
                onSaveWord={saveWord}
                onAddToQuiz={addQuizWord}
              />
            </div>
            {result?.warnings?.length ? (
              <ul className="mt-3 text-xs text-black/55 list-disc pl-5">
                {result.warnings.map((w, idx) => <li key={`${w}-${idx}`}>{w}</li>)}
              </ul>
            ) : null}
          </section>

          <aside className="card p-4 md:p-5 xl:col-span-3">
            <h2 className="font-semibold text-lg">Coach</h2>
            <p className="text-xs uppercase tracking-wide text-black/45 mt-1">Issues</p>
            <div className="mt-2">
              <IssueList issues={result?.issues ?? []} activeIssueId={activeIssueId} onSelect={setActiveIssueId} />
            </div>

            {activeIssue ? (
              <div className="mt-4 rounded-xl border border-black/10 bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-black/45">Selected</p>
                <p className="text-sm mt-1">Original: <b>{activeIssue.original}</b></p>
                <p className="text-sm">Best suggestion: <b>{activeIssue.replacements[0] ?? "n/a"}</b></p>
              </div>
            ) : null}

            <p className="text-xs uppercase tracking-wide text-black/45 mt-4">Learning cards</p>
            <div className="mt-2 space-y-2 max-h-[220px] overflow-auto pr-1">
              {result?.learningCards?.map((card, idx) => (
                <div key={`${card.title}-${idx}`} className="rounded-xl border border-black/10 bg-white p-3">
                  <p className="font-semibold text-sm">{card.title}</p>
                  <p className="text-xs text-black/65 mt-1">{card.shortRule}</p>
                </div>
              ))}
            </div>

            <p className="text-xs uppercase tracking-wide text-black/45 mt-4">Session summary</p>
            <div className="mt-2 rounded-xl border border-black/10 bg-white p-3 text-sm">
              <p className="font-medium">Top mistakes</p>
              <ul className="list-disc pl-5 text-xs text-black/65 mt-1">
                {(result?.sessionSummary.topMistakes ?? []).map((item) => <li key={item}>{item}</li>)}
              </ul>
              <p className="font-medium mt-3">Next practice</p>
              <p className="text-xs text-black/65 mt-1">{result?.sessionSummary.nextPractice ?? "Analyze text to get recommendations."}</p>
            </div>

            <p className="text-xs uppercase tracking-wide text-black/45 mt-4">Saved vocabulary</p>
            <div className="mt-2 rounded-xl border border-black/10 bg-white p-3">
              {!savedWords.length ? (
                <p className="text-xs text-black/55">Tap words in corrected text and save them for revision.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {savedWords.map((word) => (
                    <span key={word} className="rounded-full bg-ink/10 px-2 py-1 text-xs">{word}</span>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs uppercase tracking-wide text-black/45 mt-4">Quiz queue</p>
            <div className="mt-2 rounded-xl border border-black/10 bg-white p-3">
              {!quizWords.length ? (
                <p className="text-xs text-black/55">Use popup action \"Add to quiz\" on any corrected word.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {quizWords.map((word) => (
                    <span key={word} className="rounded-full bg-cool/15 px-2 py-1 text-xs">{word}</span>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
