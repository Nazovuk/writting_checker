"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type TimeFrame = "1A" | "3A" | "6A" | "1Y" | "2Y" | "5Y";
type RiskProfile = "defensive" | "balanced" | "aggressive";
type Tone = "green" | "amber" | "red" | "blue" | "slate";

type Point = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type StockPayload = {
  source: string;
  fetchedAt: string;
  symbol: string;
  name: string;
  exchange: string;
  market: string;
  currency: string;
  quote: {
    price: number | null;
    change: number | null;
    changePercent: number | null;
    volume: number | null;
    marketCap: number | null;
    trailingPE: number | null;
    forwardPE: number | null;
    eps: number | null;
    epsForward: number | null;
    dividendYield: number | null;
    beta: number | null;
    yearLow: number | null;
    yearHigh: number | null;
    analystRating: string | null;
  };
  points: Point[];
};

type ApiError = { error: string };

const frameDays: Record<TimeFrame, number> = { "1A": 30, "3A": 90, "6A": 180, "1Y": 252, "2Y": 504, "5Y": 1260 };
const currencyFormatter = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
const compactFormatter = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 2 });
const percentFormatter = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1, signDisplay: "exceptZero" });

function fmtNumber(value: number | null | undefined, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Veri yok";
  return `${currencyFormatter.format(value)}${suffix}`;
}

function fmtMoney(value: number | null | undefined, currency: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Veri yok";
  return `${currencyFormatter.format(value)} ${currency}`;
}

function fmtCompact(value: number | null | undefined, prefix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Veri yok";
  return `${prefix}${compactFormatter.format(value)}`;
}

function fmtPct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Veri yok";
  return `%${percentFormatter.format(value)}`;
}

function movingAverage(values: number[], period: number) {
  return values.map((_, index) => {
    if (index + 1 < period) return null;
    const slice = values.slice(index + 1 - period, index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / period;
  });
}

function stdDev(values: number[]) {
  if (!values.length) return 0;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length);
}

function getReturns(points: Point[]) {
  return points.slice(1).map((point, index) => point.close / points[index].close - 1).filter(Number.isFinite);
}

function rsi(values: number[], period = 14) {
  if (values.length < period + 1) return 50;
  const changes = values.slice(1).map((value, index) => value - values[index]);
  const recent = changes.slice(-period);
  const gains = recent.filter((value) => value > 0).reduce((sum, value) => sum + value, 0) / period;
  const losses = Math.abs(recent.filter((value) => value < 0).reduce((sum, value) => sum + value, 0) / period);
  if (!losses) return 100;
  return 100 - 100 / (1 + gains / losses);
}

function maxDrawdown(values: number[]) {
  if (!values.length) return 0;
  let peak = values[0];
  let drawdown = 0;
  values.forEach((value) => {
    peak = Math.max(peak, value);
    drawdown = Math.min(drawdown, value / peak - 1);
  });
  return drawdown;
}

function quantile(values: number[], q: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.floor((sorted.length - 1) * q))];
}

function toneBorder(tone: Tone) {
  return {
    green: "border-emerald-400/80 shadow-[inset_4px_0_0_rgba(52,211,153,0.95)]",
    amber: "border-amber-400/70 shadow-[inset_4px_0_0_rgba(251,191,36,0.95)]",
    red: "border-rose-400/80 shadow-[inset_4px_0_0_rgba(251,113,133,0.95)]",
    blue: "border-blue-400/70 shadow-[inset_4px_0_0_rgba(96,165,250,0.95)]",
    slate: "border-slate-700"
  }[tone];
}

function Sparkline({ data, color = "#34d399", height = 90 }: { data: number[]; color?: string; height?: number }) {
  const safeData = data.length ? data : [0, 1];
  const min = Math.min(...safeData);
  const max = Math.max(...safeData);
  const spread = max - min || 1;
  const path = safeData.map((value, index) => {
    const x = (index / Math.max(1, safeData.length - 1)) * 100;
    const y = height - ((value - min) / spread) * height;
    return `${index ? "L" : "M"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 100 ${height}`} className="h-full w-full overflow-visible" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${path} L 100 ${height} L 0 ${height} Z`} fill={color} opacity="0.12" />
      <path d={path} fill="none" stroke={color} strokeWidth="2.7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function SectionTitle({ number, title }: { number: string; title: string }) {
  return (
    <div className="mb-5 border-b border-slate-700 pb-3">
      <h2 className="text-sm font-black uppercase tracking-[0.34em] text-slate-400">
        <span className="mr-4 text-emerald-400">{number}</span>{title}
      </h2>
    </div>
  );
}

function MetricCard({ title, value, detail, tone = "slate" }: { title: string; value: string; detail: string; tone?: Tone }) {
  const valueColor = tone === "green" ? "text-emerald-400" : tone === "red" ? "text-rose-400" : tone === "blue" ? "text-blue-400" : tone === "amber" ? "text-amber-400" : "text-slate-100";
  return (
    <div className={`rounded-lg border bg-slate-900/80 p-5 ${toneBorder(tone)}`}>
      <p className="text-xs font-black uppercase tracking-[0.26em] text-slate-400">{title}</p>
      <p className={`mt-5 text-2xl font-black md:text-3xl ${valueColor}`}>{value}</p>
      <p className="mt-4 text-sm font-semibold text-slate-400">{detail}</p>
    </div>
  );
}

function InsightBox({ label = "Yani:", children, tone = "blue" }: { label?: string; children: React.ReactNode; tone?: Tone }) {
  return (
    <div className={`rounded-lg border bg-slate-950/70 p-5 text-lg leading-8 text-slate-300 ${toneBorder(tone)}`}>
      <p className={tone === "green" ? "text-sm font-black uppercase tracking-[0.18em] text-emerald-400" : "text-sm font-black uppercase tracking-[0.18em] text-blue-400"}>{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function DataPill({ children, tone = "blue" }: { children: React.ReactNode; tone?: Tone }) {
  const classes = tone === "red"
    ? "border-rose-500/50 bg-rose-500/15 text-rose-300"
    : tone === "amber"
      ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
      : "border-blue-500/50 bg-blue-500/15 text-blue-300";
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wider ${classes}`}>{children}</span>;
}

