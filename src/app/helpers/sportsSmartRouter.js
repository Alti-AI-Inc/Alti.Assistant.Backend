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
} from './sportsIntentDB.js';

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

const routeAndEnhancePrompt = async (prompt) => {
  try {
    const intent = detectSportsIntent(prompt);
    if (!intent) return prompt;

    const { type, league, extra = {} } = intent;
    const emoji = LEAGUE_EMOJI[league] || '🏟️';

    logger.info(`[SportsRouter v4] Intent: ${type} | League: ${league} | Player: ${extra.playerName || 'N/A'}`);

    // ── LIVE ODDS ─────────────────────────────────────────────────────────
    if (type === 'live_odds') {
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
    if (type === 'player_prop') {
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
    if (type === 'game_prop') {
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
    if (type === 'futures') {
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
    if (type === 'schedule') {
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
    if (type === 'sgp') {
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

    // ── MULTI-LEAGUE (all games tonight / all sports) ────────────────────
    if (type === 'multi_league') {
      const queryLeagues = extra.leagues || ['NFL', 'NBA', 'MLB', 'NHL'];
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

// ─── Public API ───────────────────────────────────────────────────────────────
export const sportsSmartRouter = {
  routeAndEnhancePrompt,
  detectSportsIntent,
  // Expose formatters for direct use in tool responses
  formatOddsBlock,
  formatPlayerPropsBlock,
  formatFuturesBlock,
  formatScheduleBlock,
  formatSGPResult,
};
