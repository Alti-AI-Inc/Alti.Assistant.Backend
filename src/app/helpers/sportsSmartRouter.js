/**
 * Sports Smart Router — v1
 *
 * RAG-powered sports betting context injector.
 * Mirrors massiveSmartRouter.js architecture exactly:
 *   - Intent detection via sportsIntentDB.js
 *   - Redis caching with sports-appropriate TTLs
 *   - safe() timeout wrapper (5s default)
 *   - buildPrompt() injects formatted data into LLM context
 *
 * Data source: PredictionData.io (api.predictiondata.io)
 * API Key: env var PREDICTIONDATA_API_KEY
 */

import {
  getMarketsService,
  getLiveMarketsService,
  getPlayerPropsService,
  getFuturesMarketsService,
  getFixturesService,
} from '../modules/predictiondata/predictiondata.service.js';

import { logger } from '../../shared/logger.js';
import { RedisClient } from '../../shared/redis.js';
import {
  detectSportsIntent,
  DEFAULT_BOOK_IDS,
  LEAGUE_EMOJI,
  LEAGUE_SPORT,
} from './sportsIntentDB.js';

// ─── Cache TTLs (seconds) ─────────────────────────────────────────────────────
const TTL = {
  odds: 30,         // moneyline/spread/total — odds change rapidly
  live: 15,         // live in-game odds — very short TTL
  props: 45,        // player props — moderate freshness
  futures: 300,     // futures — slow-moving, 5 min cache
  fixtures: 120,    // game schedules — 2 min cache
  players: 600,     // player reference data — 10 min
  teams: 1800,      // team reference data — 30 min
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

// ─── Safe wrapper (5s timeout) ───────────────────────────────────────────────
function safe(promise, ms = 5000) {
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

// ─── Decimal odds → American moneyline formatter ─────────────────────────────
function decToAmerican(dec) {
  if (!dec || dec <= 1) return 'N/A';
  if (dec >= 2) {
    return `+${Math.round((dec - 1) * 100)}`;
  }
  return `${Math.round(-100 / (dec - 1))}`;
}

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
▸ If data shows line movement (move_dir), mention it clearly
▸ Answer the user's EXACT question using only the verified data above
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User Query: ${userPrompt}`;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

/**
 * Format a standard odds block (moneyline + spread + total)
 * Groups markets by fixture_id then by book
 */
function formatOddsBlock(markets, fixtures, league) {
  const emoji = LEAGUE_EMOJI[league] || '🏟️';

  if (!markets || markets.length === 0) {
    return `## ${emoji} ${league} — Odds\n\n*No odds data currently available for ${league}.*\n`;
  }

  // Build fixture map
  const fixtureMap = {};
  if (Array.isArray(fixtures)) {
    fixtures.forEach((f) => { fixtureMap[f.id] = f; });
  }

  // Group markets by fixture_id → bet_type → book
  const byFixture = {};
  markets.forEach((m) => {
    const fid = m.fixture_id || 'unknown';
    if (!byFixture[fid]) byFixture[fid] = { moneyline: [], spread: [], total: [] };
    const bt = (m.bet_type || '').toLowerCase().replace(/\s+/g, '_');
    if (bt.includes('moneyline')) byFixture[fid].moneyline.push(m);
    else if (bt.includes('spread')) byFixture[fid].spread.push(m);
    else if (bt.includes('total')) byFixture[fid].total.push(m);
  });

  let block = `## ${emoji} ${league} — Today's Odds\n`;
  block += `> Powered by **PredictionData.io** | Books: Pinnacle, DraftKings, FanDuel\n\n`;

  const fixtureIds = Object.keys(byFixture).slice(0, 10); // cap at 10 games

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

    block += `### ${gameLabel}${gameDate ? `  —  ${gameDate}` : ''}\n`;

    const { moneyline, spread, total } = byFixture[fid];

    // Moneyline table
    if (moneyline.length > 0) {
      const away = moneyline.find((m) => m.side === fixture?.away_abbr || m.side?.includes('Away'));
      const home = moneyline.find((m) => m.side === fixture?.home_abbr || m.side?.includes('Home'));
      // Pick best available
      const sides = {};
      moneyline.forEach((m) => {
        if (!sides[m.side]) sides[m.side] = m;
      });
      const sideKeys = Object.keys(sides);

      block += `| Side | Moneyline |${sideKeys.length <= 2 ? '' : ''}\n`;
      block += `|------|-----------|${sideKeys.length <= 2 ? '' : ''}\n`;
      sideKeys.slice(0, 3).forEach((side) => {
        const m = sides[side];
        const ml = decToAmerican(m.odds);
        const dir = m.move_dir === 'up' ? ' ↑' : m.move_dir === 'down' ? ' ↓' : '';
        block += `| ${side} | **${ml}**${dir} |\n`;
      });
    }

    // Spread table
    if (spread.length > 0) {
      const sides = {};
      spread.forEach((m) => {
        const key = `${m.side} ${m.number > 0 ? '+' : ''}${m.number}`;
        if (!sides[key]) sides[key] = m;
      });
      const sideKeys = Object.keys(sides);
      if (sideKeys.length > 0) {
        block += `\n| Spread | Odds |\n|--------|------|\n`;
        sideKeys.slice(0, 4).forEach((key) => {
          const m = sides[key];
          const dir = m.move_dir === 'up' ? ' ↑' : m.move_dir === 'down' ? ' ↓' : '';
          block += `| ${key} | **${decToAmerican(m.odds)}**${dir} |\n`;
        });
      }
    }

    // Total table
    if (total.length > 0) {
      const over = total.find((m) => m.side_type === 'Over' || m.side === 'Over');
      const under = total.find((m) => m.side_type === 'Under' || m.side === 'Under');
      if (over || under) {
        block += `\n| Total | O/U | Odds |\n|-------|-----|------|\n`;
        if (over) block += `| Over | **${over.number}** | **${decToAmerican(over.odds)}** |\n`;
        if (under) block += `| Under | **${under.number}** | **${decToAmerican(under.odds)}** |\n`;
      }
    }

    block += '\n';
  }

  return block;
}

