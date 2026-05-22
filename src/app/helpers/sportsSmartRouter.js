/**
 * Sports Smart Router — v2
 *
 * RAG-powered sports betting context injector — maximum PredictionData.io coverage.
 * Handles all intent types:
 *   live_odds        — real-time in-game markets
 *   odds             — pre-game moneyline + spread + total
 *   player_prop      — player-level prop markets (per sport)
 *   game_prop        — in-game event props (UFC fights, soccer events)
 *   futures          — championship/award futures
 *   schedule         — game schedule only
 *   sgp              — Same Game Parlay pricing inquiry
 *   prediction_market — Polymarket/Kalshi orderbook depth
 *   alt_lines        — alternate spread/total markets
 *   period_odds      — 1H, 1Q, 1P, F5, etc.
 *
 * Data source: PredictionData.io (api.predictiondata.io)
 * API Key: env var PREDICTIONDATA_API_KEY
 */

import {
  getMarketsService,
  getLiveMarketsService,
  getPlayerPropsService,
  getGamePropsService,
  getFuturesMarketsService,
  getPeriodMarketsService,
  getAltLinesService,
  getFixturesService,
  getMarketSummariesService,
  getOrderbookService,
  getSeasonsService,
  BOOK_IDS,
} from '../modules/predictiondata/predictiondata.service.js';

import { logger } from '../../shared/logger.js';
import { RedisClient } from '../../shared/redis.js';
import {
  detectSportsIntent,
  DEFAULT_BOOK_IDS,
  PROPS_BOOK_IDS,
  PREDICTION_MARKET_BOOK_IDS,
  LEAGUE_EMOJI,
  LEAGUE_SPORT,
  LEAGUE_PROP_TYPES,
  LEAGUE_FUTURES_TYPES,
} from './sportsIntentDB.js';

// ─── Cache TTLs (seconds) ─────────────────────────────────────────────────────
const TTL = {
  odds:       30,    // moneyline/spread/total — odds change rapidly
  live:       10,    // live in-game odds — very short TTL
  props:      45,    // player props — moderate freshness
  game_props: 45,    // game props
  futures:    300,   // futures — slow-moving, 5 min cache
  fixtures:   120,   // game schedules — 2 min cache
  players:    600,   // player reference data — 10 min
  teams:      1800,  // team reference data — 30 min
  orderbook:  20,    // exchange orderbook — very fresh
  summaries:  60,    // market summaries — 1 min
  alt_lines:  45,    // alternate lines
  period:     30,    // quarter/half odds
};

// ─── Redis helpers ────────────────────────────────────────────────────────────
async function cacheGet(key) {
  try {
    const val = await RedisClient.get(`sports:${key}`);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}
async function cacheSet(key, data, ttl) {
  try {
    await RedisClient.set(`sports:${key}`, JSON.stringify(data), { EX: ttl });
  } catch { /* non-fatal */ }
}

// ─── Safe wrapper ─────────────────────────────────────────────────────────────
function safe(promise, ms = 6000) {
  return Promise.race([
    promise,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error('PredictionData API timeout')), ms)
    ),
  ]).catch((err) => {
    logger.warn(`[SportsRouter] ${err.message}`);
    return null;
  });
}

// ─── Decimal odds → American moneyline ───────────────────────────────────────
function decToAmerican(dec) {
  if (!dec || dec <= 1) return 'N/A';
  if (dec >= 2) return `+${Math.round((dec - 1) * 100)}`;
  return `${Math.round(-100 / (dec - 1))}`;
}

// ─── Decimal odds → implied probability ──────────────────────────────────────
function decToImplied(dec) {
  if (!dec || dec <= 1) return 'N/A';
  return `${((1 / dec) * 100).toFixed(1)}%`;
}

// ─── Book ID → name ───────────────────────────────────────────────────────────
const BOOK_NAME_MAP = {
  100: 'FanDuel', 200: 'DraftKings', 300: 'Caesars', 400: 'BetMGM',
  250: 'Pinnacle', 700: 'ESPN Bet', 500: 'BetRivers', 365: 'bet365',
  555: 'Betway', 643: 'Bovada', 193: 'Polymarket', 194: 'Kalshi',
  722: 'Fanatics', 800: 'Fliff', 600: 'PointsBet', 192: 'Novig',
  999: 'True Line', 617: 'LowVig',
};
function bookName(id) { return BOOK_NAME_MAP[id] || `Book ${id}`; }

