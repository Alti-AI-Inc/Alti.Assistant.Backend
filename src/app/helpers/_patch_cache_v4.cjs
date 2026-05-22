/**
 * Patch sportsDataCache.js:
 * 1. Add getPlayersService + getSeasonsService imports
 * 2. Add LIVE_SUPPORTED_LEAGUES + cache TTL constants
 * 3. Add refreshLiveFixtures, refreshPlayers, refreshSeasons functions
 * 4. Update warmLeague to include players + seasons warm
 * 5. Add live fixture 15s timer, players 30min timer, seasons 1hr timer
 * 6. Update getSportsCacheStatus with player/seasons/live game counts
 */
const fs = require('fs');
const file = 'c:\\Users\\hyper\\workspace\\Alti.Assistant\\Alti.Assistant.Backend\\src\\app\\helpers\\sportsDataCache.js';
let content = fs.readFileSync(file, 'utf8');

if (content.includes('CACHE_V4_APPLIED')) {
  console.log('Cache v4 already applied — skipping');
  process.exit(0);
}

let applied = 0;

// ─── 1. Add missing imports ────────────────────────────────────────────────────
const oldImport = `import { getMarketsService, getFixturesService, getPlayerPropsService, getFuturesMarketsService } from '../modules/predictiondata/predictiondata.service.js';`;
const newImport = `import { getMarketsService, getFixturesService, getPlayerPropsService, getFuturesMarketsService, getPlayersService, getSeasonsService } from '../modules/predictiondata/predictiondata.service.js';`;

if (content.includes(oldImport)) {
  content = content.replace(oldImport, newImport);
  applied++;
  console.log('✅ 1. Added getPlayersService + getSeasonsService imports');
} else {
  console.warn('⚠️ 1. Import line not found');
}

// ─── 2. Add constants after WARM_BOOKS ────────────────────────────────────────
const oldWarmBooks = `// Book IDs for warm cache \u2014 priority books only\nconst WARM_BOOKS = '100,200,300,400,250';`;
const newWarmBooks = `// CACHE_V4_APPLIED
// Book IDs for warm cache \u2014 priority books only
const WARM_BOOKS = '100,200,300,400,250';

// Leagues to monitor for live (in-progress) fixtures \u2014 15s refresh
const LIVE_SUPPORTED_LEAGUES = ['NFL', 'NBA', 'MLB', 'NHL', 'UFC'];

// Player reference cache TTL (30 min \u2014 position/status changes slowly)
const PLAYER_CACHE_TTL_SEC = 1800;

// Seasons reference cache TTL (1 hour \u2014 season data is very stable)
const SEASONS_CACHE_TTL_SEC = 3600;`;

if (content.includes(oldWarmBooks)) {
  content = content.replace(oldWarmBooks, newWarmBooks);
  applied++;
  console.log('✅ 2. Added LIVE_SUPPORTED_LEAGUES + TTL constants');
} else {
  console.warn('⚠️ 2. WARM_BOOKS block not found');
}

// ─── 3. Insert new refresh functions before warmLeague ────────────────────────
const beforeWarmLeague = `// \u2500\u2500\u2500 Single league full warm cycle \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nasync function warmLeague(league) {`;

const newFunctions = `// \u2500\u2500\u2500 Live fixture 15s refresh (in-progress games only) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Only caches fixtures with status 'in_progress' or 'live', with 15s TTL.
async function refreshLiveFixtures(league) {
  try {
    const fixtures = await getFixturesService(league, 3); // 3hr window catches all live games
    if (!fixtures || fixtures.length === 0) return;

    const liveGames = fixtures.filter((f) =>
      f.status === 'in_progress' || f.status === 'live' || f.status === 'inprogress'
    );
    if (liveGames.length > 0) {
      await rcSet(\`fixtures:live:\${league}\`, liveGames, 15);
      logger.info(\`[SportsCache] \${league} LIVE: \${liveGames.length} in-progress games (15s cache)\`);
    }
  } catch (err) {
    logger.warn(\`[SportsCache] \${league} live fixtures failed: \${err.message}\`);
  }
}

// \u2500\u2500\u2500 Player reference data refresh \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Fetches ID-keyed map of player objects for prop enrichment.
// Fields: id, full_name, position, team_abbr, team_full_name, status
async function refreshPlayers(league) {
  try {
    const players = await getPlayersService(league, true); // return_map=true
    if (players && Object.keys(players).length > 0) {
      await rcSet(\`players:\${league}\`, players, PLAYER_CACHE_TTL_SEC);
      logger.info(\`[SportsCache] \${league} players: \${Object.keys(players).length} records (30min cache)\`);
    }
  } catch (err) {
    logger.warn(\`[SportsCache] \${league} players refresh failed: \${err.message}\`);
  }
}

// \u2500\u2500\u2500 Season/tournament reference refresh \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Fields: id, name, league, start_date, end_date, is_active, in_progress
async function refreshSeasons(league) {
  try {
    const seasons = await getSeasonsService(league);
    if (seasons && seasons.length > 0) {
      await rcSet(\`seasons:\${league}\`, seasons, SEASONS_CACHE_TTL_SEC);
      logger.info(\`[SportsCache] \${league} seasons: \${seasons.length} records (1hr cache)\`);
    }
  } catch (err) {
    logger.warn(\`[SportsCache] \${league} seasons refresh failed: \${err.message}\`);
  }
}

// \u2500\u2500\u2500 Single league full warm cycle \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
async function warmLeague(league) {`;

