/**
 * sportsIntentDB.js — Sports Intent Intelligence Database
 *
 * Sports equivalent of massiveTickerDB.js.
 * Covers: league detection, team → league resolution, player prop keywords,
 * betting intent keywords, and pre-defined sport groups.
 */

// ─────────────────────────────────────────────
// LEAGUE NAME → API LEAGUE CODE MAP
// ─────────────────────────────────────────────
export const LEAGUE_MAP = {
  // American Football
  'nfl': 'NFL', 'national football league': 'NFL',
  'super bowl': 'NFL', 'nfc': 'NFL', 'afc': 'NFL',
  'college football': 'NCAAF', 'ncaa football': 'NCAAF', 'ncaaf': 'NCAAF',
  'cfb': 'NCAAF',

  // Basketball
  'nba': 'NBA', 'national basketball association': 'NBA',
  'college basketball': 'NCAAB', 'ncaa basketball': 'NCAAB', 'ncaab': 'NCAAB',
  'march madness': 'NCAAB', 'ncaa tournament': 'NCAAB',

  // Baseball
  'mlb': 'MLB', 'major league baseball': 'MLB', 'baseball': 'MLB',
  'world series': 'MLB',

  // Hockey
  'nhl': 'NHL', 'national hockey league': 'NHL', 'hockey': 'NHL',
  'stanley cup': 'NHL',

  // Soccer
  'mls': 'MLS', 'major league soccer': 'MLS',
  'premier league': 'EPL', 'epl': 'EPL', 'english premier league': 'EPL',
  'bpl': 'EPL',
  'serie a': 'SERA', 'italian league': 'SERA',
  'la liga': 'LIGA', 'laliga': 'LIGA', 'spanish league': 'LIGA',
  'ligue 1': 'LIG1', 'ligue1': 'LIG1', 'french league': 'LIG1',
  'bundesliga': 'BUND', 'german league': 'BUND',
  'champions league': 'UCL', 'ucl': 'UCL', 'europa': 'UCL',
  'champions': 'UCL',

  // Combat Sports
  'ufc': 'UFC', 'mma': 'UFC', 'mixed martial arts': 'UFC',
  'boxing': 'UFC', // nearest proxy

  // Golf
  'golf': 'GOLF', 'pga': 'GOLF', 'masters': 'GOLF',
  'us open golf': 'GOLF',
};

