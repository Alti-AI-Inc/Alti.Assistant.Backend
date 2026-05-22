/**
 * sportsIntentDB.js — Sports Intent Intelligence Database v2
 *
 * Full coverage of all PredictionData.io API capabilities:
 *   - League detection (all 16+ leagues)
 *   - Team → league resolution (all major teams)
 *   - Player name → league hint mapping
 *   - Betting intent keywords
 *   - All prop type keywords per sport (from API spec)
 *   - Game prop keywords (UFC, soccer, game events)
 *   - Futures keywords per league
 *   - Period/half/quarter keywords
 *   - Same Game Parlay (SGP) detection
 *   - Prediction market (Polymarket/Kalshi) detection
 *   - Alt line / alternate spread detection
 *   - Deeplink / bet placement detection
 *   - Intent type enumeration
 */

// ─────────────────────────────────────────────
// LEAGUE NAME → API LEAGUE CODE MAP
// ─────────────────────────────────────────────
export const LEAGUE_MAP = {
  // American Football
  'nfl': 'NFL', 'national football league': 'NFL',
  'super bowl': 'NFL', 'nfc': 'NFL', 'afc': 'NFL',
  'football': 'NFL',
  'college football': 'NCAAF', 'ncaa football': 'NCAAF', 'ncaaf': 'NCAAF',
  'cfb': 'NCAAF', 'ncaa fb': 'NCAAF',
  'ufl': 'FB_US_M_UFL', 'united football league': 'FB_US_M_UFL',

  // Basketball
  'nba': 'NBA', 'national basketball association': 'NBA',
  'basketball': 'NBA',
  'college basketball': 'NCAAB', 'ncaa basketball': 'NCAAB', 'ncaab': 'NCAAB',
  'march madness': 'NCAAB', 'ncaa tournament': 'NCAAB', 'ncaa hoops': 'NCAAB',

  // Baseball
  'mlb': 'MLB', 'major league baseball': 'MLB', 'baseball': 'MLB',
  'world series': 'MLB', 'mlb playoffs': 'MLB',

  // Hockey
  'nhl': 'NHL', 'national hockey league': 'NHL', 'hockey': 'NHL',
  'stanley cup': 'NHL', 'nhl playoffs': 'NHL',

  // Soccer
  'mls': 'MLS', 'major league soccer': 'MLS', 'mls soccer': 'MLS',
  'premier league': 'EPL', 'epl': 'EPL', 'english premier league': 'EPL',
  'bpl': 'EPL', 'barclays premier league': 'EPL',
  'serie a': 'SERA', 'italian league': 'SERA', 'seria': 'SERA',
  'la liga': 'LIGA', 'laliga': 'LIGA', 'spanish league': 'LIGA', 'liga': 'LIGA',
  'ligue 1': 'LIG1', 'ligue1': 'LIG1', 'french league': 'LIG1', 'ligue un': 'LIG1',
  'bundesliga': 'BUND', 'german league': 'BUND', 'german soccer': 'BUND',
  'champions league': 'UCL', 'ucl': 'UCL', 'europa league': 'UCL',
  'champions': 'UCL', 'cl soccer': 'UCL',

  // Combat Sports
  'ufc': 'UFC', 'mma': 'UFC', 'mixed martial arts': 'UFC',
  'octagon': 'UFC', 'cage fight': 'UFC', 'fight night': 'UFC',

  // Golf
  'golf': 'GOLF', 'pga': 'GOLF', 'masters': 'GOLF',
  'us open golf': 'GOLF', 'the open': 'GOLF', 'pga tour': 'GOLF',
  'champions tour': 'GOLF', 'lpga': 'GOLF', 'european tour': 'GOLF',

  // Tennis
  'tennis': 'TENNIS', 'wimbledon': 'TENNIS', 'us open tennis': 'TENNIS',
  'french open': 'TENNIS', 'australian open': 'TENNIS', 'atp': 'TENNIS',
  'wta': 'TENNIS', 'grand slam': 'TENNIS',
};