// ─── Prompt builder ───────────────────────────────────────────────────────────
function buildPrompt(userPrompt, dataBlock, source) {
  const timestamp = new Date().toISOString();
  return `[SYSTEM INSTRUCTION — ALTI REAL-TIME SPORTS BETTING DATA]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATA SOURCE: ${source}
TIMESTAMP:   ${timestamp}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${dataBlock}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY RESPONSE RULES:
▸ ALWAYS cite "[Source: PredictionData.io]" at the top of your answer
▸ Present ALL odds in **BOLD** (e.g. **-110**, **+130**)
▸ Use Markdown tables for odds comparisons and prop lines
▸ NEVER fabricate, estimate, or hallucinate any odds or lines
▸ If data shows line movement (move_dir), mention it clearly (↑ steam up, ↓ steam down)
▸ Show implied probability alongside American odds when relevant
▸ Include provider_url / deeplink when a market has one
▸ Answer the user's EXACT question using only the verified data above
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User Query: ${userPrompt}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORMATTERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format a standard odds block: moneyline, spread, total.
 * Groups by fixture, shows movement, implied probability.
 */
function formatOddsBlock(markets, fixtures, league, label = "Today's Odds") {
  const emoji = LEAGUE_EMOJI[league] || '🏟️';

  if (!markets || markets.length === 0) {
    return `## ${emoji} ${league} — Odds\n\n*No odds data currently available for ${league}.*\n`;
  }

  // Build fixture map
  const fixtureMap = {};
  if (Array.isArray(fixtures)) {
    fixtures.forEach((f) => { fixtureMap[f.id] = f; });
  }

  // Group: fixture_id → bet_type → array of markets
  const byFixture = {};
  markets.forEach((m) => {
    const fid = m.fixture_id || 'unknown';
    if (!byFixture[fid]) byFixture[fid] = { moneyline: [], spread: [], total: [] };
    const bt = (m.bet_type || '').toLowerCase().replace(/\s+/g, '_');
    if (bt.includes('moneyline') || bt === 'moneyline') byFixture[fid].moneyline.push(m);
    else if (bt.includes('spread') || bt === 'spread') byFixture[fid].spread.push(m);
    else if (bt.includes('total') || bt === 'total') byFixture[fid].total.push(m);
  });

  let block = `## ${emoji} ${league} — ${label}\n`;
  block += `> Powered by **PredictionData.io** | Books: FanDuel, DraftKings, Caesars, BetMGM, Pinnacle\n\n`;

  const fixtureIds = Object.keys(byFixture).slice(0, 12);

  for (const fid of fixtureIds) {
    const fixture = fixtureMap[fid];
    const gameLabel = fixture
      ? `${fixture.away_abbr || '?'} @ ${fixture.home_abbr || '?'}`
      : `Game ${fid.slice(0, 8)}`;

    const gameDate = fixture?.date
      ? new Date(fixture.date).toLocaleString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
        })
      : '';

    // Live score indicator
    const liveScore =
      fixture?.status === 'in_progress' &&
      fixture?.home_score !== undefined
        ? ` 🔴 **LIVE** ${fixture.away_score}-${fixture.home_score}${fixture.current_period_text ? ` (${fixture.current_period_text})` : ''}`
        : '';

    block += `### ${gameLabel}${gameDate ? `  —  ${gameDate}` : ''}${liveScore}\n`;

    const { moneyline, spread, total } = byFixture[fid];

    // Moneyline table — one row per side, show book source and implied %
    if (moneyline.length > 0) {
      const sides = {};
      moneyline.forEach((m) => {
        const key = m.side || m.side_type || '?';
        // Keep best odds (lowest decimal = closest to fair line)
        if (!sides[key] || m.odds < sides[key].odds) sides[key] = m;
      });
      const sideKeys = Object.keys(sides);
      block += `| Side | Moneyline | Implied % | Movement | Book |\n`;
      block += `|------|-----------|-----------|----------|------|\n`;
      sideKeys.slice(0, 3).forEach((side) => {
        const m = sides[side];
        const ml = decToAmerican(m.odds);
        const imp = decToImplied(m.odds);
        const dir = m.move_dir === 'up' ? '↑' : m.move_dir === 'down' ? '↓' : '—';
        const bk = bookName(m.odd_provider_id);
        block += `| ${side} | **${ml}** | ${imp} | ${dir} | ${bk} |\n`;
      });
    }

    // Spread table
    if (spread.length > 0) {
      const sides = {};
      spread.forEach((m) => {
        const key = `${m.side} ${m.number >= 0 ? '+' : ''}${m.number}`;
        if (!sides[key]) sides[key] = m;
      });
      const sideKeys = Object.keys(sides);
      if (sideKeys.length > 0) {
        block += `\n| Spread | Line | Odds | Movement |\n|--------|------|------|----------|\n`;
        sideKeys.slice(0, 4).forEach((key) => {
          const m = sides[key];
          const dir = m.move_dir === 'up' ? '↑' : m.move_dir === 'down' ? '↓' : '—';
          block += `| ${m.side || '?'} | **${m.number >= 0 ? '+' : ''}${m.number}** | **${decToAmerican(m.odds)}** | ${dir} |\n`;
        });
      }
    }

    // Total table
    if (total.length > 0) {
      const over  = total.find((m) => (m.side_type === 'Over' || m.side === 'Over') && !m.is_alt);
      const under = total.find((m) => (m.side_type === 'Under' || m.side === 'Under') && !m.is_alt);
      if (over || under) {
        block += `\n| Total | Line | Odds | Implied % |\n|-------|------|------|-----------|\n`;
        if (over)  block += `| Over  | **${over.number}** | **${decToAmerican(over.odds)}** | ${decToImplied(over.odds)} |\n`;
        if (under) block += `| Under | **${under.number}** | **${decToAmerican(under.odds)}** | ${decToImplied(under.odds)} |\n`;
      }
    }

    block += '\n';
  }

  return block;
}