// ─────────────────────────────────────────────
// TEAM NAME → LEAGUE CODE MAP
// Covers major teams across all sports for auto-detection
// ─────────────────────────────────────────────
export const TEAM_LEAGUE_MAP = {
  // NFL Teams
  'chiefs': 'NFL', 'kansas city chiefs': 'NFL',
  'eagles': 'NFL', 'philadelphia eagles': 'NFL',
  'cowboys': 'NFL', 'dallas cowboys': 'NFL',
  'bills': 'NFL', 'buffalo bills': 'NFL',
  'ravens': 'NFL', 'baltimore ravens': 'NFL',
  '49ers': 'NFL', 'san francisco 49ers': 'NFL',
  'dolphins': 'NFL', 'miami dolphins': 'NFL',
  'lions': 'NFL', 'detroit lions': 'NFL',
  'packers': 'NFL', 'green bay packers': 'NFL',
  'steelers': 'NFL', 'pittsburgh steelers': 'NFL',
  'patriots': 'NFL', 'new england patriots': 'NFL',
  'texans': 'NFL', 'houston texans': 'NFL',
  'jets': 'NFL', 'new york jets': 'NFL',
  'giants': 'NFL', 'new york giants': 'NFL',
  'rams': 'NFL', 'los angeles rams': 'NFL',
  'chargers': 'NFL', 'los angeles chargers': 'NFL',
  'broncos': 'NFL', 'denver broncos': 'NFL',
  'raiders': 'NFL', 'las vegas raiders': 'NFL',
  'seahawks': 'NFL', 'seattle seahawks': 'NFL',
  'cardinals': 'NFL', 'arizona cardinals': 'NFL',
  'saints': 'NFL', 'new orleans saints': 'NFL',
  'falcons': 'NFL', 'atlanta falcons': 'NFL',
  'buccaneers': 'NFL', 'tampa bay buccaneers': 'NFL',
  'panthers': 'NFL', 'carolina panthers': 'NFL',
  'bears': 'NFL', 'chicago bears': 'NFL',
  'vikings': 'NFL', 'minnesota vikings': 'NFL',
  'commanders': 'NFL', 'washington commanders': 'NFL',
  'browns': 'NFL', 'cleveland browns': 'NFL',
  'bengals': 'NFL', 'cincinnati bengals': 'NFL',
  'colts': 'NFL', 'indianapolis colts': 'NFL',
  'titans': 'NFL', 'tennessee titans': 'NFL',
  'jaguars': 'NFL', 'jacksonville jaguars': 'NFL',

  // NBA Teams
  'lakers': 'NBA', 'los angeles lakers': 'NBA',
  'celtics': 'NBA', 'boston celtics': 'NBA',
  'warriors': 'NBA', 'golden state warriors': 'NBA',
  'bucks': 'NBA', 'milwaukee bucks': 'NBA',
  'heat': 'NBA', 'miami heat': 'NBA',
  'nuggets': 'NBA', 'denver nuggets': 'NBA',
  'suns': 'NBA', 'phoenix suns': 'NBA',
  'clippers': 'NBA', 'la clippers': 'NBA',
  'knicks': 'NBA', 'new york knicks': 'NBA',
  '76ers': 'NBA', 'sixers': 'NBA', 'philadelphia 76ers': 'NBA',
  'nets': 'NBA', 'brooklyn nets': 'NBA',
  'raptors': 'NBA', 'toronto raptors': 'NBA',
  'bulls': 'NBA', 'chicago bulls': 'NBA',
  'cavaliers': 'NBA', 'cavs': 'NBA', 'cleveland cavaliers': 'NBA',
  'pacers': 'NBA', 'indiana pacers': 'NBA',
  'hawks': 'NBA', 'atlanta hawks': 'NBA',
  'magic': 'NBA', 'orlando magic': 'NBA',
  'wizards': 'NBA', 'washington wizards': 'NBA',
  'hornets': 'NBA', 'charlotte hornets': 'NBA',
  'pistons': 'NBA', 'detroit pistons': 'NBA',
  'thunder': 'NBA', 'oklahoma city thunder': 'NBA',
  'mavericks': 'NBA', 'mavs': 'NBA', 'dallas mavericks': 'NBA',
  'spurs': 'NBA', 'san antonio spurs': 'NBA',
  'rockets': 'NBA', 'houston rockets': 'NBA',
  'jazz': 'NBA', 'utah jazz': 'NBA',
  'kings': 'NBA', 'sacramento kings': 'NBA',
  'timberwolves': 'NBA', 'wolves': 'NBA', 'minnesota timberwolves': 'NBA',
  'trail blazers': 'NBA', 'blazers': 'NBA', 'portland trail blazers': 'NBA',
  'grizzlies': 'NBA', 'memphis grizzlies': 'NBA',
  'pelicans': 'NBA', 'new orleans pelicans': 'NBA',

  // MLB Teams
  'yankees': 'MLB', 'new york yankees': 'MLB',
  'dodgers': 'MLB', 'los angeles dodgers': 'MLB',
  'red sox': 'MLB', 'boston red sox': 'MLB',
  'cubs': 'MLB', 'chicago cubs': 'MLB',
  'astros': 'MLB', 'houston astros': 'MLB',
  'braves': 'MLB', 'atlanta braves': 'MLB',
  'mets': 'MLB', 'new york mets': 'MLB',
  'giants mlb': 'MLB', 'san francisco giants': 'MLB',
  'cardinals mlb': 'MLB', 'st louis cardinals': 'MLB',
  'phillies': 'MLB', 'philadelphia phillies': 'MLB',
  'padres': 'MLB', 'san diego padres': 'MLB',
  'mariners': 'MLB', 'seattle mariners': 'MLB',
  'orioles': 'MLB', 'baltimore orioles': 'MLB',
  'rays': 'MLB', 'tampa bay rays': 'MLB',
  'twins': 'MLB', 'minnesota twins': 'MLB',
  'blue jays': 'MLB', 'toronto blue jays': 'MLB',
  'angels': 'MLB', 'los angeles angels': 'MLB',
  'rangers': 'MLB', 'texas rangers': 'MLB',
  'white sox': 'MLB', 'chicago white sox': 'MLB',
  'guardians': 'MLB', 'cleveland guardians': 'MLB',
  'tigers': 'MLB', 'detroit tigers': 'MLB',
  'royals': 'MLB', 'kansas city royals': 'MLB',
  'athletics': 'MLB', "a's": 'MLB', 'oakland athletics': 'MLB',
  'diamondbacks': 'MLB', 'arizona diamondbacks': 'MLB',
  'rockies': 'MLB', 'colorado rockies': 'MLB',
  'pirates': 'MLB', 'pittsburgh pirates': 'MLB',
  'reds': 'MLB', 'cincinnati reds': 'MLB',
  'brewers': 'MLB', 'milwaukee brewers': 'MLB',
  'marlins': 'MLB', 'miami marlins': 'MLB',
  'nationals': 'MLB', 'washington nationals': 'MLB',

  // NHL Teams
  'bruins': 'NHL', 'boston bruins': 'NHL',
  'maple leafs': 'NHL', 'toronto maple leafs': 'NHL', 'leafs': 'NHL',
  'canadiens': 'NHL', 'montreal canadiens': 'NHL', 'habs': 'NHL',
  'rangers nhl': 'NHL', 'new york rangers': 'NHL',
  'flyers': 'NHL', 'philadelphia flyers': 'NHL',
  'penguins': 'NHL', 'pittsburgh penguins': 'NHL', 'pens': 'NHL',
  'capitals': 'NHL', 'washington capitals': 'NHL', 'caps': 'NHL',
  'lightning': 'NHL', 'tampa bay lightning': 'NHL',
  'panthers nhl': 'NHL', 'florida panthers': 'NHL',
  'hurricanes': 'NHL', 'carolina hurricanes': 'NHL',
  'islanders': 'NHL', 'new york islanders': 'NHL',
  'devils': 'NHL', 'new jersey devils': 'NHL',
  'sabres': 'NHL', 'buffalo sabres': 'NHL',
  'senators': 'NHL', 'ottawa senators': 'NHL',
  'jets nhl': 'NHL', 'winnipeg jets': 'NHL',
  'wild': 'NHL', 'minnesota wild': 'NHL',
  'blackhawks': 'NHL', 'chicago blackhawks': 'NHL', 'hawks nhl': 'NHL',
  'blue jackets': 'NHL', 'columbus blue jackets': 'NHL',
  'predators': 'NHL', 'nashville predators': 'NHL', 'preds': 'NHL',
  'blues': 'NHL', 'st louis blues': 'NHL',
  'stars': 'NHL', 'dallas stars': 'NHL',
  'avalanche': 'NHL', 'colorado avalanche': 'NHL', 'avs': 'NHL',
  'golden knights': 'NHL', 'vegas golden knights': 'NHL',
  'kraken': 'NHL', 'seattle kraken': 'NHL',
  'sharks': 'NHL', 'san jose sharks': 'NHL',
  'ducks': 'NHL', 'anaheim ducks': 'NHL',
  'kings nhl': 'NHL', 'los angeles kings': 'NHL',
  'flames': 'NHL', 'calgary flames': 'NHL',
  'oilers': 'NHL', 'edmonton oilers': 'NHL',
  'canucks': 'NHL', 'vancouver canucks': 'NHL',
};