// ─────────────────────────────────────────────
// TEAM NAME → LEAGUE CODE MAP
// ─────────────────────────────────────────────
export const TEAM_LEAGUE_MAP = {
  // ── NFL Teams ────────────────────────────────
  'chiefs': 'NFL', 'kansas city chiefs': 'NFL',
  'eagles': 'NFL', 'philadelphia eagles': 'NFL',
  'cowboys': 'NFL', 'dallas cowboys': 'NFL',
  'bills': 'NFL', 'buffalo bills': 'NFL',
  'ravens': 'NFL', 'baltimore ravens': 'NFL',
  '49ers': 'NFL', 'san francisco 49ers': 'NFL', 'niners': 'NFL',
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
  'buccaneers': 'NFL', 'tampa bay buccaneers': 'NFL', 'bucs': 'NFL',
  'panthers': 'NFL', 'carolina panthers': 'NFL',
  'bears': 'NFL', 'chicago bears': 'NFL',
  'vikings': 'NFL', 'minnesota vikings': 'NFL',
  'commanders': 'NFL', 'washington commanders': 'NFL',
  'browns': 'NFL', 'cleveland browns': 'NFL',
  'bengals': 'NFL', 'cincinnati bengals': 'NFL',
  'colts': 'NFL', 'indianapolis colts': 'NFL',
  'titans': 'NFL', 'tennessee titans': 'NFL',
  'jaguars': 'NFL', 'jacksonville jaguars': 'NFL',

  // ── NBA Teams ────────────────────────────────
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

  // ── MLB Teams ────────────────────────────────
  'yankees': 'MLB', 'new york yankees': 'MLB',
  'dodgers': 'MLB', 'los angeles dodgers': 'MLB',
  'red sox': 'MLB', 'boston red sox': 'MLB',
  'cubs': 'MLB', 'chicago cubs': 'MLB',
  'astros': 'MLB', 'houston astros': 'MLB',
  'braves': 'MLB', 'atlanta braves': 'MLB',
  'mets': 'MLB', 'new york mets': 'MLB',
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
  'athletics': 'MLB', "a's": 'MLB', 'oakland athletics': 'MLB', 'sacramento athletics': 'MLB',
  'diamondbacks': 'MLB', 'arizona diamondbacks': 'MLB', 'dbacks': 'MLB',
  'rockies': 'MLB', 'colorado rockies': 'MLB',
  'pirates': 'MLB', 'pittsburgh pirates': 'MLB',
  'reds': 'MLB', 'cincinnati reds': 'MLB',
  'brewers': 'MLB', 'milwaukee brewers': 'MLB',
  'marlins': 'MLB', 'miami marlins': 'MLB',
  'nationals': 'MLB', 'washington nationals': 'MLB',
  'giants sf': 'MLB', 'san francisco giants': 'MLB',
  'cardinals st': 'MLB', 'st louis cardinals': 'MLB',

  // ── NHL Teams ────────────────────────────────
  'bruins': 'NHL', 'boston bruins': 'NHL',
  'maple leafs': 'NHL', 'toronto maple leafs': 'NHL', 'leafs': 'NHL',
  'canadiens': 'NHL', 'montreal canadiens': 'NHL', 'habs': 'NHL',
  'rangers nhl': 'NHL', 'new york rangers': 'NHL',
  'flyers': 'NHL', 'philadelphia flyers': 'NHL',
  'penguins': 'NHL', 'pittsburgh penguins': 'NHL', 'pens': 'NHL',
  'capitals': 'NHL', 'washington capitals': 'NHL', 'caps': 'NHL',
  'lightning': 'NHL', 'tampa bay lightning': 'NHL',
  'panthers nhl': 'NHL', 'florida panthers': 'NHL',
  'hurricanes': 'NHL', 'carolina hurricanes': 'NHL', 'canes': 'NHL',
  'islanders': 'NHL', 'new york islanders': 'NHL',
  'devils': 'NHL', 'new jersey devils': 'NHL',
  'sabres': 'NHL', 'buffalo sabres': 'NHL',
  'senators': 'NHL', 'ottawa senators': 'NHL',
  'jets nhl': 'NHL', 'winnipeg jets': 'NHL',
  'wild': 'NHL', 'minnesota wild': 'NHL',
  'blackhawks': 'NHL', 'chicago blackhawks': 'NHL',
  'blue jackets': 'NHL', 'columbus blue jackets': 'NHL',
  'predators': 'NHL', 'nashville predators': 'NHL', 'preds': 'NHL',
  'blues': 'NHL', 'st louis blues': 'NHL',
  'stars': 'NHL', 'dallas stars': 'NHL',
  'avalanche': 'NHL', 'colorado avalanche': 'NHL', 'avs': 'NHL',
  'golden knights': 'NHL', 'vegas golden knights': 'NHL', 'vgk': 'NHL',
  'kraken': 'NHL', 'seattle kraken': 'NHL',
  'sharks': 'NHL', 'san jose sharks': 'NHL',
  'ducks': 'NHL', 'anaheim ducks': 'NHL',
  'kings nhl': 'NHL', 'los angeles kings': 'NHL',
  'flames': 'NHL', 'calgary flames': 'NHL',
  'oilers': 'NHL', 'edmonton oilers': 'NHL',
  'canucks': 'NHL', 'vancouver canucks': 'NHL',
  'coyotes': 'NHL', 'utah hockey club': 'NHL',

  // ── MLS/Soccer Teams (key ones) ──────────────
  'inter miami': 'MLS', 'atlanta united': 'MLS', 'lafc': 'MLS',
  'la galaxy': 'MLS', 'seattle sounders': 'MLS', 'portland timbers': 'MLS',
  'man city': 'EPL', 'manchester city': 'EPL',
  'man united': 'EPL', 'manchester united': 'EPL',
  'arsenal': 'EPL', 'chelsea': 'EPL', 'liverpool': 'EPL',
  'tottenham': 'EPL', 'spurs': 'EPL',
  'real madrid': 'LIGA', 'barcelona': 'LIGA', 'atletico madrid': 'LIGA',
  'juventus': 'SERA', 'inter milan': 'SERA', 'ac milan': 'SERA',
  'psg': 'LIG1', 'paris saint germain': 'LIG1', 'olympique marseille': 'LIG1',
  'bayern munich': 'BUND', 'borussia dortmund': 'BUND', 'bvb': 'BUND',
};

