/**
 * Phase 4 → v4 patch for sportsSmartRouter.js
 *
 * Fixes:
 * 1. playerName filtering — filter displayed props to detected player
 * 2. provider_deeplink_string extraction → buildDeeplinkService call for bet slip URLs
 * 3. getSGPOddsService actually CALLED when SGP legs detected in prompt
 * 4. getPlayersService called for props — adds position/status/team to prop rows
 * 5. Futures prop_type targeting — detect specific future type in query
 * 6. Multi-league support — "all games tonight" queries all active leagues
 * 7. Live fixture 15s refresh in sportsDataCache
 */
const fs = require('fs');
const path = require('path');

const routerFile = path.join('c:\\Users\\hyper\\workspace\\Alti.Assistant\\Alti.Assistant.Backend\\src\\app\\helpers\\sportsSmartRouter.js');
let content = fs.readFileSync(routerFile, 'utf8');

// ── Guard ──────────────────────────────────────────────────────────────────────
if (content.includes('PATCH_V4_APPLIED')) {
  console.log('v4 patch already applied, skipping');
  process.exit(0);
}

// ── 1. Add missing imports ─────────────────────────────────────────────────────
const oldImports = `  getSGPOddsService,
  BOOK_IDS,
} from '../modules/predictiondata/predictiondata.service.js';`;

const newImports = `  getSGPOddsService,
  getPlayersService,
  buildDeeplinkService,
  getFullMarketService,
  BOOK_IDS,
} from '../modules/predictiondata/predictiondata.service.js';`;

content = content.replace(oldImports, newImports);

// Also add LEAGUE_FUTURES_TYPES to the sportsIntentDB imports
const oldIntentImports = `import {
  detectSportsIntent,
  DEFAULT_BOOK_IDS,
  PROPS_BOOK_IDS,
  LEAGUE_EMOJI,
  LEAGUE_SPORT,
  LEAGUE_PROP_TYPES,
  LEAGUE_FUTURES_TYPES,
} from './sportsIntentDB.js';`;

const newIntentImports = `import {
  detectSportsIntent,
  DEFAULT_BOOK_IDS,
  PROPS_BOOK_IDS,
  LEAGUE_EMOJI,
  LEAGUE_SPORT,
  LEAGUE_PROP_TYPES,
  LEAGUE_FUTURES_TYPES,
  PLAYER_NAME_MAP,
} from './sportsIntentDB.js';`;

content = content.replace(oldIntentImports, newIntentImports);

// ── 2. Add players TTL and constants ──────────────────────────────────────────
const oldTTL = `  teams:      3600,   // Team reference data — 1hr (slow changing)
  seasons:    1800,   // Season data — 30min`;
const newTTL = `  teams:      3600,   // Team reference data — 1hr (slow changing)
  players:    1800,   // Player reference data — 30min
  seasons:    1800,   // Season data — 30min`;
content = content.replace(oldTTL, newTTL);

// ── 3. Add PATCH_V4_APPLIED marker + helper functions ─────────────────────────
const markerBlock = `// PATCH_V4_APPLIED

`;