/**
 * Format player prop markets grouped by prop type, then by player.
 * Shows over/under, line, odds, movement, and deeplink.
 */
function formatPlayerPropsBlock(markets, league) {
  const emoji = LEAGUE_EMOJI[league] || '🏟️';

  if (!markets || markets.length === 0) {
    return `## ${emoji} ${league} — Player Props\n\n*No player prop data currently available.*\n`;
  }

  // Group by prop_name → player side
  const byProp = {};
  markets.forEach((m) => {
    const propName = m.prop_name || m.bet_type || 'Unknown Prop';
    if (!byProp[propName]) byProp[propName] = [];
    byProp[propName].push(m);
  });

  let block = `## ${emoji} ${league} — Player Props\n`;
  block += `> Data via **PredictionData.io** | FanDuel, DraftKings, BetMGM\n\n`;
  block += `| Prop | Side | Line | Odds | Implied % | Move |\n`;
  block += `|------|------|------|------|-----------|------|\n`;

  const propKeys = Object.keys(byProp).slice(0, 25);
  for (const prop of propKeys) {
    const ms = byProp[prop];
    // Show over/under pair
    const over  = ms.find((m) => m.side_type === 'Over'  || m.side === 'Over');
    const under = ms.find((m) => m.side_type === 'Under' || m.side === 'Under');
    const rows  = [over, under].filter(Boolean);
    if (rows.length === 0) rows.push(ms[0]);

    rows.forEach((m) => {
      const dir = m.move_dir === 'up' ? '↑' : m.move_dir === 'down' ? '↓' : '—';
      const imp = decToImplied(m.odds);
      block += `| **${prop}** | ${m.side || m.side_type || '?'} | **${m.number ?? '—'}** | **${decToAmerican(m.odds)}** | ${imp} | ${dir} |\n`;
    });
  }

  return block;
}

/**
 * Format game prop markets (UFC rounds, soccer BTTS, etc.)
 */
function formatGamePropsBlock(markets, league) {
  const emoji = LEAGUE_EMOJI[league] || '🏟️';

  if (!markets || markets.length === 0) {
    return `## ${emoji} ${league} — Game Props\n\n*No game prop data currently available.*\n`;
  }

  const byProp = {};
  markets.forEach((m) => {
    const key = m.prop_name || m.bet_type || 'Game Prop';
    if (!byProp[key]) byProp[key] = [];
    byProp[key].push(m);
  });

  let block = `## ${emoji} ${league} — Game Props\n`;
  block += `> Data via **PredictionData.io**\n\n`;

  for (const [propName, ms] of Object.entries(byProp)) {
    block += `### ${propName}\n`;
    block += `| Side | Odds | Implied % | Movement |\n|------|------|-----------|----------|\n`;
    ms.slice(0, 4).forEach((m) => {
      const dir = m.move_dir === 'up' ? '↑' : m.move_dir === 'down' ? '↓' : '—';
      block += `| ${m.side || m.side_type || '?'} | **${decToAmerican(m.odds)}** | ${decToImplied(m.odds)} | ${dir} |\n`;
    });
    block += '\n';
  }

  return block;
}