// ─────────────────────────────────────────────
// SPORTS BETTING INTENT KEYWORDS
// ─────────────────────────────────────────────
export const SPORTS_ODDS_KEYWORDS = [
  // Core betting terms
  'odds', 'betting', 'bets', 'bet on', 'wager', 'line', 'lines', 'lines for',
  'spread', 'point spread', 'moneyline', 'money line', 'ml', 'pk', 'pick em',
  'over under', 'over/under', 'o/u', 'ou', 'total', 'game total',
  'prop', 'player prop', 'prop bet', 'game prop', 'prop line',
  'futures', 'future odds', 'futures odds', 'championship odds',
  'parlay', 'teaser', 'same game parlay', 'sgp', 'sgp+', 'multi',
  'implied probability', 'implied', 'no vig', 'no juice',
  'juice', 'vig', 'vigorish', 'overround',
  'line movement', 'line move', 'steam move', 'sharp money', 'public betting',
  'handle', 'ticket percentage', 'betting percentage',
  'handicap', 'ats', 'against the spread', 'beat the spread',
  'sportsbook', 'sportsbooks', 'book', 'books',
  'draftkings', 'fanduel', 'pinnacle', 'betmgm', 'caesars', 'bet365',
  'barstool', 'espnbet', 'betrivers', 'betway', 'fanatics',
  'polymarket', 'kalshi', 'prediction market', 'prediction markets',
  'cover', 'covers', 'push', 'opening line', 'closing line', 'closing number',
  'key number', 'reverse line movement', 'rlm',
  'alt line', 'alternate line', 'alternate spread', 'alternate total',
  'best odds', 'best lines', 'shop lines', 'line shop',
  'underdog', 'favorite', 'fave', 'chalk',
  'action', 'bet slip', 'place a bet', 'cash out', 'cashout',
  'payout', 'winnings', 'roi', 'return',
  'first half', '1st half', 'first quarter', '1st quarter',
  'second half', '2nd half', 'quarter odds', 'half odds', 'halftime',
  'first inning', '1st inning', 'first 5', 'f5', 'run line',
  'puck line', 'first period', 'period odds',
];

// ─────────────────────────────────────────────
// SPORTS GAME QUERY KEYWORDS
// ─────────────────────────────────────────────
export const SPORTS_GAME_KEYWORDS = [
  'game', 'match', 'matchup', 'tonight', "today's game", 'this weekend',
  'who wins', 'who is favored', "who's favored", 'favorite to win',
  'prediction', 'pick', 'winner', 'score', 'final score',
  'injured', 'injury', 'injury report', 'starting lineup', 'lineup',
  'pitching today', 'starting pitcher', 'projected starter',
  'playoff', 'playoffs', 'championship', 'finals',
  'super bowl', 'world series', 'stanley cup', 'nba finals',
  'ncaa tournament', 'march madness', 'college football playoff',
  'schedule', 'next game', 'when do', 'when does', 'kickoff',
  'tip off', 'tip-off', 'first pitch', 'puck drop', 'tee time',
  'preview', 'analysis', 'pick tonight', 'pick today',
  'series', 'series odds', 'series winner', 'series spread',
  'live score', 'in game', 'in-game', 'halftime score', 'current score',
];