// ── 4. Add SGP leg extractor utility function ─────────────────────────────────
const legExtractorFn = `
// ─── SGP Leg Extractor — parses natural language SGP legs from a prompt ───────
// Patterns like "Chiefs ML + Mahomes over 280.5 pass yds + Kelce 2+ receptions"
// Returns array of { description, bet_type, side_type, number, prop_name } objects
function extractSGPLegs(prompt, fixtures = [], markets = []) {
  const q = prompt.toLowerCase();
  const legs = [];

  // Pattern: moneyline mentions (team name + ML/moneyline/to win)
  const mlPattern = /\\b(chiefs|eagles|bills|ravens|packers|cowboys|niners|dolphins|lions|steelers|patriots|texans|jets|giants|rams|chargers|broncos|raiders|seahawks|cardinals|saints|falcons|buccaneers|panthers|bears|vikings|commanders|browns|bengals|colts|titans|jaguars|lakers|celtics|warriors|bucks|heat|nuggets|suns|clippers|knicks|sixers|nets|raptors|bulls|cavs|pacers|hawks|magic|wizards|hornets|pistons|thunder|mavs|spurs|rockets|jazz|kings|wolves|blazers|grizzlies|pelicans|yankees|dodgers|red sox|cubs|astros|braves|mets|phillies|padres|mariners|bruins|leafs|canadiens|rangers|flyers|penguins|capitals|lightning|panthers|hurricanes|islanders|devils|sabres|senators|jets|wild|blackhawks|blues|stars|avalanche|golden knights|kraken|sharks|ducks|kings|flames|oilers|canucks)\\b.{0,20}\\b(ml|moneyline|to win)\\b/gi;
  let match;
  while ((match = mlPattern.exec(q)) !== null) {
    const team = match[1];
    legs.push({ description: match[0].trim(), bet_type: 'moneyline', prop_name: 'Moneyline', side_type: team, number: null });
  }

  // Pattern: over/under props (player name + stat + over/under + number)
  const propPattern = /\\b([a-z]+(?:\\s[a-z]+){0,2})\\s+(over|under|o\\/u|o|u)\\s*(\\d+(?:\\.\\d+)?)\\s*([a-z\\s+]+?)(?:,|\\+|and|$)/gi;
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
  const spreadPattern = /\\b([a-z ]{3,20})\\s+([+-]\\d+(?:\\.\\d+)?)\\s*(?:spread|pts?|points?)?\\b/gi;
  while ((match = spreadPattern.exec(q)) !== null) {
    const [, team, num] = match;
    const n = parseFloat(num);
    if (!isNaN(n) && Math.abs(n) < 50) {
      legs.push({ description: match[0].trim(), bet_type: 'spread', prop_name: 'Spread', side_type: team.trim(), number: n });
    }
  }

  // Pattern: total mentions (over/under + number + goals/points/runs)
  const totalPattern = /\\b(game total|total|o|u|over|under)\\s*(\\d+(?:\\.\\d+)?)\\s*(?:goals?|points?|runs?|yards?)?\\b/gi;
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

`;

// ── 5. Add player enrichment utility function ─────────────────────────────────
const playerEnrichFn = `
// ─── Player reference enrichment ─────────────────────────────────────────────
// Adds position/team/status to a player map for prop display
async function fetchPlayerMap(league) {
  const cacheKey = \`players:\${league}\`;
  let playerMap = await cacheGet(cacheKey);
  if (!playerMap) {
    const players = await safe(getPlayersService(league, true), 5000);
    playerMap = players || {};
    if (Object.keys(playerMap).length > 0) await cacheSet(cacheKey, playerMap, TTL.players);
  }
  return playerMap;
}

`;

// ── 6. Add deeplink generation utility ────────────────────────────────────────
const deeplinkFn = `
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

`;

// Insert helper functions before the main routeAndEnhancePrompt
const mainRouterFn = 'const routeAndEnhancePrompt = async (prompt) => {';
content = content.replace(
  mainRouterFn,
  markerBlock + legExtractorFn + playerEnrichFn + deeplinkFn + mainRouterFn
);

// ── 7. Fix player_prop handler to: filter by playerName + enrich with player data ─
const oldPlayerPropHandler = `    // ── PLAYER PROPS ──────────────────────────────────────────────────────
    if (type === 'player_prop') {
      const propType = extra.propType || '';
      const cacheKey = \`props:\${league}:\${propType}\`;
      let [markets, fixtures] = await Promise.all([
        cacheGet(cacheKey),
        cacheGet(\`fixtures:\${league}\`),
      ]);
      if (!markets) {
        // Fetch from BOTH sportsbooks AND DFS platforms
        const [sbMarkets, dfsMarkets] = await Promise.all([
          safe(getPlayerPropsService(league, propType, PROPS_BOOK_IDS), 7000),
          safe(getPlayerPropsService(league, propType, DFS_BOOK_IDS), 5000),
        ]);
        markets = [...(sbMarkets || []), ...(dfsMarkets || [])];
        if (markets.length > 0) await cacheSet(cacheKey, markets, TTL.props);
      }
      if (!fixtures) {
        fixtures = await safe(getFixturesService(league, 24), 5000);
        if (fixtures) await cacheSet(\`fixtures:\${league}\`, fixtures, TTL.fixtures);
      }
      const block = formatPlayerPropsBlock(markets || [], fixtures || [], league);
      return buildPrompt(prompt, block, \`PredictionData.io \${league} Player Props (Sportsbooks + DFS)\`);
    }`;

