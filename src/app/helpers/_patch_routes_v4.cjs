/**
 * Fix remaining 2 gaps from intentdb v4 patch and add new route endpoints.
 */
const fs = require('fs');

// ── Fix 1: Add NFL shortcuts to PLAYER_NAME_MAP (near 'kelce') ─────────────────
const dbFile = 'c:\\Users\\hyper\\workspace\\Alti.Assistant\\Alti.Assistant.Backend\\src\\app\\helpers\\sportsIntentDB.js';
let db = fs.readFileSync(dbFile, 'utf8');

// The actual string in the file has single quotes, find the kelce line
const kelceLine = "  'kelce': 'NFL',";
if (db.includes(kelceLine) && !db.includes("'hurts': 'NFL'")) {
  db = db.replace(kelceLine, 
    "  'kelce': 'NFL',\n  'hurts': 'NFL', 'allen': 'NFL', 'burrow': 'NFL', 'henry': 'NFL',\n  'barkley': 'NFL', 'mccaffrey': 'NFL', 'purdy': 'NFL', 'lamb': 'NFL',");
  console.log('✅ NFL shortcuts added');
} else {
  console.log('⚠️ kelce line not found or hurts already present. Searching...');
  const idx = db.indexOf("'kelce'");
  console.log('kelce found at index:', idx);
  console.log('Nearby:', db.substring(Math.max(0,idx-20), idx+60));
}

// Fix 2: Add cross-sport shortcuts at end of PLAYER_NAME_MAP
// Find the actual end of the map
const mapEndPattern = "'rybakina': 'TENNIS',\n};";
const mapEndReplacement = "'rybakina': 'TENNIS',\n  // Golf shortcuts\n  'scheffler': 'GOLF', 'mcilroy': 'GOLF', 'morikawa': 'GOLF', 'schauffele': 'GOLF',\n  // NBA shortcuts\n  'haliburton': 'NBA', 'booker': 'NBA', 'lillard': 'NBA', 'brunson': 'NBA',\n  'maxey': 'NBA', 'brunson': 'NBA',\n  // MLB shortcuts\n  'strider': 'MLB', 'glasnow': 'MLB', 'skenes': 'MLB', 'cole': 'MLB',\n  'freeman': 'MLB', 'betts': 'MLB', 'alvarez': 'MLB', 'soto': 'MLB',\n};";

if (db.includes(mapEndPattern) && !db.includes("'haliburton': 'NBA'")) {
  db = db.replace(mapEndPattern, mapEndReplacement);
  console.log('✅ Cross-sport shortcuts added');
} else if (db.includes("'haliburton': 'NBA'")) {
  console.log('Cross-sport shortcuts already present');
} else {
  // Search for the end pattern
  const idx2 = db.indexOf("'rybakina'");
  console.log('rybakina at index:', idx2);
  if (idx2 !== -1) {
    console.log('Nearby:', db.substring(idx2, idx2+80));
  }
}

// Also add MULTI_LEAGUE_KEYWORDS to the exports at the bottom of the file
if (!db.includes('MULTI_LEAGUE_KEYWORDS') || !db.match(/export.*MULTI_LEAGUE_KEYWORDS/)) {
  console.log('MULTI_LEAGUE_KEYWORDS not found in exports, checking...');
} else {
  console.log('✅ MULTI_LEAGUE_KEYWORDS exported');
}

fs.writeFileSync(dbFile, db, 'utf8');
console.log('sportsIntentDB.js final size:', db.length, 'bytes');

// ── Fix 3: Add /markets/compare and /deeplink endpoints to route file ─────────
const routeFile = 'c:\\Users\\hyper\\workspace\\Alti.Assistant\\Alti.Assistant.Backend\\src\\app\\modules\\predictiondata\\predictiondata.route.js';
let route = fs.readFileSync(routeFile, 'utf8');

