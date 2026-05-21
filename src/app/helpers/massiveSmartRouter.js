/**
 * Massive Smart Router — Verified Live API Edition
 *
 * All Massive.com API calls use VERIFIED method names (tested 2026-05-21).
 * Coverage: Stocks, Options, Crypto, Forex, Macro/Fed, News, Market Status
 *
 * Resilience: 2.5s timeout per call, Redis caching, graceful fallback
 * Caching: 30s quotes, 2min news, 5min macro, 60min market status
 */

import {
  getStockQuoteService,
  getStocksSnapshotTickersService,
  getTickerDetailsService,
  getStockFinancialsRatiosService,
  getStockRSIService,
  getStockNewsService,
  getOptionsChainService,
  getOptionsChainFilteredService,
  getCryptoSnapshotService,
  getCryptoTradesService,
  getCryptoRSIService,
  getForexSnapshotService,
  getCurrencyConversionService,
  getFedInflationService,
  getFedYieldsService,
  getFedLaborMarketService,
  getFedInflationExpectationsService,
  getMarketStatusService,
  getMarketHolidaysService,
  getMarketNewsService,
  getIPOsService,
} from '../modules/massive/massive.service.js';

import { logger } from '../../shared/logger.js';
import { RedisClient } from '../../shared/redis.js';
import {
  detectFinancialIntent,
  detectMultipleTickers,
  NEWS_KEYWORDS,
} from './massiveTickerDB.js';

// ─── Cache TTLs (seconds) ─────────────────────────────────────────────────────
const TTL = {
  quote: 30,
  crypto: 20,
  forex: 20,
  options: 30,
  news: 120,
  macro: 300,
  status: 60,
  holidays: 3600,
  financials: 900,
  rsi: 60,
};

// ─── Redis helpers ────────────────────────────────────────────────────────────
async function cacheGet(key) {
  try {
    const val = await RedisClient.get(`massive:${key}`);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}

async function cacheSet(key, data, ttl) {
  try {
    await RedisClient.set(`massive:${key}`, JSON.stringify(data), { EX: ttl });
  } catch { /* non-fatal */ }
}

// ─── Timeout wrapper (2.5s) ───────────────────────────────────────────────────
function safe(promise, ms = 2500) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Massive API timeout')), ms)),
  ]).catch(err => {
    logger.warn(`[MassiveRouter] API call failed: ${err.message}`);
    return null;
  });
}

// ─── Crypto ticker normaliser ─────────────────────────────────────────────────
// Converts BTC → X:BTCUSD, ETH → X:ETHUSD, etc.
function toCryptoTicker(sym) {
  const s = sym.toUpperCase().replace(/USD$/, '');
  if (s.startsWith('X:')) return s;
  return `X:${s}USD`;
}