/**
 * Format futures markets grouped by future type.
 * Sorted by odds (favorites first), shows implied probability.
 */
function formatFuturesBlock(markets, league) {
  const emoji = LEAGUE_EMOJI[league] || '🏆';

  if (!markets || markets.length === 0) {
    return `## ${emoji} ${league} — Futures Odds\n\n*No futures data currently available for ${league}.*\n`;
  }

  const byFuture = {};
  markets.forEach((m) => {
    const key = m.prop_name || 'Futures';
    if (!byFuture[key]) byFuture[key] = [];
    byFuture[key].push(m);
  });

  let block = `## ${emoji} ${league} — Futures Odds\n`;
  block += `> Data via **PredictionData.io** | FanDuel, DraftKings, Caesars, BetMGM, Pinnacle\n\n`;

  for (const [futureType, ms] of Object.entries(byFuture)) {
    block += `### ${futureType}\n`;
    block += `| Selection | Odds | Implied % | Movement |\n|-----------|------|-----------|----------|\n`;

    const sorted = [...ms].sort((a, b) => (a.odds ?? 99) - (b.odds ?? 99));
    sorted.slice(0, 12).forEach((m) => {
      const dir = m.move_dir === 'up' ? '↑' : m.move_dir === 'down' ? '↓' : '—';
      const imp = decToImplied(m.odds);
      block += `| ${m.side || '?'} | **${decToAmerican(m.odds)}** | ${imp} | ${dir} |\n`;
    });
    block += '\n';
  }

  return block;
}

/**
 * Format game schedule
 */
function formatScheduleBlock(fixtures, league) {
  const emoji = LEAGUE_EMOJI[league] || '📅';

  if (!fixtures || fixtures.length === 0) {
    return `## ${emoji} ${league} — Schedule\n\n*No upcoming games found for ${league}.*\n`;
  }

  let block = `## ${emoji} ${league} — Upcoming Games\n\n`;
  block += `| Game | Date/Time | Status | Score |\n`;
  block += `|------|-----------|--------|-------|\n`;

  fixtures.slice(0, 12).forEach((f) => {
    const gameLabel = `${f.away_abbr || '?'} @ ${f.home_abbr || '?'}`;
    const date = f.date
      ? new Date(f.date).toLocaleString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
        })
      : 'TBD';
    const status = f.status || 'scheduled';
    const score =
      f.status === 'in_progress' && f.home_score !== undefined
        ? `**${f.away_score}-${f.home_score}** 🔴`
        : (f.home_score > 0 || f.away_score > 0)
          ? `${f.away_score}-${f.home_score} (Final)`
          : '—';
    block += `| **${gameLabel}** | ${date} | ${status} | ${score} |\n`;
  });

  return block;
}

/**
 * Format alt lines (alternate spreads/totals)
 */
function formatAltLinesBlock(markets, league) {
  const emoji = LEAGUE_EMOJI[league] || '🏟️';

  if (!markets || markets.length === 0) {
    return `## ${emoji} ${league} — Alternate Lines\n\n*No alternate lines available.*\n`;
  }

  // Only show alt markets
  const altMarkets = markets.filter((m) => m.is_alt === true);
  const allSpreads = altMarkets.filter((m) => (m.bet_type || '').toLowerCase().includes('spread'));
  const allTotals  = altMarkets.filter((m) => (m.bet_type || '').toLowerCase().includes('total'));

  let block = `## ${emoji} ${league} — Alternate Lines\n`;
  block += `> Data via **PredictionData.io** | Alternate spreads & totals\n\n`;

  if (allSpreads.length > 0) {
    block += `### Alternate Spreads\n`;
    block += `| Side | Alt Line | Odds | Implied % |\n|------|----------|------|-----------|\n`;
    allSpreads.slice(0, 16).forEach((m) => {
      block += `| ${m.side || '?'} | **${m.number >= 0 ? '+' : ''}${m.number}** | **${decToAmerican(m.odds)}** | ${decToImplied(m.odds)} |\n`;
    });
    block += '\n';
  }

  if (allTotals.length > 0) {
    block += `### Alternate Totals\n`;
    block += `| Side | Alt Line | Odds | Implied % |\n|------|----------|------|-----------|\n`;
    allTotals.slice(0, 16).forEach((m) => {
      block += `| ${m.side || m.side_type || '?'} | **${m.number}** | **${decToAmerican(m.odds)}** | ${decToImplied(m.odds)} |\n`;
    });
    block += '\n';
  }

  return block;
}

