/**
 * Massive Smart Router — v5 Complete
 *
 * Verified API coverage (api.massive.com):
 *   Stocks        ✅ Quote, Snapshot, Financials, RSI, MACD, EMA, SMA, News
 *   Fundamentals  ✅ Income Statement, Balance Sheet, Ratios, Dividends, Splits, Float
 *   Options       ✅ Chain, Filtered (calls/puts/expiry)
 *   Crypto        ✅ Snapshot, Trades, RSI, MACD, EMA, Technical
 *   Forex         ✅ Snapshot, Conversion + all major/minor/exotic pairs + Aggregates
 *   Indices       ✅ via ETF proxies (SPY/QQQ/DIA/IWM/VIXY/TLT)
 *   Commodities   ✅ via ETF proxies (GLD/SLV/USO/UNG/WEAT/CORN)
 *   Macro/Fed     ✅ CPI, Treasury Yields, Labor Market, Inflation Expectations
 *   Market Status ✅ Status (open/closed/extended), Holidays
 *   Technical     ✅ RSI, MACD, EMA-50, EMA-200, SMA-50, SMA-200
 *   News          ✅ listNews with ticker filter + Benzinga analyst ratings
 *   IPO           ✅ IPO calendar
 *   Market Overview ✅ Full dashboard: Indices + BTC + Gold + Oil + VIX (1 batch call)
 *   Sector Perf   ✅ All 11 S&P sectors (XLK, XLF, XLV, XLE, XLI, XLC...)
 *   Stock Groups  ✅ FAANG, Mag7, Big Banks, Chips, EV, Biotech, Airlines
 *   Crypto Overview ✅ Top 7 cryptos with RSI
 *   Forex Overview  ✅ All 7 major pairs in one shot
 *   Compare       ✅ Multi-ticker side-by-side with P/E, RSI, margins, news
 *   Analyst       ✅ Benzinga ratings, price targets, buy/hold/sell consensus
 */

import { sportsSmartRouter } from './sportsSmartRouter.js';

import {
  getStockQuoteService,
  getStocksSnapshotTickersService,
  getTickerDetailsService,
  getPreviousCloseService,
  getStockFinancialsRatiosService,
  getStockIncomeStatementService,
  getStockBalanceSheetsService,
  getDividendsService,
  getStockSplitsService,
  getStockFloatService,
  getStockRSIService,
  getStockMACDService,
  getStockEMAService,
  getStockSMAService,
  getStockTechnicalSnapshotService,
  getStockNewsService,
  getOptionsChainService,
  getOptionsChainFilteredService,
  listOptionsContractsService,
  getCryptoSnapshotService,
  getCryptoTradesService,
  getCryptoRSIService,
  getCryptoMACDService,
  getCryptoEMAService,
  getCryptoTechnicalSnapshotService,
  getCryptoAggregatesService,
  getForexSnapshotService,
  getCurrencyConversionService,
  getCurrencyConvertAmountService,
  getForexAggregatesService,
  getFedInflationService,
  getFedYieldsService,
  getFedLaborMarketService,
  getFedInflationExpectationsService,
  getMarketStatusService,
  getMarketHolidaysService,
  getMarketNewsService,
  getMarketNewsGlobalService,
  getIPOsService,
  getStock52WeekService,
  getTopMoversService,
  getDividendDetailService,
  getShortInterestDetailService,
} from '../modules/massive/massive.service.js';

import { logger } from '../../shared/logger.js';
import { RedisClient } from '../../shared/redis.js';
import {
  detectFinancialIntent,
  detectMultipleTickers,
  COMMODITY_MAP,
  INDEX_MAP,
  TECHNICAL_KEYWORDS,
  GROUP_STOCK_MAP,
} from './massiveTickerDB.js';

// ─── Cache TTLs (seconds) ─────────────────────────────────────────────────────
const TTL = {
  quote: 30,
  crypto: 20,
  forex: 20,
  options: 45,
  news: 120,
  macro: 300,
  status: 60,
  holidays: 3600,
  financials: 900,
  technicals: 60,
  etf: 30,
  overview: 45,        // market overview dashboard
  sector: 60,          // sector performance
  group: 30,           // stock groups (FAANG, Mag7)
  crypto_overview: 30, // crypto market overview
  forex_overview: 20,  // all major forex pairs
  premarket: 15,       // pre/after-market (very fresh)
  earnings: 1800,      // earnings data (30 min cache)
  analyst: 3600,       // analyst ratings (1 hr cache)
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

// ─── Safe wrapper (3s timeout) ───────────────────────────────────────────────
function safe(promise, ms = 3000) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('Massive API timeout')), ms)),
  ]).catch(err => {
    logger.warn(`[MassiveRouter] ${err.message}`);
    return null;
  });
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt = (ticker) => ticker.toUpperCase().trim();
const toCryptoTicker = (sym) => {
  const s = sym.toUpperCase().replace(/USD$/, '');
  return s.startsWith('X:') ? s : `X:${s}USD`;
};
const toForexTicker = (sym) => {
  const s = sym.toUpperCase().replace('/', '').replace('C:', '');
  if (s.startsWith('C:')) return s;
  return s.length === 6 ? `C:${s}` : `C:${s}USD`;
};

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
▸ ALWAYS cite "[Source: Massive.com]" at the top of your answer
▸ Present ALL prices, rates, numbers in **BOLD**
▸ Use Markdown tables for options chains, comparisons, multi-asset data
▸ NEVER hallucinate or fabricate any price, rate, or statistic
▸ If data is delayed/after-hours, clearly state that
▸ Answer the user's EXACT question using only the verified data above
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User Query: ${userPrompt}`;
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function fetchStockFull(ticker) {
  const t = fmt(ticker);
  const cached = await cacheGet(`stock:${t}`);
  if (cached) return cached;
  const [quote, ratios, rsi, news, details] = await Promise.all([
    safe(getStockQuoteService(t)),
    safe(getStockFinancialsRatiosService(t)),
    safe(getStockRSIService(t, 14)),
    safe(getStockNewsService(t, 3)),
    safe(getTickerDetailsService(t)),
  ]);
  const data = { ticker: t, quote, ratios, rsi, news, details };
  await cacheSet(`stock:${t}`, data, TTL.quote);
  return data;
}

async function fetchETFData(ticker) {
  const t = fmt(ticker);
  const cached = await cacheGet(`etf:${t}`);
  if (cached) return cached;
  const [snapshots, prev, news] = await Promise.all([
    safe(getStocksSnapshotTickersService([t])),
    safe(getStockQuoteService(t)),
    safe(getStockNewsService(t, 3)),
  ]);
  const snap = Array.isArray(snapshots) ? snapshots.find(s => s.ticker === t) : snapshots?.[0];
  const data = { ticker: t, snap, prev, news };
  await cacheSet(`etf:${t}`, data, TTL.etf);
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
  const s = symbol.toUpperCase().replace('/', '').replace('C:', '');
  const from = s.slice(0, 3);
  const to = s.slice(3, 6) || 'USD';
  const [snapshot, conversion] = await Promise.all([
    safe(getForexSnapshotService([forexTicker])),
    safe(getCurrencyConversionService(from, to, 1)),
  ]);
  const data = { symbol, forexTicker, snapshot, conversion, from, to };
  await cacheSet(`forex:${forexTicker}`, data, TTL.forex);
  return data;
}

async function fetchMacroFull() {
  const cached = await cacheGet('macro_full');
  if (cached) return cached;
  // Use date.gte to get recent data (API returns oldest-first by default, no sort=desc support)
  const cutoff = '2024-01-01';
  const [inflation, yields, labor, expectations] = await Promise.all([
    safe(getFedInflationService(12)),
    safe(getFedYieldsService(30)),
    safe(getFedLaborMarketService(6)),
    safe(getFedInflationExpectationsService(6)),
  ]);
  // Get latest entry from each dataset
  const data = {
    inflation: Array.isArray(inflation?.results) ? inflation.results.at(-1) : null,
    yields: Array.isArray(yields?.results) ? yields.results.at(-1) : null,
    labor: Array.isArray(labor?.results) ? labor.results.at(-1) : null,
    expectations: Array.isArray(expectations?.results) ? expectations.results.at(-1) : null,
    allInflation: Array.isArray(inflation?.results) ? inflation.results.slice(-6) : [],
    allYields: Array.isArray(yields?.results) ? yields.results.slice(-5) : [],
  };
  await cacheSet('macro_full', data, TTL.macro);
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

async function fetchTechnicals(ticker) {
  const t = fmt(ticker);
  const cached = await cacheGet(`tech:${t}`);
  if (cached) return cached;
  const data = await safe(getStockTechnicalSnapshotService(t), 8000);
  if (data) await cacheSet(`tech:${t}`, data, TTL.technicals);
  return data;
}

// ─── Batch overview fetchers ──────────────────────────────────────────────────

async function fetchMarketOverview() {
  const cached = await cacheGet('market_overview');
  if (cached) return cached;
  // Two parallel batch calls — one for equity ETFs+VIX, one for crypto
  const [equities, cryptos] = await Promise.all([
    safe(getStocksSnapshotTickersService(['SPY', 'QQQ', 'DIA', 'IWM', 'VIXY', 'GLD', 'USO', 'TLT']), 5000),
    safe(getCryptoSnapshotService(['X:BTCUSD', 'X:ETHUSD', 'X:SOLUSD']), 5000),
  ]);
  const data = { equities, cryptos };
  await cacheSet('market_overview', data, TTL.overview);
  return data;
}

async function fetchSectorPerformance() {
  const cached = await cacheGet('sectors');
  if (cached) return cached;
  const sectors = await safe(getStocksSnapshotTickersService(
    ['XLK', 'XLF', 'XLV', 'XLE', 'XLI', 'XLC', 'XLP', 'XLY', 'XLB', 'XLRE', 'XLU']
  ), 5000);
  await cacheSet('sectors', sectors, TTL.sector);
  return sectors;
}

async function fetchStockGroup(tickers) {
  const key = `group:${tickers.join(',')}`;
  const cached = await cacheGet(key);
  if (cached) return cached;
  const snapshots = await safe(getStocksSnapshotTickersService(tickers), 5000);
  await cacheSet(key, snapshots, TTL.group);
  return snapshots;
}

async function fetchCryptoOverview() {
  const cached = await cacheGet('crypto_overview');
  if (cached) return cached;
  const tickers = ['X:BTCUSD', 'X:ETHUSD', 'X:SOLUSD', 'X:XRPUSD', 'X:BNBUSD', 'X:DOGEUSD', 'X:ADAUSD'];
  const snapshots = await safe(getCryptoSnapshotService(tickers), 5000);
  await cacheSet('crypto_overview', snapshots, TTL.crypto_overview);
  return snapshots;
}

async function fetchForexOverview() {
  const cached = await cacheGet('forex_overview');
  if (cached) return cached;
  const pairs = ['C:EURUSD', 'C:GBPUSD', 'C:USDJPY', 'C:USDCHF', 'C:AUDUSD', 'C:USDCAD', 'C:NZDUSD'];
  const snapshots = await safe(getForexSnapshotService(pairs), 5000);
  await cacheSet('forex_overview', snapshots, TTL.forex_overview);
  return snapshots;
}

// ─── Format helpers ────────────────────────────────────────────────────────────

function formatStockBlock(data) {
  if (!data) return 'Stock data unavailable.';
  const { ticker, quote, ratios, rsi, news, details } = data;
  let block = `## ${ticker} — Live Market Data\n`;

  // Company info from ticker details
  if (details?.name) {
    block += `**${details.name}**`;
    if (details.market_cap) block += ` | Market Cap: **$${(details.market_cap / 1e9).toFixed(2)}B**`;
    if (details.primary_exchange) block += ` | Exchange: ${details.primary_exchange}`;
    block += `\n`;
  }

  if (quote?.trade?.p || quote?.quote?.P) {
    const lastPrice = quote.trade?.p;
    const bid = quote.quote?.p;
    const ask = quote.quote?.P;
    const prevClose = quote.previousClose?.c;
    const change = lastPrice && prevClose ? (lastPrice - prevClose).toFixed(2) : null;
    const changePct = lastPrice && prevClose ? (((lastPrice - prevClose) / prevClose) * 100).toFixed(2) : null;
    const dir = changePct !== null ? (parseFloat(changePct) >= 0 ? '\u{1F4C8}' : '\u{1F4C9}') : '';
    block += `\n### Price\n| Field | Value |\n|-------|-------|\n`;
    if (lastPrice) block += `| Last Price | **$${lastPrice.toLocaleString()}** |\n`;
    if (bid) block += `| Bid | **$${bid}** |\n`;
    if (ask) block += `| Ask | **$${ask}** |\n`;
    if (prevClose) block += `| Prev Close | $${prevClose} |\n`;
    if (change) block += `| Day Change | **${dir} ${change} (${changePct}%)** |\n`;
    // Extended hours (pre-market / after-hours)
    if (quote.snapshot?.session) {
      const s = quote.snapshot.session;
      if (s.early_trading_change !== undefined && s.early_trading_change !== null) {
        const extDir = s.early_trading_change >= 0 ? '\u{1F4C8}' : '\u{1F4C9}';
        block += `| Pre-Market | **${extDir} ${s.early_trading_change?.toFixed(2)} (${s.early_trading_change_percent?.toFixed(2)}%)** |\n`;
      }
      if (s.late_trading_change !== undefined && s.late_trading_change !== null) {
        const extDir = s.late_trading_change >= 0 ? '\u{1F4C8}' : '\u{1F4C9}';
        block += `| After-Hours | **${extDir} ${s.late_trading_change?.toFixed(2)} (${s.late_trading_change_percent?.toFixed(2)}%)** |\n`;
      }
    }
  }

  if (ratios) {
    block += `\n### Key Metrics\n| Metric | Value |\n|--------|-------|\n`;
    if (ratios.price) block += `| Price | **$${ratios.price}** |\n`;
    if (ratios.market_cap) block += `| Market Cap | **$${(ratios.market_cap / 1e9).toFixed(2)}B** |\n`;
    if (ratios.price_to_earnings) block += `| P/E Ratio | ${ratios.price_to_earnings?.toFixed(2)} |\n`;
    if (ratios.price_to_book) block += `| P/B Ratio | ${ratios.price_to_book?.toFixed(2)} |\n`;
    if (ratios.price_to_sales) block += `| P/S Ratio | ${ratios.price_to_sales?.toFixed(2)} |\n`;
    if (ratios.earnings_per_share) block += `| EPS | $${ratios.earnings_per_share?.toFixed(2)} |\n`;
    if (ratios.average_volume) block += `| Avg Volume | ${(ratios.average_volume / 1e6).toFixed(2)}M |\n`;
    if (details?.description && !ratios.market_cap) {
      block += `\n> ${details.description?.slice(0, 200)}...\n`;
    }
  }

  if (rsi?.value !== undefined) {
    const rsiVal = parseFloat(rsi.value).toFixed(2);
    const rsiSignal = rsiVal > 70 ? '\u{1F534} Overbought' : rsiVal < 30 ? '\u{1F7E2} Oversold' : '\u26AA Neutral';
    block += `\n### Technical Indicator\n| RSI (14) | Signal |\n|----------|--------|\n| **${rsiVal}** | ${rsiSignal} |\n`;
  }

  if (Array.isArray(news) && news.length > 0) {
    block += `\n### Recent News\n`;
    news.slice(0, 3).forEach((n, i) => {
      if (n.title) block += `${i + 1}. **${n.title}** — ${n.publisher?.name || ''} (${n.published_utc?.slice(0, 10) || ''})\n`;
    });
  }
  return block;
}

