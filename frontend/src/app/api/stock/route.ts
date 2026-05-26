import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type YahooQuote = {
  symbol?: string;
  shortName?: string;
  longName?: string;
  exchange?: string;
  market?: string;
  currency?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  epsTrailingTwelveMonths?: number;
  epsForward?: number;
  dividendYield?: number;
  beta?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;
  averageAnalystRating?: string;
};

type YahooChartPoint = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const rangeMap: Record<string, string> = {
  "1A": "1mo",
  "3A": "3mo",
  "6A": "6mo",
  "1Y": "1y",
  "2Y": "2y",
  "5Y": "5y"
};

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawSymbol = url.searchParams.get("symbol")?.trim().toUpperCase();
  const range = rangeMap[url.searchParams.get("range") ?? "1Y"] ?? "1y";

  if (!rawSymbol || !/^[A-Z0-9.^=-]{1,18}$/.test(rawSymbol)) {
    return NextResponse.json({ error: "Geçerli bir hisse sembolü girin. Örn: NVDA, AAPL, THYAO.IS, BTC-USD" }, { status: 400 });
  }

  const symbol = encodeURIComponent(rawSymbol);
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=1d&includePrePost=false&events=div%7Csplit`;
  const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`;

  try {
    const [chartResponse, quoteResponse] = await Promise.all([
      fetch(chartUrl, { cache: "no-store", headers: { accept: "application/json" } }),
      fetch(quoteUrl, { cache: "no-store", headers: { accept: "application/json" } })
    ]);

    if (!chartResponse.ok) {
      return NextResponse.json({ error: `Canlı fiyat grafiği alınamadı (${chartResponse.status}).` }, { status: 502 });
    }

    const chartJson = await chartResponse.json() as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          meta?: Record<string, unknown>;
          indicators?: {
            quote?: Array<{
              open?: Array<number | null>;
              high?: Array<number | null>;
              low?: Array<number | null>;
              close?: Array<number | null>;
              volume?: Array<number | null>;
            }>;
          };
        }>;
        error?: { description?: string };
      };
    };

    const result = chartJson.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const quoteSeries = result?.indicators?.quote?.[0];
    const points: YahooChartPoint[] = timestamps.map((timestamp, index) => {
      const close = quoteSeries?.close?.[index];
      const fallbackClose = typeof close === "number" ? close : 0;
      return {
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        open: numberOrNull(quoteSeries?.open?.[index]) ?? fallbackClose,
        high: numberOrNull(quoteSeries?.high?.[index]) ?? fallbackClose,
        low: numberOrNull(quoteSeries?.low?.[index]) ?? fallbackClose,
        close: fallbackClose,
        volume: numberOrNull(quoteSeries?.volume?.[index]) ?? 0
      };
    }).filter((point) => point.close > 0);

    if (points.length < 20) {
      return NextResponse.json({ error: chartJson.chart?.error?.description ?? "Bu sembol için yeterli canlı geçmiş veri bulunamadı." }, { status: 404 });
    }

    let quote: YahooQuote = {};
    if (quoteResponse.ok) {
      const quoteJson = await quoteResponse.json() as { quoteResponse?: { result?: YahooQuote[] } };
      quote = quoteJson.quoteResponse?.result?.[0] ?? {};
    }

    const meta = result?.meta ?? {};
    return NextResponse.json({
      source: "Yahoo Finance",
      fetchedAt: new Date().toISOString(),
      latestBarAt: points.at(-1)?.date ?? null,
      symbol: rawSymbol,
      name: quote.longName ?? quote.shortName ?? String(meta.longName ?? rawSymbol),
      exchange: quote.exchange ?? String(meta.exchangeName ?? ""),
      market: quote.market ?? String(meta.instrumentType ?? ""),
      currency: quote.currency ?? String(meta.currency ?? "USD"),
      quote: {
        price: quote.regularMarketPrice ?? numberOrNull(meta.regularMarketPrice) ?? points.at(-1)?.close ?? null,
        change: quote.regularMarketChange ?? null,
        changePercent: quote.regularMarketChangePercent ?? null,
        volume: quote.regularMarketVolume ?? points.at(-1)?.volume ?? null,
        marketCap: quote.marketCap ?? null,
        trailingPE: quote.trailingPE ?? null,
        forwardPE: quote.forwardPE ?? null,
        eps: quote.epsTrailingTwelveMonths ?? null,
        epsForward: quote.epsForward ?? null,
        dividendYield: quote.dividendYield ?? null,
        beta: quote.beta ?? null,
        yearLow: quote.fiftyTwoWeekLow ?? null,
        yearHigh: quote.fiftyTwoWeekHigh ?? null,
        analystRating: quote.averageAnalystRating ?? null
      },
      points
    }, {
      headers: {
        "Cache-Control": "no-store, max-age=0"
      }
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Canlı veri alınırken bilinmeyen hata oluştu."
    }, { status: 502 });
  }
}