/**
 * Format period odds (1H, 1Q, 1P, F5, etc.)
 */
function formatPeriodOddsBlock(markets, league, period) {
  const emoji = LEAGUE_EMOJI[league] || '🏟️';
  const periodLabels = {
    '1H': '1st Half', '2H': '2nd Half',
    '1Q': '1st Quarter', '2Q': '2nd Quarter', '3Q': '3rd Quarter', '4Q': '4th Quarter',
    '1P': '1st Period', '2P': '2nd Period', '3P': '3rd Period',
    'F5': 'First 5 Innings', 'F3': 'First 3 Innings', 'F7': 'First 7 Innings',
    '1I': '1st Inning', '1S': '1st Set', '2S': '2nd Set',
  };
  const label = periodLabels[period] || period;

  if (!markets || markets.length === 0) {
    return `## ${emoji} ${league} — ${label} Odds\n\n*No ${label} odds currently available for ${league}.*\n`;
  }

  // Reuse formatOddsBlock logic with period label
  const filtered = markets.filter((m) => m.period === period || !period);
  return formatOddsBlock(filtered, [], league, `${label} Odds`);
}

/**
 * Format Polymarket/Kalshi orderbook
 */
function formatOrderbookBlock(summaries, orderbook, league, provider = 'Polymarket') {
  const emoji = LEAGUE_EMOJI[league] || '🏟️';

  if (!summaries || summaries.length === 0) {
    return `## ${emoji} ${league} — ${provider} Markets\n\n*No active prediction markets found for ${league}.*\n`;
  }

  let block = `## ${emoji} ${league} — ${provider} Prediction Markets\n`;
  block += `> Live exchange data via **PredictionData.io** powered by ${provider}\n\n`;

  summaries.slice(0, 5).forEach((s) => {
    block += `### ${s.slug || s.id}\n`;
    block += `- **Market:** ${s.bet_type} | Period: ${s.period} | Active: ${s.is_active ? '✅' : '❌'}\n`;
    if (s.number !== null) block += `- **Line:** ${s.number}\n`;
    block += '\n';
  });

  if (orderbook && orderbook.length > 0) {
    const bids = orderbook.filter((o) => !o.is_ask).sort((a, b) => b.price - a.price).slice(0, 5);
    const asks = orderbook.filter((o) => o.is_ask).sort((a, b) => a.price - b.price).slice(0, 5);

    block += `### Orderbook\n`;
    block += `| Side | Price | Contracts |\n|------|-------|-----------|\n`;
    bids.forEach((o) => {
      block += `| 🟢 Bid | **${(o.price * 100).toFixed(1)}¢** | ${o.contracts.toLocaleString()} |\n`;
    });
    asks.forEach((o) => {
      block += `| 🔴 Ask | **${(o.price * 100).toFixed(1)}¢** | ${o.contracts.toLocaleString()} |\n`;
    });

    if (bids.length > 0 && asks.length > 0) {
      const mid = ((bids[0].price + asks[0].price) / 2 * 100).toFixed(1);
      block += `\n**Mid Price:** ${mid}¢ → Implied probability: **${mid}%**\n`;
    }
  }

  return block;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ROUTER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

const routeAndEnhancePrompt = async (prompt) => {
  try {
    const intent = detectSportsIntent(prompt);
    if (!intent) return prompt;

    const { type, league, extra = {} } = intent;
    const emoji = LEAGUE_EMOJI[league] || '🏟️';

    logger.info(`[SportsRouter] Intent: ${type} | League: ${league}`);

    // ── LIVE ODDS ───────────────────────────────────────────────────────────
    if (type === 'live_odds') {
      const cacheKey = `live:${league}`;
      let markets = await cacheGet(cacheKey);
      if (!markets) {
        markets = await safe(getLiveMarketsService(league, 'moneyline,spread,total', DEFAULT_BOOK_IDS), 7000);
        if (markets) await cacheSet(cacheKey, markets, TTL.live);
      }
      const fixtures = await safe(getFixturesService(league, 6), 5000);
      const block = formatOddsBlock(markets || [], fixtures || [], league);
      return buildPrompt(prompt, `🔴 **LIVE IN-GAME ODDS**\n\n${block}`, 'PredictionData.io Live Sports Odds Feed');
    }

    // ── PLAYER PROPS ────────────────────────────────────────────────────────
    if (type === 'player_prop') {
      const propType = extra.propType || '';
      const cacheKey = `props:${league}:${propType}`;
      let markets = await cacheGet(cacheKey);
      if (!markets) {
        markets = await safe(getPlayerPropsService(league, propType, PROPS_BOOK_IDS), 7000);
        if (markets) await cacheSet(cacheKey, markets, TTL.props);
      }
      // Also fetch fixtures to resolve game context
      const fixtures = await safe(getFixturesService(league, 24), 5000);
      const block = formatPlayerPropsBlock(markets || [], league);
      return buildPrompt(prompt, block, `PredictionData.io ${league} Player Props Service`);
    }

    // ── GAME PROPS ──────────────────────────────────────────────────────────
    if (type === 'game_prop') {
      const cacheKey = `game_props:${league}`;
      let markets = await cacheGet(cacheKey);
      if (!markets) {
        markets = await safe(getGamePropsService(league, '', PROPS_BOOK_IDS), 7000);
        if (markets) await cacheSet(cacheKey, markets, TTL.game_props);
      }
      const block = formatGamePropsBlock(markets || [], league);
      return buildPrompt(prompt, block, `PredictionData.io ${league} Game Props Service`);
    }

    // ── FUTURES ─────────────────────────────────────────────────────────────
    if (type === 'futures') {
      const cacheKey = `futures:${league}`;
      let markets = await cacheGet(cacheKey);
      if (!markets) {
        markets = await safe(getFuturesMarketsService(league, DEFAULT_BOOK_IDS), 8000);
        if (markets) await cacheSet(cacheKey, markets, TTL.futures);
      }
      const block = formatFuturesBlock(markets || [], league);

      // Add informational futures prop type list
      const futureTypes = LEAGUE_FUTURES_TYPES[league] || [];
      const extraInfo = futureTypes.length > 0
        ? `\n\n### Available Future Markets for ${league}\n${futureTypes.map((t) => `- ${t}`).join('\n')}`
        : '';

      return buildPrompt(prompt, block + extraInfo, `PredictionData.io ${league} Futures Odds Service`);
    }

    // ── SCHEDULE ────────────────────────────────────────────────────────────
    if (type === 'schedule') {
      const cacheKey = `fixtures:${league}`;
      let fixtures = await cacheGet(cacheKey);
      if (!fixtures) {
        fixtures = await safe(getFixturesService(league, 72), 5000);
        if (fixtures) await cacheSet(cacheKey, fixtures, TTL.fixtures);
      }
      const block = formatScheduleBlock(fixtures || [], league);
      return buildPrompt(prompt, block, `PredictionData.io ${league} Schedule Service`);
    }

    // ── SAME GAME PARLAY ────────────────────────────────────────────────────
    if (type === 'sgp') {
      // For SGP intent we inform the LLM about SGP capability and show today's games
      const fixtures = await safe(getFixturesService(league, 24), 5000) || [];
      const markets  = await safe(
        getMarketsService(league, 'moneyline,spread,total,player_prop', 'FT', PROPS_BOOK_IDS, { timedelta: 24 }),
        8000
      ) || [];

      let block = `## ${emoji} ${league} — Same Game Parlay (SGP) Builder\n\n`;
      block += `> **PredictionData.io SGP Pricing Engine** is active. Supported books: DraftKings, FanDuel, BetRivers, BetMGM, BetWay, Tooniebet, BC.Game, Stake, 888Sport\n\n`;
      block += formatScheduleBlock(fixtures, league);
      block += `\n\n`;
      block += formatPlayerPropsBlock(markets.filter((m) => m.bet_type?.toLowerCase().includes('player_prop') || m.bet_type === 'Player Prop'), league);
      block += `\n\n*To build an SGP, select 2+ legs from the same game. I can calculate real-time SGP pricing from multiple sportsbooks.*`;

      return buildPrompt(prompt, block, `PredictionData.io ${league} SGP Pricing Engine`);
    }

    // ── PREDICTION MARKETS (Polymarket / Kalshi) ────────────────────────────
    if (type === 'prediction_market') {
      const provider = extra.provider || 'polymarket';
      const providerId = provider === 'kalshi' ? 194 : 193;
      const providerName = provider === 'kalshi' ? 'Kalshi' : 'Polymarket';

      const cacheKey = `summaries:${league}`;
      let summaries = await cacheGet(cacheKey);
      if (!summaries) {
        summaries = await safe(getMarketSummariesService(league), 6000);
        if (summaries) await cacheSet(cacheKey, summaries, TTL.summaries);
      }

      // Fetch orderbook for first active market
      let orderbook = null;
      if (summaries && summaries.length > 0) {
        const firstSlug = summaries[0]?.slug;
        if (firstSlug) {
          const obKey = `orderbook:${firstSlug}`;
          orderbook = await cacheGet(obKey);
          if (!orderbook) {
            orderbook = await safe(getOrderbookService(firstSlug, providerId), 5000);
            if (orderbook) await cacheSet(obKey, orderbook, TTL.orderbook);
          }
        }
      }

      const block = formatOrderbookBlock(summaries || [], orderbook || [], league, providerName);
      return buildPrompt(prompt, block, `PredictionData.io ${providerName} Exchange Markets`);
    }

    // ── ALTERNATE LINES ─────────────────────────────────────────────────────
    if (type === 'alt_lines') {
      const cacheKey = `alt_lines:${league}`;
      let markets = await cacheGet(cacheKey);
      if (!markets) {
        markets = await safe(getAltLinesService(league, PROPS_BOOK_IDS), 7000);
        if (markets) await cacheSet(cacheKey, markets, TTL.alt_lines);
      }
      const block = formatAltLinesBlock(markets || [], league);
      return buildPrompt(prompt, block, `PredictionData.io ${league} Alternate Lines`);
    }

    // ── PERIOD ODDS (1H, 1Q, 1P, F5, etc.) ─────────────────────────────────
    if (type === 'period_odds') {
      const period = extra.period || '1H';
      const cacheKey = `period:${league}:${period}`;
      let markets = await cacheGet(cacheKey);
      if (!markets) {
        markets = await safe(getPeriodMarketsService(league, period, DEFAULT_BOOK_IDS), 7000);
        if (markets) await cacheSet(cacheKey, markets, TTL.period);
      }
      const block = formatPeriodOddsBlock(markets || [], league, period);
      return buildPrompt(prompt, block, `PredictionData.io ${league} ${period} Odds Service`);
    }

    // ── STANDARD ODDS (moneyline + spread + total) ──────────────────────────
    if (type === 'odds') {
      const cacheKey     = `odds:${league}`;
      const fixCacheKey  = `fixtures:${league}`;

      let [markets, fixtures] = await Promise.all([
        cacheGet(cacheKey),
        cacheGet(fixCacheKey),
      ]);

      if (!markets || !fixtures) {
        const [freshMarkets, freshFixtures] = await Promise.all([
          safe(getMarketsService(league, 'moneyline,spread,total', 'FT', DEFAULT_BOOK_IDS, { timedelta: 48 }), 8000),
          safe(getFixturesService(league, 48), 5000),
        ]);

        if (freshMarkets) {
          markets = freshMarkets;
          await cacheSet(cacheKey, markets, TTL.odds);
        }
        if (freshFixtures) {
          fixtures = freshFixtures;
          await cacheSet(fixCacheKey, fixtures, TTL.fixtures);
        }
      }

      const block = formatOddsBlock(markets || [], fixtures || [], league);
      return buildPrompt(prompt, block, `PredictionData.io Real-Time ${league} Odds Service`);
    }

  } catch (err) {
    logger.error('[SportsRouter] Error:', err.message);
  }

  return prompt;
};

export const sportsSmartRouter = {
  routeAndEnhancePrompt,
  detectSportsIntent,
};