if (!route.includes('/markets/compare')) {
  const compareEndpoint = `
// ─── Book Comparison (all books for a specific game) ──────────────────────────

/**
 * GET /predictiondata/markets/compare
 * Returns side-by-side odds from ALL books for a specific fixture or league.
 * Useful for line shopping across all major sportsbooks.
 * Query: league, fixture_id (optional), bet_types, periods
 */
router.get(
  '/markets/compare',
  handleAsync(async (req, res) => {
    const {
      league = 'NFL',
      bet_types = 'moneyline,spread,total',
      periods = 'FT',
      timedelta = 24,
    } = req.query;

    // Fetch from ALL books simultaneously
    const allBooks = '100,200,300,400,250,700,365,500,555,617,192,150';
    const data = await getMarketsService(
      league,
      bet_types,
      periods,
      allBooks,
      { timedelta: Number(timedelta) }
    );

    // Group by fixture_id + prop_name for easy comparison
    const grouped = {};
    for (const market of data) {
      const key = [market.fixture_id, market.bet_type, market.prop_name, market.side, market.period].filter(Boolean).join(':');
      if (!grouped[key]) grouped[key] = { key, markets: [] };
      grouped[key].markets.push({
        book_id: market.odd_provider_id,
        odds: market.odds,
        no_vig_odds: market.no_vig_odds,
        number: market.number,
        open_odds: market.open_odds,
        provider_url: market.provider_url,
        updated_at: market.updated_at,
      });
    }

    res.json({
      league,
      bet_types,
      markets_compared: data.length,
      fixture_groups: Object.values(grouped).length,
      comparisons: Object.values(grouped),
    });
  })
);

/**
 * POST /predictiondata/deeplink
 * Generate a bet slip deeplink URL from provider_deeplink_string values.
 * Body: { sportsbook: 'draftkings', deeplink_strings: ['...'], bet_type: 'single', region: 'nj' }
 */
router.post(
  '/deeplink',
  handleAsync(async (req, res) => {
    const { sportsbook = 'draftkings', deeplink_strings = [], bet_type = 'single', region = '' } = req.body;
    if (!Array.isArray(deeplink_strings) || deeplink_strings.length === 0) {
      return res.status(400).json({ error: 'deeplink_strings array is required' });
    }
    const result = await buildDeeplinkService(sportsbook, deeplink_strings, bet_type, region);
    res.json(result || { error: 'No deeplink generated' });
  })
);

/**
 * GET /predictiondata/markets/live-scores
 * Returns only live (in-progress) fixtures with current scores and period info.
 * Query: leagues (comma-separated, default NFL,NBA,MLB,NHL,UFC)
 */
router.get(
  '/markets/live-scores',
  handleAsync(async (req, res) => {
    const { leagues = 'NFL,NBA,MLB,NHL,UFC' } = req.query;
    const allFixtures = await getFixturesService(leagues, 6); // 6hr window
    const liveGames = allFixtures.filter((f) =>
      f.status === 'in_progress' || f.status === 'live' || f.status === 'inprogress'
    );
    res.json({
      live_games: liveGames.length,
      leagues: leagues.split(','),
      fixtures: liveGames.map((f) => ({
        id: f.id,
        league: f.league,
        home: f.home_abbr,
        away: f.away_abbr,
        home_score: f.home_score,
        away_score: f.away_score,
        current_period: f.current_period_text,
        current_clock: f.current_clock,
        current_period_number: f.current_period_number,
        status: f.status,
        date: f.date,
      })),
    });
  })
);

/**
 * GET /predictiondata/players/:league
 * Returns player reference data for a league.
 * Useful for populating player autocomplete and enriching prop displays.
 */
router.get(
  '/players/:league',
  handleAsync(async (req, res) => {
    const league = req.params.league.toUpperCase();
    const { return_map = 'false', search = '' } = req.query;
    const players = await getPlayersService(league, return_map === 'true');
    
    if (search && !return_map) {
      const s = search.toLowerCase();
      const filtered = Array.isArray(players)
        ? players.filter((p) => p.full_name?.toLowerCase().includes(s))
        : players;
      return res.json({ league, players: filtered, count: Array.isArray(filtered) ? filtered.length : Object.keys(filtered).length });
    }
    
    res.json({ league, players, count: Array.isArray(players) ? players.length : Object.keys(players).length });
  })
);

`;

  // Insert before the SSE stream section
  route = route.replace('// ─── Real-Time SSE Streaming Proxy ───', compareEndpoint + '// ─── Real-Time SSE Streaming Proxy ───');
  console.log('✅ Added /markets/compare, /deeplink, /markets/live-scores, /players/:league endpoints');
} else {
  console.log('Compare endpoint already exists');
}

fs.writeFileSync(routeFile, route, 'utf8');
console.log('predictiondata.route.js final size:', route.length, 'bytes');
