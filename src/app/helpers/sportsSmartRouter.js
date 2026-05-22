/**
 * Sports Smart Router — v4
 *
 * RAG-powered sports betting context injector — maximum PredictionData.io coverage.
 *
 * v3 improvements over v2:
 *   ✅ no_vig_odds (fair value / devigged probability) extracted and shown
 *   ✅ open_odds (opening line) extracted — full open → current movement shown
 *   ✅ provider_url / provider_deeplink_string surfaced in RAG context
 *   ✅ updated_at freshness timestamp shown per market
 *   ✅ Player props grouped by GAME → player → prop (fixture context preserved)
 *   ✅ Multi-book side-by-side odds comparison (best line shopping)
 *   ✅ PrizePicks / Underdog / Sleeper DFS props included in player prop context
 *   ✅ SGP intent now CALLS getSGPOddsService for real pricing when legs detected
 *   ✅ Seasons data injected into futures context
 *   ✅ True no-vig implied probability vs raw implied probability shown
 *   ✅ Team data enrichment — full_name, conference, record in schedule blocks
 *   ✅ Fixture finish_type shown (OT, SO, KO, Decision, etc.)
 *   ✅ Line value analysis — compare market odds to no_vig fair value
 *
 * Handles all intent types:
 *   live_odds         — real-time in-game markets with live scores
 *   odds              — pre-game moneyline + spread + total, multi-book
 *   player_prop       — player props grouped by game + player
 *   game_prop         — in-game event props (UFC, soccer, etc.)
 *   futures           — championship/award futures with seasons context
 *   schedule          — game schedule with team details
 *   sgp               — Same Game Parlay with live POST pricing
 *   prediction_market — Polymarket/Kalshi orderbook depth
 *   alt_lines         — alternate spread/total with devig comparison
 *   period_odds       — 1H, 1Q, 1P, F5, etc.
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
  getTeamsService,
  getSeasonsService,
  getMarketSummariesService,
  getOrderbookService,
  getSGPOddsService,
  getPlayersService,
  buildDeeplinkService,
  getFullMarketService,
  BOOK_IDS,
} from '../modules/predictiondata/predictiondata.service.js';

import { logger } from '../../shared/logger.js';
import { RedisClient } from '../../shared/redis.js';
import {
  detectSportsIntent,
  DEFAULT_BOOK_IDS,
  PROPS_BOOK_IDS,
  LEAGUE_EMOJI,
  LEAGUE_SPORT,
  LEAGUE_PROP_TYPES,
  LEAGUE_FUTURES_TYPES,
  PLAYER_NAME_MAP,
  MULTI_LEAGUE_ACTIVE,
  BROADCAST_KEYWORDS,
  SPORTS_ODDS_KEYWORDS,
} from './sportsIntentDB.js';

import { getStandings, getFixtureStats, getHeadToHead, LEAGUE_MAP as APISPORTS_LEAGUE_MAP } from '../modules/apisports/apisports.service.js';
import { getCachedLiveLeagues } from './sportsDataCache.js';

// ─── Cache TTLs (seconds) ─────────────────────────────────────────────────────
const TTL = {
  odds:       30,
  live:       10,
  props:      45,
  game_props: 45,
  futures:    300,
  fixtures:   120,
  teams:      3600,   // Team reference data — 1hr (slow changing)
  players:    1800,   // Player reference data — 30min
  seasons:    1800,   // Season data — 30min
  orderbook:  20,
  summaries:  60,
  alt_lines:  45,
  period:     30,
};

// DFS / player market platforms — supplements sportsbooks for props
const DFS_BOOK_IDS    = '385,387,595,800'; // PrizePicks, Underdog Fantasy, Sleeper, Fliff
const ALL_PROPS_BOOKS = '100,200,400,385,387,595'; // FD + DK + BetMGM + PrizePicks + Underdog + Sleeper

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

// ─── Decimal odds → implied probability (raw, with juice) ────────────────────
function decToImplied(dec) {
  if (!dec || dec <= 1) return 'N/A';
  return `${((1 / dec) * 100).toFixed(1)}%`;
}

// ─── No-vig (fair value) probability ─────────────────────────────────────────
// no_vig_odds is already devigged — just convert decimal → probability
function noVigProb(noVigDec) {
  if (!noVigDec || noVigDec <= 1) return null;
  return `${((1 / noVigDec) * 100).toFixed(1)}%`;
}

// ─── Movement indicator ───────────────────────────────────────────────────────
function moveIndicator(market) {
  if (market.move_dir === 'up')   return '↑🔴';
  if (market.move_dir === 'down') return '↓🟢';
  return '—';
}

// ─── Open → Current line movement string ─────────────────────────────────────
function openToCurrentML(market) {
  const open    = decToAmerican(market.open_odds);
  const current = decToAmerican(market.odds);
  if (open === 'N/A' || open === current) return current;
  return `${open} → **${current}**`;
}

function openToCurrentNum(market) {
  if (market.open_number == null || market.open_number === market.number) {
    return market.number != null ? `**${market.number >= 0 ? '+' : ''}${market.number}**` : '—';
  }
  return `${market.open_number >= 0 ? '+' : ''}${market.open_number} → **${market.number >= 0 ? '+' : ''}${market.number}**`;
}

// ─── Value indicator: compare market to no-vig fair value ────────────────────
function valueTag(market) {
  if (!market.no_vig_odds || !market.odds) return '';
  const edge = (1 / market.odds) - (1 / market.no_vig_odds);
  if (edge < -0.02) return ' 🟢**+EV**'; // market better than fair → positive value
  if (edge >  0.02) return ' 🔴-EV';      // market worse than fair → negative value
  return '';
}

// ─── Freshness indicator ──────────────────────────────────────────────────────
function freshnessTag(market) {
  if (!market.updated_at) return '';
  const ageSeconds = (Date.now() / 1000) - market.updated_at;
  if (ageSeconds < 30)  return ' ⚡*just now*';
  if (ageSeconds < 120) return ` *(${Math.round(ageSeconds)}s ago)*`;
  return '';
}

// ─── Book ID → display name ───────────────────────────────────────────────────
const BOOK_NAME_MAP = {
  100: 'FanDuel',   200: 'DraftKings',  300: 'Caesars',    400: 'BetMGM',
  250: 'Pinnacle',  700: 'ESPN Bet',    500: 'BetRivers',  365: 'bet365',
  555: 'Betway',    643: 'Bovada',      193: 'Polymarket', 194: 'Kalshi',
  722: 'Fanatics',  800: 'Fliff',       600: 'PointsBet',  192: 'Novig',
  999: 'True Line', 617: 'LowVig',      385: 'PrizePicks', 387: 'Underdog',
  595: 'Sleeper',   388: 'Underdog SB', 448: 'SportTrade', 150: 'Circa',
  345: 'ToonieB',   446: 'Stake',       613: 'BetOnline',  850: 'HardRock',
};
function bookName(id) { return BOOK_NAME_MAP[id] || `Book#${id}`; }

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
▸ Use Markdown tables for odds comparisons — never use plain lists
▸ NEVER fabricate, estimate, or hallucinate any odds, lines, or player stats
▸ "Open → Current" format shows line movement (open was original, current is now)
▸ ↑🔴 = line moved up (money on over/favorite), ↓🟢 = line moved down
▸ 🟢+EV = market odds BETTER than fair value (good bet). 🔴-EV = worse than fair value
▸ ⚡ = just updated (within 30s). Show freshness when provided.
▸ Fair Value % = no-vig implied probability (removes bookmaker margin)
▸ When provider_url is available, include it as a clickable betting link
▸ Answer the user's EXACT question using only the verified data above
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

User Query: ${userPrompt}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORMATTERS  — v3 (full field extraction from every market object)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format standard odds (moneyline + spread + total) for all fixtures in a league.
 * v3: shows open→current movement, no-vig fair value, +EV tags, freshness,
 *     multi-book comparison table, provider deeplink, finish_type for live.
 */
function formatOddsBlock(markets, fixtures, league, label = "Today's Odds") {
  const emoji = LEAGUE_EMOJI[league] || '🏟️';

  if (!markets || markets.length === 0) {
    return `## ${emoji} ${league} — ${label}\n\n*No odds data currently available for ${league}. Games may not be scheduled within the next 48h, or the league may be off-season.*\n`;
  }

  // Build fixture lookup map
  const fixtureMap = {};
  if (Array.isArray(fixtures)) {
    fixtures.forEach((f) => { fixtureMap[f.id] = f; });
  }

  // Group markets: fixture_id → bet_type → [market objects]
  const byFixture = {};
  markets.forEach((m) => {
    const fid = m.fixture_id || 'unknown';
    if (!byFixture[fid]) byFixture[fid] = { moneyline: [], spread: [], total: [] };
    const bt = (m.bet_type || '').toLowerCase();
    if (bt === 'moneyline') byFixture[fid].moneyline.push(m);
    else if (bt === 'spread') byFixture[fid].spread.push(m);
    else if (bt === 'total')  byFixture[fid].total.push(m);
  });

  let block = `## ${emoji} ${league} — ${label}\n`;
  block += `> 📡 **PredictionData.io** Real-Time Odds | FanDuel • DraftKings • Caesars • BetMGM • Pinnacle\n\n`;

  const fixtureIds = Object.keys(byFixture).slice(0, 15);

  for (const fid of fixtureIds) {
    const fixture = fixtureMap[fid];
    const awayAbbr = fixture?.away_abbr || '?';
    const homeAbbr = fixture?.home_abbr || '?';

    const gameDate = fixture?.date
      ? new Date(fixture.date).toLocaleString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
        })
      : '';

    // Live score + period clock
    let liveStatus = '';
    if (fixture?.status === 'in_progress') {
      const scoreStr = fixture.home_score !== undefined
        ? `**${fixture.away_score}–${fixture.home_score}**`
        : '';
      const periodStr = fixture.current_period_text
        ? ` · ${fixture.current_period_text}`
        : '';
      const clockStr = fixture.current_clock
        ? ` · ⏱ ${fixture.current_clock}`
        : '';
      liveStatus = ` 🔴 LIVE ${scoreStr}${periodStr}${clockStr}`;
    } else if (fixture?.status === 'complete' || fixture?.status === 'final') {
      const scoreStr = `${fixture.away_score}–${fixture.home_score}`;
      const finishType = fixture.finish_type ? ` (${fixture.finish_type})` : '';
      liveStatus = ` ✅ Final: ${scoreStr}${finishType}`;
    }

    block += `### ${awayAbbr} @ ${homeAbbr}${gameDate ? `  ·  ${gameDate}` : ''}${liveStatus}\n`;

    const { moneyline, spread, total } = byFixture[fid];

    // ── Multi-book moneyline comparison ────────────────────────────────────
    if (moneyline.length > 0) {
      // Group by side, then by book
      const bySide = {};
      moneyline.forEach((m) => {
        const side = m.side || m.side_type || '?';
        if (!bySide[side]) bySide[side] = [];
        bySide[side].push(m);
      });

      const sides = Object.keys(bySide);
      if (sides.length > 0) {
        // Get all books present
        const booksPresent = [...new Set(moneyline.map((m) => m.odd_provider_id))].slice(0, 5);

        block += `\n**Moneyline**\n`;
        if (booksPresent.length >= 2) {
          // Multi-book comparison table
          const header = `| Side | ${booksPresent.map(bookName).join(' | ')} | Fair Value | Move |`;
          const divider = `|------|${booksPresent.map(() => '------').join('|')}|------------|------|`;
          block += header + '\n' + divider + '\n';

          sides.slice(0, 3).forEach((side) => {
            const sideMarkets = bySide[side];
            const bookOdds = booksPresent.map((bid) => {
              const m = sideMarkets.find((x) => x.odd_provider_id === bid);
              if (!m) return '—';
              const val = valueTag(m);
              return `**${decToAmerican(m.odds)}**${val}`;
            });
            // Use first available market for fair value + move
            const ref = sideMarkets[0];
            const fv  = ref?.no_vig_odds ? `${noVigProb(ref.no_vig_odds)}` : '—';
            const mv  = moveIndicator(ref);
            block += `| ${side} | ${bookOdds.join(' | ')} | ${fv} | ${mv} |\n`;
          });
        } else {
          // Single book — full detail row
          block += `| Side | Moneyline | Open | Fair Value | Move | Freshness |\n`;
          block += `|------|-----------|------|------------|------|-----------|\n`;
          sides.slice(0, 3).forEach((side) => {
            const m = bySide[side][0];
            const fv = m.no_vig_odds ? noVigProb(m.no_vig_odds) : '—';
            block += `| ${side} | **${decToAmerican(m.odds)}** | ${decToAmerican(m.open_odds)} | ${fv} | ${moveIndicator(m)} | ${freshnessTag(m)} |\n`;
          });
        }
      }
    }

    // ── Spread comparison ──────────────────────────────────────────────────
    if (spread.length > 0) {
      const bySide = {};
      spread.filter((m) => !m.is_alt).forEach((m) => {
        const side = m.side || m.side_type || '?';
        if (!bySide[side]) bySide[side] = [];
        bySide[side].push(m);
      });
      const sides = Object.keys(bySide);
      if (sides.length > 0) {
        block += `\n**Spread**\n`;
        block += `| Side | Line | Odds | Open Line | Fair Value | Move |\n`;
        block += `|------|------|------|-----------|------------|------|\n`;
        sides.slice(0, 4).forEach((side) => {
          const m = bySide[side][0];
          const openNum = m.open_number != null ? `${m.open_number >= 0 ? '+' : ''}${m.open_number}` : '—';
          const fv = m.no_vig_odds ? noVigProb(m.no_vig_odds) : '—';
          block += `| ${side} | **${m.number >= 0 ? '+' : ''}${m.number}** | **${decToAmerican(m.odds)}** | ${openNum} | ${fv} | ${moveIndicator(m)} |\n`;
        });
      }
    }

    // ── Totals comparison ──────────────────────────────────────────────────
    if (total.length > 0) {
      const over  = total.find((m) => (m.side === 'Over'  || m.side_type === 'Over')  && !m.is_alt);
      const under = total.find((m) => (m.side === 'Under' || m.side_type === 'Under') && !m.is_alt);
      if (over || under) {
        block += `\n**Total (O/U)**\n`;
        block += `| Side | Line | Odds | Open Line | Fair Value | Move |\n`;
        block += `|------|------|------|-----------|------------|------|\n`;
        [over, under].filter(Boolean).forEach((m) => {
          const openNum = m.open_number != null ? String(m.open_number) : '—';
          const fv = m.no_vig_odds ? noVigProb(m.no_vig_odds) : '—';
          block += `| ${m.side || m.side_type} | **${m.number}** | **${decToAmerican(m.odds)}** | ${openNum} | ${fv} | ${moveIndicator(m)} |\n`;
        });
      }
    }

    // Deeplink if available (from any market for this fixture)
    const anyWithUrl = markets.find((m) => m.fixture_id === fid && m.provider_url);
    if (anyWithUrl?.provider_url) {
      block += `\n> 🔗 [Bet this game at ${bookName(anyWithUrl.odd_provider_id)}](${anyWithUrl.provider_url})\n`;
    }

    block += '\n';
  }

  return block;
}