// ─────────────────────────────────────────────
// PLAYER PROP STAT KEYWORDS — by sport
// Full list from PredictionData spec
// ─────────────────────────────────────────────
export const PROP_STAT_KEYWORDS = {
  // ── Basketball (NBA/NCAAB) ───────────────────
  'points': 'NBA',
  'rebounds': 'NBA', 'boards': 'NBA',
  'assists': 'NBA', 'dimes': 'NBA',
  'three pointers': 'NBA', 'threes': 'NBA', '3 pointers': 'NBA', 'triples': 'NBA',
  'blocks': 'NBA', 'steals': 'NBA',
  'turnovers': 'NBA',
  'double double': 'NBA', 'double-double': 'NBA',
  'triple double': 'NBA', 'triple-double': 'NBA',
  'pts reb ast': 'NBA', 'pts+reb+ast': 'NBA',
  'pts ast': 'NBA', 'pts+ast': 'NBA',
  'pts reb': 'NBA', 'pts+reb': 'NBA',
  'reb ast': 'NBA', 'reb+ast': 'NBA',
  'steals blocks': 'NBA', 'stl+blk': 'NBA',
  'first scorer': 'NBA', 'first basket': 'NBA',
  'first field goal': 'NBA',

  // ── Football (NFL/NCAAF) ─────────────────────
  'passing yards': 'NFL', 'pass yds': 'NFL', 'passing yds': 'NFL',
  'rushing yards': 'NFL', 'rush yds': 'NFL',
  'receiving yards': 'NFL', 'rec yds': 'NFL', 'receiving yds': 'NFL',
  'touchdowns': 'NFL', 'tds': 'NFL',
  'passing touchdowns': 'NFL', 'td passes': 'NFL',
  'rushing touchdowns': 'NFL', 'rush td': 'NFL',
  'receiving touchdowns': 'NFL', 'td receptions': 'NFL',
  'receptions': 'NFL', 'catches': 'NFL',
  'completions': 'NFL', 'pass attempts': 'NFL',
  'interceptions': 'NFL', 'ints': 'NFL', 'picks': 'NFL',
  'sacks': 'NFL', 'defensive sacks': 'NFL',
  'solo tackles': 'NFL', 'tackles': 'NFL', 'tackles assists': 'NFL',
  'kicking points': 'NFL', 'field goals': 'NFL', 'made field goals': 'NFL',
  'extra points': 'NFL', 'made extra points': 'NFL',
  'long reception': 'NFL', 'long rush': 'NFL', 'long completion': 'NFL',
  'first td': 'NFL', 'first touchdown': 'NFL',
  'rush rec': 'NFL', 'rush+rec': 'NFL',
  'pass rush': 'NFL', 'pass+rush': 'NFL',

  // ── Baseball (MLB) ───────────────────────────
  'strikeouts': 'MLB', 'k\'s': 'MLB', 'total strikeouts': 'MLB',
  'hits': 'MLB', 'base hits': 'MLB',
  'home runs': 'MLB', 'hr': 'MLB',
  'rbi': 'MLB', 'rbis': 'MLB', 'runs batted in': 'MLB',
  'runs': 'MLB', 'runs scored': 'MLB',
  'innings pitched': 'MLB', 'pitching outs': 'MLB',
  'earned runs': 'MLB', 'era': 'MLB',
  'walks': 'MLB', 'batter walks': 'MLB', 'pitcher walks': 'MLB',
  'doubles': 'MLB', 'singles': 'MLB', 'triples mlb': 'MLB',
  'total bases': 'MLB', 'steals': 'MLB', 'stolen bases': 'MLB',
  'hits+runs+rbis': 'MLB', 'h+r+rbi': 'MLB',
  'hits+runs+errors': 'MLB', 'h+r+e': 'MLB',
  'runs+rbis': 'MLB', 'r+rbi': 'MLB',
  'pitcher wins': 'MLB', 'win for pitcher': 'MLB',

  // ── Hockey (NHL) ─────────────────────────────
  'goals': 'NHL', 'goal scorer': 'NHL',
  'shots on goal': 'NHL', 'shots': 'NHL',
  'saves': 'NHL', 'goalie saves': 'NHL',
  'power play points': 'NHL', 'powerplay': 'NHL',
  'plus minus': 'NHL', '+/-': 'NHL',
  'blocked shots': 'NHL',
  'first goal': 'NHL', 'first goalscorer': 'NHL',

  // ── UFC/MMA ──────────────────────────────────
  'significant strikes': 'UFC',
  'takedowns': 'UFC',

  // ── Soccer ───────────────────────────────────
  'goals soccer': 'EPL', 'shots on target': 'EPL',
  'corners': 'EPL', 'total corners': 'EPL',
  'bookings': 'EPL', 'yellow cards': 'EPL',
  'both teams to score': 'EPL', 'btts': 'EPL',
};

// ─────────────────────────────────────────────
// GAME PROP KEYWORDS
// In-game event props (not player-level)
// ─────────────────────────────────────────────
export const GAME_PROP_KEYWORDS = [
  // Football game props
  'team to score first', 'first team to score', 'first score',
  'team to score last', 'last team to score',
  'both teams over', 'race to points', 'team total',

  // Soccer game props
  'both teams score', 'btts',
  'clean sheet', 'draw', 'correct score',

  // Baseball game props
  'run in 1st inning', 'first inning run', 'first 5 innings',
  'extra innings', 'a hit in every inning',

  // UFC game props
  'fight goes to decision', 'decision', 'ko tko', 'submission',
  'fight ends in round', 'round 1', 'round 2', 'round 3',
  'how does the fight end', 'method of victory', 'goes the distance',

  // General game props
  'race to', 'next score', 'half result', 'match result',
  'next goal', 'next team to score',
  'overtime', 'ot', 'goes to ot', 'penalty shootout',
];

// ─────────────────────────────────────────────
// FUTURES KEYWORDS — championship and award odds
// ─────────────────────────────────────────────
export const FUTURES_KEYWORDS = [
  'futures', 'future', 'futures odds', 'championship odds',
  // NFL futures
  'super bowl', 'super bowl winner', 'nfc championship', 'afc championship',
  'nfl mvp', 'rookie of the year', 'roty', 'defensive player of the year',
  'make playoffs', 'win division', 'win conference',
  // NBA futures
  'nba championship', 'nba finals winner', 'nba mvp', 'nba title',
  'nba finals', 'conference champion', 'eastern conference', 'western conference',
  'nba cup', 'nba championship winner',
  // MLB futures
  'world series winner', 'world series champion', 'al pennant', 'nl pennant',
  'cy young', 'mvp baseball', 'home run leader',
  // NHL futures
  'stanley cup winner', 'stanley cup champion', 'hart trophy',
  'vezina trophy', 'norris trophy', 'calder trophy',
  // NCAAF
  'heisman', 'heisman trophy', 'college football playoff',
  'cfp championship', 'cfp winner',
  // NCAAB
  'ncaa champion', 'final four', 'march madness winner',
  // General
  'to win', 'odds to win', 'winner odds', 'outright', 'ante post',
  'season winner', 'award winner',
];