const newPlayerPropHandler = `    // ── PLAYER PROPS ──────────────────────────────────────────────────────
    if (type === 'player_prop') {
      const propType    = extra.propType || '';
      const playerName  = extra.playerName || null; // from PLAYER_NAME_MAP detection
      const cacheKey    = \`props:\${league}:\${propType}\`;

      let [markets, fixtures, playerMap] = await Promise.all([
        cacheGet(cacheKey),
        cacheGet(\`fixtures:\${league}\`),
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
        if (fixtures) await cacheSet(\`fixtures:\${league}\`, fixtures, TTL.fixtures);
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
          playerNote = \`\n> 🎯 **Filtered to: \${playerName}** — showing \${filtered.length} markets\n\`;
        }
        // If filtering by playerName, also generate a deeplink
        const dk = await generateDeeplinks(filtered.filter((m) => m.odd_provider_id === 200), 'draftkings');
        const fd = await generateDeeplinks(filtered.filter((m) => m.odd_provider_id === 100), 'fanduel');
        if (dk) playerNote += \`> 🔗 [Bet at DraftKings](\${dk})  \`;
        if (fd) playerNote += \`[Bet at FanDuel](\${fd})\n\`;
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
      return buildPrompt(prompt, block, \`PredictionData.io \${league} Player Props (Sportsbooks + DFS)\`);
    }`;

content = content.replace(oldPlayerPropHandler, newPlayerPropHandler);
console.log('✅ Player prop handler updated with playerName filtering + player enrichment');

// ── 8. Fix futures handler with prop_type targeting ───────────────────────────
const oldFuturesHandler = `    // ── FUTURES ───────────────────────────────────────────────────────────
    if (type === 'futures') {
      const cacheKey = \`futures:\${league}\`;
      const seasonsKey = \`seasons:\${league}\`;
      let [markets, seasons] = await Promise.all([
        cacheGet(cacheKey),
        cacheGet(seasonsKey),
      ]);
      if (!markets) {
        markets = await safe(getFuturesMarketsService(league, DEFAULT_BOOK_IDS), 8000);
        if (markets) await cacheSet(cacheKey, markets, TTL.futures);
      }
      if (!seasons) {
        seasons = await safe(getSeasonsService(league), 5000);
        if (seasons) await cacheSet(seasonsKey, seasons, TTL.seasons);
      }
      const block = formatFuturesBlock(markets || [], league, seasons || []);

      const futureTypes = LEAGUE_FUTURES_TYPES[league] || [];
      const extraInfo = futureTypes.length > 0
        ? \`\\n\\n### Available Future Markets for \${league}\\n\${futureTypes.slice(0, 20).map((t) => \`- \${t}\`).join('\\n')}\`
        : '';

      return buildPrompt(prompt, block + extraInfo, \`PredictionData.io \${league} Futures Odds Service\`);
    }`;

const newFuturesHandler = `    // ── FUTURES ───────────────────────────────────────────────────────────
    if (type === 'futures') {
      // Detect specific futures type from query (e.g. "Super Bowl" → "Super Bowl Winner")
      const leagueFutureTypes = LEAGUE_FUTURES_TYPES[league] || [];
      const q = prompt.toLowerCase();
      const matchedFutureType = leagueFutureTypes.find((ft) =>
        q.includes(ft.toLowerCase()) ||
        ft.toLowerCase().split(' ').every((w) => q.includes(w))
      );

      // Use specific cache key when targeting a specific future type
      const cacheKey   = matchedFutureType ? \`futures:\${league}:\${matchedFutureType.replace(/\\s+/g, '_')}\` : \`futures:\${league}\`;
      const seasonsKey = \`seasons:\${league}\`;

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
        ? \`\n> 🎯 **Filtered to: \${matchedFutureType}**\n\`
        : '';

      const futureTypes = LEAGUE_FUTURES_TYPES[league] || [];
      const extraInfo = !matchedFutureType && futureTypes.length > 0
        ? \`\\n\\n### All Available Future Markets for \${league}\\n\${futureTypes.map((t) => \`- \${t}\`).join('\\n')}\`
        : '';

      return buildPrompt(prompt, futureTypeNote + block + extraInfo, \`PredictionData.io \${league} Futures Odds Service\`);
    }`;