/**
 * Format player props — v3.
 * Grouped: Game → Player → all props with multi-book comparison,
 * fair value (no-vig), open line, +EV tags, PrizePicks/Underdog lines.
 */
function formatPlayerPropsBlock(markets, fixtures, league, playerMap = {}) {
  const emoji = LEAGUE_EMOJI[league] || '🏟️';

  if (!markets || markets.length === 0) {
    return `## ${emoji} ${league} — Player Props\n\n*No player prop data currently available.*\n`;
  }

  // Build fixture lookup
  const fixtureMap = {};
  if (Array.isArray(fixtures)) {
    fixtures.forEach((f) => { fixtureMap[f.id] = f; });
  }

  // Group: fixture_id → player_name → prop_name → [markets]
  const byFixture = {};
  markets.forEach((m) => {
    const fid        = m.fixture_id || 'no_fixture';
    const player     = m.player_name || m.player_id || 'Unknown Player';
    const propName   = m.prop_name || m.bet_type || 'Prop';
    if (!byFixture[fid]) byFixture[fid] = {};
    if (!byFixture[fid][player]) byFixture[fid][player] = {};
    if (!byFixture[fid][player][propName]) byFixture[fid][player][propName] = [];
    byFixture[fid][player][propName].push(m);
  });

  let block = `## ${emoji} ${league} — Player Props\n`;
  block += `> 📡 **PredictionData.io** | FanDuel • DraftKings • BetMGM • PrizePicks • Underdog • Sleeper\n\n`;

  const fixtureIds = Object.keys(byFixture).slice(0, 8);

  for (const fid of fixtureIds) {
    const fixture = fixtureMap[fid];
    const matchup = fixture
      ? `${fixture.away_abbr || '?'} @ ${fixture.home_abbr || '?'}`
      : `Game ${fid.slice(0, 8)}`;

    block += `### ${matchup}\n`;

    const players = Object.keys(byFixture[fid]).slice(0, 20);

    for (const player of players) {
      const props = byFixture[fid][player];
      const propNames = Object.keys(props);

      // Look up player reference data if available
      const pRefObj = playerMap && typeof playerMap === 'object'
        ? Object.values(playerMap).find((p) => (p.full_name || '').toLowerCase() === player.toLowerCase())
        : null;
      const posTag = pRefObj?.position ? ` (${pRefObj.position})` : '';
      const teamTag = pRefObj?.team_abbr ? ` — ${pRefObj.team_abbr}` : '';
      const statusTag = pRefObj?.status && pRefObj.status !== 'Active' ? ` ⚠️ ${pRefObj.status}` : '';
      block += `\n**${player}${posTag}${teamTag}${statusTag}**\n`;
      block += `| Prop | Line | Over | Under | Fair Value | Open | Move | +EV? |\n`;
      block += `|------|------|------|-------|------------|------|------|------|\n`;

      for (const propName of propNames) {
        const ms = props[propName];
        const over  = ms.find((m) => m.side === 'Over'  || m.side_type === 'Over');
        const under = ms.find((m) => m.side === 'Under' || m.side_type === 'Under');
        const ref   = over || under || ms[0];
        if (!ref) continue;

        const line = ref.number != null ? String(ref.number) : '—';
        const openL = ref.open_number != null ? String(ref.open_number) : '—';
        const overOdds  = over  ? `**${decToAmerican(over.odds)}**`  : '—';
        const underOdds = under ? `**${decToAmerican(under.odds)}**` : '—';
        const fv   = ref.no_vig_odds ? noVigProb(ref.no_vig_odds) : '—';
        const mv   = moveIndicator(ref);
        const ev   = (over ? valueTag(over) : '') || (under ? valueTag(under) : '') || '—';

        block += `| ${propName} | **${line}** | ${overOdds} | ${underOdds} | ${fv} | ${openL} | ${mv} | ${ev} |\n`;
      }

      // PrizePicks / Underdog line (if different from sportsbook)
      const dfsMarkets = markets.filter((m) =>
        (m.player_name === player || m.player_id === player) &&
        [385, 387, 595].includes(m.odd_provider_id)
      );
      if (dfsMarkets.length > 0) {
        block += '\n*DFS Platforms:* ';
        const seen = new Set();
        dfsMarkets.forEach((m) => {
          const key = `${bookName(m.odd_provider_id)}:${m.prop_name}:${m.number}`;
          if (!seen.has(key)) {
            seen.add(key);
            block += `${bookName(m.odd_provider_id)} ${m.prop_name} **${m.number}** | `;
          }
        });
        block = block.replace(/\| $/, '\n');
      }
    }

    block += '\n';
  }

  return block;
}

/**
 * Format game props — v3.
 * Includes no-vig fair value, open odds, +EV tags, deeplinks.
 */
function formatGamePropsBlock(markets, fixtures, league) {
  const emoji = LEAGUE_EMOJI[league] || '🏟️';

  if (!markets || markets.length === 0) {
    return `## ${emoji} ${league} — Game Props\n\n*No game prop data currently available.*\n`;
  }

  const fixtureMap = {};
  if (Array.isArray(fixtures)) {
    fixtures.forEach((f) => { fixtureMap[f.id] = f; });
  }

  // Group by fixture → prop_name
  const byFixture = {};
  markets.forEach((m) => {
    const fid = m.fixture_id || 'unknown';
    const key = m.prop_name || m.bet_type || 'Game Prop';
    if (!byFixture[fid]) byFixture[fid] = {};
    if (!byFixture[fid][key]) byFixture[fid][key] = [];
    byFixture[fid][key].push(m);
  });

  let block = `## ${emoji} ${league} — Game Props\n`;
  block += `> 📡 **PredictionData.io** Game Event Props\n\n`;

  for (const [fid, propGroups] of Object.entries(byFixture)) {
    const fixture = fixtureMap[fid];
    const matchup = fixture
      ? `${fixture.away_abbr} @ ${fixture.home_abbr}`
      : `Game ${fid.slice(0, 8)}`;

    block += `### ${matchup}\n`;
    block += `| Prop | Side | Odds | Fair Value | Open Odds | Move | +EV? |\n`;
    block += `|------|------|------|------------|-----------|------|------|\n`;

    for (const [propName, ms] of Object.entries(propGroups)) {
      ms.slice(0, 6).forEach((m) => {
        const fv = m.no_vig_odds ? noVigProb(m.no_vig_odds) : '—';
        const openOdds = m.open_odds ? decToAmerican(m.open_odds) : '—';
        const ev = valueTag(m) || '—';
        block += `| ${propName} | ${m.side || m.side_type || '?'} | **${decToAmerican(m.odds)}** | ${fv} | ${openOdds} | ${moveIndicator(m)} | ${ev} |\n`;
      });
    }
    block += '\n';
  }

  return block;
}

/**
 * Format futures — v3.
 * Sorted by odds (favorites first), with no-vig fair value, open odds,
 * seasons context (active season name, end date), movement.
 */
function formatFuturesBlock(markets, league, seasons = []) {
  const emoji = LEAGUE_EMOJI[league] || '🏆';

  if (!markets || markets.length === 0) {
    return `## ${emoji} ${league} — Futures Odds\n\n*No futures data currently available for ${league}. The league may be off-season.*\n`;
  }

  // Active season context
  const activeSeason = seasons.find((s) => s.is_active || s.in_progress);
  const seasonInfo = activeSeason
    ? `**Season:** ${activeSeason.name}${activeSeason.end_date ? ` · Ends ${new Date(activeSeason.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}`
    : '';

  const byFuture = {};
  markets.forEach((m) => {
    const key = m.prop_name || 'Futures';
    if (!byFuture[key]) byFuture[key] = [];
    byFuture[key].push(m);
  });

  let block = `## ${emoji} ${league} — Futures Odds\n`;
  block += `> 📡 **PredictionData.io** | FanDuel • DraftKings • Caesars • BetMGM • Pinnacle\n`;
  if (seasonInfo) block += `> ${seasonInfo}\n`;
  block += '\n';

  for (const [futureType, ms] of Object.entries(byFuture)) {
    block += `### ${futureType}\n`;
    block += `| Selection | Odds | Fair Value | Open Odds | Move | +EV? |\n`;
    block += `|-----------|------|------------|-----------|------|------|\n`;

    const sorted = [...ms].sort((a, b) => (a.odds ?? 99) - (b.odds ?? 99));
    sorted.slice(0, 15).forEach((m) => {
      const fv     = m.no_vig_odds ? noVigProb(m.no_vig_odds) : '—';
      const openML = m.open_odds   ? decToAmerican(m.open_odds) : '—';
      const ev     = valueTag(m) || '—';
      block += `| ${m.side || '?'} | **${decToAmerican(m.odds)}** | ${fv} | ${openML} | ${moveIndicator(m)} | ${ev} |\n`;
    });
    block += '\n';
  }

  return block;
}

/**
 * Format schedule — v3.
 * Includes team full_names, finish_type, full clock/period, venue.
 */
function formatScheduleBlock(fixtures, teams, league) {
  const emoji = LEAGUE_EMOJI[league] || '📅';

  if (!fixtures || fixtures.length === 0) {
    return `## ${emoji} ${league} — Schedule\n\n*No upcoming games found for ${league}.*\n`;
  }

  // Team name lookup
  const teamMap = {};
  if (teams && typeof teams === 'object') {
    Object.values(teams).forEach((t) => {
      if (t.id) teamMap[t.id] = t;
    });
  }

  let block = `## ${emoji} ${league} — Upcoming Games\n\n`;
  block += `| # | Matchup | Date/Time | Status | Score |\n`;
  block += `|---|---------|-----------|--------|-------|\n`;

  fixtures.slice(0, 15).forEach((f, i) => {
    const awayFull = teamMap[f.away_id]?.full_name || f.away_abbr || '?';
    const homeFull = teamMap[f.home_id]?.full_name || f.home_abbr || '?';
    const matchup  = `${awayFull} @ ${homeFull}`;

    const date = f.date
      ? new Date(f.date).toLocaleString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
        })
      : 'TBD';

    const status = f.status || 'scheduled';

    let score = '—';
    if (f.status === 'in_progress') {
      const clockStr = f.current_clock ? ` ⏱${f.current_clock}` : '';
      const periodStr = f.current_period_text ? ` ${f.current_period_text}` : '';
      score = `🔴 **${f.away_score}–${f.home_score}**${periodStr}${clockStr}`;
    } else if (f.home_score > 0 || f.away_score > 0) {
      const ft = f.finish_type ? ` (${f.finish_type})` : ' (Final)';
      score = `${f.away_score}–${f.home_score}${ft}`;
    }

    block += `| ${i + 1} | **${matchup}** | ${date} | ${status} | ${score} |\n`;
  });

  return block;
}