// ─────────────────────────────────────────────
// PERIOD / HALF / QUARTER KEYWORDS
// Maps keywords to period codes for the API
// ─────────────────────────────────────────────
export const PERIOD_KEYWORDS = {
  // Football / Basketball
  '1st half': '1H', 'first half': '1H', '1h': '1H', 'first half odds': '1H',
  '2nd half': '2H', 'second half': '2H', '2h': '2H',
  '1st quarter': '1Q', 'first quarter': '1Q', 'q1': '1Q',
  '2nd quarter': '2Q', 'second quarter': '2Q', 'q2': '2Q',
  '3rd quarter': '3Q', 'third quarter': '3Q', 'q3': '3Q',
  '4th quarter': '4Q', 'fourth quarter': '4Q', 'q4': '4Q',
  // Hockey
  '1st period': '1P', 'first period': '1P', 'p1': '1P',
  '2nd period': '2P', 'second period': '2P', 'p2': '2P',
  '3rd period': '3P', 'third period': '3P', 'p3': '3P',
  // Baseball
  'first inning': '1I', '1st inning': '1I',
  'first 5 innings': 'F5', 'first five innings': 'F5',
  'first 3 innings': 'F3', 'first three innings': 'F3',
  'first 7 innings': 'F7', 'first seven innings': 'F7',
  'first inning run': '1I',
  'f5': 'F5', 'f3': 'F3',
  // Tennis
  '1st set': '1S', 'first set': '1S',
  '2nd set': '2S', 'second set': '2S',
};

// ─────────────────────────────────────────────
// SGP DETECTION KEYWORDS
// ─────────────────────────────────────────────
export const SGP_KEYWORDS = [
  'same game parlay', 'sgp', 'sgp+', 'same-game parlay',
  'parlay legs', 'build a parlay', 'parlay builder',
  'combine', 'multi leg', 'multi-leg',
  'pair these', 'bundle', 'sgp pricing', 'sgp odds',
];

// ─────────────────────────────────────────────
// PREDICTION MARKET KEYWORDS
// Polymarket / Kalshi orderbook
// ─────────────────────────────────────────────
export const PREDICTION_MARKET_KEYWORDS = [
  'polymarket', 'kalshi', 'prediction market', 'prediction markets',
  'market odds', 'event contract', 'event market',
  'yes no market', 'binary market', 'exchange odds',
  'orderbook', 'order book', 'bid ask', 'bid/ask',
  'contracts', 'market contract', 'robinhood betting',
  'coinbase sports', 'prediction contract',
];

// ─────────────────────────────────────────────
// ALT LINE KEYWORDS
// ─────────────────────────────────────────────
export const ALT_LINE_KEYWORDS = [
  'alt line', 'alternate line', 'alternate spread', 'alternate total',
  'alt spread', 'alt total', 'alternate', 'alts',
  'buying points', 'sell points', 'custom spread', 'custom line',
  'different number', 'move the line', 'adjusted line',
];

// ─────────────────────────────────────────────
// DEFAULT BOOK IDS (corrected from API spec)
// FanDuel=100, DraftKings=200, Caesars=300, BetMGM=400, Pinnacle=250
// ─────────────────────────────────────────────
export const DEFAULT_BOOK_IDS = '100,200,300,400,250';

// Main books for props (lighter set)
export const PROPS_BOOK_IDS = '100,200,400';

// Prediction markets (Polymarket + Kalshi)
export const PREDICTION_MARKET_BOOK_IDS = '193,194';

// ─────────────────────────────────────────────
// LEAGUE → SPORT GROUP
// ─────────────────────────────────────────────
export const LEAGUE_SPORT = {
  NFL: 'football', NCAAF: 'football', FB_US_M_UFL: 'football',
  NBA: 'basketball', NCAAB: 'basketball',
  MLB: 'baseball',
  NHL: 'hockey',
  MLS: 'soccer', EPL: 'soccer', SERA: 'soccer',
  LIGA: 'soccer', LIG1: 'soccer', BUND: 'soccer', UCL: 'soccer',
  UFC: 'combat',
  GOLF: 'golf',
  TENNIS: 'tennis',
};