// ─────────────────────────────────────────────
// SPORTS BETTING INTENT KEYWORDS
// Triggers the sports router to engage
// ─────────────────────────────────────────────
export const SPORTS_ODDS_KEYWORDS = [
  // Betting terminology
  'odds', 'betting', 'bets', 'bet on', 'wager', 'line', 'lines',
  'spread', 'point spread', 'moneyline', 'money line',
  'over under', 'over/under', 'total', 'prop', 'player prop', 'prop bet',
  'futures', 'future odds', 'parlay', 'teaser', 'same game parlay', 'sgp',
  'implied probability', 'juice', 'vig', 'vigorish',
  'line movement', 'sharp money', 'public betting',
  'handicap', 'ats', 'against the spread', 'pick', 'best bet',
  'sportsbook', 'sportsbooks', 'draftkings', 'fanduel', 'pinnacle',
  'betmgm', 'caesars', 'bet365', 'barstool', 'espnbet',
  'cover', 'covers', 'push', 'opening line', 'closing line',
  'key number', 'reverse line movement',
];

// ─────────────────────────────────────────────
// SPORTS GAME QUERY KEYWORDS
// General sports queries that may benefit from odds context
// ─────────────────────────────────────────────
export const SPORTS_GAME_KEYWORDS = [
  'game', 'match', 'matchup', 'tonight', 'today\'s game', 'this weekend',
  'who wins', 'who is favored', 'who\'s favored', 'favorite', 'underdog',
  'prediction', 'pick', 'winner', 'score',
  'injured', 'injury report', 'starting lineup', 'pitching today',
  'playoff', 'playoffs', 'championship', 'super bowl', 'world series',
  'stanley cup', 'nba finals', 'ncaa tournament',
  'schedule', 'next game', 'when do', 'when does', 'kickoff',
];