/**
 * Format alternate lines — v3.
 * Side-by-side alt spread vs alt total, with implied prob and +EV tags.
 */
function formatAltLinesBlock(markets, league) {
  const emoji = LEAGUE_EMOJI[league] || '🏟️';

  if (!markets || markets.length === 0) {
    return `## ${emoji} ${league} — Alternate Lines\n\n*No alternate lines available.*\n`;
  }

  const altMarkets = markets.filter((m) => m.is_alt === true);
  if (altMarkets.length === 0) {
    return `## ${emoji} ${league} — Alternate Lines\n\n*No alternate lines marked in current data.*\n`;
  }

  // Group by fixture → bet_type
  const byFixture = {};
  altMarkets.forEach((m) => {
    const fid = m.fixture_id || 'unknown';
    const bt  = (m.bet_type || '').toLowerCase();
    if (!byFixture[fid]) byFixture[fid] = { spread: [], total: [] };
    if (bt === 'spread') byFixture[fid].spread.push(m);
    else if (bt === 'total') byFixture[fid].total.push(m);
  });

  let block = `## ${emoji} ${league} — Alternate Lines\n`;
  block += `> 📡 **PredictionData.io** Alternate spreads & totals\n\n`;

  for (const [fid, groups] of Object.entries(byFixture)) {
    block += `#### Game ${fid.slice(0, 8)}\n`;

    if (groups.spread.length > 0) {
      block += `**Alt Spreads**\n| Side | Alt Line | Odds | Fair Value | +EV? |\n|------|----------|------|------------|------|\n`;
      // Sort by number (lowest to highest)
      [...groups.spread].sort((a, b) => (a.number ?? 0) - (b.number ?? 0)).slice(0, 12).forEach((m) => {
        const fv = m.no_vig_odds ? noVigProb(m.no_vig_odds) : '—';
        const ev = valueTag(m) || '—';
        block += `| ${m.side || '?'} | **${m.number >= 0 ? '+' : ''}${m.number}** | **${decToAmerican(m.odds)}** | ${fv} | ${ev} |\n`;
      });
      block += '\n';
    }

    if (groups.total.length > 0) {
      block += `**Alt Totals**\n| Side | Alt Line | Odds | Fair Value | +EV? |\n|------|----------|------|------------|------|\n`;
      [...groups.total].sort((a, b) => (a.number ?? 0) - (b.number ?? 0)).slice(0, 12).forEach((m) => {
        const fv = m.no_vig_odds ? noVigProb(m.no_vig_odds) : '—';
        const ev = valueTag(m) || '—';
        block += `| ${m.side || m.side_type || '?'} | **${m.number}** | **${decToAmerican(m.odds)}** | ${fv} | ${ev} |\n`;
      });
      block += '\n';
    }
  }

  return block;
}

/**
 * Format period odds — v3.
 * Delegates to formatOddsBlock with period filter applied.
 */
function formatPeriodOddsBlock(markets, fixtures, league, period) {
  const periodLabels = {
    '1H': '1st Half', '2H': '2nd Half',
    '1Q': '1st Quarter', '2Q': '2nd Quarter', '3Q': '3rd Quarter', '4Q': '4th Quarter',
    '1P': '1st Period', '2P': '2nd Period', '3P': '3rd Period',
    'F5': 'First 5 Innings', 'F3': 'First 3 Innings', 'F7': 'First 7 Innings',
    '1I': '1st Inning', '2I': '2nd Inning', '1S': '1st Set', '2S': '2nd Set',
    'REG': 'Regulation',
  };
  const label = periodLabels[period] || `${period} Odds`;
  const filtered = (markets || []).filter((m) => !period || m.period === period || m.period === 'FT');
  return formatOddsBlock(filtered, fixtures, league, label);
}

/**
 * Format Polymarket / Kalshi prediction market orderbook — v3.
 * Full bid/ask depth, spread, mid-price, volume, implied probability.
 */
function formatOrderbookBlock(summaries, orderbook, league, provider = 'Polymarket') {
  const emoji = LEAGUE_EMOJI[league] || '🏟️';

  if (!summaries || summaries.length === 0) {
    return `## ${emoji} ${league} — ${provider} Markets\n\n*No active prediction markets found for ${league}.*\n`;
  }

  let block = `## ${emoji} ${league} — ${provider} Prediction Markets\n`;
  block += `> 📡 Live exchange data via **PredictionData.io** powered by ${provider}\n\n`;

  summaries.slice(0, 6).forEach((s) => {
    block += `### Market: ${s.slug || s.id}\n`;
    block += `| Field | Value |\n|-------|-------|\n`;
    block += `| Type | ${s.bet_type || '—'} |\n`;
    block += `| Period | ${s.period || '—'} |\n`;
    block += `| Line | ${s.number != null ? s.number : '—'} |\n`;
    block += `| Active | ${s.is_active ? '✅ Yes' : '❌ No'} |\n`;
    block += `| Outcome | ${s.outcome || '—'} |\n`;
    block += '\n';
  });

  if (orderbook && orderbook.length > 0) {
    const bids = orderbook.filter((o) => !o.is_ask).sort((a, b) => b.price - a.price);
    const asks = orderbook.filter((o) =>  o.is_ask).sort((a, b) => a.price - b.price);

    block += `### 📊 Order Book\n`;
    block += `| Side | Price (¢) | Contracts | Implied Prob |\n`;
    block += `|------|-----------|-----------|-------------|\n`;

    bids.slice(0, 6).forEach((o) => {
      const prob = (o.price * 100).toFixed(1);
      block += `| 🟢 Bid | **${prob}¢** | ${(o.contracts || 0).toLocaleString()} | ${prob}% |\n`;
    });
    asks.slice(0, 6).forEach((o) => {
      const prob = (o.price * 100).toFixed(1);
      block += `| 🔴 Ask | **${prob}¢** | ${(o.contracts || 0).toLocaleString()} | ${prob}% |\n`;
    });

    if (bids.length > 0 && asks.length > 0) {
      const bestBid = bids[0].price;
      const bestAsk = asks[0].price;
      const mid     = ((bestBid + bestAsk) / 2 * 100).toFixed(1);
      const spread  = ((bestAsk - bestBid) * 100).toFixed(2);
      const totalVol = orderbook.reduce((sum, o) => sum + (o.contracts || 0), 0);
      block += `\n| | | | |\n`;
      block += `| **Best Bid** | **${(bestBid * 100).toFixed(1)}¢** | — | — |\n`;
      block += `| **Best Ask** | **${(bestAsk * 100).toFixed(1)}¢** | — | — |\n`;
      block += `| **Mid Price** | **${mid}¢** | — | **${mid}%** |\n`;
      block += `| **Spread** | ${spread}¢ | — | — |\n`;
      block += `| **Total Volume** | — | **${totalVol.toLocaleString()}** | — |\n`;
    }
  }

  return block;
}

/**
 * Format SGP pricing result from POST /api/sgp
 */
