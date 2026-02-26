"use client";

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { analyzeFile, analyzeText, applySuggestions, checkBackendHealth } from "@/lib/api";
import { AnalyzeResponse, SupportedLang } from "@/lib/types";
import { AnalysisView } from "@/components/analysis-view";
import { BgVirtualKeyboard } from "@/components/bg-virtual-keyboard";
import { IssueList } from "@/components/issue-list";
import { BgTransliterationMode, transliterateLastLatinWord, transliterateLatinToBgText } from "@/lib/bg-transliteration";
import {
  createPlainBackup,
  decryptLearningBackup,
  encryptLearningBackup,
  EncryptedLearningBackup,
  extractPlainBackupPayload,
  isEncryptedBackup,
  LearningBackupPayload
} from "@/lib/learning-backup";
import { categoryLabel } from "@/lib/labels";

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
  const [backendUp, setBackendUp] = useState<boolean | null>(null);
  const [sourceLang, setSourceLang] = useState<"auto" | SupportedLang>("auto");
  const [explanationLang, setExplanationLang] = useState<"same" | SupportedLang>("same");
  const [mode, setMode] = useState<"strict" | "standard" | "fluency">("standard");
  const [dragActive, setDragActive] = useState(false);
  const [savedWords, setSavedWords] = useState<string[]>([]);
  const [quizWords, setQuizWords] = useState<string[]>([]);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [backupMode, setBackupMode] = useState<"export" | "import">("export");
  const [backupPin, setBackupPin] = useState("");
  const [backupEncrypt, setBackupEncrypt] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [pendingEncryptedBackup, setPendingEncryptedBackup] = useState<EncryptedLearningBackup | null>(null);
  const [isClientReady, setIsClientReady] = useState(false);
  const [enableBgKeyboard, setEnableBgKeyboard] = useState(false);
  const [autoTransliterateBg, setAutoTransliterateBg] = useState(false);
  const [bgTranslitMode, setBgTranslitMode] = useState<BgTransliterationMode>("phonetic");
  const [installPromptEvent, setInstallPromptEvent] = useState<Event | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const autoAnalyzeTimerRef = useRef<number | null>(null);
  const lastAutoAnalyzedRef = useRef<string>("");

  const displayText = result?.extractedText ?? inputText;
  const activeIssue = useMemo(() => result?.issues.find((i) => i.id === activeIssueId), [result, activeIssueId]);

  async function runTextAnalysis() {
    if (!inputText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await analyzeText({ text: inputText, sourceLang, explanationLang, mode });
      setBackendUp(true);
      setResult(response);
      setActiveIssueId(response.issues[0]?.id);
      lastAutoAnalyzedRef.current = `${inputText}::${sourceLang}::${explanationLang}::${mode}`;
    } catch (e) {
      setBackendUp(false);
      setResult(null);
      setActiveIssueId(undefined);
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
      setBackendUp(true);
      const nextText = response.extractedText ?? "";
      setInputText(nextText);
      setResult(response);
      setActiveIssueId(response.issues[0]?.id);
      lastAutoAnalyzedRef.current = `${nextText}::${sourceLang}::${explanationLang}::${mode}`;
    } catch (e) {
      setBackendUp(false);
      setResult(null);
      setActiveIssueId(undefined);
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  async function captureScreenshotAndAnalyze() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      const ImageCaptureCtor = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { grabFrame: () => Promise<ImageBitmap> } }).ImageCapture;
      if (!ImageCaptureCtor) {
        throw new Error("ImageCapture is not supported in this browser");
      }
      const imageCapture = new ImageCaptureCtor(track);
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
      setResult(null);
      setActiveIssueId(undefined);
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
      setResult(null);
      setActiveIssueId(undefined);
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

  async function installApp() {
    const promptEvent = installPromptEvent as (Event & { prompt?: () => Promise<void>; userChoice?: Promise<{ outcome: string }> }) | null;
    if (!promptEvent?.prompt) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setInstallPromptEvent(null);
  }

  function openBackupExportModal() {
    setBackupMode("export");
    setBackupEncrypt(false);
    setBackupPin("");
    setBackupNotice(null);
    setBackupModalOpen(true);
  }

  async function backupLearningData() {
    const payload: LearningBackupPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      savedWords,
      quizWords
    };
    if (backupEncrypt && backupPin.trim().length < 4) {
      setBackupNotice("PIN must be at least 4 characters.");
      return;
    }
    setBackupBusy(true);
    setBackupNotice(null);
    try {
      const data = backupEncrypt ? await encryptLearningBackup(payload, backupPin.trim()) : await createPlainBackup(payload);
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const suffix = backupEncrypt ? "secure" : "plain";
      const fileName = `polyglot-learning-data-${suffix}-${new Date().toISOString().slice(0, 10)}.json`;
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean; share?: (data: ShareData) => Promise<void> };
      const file = new File([blob], fileName, { type: "application/json" });

      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: "Polyglot learning data" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }

      localStorage.setItem("pwc_last_backup_at", payload.exportedAt);
      setLastBackupAt(payload.exportedAt);
      setBackupModalOpen(false);
      setBackupPin("");
    } catch (e) {
      setBackupNotice(e instanceof Error ? e.message : "Backup failed.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function restoreLearningData(file: File) {
    const raw = await file.text();
    const parsed = JSON.parse(raw) as unknown;
    if (isEncryptedBackup(parsed)) {
      setPendingEncryptedBackup(parsed);
      setBackupMode("import");
      setBackupPin("");
      setBackupNotice(null);
      setBackupModalOpen(true);
      return;
    }

    const finalPayload = await extractPlainBackupPayload(parsed);
    const nextSaved = Array.isArray(finalPayload.savedWords) ? finalPayload.savedWords.filter((v): v is string => typeof v === "string").slice(0, 20) : [];
    const nextQuiz = Array.isArray(finalPayload.quizWords) ? finalPayload.quizWords.filter((v): v is string => typeof v === "string").slice(0, 20) : [];
    setSavedWords(nextSaved);
    setQuizWords(nextQuiz);
  }

  async function restoreEncryptedBackupWithPin() {
    if (!pendingEncryptedBackup) return;
    if (backupPin.trim().length < 4) {
      setBackupNotice("Enter the backup PIN.");
      return;
    }

    setBackupBusy(true);
    setBackupNotice(null);
    try {
      const payload = await decryptLearningBackup(pendingEncryptedBackup, backupPin.trim());
      const nextSaved = payload.savedWords.filter((v): v is string => typeof v === "string").slice(0, 20);
      const nextQuiz = payload.quizWords.filter((v): v is string => typeof v === "string").slice(0, 20);
      setSavedWords(nextSaved);
      setQuizWords(nextQuiz);
      setPendingEncryptedBackup(null);
      setBackupModalOpen(false);
      setBackupPin("");
    } catch {
      setBackupNotice("PIN incorrect or backup file is corrupted.");
    } finally {
      setBackupBusy(false);
    }
  }

  function formatBackupAge(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) return "just now";
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
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

  useEffect(() => {
    const rawSavedWords = localStorage.getItem("pwc_saved_words");
    const rawQuizWords = localStorage.getItem("pwc_quiz_words");
    if (rawSavedWords) {
      try {
        const parsed = JSON.parse(rawSavedWords);
        if (Array.isArray(parsed)) setSavedWords(parsed.filter((v) => typeof v === "string").slice(0, 20));
      } catch {}
    }
    if (rawQuizWords) {
      try {
        const parsed = JSON.parse(rawQuizWords);
        if (Array.isArray(parsed)) setQuizWords(parsed.filter((v) => typeof v === "string").slice(0, 20));
      } catch {}
    }
    const last = localStorage.getItem("pwc_last_backup_at");
    if (last) setLastBackupAt(last);
  }, []);

  useEffect(() => {
    localStorage.setItem("pwc_saved_words", JSON.stringify(savedWords));
  }, [savedWords]);

  useEffect(() => {
    localStorage.setItem("pwc_quiz_words", JSON.stringify(quizWords));
  }, [quizWords]);

  useEffect(() => {
    if (!inputText.trim()) return;
    if (loading) return;

    const signature = `${inputText}::${sourceLang}::${explanationLang}::${mode}`;
    if (signature === lastAutoAnalyzedRef.current) return;

    if (autoAnalyzeTimerRef.current) {
      window.clearTimeout(autoAnalyzeTimerRef.current);
    }

    autoAnalyzeTimerRef.current = window.setTimeout(() => {
      lastAutoAnalyzedRef.current = signature;
      void runTextAnalysis();
    }, 900);

    return () => {
      if (autoAnalyzeTimerRef.current) window.clearTimeout(autoAnalyzeTimerRef.current);
    };
  }, [inputText, sourceLang, explanationLang, mode]);

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      const ok = await checkBackendHealth();
      if (!cancelled) setBackendUp(ok);
    };
    void probe();
    const timer = window.setInterval(() => {
      void probe();
    }, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    setIsClientReady(true);
  }, []);

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
            <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-2 py-1 text-[11px]">
              <span
                className={
                  backendUp === null
                    ? "inline-block h-2 w-2 rounded-full bg-black/25"
                    : backendUp
                      ? "inline-block h-2 w-2 rounded-full bg-emerald-500"
                      : "inline-block h-2 w-2 rounded-full bg-rose-500"
                }
              />
              <span className="text-black/65">
                {backendUp === null ? "Backend status checking..." : backendUp ? "Backend connected" : "Backend disconnected"}
              </span>
            </div>
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
            <p className="mt-2 text-[11px] text-black/50">Auto-analysis runs shortly after you stop typing.</p>

            <button type="button" onClick={captureScreenshotAndAnalyze} className="mt-2 w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm font-medium">
              Capture screenshot
            </button>

            {installPromptEvent ? (
              <button type="button" onClick={() => void installApp()} className="mt-2 w-full rounded-xl border border-cool/35 bg-cool/10 px-3 py-2 text-sm font-medium text-ink">
                Install app
              </button>
            ) : null}

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
              <IssueList
                issues={result?.issues ?? []}
                activeIssueId={activeIssueId}
                hasResult={Boolean(result)}
                hasError={Boolean(error)}
                onSelect={setActiveIssueId}
              />
            </div>

            {activeIssue ? (
              <div className="mt-4 rounded-xl border border-black/10 bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-black/45">Selected</p>
                <p className="text-xs text-black/55 mt-1">{categoryLabel(activeIssue.category)}</p>
                <p className="text-sm mt-1">Original: <b>{activeIssue.original}</b></p>
                <p className="text-sm">Best suggestion: <b>{activeIssue.replacements[0] ?? "n/a"}</b></p>
              </div>
            ) : null}

            <p className="text-xs uppercase tracking-wide text-black/45 mt-4">Sentence rewrites</p>
            <div className="mt-2 rounded-xl border border-black/10 bg-white p-3 space-y-2">
              {result?.rewriteSuggestionsDetailed?.length || result?.rewriteSuggestions?.length ? (
                (result?.rewriteSuggestionsDetailed?.length
                  ? result.rewriteSuggestionsDetailed
                  : (result?.rewriteSuggestions ?? []).map((sentence) => {
                      const [maybeLabel, ...rest] = sentence.split(": ");
                      if (rest.length) {
                        return { label: maybeLabel, text: rest.join(": "), confidence: "medium" as const };
                      }
                      return { label: "Rewrite", text: sentence, confidence: "medium" as const };
                    })
                ).map((item, idx) => (
                  <p key={`${item.label}-${item.text}-${idx}`} className="text-sm leading-relaxed">
                    <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-black/15 text-[11px] text-black/55">
                      {idx + 1}
                    </span>
                    <span className="font-medium">{item.label}:</span>{" "}
                    {item.text}{" "}
                    <span
                      className={
                        item.confidence === "safe"
                          ? "inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700"
                          : item.confidence === "aggressive"
                            ? "inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700"
                            : "inline-flex rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700"
                      }
                    >
                      {item.confidence}
                    </span>
                  </p>
                ))
              ) : (
                <p className="text-xs text-black/55">Analyze text to get full-sentence rewrite options.</p>
              )}
            </div>

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
              <p className="mt-3 text-[11px] text-black/55">Progress is auto-saved on this device.</p>
              <p className="mt-1 text-[11px] text-black/55">
                Last backup: {lastBackupAt ? (isClientReady ? formatBackupAge(lastBackupAt) : "recently") : "never"}
              </p>
              {isClientReady && lastBackupAt && Date.now() - new Date(lastBackupAt).getTime() > 1000 * 60 * 60 * 24 * 7 ? (
                <p className="mt-1 text-[11px] text-warn">Backup is older than 7 days. Create a fresh backup.</p>
              ) : null}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={openBackupExportModal}
                  className="rounded-lg border border-black/15 px-2 py-1 text-xs"
                >
                  Backup data
                </button>
                <button
                  type="button"
                  onClick={() => restoreInputRef.current?.click()}
                  className="rounded-lg border border-black/15 px-2 py-1 text-xs"
                >
                  Restore backup
                </button>
              </div>
              <input
                ref={restoreInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void restoreLearningData(file).catch(() => setError("Invalid backup file."));
                  }
                  e.currentTarget.value = "";
                }}
              />
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

        {backupModalOpen ? (
          <div className="fixed inset-0 z-50 bg-black/30 p-0 sm:p-4" onClick={() => (backupBusy ? null : setBackupModalOpen(false))}>
            <div
              className="absolute inset-x-0 bottom-0 w-full rounded-t-3xl border border-black/10 bg-white p-4 shadow-2xl sm:relative sm:inset-auto sm:mx-auto sm:mt-24 sm:max-w-md sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-black/15 sm:hidden" />
              <h3 className="text-lg font-semibold">{backupMode === "export" ? "Create backup" : "Restore encrypted backup"}</h3>
              <p className="mt-1 text-sm text-black/60">
                {backupMode === "export"
                  ? "Use a PIN only if you want encrypted backup."
                  : "Enter the PIN used when this backup file was created."}
              </p>

              {backupMode === "export" ? (
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={backupEncrypt}
                    onChange={(e) => setBackupEncrypt(e.target.checked)}
                  />
                  Encrypt backup with PIN
                </label>
              ) : null}

              {(backupMode === "import" || backupEncrypt) ? (
                <div className="mt-3">
                  <label className="text-xs uppercase tracking-wide text-black/45">PIN</label>
                  <input
                    type="password"
                    value={backupPin}
                    onChange={(e) => setBackupPin(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm"
                    placeholder="Enter PIN"
                  />
                </div>
              ) : null}

              {backupNotice ? <p className="mt-2 text-sm text-warn">{backupNotice}</p> : null}

              <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:justify-end">
                <button
                  type="button"
                  onClick={() => setBackupModalOpen(false)}
                  className="rounded-lg border border-black/15 px-3 py-2 text-sm"
                  disabled={backupBusy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void (backupMode === "export" ? backupLearningData() : restoreEncryptedBackupWithPin())}
                  className="rounded-lg bg-ink px-3 py-2 text-sm text-white disabled:opacity-50"
                  disabled={backupBusy}
                >
                  {backupBusy ? "Working..." : backupMode === "export" ? "Save backup" : "Restore"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