content = content.replace(oldFuturesHandler, newFuturesHandler);
console.log('✅ Futures handler updated with prop_type targeting');

// ── 9. Fix SGP handler to actually call getSGPOddsService when legs detected ──
const oldSGPHandler = `    // ── SAME GAME PARLAY ──────────────────────────────────────────────────
    if (type === 'sgp') {
      const [fixtures, markets] = await Promise.all([
        safe(getFixturesService(league, 24), 5000),
        safe(getPlayerPropsService(league, '', PROPS_BOOK_IDS), 7000),
      ]);

      let block = \`## \${emoji} \${league} — Same Game Parlay (SGP) Builder\\n\\n\`;
      block += \`> 📡 **PredictionData.io SGP Pricing Engine**\\n\`;
      block += \`> Supported books: DraftKings • FanDuel • BetRivers • BetMGM • BetWay • ToonieB • BC.Game • Stake • 888Sport\\n\\n\`;
      block += \`> **To price an SGP:** Provide 2+ legs from the SAME game (e.g. "Chiefs ML + Mahomes over 280.5 pass yds"). I will call the SGP pricing API and return real odds from each book.\\n\\n\`;

      block += formatScheduleBlock(fixtures || [], {}, league);
      block += '\\n\\n';

      // Show available props per game as SGP building blocks
      if (markets && markets.length > 0) {
        block += \`### Available SGP Legs (Player Props)\\n\`;
        block += formatPlayerPropsBlock(markets.slice(0, 50), fixtures || [], league);
      }

      return buildPrompt(prompt, block, \`PredictionData.io \${league} SGP Pricing Engine\`);
    }`;

const newSGPHandler = `    // ── SAME GAME PARLAY ──────────────────────────────────────────────────
    if (type === 'sgp') {
      const [fixtures, markets] = await Promise.all([
        safe(getFixturesService(league, 24), 5000),
        safe(getPlayerPropsService(league, '', PROPS_BOOK_IDS), 7000),
      ]);

      // Try to extract SGP legs from the user's prompt
      const sgpLegs = extractSGPLegs(prompt, fixtures || [], markets || []);

      // If we have 2+ legs detected, actually call the SGP pricing API
      if (sgpLegs.length >= 2 && fixtures && fixtures.length > 0) {
        logger.info(\`[SportsRouter] SGP: detected \${sgpLegs.length} legs — calling POST /api/sgp\`);

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
              return buildPrompt(prompt, block, \`PredictionData.io \${league} SGP Pricing API\`);
            }
          } catch (sgpErr) {
            logger.warn(\`[SportsRouter] SGP API call failed: \${sgpErr.message}\`);
          }
        }
      }

      // Fallback: show SGP builder UI with fixtures + available legs
      let block = \`## \${emoji} \${league} — Same Game Parlay (SGP) Builder\\n\\n\`;
      block += \`> 📡 **PredictionData.io SGP Pricing Engine**\\n\`;
      block += \`> Supported books: DraftKings • FanDuel • BetRivers • BetMGM • BetWay • ToonieB • BC.Game • Stake • 888Sport\\n\\n\`;

      if (sgpLegs.length > 0 && sgpLegs.length < 2) {
        block += \`> ⚠️ **Detected \${sgpLegs.length} leg(s)** — need at least 2 legs from the SAME game to price an SGP.\\n\\n\`;
        block += \`> Legs found: \${sgpLegs.map((l) => l.description).join(', ')}\\n\\n\`;
      } else {
        block += \`> **To price an SGP:** Specify 2+ legs from the SAME game.\\n\`;
        block += \`> *Example: "Price an SGP: Chiefs ML + Mahomes over 280.5 pass yds + Kelce over 5.5 receptions"*\\n\\n\`;
      }

      block += formatScheduleBlock(fixtures || [], {}, league);
      block += '\\n\\n';

      if (markets && markets.length > 0) {
        block += \`### Available SGP Legs (Player Props)\\n\`;
        block += formatPlayerPropsBlock(markets.slice(0, 80), fixtures || [], league);
      }

      return buildPrompt(prompt, block, \`PredictionData.io \${league} SGP Pricing Engine\`);
    }`;