function calcAnalysis(data: StockPayload, benchmark?: StockPayload, timeFrame: TimeFrame = "1Y", riskProfile: RiskProfile = "balanced") {
  const points = data.points.slice(-frameDays[timeFrame]);
  const closes = points.map((point) => point.close);
  const volumes = points.map((point) => point.volume);
  const returns = getReturns(points);
  const first = points[0];
  const last = points.at(-1) ?? points[points.length - 1];
  const ma20 = movingAverage(closes, 20).at(-1) ?? last.close;
  const ma50 = movingAverage(closes, 50).at(-1) ?? last.close;
  const change = first ? last.close / first.close - 1 : 0;
  const dailyVol = stdDev(returns);
  const annualVol = dailyVol * Math.sqrt(252);
  const avgReturn = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  const drawdown = maxDrawdown(closes);
  const var95 = quantile(returns, 0.05);
  const rsiValue = rsi(closes);
  const support = Math.min(...closes.slice(-30));
  const resistance = Math.max(...closes.slice(-30));
  const yearLow = Math.min(...closes.slice(-252));
  const yearHigh = Math.max(...closes.slice(-252));
  const downside = stdDev(returns.filter((value) => value < 0).length ? returns.filter((value) => value < 0) : returns);
  const sharpe = (avgReturn * 252 - 0.035) / (annualVol || 1);
  const sortino = (avgReturn * 252 - 0.035) / (downside * Math.sqrt(252) || 1);
  const benchmarkPoints = benchmark?.points.slice(-frameDays[timeFrame]) ?? [];
  const benchmarkChange = benchmarkPoints.length > 2 ? benchmarkPoints.at(-1)!.close / benchmarkPoints[0].close - 1 : 0;
  const relative = change - benchmarkChange;
  const pe = data.quote.forwardPE ?? data.quote.trailingPE ?? 24;
  const beta = data.quote.beta ?? Math.max(0.65, Math.min(2.4, annualVol / 0.19));
  const epsGrowthProxy = data.quote.epsForward && data.quote.eps ? (data.quote.epsForward / Math.max(0.01, data.quote.eps) - 1) * 100 : relative * 120;
  const trendScore = Math.max(0, Math.min(100,
    50 +
    (last.close > ma20 ? 13 : -11) +
    (last.close > ma50 ? 12 : -10) +
    (rsiValue > 45 && rsiValue < 68 ? 10 : rsiValue >= 72 ? -9 : -5) +
    (relative > 0 ? 12 : -8) +
    (drawdown > -0.16 ? 8 : -10)
  ));
  const fundamentalScore = Math.max(0, Math.min(100, 58 + epsGrowthProxy * 0.6 - pe * 0.35 + (data.quote.dividendYield ?? 0) * 90));
  const riskScore = Math.max(0, Math.min(100, 88 - annualVol * 100 - Math.abs(drawdown) * 75 - beta * 6));
  const totalScore = Math.round(trendScore * 0.43 + fundamentalScore * 0.27 + riskScore * 0.3);
  const verdict = totalScore >= 72 ? "Güçlü al / taşı" : totalScore >= 58 ? "Biriktir" : totalScore >= 45 ? "Nötr / bekle" : "Risk yüksek";
  const target = last.close * (1 + (totalScore - 48) / 210 + Math.max(-0.04, epsGrowthProxy / 1500));
  const stop = Math.max(support * 0.985, last.close * (1 - Math.max(0.055, annualVol / 2.8)));
  const allocationBase = riskProfile === "defensive" ? 0.1 : riskProfile === "balanced" ? 0.18 : 0.28;
  const allocation = Math.max(0.02, Math.min(0.42, allocationBase * (totalScore / 62) * (riskScore / 70)));
  const expectedMove = Math.max(2.5, Math.min(18, annualVol * 100 / Math.sqrt(12)));

  return {
    points,
    closes,
    volumes,
    last,
    change,
    ma20,
    ma50,
    annualVol,
    sharpe,
    sortino,
    drawdown,
    var95,
    rsiValue,
    support,
    resistance,
    yearLow,
    yearHigh,
    relative,
    pe,
    beta,
    epsGrowthProxy,
    trendScore,
    fundamentalScore,
    riskScore,
    totalScore,
    verdict,
    target,
    stop,
    allocation,
    expectedMove
  };
}