/**
 * Format player prop markets grouped by player
 */
function formatPlayerPropsBlock(markets, league) {
  const emoji = LEAGUE_EMOJI[league] || '🏟️';

  if (!markets || markets.length === 0) {
    return `## ${emoji} ${league} — Player Props\n\n*No player prop data currently available.*\n`;
  }

  // Group by prop_name
  const byProp = {};
  markets.forEach((m) => {
    const propName = m.prop_name || m.bet_type || 'Unknown Prop';
    if (!byProp[propName]) byProp[propName] = [];
    byProp[propName].push(m);
  });

  let block = `## ${emoji} ${league} — Player Props\n`;
  block += `> Data via **PredictionData.io** | Pinnacle, DraftKings, FanDuel\n\n`;
  block += `| Prop | Side | Line | Odds | Movement |\n`;
  block += `|------|------|------|------|----------|\n`;

  const propKeys = Object.keys(byProp).slice(0, 20);
  for (const prop of propKeys) {
    const ms = byProp[prop];
    ms.slice(0, 2).forEach((m) => {
      const dir = m.move_dir === 'up' ? '↑' : m.move_dir === 'down' ? '↓' : '—';
      block += `| ${prop} | ${m.side || m.side_type || '?'} | **${m.number ?? '—'}** | **${decToAmerican(m.odds)}** | ${dir} |\n`;
    });
  }

  return block;
}

/**
 * Format futures markets
 */
function formatFuturesBlock(markets, league) {
  const emoji = LEAGUE_EMOJI[league] || '🏆';

  if (!markets || markets.length === 0) {
    return `## ${emoji} ${league} — Futures Odds\n\n*No futures data currently available for ${league}.*\n`;
  }

  // Group by prop_name (the future type)
  const byFuture = {};
  markets.forEach((m) => {
    const key = m.prop_name || 'Futures';
    if (!byFuture[key]) byFuture[key] = [];
    byFuture[key].push(m);
  });

  let block = `## ${emoji} ${league} — Futures Odds\n`;
  block += `> Data via **PredictionData.io**\n\n`;

  for (const [futureType, ms] of Object.entries(byFuture)) {
    block += `### ${futureType}\n`;
    block += `| Selection | Odds | Movement |\n`;
    block += `|-----------|------|----------|\n`;

    // Sort by odds ascending (favorites first)
    const sorted = [...ms].sort((a, b) => (a.odds ?? 99) - (b.odds ?? 99));
    sorted.slice(0, 10).forEach((m) => {
      const dir = m.move_dir === 'up' ? '↑' : m.move_dir === 'down' ? '↓' : '—';
      block += `| ${m.side || '?'} | **${decToAmerican(m.odds)}** | ${dir} |\n`;
    });
    block += '\n';
  }

  return block;
}

/**
 * Format fixtures (schedule only, no odds)
 */