// ─── Forex ticker normaliser ──────────────────────────────────────────────────
// Converts EURUSD → C:EURUSD, EUR → C:EURUSD, EUR/USD → C:EURUSD
function toForexTicker(sym) {
  const s = sym.toUpperCase().replace('/', '').replace('C:', '');
  if (s.length === 3) return `C:${s}USD`;
  if (s.length === 6) return `C:${s}`;
  return `C:${s}`;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────
function buildPrompt(userPrompt, dataBlock, source) {
  const timestamp = new Date().toISOString();
  return `[SYSTEM INSTRUCTION — ALTI REAL-TIME FINANCIAL DATA]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATA SOURCE: ${source}
TIMESTAMP:   ${timestamp}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${dataBlock}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY RESPONSE RULES:
▸ ALWAYS cite "[Source: Massive.com]" at the very top of your answer
▸ Present ALL prices, rates, and numbers in **BOLD**
▸ Use Markdown tables for options chains, comparisons, multi-asset data
▸ NEVER hallucinate or fabricate any price, rate, or statistic
▸ If data shows "DELAYED" status, state: "Prices may be slightly delayed"
▸ Answer the user's EXACT question using only the verified data above
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User Query: ${userPrompt}`;
}

// ─── Data fetchers (with caching) ─────────────────────────────────────────────

async function fetchStockFull(ticker) {
  const cached = await cacheGet(`stock:${ticker}`);
  if (cached) return cached;

  const [quote, ratios, rsi, news] = await Promise.all([
    safe(getStockQuoteService(ticker)),
    safe(getStockFinancialsRatiosService(ticker)),
    safe(getStockRSIService(ticker, 14)),
    safe(getStockNewsService(ticker, 3)),
  ]);

  const data = { ticker, quote, ratios, rsi, news };
  await cacheSet(`stock:${ticker}`, data, TTL.quote);
  return data;
}

async function fetchCryptoFull(symbol) {
  const cryptoTicker = toCryptoTicker(symbol);
  const cached = await cacheGet(`crypto:${cryptoTicker}`);
  if (cached) return cached;

  const [snapshot, trades, rsi] = await Promise.all([
    safe(getCryptoSnapshotService([cryptoTicker])),
    safe(getCryptoTradesService(cryptoTicker, 3)),
    safe(getCryptoRSIService(cryptoTicker, 14)),
  ]);

  const data = { symbol, cryptoTicker, snapshot, trades, rsi };
  await cacheSet(`crypto:${cryptoTicker}`, data, TTL.crypto);
  return data;
}

async function fetchForexFull(symbol) {
  const forexTicker = toForexTicker(symbol);
  const cached = await cacheGet(`forex:${forexTicker}`);
  if (cached) return cached;

  // Parse from/to from pair
  const s = symbol.toUpperCase().replace('/', '').replace('C:', '');
  const from = s.slice(0, 3);
  const to = s.slice(3, 6) || 'USD';

  const [snapshot, conversion] = await Promise.all([
    safe(getForexSnapshotService([forexTicker])),
    safe(getCurrencyConversionService(from, to, 1)),
  ]);

  const data = { symbol, forexTicker, snapshot, conversion };
  await cacheSet(`forex:${forexTicker}`, data, TTL.forex);
  return data;
}

async function fetchMarketStatus() {
  const cached = await cacheGet('market_status');
  if (cached) return cached;

  const [status, holidays] = await Promise.all([
    safe(getMarketStatusService()),
    safe(getMarketHolidaysService()),
  ]);

  const data = { status, holidays };
  await cacheSet('market_status', data, TTL.status);
  return data;
}

async function fetchMacroFull() {
  const cached = await cacheGet('macro_full');
  if (cached) return cached;

  const [inflation, yields, labor, expectations] = await Promise.all([
    safe(getFedInflationService(6)),
    safe(getFedYieldsService(5)),
    safe(getFedLaborMarketService(3)),
    safe(getFedInflationExpectationsService(3)),
  ]);

  const data = { inflation, yields, labor, expectations };
  await cacheSet('macro_full', data, TTL.macro);
  return data;
}

async function fetchStockNews(ticker) {
  const t = ticker.toUpperCase();
  const cached = await cacheGet(`news:${t}`);
  if (cached) return cached;
  const news = await safe(getMarketNewsService(t, 5));
  await cacheSet(`news:${t}`, news, TTL.news);
  return news;
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatStockBlock(data) {
  if (!data) return 'Stock data unavailable.';
  const { ticker, quote, ratios, rsi, news } = data;

  let block = `## ${ticker} — Live Market Data\n`;

  // Quote section
  if (quote?.quote?.P || quote?.trade?.p) {
    const bid = quote.quote?.p;
    const ask = quote.quote?.P;
    const lastPrice = quote.trade?.p;
    const prevClose = quote.previousClose?.c;
    const change = lastPrice && prevClose ? (lastPrice - prevClose).toFixed(2) : 'N/A';
    const changePct = lastPrice && prevClose ? (((lastPrice - prevClose) / prevClose) * 100).toFixed(2) : 'N/A';
    block += `\n### Price\n`;
    block += `| Field | Value |\n|-------|-------|\n`;
    if (lastPrice) block += `| Last Price | **$${lastPrice}** |\n`;
    if (bid) block += `| Bid | **$${bid}** |\n`;
    if (ask) block += `| Ask | **$${ask}** |\n`;
    if (prevClose) block += `| Prev Close | $${prevClose} |\n`;
    if (change !== 'N/A') block += `| Change | **${change} (${changePct}%)** |\n`;
    if (quote.quote?.S) block += `| Ask Size | ${quote.quote.S} shares |\n`;
    block += `| Status | ${quote.quote?.t ? 'DELAYED' : 'Live'} |\n`;
  }

  // Snapshot % change (from getStocksSnapshotTicker)
  if (quote?.snapshot?.session) {
    const s = quote.snapshot.session;
    block += `\n### Session\n`;
    block += `| Metric | Value |\n|--------|-------|\n`;
    if (s.change !== undefined) block += `| Day Change | **${s.change?.toFixed(2)} (${s.change_percent?.toFixed(2)}%)** |\n`;
    if (s.regular_trading_change !== undefined) block += `| Regular Hours | ${s.regular_trading_change?.toFixed(2)} (${s.regular_trading_change_percent?.toFixed(2)}%) |\n`;
    if (s.early_trading_change !== undefined) block += `| Pre-Market | ${s.early_trading_change?.toFixed(2)} (${s.early_trading_change_percent?.toFixed(2)}%) |\n`;
  }

  // Financials ratios
  if (ratios) {
    block += `\n### Key Metrics\n`;
    block += `| Metric | Value |\n|--------|-------|\n`;
    if (ratios.price) block += `| Price | **$${ratios.price}** |\n`;
    if (ratios.market_cap) block += `| Market Cap | **$${(ratios.market_cap / 1e9).toFixed(2)}B** |\n`;
    if (ratios.price_to_earnings) block += `| P/E Ratio | ${ratios.price_to_earnings?.toFixed(2)} |\n`;
    if (ratios.price_to_book) block += `| P/B Ratio | ${ratios.price_to_book?.toFixed(2)} |\n`;
    if (ratios.price_to_sales) block += `| P/S Ratio | ${ratios.price_to_sales?.toFixed(2)} |\n`;
    if (ratios.earnings_per_share) block += `| EPS | $${ratios.earnings_per_share?.toFixed(2)} |\n`;
    if (ratios.average_volume) block += `| Avg Volume | ${(ratios.average_volume / 1e6).toFixed(2)}M |\n`;
  }

  // RSI
  if (rsi?.value !== undefined) {
    const rsiVal = parseFloat(rsi.value).toFixed(2);
    const rsiSignal = rsiVal > 70 ? '🔴 Overbought' : rsiVal < 30 ? '🟢 Oversold' : '⚪ Neutral';
    block += `\n### Technical\n| RSI (14) | Signal |\n|----------|--------|\n| **${rsiVal}** | ${rsiSignal} |\n`;
  }

  // News
  if (Array.isArray(news) && news.length > 0) {
    block += `\n### Recent News\n`;
    news.slice(0, 3).forEach((n, i) => {
      if (n.title) block += `${i + 1}. **${n.title}** — ${n.publisher?.name || 'Unknown'} (${n.published_utc?.slice(0, 10) || ''})\n`;
    });
  }

  return block;
}

function formatCryptoBlock(data) {
  if (!data) return 'Crypto data unavailable.';
  const { symbol, snapshot, trades, rsi } = data;

  let block = `## ${symbol} — Live Crypto Data\n`;

  if (Array.isArray(snapshot) && snapshot.length > 0) {
    const s = snapshot[0];
    block += `\n### Price\n`;
    block += `| Field | Value |\n|-------|-------|\n`;
    if (s.day?.c) block += `| Price (Day Close) | **$${s.day.c.toLocaleString()}** |\n`;
    if (s.todaysChange !== undefined) block += `| 24h Change | **${s.todaysChange >= 0 ? '+' : ''}${s.todaysChange?.toFixed(2)} (${s.todaysChangePerc?.toFixed(2)}%)** |\n`;
    if (s.day?.o) block += `| Open | $${s.day.o.toLocaleString()} |\n`;
    if (s.day?.h) block += `| High | $${s.day.h.toLocaleString()} |\n`;
    if (s.day?.l) block += `| Low | $${s.day.l.toLocaleString()} |\n`;
    if (s.day?.v) block += `| Volume | ${s.day.v.toLocaleString()} |\n`;
  }

  if (Array.isArray(trades) && trades.length > 0) {
    block += `\n### Last Trade\n| Price | Size |\n|-------|------|\n`;
    block += `| **$${trades[0].price?.toLocaleString()}** | ${trades[0].size} |\n`;
  }

  if (rsi?.value !== undefined) {
    const rsiVal = parseFloat(rsi.value).toFixed(2);
    const rsiSignal = rsiVal > 70 ? '🔴 Overbought' : rsiVal < 30 ? '🟢 Oversold' : '⚪ Neutral';
    block += `\n### Technical\n| RSI (14) | Signal |\n|----------|--------|\n| **${rsiVal}** | ${rsiSignal} |\n`;
  }

  return block;
}

function formatForexBlock(data) {
  if (!data) return 'Forex data unavailable.';
  const { symbol, snapshot, conversion } = data;

  let block = `## ${symbol} — Live Forex Rate\n`;

  if (conversion) {
    block += `\n### Live Rate\n`;
    block += `| Field | Value |\n|-------|-------|\n`;
    if (conversion.last?.bid) block += `| Bid | **${conversion.last.bid?.toFixed(5)}** |\n`;
    if (conversion.last?.ask) block += `| Ask | **${conversion.last.ask?.toFixed(5)}** |\n`;
    if (conversion.converted) block += `| Converted (1 ${conversion.from}) | **${conversion.converted?.toFixed(5)} ${conversion.to}** |\n`;
  }

  if (Array.isArray(snapshot) && snapshot.length > 0) {
    const s = snapshot[0];
    block += `\n### Session\n`;
    block += `| Field | Value |\n|-------|-------|\n`;
    if (s.day?.o) block += `| Open | ${s.day.o?.toFixed(5)} |\n`;
    if (s.day?.h) block += `| High | **${s.day.h?.toFixed(5)}** |\n`;
    if (s.day?.l) block += `| Low | **${s.day.l?.toFixed(5)}** |\n`;
    if (s.day?.c) block += `| Close | ${s.day.c?.toFixed(5)} |\n`;
    if (s.todaysChangePerc !== undefined) block += `| Day Change | ${s.todaysChangePerc?.toFixed(4)}% |\n`;
  }

  return block;
}

function formatOptionsBlock(options, underlyingTicker) {
  if (!options?.results?.length) return `Options chain for ${underlyingTicker} — no data returned.`;

  let block = `## ${underlyingTicker} — Options Chain\n\n`;
  block += `| Contract | Type | Strike | Expiry | Bid | Ask | IV | Delta | OI |\n`;
  block += `|----------|------|--------|--------|-----|-----|----|-------|----|\n`;

  const contracts = options.results.slice(0, 20);
  contracts.forEach(c => {
    const d = c.details || {};
    const g = c.greeks || {};
    const q = c.lastQuote || {};
    block += `| ${d.ticker || ''} | ${d.contract_type || ''} | **$${d.strike_price}** | ${d.expiration_date} | ${q.B?.toFixed(2) || 'N/A'} | ${q.A?.toFixed(2) || 'N/A'} | ${c.implied_volatility ? (c.implied_volatility * 100).toFixed(1) + '%' : 'N/A'} | ${g.delta?.toFixed(3) || 'N/A'} | ${c.open_interest || 'N/A'} |\n`;
  });

  return block;
}

// ─── Main Router ──────────────────────────────────────────────────────────────

const routeAndEnhancePrompt = async (prompt) => {
  if (!prompt || typeof prompt !== 'string') return prompt;

  try {
    const intent = detectFinancialIntent(prompt);
    if (!intent) return prompt;

    logger.info(`[MassiveRouter] Intent: ${intent.type} | Symbol: ${intent.symbol || 'N/A'}`);

    const q = prompt.toLowerCase();

    // ── MARKET STATUS ─────────────────────────────────────────────────────
    if (intent.type === 'market_status') {
      const { status, holidays } = await fetchMarketStatus();
      if (!status) return prompt;

      const s = status;
      let block = `## Current Market Status\n`;
      block += `| Market | Status |\n|--------|--------|\n`;
      block += `| Overall | **${s.market?.toUpperCase()}** |\n`;
      block += `| NYSE | ${s.exchanges?.nyse || 'N/A'} |\n`;
      block += `| NASDAQ | ${s.exchanges?.nasdaq || 'N/A'} |\n`;
      block += `| Crypto | ${s.currencies?.crypto || 'N/A'} |\n`;
      block += `| Forex | ${s.currencies?.fx || 'N/A'} |\n`;
      block += `| After Hours | ${s.afterHours ? 'Yes' : 'No'} |\n`;
      block += `| Early Hours | ${s.earlyHours ? 'Yes' : 'No'} |\n`;
      block += `| Server Time | ${s.serverTime} |\n`;

      if (Array.isArray(holidays) && holidays.length > 0) {
        block += `\n## Upcoming Market Holidays\n`;
        block += `| Date | Exchange | Holiday | Status |\n|------|----------|---------|--------|\n`;
        const seen = new Set();
        holidays.filter(h => !seen.has(h.date + h.name) && seen.add(h.date + h.name))
          .slice(0, 5)
          .forEach(h => { block += `| ${h.date} | ${h.exchange} | ${h.name} | ${h.status} |\n`; });
      }

      return buildPrompt(prompt, block, 'Massive.com Global Market Status Service');
    }

    // ── MACRO / FEDERAL RESERVE ───────────────────────────────────────────
    if (intent.type === 'macro') {
      const { inflation, yields, labor, expectations } = await fetchMacroFull();

      let block = `## Federal Reserve & Macro Economic Data\n\n`;

      const latestCPI = inflation?.results?.slice(-1)[0];
      if (latestCPI) {
        block += `### CPI Inflation\n| Date | CPI |\n|------|-----|\n| ${latestCPI.date} | **${latestCPI.cpi}** |\n\n`;
      }

      const latestYield = yields?.results?.slice(-1)[0];
      if (latestYield) {
        block += `### Treasury Yield Curve\n`;
        block += `| Date | 1Y | 5Y | 10Y |\n|------|-----|-----|-----|\n`;
        block += `| ${latestYield.date} | **${latestYield.yield_1_year}%** | **${latestYield.yield_5_year}%** | **${latestYield.yield_10_year}%** |\n\n`;
      }

      const latestLabor = labor?.results?.slice(-1)[0];
      if (latestLabor) {
        block += `### Labor Market\n| Date | Unemployment | Participation Rate |\n|------|-------------|--------------------|\n`;
        block += `| ${latestLabor.date} | **${latestLabor.unemployment_rate}%** | ${latestLabor.labor_force_participation_rate}% |\n\n`;
      }

      const latestExp = expectations?.results?.slice(-1)[0];
      if (latestExp) {
        block += `### Inflation Expectations\n| Date | 1Y | 5Y | 10Y |\n|------|-----|-----|-----|\n`;
        block += `| ${latestExp.date} | ${latestExp.model_1_year?.toFixed(2)}% | ${latestExp.model_5_year?.toFixed(2)}% | ${latestExp.model_10_year?.toFixed(2)}% |\n`;
      }

      return buildPrompt(prompt, block, 'Massive.com Federal Reserve Economic Data');
    }

    // ── STOCK ─────────────────────────────────────────────────────────────
    if (intent.type === 'stock' && intent.symbol) {
      // Multi-ticker comparison
      const isComparison = /\b(vs|versus|compare|against)\b/.test(q);
      if (isComparison) {
        const tickers = detectMultipleTickers(prompt);
        if (tickers.length >= 2) {
          const results = await Promise.all(tickers.map(t => fetchStockFull(t.symbol)));
          const blocks = results.map(r => formatStockBlock(r)).join('\n\n---\n\n');
          return buildPrompt(prompt, `## Stock Comparison\n\n${blocks}`, 'Massive.com Real-Time Equity Service');
        }
      }

      const data = await fetchStockFull(intent.symbol);
      return buildPrompt(prompt, formatStockBlock(data), 'Massive.com Real-Time Equity Service');
    }

    // ── OPTIONS ───────────────────────────────────────────────────────────
    if (intent.type === 'options' && intent.symbol) {
      // Detect call/put preference from prompt
      const wantsCalls = /\bcalls?\b/i.test(prompt);
      const wantsPuts = /\bputs?\b/i.test(prompt);
      const type = wantsCalls ? 'call' : wantsPuts ? 'put' : undefined;

      // Detect expiration from prompt (e.g. "June 20", "2025-06-20")
      const expMatch = prompt.match(/20\d{2}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]20\d{2}/);

      const [options, stockData] = await Promise.all([
        safe(type || expMatch
          ? getOptionsChainFilteredService(intent.symbol, { type, expiration: expMatch?.[0], limit: 25 })
          : getOptionsChainService(intent.symbol, 30)),
        safe(getStockQuoteService(intent.symbol)),
      ]);

      const stockPrice = stockData?.trade?.p || stockData?.quote?.P;
      let block = '';
      if (stockPrice) block += `**${intent.symbol} Current Price: $${stockPrice}** (${stockData?.quote?.t ? 'Delayed' : 'Live'})\n\n`;
      block += formatOptionsBlock(options, intent.symbol);

      return buildPrompt(prompt, block, 'Massive.com Options Chain Real-Time Service');
    }

    // ── CRYPTO ────────────────────────────────────────────────────────────
    if (intent.type === 'crypto' && intent.symbol) {
      // Multi-crypto comparison
      const isComparison = /\b(vs|versus|compare|against)\b/.test(q);
      if (isComparison) {
        const tickers = detectMultipleTickers(prompt);
        if (tickers.length >= 2) {
          const results = await Promise.all(tickers.map(t => fetchCryptoFull(t.symbol)));
          const blocks = results.map(r => formatCryptoBlock(r)).join('\n\n---\n\n');
          return buildPrompt(prompt, `## Crypto Comparison\n\n${blocks}`, 'Massive.com Real-Time Crypto Service');
        }
      }

      const data = await fetchCryptoFull(intent.symbol);
      return buildPrompt(prompt, formatCryptoBlock(data), 'Massive.com Real-Time Crypto Service');
    }

    // ── FOREX ─────────────────────────────────────────────────────────────
    if (intent.type === 'forex' && intent.symbol) {
      const data = await fetchForexFull(intent.symbol);
      return buildPrompt(prompt, formatForexBlock(data), 'Massive.com Real-Time Forex Service');
    }

    // ── NEWS ──────────────────────────────────────────────────────────────
    if (intent.type === 'news') {
      const ticker = intent.symbol;
      const news = await fetchStockNews(ticker || 'SPY');
      if (!Array.isArray(news) || news.length === 0) return prompt;

      let block = ticker
        ? `## Latest News for ${ticker}\n`
        : `## Latest Market News\n`;

      news.slice(0, 5).forEach((n, i) => {
        if (!n.title) return;
        block += `\n### ${i + 1}. ${n.title}\n`;
        block += `- **Publisher:** ${n.publisher?.name || 'Unknown'}\n`;
        block += `- **Published:** ${n.published_utc?.slice(0, 19).replace('T', ' ')} UTC\n`;
        if (n.description) block += `- **Summary:** ${n.description.slice(0, 200)}\n`;
        if (n.article_url) block += `- **URL:** ${n.article_url}\n`;
        if (n.tickers?.length) block += `- **Tickers:** ${n.tickers.slice(0, 5).join(', ')}\n`;
      });

      return buildPrompt(prompt, block, 'Massive.com Market News Service (via Polygon)');
    }

    // ── EARNINGS ──────────────────────────────────────────────────────────
    if (intent.type === 'earnings' && intent.symbol) {
      // For earnings, fetch news + financials ratios (earnings endpoint is on premium plan)
      const [ratios, news] = await Promise.all([
        safe(getStockFinancialsRatiosService(intent.symbol)),
        safe(getMarketNewsService(intent.symbol, 5)),
      ]);

      let block = `## ${intent.symbol} — Earnings & Financial Data\n\n`;

      if (ratios) {
        block += `### Key Metrics (as of ${ratios.date})\n`;
        block += `| Metric | Value |\n|--------|-------|\n`;
        if (ratios.earnings_per_share) block += `| EPS | **$${ratios.earnings_per_share?.toFixed(2)}** |\n`;
        if (ratios.price_to_earnings) block += `| P/E Ratio | **${ratios.price_to_earnings?.toFixed(2)}** |\n`;
        if (ratios.market_cap) block += `| Market Cap | **$${(ratios.market_cap / 1e9).toFixed(2)}B** |\n`;
        if (ratios.price) block += `| Price | $${ratios.price} |\n`;
        if (ratios.average_volume) block += `| Avg Volume | ${(ratios.average_volume / 1e6).toFixed(2)}M |\n`;
        block += '\n';
      }

      if (Array.isArray(news) && news.length > 0) {
        block += `### Recent Earnings News\n`;
        news.filter(n => n.title?.toLowerCase().includes('earn') ||
                         n.title?.toLowerCase().includes('revenue') ||
                         n.title?.toLowerCase().includes('profit') || true)
          .slice(0, 3)
          .forEach((n, i) => {
            if (n.title) block += `${i + 1}. **${n.title}** — ${n.publisher?.name} (${n.published_utc?.slice(0, 10)})\n`;
          });
      }

      return buildPrompt(prompt, block, 'Massive.com Financial Data & News Service');
    }

    // ── IPO / EVENTS ──────────────────────────────────────────────────────
    if (/\bipo\b|\binitial public offering\b/i.test(q)) {
      const ipos = await safe(getIPOsService(10));
      if (!ipos?.length) return prompt;

      let block = `## Upcoming IPOs\n`;
      block += `| Company | Ticker | Expected Date | Exchange |\n|---------|--------|---------------|----------|\n`;
      ipos.slice(0, 10).forEach(ipo => {
        block += `| ${ipo.company_name || 'N/A'} | **${ipo.ticker || 'N/A'}** | ${ipo.ipo_date || 'TBD'} | ${ipo.primary_exchange || 'N/A'} |\n`;
      });

      return buildPrompt(prompt, block, 'Massive.com IPO Calendar Service');
    }

  } catch (err) {
    logger.error('[MassiveRouter] Error in routeAndEnhancePrompt:', err.message);
  }

  return prompt; // Safe fallback — never breaks the AI pipeline
};

export const massiveSmartRouter = {
  routeAndEnhancePrompt,
  detectFinancialIntent,
  detectMultipleTickers,
};