// ─────────────────────────────────────────────
// LEAGUE EMOJI MAP
// ─────────────────────────────────────────────
export const LEAGUE_EMOJI = {
  NFL: '🏈', NCAAF: '🏈', FB_US_M_UFL: '🏈',
  NBA: '🏀', NCAAB: '🏀',
  MLB: '⚾',
  NHL: '🏒',
  MLS: '⚽', EPL: '⚽', SERA: '⚽', LIGA: '⚽', LIG1: '⚽', BUND: '⚽',
  UCL: '🏆',
  UFC: '🥊',
  GOLF: '⛳',
  TENNIS: '🎾',
};

// ─────────────────────────────────────────────
// LEAGUE → DEFAULT PERIOD
// Some sports default to non-FT periods
// ─────────────────────────────────────────────
export const LEAGUE_DEFAULT_PERIOD = {
  NFL: 'FT',
  NBA: 'FT',
  MLB: 'FT',
  NHL: 'FT',
  UFC: 'FT',
  GOLF: 'FT',
  TENNIS: 'FT',
  MLS: 'FT', EPL: 'FT', SERA: 'FT', LIGA: 'FT', LIG1: 'FT', BUND: 'FT', UCL: 'FT',
  NCAAF: 'FT', NCAAB: 'FT', FB_US_M_UFL: 'FT',
};

// ─────────────────────────────────────────────
// LEAGUE → PROP TYPE MAP
// Maps sport to its valid player_prop types
// ─────────────────────────────────────────────
export const LEAGUE_PROP_TYPES = {
  NFL: [
    '2+ TDS', '3+ TDs', 'Assists', 'Completions', 'Defensive Interceptions',
    'First TD', 'First Team TD', 'Interceptions', 'Kicking Points', 'Last TD',
    'Long Completion', 'Long Reception', 'Long Rush', 'Made Extra Points',
    'Made Field Goals', 'Pass Attempts', 'Pass Yds', 'Pass+Rush',
    'Receiving Yds', 'Receptions', 'Rush Attempts', 'Rush TD', 'Rush Yds',
    'Rush+Rec', 'Sacks', 'Solo Tackles', 'Team Total', 'TD Passes',
    'TD Receptions', 'Tackles+Assists', 'Team to Score First', 'Team to Score Last',
    'Touchdowns', 'Total Touchdowns',
  ],
  NHL: [
    'Assists 0.5', 'Assists 1.5', 'Assists 2.5', 'Blocked Shots',
    'First Goal', 'Goals', '2+ Goals', '3+ Goals', 'Overtime',
    'Points 0.5', 'Points 1.5', 'Powerplay Points', 'Plus Minus',
    'Saves', 'Shots on Goal 0.5', 'Shots on Goal 1.5', 'Shots on Goal 2.5',
    'Shots on Goal 3.5', 'Shots on Goal 4.5', 'Shots on Goal 5.5',
  ],
  MLB: [
    'A Hit in Every Inning', 'Batter Strikeouts', 'Batter Walks', 'Doubles',
    'Earned Runs', 'Extra Innings', 'Either Pitcher to Throw a Full Game',
    'Hits Allowed', 'Hits 0.5', 'Hits 1.5', 'Hits 2.5', 'Hits 3.5',
    'Hits+Runs+Errors', 'Hits+Runs+Rbis', 'Home Runs', 'Pitcher Wins',
    'Pitcher Walks', 'Pitching Outs 12.5', 'Pitching Outs 13.5', 'Pitching Outs 14.5',
    'Pitching Outs 15.5', 'Pitching Outs 16.5', 'Pitching Outs 17.5',
    'Pitching Outs 18.5', 'RBIs', 'Run in 1st Inning', 'Runs', 'Runs+Rbis',
    'Singles', 'Steals', 'Team to Score First', 'Team to Score Last',
    'Team Total - 1H', 'Team Total - 1I', 'Team Total - FT',
    'Total Bases 0.5', 'Total Bases 1.5', 'Total Bases 2.5', 'Total Bases 3.5',
    'Total Bases 4.5', 'Total Strikeouts', 'Triples',
  ],
  UFC: [
    'Decision Win', 'Draw', 'Fight Goes to Decision', 'Fight end by Split Decision',
    'Fight ends by Submission', 'Fight ends by KO/TKO/DQ', 'Fight ends in Round 1',
    'Fight ends in Round 2', 'Fight ends in Round 3', 'Fight ends in Round 4',
    'Fight ends in Round 5', 'Round 2 Start', 'Round 3 Start', 'Round 4 Start',
    'Round 5 Start', 'Round 1 Win', 'Round 2 Win', 'Round 3 Win', 'Round 4 Win',
    'Round 5 Win', 'Submission Win', 'Significant Strikes', 'Takedowns',
    'Most Takedowns', 'Most Strikes Landed', 'TKO/KO Win', 'Total 1.5',
    'Total 2.5', 'Total 3.5', 'Unanimous Decision Win', 'Majority Decision Win',
    'Wins Inside Distance',
  ],
  NBA: [
    '3 Point FG', 'Assists', 'Blocks', 'Double+Double', 'First Field Goal',
    'First Scorer', 'First Team Basket', 'Points', 'Pts+Asts', 'Pts+Rebs',
    'Pts+Rebs+Asts', 'Rebounds', 'Rebs+Asts', 'Steals', 'Steals+Blocks',
    'Triple+Double', 'Turnovers',
  ],
  NCAAB: [
    '3 Point FG', 'Assists', 'Blocks', 'Double+Double', 'Points', 'Pts+Asts',
    'Pts+Rebs', 'Pts+Rebs+Asts', 'Rebounds', 'Steals', 'Turnovers',
  ],
  EPL: ['Goals', 'Assists', 'Shots', 'Shots On Goal', 'Both Teams To Score', 'Team Total', 'Total Bookings', 'Total Corners', 'Team Total Corners'],
  MLS: ['Goals', 'Assists', 'Shots', 'Shots On Goal', 'Both Teams To Score', 'Team Total', 'Total Corners'],
  SERA: ['Goals', 'Assists', 'Shots', 'Shots On Goal', 'Both Teams To Score', 'Team Total'],
  LIGA: ['Goals', 'Assists', 'Shots', 'Shots On Goal', 'Both Teams To Score', 'Team Total'],
  LIG1: ['Goals', 'Assists', 'Shots', 'Shots On Goal', 'Both Teams To Score', 'Team Total'],
  BUND: ['Goals', 'Assists', 'Shots', 'Shots On Goal', 'Both Teams To Score', 'Team Total'],
  UCL: ['Goals', 'Assists', 'Shots', 'Shots On Goal', 'Both Teams To Score', 'Team Total'],
};