content = content.replace(oldSGPHandler, newSGPHandler);
console.log('✅ SGP handler now calls getSGPOddsService when legs detected in prompt');

// ── 10. Add multi-league intent handler BEFORE the standard odds handler ──────
// Find the standard odds handler and insert multi-league before it
const multiLeagueBlock = `    // ── MULTI-LEAGUE (all games tonight / all sports) ────────────────────
    if (type === 'multi_league') {
      const queryLeagues = extra.leagues || ['NFL', 'NBA', 'MLB', 'NHL'];
      logger.info(\`[SportsRouter] Multi-league query: \${queryLeagues.join(', ')}\`);

      const allBlocks = await Promise.allSettled(
        queryLeagues.map(async (lg) => {
          const [mkts, fxts] = await Promise.all([
            cacheGet(\`odds:\${lg}\`) ||
              safe(getMarketsService(lg, 'moneyline,spread,total', 'FT', DEFAULT_BOOK_IDS, { timedelta: 24 }), 7000),
            cacheGet(\`fixtures:\${lg}\`) ||
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

      const combined = successBlocks.join('\\n\\n---\\n\\n');
      return buildPrompt(prompt, combined, \`PredictionData.io Multi-Sport: \${queryLeagues.join(', ')}\`);
    }

`;

const beforeStandardOdds = `    // ── STANDARD ODDS (moneyline + spread + total) ─────────────────────────
    if (type === 'odds') {`;

content = content.replace(beforeStandardOdds, multiLeagueBlock + beforeStandardOdds);
console.log('✅ Multi-league handler added');

// ── 11. Update formatPlayerPropsBlock to accept playerMap and show position ───
// We need to update the formatter signature to accept playerMap
const oldPropsFormatterSig = 'function formatPlayerPropsBlock(markets, fixtures, league) {';
const newPropsFormatterSig = 'function formatPlayerPropsBlock(markets, fixtures, league, playerMap = {}) {';
content = content.replace(oldPropsFormatterSig, newPropsFormatterSig);

// Add position/status enrichment in the props display
// After the player header line "block += `\n**${player}**\n`;"
const oldPlayerHeader = '      block += `\\n**${player}**\\n`;';
const newPlayerHeader = `      // Look up player reference data if available
      const pRefObj = playerMap && typeof playerMap === 'object'
        ? Object.values(playerMap).find((p) => (p.full_name || '').toLowerCase() === player.toLowerCase())
        : null;
      const posTag = pRefObj?.position ? \` (\${pRefObj.position})\` : '';
      const teamTag = pRefObj?.team_abbr ? \` — \${pRefObj.team_abbr}\` : '';
      const statusTag = pRefObj?.status && pRefObj.status !== 'Active' ? \` ⚠️ \${pRefObj.status}\` : '';
      block += \`\\n**\${player}\${posTag}\${teamTag}\${statusTag}**\\n\`;`;
content = content.replace(oldPlayerHeader, newPlayerHeader);
console.log('✅ Player prop formatter updated with position/team/status enrichment');

// ── 12. Update logger line to say v4 ──────────────────────────────────────────
content = content.replace(
  "logger.info(`[SportsRouter v3] Intent: ${type} | League: ${league}`);",
  "logger.info(`[SportsRouter v4] Intent: ${type} | League: ${league} | Player: ${extra.playerName || 'N/A'}`);"
);

// ── 13. Update version comment at top ─────────────────────────────────────────
content = content.replace(' * Sports Smart Router — v3', ' * Sports Smart Router — v4');

fs.writeFileSync(routerFile, content, 'utf8');
console.log('\\n✅ sportsSmartRouter.js v4 patch complete');
console.log('New file size:', content.length, 'bytes');