function formatSGPResult(sgpResult, legs, league) {
  const emoji = LEAGUE_EMOJI[league] || '🏟️';

  if (!sgpResult || typeof sgpResult !== 'object') {
    return `## ${emoji} ${league} — SGP Pricing\n\n*SGP pricing unavailable — check your legs and try again.*\n`;
  }

  let block = `## ${emoji} ${league} — Same Game Parlay Pricing\n`;
  block += `> 📡 **PredictionData.io** SGP Pricing Engine\n\n`;

  block += `### Legs Selected\n`;
  legs.forEach((leg, i) => {
    block += `${i + 1}. **${leg.bet_type}** | ${leg.side_type || ''} ${leg.prop_name || ''} ${leg.number != null ? leg.number : ''}\n`;
  });
  block += '\n';

  block += `### SGP Pricing by Sportsbook\n`;
  block += `| Sportsbook | American Odds | Decimal | Fair Value | Status |\n`;
  block += `|------------|--------------|---------|------------|--------|\n`;

  for (const [book, data] of Object.entries(sgpResult)) {
    if (data?.error) {
      block += `| ${book} | ❌ N/A | — | — | ${data.error} |\n`;
    } else {
      const fv = data?.decimal ? noVigProb(data.decimal) : '—';
      block += `| **${book}** | **${data?.american || '—'}** | ${data?.decimal || '—'} | ${fv} | ✅ Priced |\n`;
      if (data?.deeplink) {
        block += `> 🔗 [Place at ${book}](${data.deeplink})\n`;
      }
    }
  }

  return block;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ROUTER FUNCTION — v3
// ═══════════════════════════════════════════════════════════════════════════════

// PATCH_V4_APPLIED


// ─── SGP Leg Extractor — parses natural language SGP legs from a prompt ───────
// Patterns like "Chiefs ML + Mahomes over 280.5 pass yds + Kelce 2+ receptions"
// Returns array of { description, bet_type, side_type, number, prop_name } objects
function extractSGPLegs(prompt, fixtures = [], markets = []) {
  const q = prompt.toLowerCase();
  const legs = [];

  // Pattern: moneyline mentions (team name + ML/moneyline/to win)
  const mlPattern = /\b(chiefs|eagles|bills|ravens|packers|cowboys|niners|dolphins|lions|steelers|patriots|texans|jets|giants|rams|chargers|broncos|raiders|seahawks|cardinals|saints|falcons|buccaneers|panthers|bears|vikings|commanders|browns|bengals|colts|titans|jaguars|lakers|celtics|warriors|bucks|heat|nuggets|suns|clippers|knicks|sixers|nets|raptors|bulls|cavs|pacers|hawks|magic|wizards|hornets|pistons|thunder|mavs|spurs|rockets|jazz|kings|wolves|blazers|grizzlies|pelicans|yankees|dodgers|red sox|cubs|astros|braves|mets|phillies|padres|mariners|bruins|leafs|canadiens|rangers|flyers|penguins|capitals|lightning|panthers|hurricanes|islanders|devils|sabres|senators|jets|wild|blackhawks|blues|stars|avalanche|golden knights|kraken|sharks|ducks|kings|flames|oilers|canucks)\b.{0,20}\b(ml|moneyline|to win)\b/gi;
  let match;
  while ((match = mlPattern.exec(q)) !== null) {
    const team = match[1];
    legs.push({ description: match[0].trim(), bet_type: 'moneyline', prop_name: 'Moneyline', side_type: team, number: null });
  }

  // Pattern: over/under props (player name + stat + over/under + number)
  const propPattern = /\b([a-z]+(?:\s[a-z]+){0,2})\s+(over|under|o\/u|o|u)\s*(\d+(?:\.\d+)?)\s*([a-z\s+]+?)(?:,|\+|and|$)/gi;
  while ((match = propPattern.exec(q)) !== null) {
    const [, player, side, num, rawStat] = match;
    const stat = rawStat.trim();
    if (player.length > 1 && !['the', 'and', 'for', 'with', 'from', 'that', 'this', 'these', 'those'].includes(player)) {
      legs.push({
        description: match[0].trim(),
        bet_type: 'player_prop',
        prop_name: stat.length < 40 ? stat : 'Player Prop',
        side_type: side === 'o' ? 'Over' : side === 'u' ? 'Under' : side.charAt(0).toUpperCase() + side.slice(1),
        number: parseFloat(num),
        player_name: player,
      });
    }
  }

  // Pattern: spread mentions (team + spread number)
  const spreadPattern = /\b([a-z ]{3,20})\s+([+-]\d+(?:\.\d+)?)\s*(?:spread|pts?|points?)?\b/gi;
  while ((match = spreadPattern.exec(q)) !== null) {
    const [, team, num] = match;
    const n = parseFloat(num);
    if (!isNaN(n) && Math.abs(n) < 50) {
      legs.push({ description: match[0].trim(), bet_type: 'spread', prop_name: 'Spread', side_type: team.trim(), number: n });
    }
  }

  // Pattern: total mentions (over/under + number + goals/points/runs)
  const totalPattern = /\b(game total|total|o|u|over|under)\s*(\d+(?:\.\d+)?)\s*(?:goals?|points?|runs?|yards?)?\b/gi;
  while ((match = totalPattern.exec(q)) !== null) {
    const [, side, num] = match;
    const n = parseFloat(num);
    if (!isNaN(n) && n > 0) {
      legs.push({ description: match[0].trim(), bet_type: 'total', prop_name: 'Total', side_type: side === 'o' ? 'Over' : 'Under', number: n });
    }
  }

  // Deduplicate by description similarity
  const seen = new Set();
  return legs.filter((leg) => {
    const key = leg.bet_type + ':' + (leg.number ?? '') + ':' + (leg.side_type ?? '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8); // max 8 legs
}


// ─── Player reference enrichment ─────────────────────────────────────────────
// Adds position/team/status to a player map for prop display
async function fetchPlayerMap(league) {
  const cacheKey = `players:${league}`;
  let playerMap = await cacheGet(cacheKey);
  if (!playerMap) {
    const players = await safe(getPlayersService(league, true), 5000);
    playerMap = players || {};
    if (Object.keys(playerMap).length > 0) await cacheSet(cacheKey, playerMap, TTL.players);
  }
  return playerMap;
}


// ─── Batch deeplink generator ─────────────────────────────────────────────────
// Extracts provider_deeplink_string from markets and calls buildDeeplinkService
async function generateDeeplinks(markets, bookName = 'draftkings') {
  try {
    const deeplinkStrings = markets
      .filter((m) => m.provider_deeplink_string)
      .map((m) => m.provider_deeplink_string)
      .slice(0, 10); // API limit
    if (deeplinkStrings.length === 0) return null;
    const result = await safe(buildDeeplinkService(bookName, deeplinkStrings, 'single'), 4000);
    return result?.url || null;
  } catch { return null; }
}


// ─── PINNACLE BOOK ID (sharpest line reference) ───────────────────────────────
const PINNACLE_BOOK_ID = 250;

// ─── Best Available Line Picker ───────────────────────────────────────────────
// For each unique (fixture, bet_type, side, period), finds the book offering
// the best odds. This is the core "line shopping" feature.
function pickBestLine(markets) {
  const groups = {};
  for (const m of markets) {
    const key = [m.fixture_id, m.bet_type, m.prop_name || '', m.side, m.period || 'FT'].join(':');
    if (!groups[key]) groups[key] = [];
    groups[key].push(m);
  }
  const best = [];
  for (const [key, group] of Object.entries(groups)) {
    // Find best odds for this market side (highest positive or least negative)
    const sorted = group.sort((a, b) => {
      const ao = Number(a.odds) || 0;
      const bo = Number(b.odds) || 0;
      // American odds: +150 > +110 > -110 > -150
      if (ao >= 0 && bo >= 0) return bo - ao;  // higher positive = better
      if (ao < 0 && bo < 0)  return ao - bo;   // less negative = better (-110 vs -150)
      if (ao >= 0 && bo < 0) return -1;         // positive always beats negative
      return 1;
    });
    best.push({ ...sorted[0], _allBooks: group.length, _bestOdds: sorted[0].odds });
  }
  return best;
}

// ─── Line Mover / Steam Detection ────────────────────────────────────────────
// Returns top N markets by absolute open_odds → current odds delta.
// Large movement = sharp money or breaking news.
function detectLineMovers(markets, topN = 10) {
  const movers = markets
    .filter((m) => m.open_odds && m.odds && m.open_odds !== m.odds)
    .map((m) => {
      const open = Number(m.open_odds);
      const curr = Number(m.odds);
      if (isNaN(open) || isNaN(curr)) return null;
      // Convert American → decimal for fair delta comparison
      const toDecimal = (n) => n >= 0 ? (n / 100) + 1 : 1 - (100 / n);
      const delta = Math.abs(toDecimal(curr) - toDecimal(open));
      const direction = toDecimal(curr) > toDecimal(open) ? '📈' : '📉';
      return { ...m, _delta: delta, _direction: direction };
    })
    .filter(Boolean)
    .sort((a, b) => b._delta - a._delta)
    .slice(0, topN);
  return movers;
}

// ─── Sharp Analysis (Pinnacle as reference) ───────────────────────────────────
// Markets where Pinnacle's line differs from the book average by > 0.03 decimal.
// Divergence = "sharp" signal; book closing toward Pinnacle = steam.
function buildSharpAnalysis(markets, league) {
  const fixtureGroups = {};
  for (const m of markets) {
    const key = [m.fixture_id, m.bet_type, m.prop_name || '', m.side, m.period || 'FT'].join(':');
    if (!fixtureGroups[key]) fixtureGroups[key] = { pin: null, others: [] };
    if (m.odd_provider_id === PINNACLE_BOOK_ID) {
      fixtureGroups[key].pin = m;
    } else {
      fixtureGroups[key].others.push(m);
    }
  }

  const toDecimal = (n) => {
    const num = Number(n);
    if (isNaN(num)) return null;
    return num >= 0 ? (num / 100) + 1 : 1 - (100 / num);
  };

  const sharp = [];
  for (const [, group] of Object.entries(fixtureGroups)) {
    if (!group.pin || group.others.length === 0) continue;
    const pinDec = toDecimal(group.pin.odds);
    if (!pinDec) continue;
    const avgOtherDec = group.others.reduce((s, m) => s + (toDecimal(m.odds) || 0), 0) / group.others.length;
    if (!avgOtherDec) continue;
    const divergence = Math.abs(pinDec - avgOtherDec);
    if (divergence > 0.02) { // threshold: 2 cents on the dollar
      const pinFavorsPub = pinDec < avgOtherDec; // Pinnacle offers less → sharps on other side
      sharp.push({
        ...group.pin,
        _divergence: divergence,
        _avgPublic: avgOtherDec,
        _sharpSignal: pinFavorsPub ? '🦅 Sharp On Other Side' : '🦅 Sharp Agrees With Pub',
      });
    }
  }
  return sharp.sort((a, b) => b._divergence - a._divergence);
}

// ─── Value Bets (+EV) Finder ─────────────────────────────────────────────────
// Finds markets where a book's odds are better than no_vig_odds suggests.
// Edge = (book_implied_prob - no_vig_implied_prob). Positive = +EV.
function buildValueBets(markets, minEdgePct = 1.5) {
  const toImplied = (odds) => {
    const n = Number(odds);
    if (isNaN(n)) return null;
    if (n >= 0) return 100 / (n + 100);
    return Math.abs(n) / (Math.abs(n) + 100);
  };
  return markets
    .filter((m) => m.odds && m.no_vig_odds)
    .map((m) => {
      const bookImpl   = toImplied(m.odds);
      const noVigImpl  = toImplied(m.no_vig_odds);
      if (!bookImpl || !noVigImpl) return null;
      const edge = (noVigImpl - bookImpl) * 100; // positive = book paying more than fair
      return edge >= minEdgePct ? { ...m, _edge: edge, _bookImpl: bookImpl, _noVigImpl: noVigImpl } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b._edge - a._edge);
}

// ─── Format Value Bets Block ──────────────────────────────────────────────────
function formatValueBetsBlock(valueBets, league) {
  if (valueBets.length === 0) return `*No significant +EV spots found for ${league} at this time.*`;
  const emoji = LEAGUE_EMOJI[league] || '🏆';
  let block = `## ${emoji} ${league} — +EV Value Bets (Fair Value Edge > 1.5%)

`;
  block += `> 📡 **PredictionData.io** | Pinnacle no-vig odds used as fair value reference

`;
  block += `| Game | Market | Side | Odds | Fair Value | **Edge** | Book | Bet Link |
`;
  block += `|------|--------|------|------|------------|----------|------|----------|
`;

  valueBets.slice(0, 15).forEach((m) => {
    const odds     = m.odds     ? `${m.odds >= 0 ? '+' : ''}${m.odds}` : 'N/A';
    const fv       = m.no_vig_odds ? `${m.no_vig_odds >= 0 ? '+' : ''}${m.no_vig_odds}` : 'N/A';
    const edge     = `**+${m._edge.toFixed(1)}%**`;
    const bookName = Object.entries(BOOK_IDS).find(([, id]) => id === m.odd_provider_id)?.[0] || `Book ${m.odd_provider_id}`;
    const link     = m.provider_url ? `[Bet ↗](${m.provider_url})` : '';
    const side     = m.side || m.prop_name || '';
    const fixture  = m._fixtureLabel || m.fixture_id || '';
    block += `| ${fixture} | ${m.bet_type} | ${side} | **${odds}** | ${fv} | ${edge} | ${bookName} | ${link} |
`;
  });

  block += `
> 💡 Edge = (No-Vig Implied Prob - Book Implied Prob). Positive edge = book paying more than fair value.
`;
  return block;
}

// ─── Format Line Movers Block ─────────────────────────────────────────────────
function formatLineMoversBlock(movers, league) {
  if (movers.length === 0) return `*No significant line movement found for ${league}.*`;
  const emoji = LEAGUE_EMOJI[league] || '🏆';
  let block = `## ${emoji} ${league} — Line Movers (Steam Detection)

`;
  block += `> 🔥 Markets with the largest line movement from open — indicates sharp money

`;
  block += `| Game | Market | Side | Open | Current | Move | Book |
`;
  block += `|------|--------|------|------|---------|------|------|
`;

  movers.forEach((m) => {
    const open = m.open_odds ? `${m.open_odds >= 0 ? '+' : ''}${m.open_odds}` : 'N/A';
    const curr = m.odds      ? `${m.odds >= 0 ? '+' : ''}${m.odds}`      : 'N/A';
    const bookName = Object.entries(BOOK_IDS).find(([, id]) => id === m.odd_provider_id)?.[0] || `Book ${m.odd_provider_id}`;
    const side = m.side || m.prop_name || '';
    block += `| ${m.fixture_id || ''} | ${m.bet_type} | ${side} | ${open} | **${curr}** | ${m._direction} | ${bookName} |
`;
  });

  return block;
}

// ─── Format Sharp Picks Block ─────────────────────────────────────────────────
function formatSharpPicksBlock(sharp, league) {
  if (sharp.length === 0) return `*No significant Pinnacle divergence found for ${league}.*`;
  const emoji = LEAGUE_EMOJI[league] || '🏆';
  let block = `## ${emoji} ${league} — Sharp Picks (Pinnacle Divergence)

`;
  block += `> 🦅 Markets where Pinnacle's price diverges from the public book average
`;
  block += `> Pinnacle = sharpest book. Divergence > 2¢ signals sharp money.

`;
  block += `| Game | Market | Side | Pinnacle | Avg Public | **Signal** |
`;
  block += `|------|--------|------|----------|------------|------------|
`;

  sharp.slice(0, 10).forEach((m) => {
    const pinOdds = `${m.odds >= 0 ? '+' : ''}${m.odds}`;
    const pubDecToAmerican = (d) => {
      if (!d || d < 1) return 'N/A';
      return d >= 2 ? '+' + Math.round((d - 1) * 100) : '-' + Math.round(100 / (d - 1));
    };
    const pubOdds = pubDecToAmerican(m._avgPublic);
    const side = m.side || m.prop_name || '';
    block += `| ${m.fixture_id || ''} | ${m.bet_type} | ${side} | **${pinOdds}** | ${pubOdds} | ${m._sharpSignal} |
`;
  });

  return block;
}


// ─── Arbitrage Detector ───────────────────────────────────────────────────────
// Finds market pairs across books where combined implied probability < 100%.
// This means you can bet both sides profitably with zero risk.
// Returns array of arb opportunities with profit % and optimal bet sizes.
function findArbitrageOpportunities(markets) {
  const toImplied = (odds) => {
    const n = Number(odds);
    if (isNaN(n)) return null;
    return n >= 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100);
  };

  // Group by fixture + bet_type + prop_name + period (market level)
  const marketGroups = {};
  for (const m of markets) {
    const key = [m.fixture_id, m.bet_type, m.prop_name || '', m.period || 'FT'].join(':');
    if (!marketGroups[key]) marketGroups[key] = { sides: {}, fixture_id: m.fixture_id, bet_type: m.bet_type };
    const side = m.side || 'N/A';
    if (!marketGroups[key].sides[side]) marketGroups[key].sides[side] = [];
    marketGroups[key].sides[side].push(m);
  }

  const arbs = [];
  for (const [key, group] of Object.entries(marketGroups)) {
    const sides = Object.entries(group.sides);
    if (sides.length < 2) continue;

    // For each side, find the best odds
    const bestBySide = sides.map(([side, mList]) => {
      const sorted = mList.sort((a, b) => {
        const ai = toImplied(a.odds), bi = toImplied(b.odds);
        return (ai || 99) - (bi || 99); // lower implied = better odds
      });
      return { side, best: sorted[0] };
    });

    // Sum of best implied probabilities
    const totalImplied = bestBySide.reduce((sum, { best }) => {
      return sum + (toImplied(best.odds) || 0.5);
    }, 0);

    if (totalImplied < 0.99) { // < 99% = arb opportunity
      const profitPct = ((1 / totalImplied) - 1) * 100;
      // Optimal stakes for $100 total bet
      const totalStake = 100;
      const stakes = bestBySide.map(({ side, best }) => {
        const impl = toImplied(best.odds) || 0.5;
        const stake = (impl / totalImplied) * totalStake;
        const bookName = Object.entries(BOOK_IDS).find(([, id]) => id === best.odd_provider_id)?.[0] || `Book ${best.odd_provider_id}`;
        return { side, odds: best.odds, book: bookName, stake: stake.toFixed(2), provider_url: best.provider_url };
      });
      arbs.push({
        fixture_id: group.fixture_id,
        bet_type: group.bet_type,
        total_implied: totalImplied,
        profit_pct: profitPct,
        stakes,
        _key: key,
      });
    }
  }

  return arbs.sort((a, b) => b.profit_pct - a.profit_pct);
}

// ─── Parlay Odds Builder ──────────────────────────────────────────────────────
// Takes an array of American odds and returns combined parlay odds.
// Also calculates payout for a $100 bet.
function buildParlayOdds(legOdds) {
  const toDecimal = (n) => {
    const num = Number(n);
    if (isNaN(num)) return null;
    return num >= 0 ? (num / 100) + 1 : 1 - (100 / num);
  };
  const toAmerican = (d) => {
    if (d >= 2) return '+' + Math.round((d - 1) * 100);
    if (d > 1)  return '-' + Math.round(100 / (d - 1));
    return 'N/A';
  };

  const decimals = legOdds.map(toDecimal).filter(Boolean);
  if (decimals.length === 0) return null;

  const combinedDecimal = decimals.reduce((acc, d) => acc * d, 1);
  const payout100 = ((combinedDecimal - 1) * 100).toFixed(2);

  return {
    american: toAmerican(combinedDecimal),
    decimal: combinedDecimal.toFixed(4),
    payout_per_100: payout100,
    legs: legOdds.length,
  };
}

// ─── Format Arbitrage Block ───────────────────────────────────────────────────
function formatArbitrageBlock(arbs, league) {
  const emoji = LEAGUE_EMOJI[league] || '🏆';
  if (arbs.length === 0) {
    return `## ${emoji} ${league} — Arbitrage Scanner

*No risk-free arbitrage opportunities found at this time.*

> Arb opportunities appear when sportsbooks disagree enough that you can profitably bet all sides.`;
  }

  let block = `## ${emoji} ${league} — 🔒 Arbitrage Opportunities (Risk-Free Profit)

`;
  block += `> ⚡ **${arbs.length} arb opportunities found** across ${league} markets
`;
  block += `> Stakes shown for **$100 total investment** split optimally across both sides.

`;

  arbs.slice(0, 8).forEach((arb, i) => {
    block += `### Arb #${i + 1} — ${arb.bet_type} | **+${arb.profit_pct.toFixed(2)}% profit**
`;
    block += `| Side | Odds | Book | Stake (/$100) | Link |
`;
    block += `|------|------|------|--------------|------|
`;
    arb.stakes.forEach(s => {
      const odds = `${Number(s.odds) >= 0 ? '+' : ''}${s.odds}`;
      const link = s.provider_url ? `[Bet ↗](${s.provider_url})` : '';
      block += `| **${s.side}** | **${odds}** | ${s.book} | **${s.stake}** | ${link} |
`;
    });
    block += `> Total implied: ${(arb.total_implied * 100).toFixed(2)}% (lock profit at ${arb.profit_pct.toFixed(2)}%)

`;
  });

  block += `> ⚠️ Act quickly — arb windows typically close within minutes as books adjust lines.`;
  return block;
}

// ─── Format Matchup Block ─────────────────────────────────────────────────────
// Side-by-side odds comparison for both teams in a specific game
function formatMatchupBlock(markets, fixtures, league) {
  if (!markets || markets.length === 0) {
    return `*No matchup data found for this game. Try specifying the teams more precisely.*`;
  }

  const emoji = LEAGUE_EMOJI[league] || '🏆';
  const fixture = fixtures && fixtures[0];
  const home = fixture?.home_abbr || 'Home';
  const away = fixture?.away_abbr || 'Away';
  const gameDate = fixture?.date ? new Date(fixture.date).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '';

  let block = `## ${emoji} ${league} — Matchup Analysis: **${away} @ ${home}**
`;
  if (gameDate) block += `> 📅 ${gameDate}

`;

  // Group by bet_type
  const byType = {};
  for (const m of markets) {
    if (!byType[m.bet_type]) byType[m.bet_type] = [];
    byType[m.bet_type].push(m);
  }

  for (const [betType, mList] of Object.entries(byType)) {
    block += `### ${betType.toUpperCase()}
`;
    block += `| Book | ${away} | ${home} | Line |
`;
    block += `|------|----------|----------|------|
`;

    // Group by book
    const byBook = {};
    for (const m of mList) {
      if (!byBook[m.odd_provider_id]) byBook[m.odd_provider_id] = {};
      byBook[m.odd_provider_id][m.side] = m;
    }

    for (const [bookId, bookMarkets] of Object.entries(byBook)) {
      const bookName = Object.entries(BOOK_IDS).find(([, id]) => id === Number(bookId))?.[0] || `Book ${bookId}`;
      const awaySide = Object.values(bookMarkets).find(m => m.side === away || m.side === 'Away');
      const homeSide = Object.values(bookMarkets).find(m => m.side === home || m.side === 'Home');
      const anyMarket = Object.values(bookMarkets)[0];
      const line = anyMarket?.number ? `${Number(anyMarket.number) >= 0 ? '+' : ''}${anyMarket.number}` : '';

      const awayOdds = awaySide?.odds ? `**${Number(awaySide.odds) >= 0 ? '+' : ''}${awaySide.odds}**` : 'N/A';
      const homeOdds = homeSide?.odds ? `**${Number(homeSide.odds) >= 0 ? '+' : ''}${homeSide.odds}**` : 'N/A';
      block += `| ${bookName} | ${awayOdds} | ${homeOdds} | ${line} |
`;
    }
    block += '\n';
  }

  return block;
}

// ─── Format Parlay Block ──────────────────────────────────────────────────────
function formatParlayBlock(legs, result) {
  if (!result) return '*Could not calculate parlay odds.*';

  let block = `## 🎯 Parlay Calculator — ${result.legs} Legs

`;
  block += `| # | Pick | Odds | Decimal |
`;
  block += `|---|------|------|--------|\n`;

  legs.forEach((leg, i) => {
    const odds = `${Number(leg.odds) >= 0 ? '+' : ''}${leg.odds}`;
    const toDecimal = (n) => n >= 0 ? (n/100+1).toFixed(3) : (1-100/n).toFixed(3);
    block += `| ${i+1} | ${leg.description || leg.pick || 'Leg ' + (i+1)} | **${odds}** | ${toDecimal(Number(leg.odds))} |
`;
  });

  block += `
**Combined Parlay Odds: ${result.american}** (Decimal: ${result.decimal})

`;
  block += `| Bet Amount | Payout | Profit |
`;
  block += `|------------|--------|--------|
`;
  [10, 25, 50, 100].forEach(stake => {
    const payout = (stake * Number(result.decimal)).toFixed(2);
    const profit = (stake * (Number(result.decimal) - 1)).toFixed(2);
    block += `| **${stake}** | **${payout}** | **${profit}** |
`;
  });

  return block;
}

function kellyBetSizing(odds, winProbPct, bankroll = 1000, fractionKelly = 0.25) {
  const toDecimal = (n) => { const num=Number(n); if(isNaN(num)) return null; return num>=0?(num/100)+1:1-(100/num); };
  const decimalOdds = toDecimal(odds);
  if (!decimalOdds) return null;
  const p = winProbPct / 100, q = 1 - p, b = decimalOdds - 1;
  const kelly = (b * p - q) / b;
  const fk = kelly * fractionKelly;
  return { fullKellyPct:(kelly*100).toFixed(2), quarterKellyPct:(fk*100).toFixed(2), betAmount:(Math.max(0,fk*bankroll)).toFixed(2), expectedValuePer100:((b*p-q)*100).toFixed(2), decimalOdds:decimalOdds.toFixed(4), winProb:(p*100).toFixed(1), isPositiveEV:kelly>0 };
}
function formatKellyBlock(valueBets, bankroll=1000) {
  if (!valueBets||valueBets.length===0) return "*No +EV bets found for Kelly sizing.*";
  let b="## Kelly Criterion Bet Sizing\n\n| Pick | Odds | Edge | Q-Kelly% | Bet Size | EV/$100 |\n|------|------|------|----------|----------|---------|\n";
  const toImpl=(o)=>{ const n=Number(o); return n>=0?100/(n+100):Math.abs(n)/(Math.abs(n)+100); };
  valueBets.slice(0,12).forEach(m=>{
    const wp=toImpl(m.no_vig_odds||m.odds)*100;
    const k=kellyBetSizing(m.odds,wp,bankroll);
    if(!k||!k.isPositiveEV) return;
    b+="|"+(m.side||m.prop_name||"N/A")+"|**"+(Number(m.odds)>=0?"+":"")+m.odds+"**|+"+( m._edge?.toFixed(1)||k.expectedValuePer100)+"%|"+k.quarterKellyPct+"%|**$"+k.betAmount+"**|+$"+k.expectedValuePer100+"|\n";
  });
  return b;
}
const DFS_PLATFORM_ARRAY = [385, 387, 595];
function optimizeDFSPicks(allMarkets,topN=20) {
  const toDecimal=(o)=>{ const n=Number(o); if(isNaN(n)) return null; return n>=0?(n/100)+1:1-(100/n); };
  const dfs=allMarkets.filter(m=>DFS_PLATFORM_ARRAY.includes(Number(m.odd_provider_id)));
  const book=allMarkets.filter(m=>!DFS_PLATFORM_ARRAY.includes(Number(m.odd_provider_id)));
  const cons={};
  for(const m of book){const key=[m.player_name||m.prop_name,m.bet_type,m.side||"over"].join(":");if(!cons[key])cons[key]={sum:0,count:0};const d=toDecimal(m.odds);if(d){cons[key].sum+=d;cons[key].count++;}}
  return dfs.map(m=>{const key=[m.player_name||m.prop_name,m.bet_type,m.side||"over"].join(":");const c=cons[key];if(!c||c.count===0)return null;const avg=c.sum/c.count;const d=toDecimal(m.odds);if(!d)return null;const edge=((d-avg)/avg)*100;const bn=m.odd_provider_id===385?"PrizePicks":m.odd_provider_id===387?"Underdog":"Sleeper";return{...m,_edge:edge,_consensus:avg,_bookName:bn};}).filter(p=>p&&p._edge>0).sort((a,b)=>b._edge-a._edge).slice(0,topN);
}
function formatDFSBlock(picks,league){
  const emoji=LEAGUE_EMOJI[league]||"trophy";
  if(!picks||picks.length===0)return "## "+league+" DFS Optimizer\n\n*No +EV DFS picks found.*";
  let block="## "+league+" DFS Optimizer (PrizePicks/Underdog/Sleeper)\n\n|Player|Prop|Line|DFS Odds|Consensus|Edge|Platform|\n|------|----|----|--------|---------|-----|--------|\n";
  picks.forEach(p=>{const o=p.odds?(Number(p.odds)>=0?"+":"")+p.odds:"N/A";block+="|"+(p.player_name||p.prop_name||"N/A")+"|"+(p.bet_type||p.side)+"|"+(p.number||"")+"|**"+o+"**|"+(p._consensus?.toFixed(3)||"N/A")+"x|**+"+p._edge.toFixed(1)+"%**|"+p._bookName+"|\n";});
  return block;
}
function calculateCLV(betOdds,closingOdds){
  const toImpl=(o)=>{ const n=Number(o); if(isNaN(n)) return null; return n>=0?100/(n+100):Math.abs(n)/(Math.abs(n)+100); };
  const bi=toImpl(betOdds),ci=toImpl(closingOdds);
  if(!bi||!ci)return null;
  const clvPct=(ci-bi)*100;
  return{betOdds,closingOdds,betImplied:(bi*100).toFixed(2),closingImplied:(ci*100).toFixed(2),clvPct:clvPct.toFixed(2),beatClosingLine:clvPct>0,rating:clvPct>3?"Green Excellent":clvPct>1?"Yellow Good":clvPct>0?"Orange Slight":""+"Red Negative"};
}
function formatCLVBlock(markets,league){
  const mv=markets.filter(m=>m.open_odds&&m.odds&&m.open_odds!==m.odds).map(m=>({...m,clv:calculateCLV(m.open_odds,m.odds)})).filter(m=>m.clv).sort((a,b)=>Math.abs(Number(b.clv.clvPct))-Math.abs(Number(a.clv.clvPct)));
  if(mv.length===0)return "*No CLV data available.*";
  let block="## "+league+" CLV Tracker\n\n|Market|Side|Open|Current|CLV|Rating|\n|------|----|----|-------|---|------|\n";
  mv.slice(0,15).forEach(m=>{const o=(Number(m.open_odds)>=0?"+":"")+m.open_odds;const c=(Number(m.odds)>=0?"+":"")+m.odds;block+="|"+m.bet_type+"|"+(m.side||m.prop_name||"")+"|"+o+"|**"+c+"**|"+(m.clv.beatClosingLine?"**+":"")+m.clv.clvPct+"**|"+m.clv.rating+"|\n";});
  return block;
}
// PATCH_V43

const routeAndEnhancePrompt = async (prompt) => {
  try {
    const intent = detectSportsIntent(prompt);
    if (!intent) return prompt;

    const { type, league, extra = {} } = intent;
    const emoji = LEAGUE_EMOJI[league] || '🏟️';

    // ── API-SPORTS STANDINGS ────────────────────────────────────────────────
    if (type === 'standings') {
      const apiLeague = APISPORTS_LEAGUE_MAP[league] || APISPORTS_LEAGUE_MAP['EPL'];
      const cacheKey = `apisports:standings:${apiLeague.sport}:${apiLeague.leagueId}`;
      let standings = await cacheGet(cacheKey);
      if (!standings) {
        standings = await safe(getStandings(apiLeague.sport, apiLeague.leagueId), 5000);
        if (standings) await cacheSet(cacheKey, standings, 3600);
      }
      const block = formatAPIStandingsBlock(standings || [], league);
      
      // Blended Pre-Game Odds integration if betting keywords detected
      let blendedOddsBlock = '';
      const hasBettingKeyword = SPORTS_ODDS_KEYWORDS.some((k) => prompt.toLowerCase().includes(k));
      if (hasBettingKeyword) {
        let markets = await cacheGet(`odds:${league}`);
        let fixtures = await cacheGet(`fixtures:${league}`);
        if (!markets || !fixtures) {
          const [freshMarkets, freshFixtures] = await Promise.all([
            safe(getMarketsService(league, 'moneyline,spread,total', 'FT', DEFAULT_BOOK_IDS, { timedelta: 48 }), 8000),
            safe(getFixturesService(league, 48), 5000),
          ]);
          if (freshMarkets) await cacheSet(`odds:${league}`, freshMarkets, TTL.odds);
          if (freshFixtures) await cacheSet(`fixtures:${league}`, freshFixtures, TTL.fixtures);
          markets = freshMarkets;
          fixtures = freshFixtures;
        }
        blendedOddsBlock = `\n\n---\n\n🔴 **PRE-GAME BETTING ODDS COMPARISON (PredictionData.io)**\n\n` + formatOddsBlock(markets || [], fixtures || [], league);
      }
      return buildAPISportsPrompt(prompt, block + blendedOddsBlock);
    }

    // ── API-SPORTS BOX SCORE / LIVE STATS ──────────────────────────────────
    if (type === 'box_score') {
      const apiLeague = APISPORTS_LEAGUE_MAP[league] || APISPORTS_LEAGUE_MAP['EPL'];
      let fixtureId = 39001;
      const fixtureMatch = prompt.match(/(?:fixture|game|match|id)\s*#?(\d+)/i);
      if (fixtureMatch) fixtureId = parseInt(fixtureMatch[1], 10);
      const cacheKey = `apisports:box_score:${apiLeague.sport}:${fixtureId}`;
      let stats = await cacheGet(cacheKey);
      if (!stats) {
        stats = await safe(getFixtureStats(apiLeague.sport, fixtureId), 5000);
        if (stats) await cacheSet(cacheKey, stats, 15);
      }
      const block = formatAPIFixtureStatsBlock(stats || [], league);
      return buildAPISportsPrompt(prompt, block);
    }

    // ── API-SPORTS HEAD-TO-HEAD (H2H) ──────────────────────────────────────
    if (type === 'h2h') {
      const apiLeague = APISPORTS_LEAGUE_MAP[league] || APISPORTS_LEAGUE_MAP['EPL'];
      let teamAId = 33, teamBId = 34;
      const idsMatch = prompt.match(/(?:between|teams?|vs\.?)\s*(\d+)\s*(?:and|&|vs\.?)\s*(\d+)/i);
      if (idsMatch) {
        teamAId = parseInt(idsMatch[1], 10);
        teamBId = parseInt(idsMatch[2], 10);
      }
      const cacheKey = `apisports:h2h:${apiLeague.sport}:${teamAId}:${teamBId}`;
      let h2h = await cacheGet(cacheKey);
      if (!h2h) {
        h2h = await safe(getHeadToHead(apiLeague.sport, teamAId, teamBId), 5000);
        if (h2h) await cacheSet(cacheKey, h2h, 3600);
      }
      const block = formatAPIH2HBlock(h2h || {}, league);
      return buildAPISportsPrompt(prompt, block);
    }

    // ── Live game auto-detection ───────────────────────────────────────────
    // If this league currently has in-progress games, auto-boost standard
    // odds queries to live_odds mode so the LLM gets live score context too.
    let resolvedType = type;
    if (type === 'odds') {
      const liveLeagues = await getCachedLiveLeagues().catch(() => []);
      if (liveLeagues.includes(league)) {
        logger.info(`[SportsRouter v4.2] Auto-live: ${league} has in-progress games — upgrading odds → live_odds`);
        resolvedType = 'live_odds';
      }
    }

    logger.info(`[SportsRouter v4.2] Intent: ${resolvedType} | League: ${league} | Player: ${extra.playerName || 'N/A'}`);

    // ── LIVE ODDS ─────────────────────────────────────────────────────────
    if (resolvedType === 'live_odds' || type === 'live_odds') {

      const cacheKey = `live:${league}`;
      let markets = await cacheGet(cacheKey);
      if (!markets) {
        markets = await safe(getLiveMarketsService(league, 'moneyline,spread,total', DEFAULT_BOOK_IDS), 7000);
        if (markets) await cacheSet(cacheKey, markets, TTL.live);
      }
      const fixtures = await safe(getFixturesService(league, 6), 5000);
      const block = formatOddsBlock(markets || [], fixtures || [], league, 'LIVE In-Game Odds');
      return buildPrompt(prompt, `🔴 **LIVE IN-GAME ODDS**\n\n${block}`, 'PredictionData.io Live Sports Odds Feed');
    }

    // ── PLAYER PROPS ──────────────────────────────────────────────────────
    if (resolvedType === 'player_prop' || type === 'player_prop') {
      const propType    = extra.propType || '';
      const playerName  = extra.playerName || null; // from PLAYER_NAME_MAP detection
      const cacheKey    = `props:${league}:${propType}`;

      let [markets, fixtures, playerMap] = await Promise.all([
        cacheGet(cacheKey),
        cacheGet(`fixtures:${league}`),
        fetchPlayerMap(league),
      ]);

      if (!markets) {
        // Fetch from BOTH sportsbooks AND DFS platforms simultaneously
        const [sbMarkets, dfsMarkets] = await Promise.all([
          safe(getPlayerPropsService(league, propType, PROPS_BOOK_IDS), 7000),
          safe(getPlayerPropsService(league, propType, DFS_BOOK_IDS), 5000),
        ]);
        markets = [...(sbMarkets || []), ...(dfsMarkets || [])];
        if (markets.length > 0) await cacheSet(cacheKey, markets, TTL.props);
      }

      if (!fixtures) {
        fixtures = await safe(getFixturesService(league, 24), 5000);
        if (fixtures) await cacheSet(`fixtures:${league}`, fixtures, TTL.fixtures);
      }

      // ── Player name filtering — CRITICAL for specific player queries ─────
      let filteredMarkets = markets || [];
      let playerNote = '';
      if (playerName) {
        const pnLower = playerName.toLowerCase();
        const filtered = filteredMarkets.filter((m) => {
          const mPlayerName = (m.player_name || '').toLowerCase();
          return mPlayerName.includes(pnLower) || pnLower.includes(mPlayerName.split(' ').pop() || '');
        });
        if (filtered.length > 0) {
          filteredMarkets = filtered;
          playerNote = `
> 🎯 **Filtered to: ${playerName}** — showing ${filtered.length} markets
`;
        }
        // If filtering by playerName, also generate a deeplink
        const dk = await generateDeeplinks(filtered.filter((m) => m.odd_provider_id === 200), 'draftkings');
        const fd = await generateDeeplinks(filtered.filter((m) => m.odd_provider_id === 100), 'fanduel');
        if (dk) playerNote += `> 🔗 [Bet at DraftKings](${dk})  `;
        if (fd) playerNote += `[Bet at FanDuel](${fd})
`;
      }

      // ── Enrich markets with player reference data (position + team) ──────
      if (playerMap && Object.keys(playerMap).length > 0) {
        filteredMarkets = filteredMarkets.map((m) => {
          if (!m.player_id) return m;
          const pRef = playerMap[m.player_id];
          if (pRef) {
            return {
              ...m,
              _position: pRef.position || '',
              _team_abbr: pRef.team_abbr || '',
              _player_status: pRef.status || '',
            };
          }
          return m;
        });
      }

      const block = playerNote + formatPlayerPropsBlock(filteredMarkets, fixtures || [], league, playerMap);
      return buildPrompt(prompt, block, `PredictionData.io ${league} Player Props (Sportsbooks + DFS)`);
    }

    // ── GAME PROPS ────────────────────────────────────────────────────────
    if (resolvedType === 'game_prop' || type === 'game_prop') {
      const cacheKey = `game_props:${league}`;
      let [markets, fixtures] = await Promise.all([
        cacheGet(cacheKey),
        cacheGet(`fixtures:${league}`),
      ]);
      if (!markets) {
        markets = await safe(getGamePropsService(league, '', PROPS_BOOK_IDS), 7000);
        if (markets) await cacheSet(cacheKey, markets, TTL.game_props);
      }
      if (!fixtures) {
        fixtures = await safe(getFixturesService(league, 24), 5000);
        if (fixtures) await cacheSet(`fixtures:${league}`, fixtures, TTL.fixtures);
      }
      const block = formatGamePropsBlock(markets || [], fixtures || [], league);
      return buildPrompt(prompt, block, `PredictionData.io ${league} Game Props Service`);
    }

    // ── FUTURES ───────────────────────────────────────────────────────────
    if (resolvedType === 'futures' || type === 'futures') {
      // Detect specific futures type from query (e.g. "Super Bowl" → "Super Bowl Winner")
      const leagueFutureTypes = LEAGUE_FUTURES_TYPES[league] || [];
      const q = prompt.toLowerCase();
      const matchedFutureType = leagueFutureTypes.find((ft) =>
        q.includes(ft.toLowerCase()) ||
        ft.toLowerCase().split(' ').every((w) => q.includes(w))
      );

      // Use specific cache key when targeting a specific future type
      const cacheKey   = matchedFutureType ? `futures:${league}:${matchedFutureType.replace(/\s+/g, '_')}` : `futures:${league}`;
      const seasonsKey = `seasons:${league}`;

      let [markets, seasons] = await Promise.all([
        cacheGet(cacheKey),
        cacheGet(seasonsKey),
      ]);

      if (!markets) {
        // Pass prop_types filter when a specific future type is detected
        const propTypesFilter = matchedFutureType || '';
        markets = await safe(getFuturesMarketsService(league, DEFAULT_BOOK_IDS, propTypesFilter), 8000);
        if (markets) await cacheSet(cacheKey, markets, TTL.futures);
      }
      if (!seasons) {
        seasons = await safe(getSeasonsService(league), 5000);
        if (seasons) await cacheSet(seasonsKey, seasons, TTL.seasons);
      }

      const block = formatFuturesBlock(markets || [], league, seasons || []);
      const futureTypeNote = matchedFutureType
        ? `
> 🎯 **Filtered to: ${matchedFutureType}**
`
        : '';

      const futureTypes = LEAGUE_FUTURES_TYPES[league] || [];
      const extraInfo = !matchedFutureType && futureTypes.length > 0
        ? `\n\n### All Available Future Markets for ${league}\n${futureTypes.map((t) => `- ${t}`).join('\n')}`
        : '';

      return buildPrompt(prompt, futureTypeNote + block + extraInfo, `PredictionData.io ${league} Futures Odds Service`);
    }

    // ── SCHEDULE ──────────────────────────────────────────────────────────
    if (resolvedType === 'schedule' || type === 'schedule') {
      const cacheKey  = `fixtures:${league}`;
      const teamsKey  = `teams:${league}`;
      let [fixtures, teams] = await Promise.all([
        cacheGet(cacheKey),
        cacheGet(teamsKey),
      ]);
      if (!fixtures) {
        fixtures = await safe(getFixturesService(league, 96), 5000);
        if (fixtures) await cacheSet(cacheKey, fixtures, TTL.fixtures);
      }
      if (!teams) {
        teams = await safe(getTeamsService(league, true), 4000);
        if (teams) await cacheSet(teamsKey, teams, TTL.teams);
      }
      const block = formatScheduleBlock(fixtures || [], teams || {}, league);
      return buildPrompt(prompt, block, `PredictionData.io ${league} Schedule Service`);
    }

    // ── SAME GAME PARLAY ──────────────────────────────────────────────────
    if (resolvedType === 'sgp' || type === 'sgp') {
      const [fixtures, markets] = await Promise.all([
        safe(getFixturesService(league, 24), 5000),
        safe(getPlayerPropsService(league, '', PROPS_BOOK_IDS), 7000),
      ]);

      // Try to extract SGP legs from the user's prompt
      const sgpLegs = extractSGPLegs(prompt, fixtures || [], markets || []);

      // If we have 2+ legs detected, actually call the SGP pricing API
      if (sgpLegs.length >= 2 && fixtures && fixtures.length > 0) {
        logger.info(`[SportsRouter] SGP: detected ${sgpLegs.length} legs — calling POST /api/sgp`);

        // Map legs to API format using first fixture found
        const firstFixture = fixtures[0];
        const apiLegs = sgpLegs.map((leg) => ({
          fixture_id: firstFixture.id,
          league,
          bet_type: leg.bet_type,
          prop_name: leg.prop_name || '',
          side_type: leg.side_type || '',
          period: 'FT',
          is_live: false,
          number: leg.number,
        })).filter((leg) => leg.fixture_id);

        if (apiLegs.length >= 2) {
          try {
            const sgpResult = await safe(
              getSGPOddsService(apiLegs, ['draftkings', 'fanduel', 'betrivers', 'betmgm']),
              10000
            );
            if (sgpResult && typeof sgpResult === 'object' && !sgpResult.error) {
              const block = formatSGPResult(sgpResult, sgpLegs, league);
              return buildPrompt(prompt, block, `PredictionData.io ${league} SGP Pricing API`);
            }
          } catch (sgpErr) {
            logger.warn(`[SportsRouter] SGP API call failed: ${sgpErr.message}`);
          }
        }
      }

      // Fallback: show SGP builder UI with fixtures + available legs
      let block = `## ${emoji} ${league} — Same Game Parlay (SGP) Builder\n\n`;
      block += `> 📡 **PredictionData.io SGP Pricing Engine**\n`;
      block += `> Supported books: DraftKings • FanDuel • BetRivers • BetMGM • BetWay • ToonieB • BC.Game • Stake • 888Sport\n\n`;

      if (sgpLegs.length > 0 && sgpLegs.length < 2) {
        block += `> ⚠️ **Detected ${sgpLegs.length} leg(s)** — need at least 2 legs from the SAME game to price an SGP.\n\n`;
        block += `> Legs found: ${sgpLegs.map((l) => l.description).join(', ')}\n\n`;
      } else {
        block += `> **To price an SGP:** Specify 2+ legs from the SAME game.\n`;
        block += `> *Example: "Price an SGP: Chiefs ML + Mahomes over 280.5 pass yds + Kelce over 5.5 receptions"*\n\n`;
      }

      block += formatScheduleBlock(fixtures || [], {}, league);
      block += '\n\n';

      if (markets && markets.length > 0) {
        block += `### Available SGP Legs (Player Props)\n`;
        block += formatPlayerPropsBlock(markets.slice(0, 80), fixtures || [], league);
      }

      return buildPrompt(prompt, block, `PredictionData.io ${league} SGP Pricing Engine`);
    }

    // ── PREDICTION MARKETS ────────────────────────────────────────────────
    if (type === 'prediction_market') {
      const provider   = extra.provider || 'polymarket';
      const providerId = provider === 'kalshi' ? 194 : 193;
      const providerName = provider === 'kalshi' ? 'Kalshi' : 'Polymarket';

      const cacheKey = `summaries:${league}`;
      let summaries = await cacheGet(cacheKey);
      if (!summaries) {
        summaries = await safe(getMarketSummariesService(league), 6000);
        if (summaries) await cacheSet(cacheKey, summaries, TTL.summaries);
      }

      // Fetch orderbook for up to 3 active markets
      let orderbook = null;
      if (summaries && summaries.length > 0) {
        const activeSummaries = summaries.filter((s) => s.is_active).slice(0, 3);
        if (activeSummaries.length > 0) {
          const firstSlug = activeSummaries[0]?.slug;
          if (firstSlug) {
            const obKey = `orderbook:${firstSlug}`;
            orderbook = await cacheGet(obKey);
            if (!orderbook) {
              orderbook = await safe(getOrderbookService(firstSlug, providerId), 5000);
              if (orderbook) await cacheSet(obKey, orderbook, TTL.orderbook);
            }
          }
        }
      }

      const block = formatOrderbookBlock(summaries || [], orderbook || [], league, providerName);
      return buildPrompt(prompt, block, `PredictionData.io ${providerName} Exchange Markets`);
    }

    // ── ALTERNATE LINES ───────────────────────────────────────────────────
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

    // ── PERIOD ODDS ───────────────────────────────────────────────────────
    if (type === 'period_odds') {
      const period = extra.period || '1H';
      const cacheKey = `period:${league}:${period}`;
      let [markets, fixtures] = await Promise.all([
        cacheGet(cacheKey),
        cacheGet(`fixtures:${league}`),
      ]);
      if (!markets) {
        markets = await safe(getPeriodMarketsService(league, period, DEFAULT_BOOK_IDS), 7000);
        if (markets) await cacheSet(cacheKey, markets, TTL.period);
      }
      if (!fixtures) {
        fixtures = await safe(getFixturesService(league, 48), 5000);
        if (fixtures) await cacheSet(`fixtures:${league}`, fixtures, TTL.fixtures);
      }
      const block = formatPeriodOddsBlock(markets || [], fixtures || [], league, period);
      return buildPrompt(prompt, block, `PredictionData.io ${league} ${period} Odds Service`);
    }


    // ── VALUE BETS (+EV) ──────────────────────────────────────────────────
    if (type === 'value_bets') {
      const cacheKey = `odds:${league}`;
      let markets = await cacheGet(cacheKey);
      if (!markets) {
        markets = await safe(getMarketsService(league, 'moneyline,spread,total,player_prop', 'FT', DEFAULT_BOOK_IDS, { timedelta: 24 }), 8000);
        if (markets) await cacheSet(cacheKey, markets, 30);
      }
      const valueBets = buildValueBets(markets || []);
      const block = formatValueBetsBlock(valueBets, league);
      return buildPrompt(prompt, block, `PredictionData.io ${league} Value Bets (+EV Analysis)`);
    }

    // ── LINE MOVERS / STEAM DETECTION ─────────────────────────────────────
    if (type === 'line_movers') {
      const cacheKey = `odds:${league}`;
      let markets = await cacheGet(cacheKey);
      if (!markets) {
        markets = await safe(getMarketsService(league, 'moneyline,spread,total', 'FT', DEFAULT_BOOK_IDS, { timedelta: 24 }), 8000);
        if (markets) await cacheSet(cacheKey, markets, 30);
      }
      const movers = detectLineMovers(markets || [], 15);
      const block = formatLineMoversBlock(movers, league);
      return buildPrompt(prompt, block, `PredictionData.io ${league} Line Movement Tracker`);
    }

    // ── SHARP PICKS (Pinnacle divergence) ─────────────────────────────────
    if (type === 'sharp_picks') {
      const allBooks = `${DEFAULT_BOOK_IDS},${PINNACLE_BOOK_ID}`;
      let markets = await safe(getMarketsService(league, 'moneyline,spread,total', 'FT', allBooks, { timedelta: 24 }), 8000);
      const sharpPicks = buildSharpAnalysis(markets || [], league);
      const block = formatSharpPicksBlock(sharpPicks, league);
      return buildPrompt(prompt, block, `PredictionData.io ${league} Sharp Money Analysis (Pinnacle Reference)`);
    }

    // ── BEST AVAILABLE (line shopping) ────────────────────────────────────
    if (type === 'best_available') {
      const allBooksStr = '100,200,300,400,250,700,365,500,555,617,150';
      let [markets, fixtures] = await Promise.all([
        cacheGet(`odds:${league}`) || safe(getMarketsService(league, 'moneyline,spread,total', 'FT', allBooksStr, { timedelta: 24 }), 8000),
        cacheGet(`fixtures:${league}`) || safe(getFixturesService(league, 24), 5000),
      ]);
      const bestLines = pickBestLine(markets || []);
      const block = formatOddsBlock(bestLines, fixtures || [], league, 'Best Available Lines (Line Shopping)');
      return buildPrompt(prompt, block, `PredictionData.io ${league} Best Available Lines — Line Shopping`);
    }

    if(type==="dfs"){const allBooks=DEFAULT_BOOK_IDS+",385,387,595";const [markets,fixtures]=await Promise.all([safe(getPlayerPropsService(league,null,allBooks,{timedelta:24}),8000),safe(getFixturesService(league,24),5000)]);const picks=optimizeDFSPicks(markets||[],20);return buildPrompt(prompt,formatDFSBlock(picks,league),"PredictionData.io DFS Optimizer");}
    if(type==="kelly"){const m=await safe(getMarketsService(league,"moneyline,spread,total,player_prop","FT",DEFAULT_BOOK_IDS+",250",{timedelta:24}),8000);const vb=buildValueBets(m||[],0.5);return buildPrompt(prompt,formatKellyBlock(vb,1000),"PredictionData.io Kelly Sizing");}
    if(type==="clv"){const m=await safe(getMarketsService(league,"moneyline,spread,total","FT",DEFAULT_BOOK_IDS+",250",{timedelta:48}),8000);return buildPrompt(prompt,formatCLVBlock(m||[],league),"PredictionData.io CLV Tracker");}
        // ── ARBITRAGE DETECTION ───────────────────────────────────────────────
    if (type === 'arbitrage') {
      // Fetch from ALL major books for maximum arb opportunities
      const allBooks = '100,200,300,400,250,700,365,500,555,617,150';
      const markets = await safe(
        getMarketsService(league, 'moneyline,spread,total', 'FT', allBooks, { timedelta: 24 }),
        10000
      );
      const arbs = findArbitrageOpportunities(markets || []);
      const block = formatArbitrageBlock(arbs, league);
      return buildPrompt(prompt, block, `PredictionData.io ${league} Arbitrage Scanner (All Books)`);
    }

    // ── PARLAY BUILDER ────────────────────────────────────────────────────
    if (type === 'parlay_builder') {
      // Extract odds from the query (e.g. "Chiefs -110, Mahomes over +105, Eagles +130")
      const oddsMatches = prompt.match(/[+-]?\d{3,4}/g) || [];
      const legs = oddsMatches.map((o, i) => ({ odds: Number(o), pick: `Leg ${i+1}`, description: `Leg ${i+1}` }));

      if (legs.length >= 2) {
        const result = buildParlayOdds(legs.map(l => l.odds));
        const block = formatParlayBlock(legs, result);
        return buildPrompt(prompt, block, 'PredictionData.io Parlay Calculator');
      }

      // If no odds in query, show current available moneylines for building
      const cacheKey = `odds:${league}`;
      let markets = await cacheGet(cacheKey);
      if (!markets) {
        markets = await safe(getMarketsService(league, 'moneyline', 'FT', DEFAULT_BOOK_IDS, { timedelta: 24 }), 7000);
        if (markets) await cacheSet(cacheKey, markets, 60);
      }
      const best = pickBestLine(markets || []).slice(0, 10);
      const fixtures = await safe(getFixturesService(league, 24), 5000);
      const block = formatOddsBlock(best, fixtures || [], league, 'Build a Parlay — Best Available Lines');
      return buildPrompt(prompt, block + '\n\n> 💡 **Parlay tip:** Pick your legs from the table above and I will calculate combined odds.', 'PredictionData.io Parlay Builder');
    }

    // ── MATCHUP COMPARISON ────────────────────────────────────────────────
    if (type === 'matchup') {
      const rawQuery = extra.rawQuery || prompt;
      const allBooks = '100,200,300,400,250,700,365,500';
      const [markets, fixtures] = await Promise.all([
        safe(getMarketsService(league, 'moneyline,spread,total', 'FT', allBooks, { timedelta: 48 }), 8000),
        safe(getFixturesService(league, 48), 5000),
      ]);

      // Try to match fixture from query text
      let matchedFixtures = fixtures || [];
      if (matchedFixtures.length > 0) {
        const q = rawQuery.toLowerCase();
        const matched = matchedFixtures.filter(f =>
          (f.home_abbr && q.includes(f.home_abbr.toLowerCase())) ||
          (f.away_abbr && q.includes(f.away_abbr.toLowerCase())) ||
          (f.home_name && q.includes(f.home_name.toLowerCase().split(' ').pop())) ||
          (f.away_name && q.includes(f.away_name.toLowerCase().split(' ').pop()))
        );
        if (matched.length > 0) matchedFixtures = matched.slice(0, 1);
      }

      const fixtureId = matchedFixtures[0]?.id;
      const filteredMarkets = fixtureId
        ? (markets || []).filter(m => m.fixture_id === fixtureId)
        : (markets || []).slice(0, 40);

      const block = formatMatchupBlock(filteredMarkets, matchedFixtures, league);
      return buildPrompt(prompt, block, `PredictionData.io ${league} Matchup Analysis`);
    }

    // ── MULTI-LEAGUE (all games tonight / all sports) ────────────────────
    if (type === 'multi_league') {
      const queryLeagues = extra.leagues || MULTI_LEAGUE_ACTIVE || ['NFL', 'NBA', 'MLB', 'NHL'];
      logger.info(`[SportsRouter] Multi-league query: ${queryLeagues.join(', ')}`);

      const allBlocks = await Promise.allSettled(
        queryLeagues.map(async (lg) => {
          const [mkts, fxts] = await Promise.all([
            cacheGet(`odds:${lg}`) ||
              safe(getMarketsService(lg, 'moneyline,spread,total', 'FT', DEFAULT_BOOK_IDS, { timedelta: 24 }), 7000),
            cacheGet(`fixtures:${lg}`) ||
              safe(getFixturesService(lg, 24), 5000),
          ]);
          if (!mkts && !fxts) return null;
          return formatOddsBlock(mkts || [], fxts || [], lg, "Today's Games");
        })
      );

      const successBlocks = allBlocks
        .filter((r) => r.status === 'fulfilled' && r.value)
        .map((r) => r.value);

      if (successBlocks.length === 0) {
        return buildPrompt(prompt, '*No games found across major leagues tonight.*', 'PredictionData.io Multi-Sport');
      }

      const combined = successBlocks.join('\n\n---\n\n');
      return buildPrompt(prompt, combined, `PredictionData.io Multi-Sport: ${queryLeagues.join(', ')}`);
    }

    // ── STANDARD ODDS (moneyline + spread + total) ─────────────────────────
    if (type === 'odds') {
      const cacheKey   = `odds:${league}`;
      const fixCacheKey = `fixtures:${league}`;

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
    logger.error('[SportsRouter v3] Error:', err.message, err.stack?.split('\n')[1]);
  }

  return prompt;
};

// ─── API-Sports Formatter Helpers ──────────────────────────────────────────────
function boldNum(val) {
  if (val === undefined || val === null) return '—';
  let s = String(val).trim();
  if (s === '') return '—';
  s = s.replace(/\*\*/g, '');
  return s.replace(/([+-]?\d+(?:\.\d+)?%?)/g, '**$1**');
}

function buildAPISportsPrompt(userPrompt, dataBlock) {
  return `[Source: API-Sports / api-sports.io]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REAL-TIME SPORTS INTELLIGENCE INJECTOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${dataBlock}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
User Query: ${userPrompt}`;
}

function formatAPIStandingsBlock(standings, league) {
  const emoji = LEAGUE_EMOJI[league] || '🏟️';
  
  if (league === 'F1') {
    let block = `## 🏎️ ${league} — Driver Championship Standings\n\n`;
    block += `| Rank | Driver | Constructor | Points | Wins |\n`;
    block += `|------|--------|-------------|--------|------|\n`;
    
    if (!Array.isArray(standings) || standings.length === 0) {
      block += `| — | *No driver standings available* | — | — | — |\n`;
      return block;
    }
    
    standings.forEach((row) => {
      const r = boldNum(row.rank);
      const driver = row.driver?.name || 'Unknown Driver';
      const teamName = row.team?.name || 'Unknown Team';
      const pts = boldNum(row.points);
      const wins = boldNum(row.wins != null ? row.wins : 0);
      block += `| ${r} | **${driver}** | ${teamName} | ${pts} | ${wins} |\n`;
    });
    return block;
  }
  
  if (league === 'UFC') {
    let block = `## 🥊 ${league} — Division Rankings\n\n`;
    block += `| Rank | Fighter | Weight Class | Record | Points |\n`;
    block += `|------|---------|--------------|--------|--------|\n`;
    
    if (!Array.isArray(standings) || standings.length === 0) {
      block += `| — | *No fighter rankings available* | — | — | — |\n`;
      return block;
    }
    
    standings.forEach((row) => {
      const r = boldNum(row.rank);
      const fighter = row.fighter?.name || 'Unknown Fighter';
      const division = row.division || 'Heavyweight';
      const record = row.record || '—';
      const pts = boldNum(row.points != null ? row.points : 0);
      block += `| ${r} | **${fighter}** | ${division} | ${record} | ${pts} |\n`;
    });
    return block;
  }

  if (league === 'IPL') {
    let block = `## 🏏 ${league} — League Standings\n\n`;
    block += `| Rank | Team | Played | Win | Lose | NRR | Points |\n`;
    block += `|------|------|--------|-----|------|-----|--------|\n`;
    
    if (!Array.isArray(standings) || standings.length === 0) {
      block += `| — | *No standings available* | — | — | — | — | — |\n`;
      return block;
    }
    
    standings.forEach((row) => {
      const r = boldNum(row.rank);
      const teamName = row.team?.name || 'Unknown Team';
      const played = boldNum(row.played);
      const win = boldNum(row.win);
      const lose = boldNum(row.lose);
      const nrr = boldNum(row.netRunRate);
      const pts = boldNum(row.points);
      block += `| ${r} | **${teamName}** | ${played} | ${win} | ${lose} | ${nrr} | ${pts} |\n`;
    });
    return block;
  }

  // Default football-grade/team table structure
  let block = `## ${emoji} ${league} — League Standings\n\n`;
  block += `| Rank | Team | Played | Win | Draw | Lose | Diff | Points | Form |\n`;
  block += `|------|------|--------|-----|------|------|------|--------|------|\n`;

  if (!Array.isArray(standings) || standings.length === 0) {
    block += `| — | *No standings data available* | — | — | — | — | — | — | — |\n`;
    return block;
  }

  standings.forEach((row) => {
    const r = boldNum(row.rank);
    const teamName = row.team?.name || 'Unknown Team';
    const played = boldNum(row.all?.played != null ? row.all.played : row.played);
    const win = boldNum(row.all?.win != null ? row.all.win : row.win);
    const draw = boldNum(row.all?.draw != null ? row.all.draw : row.draw);
    const lose = boldNum(row.all?.lose != null ? row.all.lose : row.lose);
    const diffVal = row.goalsDiff != null ? row.goalsDiff : (row.diff != null ? row.diff : 0);
    const diff = boldNum(diffVal >= 0 ? `+${diffVal}` : diffVal);
    const pts = boldNum(row.points);
    const form = row.form || '—';
    block += `| ${r} | **${teamName}** | ${played} | ${win} | ${draw} | ${lose} | ${diff} | ${pts} | ${form} |\n`;
  });

  return block;
}

function formatAPIFixtureStatsBlock(stats, league) {
  const emoji = LEAGUE_EMOJI[league] || '🏟️';
  
  if (!Array.isArray(stats) || stats.length < 2) {
    return `## ${emoji} ${league} — Match Statistics\n\n*No statistical data available for this match.*\n`;
  }

  const teamA = stats[0].team?.name || stats[0].driver?.name || 'Home/Driver A';
  const teamB = stats[1].team?.name || stats[1].driver?.name || 'Away/Driver B';
  
  let block = `## ${emoji} ${league} — Match Statistics\n\n`;
  block += `| Statistic | ${teamA} | ${teamB} |\n`;
  block += `|-----------|-${'-'.repeat(teamA.length)}-|-${'-'.repeat(teamB.length)}-|\n`;

  const statsA = stats[0].statistics || [];
  const statsB = stats[1].statistics || [];
  const statTypes = statsA.map(s => s.type);

  statTypes.forEach((type) => {
    const valA = statsA.find(s => s.type === type)?.value;
    const valB = statsB.find(s => s.type === type)?.value;
    
    block += `| ${type} | ${boldNum(valA)} | ${boldNum(valB)} |\n`;
  });

  return block;
}

function formatAPIH2HBlock(h2h, league) {
  const emoji = LEAGUE_EMOJI[league] || '🏟️';
  
  if (!h2h || !h2h.summary) {
    return `## ${emoji} ${league} — Head-to-Head History\n\n*No historical matchup data available.*\n`;
  }

  const { summary, fixtures } = h2h;
  
  let block = `## ${emoji} ${league} — Head-to-Head History\n\n`;
  
  let teamAName = 'Team A';
  let teamBName = 'Team B';
  if (Array.isArray(fixtures) && fixtures.length > 0) {
    teamAName = fixtures[0].teams?.home?.name || fixtures[0].teams?.home || 'Team A';
    teamBName = fixtures[0].teams?.away?.name || fixtures[0].teams?.away || 'Team B';
  }

  block += `### H2H Summary\n`;
  block += `* Total Matchups: ${boldNum(summary.total)}\n`;
  block += `* ${teamAName} Wins: ${boldNum(summary.teamAWin)}\n`;
  block += `* ${teamBName} Wins: ${boldNum(summary.teamBWin)}\n`;
  block += `* Draws: ${boldNum(summary.draws)}\n\n`;

  block += `### Recent Matchups\n`;
  block += `| Date | Matchup | Score |\n`;
  block += `|------|---------|-------|\n`;

  if (Array.isArray(fixtures)) {
    fixtures.forEach((f) => {
      const dateStr = f.date ? new Date(f.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
      const home = f.teams?.home?.name || f.teams?.home || 'Home';
      const away = f.teams?.away?.name || f.teams?.away || 'Away';
      const homeScore = f.score?.home ?? '—';
      const awayScore = f.score?.away ?? '—';
      
      const scoreStr = homeScore !== '—' && awayScore !== '—' 
        ? `${boldNum(homeScore)}–${boldNum(awayScore)}`
        : '—';
      
      block += `| ${dateStr} | ${home} vs ${away} | ${scoreStr} |\n`;
    });
  }

  return block;
}

// ─── Public API ───────────────────────────────────────────────────────────────
export const sportsSmartRouter = {
  routeAndEnhancePrompt,
  detectSportsIntent,
  // Core formatters
  formatOddsBlock,
  formatPlayerPropsBlock,
  formatFuturesBlock,
  formatScheduleBlock,
  formatSGPResult,
  formatAPIStandingsBlock,
  formatAPIFixtureStatsBlock,
  formatAPIH2HBlock,
  // Analysis functions (exposed for direct use in API routes)
  pickBestLine,
  detectLineMovers,
  buildSharpAnalysis,
  buildValueBets,
  formatValueBetsBlock,
  formatLineMoversBlock,
  formatSharpPicksBlock,
  // Phase 7
  findArbitrageOpportunities,
  buildParlayOdds,
  formatArbitrageBlock,
  formatParlayBlock,
  formatMatchupBlock,
  kellyBetSizing,
  formatKellyBlock,
  optimizeDFSPicks,
  formatDFSBlock,
  calculateCLV,
  formatCLVBlock,
};