// ─────────────────────────────────────────────
// FUTURES PROP TYPES BY LEAGUE
// From API spec
// ─────────────────────────────────────────────
export const LEAGUE_FUTURES_TYPES = {
  NFL: ['Super Bowl Winner', 'Win Division', 'Win Conference', 'MVP', 'DPOY', 'OROY', 'DROY',
    'Make Playoffs', 'Number of Wins', 'Most Passing Yards', 'Most Passing Touchdowns',
    'Most Rushing Yards', 'Most Rushing Touchdowns', 'Most Receiving Yards', 'Most Receiving Touchdowns',
    'Comeback Player of the Year', 'OPOY', 'Best Record', 'Conference Top Seed'],
  NBA: ['Championship Winner', 'Win Conference', 'Win Division', 'MVP', 'DPOY', 'ROTY',
    'Make Playoffs', 'Number of Wins', 'Series Winner', 'NBA Finals MVP',
    'Most Improved Player', 'Coach of the Year', '6th Man of the Year',
    'Points Per Game Leader', 'Assists Per Game Leader', 'Rebounds Per Game Leader',
    'Blocks Per Game Leader', 'Steals Per Game Leader', 'Threes Per Game Leader',
    'NBA Cup Winner', 'NBA Cup MVP', 'Clutch Player of the Year'],
  MLB: ['Championship Winner', 'AL Pennant', 'NL Pennant', 'Win Division', 'MVP',
    'Cy Young Winner', 'ROTY', 'Make Playoffs', 'World Series MVP', 'Home Run Leader',
    'Strikeout Leader', 'Saves Leader', 'Hits Leader', 'RBI Leader', 'Stolen Base Leader',
    'Golden Glove Winner', 'Manager Of The Year'],
  NHL: ['Championship Winner', 'Win Conference', 'Win Division', 'Hart Trophy Winner',
    'Vezina Trophy Winner', 'Norris Trophy Winner', 'Calder Trophy Winner',
    'Art Ross Trophy Winner', 'Conn Smythe Trophy Winner', 'Make Playoffs',
    'Series Winner', 'Number of Wins', 'Most Regular Season Goals'],
  NCAAF: ['Championship Winner', 'Win Conference', 'Heisman Winner', 'Make Playoffs',
    'Number of Wins', 'Conference Top Seed'],
  NCAAB: ['Championship Winner', 'Reach the Final Four', 'Win Conference'],
};