function formatETFBlock(data, label) {
  if (!data) return `${label} data unavailable.`;
  const { ticker, snap, prev, news } = data;
  let block = `## ${label} (${ticker}) — Live Data\n`;

  if (snap) {
    block += `\n### Price\n| Field | Value |\n|-------|-------|\n`;
    if (snap.day?.c) block += `| Close | **$${snap.day.c.toLocaleString()}** |\n`;
    if (snap.day?.o) block += `| Open | $${snap.day.o.toLocaleString()} |\n`;
    if (snap.day?.h) block += `| High | **$${snap.day.h.toLocaleString()}** |\n`;
    if (snap.day?.l) block += `| Low | **$${snap.day.l.toLocaleString()}** |\n`;
    if (snap.todaysChange !== undefined) {
      const dir = snap.todaysChange >= 0 ? '📈' : '📉';
      block += `| Day Change | **${dir} ${snap.todaysChange?.toFixed(2)} (${snap.todaysChangePerc?.toFixed(2)}%)** |\n`;
    }
    if (snap.day?.v) block += `| Volume | ${snap.day.v.toLocaleString()} |\n`;
  }

  if (prev?.trade?.p) {
    block += `| Last Trade | **$${prev.trade.p}** |\n`;
  }

  if (Array.isArray(news) && news.length > 0) {
    block += `\n### Recent News\n`;
    news.slice(0, 2).forEach((n, i) => {
      if (n.title) block += `${i + 1}. **${n.title}** — ${n.publisher?.name || ''} (${n.published_utc?.slice(0, 10) || ''})\n`;
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
    block += `\n### Price\n| Field | Value |\n|-------|-------|\n`;
    if (s.day?.c) block += `| Price | **$${s.day.c.toLocaleString()}** |\n`;
    if (s.todaysChange !== undefined) {
      const dir = s.todaysChange >= 0 ? '📈' : '📉';
      block += `| 24h Change | **${dir} ${s.todaysChange?.toFixed(2)} (${s.todaysChangePerc?.toFixed(2)}%)** |\n`;
    }
    if (s.day?.o) block += `| Open | $${s.day.o.toLocaleString()} |\n`;
    if (s.day?.h) block += `| High | $${s.day.h.toLocaleString()} |\n`;
    if (s.day?.l) block += `| Low | $${s.day.l.toLocaleString()} |\n`;
    if (s.day?.v) block += `| Volume | ${s.day.v.toLocaleString()} |\n`;
  }
  if (Array.isArray(trades) && trades.length > 0) {
    block += `\n### Last Trade\n| Price | Size |\n|-------|------|\n| **$${trades[0].price?.toLocaleString()}** | ${trades[0].size} |\n`;
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
  const { symbol, snapshot, conversion, from, to } = data;
  let block = `## ${symbol} — Live Forex Rate\n`;
  if (conversion) {
    block += `\n### Live Rate\n| Field | Value |\n|-------|-------|\n`;
    if (conversion.last?.bid) block += `| Bid | **${conversion.last.bid?.toFixed(5)}** |\n`;
    if (conversion.last?.ask) block += `| Ask | **${conversion.last.ask?.toFixed(5)}** |\n`;
    if (conversion.converted) block += `| 1 ${from} = | **${conversion.converted?.toFixed(5)} ${to}** |\n`;
  }
  if (Array.isArray(snapshot) && snapshot.length > 0) {
    const s = snapshot[0];
    block += `\n### Session (Today)\n| Field | Value |\n|-------|-------|\n`;
    if (s.day?.o) block += `| Open | ${s.day.o?.toFixed(5)} |\n`;
    if (s.day?.h) block += `| High | **${s.day.h?.toFixed(5)}** |\n`;
    if (s.day?.l) block += `| Low | **${s.day.l?.toFixed(5)}** |\n`;
    if (s.day?.c) block += `| Close | ${s.day.c?.toFixed(5)} |\n`;
    if (s.todaysChangePerc !== undefined) block += `| Day Change | ${s.todaysChangePerc >= 0 ? '+' : ''}${s.todaysChangePerc?.toFixed(4)}% |\n`;
  }
  return block;
}

function formatTechnicalBlock(data, ticker) {
  if (!data) return `Technical data for ${ticker} unavailable.`;
  const { rsi, macd, ema50, ema200, sma50, sma200 } = data;

  let block = `## ${ticker} — Technical Analysis\n`;

  // RSI
  if (rsi?.value !== undefined) {
    const rsiVal = parseFloat(rsi.value).toFixed(2);
    const rsiSignal = rsiVal > 70 ? '🔴 Overbought — potential sell signal' :
                      rsiVal < 30 ? '🟢 Oversold — potential buy signal' :
                      rsiVal > 55 ? '📈 Bullish momentum' :
                      rsiVal < 45 ? '📉 Bearish momentum' : '⚪ Neutral';
    block += `\n### RSI (14-day)\n| Value | Signal |\n|-------|--------|\n| **${rsiVal}** | ${rsiSignal} |\n`;
  }

  // MACD
  if (macd) {
    const macdSignal = macd.value > macd.signal ? '📈 Bullish crossover' : '📉 Bearish crossover';
    block += `\n### MACD (12, 26, 9)\n| Metric | Value |\n|--------|-------|\n`;
    block += `| MACD Line | **${macd.value?.toFixed(4)}** |\n`;
    block += `| Signal Line | ${macd.signal?.toFixed(4)} |\n`;
    block += `| Histogram | ${macd.histogram?.toFixed(4)} |\n`;
    block += `| Signal | ${macdSignal} |\n`;
  }

  // Moving Averages
  if (ema50 || ema200 || sma50 || sma200) {
    block += `\n### Moving Averages\n| Indicator | Value | Trend |\n|-----------|-------|-------|\n`;
    if (ema50) block += `| EMA-50 | **$${ema50?.toFixed(2)}** | — |\n`;
    if (ema200) block += `| EMA-200 | **$${ema200?.toFixed(2)}** | — |\n`;
    if (sma50) block += `| SMA-50 | **$${sma50?.toFixed(2)}** | — |\n`;
    if (sma200) block += `| SMA-200 | **$${sma200?.toFixed(2)}** | — |\n`;

    // Golden/Death cross
    if (sma50 && sma200) {
      if (sma50 > sma200) {
        block += `\n**📈 Golden Cross active:** SMA-50 ($${sma50?.toFixed(2)}) > SMA-200 ($${sma200?.toFixed(2)}) — long-term bullish signal\n`;
      } else {
        block += `\n**📉 Death Cross active:** SMA-50 ($${sma50?.toFixed(2)}) < SMA-200 ($${sma200?.toFixed(2)}) — long-term bearish signal\n`;
      }
    }
  }

  return block;
}

function formatOptionsBlock(options, underlyingTicker, stockPrice) {
  let block = '';
  if (stockPrice) block += `**${underlyingTicker} Current Price: $${stockPrice.toLocaleString()}**\n\n`;

  if (!options?.results?.length) return block + `Options chain — no data available for ${underlyingTicker}.`;

  block += `## ${underlyingTicker} — Options Chain\n\n`;
  block += `| Contract | Type | Strike | Expiry | Bid | Ask | IV | Delta | OI |\n`;
  block += `|----------|------|--------|--------|-----|-----|----|-------|----|\n`;
  options.results.slice(0, 20).forEach(c => {
    const d = c.details || {};
    const g = c.greeks || {};
    const q = c.lastQuote || {};
    block += `| ${d.ticker || ''} | ${d.contract_type || ''} | **$${d.strike_price}** | ${d.expiration_date} | ${q.B?.toFixed(2) ?? 'N/A'} | ${q.A?.toFixed(2) ?? 'N/A'} | ${c.implied_volatility ? (c.implied_volatility * 100).toFixed(1) + '%' : 'N/A'} | ${g.delta?.toFixed(3) ?? 'N/A'} | ${c.open_interest ?? 'N/A'} |\n`;
  });
  return block;
}

function formatMacroBlock(data) {
  const { inflation, yields, labor, expectations, allInflation, allYields } = data;
  let block = `## Federal Reserve & Macro Economic Data\n\n`;

  if (inflation) {
    block += `### CPI Inflation (Latest)\n| Date | CPI |\n|------|-----|\n| **${inflation.date}** | **${inflation.cpi}** |\n\n`;
  }

  if (allInflation?.length > 1) {
    block += `### CPI History (Recent)\n| Date | CPI |\n|------|-----|\n`;
    allInflation.slice(-6).reverse().forEach(r => {
      block += `| ${r.date} | ${r.cpi} |\n`;
    });
    block += '\n';
  }

  if (yields) {
    block += `### Treasury Yield Curve (Latest)\n| Date | 1Y | 5Y | 10Y |\n|------|-----|-----|-----|\n`;
    block += `| **${yields.date}** | **${yields.yield_1_year}%** | **${yields.yield_5_year}%** | **${yields.yield_10_year}%** |\n\n`;
  }

  if (labor) {
    block += `### Labor Market (Latest)\n| Date | Unemployment | Participation Rate |\n|------|-------------|--------------------|\n`;
    block += `| **${labor.date}** | **${labor.unemployment_rate}%** | ${labor.labor_force_participation_rate}% |\n\n`;
  }

  if (expectations) {
    block += `### Inflation Expectations (Model)\n| Date | 1Y | 5Y | 10Y | 30Y |\n|------|-----|-----|-----|-----|\n`;
    block += `| **${expectations.date}** | ${expectations.model_1_year?.toFixed(2)}% | ${expectations.model_5_year?.toFixed(2)}% | ${expectations.model_10_year?.toFixed(2)}% | ${expectations.model_30_year?.toFixed(2)}% |\n`;
  }

  return block;
}

// ─── Main Router ───────────────────────────────────────────────────────────────

const routeAndEnhancePrompt = async (prompt) => {
  if (!prompt || typeof prompt !== 'string') return prompt;

  try {
    const intent = detectFinancialIntent(prompt);
    if (!intent) return prompt;

    logger.info(`[MassiveRouter] Intent: ${intent.type} | Symbol: ${intent.symbol || 'N/A'}`);
    const q = prompt.toLowerCase();
    const isComparison = /\b(vs|versus|compare|against)\b/.test(q);

    // ── MARKET STATUS ─────────────────────────────────────────────────────
    if (intent.type === 'market_status') {
      const { status, holidays } = await fetchMarketStatus();
      if (!status) return prompt;
      let block = `## Current Market Status\n| Market | Status |\n|--------|--------|\n`;
      block += `| Overall | **${status.market?.toUpperCase()}** |\n`;
      block += `| NYSE | ${status.exchanges?.nyse || 'N/A'} |\n`;
      block += `| NASDAQ | ${status.exchanges?.nasdaq || 'N/A'} |\n`;
      block += `| Crypto | ${status.currencies?.crypto || 'N/A'} |\n`;
      block += `| Forex | ${status.currencies?.fx || 'N/A'} |\n`;
      block += `| After Hours | ${status.afterHours ? 'Yes' : 'No'} |\n`;
      block += `| Early Hours | ${status.earlyHours ? 'Yes' : 'No'} |\n`;
      block += `| Server Time | ${status.serverTime} |\n`;
      if (Array.isArray(holidays) && holidays.length > 0) {
        block += `\n## Upcoming Market Holidays\n| Date | Exchange | Holiday | Status |\n|------|----------|---------|--------|\n`;
        const seen = new Set();
        holidays.filter(h => !seen.has(h.date + h.name) && seen.add(h.date + h.name))
          .slice(0, 5).forEach(h => { block += `| ${h.date} | ${h.exchange} | ${h.name} | ${h.status} |\n`; });
      }
      return buildPrompt(prompt, block, 'Massive.com Global Market Status Service');
    }

    // ── MACRO / FED ────────────────────────────────────────────────────────
    if (intent.type === 'macro') {
      const data = await fetchMacroFull();
      return buildPrompt(prompt, formatMacroBlock(data), 'Massive.com Federal Reserve Economic Data');
    }

    // ── MARKET OVERVIEW — Full Dashboard ──────────────────────────────────
    if (intent.type === 'market_overview') {
      const { equities, cryptos } = await fetchMarketOverview();

      const LABELS = {
        SPY: 'S&P 500', QQQ: 'NASDAQ 100', DIA: 'Dow Jones', IWM: 'Russell 2000',
        VIXY: 'VIX', GLD: 'Gold', USO: 'Crude Oil', TLT: '20Y Treasury',
      };
      const CRYPTO_LABELS = {
        'X:BTCUSD': 'Bitcoin (BTC)', 'X:ETHUSD': 'Ethereum (ETH)', 'X:SOLUSD': 'Solana (SOL)',
      };

      let block = `## 📊 Market Overview — Live Dashboard\n\n`;

      // Equity indices & assets
      if (Array.isArray(equities) && equities.length > 0) {
        block += `### Indices & Key Assets\n| Asset | Price | Change | Change % | Volume |\n|-------|-------|--------|----------|--------|\n`;
        equities.forEach(s => {
          const label = LABELS[s.ticker] || s.ticker;
          const price = s.day?.c?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || 'N/A';
          const change = s.todaysChange !== undefined ? s.todaysChange : (s.day?.c && s.day?.o ? s.day.c - s.day.o : null);
          const changePct = s.todaysChangePerc !== undefined ? s.todaysChangePerc : (s.day?.c && s.day?.o ? ((s.day.c - s.day.o) / s.day.o) * 100 : null);
          const dir = change !== null ? (change >= 0 ? '📈 +' : '📉 ') : '';
          const chg = change !== null ? `${dir}${Math.abs(change).toFixed(2)}` : 'N/A';
          const chgPct = changePct !== null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : 'N/A';
          const vol = s.day?.v ? (s.day.v / 1e6).toFixed(1) + 'M' : 'N/A';
          block += `| **${label}** | **$${price}** | ${chg} | ${chgPct} | ${vol} |\n`;
        });
      }

      // Crypto section
      if (Array.isArray(cryptos) && cryptos.length > 0) {
        block += `\n### Crypto\n| Asset | Price | 24h Change | 24h Change % |\n|-------|-------|------------|-------------|\n`;
        cryptos.forEach(s => {
          const label = CRYPTO_LABELS[s.ticker] || s.ticker;
          const price = s.day?.c?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || 'N/A';
          const change = s.todaysChange;
          const changePct = s.todaysChangePerc;
          const dir = change >= 0 ? '📈 +' : '📉 ';
          block += `| **${label}** | **$${price}** | ${dir}${Math.abs(change || 0).toFixed(2)} | ${changePct >= 0 ? '+' : ''}${(changePct || 0).toFixed(2)}% |\n`;
        });
      }

      return buildPrompt(prompt, block, 'Massive.com Real-Time Market Overview Dashboard');
    }

    // ── SECTOR PERFORMANCE ────────────────────────────────────────────────
    if (intent.type === 'sector') {
      const SECTOR_LABELS = {
        XLK: '💻 Technology', XLF: '🏦 Financials', XLV: '⚕️ Health Care',
        XLE: '⚡ Energy', XLI: '🏭 Industrials', XLC: '📡 Communication',
        XLP: '🛒 Consumer Staples', XLY: '🛍️ Consumer Disc.', XLB: '🪨 Materials',
        XLRE: '🏠 Real Estate', XLU: '💡 Utilities',
      };

      const sectors = await fetchSectorPerformance();

      let block = `## 📊 S&P 500 Sector Performance\n\n`;
      if (Array.isArray(sectors) && sectors.length > 0) {
        // Sort by % change descending
        const sorted = [...sectors].sort((a, b) => (b.todaysChangePerc || 0) - (a.todaysChangePerc || 0));
        block += `| Sector | ETF | Price | Change % | Volume |\n|--------|-----|-------|----------|--------|\n`;
        sorted.forEach(s => {
          const label = SECTOR_LABELS[s.ticker] || s.ticker;
          const price = s.day?.c?.toFixed(2) || 'N/A';
          const changePct = s.todaysChangePerc !== undefined ? s.todaysChangePerc
            : (s.day?.c && s.day?.o ? ((s.day.c - s.day.o) / s.day.o) * 100 : null);
          const dir = changePct !== null ? (changePct >= 0 ? '📈 +' : '📉 ') : '';
          const chgStr = changePct !== null ? `**${dir}${Math.abs(changePct).toFixed(2)}%**` : 'N/A';
          const vol = s.day?.v ? (s.day.v / 1e6).toFixed(1) + 'M' : 'N/A';
          block += `| ${label} | ${s.ticker} | $${price} | ${chgStr} | ${vol} |\n`;
        });
        // Best/worst summary
        const best = sorted[0];
        const worst = sorted[sorted.length - 1];
        block += `\n**🏆 Best:** ${SECTOR_LABELS[best?.ticker] || best?.ticker} (+${best?.todaysChangePerc?.toFixed(2)}%)\n`;
        block += `**📉 Worst:** ${SECTOR_LABELS[worst?.ticker] || worst?.ticker} (${worst?.todaysChangePerc?.toFixed(2)}%)\n`;
      }
      return buildPrompt(prompt, block, 'Massive.com Real-Time Sector Performance Service');
    }

    // ── NAMED STOCK GROUPS (FAANG, Mag7, etc.) ───────────────────────────
    if (intent.type === 'stock_group') {
      const groupTickers = intent.tickers;
      const groupName = intent.symbol;
      const snapshots = await fetchStockGroup(groupTickers);

      let block = `## 📊 ${groupName.toUpperCase()} — Live Prices\n\n`;
      if (Array.isArray(snapshots) && snapshots.length > 0) {
        block += `| Company | Ticker | Price | Change | Change % | Volume |\n|---------|--------|-------|--------|----------|--------|\n`;
        // Sort to match original group order
        const ordered = groupTickers.map(t => snapshots.find(s => s.ticker === t)).filter(Boolean);
        ordered.forEach(s => {
          const price = s.day?.c?.toFixed(2) || 'N/A';
          const change = s.todaysChange !== undefined ? s.todaysChange : (s.day?.c && s.day?.o ? s.day.c - s.day.o : null);
          const changePct = s.todaysChangePerc !== undefined ? s.todaysChangePerc
            : (s.day?.c && s.day?.o ? ((s.day.c - s.day.o) / s.day.o) * 100 : null);
          const dir = change !== null ? (change >= 0 ? '📈 +' : '📉 ') : '';
          const chg = change !== null ? `${dir}${Math.abs(change).toFixed(2)}` : 'N/A';
          const chgPct = changePct !== null ? `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%` : 'N/A';
          const vol = s.day?.v ? (s.day.v / 1e6).toFixed(1) + 'M' : 'N/A';
          block += `| — | **${s.ticker}** | **$${price}** | ${chg} | ${chgPct} | ${vol} |\n`;
        });
        // Best and worst
        const withPct = ordered.filter(s => s.todaysChangePerc !== undefined);
        if (withPct.length > 0) {
          const best = withPct.reduce((a, b) => (b.todaysChangePerc > a.todaysChangePerc ? b : a));
          const worst = withPct.reduce((a, b) => (b.todaysChangePerc < a.todaysChangePerc ? b : a));
          block += `\n**🏆 Best:** ${best.ticker} (+${best.todaysChangePerc?.toFixed(2)}%) | **📉 Worst:** ${worst.ticker} (${worst.todaysChangePerc?.toFixed(2)}%)\n`;
        }
      }
      return buildPrompt(prompt, block, `Massive.com Real-Time ${groupName.toUpperCase()} Group Service`);
    }

    // ── CRYPTO MARKET OVERVIEW ────────────────────────────────────────────
    if (intent.type === 'crypto_overview') {
      const CRYPTO_NAMES = {
        'X:BTCUSD': 'Bitcoin (BTC)', 'X:ETHUSD': 'Ethereum (ETH)', 'X:SOLUSD': 'Solana (SOL)',
        'X:XRPUSD': 'XRP', 'X:BNBUSD': 'BNB', 'X:DOGEUSD': 'Dogecoin (DOGE)', 'X:ADAUSD': 'Cardano (ADA)',
      };
      const snapshots = await fetchCryptoOverview();
      let block = `## 🌐 Crypto Market Overview\n\n`;
      if (Array.isArray(snapshots) && snapshots.length > 0) {
        block += `| Asset | Price | 24h Change | 24h Change % | Volume |\n|-------|-------|------------|-------------|--------|\n`;
        snapshots.forEach(s => {
          const label = CRYPTO_NAMES[s.ticker] || s.ticker;
          const price = s.day?.c?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || 'N/A';
          const change = s.todaysChange;
          const changePct = s.todaysChangePerc;
          const dir = (change || 0) >= 0 ? '📈 +' : '📉 ';
          const vol = s.day?.v ? s.day.v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : 'N/A';
          block += `| **${label}** | **$${price}** | ${dir}${Math.abs(change || 0).toFixed(2)} | ${(changePct || 0) >= 0 ? '+' : ''}${(changePct || 0).toFixed(2)}% | ${vol} |\n`;
        });
        // Market sentiment
        const gainers = snapshots.filter(s => (s.todaysChangePerc || 0) > 0).length;
        const losers = snapshots.length - gainers;
        block += `\n**Market Sentiment:** ${gainers}/${snapshots.length} coins up | ${losers}/${snapshots.length} coins down\n`;
      }
      return buildPrompt(prompt, block, 'Massive.com Real-Time Crypto Market Overview');
    }

    // ── FOREX MARKET OVERVIEW ─────────────────────────────────────────────
    if (intent.type === 'forex_overview') {
      const PAIR_NAMES = {
        'C:EURUSD': 'EUR/USD 🇪🇺', 'C:GBPUSD': 'GBP/USD 🇬🇧', 'C:USDJPY': 'USD/JPY 🇯🇵',
        'C:USDCHF': 'USD/CHF 🇨🇭', 'C:AUDUSD': 'AUD/USD 🇦🇺', 'C:USDCAD': 'USD/CAD 🇨🇦',
        'C:NZDUSD': 'NZD/USD 🇳🇿',
      };
      const snapshots = await fetchForexOverview();
      let block = `## 💱 Major Forex Pairs — Live Rates\n\n`;
      if (Array.isArray(snapshots) && snapshots.length > 0) {
        block += `| Pair | Rate | Bid | Ask | Day Change % |\n|------|------|-----|-----|--------------|\n`;
        snapshots.forEach(s => {
          const label = PAIR_NAMES[s.ticker] || s.ticker;
          const rate = s.day?.c?.toFixed(5) || 'N/A';
          const bid = s.lastQuote?.b?.toFixed(5) || 'N/A';
          const ask = s.lastQuote?.a?.toFixed(5) || 'N/A';
          const changePct = s.todaysChangePerc;
          const dir = (changePct || 0) >= 0 ? '📈 +' : '📉 ';
          block += `| **${label}** | **${rate}** | ${bid} | ${ask} | ${dir}${Math.abs(changePct || 0).toFixed(4)}% |\n`;
        });
      }
      return buildPrompt(prompt, block, 'Massive.com Real-Time Forex Market Overview');
    }

    // ── TOP MOVERS (Gainers / Losers / Most Active) ───────────────────────
    if (intent.type === 'movers') {
      const direction = intent.direction || 'gainers';
      const movers = await safe(getTopMoversService(direction), 8000);
      const title = direction === 'gainers' ? '📈 Top Gainers' : direction === 'losers' ? '📉 Top Losers' : '🔥 Most Active Stocks';
      let block = `## ${title} — Live Today\n\n`;
      if (Array.isArray(movers) && movers.length > 0) {
        block += `| Rank | Ticker | Price | Change | Change % | Volume |\n|------|--------|-------|--------|----------|--------|\n`;
        movers.slice(0, 10).forEach((s, i) => {
          const price = s.day?.c?.toFixed(2) || 'N/A';
          const change = s.todaysChange;
          const changePct = s.todaysChangePerc;
          const dir = (change || 0) >= 0 ? '📈 +' : '📉 ';
          const vol = s.day?.v ? (s.day.v / 1e6).toFixed(1) + 'M' : 'N/A';
          block += `| ${i + 1} | **${s.ticker}** | **$${price}** | ${dir}${Math.abs(change || 0).toFixed(2)} | ${(changePct || 0) >= 0 ? '+' : ''}${(changePct || 0).toFixed(2)}% | ${vol} |\n`;
        });
      }
      return buildPrompt(prompt, block, `Massive.com Real-Time ${title} Service`);
    }

    // ── GLOBAL MARKET NEWS ────────────────────────────────────────────────
    if (intent.type === 'market_news') {
      const news = await safe(getMarketNewsGlobalService(8), 5000);
      let block = `## 📰 Latest Financial News\n\n`;
      if (Array.isArray(news) && news.length > 0) {
        news.slice(0, 8).forEach((n, i) => {
          if (n.title) {
            const date = n.published_utc?.slice(0, 10) || '';
            const pub = n.publisher?.name || '';
            block += `**${i + 1}. ${n.title}**\n`;
            if (pub || date) block += `> *${pub}${pub && date ? ' — ' : ''}${date}*\n`;
            if (n.description) block += `${n.description.slice(0, 200)}...\n`;
            block += '\n';
          }
        });
      }
      return buildPrompt(prompt, block, 'Massive.com Real-Time Market News Service');
    }

    // ── 52-WEEK HIGH / LOW ────────────────────────────────────────────────
    if (intent.type === 'week52') {
      const sym = intent.symbol;
      const [data52, quote] = await Promise.all([
        safe(getStock52WeekService(sym), 8000),
        safe(getStockQuoteService(sym), 5000),
      ]);
      let block = `## 📊 ${sym} — 52-Week Range\n\n`;
      if (data52) {
        block += `| Metric | Value |\n|--------|-------|\n`;
        if (data52.week52High) block += `| 52-Week High | **$${data52.week52High.toFixed(2)}** |\n`;
        if (data52.week52Low) block += `| 52-Week Low | **$${data52.week52Low.toFixed(2)}** |\n`;
        if (data52.currentClose) block += `| Current Price | **$${data52.currentClose.toFixed(2)}** |\n`;
        if (data52.pctFromHigh) block += `| % From 52-Wk High | ${data52.pctFromHigh}% |\n`;
        if (data52.pctFromLow) block += `| % From 52-Wk Low | +${data52.pctFromLow}% |\n`;
        if (data52.week52High && data52.week52Low) {
          const range = data52.week52High - data52.week52Low;
          block += `| 52-Wk Range | $${data52.week52Low.toFixed(2)} – $${data52.week52High.toFixed(2)} |\n`;
        }
      }
      return buildPrompt(prompt, block, `Massive.com 52-Week Range Service for ${sym}`);
    }

    // ── DIVIDEND DETAIL ───────────────────────────────────────────────────
    if (intent.type === 'dividend') {
      const sym = intent.symbol;
      const [divs, quote] = await Promise.all([
        safe(getDividendDetailService(sym, 4), 5000),
        safe(getStockQuoteService(sym), 5000),
      ]);
      let block = `## 💰 ${sym} — Dividend Information\n\n`;
      if (Array.isArray(divs) && divs.length > 0) {
        block += `| Ex-Dividend Date | Pay Date | Cash Amount | Frequency |\n|-----------------|----------|-------------|----------|\n`;
        const freqMap = { 1: 'Annual', 2: 'Semi-Annual', 4: 'Quarterly', 12: 'Monthly' };
        divs.slice(0, 4).forEach(d => {
          block += `| ${d.ex_dividend_date || 'N/A'} | ${d.pay_date || 'N/A'} | **$${d.cash_amount?.toFixed(4) || 'N/A'}** | ${freqMap[d.frequency] || d.frequency || 'N/A'} |\n`;
        });
        const annualDiv = divs[0]?.cash_amount && divs[0]?.frequency ? (divs[0].cash_amount * divs[0].frequency) : null;
        if (annualDiv) block += `\n**Estimated Annual Dividend:** $${annualDiv.toFixed(4)} per share\n`;
      } else {
        block += `*No dividend data found for ${sym}. This stock may not pay dividends.*\n`;
      }
      return buildPrompt(prompt, block, `Massive.com Dividend Data Service for ${sym}`);
    }

    // ── SHORT INTEREST ────────────────────────────────────────────────────
    if (intent.type === 'short_interest') {
      const sym = intent.symbol;
      const data = await safe(getShortInterestDetailService(sym, 3), 5000);
      let block = `## 🩳 ${sym} — Short Interest Data\n\n`;
      if (Array.isArray(data) && data.length > 0) {
        const latest = data[0];
        block += `| Metric | Value |\n|--------|-------|\n`;
        if (latest.short_interest) block += `| Short Interest | **${latest.short_interest.toLocaleString()} shares** |\n`;
        if (latest.avg_daily_volume) block += `| Avg Daily Volume | ${latest.avg_daily_volume.toLocaleString()} |\n`;
        if (latest.days_to_cover) block += `| Days to Cover | **${latest.days_to_cover.toFixed(2)} days** |\n`;
        if (latest.short_interest && latest.avg_daily_volume) {
          const shortPct = ((latest.short_interest / latest.avg_daily_volume) / 100).toFixed(2);
          block += `| Settlement Date | ${latest.settlement_date || 'N/A'} |\n`;
        }
        if (latest.days_to_cover > 10) {
          block += `\n⚠️ **High short interest** — ${latest.days_to_cover.toFixed(1)} days to cover suggests elevated squeeze risk.\n`;
        }
      } else {
        block += `*No short interest data available for ${sym}.*\n`;
      }
      return buildPrompt(prompt, block, `Massive.com Short Interest Service for ${sym}`);
    }

    // ── CURRENCY CONVERSION WITH AMOUNT ──────────────────────────────────
    if (intent.type === 'currency_convert') {
      const { from, to, amount } = intent;
      const result = await safe(getCurrencyConvertAmountService(from, to, amount), 5000);
      let block = `## 💱 Currency Conversion — Live Rate\n\n`;
      if (result) {
        block += `| | Value |\n|-|-------|\n`;
        block += `| You Send | **${amount.toLocaleString()} ${from}** |\n`;
        block += `| You Receive | **${result.converted?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${to}** |\n`;
        if (result.last?.ask) block += `| Live Ask Rate | ${result.last.ask} |\n`;
        if (result.last?.bid) block += `| Live Bid Rate | ${result.last.bid} |\n`;
        block += `| Pair | ${from}/${to} |\n`;
        if (result.last?.timestamp) {
          block += `| Rate Timestamp | ${new Date(result.last.timestamp).toISOString().replace('T', ' ').slice(0, 19)} UTC |\n`;
        }
      }
      return buildPrompt(prompt, block, `Massive.com Live Currency Conversion Service`);
    }

    // ── CRYPTO TECHNICAL ANALYSIS ─────────────────────────────────────────
    if (intent.type === 'crypto_technical') {
      const sym = intent.symbol; // e.g. BTCUSD
      const fullSym = sym.startsWith('X:') ? sym : `X:${sym}`;
      const [snapshot, technicals] = await Promise.all([
        safe(getCryptoSnapshotService([fullSym]), 5000),
        safe(getCryptoTechnicalSnapshotService(fullSym), 8000),
      ]);
      const snap = Array.isArray(snapshot) ? snapshot[0] : null;
      const label = sym.replace('USD', '/USD');
      let block = `## 🔬 ${label} — Technical Analysis\n\n`;
      if (snap) {
        block += `| Field | Value |\n|-------|-------|\n`;
        if (snap.day?.c) block += `| Price | **$${snap.day.c.toLocaleString('en-US', { minimumFractionDigits: 2 })}** |\n`;
        const changePct = snap.todaysChangePerc;
        if (changePct !== undefined) block += `| 24h Change | **${changePct >= 0 ? '📈 +' : '📉 '}${changePct.toFixed(2)}%** |\n`;
      }
      if (technicals) {
        block += `\n### Technical Indicators\n| Indicator | Value | Signal |\n|-----------|-------|--------|\n`;
        if (technicals.rsi?.value) {
          const rsi = technicals.rsi.value;
          const rsiSignal = rsi > 70 ? '🔴 Overbought' : rsi < 30 ? '🟢 Oversold' : '⚪ Neutral';
          block += `| RSI-14 | ${rsi.toFixed(2)} | ${rsiSignal} |\n`;
        }
        if (technicals.macd?.value !== undefined) {
          const macdSignal = technicals.macd.value > 0 ? '🟢 Bullish' : '🔴 Bearish';
          block += `| MACD | ${technicals.macd.value?.toFixed(2)} | ${macdSignal} |\n`;
          if (technicals.macd.histogram) block += `| MACD Histogram | ${technicals.macd.histogram?.toFixed(2)} | ${technicals.macd.histogram > 0 ? '↑ Expanding' : '↓ Contracting'} |\n`;
        }
        if (technicals.ema50?.value) block += `| EMA-50 | $${technicals.ema50.value.toLocaleString('en-US', { minimumFractionDigits: 2 })} | — |\n`;
        if (technicals.ema200?.value) block += `| EMA-200 | $${technicals.ema200.value.toLocaleString('en-US', { minimumFractionDigits: 2 })} | — |\n`;
        if (technicals.ema50?.value && technicals.ema200?.value) {
          const cross = technicals.ema50.value > technicals.ema200.value ? '🟢 Golden Cross (Bullish)' : '🔴 Death Cross (Bearish)';
          block += `| EMA Signal | — | **${cross}** |\n`;
        }
      }
      return buildPrompt(prompt, block, `Massive.com Crypto Technical Analysis for ${label}`);
    }

    // ── MARKET INDICES (via ETF proxies) ─────────────────────────────────
    if (intent.type === 'index') {
      const proxy = intent.symbol; // e.g. SPY, QQQ, DIA, IWM
      const indexName = intent.indexName || proxy;
      const displayNames = {
        SPY: 'S&P 500 (via SPY ETF)', QQQ: 'NASDAQ 100 (via QQQ ETF)',
        DIA: 'Dow Jones (via DIA ETF)', IWM: 'Russell 2000 (via IWM ETF)',
        VIXY: 'VIX Volatility (via VIXY ETF)', TLT: '20-Year Treasury (via TLT ETF)',
        IEF: '10-Year Treasury (via IEF ETF)', EEM: 'Emerging Markets (via EEM ETF)',
        EFA: 'Developed Markets (via EFA ETF)',
      };
      const label = displayNames[proxy] || `${indexName.toUpperCase()} (via ${proxy} ETF)`;

      const [snapshots, news] = await Promise.all([
        safe(getStocksSnapshotTickersService([proxy])),
        safe(getStockNewsService(proxy, 3)),
      ]);

      const snap = Array.isArray(snapshots) ? snapshots.find(s => s.ticker === proxy) || snapshots[0] : null;

      let block = `## ${label}\n`;
      if (snap) {
        block += `\n### Price\n| Field | Value |\n|-------|-------|\n`;
        if (snap.day?.c) block += `| Close | **$${snap.day.c.toLocaleString()}** |\n`;
        if (snap.day?.o) block += `| Open | $${snap.day.o.toLocaleString()} |\n`;
        if (snap.day?.h) block += `| High | **$${snap.day.h.toLocaleString()}** |\n`;
        if (snap.day?.l) block += `| Low | **$${snap.day.l.toLocaleString()}** |\n`;
        const change = snap.day?.c && snap.day?.o ? (snap.day.c - snap.day.o) : snap.todaysChange;
        const changePct = snap.day?.c && snap.day?.o
          ? (((snap.day.c - snap.day.o) / snap.day.o) * 100)
          : snap.todaysChangePerc;
        if (change !== undefined && change !== null) {
          const dir = change >= 0 ? '📈' : '📉';
          block += `| Day Change | **${dir} ${change?.toFixed(2)} (${changePct?.toFixed(2)}%)** |\n`;
        }
        if (snap.day?.v) block += `| Volume | ${snap.day.v.toLocaleString()} |\n`;
        if (snap.prevDay?.c) block += `| Prev Close | $${snap.prevDay.c.toLocaleString()} |\n`;
      }

      if (Array.isArray(news) && news.length > 0) {
        block += `\n### Recent News\n`;
        news.slice(0, 3).forEach((n, i) => {
          if (n.title) block += `${i + 1}. **${n.title}** — ${n.publisher?.name || ''} (${n.published_utc?.slice(0, 10) || ''})\n`;
        });
      }

      block += `\n> ℹ️ Index level data (I:SPX) is proxied via the ${proxy} ETF, which tracks the index 1:1.`;
      return buildPrompt(prompt, block, 'Massive.com Real-Time Market Index Service');
    }

    // ── COMMODITIES (via ETF proxies) ─────────────────────────────────────
    if (intent.type === 'commodity') {
      const proxy = intent.symbol;
      const commodityName = intent.commodityName || proxy;
      const displayNames = {
        GLD: 'Gold (via GLD ETF)', SLV: 'Silver (via SLV ETF)',
        USO: 'Crude Oil (via USO ETF)', UNG: 'Natural Gas (via UNG ETF)',
        GDX: 'Gold Miners (via GDX ETF)', PDBC: 'Commodities (via PDBC ETF)',
        WEAT: 'Wheat (via WEAT ETF)', CORN: 'Corn (via CORN ETF)',
        SOYB: 'Soybeans (via SOYB ETF)', CPER: 'Copper (via CPER ETF)',
      };
      const label = displayNames[proxy] || `${commodityName} (via ${proxy} ETF)`;

      const [snapshots, prev, news] = await Promise.all([
        safe(getStocksSnapshotTickersService([proxy])),
        safe(getStockQuoteService(proxy)),
        safe(getStockNewsService(proxy, 3)),
      ]);

      const snap = Array.isArray(snapshots) ? snapshots.find(s => s.ticker === proxy) || snapshots[0] : null;

      let block = `## ${label}\n`;
      if (snap) {
        block += `\n### Price\n| Field | Value |\n|-------|-------|\n`;
        if (snap.day?.c) block += `| Close | **$${snap.day.c.toFixed(3)}** |\n`;
        if (snap.day?.o) block += `| Open | $${snap.day.o.toFixed(3)} |\n`;
        if (snap.day?.h) block += `| High | **$${snap.day.h.toFixed(3)}** |\n`;
        if (snap.day?.l) block += `| Low | **$${snap.day.l.toFixed(3)}** |\n`;
        const change = snap.todaysChange ?? (snap.day?.c && snap.day?.o ? snap.day.c - snap.day.o : null);
        const changePct = snap.todaysChangePerc ?? (snap.day?.c && snap.day?.o ? ((snap.day.c - snap.day.o) / snap.day.o) * 100 : null);
        if (change !== null && change !== undefined) {
          block += `| Day Change | **${change >= 0 ? '📈 +' : '📉 '}${change?.toFixed(3)} (${changePct?.toFixed(2)}%)** |\n`;
        }
        if (snap.day?.v) block += `| Volume | ${snap.day.v.toLocaleString()} |\n`;
      }

      if (Array.isArray(news) && news.length > 0) {
        block += `\n### Recent News\n`;
        news.slice(0, 3).forEach((n, i) => {
          if (n.title) block += `${i + 1}. **${n.title}** — ${n.publisher?.name || ''} (${n.published_utc?.slice(0, 10) || ''})\n`;
        });
      }
      block += `\n> ℹ️ Commodity prices are via the ${proxy} ETF proxy (tracks spot price).`;
      return buildPrompt(prompt, block, `Massive.com Real-Time Commodity Service`);
    }

    // ── TECHNICAL ANALYSIS ────────────────────────────────────────────────
    if (intent.type === 'technical' && intent.symbol) {
      const [technicals, quote] = await Promise.all([
        fetchTechnicals(intent.symbol),
        safe(getStockQuoteService(intent.symbol)),
      ]);
      let block = '';
      const price = quote?.trade?.p || quote?.ratios?.price;
      if (price) block += `**${intent.symbol} Current Price: $${price.toLocaleString()}**\n\n`;
      block += formatTechnicalBlock(technicals, intent.symbol);
      return buildPrompt(prompt, block, 'Massive.com Technical Analysis Service');
    }

    // ── STOCK ─────────────────────────────────────────────────────────────
    if (intent.type === 'stock' && intent.symbol) {
      if (isComparison) {
        const tickers = detectMultipleTickers(prompt);
        if (tickers.length >= 2) {
          const results = await Promise.all(tickers.filter(t => t.type === 'stock').map(t => fetchStockFull(t.symbol)));
          const blocks = results.map(r => formatStockBlock(r)).join('\n\n---\n\n');
          return buildPrompt(prompt, `## Stock Comparison\n\n${blocks}`, 'Massive.com Real-Time Equity Service');
        }
      }
      const data = await fetchStockFull(intent.symbol);
      return buildPrompt(prompt, formatStockBlock(data), 'Massive.com Real-Time Equity Service');
    }

    // ── ETF ───────────────────────────────────────────────────────────────
    if (intent.type === 'etf' && intent.symbol) {
      const data = await fetchETFData(intent.symbol);
      return buildPrompt(prompt, formatETFBlock(data, intent.symbol), 'Massive.com Real-Time ETF Service');
    }

    // ── OPTIONS ───────────────────────────────────────────────────────────
    if (intent.type === 'options' && intent.symbol) {
      const wantsCalls = /\bcalls?\b/i.test(prompt);
      const wantsPuts = /\bputs?\b/i.test(prompt);
      const type = wantsCalls ? 'call' : wantsPuts ? 'put' : undefined;
      const expMatch = prompt.match(/20\d{2}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]20\d{2}/);

      const [options, stockData] = await Promise.all([
        safe(type || expMatch
          ? getOptionsChainFilteredService(intent.symbol, { type, expiration: expMatch?.[0], limit: 25 })
          : getOptionsChainService(intent.symbol, 30), 6000),
        safe(getStockQuoteService(intent.symbol)),
      ]);

      const stockPrice = stockData?.trade?.p;
      return buildPrompt(prompt, formatOptionsBlock(options, intent.symbol, stockPrice), 'Massive.com Options Chain Real-Time Service');
    }

    // ── CRYPTO ────────────────────────────────────────────────────────────
    if (intent.type === 'crypto' && intent.symbol) {
      if (isComparison) {
        const tickers = detectMultipleTickers(prompt);
        const cryptos = tickers.filter(t => t.type === 'crypto');
        if (cryptos.length >= 2) {
          const results = await Promise.all(cryptos.map(t => fetchCryptoFull(t.symbol)));
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
      const news = await safe(getMarketNewsService(ticker || 'SPY', 5));
      if (!Array.isArray(news) || news.length === 0) return prompt;
      let block = ticker ? `## Latest News for ${ticker}\n` : `## Latest Market News\n`;
      news.slice(0, 5).forEach((n, i) => {
        if (!n.title) return;
        block += `\n### ${i + 1}. ${n.title}\n`;
        block += `- **Publisher:** ${n.publisher?.name || 'Unknown'}\n`;
        block += `- **Published:** ${n.published_utc?.slice(0, 19).replace('T', ' ')} UTC\n`;
        if (n.description) block += `- **Summary:** ${n.description.slice(0, 200)}\n`;
        if (n.article_url) block += `- **URL:** ${n.article_url}\n`;
        if (n.tickers?.length) block += `- **Tickers:** ${n.tickers.slice(0, 5).join(', ')}\n`;
      });
      return buildPrompt(prompt, block, 'Massive.com Market News Service');
    }

    // ── EARNINGS ──────────────────────────────────────────────────────────
    if (intent.type === 'earnings' && intent.symbol) {
      const [ratios, news] = await Promise.all([
        safe(getStockFinancialsRatiosService(intent.symbol)),
        safe(getMarketNewsService(intent.symbol, 5)),
      ]);
      let block = `## ${intent.symbol} — Earnings & Financial Data\n\n`;
      if (ratios) {
        block += `### Key Metrics\n| Metric | Value |\n|--------|-------|\n`;
        if (ratios.earnings_per_share) block += `| EPS | **$${ratios.earnings_per_share?.toFixed(2)}** |\n`;
        if (ratios.price_to_earnings) block += `| P/E Ratio | **${ratios.price_to_earnings?.toFixed(2)}** |\n`;
        if (ratios.market_cap) block += `| Market Cap | **$${(ratios.market_cap / 1e9).toFixed(2)}B** |\n`;
        if (ratios.price) block += `| Price | $${ratios.price} |\n`;
        block += '\n';
      }
      if (Array.isArray(news) && news.length > 0) {
        block += `### Recent Earnings-Related News\n`;
        news.slice(0, 3).forEach((n, i) => {
          if (n.title) block += `${i + 1}. **${n.title}** — ${n.publisher?.name} (${n.published_utc?.slice(0, 10)})\n`;
        });
      }
      return buildPrompt(prompt, block, 'Massive.com Financial Data & News Service');
    }

    // ── IPO CALENDAR ──────────────────────────────────────────────────────
    if (intent.type === 'ipo_calendar' || /\bipo\b|\binitial public offering\b/i.test(q)) {
      const ipos = await safe(getIPOsService(), 8000);
      let block = `## 🚀 Upcoming IPO Calendar\n\n`;
      if (Array.isArray(ipos) && ipos.length > 0) {
        block += `| Company | Ticker | IPO Date | Exchange | Expected Price |
|---------|--------|----------|----------|----------------|
`;
        ipos.slice(0, 15).forEach(ipo => {
          const price = ipo.ipo_price ? `$${ipo.ipo_price}` : ipo.min_shares_offered ? 'TBD' : 'TBD';
          block += `| **${ipo.company_name || 'N/A'}** | ${ipo.ticker || '—'} | ${ipo.ipo_date || 'TBD'} | ${ipo.primary_exchange || 'N/A'} | ${price} |\n`;
        });
        block += `\n> 📌 IPO data sourced live from Massive.com. Dates and pricing subject to change.\n`;
      } else {
        block += `*No upcoming IPOs found at this time.*\n`;
      }
      return buildPrompt(prompt, block, 'Massive.com IPO Calendar Service');
    }

    // ── MULTI-TICKER COMPARISON ───────────────────────────────────────────
    if (intent.type === 'compare' && intent.symbols?.length >= 2) {
      const symbols = intent.symbols.slice(0, 3); // max 3-way comparison
      const results = await Promise.allSettled(symbols.map(sym => fetchStockFull(sym)));
      const stocks = results.map((r, i) => ({
        sym: symbols[i],
        data: r.status === 'fulfilled' ? r.value : null,
      }));

      let block = `## ⚖️ Stock Comparison: ${symbols.join(' vs ')}\n\n`;

      // Side-by-side price table
      block += `### 📊 Price & Performance\n| Metric | ${symbols.map(s => `**${s}**`).join(' | ')} |\n|--------|${symbols.map(() => '--------').join('|')}|\n`;

      const priceRow    = (d) => d?.quote?.trade?.p ? `$${d.quote.trade.p.toLocaleString()}` : 'N/A';
      const changeRow   = (d) => {
        const last = d?.quote?.trade?.p;
        const prev = d?.quote?.previousClose?.c;
        if (!last || !prev) return 'N/A';
        const chg = ((last - prev) / prev * 100).toFixed(2);
        return `${chg >= 0 ? '📈 +' : '📉 '}${chg}%`;
      };
      const mcapRow     = (d) => d?.details?.market_cap ? `$${(d.details.market_cap / 1e9).toFixed(2)}B` : 'N/A';
      const peRow       = (d) => d?.ratios?.price_to_earnings ? d.ratios.price_to_earnings.toFixed(2) : 'N/A';
      const epsRow      = (d) => d?.ratios?.earnings_per_share ? `$${d.ratios.earnings_per_share.toFixed(2)}` : 'N/A';
      const marginRow   = (d) => d?.ratios?.net_profit_margin ? `${(d.ratios.net_profit_margin * 100).toFixed(1)}%` : 'N/A';
      const rsiRow      = (d) => d?.rsi?.value ? d.rsi.value.toFixed(1) : 'N/A';
      const exchRow     = (d) => d?.details?.primary_exchange || 'N/A';
      const sectorRow   = (d) => d?.details?.sic_description || 'N/A';

      const rows = [
        ['Last Price',     priceRow],
        ['Day Change',     changeRow],
        ['Market Cap',     mcapRow],
        ['P/E Ratio',      peRow],
        ['EPS (TTM)',      epsRow],
        ['Net Margin',     marginRow],
        ['RSI-14',         rsiRow],
        ['Exchange',       exchRow],
        ['Sector',         sectorRow],
      ];

      rows.forEach(([label, fn]) => {
        block += `| ${label} | ${stocks.map(s => fn(s.data)).join(' | ')} |\n`;
      });

      // RSI signal summary
      const rsiVerdicts = stocks.map(s => {
        const rsi = s.data?.rsi?.value;
        if (!rsi) return `${s.sym}: N/A`;
        if (rsi > 70) return `${s.sym}: 🔴 Overbought (${rsi.toFixed(1)})`;
        if (rsi < 30) return `${s.sym}: 🟢 Oversold (${rsi.toFixed(1)})`;
        return `${s.sym}: ⚪ Neutral (${rsi.toFixed(1)})`;
      });
      block += `\n### 📡 RSI Signals\n${rsiVerdicts.map(v => `- ${v}`).join('\n')}\n`;

      // Recent news for each ticker
      block += `\n### 📰 Recent News\n`;
      stocks.forEach(s => {
        const newsItems = s.data?.news?.slice(0, 2) || [];
        if (newsItems.length > 0) {
          block += `\n**${s.sym}:**\n`;
          newsItems.forEach((n, i) => {
            if (n?.title) block += `${i + 1}. ${n.title} _(${n.published_utc?.slice(0, 10)})_\n`;
          });
        }
      });

      return buildPrompt(prompt, block, `Massive.com Real-Time Comparison: ${symbols.join(' vs ')}`);
    }

    // ── ANALYST RATINGS ───────────────────────────────────────────────────
    if (intent.type === 'analyst' && intent.symbol) {
      const sym = intent.symbol;
      const [ratings, quote, details] = await Promise.allSettled([
        safe(getBenzingaRatingsService ? getBenzingaRatingsService(sym, 10) : Promise.resolve(null)),
        safe(getStockQuoteService(sym)),
        safe(getTickerDetailsService(sym)),
      ]);
      const ratingData  = ratings.status  === 'fulfilled' ? ratings.value  : null;
      const quoteData   = quote.status    === 'fulfilled' ? quote.value    : null;
      const detailsData = details.status  === 'fulfilled' ? details.value  : null;

      let block = `## 🏦 ${sym} — Analyst Ratings & Price Targets\n\n`;

      if (detailsData?.name) block += `**${detailsData.name}**\n\n`;
      if (quoteData?.trade?.p) {
        block += `**Current Price:** $${quoteData.trade.p.toLocaleString()}\n\n`;
      }

      if (Array.isArray(ratingData) && ratingData.length > 0) {
        block += `### Recent Analyst Actions\n| Date | Analyst Firm | Rating | Price Target | Action |\n|------|-------------|--------|-------------|--------|\n`;
        ratingData.slice(0, 10).forEach(r => {
          const action = r.rating_current !== r.rating_prior
            ? (r.rating_current === 'Buy' ? '⬆️ Upgrade' : r.rating_current === 'Sell' ? '⬇️ Downgrade' : '↔️ Reiterate')
            : '↔️ Reiterate';
          const target = r.pt_current ? `**$${r.pt_current}**` : 'N/A';
          block += `| ${r.date?.slice(0, 10) || 'N/A'} | ${r.analyst || 'N/A'} | **${r.rating_current || 'N/A'}** | ${target} | ${action} |\n`;
        });

        // Consensus summary
        const buyCount  = ratingData.filter(r => r.rating_current?.toLowerCase().includes('buy')).length;
        const sellCount = ratingData.filter(r => r.rating_current?.toLowerCase().includes('sell')).length;
        const holdCount = ratingData.length - buyCount - sellCount;
        block += `\n### 📊 Consensus (last ${ratingData.length} ratings)\n`;
        block += `| Buy | Hold | Sell |\n|-----|------|------|\n`;
        block += `| **${buyCount}** | **${holdCount}** | **${sellCount}** |\n`;
        const avgTarget = ratingData
          .filter(r => r.pt_current)
          .reduce((sum, r, _, arr) => sum + r.pt_current / arr.length, 0);
        if (avgTarget) block += `\n**Average Price Target:** $${avgTarget.toFixed(2)}\n`;
      } else {
        block += `*No analyst ratings available via Benzinga. Check Bloomberg or Refinitiv for additional coverage.*\n`;
      }
      return buildPrompt(prompt, block, `Massive.com Analyst Ratings Service — ${sym}`);
    }

    // ── STOCK FINANCIALS (P/E ratios, margins, valuation) ─────────────────
    if (intent.type === 'stock_financials' && intent.symbol) {
      const sym = intent.symbol;
      const [ratios, details, quote] = await Promise.allSettled([
        safe(getStockFinancialsRatiosService(sym)),
        safe(getTickerDetailsService(sym)),
        safe(getStockQuoteService(sym)),
      ]);
      const r = ratios.status  === 'fulfilled' ? ratios.value  : null;
      const d = details.status === 'fulfilled' ? details.value : null;
      const q2 = quote.status  === 'fulfilled' ? quote.value   : null;

      let block = `## 📊 ${sym} — Financial Ratios & Valuation\n\n`;
      if (d?.name) block += `**${d.name}**`;
      if (d?.sic_description) block += ` | ${d.sic_description}`;
      if (d?.market_cap) block += ` | Market Cap: **$${(d.market_cap / 1e9).toFixed(2)}B**`;
      block += '\n\n';

      if (r) {
        block += `### Valuation Ratios\n| Metric | Value |\n|--------|-------|\n`;
        if (r.price_to_earnings)      block += `| P/E Ratio (TTM) | **${r.price_to_earnings?.toFixed(2)}x** |\n`;
        if (r.price_to_book)          block += `| P/B Ratio | **${r.price_to_book?.toFixed(2)}x** |\n`;
        if (r.price_to_sales)         block += `| P/S Ratio | **${r.price_to_sales?.toFixed(2)}x** |\n`;
        if (r.ev_to_ebitda)           block += `| EV/EBITDA | **${r.ev_to_ebitda?.toFixed(2)}x** |\n`;
        if (r.enterprise_value)       block += `| Enterprise Value | $${(r.enterprise_value / 1e9).toFixed(2)}B |\n`;
        block += `\n### Profitability\n| Metric | Value |\n|--------|-------|\n`;
        if (r.earnings_per_share)     block += `| EPS (TTM) | **$${r.earnings_per_share?.toFixed(2)}** |\n`;
        if (r.net_profit_margin)      block += `| Net Profit Margin | **${(r.net_profit_margin * 100)?.toFixed(2)}%** |\n`;
        if (r.gross_profit_margin)    block += `| Gross Margin | **${(r.gross_profit_margin * 100)?.toFixed(2)}%** |\n`;
        if (r.return_on_equity)       block += `| ROE | **${(r.return_on_equity * 100)?.toFixed(2)}%** |\n`;
        if (r.return_on_assets)       block += `| ROA | **${(r.return_on_assets * 100)?.toFixed(2)}%** |\n`;
        block += `\n### Financial Health\n| Metric | Value |\n|--------|-------|\n`;
        if (r.debt_to_equity !== undefined) block += `| Debt/Equity | **${r.debt_to_equity?.toFixed(2)}** |\n`;
        if (r.current_ratio)          block += `| Current Ratio | **${r.current_ratio?.toFixed(2)}** |\n`;
        if (r.dividend_yield)         block += `| Dividend Yield | **${(r.dividend_yield * 100)?.toFixed(2)}%** |\n`;
      } else {
        block += `*Financial ratios not available for ${sym}.*\n`;
      }
      if (q2?.trade?.p) block += `\n**Current Price:** $${q2.trade.p.toLocaleString()}\n`;
      return buildPrompt(prompt, block, `Massive.com Financial Ratios Service — ${sym}`);
    }

    // ── INCOME STATEMENT ──────────────────────────────────────────────────
    if (intent.type === 'income_statement' && intent.symbol) {
      const sym = intent.symbol;
      const [income, details] = await Promise.allSettled([
        safe(getStockIncomeStatementService(sym, 4)),
        safe(getTickerDetailsService(sym)),
      ]);
      const incomeData  = income.status  === 'fulfilled' ? income.value  : null;
      const detailsData = details.status === 'fulfilled' ? details.value : null;

      let block = `## 💰 ${sym} — Income Statement\n\n`;
      if (detailsData?.name) block += `**${detailsData.name}**\n\n`;

      const results = incomeData?.results || incomeData;
      if (Array.isArray(results) && results.length > 0) {
        const latest = results[results.length - 1];
        block += `### Most Recent Quarter\n| Line Item | Value |\n|-----------|-------|\n`;
        if (latest.revenues)              block += `| Revenue | **$${(latest.revenues / 1e9).toFixed(2)}B** |\n`;
        if (latest.gross_profit)          block += `| Gross Profit | **$${(latest.gross_profit / 1e9).toFixed(2)}B** |\n`;
        if (latest.operating_income_loss) block += `| Operating Income | **$${(latest.operating_income_loss / 1e9).toFixed(2)}B** |\n`;
        if (latest.net_income_loss)       block += `| Net Income | **$${(latest.net_income_loss / 1e9).toFixed(2)}B** |\n`;
        if (latest.basic_earnings_per_share) block += `| Basic EPS | **$${latest.basic_earnings_per_share?.toFixed(2)}** |\n`;
        if (latest.fiscal_period)         block += `| Period | ${latest.fiscal_period} ${latest.fiscal_year} |\n`;

        // Trend table across quarters
        if (results.length > 1) {
          block += `\n### Revenue Trend (Last ${Math.min(results.length, 4)} Quarters)\n| Period | Revenue | Net Income | EPS |\n|--------|---------|------------|-----|\n`;
          results.slice(-4).reverse().forEach(q => {
            const rev = q.revenues ? `$${(q.revenues / 1e9).toFixed(2)}B` : 'N/A';
            const ni  = q.net_income_loss ? `$${(q.net_income_loss / 1e9).toFixed(2)}B` : 'N/A';
            const eps = q.basic_earnings_per_share ? `$${q.basic_earnings_per_share.toFixed(2)}` : 'N/A';
            block += `| ${q.fiscal_period} ${q.fiscal_year} | ${rev} | ${ni} | ${eps} |\n`;
          });
        }
      } else {
        block += `*Income statement data not available for ${sym}.*\n`;
      }
      return buildPrompt(prompt, block, `Massive.com Income Statement Service — ${sym}`);
    }

    // ── BALANCE SHEET ─────────────────────────────────────────────────────
    if (intent.type === 'balance_sheet' && intent.symbol) {
      const sym = intent.symbol;
      const [balance, details] = await Promise.allSettled([
        safe(getStockBalanceSheetsService(sym, 2)),
        safe(getTickerDetailsService(sym)),
      ]);
      const balanceData = balance.status  === 'fulfilled' ? balance.value  : null;
      const detailsData = details.status  === 'fulfilled' ? details.value  : null;

      let block = `## 🏛️ ${sym} — Balance Sheet\n\n`;
      if (detailsData?.name) block += `**${detailsData.name}**\n\n`;

      const results = balanceData?.results || balanceData;
      if (Array.isArray(results) && results.length > 0) {
        const latest = results[results.length - 1];
        block += `### Latest Balance Sheet (${latest.fiscal_period || ''} ${latest.fiscal_year || ''})\n\n`;
        block += `#### Assets\n| Item | Value |\n|------|-------|\n`;
        if (latest.assets)                    block += `| Total Assets | **$${(latest.assets / 1e9).toFixed(2)}B** |\n`;
        if (latest.current_assets)            block += `| Current Assets | $${(latest.current_assets / 1e9).toFixed(2)}B |\n`;
        if (latest.cash)                      block += `| Cash & Equivalents | **$${(latest.cash / 1e9).toFixed(2)}B** |\n`;
        if (latest.noncurrent_assets)         block += `| Non-Current Assets | $${(latest.noncurrent_assets / 1e9).toFixed(2)}B |\n`;
        block += `\n#### Liabilities & Equity\n| Item | Value |\n|------|-------|\n`;
        if (latest.liabilities)               block += `| Total Liabilities | **$${(latest.liabilities / 1e9).toFixed(2)}B** |\n`;
        if (latest.current_liabilities)       block += `| Current Liabilities | $${(latest.current_liabilities / 1e9).toFixed(2)}B |\n`;
        if (latest.long_term_debt)            block += `| Long-Term Debt | **$${(latest.long_term_debt / 1e9).toFixed(2)}B** |\n`;
        if (latest.equity)                    block += `| Shareholders' Equity | **$${(latest.equity / 1e9).toFixed(2)}B** |\n`;

        // Key ratios derived from balance sheet
        if (latest.assets && latest.liabilities) {
          const debtRatio = (latest.liabilities / latest.assets * 100).toFixed(1);
          block += `\n#### Derived Ratios\n| Ratio | Value |\n|-------|-------|\n`;
          block += `| Debt-to-Assets | **${debtRatio}%** |\n`;
          if (latest.equity && latest.long_term_debt) {
            const dte = (latest.long_term_debt / latest.equity).toFixed(2);
            block += `| Debt-to-Equity | **${dte}x** |\n`;
          }
          if (latest.cash && latest.current_liabilities) {
            const cashRatio = (latest.cash / latest.current_liabilities).toFixed(2);
            block += `| Cash Ratio | **${cashRatio}** |\n`;
          }
        }
      } else {
        block += `*Balance sheet data not available for ${sym}.*\n`;
      }
      return buildPrompt(prompt, block, `Massive.com Balance Sheet Service — ${sym}`);
    }

    // ── STOCK FLOAT ───────────────────────────────────────────────────────
    if (intent.type === 'float' && intent.symbol) {
      const sym = intent.symbol;
      const [floatData, shortData, quote, details] = await Promise.allSettled([
        safe(getStockFloatService(sym)),
        safe(getShortInterestDetailService(sym, 1)),
        safe(getStockQuoteService(sym)),
        safe(getTickerDetailsService(sym)),
      ]);
      const float   = floatData.status  === 'fulfilled' ? floatData.value  : null;
      const short   = shortData.status  === 'fulfilled' ? shortData.value  : null;
      const q       = quote.status      === 'fulfilled' ? quote.value      : null;
      const d       = details.status    === 'fulfilled' ? details.value    : null;

      let block = `## 📊 ${sym} — Float & Share Structure\n\n`;
      if (d?.name) block += `**${d.name}**`;
      if (d?.market_cap) block += ` | Market Cap: **$${(d.market_cap / 1e9).toFixed(2)}B**`;
      block += '\n\n';

      if (float) {
        block += `### Share Structure\n| Metric | Value |\n|--------|-------|\n`;
        if (float.float)            block += `| Float Shares | **${(float.float / 1e6).toFixed(2)}M** |\n`;
        if (float.outstanding)      block += `| Shares Outstanding | ${(float.outstanding / 1e6).toFixed(2)}M |\n`;
        if (float.insider_percent)  block += `| Insider Ownership | **${float.insider_percent?.toFixed(2)}%** |\n`;
        if (float.institution_percent) block += `| Institutional Ownership | **${float.institution_percent?.toFixed(2)}%** |\n`;
        if (float.short_interest)   block += `| Short Interest | ${(float.short_interest / 1e6).toFixed(2)}M shares |\n`;
        if (float.short_percent)    block += `| Short % of Float | **${float.short_percent?.toFixed(2)}%** |\n`;
        if (float.days_to_cover)    block += `| Days to Cover | ${float.days_to_cover?.toFixed(1)} |\n`;
      }

      const latestShort = Array.isArray(short) ? short[0] : null;
      if (latestShort && !float?.short_interest) {
        block += `\n### Short Interest\n| Metric | Value |\n|--------|-------|\n`;
        if (latestShort.short_interest)   block += `| Short Interest | **${(latestShort.short_interest / 1e6).toFixed(2)}M** shares |\n`;
        if (latestShort.short_percent)    block += `| Short % of Float | **${latestShort.short_percent?.toFixed(2)}%** |\n`;
        if (latestShort.days_to_cover)    block += `| Days to Cover | ${latestShort.days_to_cover?.toFixed(1)} |\n`;
        if (latestShort.settlement_date)  block += `| Settlement Date | ${latestShort.settlement_date} |\n`;
        if (latestShort.days_to_cover > 10) {
          block += `\n> ⚠️ **High short interest** — ${latestShort.days_to_cover.toFixed(1)} days to cover. Potential squeeze risk.\n`;
        }
      }
      if (q?.trade?.p) block += `\n**Current Price:** $${q.trade.p.toLocaleString()}\n`;
      return buildPrompt(prompt, block, `Massive.com Float & Share Structure — ${sym}`);
    }

    // ── STOCK SPLITS ──────────────────────────────────────────────────────
    if (intent.type === 'splits' && intent.symbol) {
      const sym = intent.symbol;
      const [splitsData, details] = await Promise.allSettled([
        safe(getStockSplitsService(sym)),
        safe(getTickerDetailsService(sym)),
      ]);
      const splits = splitsData.status === 'fulfilled' ? splitsData.value : null;
      const d      = details.status    === 'fulfilled' ? details.value    : null;

      let block = `## ✂️ ${sym} — Stock Split History\n\n`;
      if (d?.name) block += `**${d.name}**\n\n`;

      const results = Array.isArray(splits) ? splits : splits?.results || [];
      if (results.length > 0) {
        block += `| Split Date | Ratio | Before | After |\n|------------|-------|--------|-------|\n`;
        results.slice(0, 10).forEach(s => {
          const ratio = s.split_from && s.split_to
            ? `${s.split_to}:${s.split_from}`
            : s.ratio || 'N/A';
          block += `| **${s.execution_date || s.date || 'N/A'}** | **${ratio}** | ${s.split_from || 'N/A'} | ${s.split_to || 'N/A'} |\n`;
        });
        const latest = results[0];
        if (latest?.execution_date) {
          block += `\n> 📌 Most recent split: **${latest.split_to}:${latest.split_from}** on ${latest.execution_date}.\n`;
          block += `> A ${latest.split_to}:${latest.split_from} split means for every 1 share held, shareholders received ${latest.split_to} shares (price divided by ${latest.split_to}).\n`;
        }
      } else {
        block += `*No stock split history found for ${sym}. This may indicate ${sym} has never undergone a split.*\n`;
      }
      return buildPrompt(prompt, block, `Massive.com Stock Splits History — ${sym}`);
    }

    // ── PRE-MARKET / AFTER-HOURS ──────────────────────────────────────────
    if (intent.type === 'premarket' && intent.symbol) {
      const sym = intent.symbol;
      const [quote, snapshot, prev, details] = await Promise.allSettled([
        safe(getStockQuoteService(sym)),
        safe(getStocksSnapshotTickersService([sym])),
        safe(getPreviousCloseService(sym)),
        safe(getTickerDetailsService(sym)),
      ]);
      const q  = quote.status    === 'fulfilled' ? quote.value    : null;
      const s  = snapshot.status === 'fulfilled' ? (Array.isArray(snapshot.value) ? snapshot.value[0] : null) : null;
      const p  = prev.status     === 'fulfilled' ? prev.value    : null;
      const d  = details.status  === 'fulfilled' ? details.value : null;

      let block = `## 🌅 ${sym} — Pre-Market & After-Hours Activity\n\n`;
      if (d?.name) block += `**${d.name}**\n\n`;

      // Regular session close
      const prevClose = p?.results?.[0]?.c || s?.prevDay?.c;
      if (prevClose) block += `**Previous Close:** $${prevClose.toLocaleString()}\n\n`;

      // Extended hours data from snapshot session
      const session = s?.session || q?.snapshot?.session;
      if (session) {
        block += `### Extended Hours Data\n| Field | Value |\n|-------|-------|\n`;
        if (session.price)              block += `| Extended Price | **$${session.price?.toLocaleString()}** |\n`;
        if (session.change !== undefined && session.change !== null) {
          const dir = session.change >= 0 ? '📈 +' : '📉 ';
          block += `| Extended Change | **${dir}$${Math.abs(session.change).toFixed(2)} (${session.change_percent?.toFixed(2)}%)** |\n`;
        }
        if (session.volume)             block += `| Extended Volume | ${session.volume?.toLocaleString()} |\n`;
        if (session.early_trading_change !== undefined && session.early_trading_change !== null) {
          const dir2 = session.early_trading_change >= 0 ? '📈 +' : '📉 ';
          block += `| Pre-Market | **${dir2}$${Math.abs(session.early_trading_change).toFixed(2)} (${session.early_trading_change_percent?.toFixed(2)}%)** |\n`;
        }
        if (session.late_trading_change !== undefined && session.late_trading_change !== null) {
          const dir3 = session.late_trading_change >= 0 ? '📈 +' : '📉 ';
          block += `| After-Hours | **${dir3}$${Math.abs(session.late_trading_change).toFixed(2)} (${session.late_trading_change_percent?.toFixed(2)}%)** |\n`;
        }
      } else {
        // Fall back to regular quote
        const last = q?.trade?.p;
        if (last && prevClose) {
          const chg = last - prevClose;
          const chgPct = (chg / prevClose * 100).toFixed(2);
          const dir = chg >= 0 ? '📈 +' : '📉 ';
          block += `### Latest Price\n| Field | Value |\n|-------|-------|\n`;
          block += `| Last Price | **$${last.toLocaleString()}** |\n`;
          block += `| Change from Close | **${dir}$${Math.abs(chg).toFixed(2)} (${chgPct}%)** |\n`;
        }
        block += `\n> ℹ️ Extended-hours session data not available. Showing last known price vs prior close.\n`;
      }

      // Regular day data
      if (s?.day) {
        block += `\n### Regular Session\n| Field | Value |\n|-------|-------|\n`;
        if (s.day.o) block += `| Open | $${s.day.o.toLocaleString()} |\n`;
        if (s.day.h) block += `| High | $${s.day.h.toLocaleString()} |\n`;
        if (s.day.l) block += `| Low | $${s.day.l.toLocaleString()} |\n`;
        if (s.day.c) block += `| Close | **$${s.day.c.toLocaleString()}** |\n`;
        if (s.day.v) block += `| Volume | ${s.day.v.toLocaleString()} |\n`;
      }
      return buildPrompt(prompt, block, `Massive.com Pre/After-Market Data — ${sym}`);
    }

    // ── PORTFOLIO VALUATION ───────────────────────────────────────────────
    // Triggered when user mentions a portfolio with share quantities
    // e.g. "I have 10 AAPL, 5 MSFT, and 20 NVDA — what's my portfolio worth?"
    if (intent.type === 'portfolio') {
      const holdings = intent.holdings; // [{ symbol, shares }]
      if (Array.isArray(holdings) && holdings.length > 0) {
        const tickers = holdings.map(h => h.symbol);
        const snapshots = await safe(getStocksSnapshotTickersService(tickers), 8000);
        const snapMap = {};
        if (Array.isArray(snapshots)) {
          snapshots.forEach(s => { snapMap[s.ticker] = s; });
        }

        let totalValue = 0;
        let totalCost  = 0; // only if avg cost provided

        let block = `## 💼 Portfolio Valuation — Live Prices\n\n`;
        block += `| Ticker | Shares | Price | Day Change | Position Value | Day P&L |\n`;
        block += `|--------|--------|-------|------------|---------------|---------|\n`;

        holdings.forEach(h => {
          const snap = snapMap[h.symbol];
          const price = snap?.day?.c || snap?.lastTrade?.p || null;
          const change = snap?.todaysChange;
          const changePct = snap?.todaysChangePerc;
          const posValue = price ? price * h.shares : null;
          const dayPnl   = change ? change * h.shares : null;

          if (posValue) totalValue += posValue;
          if (dayPnl)   totalCost  += dayPnl;

          const dir = (changePct || 0) >= 0 ? '📈 +' : '📉 ';
          const chgStr = changePct !== undefined ? `${dir}${Math.abs(changePct || 0).toFixed(2)}%` : 'N/A';
          const valStr = posValue ? `**$${posValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}**` : 'N/A';
          const pnlStr = dayPnl ? `${dayPnl >= 0 ? '+' : ''}$${dayPnl.toFixed(2)}` : 'N/A';
          const priceStr = price ? `$${price.toLocaleString()}` : 'N/A';

          block += `| **${h.symbol}** | ${h.shares} | ${priceStr} | ${chgStr} | ${valStr} | ${pnlStr} |\n`;
        });

        if (totalValue > 0) {
          block += `\n### 📊 Portfolio Summary\n`;
          block += `| Metric | Value |\n|--------|-------|\n`;
          block += `| **Total Portfolio Value** | **$${totalValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}** |\n`;
          if (totalCost !== 0) {
            const dir = totalCost >= 0 ? '📈 +' : '📉 ';
            block += `| **Today's P&L** | **${dir}$${Math.abs(totalCost).toFixed(2)}** |\n`;
          }
          block += `| Positions | ${holdings.length} |\n`;
        }
        return buildPrompt(prompt, block, 'Massive.com Portfolio Valuation Service');
      }
    }

  } catch (err) {
    logger.error('[MassiveRouter] Error:', err.message);
  }

  return prompt;
};

// ─── Combined Orchestrator ───────────────────────────────────────────────────
// Runs both financial (Massive.com) and sports (PredictionData.io) routers
// in parallel and merges their context blocks into a single enriched prompt.
// All four cases are handled:
//   both enriched   → merge financial + sports sections with clear separator
//   sports only     → return sports-enriched prompt as-is
//   financial only  → return financial-enriched prompt as-is
//   neither         → return original prompt (no enrichment)
const combinedRouteAndEnhancePrompt = async (prompt) => {
  const [financial, sports] = await Promise.allSettled([
    routeAndEnhancePrompt(prompt),
    sportsSmartRouter.routeAndEnhancePrompt(prompt),
  ]);

  const financialResult = financial.status === 'fulfilled' ? financial.value : prompt;
  const sportsResult    = sports.status === 'fulfilled'    ? sports.value    : prompt;

  const financialEnriched = financialResult !== prompt;
  const sportsEnriched    = sportsResult    !== prompt;

  // Case 1: Both routers enriched — create a merged dual-context block
  if (financialEnriched && sportsEnriched) {
    // Extract just the data sections from each (everything from first ## heading)
    const extractDataBlock = (enriched) => {
      const start = enriched.indexOf('##');
      if (start === -1) return enriched;
      // Stop at the mandatory rules section to avoid duplication
      const rulesMarker = enriched.indexOf('━━━━━━━━━━━━━━', start + 1);
      const lastMarker  = enriched.lastIndexOf('━━━━━━━━━━━━━━');
      if (rulesMarker !== -1 && rulesMarker < lastMarker) {
        return enriched.slice(start, rulesMarker).trim();
      }
      return enriched.slice(start).trim();
    };

    const financialBlock = extractDataBlock(financialResult);
    const sportsBlock    = extractDataBlock(sportsResult);

    const timestamp = new Date().toISOString();
    return `[SYSTEM INSTRUCTION — ALTI DUAL REAL-TIME DATA CONTEXT]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINANCIAL DATA SOURCE: Massive.com
SPORTS DATA SOURCE:    PredictionData.io
TIMESTAMP:             ${timestamp}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

╔══════════════════════════════════════════════════════════════════╗
║  📈 FINANCIAL MARKET DATA (Massive.com)                         ║
╚══════════════════════════════════════════════════════════════════╝

${financialBlock}

╔══════════════════════════════════════════════════════════════════╗
║  🏈 SPORTS BETTING DATA (PredictionData.io)                     ║
╚══════════════════════════════════════════════════════════════════╝

${sportsBlock}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY RESPONSE RULES:
▸ Cite "[Source: Massive.com]" for financial data, "[Source: PredictionData.io]" for sports data
▸ Present ALL odds in **BOLD** (e.g. **-110**, **+130**)
▸ Present ALL prices/values in **BOLD** (e.g. **$182.43**)
▸ Use Markdown tables for comparisons, odds, and market data
▸ NEVER fabricate, estimate, or hallucinate any odds, prices, or lines
▸ Answer the user's EXACT question using ONLY the verified data above
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User Query: ${prompt}`;
  }

  // Case 2: Sports only enriched
  if (sportsEnriched)    return sportsResult;

  // Case 3: Financial only enriched
  if (financialEnriched) return financialResult;

  // Case 4: Neither enriched
  return prompt;
};

export const massiveSmartRouter = {
  routeAndEnhancePrompt,
  combinedRouteAndEnhancePrompt,
  detectFinancialIntent,
  detectMultipleTickers,
};