function formatScheduleBlock(fixtures, league) {
  const emoji = LEAGUE_EMOJI[league] || '📅';

  if (!fixtures || fixtures.length === 0) {
    return `## ${emoji} ${league} — Schedule\n\n*No upcoming games found for ${league}.*\n`;
  }

  let block = `## ${emoji} ${league} — Upcoming Games\n\n`;
  block += `| Game | Date/Time | Status |\n`;
  block += `|------|-----------|--------|\n`;

  fixtures.slice(0, 10).forEach((f) => {
    const gameLabel = `${f.away_abbr || '?'} @ ${f.home_abbr || '?'}`;
    const date = f.date
      ? new Date(f.date).toLocaleString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
        })
      : 'TBD';
    const status = f.status || 'scheduled';
    const score = (f.home_score !== undefined && f.away_score !== undefined && (f.home_score > 0 || f.away_score > 0))
      ? ` (${f.away_score}-${f.home_score})`
      : '';
    block += `| **${gameLabel}${score}** | ${date} | ${status} |\n`;
  });

  return block;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ROUTER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

const routeAndEnhancePrompt = async (prompt) => {
  try {
    const intent = detectSportsIntent(prompt);
    if (!intent) return prompt;

    const league = intent.league;
    const emoji = LEAGUE_EMOJI[league] || '🏟️';

    logger.info(`[SportsRouter] Intent: ${intent.type} | League: ${league}`);

    // ── LIVE ODDS ─────────────────────────────────────────────────────────
    if (intent.type === 'live_odds') {
      const cacheKey = `live:${league}`;
      let markets = await cacheGet(cacheKey);
      if (!markets) {
        markets = await safe(getLiveMarketsService(league, 'moneyline,spread,total', DEFAULT_BOOK_IDS), 6000);
        if (markets) await cacheSet(cacheKey, markets, TTL.live);
      }
      const fixtures = await safe(getFixturesService(league, 6), 5000);
      const block = formatOddsBlock(markets || [], fixtures || [], league);
      return buildPrompt(prompt, `🔴 **LIVE ODDS**\n\n${block}`, 'PredictionData.io Live Sports Odds Feed');
    }

    // ── PLAYER PROPS ──────────────────────────────────────────────────────
    if (intent.type === 'player_prop') {
      const cacheKey = `props:${league}`;
      let markets = await cacheGet(cacheKey);
      if (!markets) {
        markets = await safe(getPlayerPropsService(league, '', DEFAULT_BOOK_IDS), 6000);
        if (markets) await cacheSet(cacheKey, markets, TTL.props);
      }
      const block = formatPlayerPropsBlock(markets || [], league);
      return buildPrompt(prompt, block, `PredictionData.io ${league} Player Props Service`);
    }

    // ── FUTURES ───────────────────────────────────────────────────────────
    if (intent.type === 'futures') {
      const cacheKey = `futures:${league}`;
      let markets = await cacheGet(cacheKey);
      if (!markets) {
        markets = await safe(getFuturesMarketsService(league, DEFAULT_BOOK_IDS), 6000);
        if (markets) await cacheSet(cacheKey, markets, TTL.futures);
      }
      const block = formatFuturesBlock(markets || [], league);
      return buildPrompt(prompt, block, `PredictionData.io ${league} Futures Odds Service`);
    }

    // ── GAME SCHEDULE (no betting keywords) ───────────────────────────────
    if (intent.type === 'schedule') {
      const cacheKey = `fixtures:${league}`;
      let fixtures = await cacheGet(cacheKey);
      if (!fixtures) {
        fixtures = await safe(getFixturesService(league, 72), 5000);
        if (fixtures) await cacheSet(cacheKey, fixtures, TTL.fixtures);
      }
      const block = formatScheduleBlock(fixtures || [], league);
      return buildPrompt(prompt, block, `PredictionData.io ${league} Schedule Service`);
    }

    // ── STANDARD ODDS (moneyline + spread + total) ────────────────────────
    if (intent.type === 'odds') {
      const cacheKey = `odds:${league}`;
      const fixturesCacheKey = `fixtures:${league}`;

      let [markets, fixtures] = await Promise.all([
        cacheGet(cacheKey),
        cacheGet(fixturesCacheKey),
      ]);

      if (!markets || !fixtures) {
        const [freshMarkets, freshFixtures] = await Promise.all([
          safe(getMarketsService(league, 'moneyline,spread,total', 'FT', DEFAULT_BOOK_IDS, { timedelta: 48 }), 7000),
          safe(getFixturesService(league, 48), 5000),
        ]);

        if (freshMarkets) {
          markets = freshMarkets;
          await cacheSet(cacheKey, markets, TTL.odds);
        }
        if (freshFixtures) {
          fixtures = freshFixtures;
          await cacheSet(fixturesCacheKey, fixtures, TTL.fixtures);
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