// ─────────────────────────────────────────────
// SPORTS INTENT DETECTOR — v2
// Returns { type, league, extra } or null
// Intent types:
//   'live_odds'    — live in-game odds
//   'player_prop'  — player prop markets
//   'game_prop'    — in-game event props (UFC, soccer events, etc.)
//   'futures'      — championship/award futures
//   'schedule'     — game schedule only (no betting intent)
//   'sgp'          — same game parlay
//   'prediction_market' — Polymarket/Kalshi orderbook
//   'alt_lines'    — alternate spread/total lines
//   'period_odds'  — first half, first quarter, etc.
//   'odds'         — standard moneyline + spread + total
// ─────────────────────────────────────────────
export function detectSportsIntent(prompt) {
  const q = prompt.toLowerCase().trim();

  // ── 1. Check for betting / sports keywords ─────────────────────────────────
  const hasBettingKeyword = SPORTS_ODDS_KEYWORDS.some((k) => q.includes(k));
  const hasGameKeyword    = SPORTS_GAME_KEYWORDS.some((k) => q.includes(k));
  const hasPropStat       = Object.keys(PROP_STAT_KEYWORDS).some((k) => q.includes(k));
  const hasGameProp       = GAME_PROP_KEYWORDS.some((k) => q.includes(k));
  const hasFuturesKw      = FUTURES_KEYWORDS.some((k) => q.includes(k));
  const hasSGP            = SGP_KEYWORDS.some((k) => q.includes(k));
  const hasPredMkt        = PREDICTION_MARKET_KEYWORDS.some((k) => q.includes(k));
  const hasAltLine        = ALT_LINE_KEYWORDS.some((k) => q.includes(k));
  const hasPeriodKw       = Object.keys(PERIOD_KEYWORDS).some((k) => q.includes(k));

  if (
    !hasBettingKeyword && !hasGameKeyword && !hasPropStat &&
    !hasGameProp && !hasFuturesKw && !hasSGP && !hasPredMkt
  ) return null;

  // ── 2. Detect league ───────────────────────────────────────────────────────
  let detectedLeague = null;

  // Direct league name
  for (const [name, code] of Object.entries(LEAGUE_MAP)) {
    if (q.includes(name)) { detectedLeague = code; break; }
  }

  // Team name → league
  if (!detectedLeague) {
    for (const [team, league] of Object.entries(TEAM_LEAGUE_MAP)) {
      if (q.includes(team)) { detectedLeague = league; break; }
    }
  }

  // Prop stat → league hint
  if (!detectedLeague) {
    for (const [stat, league] of Object.entries(PROP_STAT_KEYWORDS)) {
      if (q.includes(stat)) { detectedLeague = league; break; }
    }
  }

  // Futures keyword might imply NFL if no league
  if (!detectedLeague && hasFuturesKw) {
    if (q.includes('super bowl')) detectedLeague = 'NFL';
    else if (q.includes('world series')) detectedLeague = 'MLB';
    else if (q.includes('stanley cup')) detectedLeague = 'NHL';
    else if (q.includes('nba finals') || q.includes('nba title')) detectedLeague = 'NBA';
    else if (q.includes('heisman') || q.includes('cfp')) detectedLeague = 'NCAAF';
    else if (q.includes('march madness') || q.includes('final four')) detectedLeague = 'NCAAB';
  }

  if (!detectedLeague) return null;

  // ── 3. Detect period ───────────────────────────────────────────────────────
  let detectedPeriod = null;
  if (hasPeriodKw) {
    for (const [kw, code] of Object.entries(PERIOD_KEYWORDS)) {
      if (q.includes(kw)) { detectedPeriod = code; break; }
    }
  }

  // ── 4. Determine intent type ───────────────────────────────────────────────

  // Prediction market / exchange orderbook
  if (hasPredMkt) {
    const provider = q.includes('kalshi') ? 'kalshi'
                   : q.includes('polymarket') ? 'polymarket'
                   : 'polymarket';
    return { type: 'prediction_market', league: detectedLeague, extra: { provider } };
  }

  // Same Game Parlay
  if (hasSGP) {
    return { type: 'sgp', league: detectedLeague };
  }

  // Live in-game odds
  if (/\b(live|in[\s-]game|right now|currently playing|happening now|going on right now)\b/.test(q)) {
    return { type: 'live_odds', league: detectedLeague };
  }

  // Alt lines
  if (hasAltLine) {
    return { type: 'alt_lines', league: detectedLeague };
  }

  // Period/half/quarter specific odds
  if (detectedPeriod && hasBettingKeyword) {
    return { type: 'period_odds', league: detectedLeague, extra: { period: detectedPeriod } };
  }

  // Futures / championship odds
  if (
    hasFuturesKw ||
    /\b(futures?|champion(ship)?|super bowl|world series|stanley cup|nba finals|win the|to win|odds to win|award|trophy)\b/.test(q)
  ) {
    return { type: 'futures', league: detectedLeague };
  }

  // Player props
  if (hasPropStat || /\bprop\b|\bplayer prop\b|\bplayer props\b/.test(q)) {
    // Try to detect specific prop type
    let propType = '';
    for (const [stat] of Object.entries(PROP_STAT_KEYWORDS)) {
      if (q.includes(stat)) {
        // Map to API prop type
        const leaguePropTypes = LEAGUE_PROP_TYPES[detectedLeague] || [];
        const match = leaguePropTypes.find((p) => p.toLowerCase().includes(stat));
        if (match) { propType = match; break; }
      }
    }
    return { type: 'player_prop', league: detectedLeague, extra: { propType } };
  }

  // Game props (in-game events, UFC, etc.)
  if (hasGameProp || detectedLeague === 'UFC' || detectedLeague === 'TENNIS') {
    return { type: 'game_prop', league: detectedLeague };
  }

  // Game schedule (no betting keywords, just schedule/result queries)
  if (
    !hasBettingKeyword &&
    /\b(schedule|when|kickoff|tip[\s-]off|first pitch|puck drop|tee time)\b/.test(q)
  ) {
    return { type: 'schedule', league: detectedLeague };
  }

  // Default: standard odds (moneyline + spread + total)
  return { type: 'odds', league: detectedLeague };
}