async function fetchStock(symbol: string, range: TimeFrame, signal?: AbortSignal): Promise<StockPayload> {
  const response = await fetch(`/api/stock?symbol=${encodeURIComponent(symbol)}&range=${range}`, { signal });
  const payload = await response.json() as StockPayload | ApiError;
  if (!response.ok || "error" in payload) {
    throw new Error("error" in payload ? payload.error : "Canlı veri alınamadı.");
  }
  return payload;
}

export function Analyzer() {
  const [symbolInput, setSymbolInput] = useState("NVDA");
  const [activeSymbol, setActiveSymbol] = useState("NVDA");
  const [benchmarkInput, setBenchmarkInput] = useState("^GSPC");
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("1Y");
  const [riskProfile, setRiskProfile] = useState<RiskProfile>("balanced");
  const [stock, setStock] = useState<StockPayload | null>(null);
  const [benchmark, setBenchmark] = useState<StockPayload | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>(["NVDA", "AAPL", "MSFT", "THYAO.IS", "GARAN.IS"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportSaved, setReportSaved] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("stocklab_live_watchlist");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) setWatchlist(parsed.filter((item) => typeof item === "string").slice(0, 8));
      } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("stocklab_live_watchlist", JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [stockData, benchmarkData] = await Promise.all([
          fetchStock(activeSymbol, timeFrame, controller.signal),
          fetchStock(benchmarkInput, timeFrame, controller.signal).catch(() => null)
        ]);
        setStock(stockData);
        setBenchmark(benchmarkData);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Canlı veri alınamadı.");
          setStock(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [activeSymbol, benchmarkInput, timeFrame]);

  const analysis = useMemo(() => stock ? calcAnalysis(stock, benchmark ?? undefined, timeFrame, riskProfile) : null, [stock, benchmark, timeFrame, riskProfile]);

  function submitSymbol(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = symbolInput.trim().toUpperCase();
    if (!next) return;
    setActiveSymbol(next);
  }

  function addToWatchlist() {
    const next = activeSymbol.trim().toUpperCase();
    if (!next) return;
    setWatchlist((current) => current.includes(next) ? current : [next, ...current].slice(0, 8));
  }

  function saveReport() {
    if (!stock || !analysis) return;
    const report = {
      symbol: stock.symbol,
      name: stock.name,
      source: stock.source,
      fetchedAt: stock.fetchedAt,
      verdict: analysis.verdict,
      totalScore: analysis.totalScore,
      price: analysis.last.close,
      target: analysis.target,
      stop: analysis.stop,
      allocation: analysis.allocation,
      metrics: {
        change: analysis.change,
        annualVol: analysis.annualVol,
        sharpe: analysis.sharpe,
        sortino: analysis.sortino,
        drawdown: analysis.drawdown,
        var95: analysis.var95,
        rsi: analysis.rsiValue,
        relative: analysis.relative
      }
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${stock.symbol.replaceAll(".", "-")}-canli-analiz.json`;
    link.click();
    URL.revokeObjectURL(url);
    setReportSaved(true);
    window.setTimeout(() => setReportSaved(false), 2200);
  }

  const positive = (analysis?.change ?? 0) >= 0;
  const currency = stock?.currency ?? "USD";
  const generatedAt = stock ? new Date(stock.fetchedAt).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" }) : "";

  return (
    <main className="min-h-screen bg-[#0b1016] text-slate-100">
      <div className="mx-auto max-w-[1560px] px-4 py-6 md:px-8">
        <header className="rounded-xl border border-slate-700 bg-slate-900/90 p-5 shadow-2xl">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.34em] text-slate-400">Canlı veri destekli sade not</p>
              <h1 className="mt-3 text-4xl font-black tracking-normal md:text-6xl">{stock?.name ?? activeSymbol} ({activeSymbol})</h1>
              <p className="mt-4 text-lg font-bold text-slate-400">
                Fiyat: <span className="text-slate-100">{analysis ? fmtMoney(analysis.last.close, currency) : "Yükleniyor"}</span>
                <span className={positive ? "ml-2 text-emerald-400" : "ml-2 text-rose-400"}>Gün: {stock?.quote.changePercent != null ? fmtPct(stock.quote.changePercent) : analysis ? fmtPct(analysis.change * 100) : "..."}</span>
                <span className="ml-2">{stock?.quote.marketCap ? `Şirket büyüklüğü: ${fmtCompact(stock.quote.marketCap, currency === "USD" ? "$" : "")}` : `Hacim: ${fmtCompact(stock?.quote.volume ?? analysis?.last.volume)}`}</span>
              </p>
            </div>
            <form onSubmit={submitSymbol} className="grid gap-2 sm:grid-cols-[1fr_120px_120px_120px_auto] xl:min-w-[680px]">
              <label className="text-xs font-black uppercase tracking-widest text-slate-400">
                Hisse yaz
                <input value={symbolInput} onChange={(event) => setSymbolInput(event.target.value)} className="mt-2 h-12 w-full rounded-md border border-slate-700 bg-slate-950 px-4 text-lg font-black text-white outline-none ring-emerald-400/30 focus:ring-4" placeholder="NVDA" />
              </label>
              <label className="text-xs font-black uppercase tracking-widest text-slate-400">
                Benchmark
                <input value={benchmarkInput} onChange={(event) => setBenchmarkInput(event.target.value.toUpperCase())} className="mt-2 h-12 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm font-black text-white outline-none focus:ring-4 focus:ring-blue-400/20" />
              </label>
              <label className="text-xs font-black uppercase tracking-widest text-slate-400">
                Vade
                <select value={timeFrame} onChange={(event) => setTimeFrame(event.target.value as TimeFrame)} className="mt-2 h-12 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm font-black text-white">
                  {Object.keys(frameDays).map((frame) => <option key={frame}>{frame}</option>)}
                </select>
              </label>
              <label className="text-xs font-black uppercase tracking-widest text-slate-400">
                Risk
                <select value={riskProfile} onChange={(event) => setRiskProfile(event.target.value as RiskProfile)} className="mt-2 h-12 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm font-black text-white">
                  <option value="defensive">Defansif</option>
                  <option value="balanced">Dengeli</option>
                  <option value="aggressive">Agresif</option>
                </select>
              </label>
              <button disabled={loading} className="h-12 self-end rounded-md bg-emerald-500 px-5 text-sm font-black uppercase tracking-wider text-slate-950 hover:bg-emerald-400 disabled:opacity-60">
                {loading ? "Çekiliyor" : "Analiz Et"}
              </button>
            </form>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm font-bold text-slate-400">
            <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-emerald-300">Kaynak: {stock?.source ?? "Yahoo Finance"}</span>
            <span className="rounded-full border border-slate-700 px-3 py-1">Son çekim: {generatedAt || "Bekleniyor"}</span>
            <span className="rounded-full border border-slate-700 px-3 py-1">Örnek semboller: NVDA, AAPL, TSLA, THYAO.IS, BTC-USD, ^GSPC</span>
          </div>
        </header>

        {error ? (
          <div className="mt-5 rounded-lg border border-rose-400 bg-rose-950/40 p-4 text-rose-200">
            <b>Canlı veri alınamadı:</b> {error}
          </div>
        ) : null}

        {stock && analysis ? (
          <>
            <section className="mt-6 rounded-xl border border-emerald-400 bg-slate-950/40 p-6">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-400">3 cümleyle</p>
              <p className="mt-4 text-xl font-semibold leading-9 text-slate-100 md:text-2xl">
                {stock.symbol} için ana resim: <span className="text-emerald-400">{analysis.verdict}</span>. Fiyat {analysis.ma20 < analysis.last.close ? "20 günlük ortalamanın üzerinde, momentum canlı" : "20 günlük ortalamanın altında, teyit zayıf"}; göreli güç benchmark’a karşı <span className={analysis.relative >= 0 ? "text-emerald-400" : "text-rose-400"}>{fmtPct(analysis.relative * 100)}</span>. Asıl test: <span className="text-amber-300">{fmtMoney(analysis.resistance, currency)} direnç</span>, <span className="text-rose-300">{fmtMoney(analysis.stop, currency)} stop</span> ve gelecek haber akışında marj/büyüme teyidi.
              </p>
            </section>

            <section className="mt-8">
              <SectionTitle number="01" title="Anlık Tablo" />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard title="Canlı fiyat" value={fmtMoney(analysis.last.close, currency)} detail={`${stock.exchange || stock.market || "Piyasa"} · ${stock.symbol}`} tone={positive ? "green" : "red"} />
                <MetricCard title={stock.quote.marketCap ? "Piyasa değeri" : "Canlı hacim"} value={stock.quote.marketCap ? fmtCompact(stock.quote.marketCap, currency === "USD" ? "$" : "") : fmtCompact(stock.quote.volume ?? analysis.last.volume)} detail={stock.quote.marketCap ? `Hacim ${fmtCompact(stock.quote.volume ?? analysis.last.volume)}` : "Quote alanı gelmezse chart hacmi kullanılır"} tone="blue" />
                <MetricCard title="F/K ve EPS" value={`${fmtNumber(analysis.pe)}x`} detail={`EPS ${fmtNumber(stock.quote.eps)} · ileri EPS ${fmtNumber(stock.quote.epsForward)}`} tone="amber" />
                <MetricCard title="Trend skoru" value={`${Math.round(analysis.trendScore)}/100`} detail={`RSI ${fmtNumber(analysis.rsiValue)} · SMA50 ${fmtMoney(analysis.ma50, currency)}`} tone={analysis.trendScore > 60 ? "green" : "amber"} />
                <MetricCard title="Beklenen salınım" value={`±%${currencyFormatter.format(analysis.expectedMove)}`} detail={`${timeFrame} verisinden volatilite modeli`} tone="amber" />
              </div>
              <InsightBox>
                Hikayenin yıldız rakamı <span className="font-black text-blue-400">göreli güç {fmtPct(analysis.relative * 100)}</span>. Yani tek başına fiyat değil, benchmark’a karşı ayakta kalma kalitesi de ölçülüyor; sıkıştırılmış karar bandı: <span className="font-black text-emerald-400">{fmtMoney(analysis.target, currency)}</span> hedef, <span className="font-black text-rose-400">{fmtMoney(analysis.stop, currency)}</span> risk çizgisi.
              </InsightBox>
            </section>

            <section className="mt-8">
              <SectionTitle number="02" title="Fiyat, Hacim ve Karar Motoru" />
              <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
                <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-5">
                  <div className="h-[330px] rounded-lg bg-slate-950 p-4">
                    <Sparkline data={analysis.closes} color={positive ? "#34d399" : "#fb7185"} height={250} />
                  </div>
                  <div className="mt-4 grid items-end gap-1 border-t border-slate-700 pt-4" style={{ gridTemplateColumns: "repeat(56, minmax(0, 1fr))" }}>
                    {analysis.volumes.slice(-56).map((volume, index) => (
                      <div key={index} className="rounded-t bg-slate-600" style={{ height: `${Math.max(8, (volume / Math.max(...analysis.volumes)) * 70)}px` }} title={fmtCompact(volume)} />
                    ))}
                  </div>
                  <div className="mt-4 grid gap-3 text-sm font-bold text-slate-400 md:grid-cols-4">
                    <span>Destek <b className="block text-slate-100">{fmtMoney(analysis.support, currency)}</b></span>
                    <span>Direnç <b className="block text-slate-100">{fmtMoney(analysis.resistance, currency)}</b></span>
                    <span>SMA20 <b className="block text-slate-100">{fmtMoney(analysis.ma20, currency)}</b></span>
                    <span>SMA50 <b className="block text-slate-100">{fmtMoney(analysis.ma50, currency)}</b></span>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-5">
                  <h3 className="text-lg font-black">AI Karar Matrisi</h3>
                  {[
                    ["Teknik", analysis.trendScore, "Ortalama, RSI, hacim ve benchmark"],
                    ["Temel", analysis.fundamentalScore, "F/K, EPS ve temettü vekili"],
                    ["Risk", analysis.riskScore, "Volatilite, beta, VaR, düşüş"]
                  ].map(([label, value, detail]) => (
                    <div key={String(label)} className="mt-5">
                      <div className="mb-2 flex justify-between text-sm font-black"><span>{label}</span><span>{Math.round(Number(value))}/100</span></div>
                      <div className="h-2 rounded-full bg-slate-800"><div className="h-2 rounded-full bg-emerald-400" style={{ width: `${Number(value)}%` }} /></div>
                      <p className="mt-2 text-xs font-semibold text-slate-500">{detail}</p>
                    </div>
                  ))}
                  <div className="mt-6 rounded-lg bg-slate-950 p-4">
                    <p className="text-sm font-black uppercase tracking-wider text-slate-500">Net duruş</p>
                    <p className="mt-2 text-xl font-black">{analysis.verdict}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">Önerilen ağırlık: <b className="text-emerald-400">%{currencyFormatter.format(analysis.allocation * 100)}</b>. Risk profiline göre bu, tek hisse için üst sınır değil, başlangıç çıpası.</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-8">
              <SectionTitle number="03" title="Sonuç Çağrısında Takip Edeceğim 10 Madde" />
              <div className="overflow-hidden rounded-xl border border-slate-700">
                <table className="w-full min-w-[980px] border-collapse bg-slate-900/80 text-left">
                  <thead className="bg-slate-800 text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                    <tr><th className="p-4">Öncelik</th><th className="p-4">Madde</th><th className="p-4">Bekleyiş</th><th className="p-4">Sapma olursa</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700 text-sm font-bold text-slate-200">
                    {[
                      ["Kritik", "Bir sonraki çeyrek gelir/guidance", `Piyasa ${analysis.verdict.toLowerCase()} fiyatlıyor`, `Beklentinin altı = ${fmtPct(-Math.max(5, analysis.expectedMove / 1.8))} baskı; üstü = ivme`],
                      ["Kritik", "Brüt/kâr marjı", "Marj korunmalı", "Marj düşüşü = hikaye değil maliyet konuşulur"],
                      ["Kritik", "Yönetimin talep tonu", "Sipariş ve müşteri görünürlüğü", "Belirsiz ton = çarpan sıkışması"],
                      ["Önemli", "Hacim kalitesi", `Son hacim ${fmtCompact(analysis.last.volume)}`, "Fiyat artıp hacim düşerse teyit zayıf"],
                      ["Önemli", "50 günlük ortalama", fmtMoney(analysis.ma50, currency), "Altında 2 kapanış = trend savunması bozulur"],
                      ["Önemli", "Analist tonu", stock.quote.analystRating ?? "Canlı rating yok", "Not indirimleri hedef bandı aşağı çeker"],
                      ["İzle", "Benchmark göreli güç", fmtPct(analysis.relative * 100), "Benchmark altında kalırsa sermaye başka yere akıyor"],
                      ["İzle", "52 hafta bandı", `${fmtMoney(stock.quote.yearLow ?? analysis.yearLow, currency)} - ${fmtMoney(stock.quote.yearHigh ?? analysis.yearHigh, currency)}`, "Zirveye yakınlık yeni alım riskini artırır"]
                    ].map((row) => (
                      <tr key={row[1]}>
                        <td className="p-4"><DataPill tone={row[0] === "Kritik" ? "red" : row[0] === "Önemli" ? "amber" : "blue"}>{row[0]}</DataPill></td>
                        <td className="p-4">{row[1]}</td>
                        <td className="p-4 text-slate-300">{row[2]}</td>
                        <td className="p-4 text-rose-300">{row[3]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <InsightBox>
                Hisseyi hareket ettirecek üç ana başlık: <span className="font-black text-blue-400">guidance</span>, <span className="font-black text-blue-400">marj</span>, <span className="font-black text-blue-400">yönetim tonu</span>. Üçü birlikte güzelse grafik zaten yol açar; biri bozulursa stop seviyesi süs değil, fren olur.
              </InsightBox>
            </section>

            <section className="mt-8">
              <SectionTitle number="04" title="Piyasanın Atladığı ve Abarttığı Noktalar" />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[
                  ["Piyasa atlıyor (+)", "Nakit akışı ve bilanço dayanıklılığı fiyat kadar hızlı okunmuyor. Eğer şirket büyürken risk skorunu koruyorsa, düşüşler daha çok fırsat penceresi olur.", "Benzeşme: Kalabalık sadece tabelaya bakıyor; içerideki kasa akışını geç fark ediyor.", "green"],
                  ["Piyasa atlıyor (+)", `Benchmark'a göre ${fmtPct(analysis.relative * 100)} performans, pasif yükselişten daha değerlidir. Bu rakam sermayenin hisseye niyetini gösterir.`, "Benzeşme: Rüzgar herkesin arkasındaysa iyi yelkenli ayırt edilmez; göreli güç rüzgar kesilince belli olur.", "green"],
                  ["Piyasa abartıyor (-)", `Yüksek F/K (${fmtNumber(analysis.pe)}x) iyi haberi peşinen satın almış olabilir. Güzel sonuç yetmeyebilir; daha güzel sonuç gerekebilir.`, "Benzeşme: Bilet pahalıysa konserin iyi olması değil, unutulmaz olması beklenir.", "red"],
                  ["Piyasa abartıyor (-)", `Son ${timeFrame} getirisi ${fmtPct(analysis.change * 100)}. Momentum çok ısınırsa iyi haber bile kar satışına dönebilir.`, "Benzeşme: Su musluğu açık ama deponun da sınırı var; basınç arttıkça vana hassaslaşır.", "red"]
                ].map(([title, body, analogy, tone]) => (
                  <div key={title + body} className={`rounded-xl border bg-slate-900/80 p-5 ${toneBorder(tone as Tone)}`}>
                    <p className={`text-sm font-black uppercase tracking-[0.18em] ${tone === "green" ? "text-emerald-400" : "text-rose-400"}`}>{title}</p>
                    <p className="mt-5 text-lg font-semibold leading-8 text-slate-200">{body}</p>
                    <p className="mt-5 border-t border-dashed border-slate-700 pt-4 text-sm font-semibold text-slate-400"><span className="text-amber-300">Benzetme:</span> {analogy}</p>
                  </div>
                ))}
              </div>
              <InsightBox>
                Piyasanın asıl atladığı şey: <span className="font-black text-blue-400">kaliteli göreli güç</span>. Asıl abarttığı şey: <span className="font-black text-blue-400">her iyi şirketin her fiyattan iyi alım olduğu</span> fikri.
              </InsightBox>
            </section>

            <section className="mt-8">
              <SectionTitle number="05" title="3 Senaryo" />
              <div className="grid gap-5 lg:grid-cols-3">
                {[
                  ["Boğa", "~%30", `${fmtMoney(analysis.target * 1.04, currency)} - ${fmtMoney(analysis.target * 1.12, currency)}`, "Her şey biraz daha iyi çıkar: guidance yukarı, marj korunur, piyasa çarpanı sindirir.", "green"],
                  ["Baz", "~%50", `${fmtMoney(analysis.stop * 1.03, currency)} - ${fmtMoney(analysis.target, currency)}`, "Tahminler tutar, yıldız haber gelmez. Hisse bant içinde sindirerek ilerler.", "amber"],
                  ["Ayı", "~%20", `${fmtMoney(analysis.stop * 0.92, currency)} - ${fmtMoney(analysis.stop, currency)}`, "Birkaç noktada hayal kırıklığı: marj, guidance veya piyasa risk iştahı bozulur.", "red"]
                ].map(([title, probability, band, body, tone]) => (
                  <div key={title} className={`rounded-xl border bg-slate-900/80 p-6 ${toneBorder(tone as Tone)}`}>
                    <div className="flex justify-between gap-4">
                      <h3 className={`text-2xl font-black uppercase tracking-wider ${tone === "green" ? "text-emerald-400" : tone === "red" ? "text-rose-400" : "text-amber-400"}`}>{title}</h3>
                      <span className="font-black text-slate-400">{probability}</span>
                    </div>
                    <p className={`mt-8 text-3xl font-black ${tone === "green" ? "text-emerald-400" : tone === "red" ? "text-rose-400" : "text-amber-400"}`}>{band}</p>
                    <p className="mt-6 text-lg font-semibold leading-8 text-slate-300">{body}</p>
                  </div>
                ))}
              </div>
              <InsightBox>
                En olası senaryo baz: hisse kendi bandını bulur. Ama iyi tarafı da kötü tarafı da sayısal: hedef ve stop aynı tabloda duruyor, sisin içinde iki sokak lambası gibi.
              </InsightBox>
            </section>

            <section className="mt-8">
              <SectionTitle number="06" title="Risk Tablosu" />
              <div className="overflow-hidden rounded-xl border border-slate-700">
                <table className="w-full min-w-[900px] border-collapse bg-slate-900/80 text-left">
                  <thead className="bg-slate-800 text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                    <tr><th className="p-4">Risk</th><th className="p-4">Olasılık</th><th className="p-4">Etki</th><th className="p-4">Ne bakacağız</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700 text-sm font-bold">
                    {[
                      ["Marj düşmesi", "Orta", "Yüksek", "Brüt marj ve operasyonel gider yorumu"],
                      ["Çarpan daralması", analysis.pe > 35 ? "Orta-yüksek" : "Düşük-orta", "Yüksek", "F/K, faiz, sektör çarpanları"],
                      ["Genel piyasa risk-off", "Düşük-orta", "Yüksek", "VIX, tahvil faizi, benchmark kırılımı"],
                      ["Trend kırılması", analysis.last.close < analysis.ma50 ? "Orta-yüksek" : "Orta", "Orta", `${fmtMoney(analysis.ma50, currency)} ve ${fmtMoney(analysis.stop, currency)}`],
                      ["Likidite / hacim zayıflığı", "Orta", "Orta", "Yükselişte hacim, düşüşte hacim davranışı"],
                      ["Sonuç sonrası kar satışı", "Orta", "Orta", `Beklenen salınım ±%${currencyFormatter.format(analysis.expectedMove)}`]
                    ].map(([risk, probability, impact, watch]) => (
                      <tr key={risk}>
                        <td className="p-4 text-slate-100">{risk}</td>
                        <td className="p-4"><DataPill tone={String(probability).includes("yüksek") ? "amber" : "blue"}>{probability}</DataPill></td>
                        <td className="p-4"><DataPill tone={impact === "Yüksek" ? "amber" : "blue"}>{impact}</DataPill></td>
                        <td className="p-4 text-slate-300">{watch}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <InsightBox>
                En tehlikeli kombinasyon: <span className="font-black text-blue-400">marj baskısı + çarpan daralması + trend kırılması</span>. Üçü aynı anda olursa tez değil, fiyat konuşur.
              </InsightBox>
            </section>

            <section className="mt-8">
              <SectionTitle number="07" title="Hisse Tutuyorsan 4 Korunma Yöntemi" />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Koruyucu satış hakkı", "Hisseni belli fiyatın altına düşerse satabilme hakkı satın alırsın. Sigorta gibi; prim ödersin, kötü gün gelirse korur."],
                  ["Sıfır maliyetli yaka", "Alttan koruma alıp üstten tavan satarsın. Aşağı koruma gelir, ama yukarı potansiyelin bir kısmını verirsin."],
                  ["Kapalı alım satışı", "Sahip olduğun hisse için belli fiyattan satma sözü verip prim toplarsın. Yatay piyasada nakit üretir."],
                  ["Kırp + nakit bekle", "Pozisyonun bir kısmını azaltır, sonuç sonrası tepkiyi görürsün. Basit ama çoğu zaman en temiz frendir."]
                ].map(([title, body]) => (
                  <div key={title} className="rounded-xl border border-slate-700 bg-slate-900/80 p-5">
                    <h3 className="text-lg font-black uppercase tracking-[0.18em] text-blue-400">{title}</h3>
                    <p className="mt-5 text-sm font-semibold leading-7 text-slate-400">{body}</p>
                  </div>
                ))}
              </div>
              <InsightBox>
                Pozisyonun varsa en akıllı orta yol: <span className="font-black text-blue-400">tezini koru, kötü günü fiyatla</span>. Sadece umutla beklemek strateji değil; stop, hedge veya pozisyon küçültme stratejidir.
              </InsightBox>
            </section>

            <section className="mt-8">
              <SectionTitle number="08" title="Hangi Vadeyle Bakıyorsan" />
              <div className="grid gap-4 lg:grid-cols-3">
                <div className={`rounded-xl border bg-slate-900/80 p-6 ${toneBorder("red")}`}>
                  <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Kısa vade (0-3 ay)</p>
                  <h3 className="mt-5 text-2xl font-black">Salınım riski yüksek</h3>
                  <p className="mt-5 text-lg leading-8 text-slate-400">Yeni pozisyon için acele gerekmiyor. Beklenen hareket ±%{currencyFormatter.format(analysis.expectedMove)}; trader isen tepki yönünü bekle.</p>
                </div>
                <div className={`rounded-xl border bg-slate-900/80 p-6 ${toneBorder("amber")}`}>
                  <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Orta vade (3-12 ay)</p>
                  <h3 className="mt-5 text-2xl font-black">Tez ve fiyat dengesi</h3>
                  <p className="mt-5 text-lg leading-8 text-slate-400">Mevcut pozisyon korunabilir. Düşüşlerde parça parça ekleme ancak {fmtMoney(analysis.stop, currency)} çizgisi bozulmuyorsa anlamlı.</p>
                </div>
                <div className={`rounded-xl border bg-slate-900/80 p-6 ${toneBorder("green")}`}>
                  <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Uzun vade (12+ ay)</p>
                  <h3 className="mt-5 text-2xl font-black">Çekirdek pozisyon</h3>
                  <p className="mt-5 text-lg leading-8 text-slate-400">Skor {analysis.totalScore}/100. Tez bozulmadıkça kısa vadeli gürültüden çok gelir, marj ve sermaye verimliliği izlenir.</p>
                </div>
              </div>
            </section>

            <section className="mt-8 rounded-xl border border-slate-700 bg-slate-900/80 p-6">
              <h2 className="text-2xl font-black uppercase tracking-[0.18em] text-emerald-400">Sözlük</h2>
              <div className="mt-5 grid gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
                {[
                  ["Benchmark", "Hissenin karşılaştırıldığı ana endeks veya varlık. Yani: rüzgar mı esiyor, yoksa gemi mi iyi gidiyor?"],
                  ["Göreli güç", "Hissenin benchmark'a göre farkı. Yani: sermaye bu hisseyi mi seçiyor?"],
                  ["Guidance", "Yönetimin gelecek dönem için resmi beklentisi. Yani: şirketin kendi çıtası."],
                  ["F/K", "Fiyatın yıllık kâra oranı. Yani: iyi hikayeye kaç yıllık kâr ödüyorsun?"],
                  ["EPS", "Hisse başına kâr. Yani: tek bir hissenin payına ne kadar kâr düşüyor?"],
                  ["RSI", "Momentum göstergesi. Yani: koşucu hâlâ nefesli mi, yoksa fazla mı hızlandı?"],
                  ["VaR", "Normal şartlarda kötü gün kaybı tahmini. Yani: sıradan kötü günde ne kadar can yakar?"],
                  ["Maksimum düşüş", "Seçili vadede zirveden dibe en büyük kayıp. Yani: bu hisse seni en fazla ne kadar sınamış?"],
                  ["Stop", "Tezin çalışmadığını kabul ettiğin fiyat. Yani: tartışmayı fiyat kazanınca masadan kalkmak."]
                ].map(([term, body]) => (
                  <div key={term}>
                    <p className="font-black text-emerald-400">{term}: <span className="font-semibold text-slate-400">{body}</span></p>
                  </div>
                ))}
              </div>
            </section>

            <footer className="my-8 rounded-lg border border-dashed border-slate-700 p-5 text-center text-sm font-semibold text-slate-500">
              Bu içerik yatırım tavsiyesi değildir. Veriler {stock.source} üzerinden canlı çekilir; gecikme, veri kesintisi veya sağlayıcı hatası olabilir. Son veri zamanı: {generatedAt}. Tüm finansal kararlar kişisel araştırma ve risk yönetimi gerektirir.
            </footer>
          </>
        ) : (
          <div className="mt-8 rounded-xl border border-slate-700 bg-slate-900/70 p-10 text-center text-slate-400">
            {loading ? "Canlı fiyat, grafik ve temel parametreler çekiliyor..." : "Analiz için bir sembol girin."}
          </div>
        )}

        <div className="fixed bottom-4 right-4 flex flex-wrap justify-end gap-2">
          <button onClick={addToWatchlist} disabled={!stock} className="rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-black text-slate-200 shadow-xl hover:bg-slate-800 disabled:opacity-40">İzle</button>
          <button onClick={saveReport} disabled={!stock} className="rounded-md bg-blue-500 px-4 py-2 text-sm font-black text-white shadow-xl hover:bg-blue-400 disabled:opacity-40">Rapor Al</button>
          {reportSaved ? <span className="rounded-md border border-emerald-400 bg-emerald-950 px-4 py-2 text-sm font-black text-emerald-300">Rapor indirildi</span> : null}
        </div>

        <div className="fixed bottom-4 left-4 hidden max-w-[60vw] gap-2 rounded-md border border-slate-700 bg-slate-900/95 p-2 shadow-xl lg:flex">
          {watchlist.map((item) => (
            <button key={item} onClick={() => { setSymbolInput(item); setActiveSymbol(item); }} className="rounded px-3 py-2 text-xs font-black text-slate-300 hover:bg-slate-800 hover:text-white">{item}</button>
          ))}
        </div>
      </div>
    </main>
  );
}