if (content.includes(beforeWarmLeague)) {
  content = content.replace(beforeWarmLeague, newFunctions);
  applied++;
  console.log('✅ 3. Added refreshLiveFixtures, refreshPlayers, refreshSeasons');
} else {
  console.warn('⚠️ 3. warmLeague marker not found');
}

// ─── 4. Update warmLeague body to include players + seasons ───────────────────
const oldWarmBody = `  await Promise.allSettled([
    // Standard pre-game odds
    incrementalRefresh(league, 'moneyline,spread,total', \`odds:\${league}\`, 60, false),
    // Fixtures / live scores
    refreshFixtures(league),
    // Props (priority leagues only)
    PRIORITY_LEAGUES.includes(league) ? refreshProps(league) : Promise.resolve(),
  ]);`;

const newWarmBody = `  await Promise.allSettled([
    // Standard pre-game odds
    incrementalRefresh(league, 'moneyline,spread,total', \`odds:\${league}\`, 60, false),
    // Fixtures / live scores
    refreshFixtures(league),
    // Props (priority leagues only)
    PRIORITY_LEAGUES.includes(league) ? refreshProps(league) : Promise.resolve(),
    // Player reference data — position, team, status (priority leagues only)
    PRIORITY_LEAGUES.includes(league) ? refreshPlayers(league) : Promise.resolve(),
    // Season/tournament reference data
    refreshSeasons(league),
  ]);`;

if (content.includes(oldWarmBody)) {
  content = content.replace(oldWarmBody, newWarmBody);
  applied++;
  console.log('✅ 4. warmLeague updated to include players + seasons');
} else {
  console.warn('⚠️ 4. warmLeague body not found');
}

// ─── 5. Add live fixture timer + players timer + seasons timer ────────────────
const oldTimers = `  cacheState.timers = [standardTimer, propsTimer, futuresTimer];

  logger.info('[SportsCache] Background cache warming active \u2705');`;

const newTimers = `  // \u2500\u2500 Live fixture ticker \u2014 15s for in-progress game scores \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const liveFixtureTimer = setInterval(() => {
    LIVE_SUPPORTED_LEAGUES.forEach((league, i) => {
      setTimeout(() => refreshLiveFixtures(league).catch(() => {}), i * 150);
    });
  }, 15_000);

  // \u2500\u2500 Player reference refresh \u2014 every 30 minutes \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const playersTimer = setInterval(() => {
    PRIORITY_LEAGUES.forEach((league, i) => {
      setTimeout(() => refreshPlayers(league).catch(() => {}), i * 800);
    });
  }, 30 * 60 * 1000);

  // \u2500\u2500 Seasons reference refresh \u2014 every 1 hour \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const seasonsTimer2 = setInterval(() => {
    [...PRIORITY_LEAGUES, ...SECONDARY_LEAGUES].forEach((league, i) => {
      setTimeout(() => refreshSeasons(league).catch(() => {}), i * 400);
    });
  }, 60 * 60 * 1000);

  cacheState.timers = [standardTimer, propsTimer, futuresTimer, liveFixtureTimer, playersTimer, seasonsTimer2];

  logger.info('[SportsCache] Background cache warming active \u2705 (live: 15s | props: 90s | odds: 60s | players: 30min | seasons: 1hr)');`;

if (content.includes(oldTimers)) {
  content = content.replace(oldTimers, newTimers);
  applied++;
  console.log('✅ 5. Added live fixture 15s timer, players 30min timer, seasons 1hr timer');
} else {
  console.warn('⚠️ 5. Timer block not found');
}

// ─── 6. Update getSportsCacheStatus to report players/seasons/live ─────────────
const oldStatus = `    status[league] = {
      odds: oddsTs ? new Date(oddsTs * 1000).toISOString() : null,
      fixtures: fixturesTs ? new Date(fixturesTs * 1000).toISOString() : null,
      props: propsTs ? new Date(propsTs * 1000).toISOString() : null,
    };`;

const newStatus = `    const playerMap = await rcGet(\`players:\${league}\`).catch(() => null);
    const seasonsList = await rcGet(\`seasons:\${league}\`).catch(() => null);
    const liveGames = await rcGet(\`fixtures:live:\${league}\`).catch(() => null);

    status[league] = {
      odds: oddsTs ? new Date(oddsTs * 1000).toISOString() : null,
      fixtures: fixturesTs ? new Date(fixturesTs * 1000).toISOString() : null,
      props: propsTs ? new Date(propsTs * 1000).toISOString() : null,
      players: playerMap ? Object.keys(playerMap).length + ' players cached' : null,
      seasons: seasonsList ? seasonsList.length + ' seasons cached' : null,
      live_games_in_progress: liveGames ? liveGames.length : 0,
    };`;

if (content.includes(oldStatus)) {
  content = content.replace(oldStatus, newStatus);
  applied++;
  console.log('✅ 6. getSportsCacheStatus updated with players/seasons/live game counts');
} else {
  console.warn('⚠️ 6. Status block not found');
}

fs.writeFileSync(file, content, 'utf8');
console.log(`\nApplied ${applied}/6 patches. Final file size: ${content.length} bytes`);