// ─────────────────────────────────────────────
// PLAYER PROP STAT KEYWORDS
// Helps detect player-specific prop queries
// ─────────────────────────────────────────────
export const PROP_STAT_KEYWORDS = {
  // Basketball
  'points': 'NBA', 'rebounds': 'NBA', 'assists': 'NBA', 'three pointers': 'NBA',
  'blocks': 'NBA', 'steals': 'NBA', 'threes': 'NBA',
  // Football
  'passing yards': 'NFL', 'rushing yards': 'NFL', 'receiving yards': 'NFL',
  'touchdowns': 'NFL', 'td': 'NFL', 'receptions': 'NFL',
  'completions': 'NFL', 'interceptions': 'NFL',
  // Baseball
  'strikeouts': 'MLB', 'hits': 'MLB', 'home runs': 'MLB', 'rbi': 'MLB',
  'innings pitched': 'MLB', 'earned runs': 'MLB',
  // Hockey
  'goals': 'NHL', 'shots on goal': 'NHL', 'power play': 'NHL',
};

// ─────────────────────────────────────────────
// DEFAULT BOOK IDs (Pinnacle=100, DraftKings=400, FanDuel=117)
// ─────────────────────────────────────────────
export const DEFAULT_BOOK_IDS = '100,400,117';

// ─────────────────────────────────────────────
// LEAGUE → SPORT GROUP
// ─────────────────────────────────────────────
export const LEAGUE_SPORT = {
  NFL: 'football', NCAAF: 'football',
  NBA: 'basketball', NCAAB: 'basketball',
  MLB: 'baseball',
  NHL: 'hockey',
  MLS: 'soccer', EPL: 'soccer', SERA: 'soccer',
  LIGA: 'soccer', LIG1: 'soccer', BUND: 'soccer', UCL: 'soccer',
  UFC: 'combat',
  GOLF: 'golf',
};

// ─────────────────────────────────────────────
// LEAGUE EMOJI MAP
// ─────────────────────────────────────────────
export const LEAGUE_EMOJI = {
  NFL: '🏈', NCAAF: '🏈',
  NBA: '🏀', NCAAB: '🏀',
  MLB: '⚾',
  NHL: '🏒',
  MLS: '⚽', EPL: '⚽', SERA: '⚽', LIGA: '⚽', LIG1: '⚽', BUND: '⚽', UCL: '🏆',
  UFC: '🥊',
  GOLF: '⛳',
};

// ─────────────────────────────────────────────
// SPORTS INTENT DETECTOR
// Returns { type, league, extra } or null
// ─────────────────────────────────────────────
export function detectSportsIntent(prompt) {
  const q = prompt.toLowerCase().trim();

  // ── 1. Check for betting keywords first ──────────────────────────────────
  const hasBettingKeyword = SPORTS_ODDS_KEYWORDS.some((k) => q.includes(k));
  const hasGameKeyword = SPORTS_GAME_KEYWORDS.some((k) => q.includes(k));
  const hasPropStat = Object.keys(PROP_STAT_KEYWORDS).some((k) => q.includes(k));

  if (!hasBettingKeyword && !hasGameKeyword && !hasPropStat) return null;

  // ── 2. Detect league ──────────────────────────────────────────────────────
  let detectedLeague = null;

  // Direct league name match
  for (const [name, code] of Object.entries(LEAGUE_MAP)) {
    if (q.includes(name)) {
      detectedLeague = code;
      break;
    }
  }

  // Team name → league resolution
  if (!detectedLeague) {
    for (const [team, league] of Object.entries(TEAM_LEAGUE_MAP)) {
      if (q.includes(team)) {
        detectedLeague = league;
        break;
      }
    }
  }

  // Prop stat → league resolution
  if (!detectedLeague) {
    for (const [stat, league] of Object.entries(PROP_STAT_KEYWORDS)) {
      if (q.includes(stat)) {
        detectedLeague = league;
        break;
      }
    }
  }

  if (!detectedLeague) return null;

  // ── 3. Determine intent type ─────────────────────────────────────────────

  // Live in-game odds
  if (/\b(live|in[\s-]game|right now|currently playing|happening now)\b/.test(q)) {
    return { type: 'live_odds', league: detectedLeague };
  }

  // Player props
  if (
    hasPropStat ||
    /\bprop\b|\bplayer prop\b/.test(q)
  ) {
    return { type: 'player_prop', league: detectedLeague };
  }

  // Futures / championship odds
  if (
    /\b(futures?|champion(ship)?|super bowl|world series|stanley cup|nba finals|win the|to win|odds to win)\b/.test(q)
  ) {
    return { type: 'futures', league: detectedLeague };
  }

  // Game schedule (no betting keywords, just schedule)
  if (!hasBettingKeyword && /\b(schedule|when|kickoff|tip[\s-]off|first pitch|puck drop)\b/.test(q)) {
    return { type: 'schedule', league: detectedLeague };
  }

  // Default: moneyline + spread + total odds
  return { type: 'odds', league: detectedLeague };
}
