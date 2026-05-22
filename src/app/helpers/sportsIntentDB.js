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
  'liv golf': 'GOLF', 'liv tour': 'GOLF', 'livgolf': 'GOLF',

  // Tennis
  'tennis': 'TENNIS', 'wimbledon': 'TENNIS', 'us open tennis': 'TENNIS',
  'french open': 'TENNIS', 'australian open': 'TENNIS', 'atp': 'TENNIS',
  'wta': 'TENNIS', 'grand slam': 'TENNIS',

  // WNBA
  'wnba': 'WNBA', "women's basketball": 'WNBA', 'women basketball': 'WNBA',
  "women's nba": 'WNBA', 'commissioner trophy': 'WNBA',

  // Emerging/Alternative Football
  'ufl': 'FB_US_M_UFL', 'united football league': 'FB_US_M_UFL',
  'xfl': 'FB_US_M_XFL', 'extreme football league': 'FB_US_M_XFL',

  // Canadian / Australian Football
  'cfl': 'CFL', 'canadian football': 'CFL', 'grey cup': 'CFL',
  'afl': 'AFL', 'australian rules': 'AFL', 'aussie rules': 'AFL',

  // European Soccer
  'premier league': 'ESOC_M_GB_EPL', 'epl': 'ESOC_M_GB_EPL', 'english premier league': 'ESOC_M_GB_EPL',
  'la liga': 'ESOC_M_ES_1', 'laliga': 'ESOC_M_ES_1', 'spanish league': 'ESOC_M_ES_1',
  'bundesliga': 'ESOC_M_DE_1', 'german league': 'ESOC_M_DE_1', 'german bundesliga': 'ESOC_M_DE_1',
  'serie a': 'ESOC_M_IT_1', 'italian league': 'ESOC_M_IT_1', 'italian serie a': 'ESOC_M_IT_1',
  'ligue 1': 'ESOC_M_FR_1', 'french league': 'ESOC_M_FR_1', 'ligue1': 'ESOC_M_FR_1',
};


// ─────────────────────────────────────────────
// PLAYER NAME → LEAGUE CODE MAP
// Resolves player name mentions to their sport league.
// Allows "Mahomes prop" to correctly route to NFL.
// ─────────────────────────────────────────────
export const PLAYER_NAME_MAP = {
  // NFL stars
  'mahomes': 'NFL', 'patrick mahomes': 'NFL',
  'lamar jackson': 'NFL', 'jalen hurts': 'NFL',
  'josh allen': 'NFL', 'dak prescott': 'NFL',
  'joe burrow': 'NFL', 'justin herbert': 'NFL',
  'tua tagovailoa': 'NFL', 'brock purdy': 'NFL',
  'kyler murray': 'NFL', 'jordan love': 'NFL',
  'trevor lawrence': 'NFL', 'sam darnold': 'NFL',
  'travis kelce': 'NFL', 'tyreek hill': 'NFL',
  'davante adams': 'NFL', 'ceedee lamb': 'NFL',
  'stefon diggs': 'NFL', 'justin jefferson': 'NFL',
  'christian mccaffrey': 'NFL', 'derrick henry': 'NFL',
  'saquon barkley': 'NFL', 'josh jacobs': 'NFL',
  'breece hall': 'NFL', 'nick chubb': 'NFL', 'kelce': 'NFL',
  'hurts': 'NFL', 'allen': 'NFL', 'burrow': 'NFL', 'henry': 'NFL',
  'barkley': 'NFL', 'mccaffrey': 'NFL', 'purdy': 'NFL', 'lamb': 'NFL',
  'diggs': 'NFL', 'hill': 'NFL', 'jefferson': 'NFL',
  // NBA stars
  'lebron': 'NBA', 'lebron james': 'NBA',
  'stephen curry': 'NBA', 'steph curry': 'NBA',
  'kevin durant': 'NBA', 'giannis': 'NBA',
  'giannis antetokounmpo': 'NBA', 'nikola jokic': 'NBA',
  'jokic': 'NBA', 'jayson tatum': 'NBA', 'tatum': 'NBA',
  'luka doncic': 'NBA', 'luka': 'NBA',
  'joel embiid': 'NBA', 'damian lillard': 'NBA',
  'devin booker': 'NBA', 'trae young': 'NBA',
  'sga': 'NBA', 'shai gilgeous-alexander': 'NBA',
  'anthony edwards': 'NBA', 'ant edwards': 'NBA',
  'victor wembanyama': 'NBA', 'wemby': 'NBA',
  'tyrese haliburton': 'NBA', 'lamelo ball': 'NBA',
  'ja morant': 'NBA', 'paolo banchero': 'NBA',
  'kawhi leonard': 'NBA', 'jimmy butler': 'NBA',
  'jaylen brown': 'NBA', 'donovan mitchell': 'NBA',
  // MLB stars
  'shohei ohtani': 'MLB', 'ohtani': 'MLB',
  'mookie betts': 'MLB', 'freddie freeman': 'MLB',
  'mike trout': 'MLB', 'aaron judge': 'MLB', 'judge': 'MLB',
  'juan soto': 'MLB', 'ronald acuna': 'MLB',
  'spencer strider': 'MLB', 'gerrit cole': 'MLB',
  'paul skenes': 'MLB', 'tyler glasnow': 'MLB',
  'yordan alvarez': 'MLB', 'francisco lindor': 'MLB',
  'pete alonso': 'MLB', 'corey seager': 'MLB',
  // NHL stars
  'connor mcdavid': 'NHL', 'mcdavid': 'NHL',
  'leon draisaitl': 'NHL', 'draisaitl': 'NHL',
  'auston matthews': 'NHL', 'matthews': 'NHL',
  'nathan mackinnon': 'NHL', 'mackinnon': 'NHL',
  'cale makar': 'NHL', 'makar': 'NHL',
  'david pastrnak': 'NHL', 'pastrnak': 'NHL',
  'nikita kucherov': 'NHL', 'kucherov': 'NHL',
  'alexander ovechkin': 'NHL', 'ovi': 'NHL', 'ovechkin': 'NHL',
  'fox': 'NHL', 'shesterkin': 'NHL', 'josi': 'NHL', 'draisaitl': 'NHL',
  // UFC stars
  'jon jones': 'UFC', 'israel adesanya': 'UFC',
  'alex pereira': 'UFC', 'pereira': 'UFC',
  'leon edwards': 'UFC', 'islam makhachev': 'UFC',
  'conor mcgregor': 'UFC', 'mcgregor': 'UFC',
  'max holloway': 'UFC', 'dustin poirier': 'UFC',
  'ilia topuria': 'UFC', 'topuria': 'UFC',
  'ngannou': 'UFC', 'sean strickland': 'UFC',
  // Golf stars
  'scottie scheffler': 'GOLF', 'scheffler': 'GOLF',
  'rory mcilroy': 'GOLF', 'xander schauffele': 'GOLF',
  'collin morikawa': 'GOLF', 'viktor hovland': 'GOLF',
  'hovland': 'GOLF', 'jon rahm': 'GOLF', 'rahm': 'GOLF',
  'brooks koepka': 'GOLF', 'koepka': 'GOLF',
  'tiger woods': 'GOLF', 'tiger': 'GOLF',
  // Tennis stars
  'novak djokovic': 'TENNIS', 'djokovic': 'TENNIS',
  'carlos alcaraz': 'TENNIS', 'alcaraz': 'TENNIS',
  'jannik sinner': 'TENNIS', 'sinner': 'TENNIS',
  'daniil medvedev': 'TENNIS', 'medvedev': 'TENNIS',
  'rafael nadal': 'TENNIS', 'nadal': 'TENNIS',
  'iga swiatek': 'TENNIS', 'swiatek': 'TENNIS',
  'aryna sabalenka': 'TENNIS', 'sabalenka': 'TENNIS',
  'coco gauff': 'TENNIS', 'gauff': 'TENNIS',
  // Golf shortcuts
  'scheffler': 'GOLF', 'mcilroy': 'GOLF', 'morikawa': 'GOLF', 'schauffele': 'GOLF',
  // NBA shortcuts
  'haliburton': 'NBA', 'booker': 'NBA', 'lillard': 'NBA', 'brunson': 'NBA',
  // MLB shortcuts
  'strider': 'MLB', 'glasnow': 'MLB', 'skenes': 'MLB', 'cole': 'MLB',
  'betts': 'MLB', 'alvarez': 'MLB', 'soto': 'MLB', 'freeman': 'MLB',
  // WNBA shortcuts
  'clark': 'WNBA', 'caitlin clark': 'WNBA', 'ionescu': 'WNBA', 'sabrina': 'WNBA',
  'griner': 'WNBA', 'taurasi': 'WNBA', 'stewart': 'WNBA', 'breanna': 'WNBA',
  // Soccer shortcuts
  'messi': 'ESOC_M_ES_1', 'ronaldo': 'ESOC_M_GB_EPL', 'mbappe': 'ESOC_M_ES_1',
  'haaland': 'ESOC_M_GB_EPL', 'bellingham': 'ESOC_M_ES_1', 'salah': 'ESOC_M_GB_EPL',
  'kane': 'ESOC_M_DE_1', 'lewandowski': 'ESOC_M_ES_1', 'de bruyne': 'ESOC_M_GB_EPL',
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
// MULTI-LEAGUE KEYWORDS
// Triggers multi-league query across all active sports tonight
// ─────────────────────────────────────────────
export const MULTI_LEAGUE_KEYWORDS = [
  'all sports', 'all games', 'all leagues', 'all games tonight', 'every game',
  'every sport', 'all tonight', 'sports tonight', 'games today', 'all today',
  'every league', 'multi sport', 'multi-sport', 'sports on today',
  'whats on tonight', "what's on tonight", 'all nfl nba mlb', 'all major sports',
];

// Active leagues for multi-league all-sports queries
export const MULTI_LEAGUE_ACTIVE = ['NFL', 'NBA', 'MLB', 'NHL', 'UFC'];

// ─────────────────────────────────────────────
// BROADCAST / TV CHANNEL KEYWORDS
// User wants to know where to watch the game
// ─────────────────────────────────────────────
export const BROADCAST_KEYWORDS = [
  'on tv', 'where to watch', 'what channel', 'tv channel', 'broadcast',
  'watch live', 'watch tonight', 'watch today', 'streaming',
  'espn', 'nbc sports', 'fox sports', 'tnt', 'tbs', 'abc sports',
  'peacock', 'amazon prime sports', 'apple tv plus', 'dazn', 'paramount plus',
];

// ─────────────────────────────────────────────────────────────────────────────
// ANALYSIS INTENT KEYWORDS
// These trigger advanced PredictionData.io analysis modes
// ─────────────────────────────────────────────────────────────────────────────

export const VALUE_BETS_KEYWORDS = [
  'value bet', 'value bets', '+ev', 'plus ev', 'positive ev', 'positive expected value',
  'best value', 'edge', 'find value', 'where is the value', 'ev bet',
  'fair value', 'no vig', 'vig free', 'sharp value', 'beat the closing line',
  'expected value betting', 'biggest edge',
];

export const LINE_MOVERS_KEYWORDS = [
  'line movement', 'line mover', 'line movers', 'steam move', 'steam moves',
  'line moving', 'line moved', 'where is the steam', 'sharp action',
  'biggest line move', 'line change', 'odds movement', 'sharp money',
  'line opened at', 'line moved from', 'late steam', 'reverse line movement',
];

export const SHARP_PICKS_KEYWORDS = [
  'sharp pick', 'sharp picks', 'sharp money', 'sharp action', 'pinnacle',
  'pin price', 'sharp line', 'sharp side', 'what do sharps like',
  'sharp vs public', 'public vs sharp', 'sharp consensus', 'sharp fade',
  'bet like a sharp', 'professional bettors', 'wiseguys', 'wise guys',
  'sharp bettors', 'what do pros bet', 'where is the sharp money',
];

export const BEST_AVAILABLE_KEYWORDS = [
  'best available', 'best odds', 'best line', 'best price', 'line shop',
  'line shopping', 'shop lines', 'where to bet', 'which book has',
  'who has the best odds', 'who has the best line', 'best book for',
  'compare odds', 'highest odds', 'most favorable odds', 'beat the book',
];

// ─────────────────────────────────────────────────────────────────────────────
// ARBITRAGE KEYWORDS
// Risk-free profit when combined implied probability < 100%
// ─────────────────────────────────────────────────────────────────────────────
export const DFS_KEYWORDS = ['dfs','daily fantasy','prizepicks','prize picks','underdog fantasy','underdog','sleeper','fantasy picks','pick em',"pick'em",'dfs picks','more or less','dfs optimizer','top picks'];
export const KELLY_KEYWORDS = ['kelly criterion','kelly calculator','kelly sizing','bet sizing','how much to bet','optimal bet size','bankroll management','kelly formula','fractional kelly'];
export const CLV_KEYWORDS = ['closing line','closing line value','clv','beat the closing line','closing odds','closed at','final odds','closing price','line movement since open'];
export const ARBITRAGE_KEYWORDS = [
  'arbitrage', 'arb', 'arb bet', 'arbing', 'arb opportunity', 'arb alert',
  'sure bet', 'surebet', 'sure thing', 'risk free bet', 'risk-free',
  'lock profit', 'guaranteed profit', 'both sides', 'middle bet',
  'middling', 'cover both sides', 'no lose bet', 'no-lose', 'free money',
  'positive expected value both sides', 'dutching',
];

// ─────────────────────────────────────────────────────────────────────────────
// PARLAY BUILDER KEYWORDS
// Multi-leg bet construction with combined odds
// ─────────────────────────────────────────────────────────────────────────────
export const PARLAY_BUILDER_KEYWORDS = [
  'parlay', 'parlays', 'build a parlay', 'parlay builder', 'build parlay',
  'multi bet', 'multi-bet', 'accumulator', 'acca', 'combo bet', 'combo',
  'combine these bets', 'combine legs', 'multi leg', 'multi-leg',
  'what are the combined odds', 'combined odds', 'teaser', 'round robin',
  'parlay odds', 'parlay calculator', 'calculate parlay', 'what would i win',
  'if i bet all', 'if i parlay', 'parlay payout',
];

// ─────────────────────────────────────────────────────────────────────────────
// MATCHUP KEYWORDS
// Head-to-head comparison for a specific game
// ─────────────────────────────────────────────────────────────────────────────
export const MATCHUP_KEYWORDS = [
  'vs', 'versus', 'vs.', 'v.s.', 'matchup', 'head to head', 'head-to-head',
  'h2h', 'game between', 'plays', 'facing', 'against', 'taking on',
  'battle', 'showdown', 'face off', 'faceoff', 'at the', ' at ',
  'rivalry', 'who wins', 'pick between',
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
  UCL:  ['Goals', 'Assists', 'Shots', 'Shots On Goal', 'Both Teams To Score', 'Team Total'],
  GOLF: [
    'Outright Winner', 'Top 5', 'Top 10', 'Top 20', 'Make Cut',
    'First Round Leader', 'Bogey Free Round', 'Winning Score',
    'Round Score', 'Head to Head', '72 Hole Score', '18 Hole Score',
  ],
  TENNIS: [
    'Outright Winner', 'Total Games', 'Total Sets', 'Set Winner',
    'Games in Set', 'Correct Score', 'To Win in Straight Sets',
    'First Set Winner', 'Handicap Sets', 'Aces', 'Double Faults',
  ],
  FB_US_M_UFL: [
    'Pass Yds', 'Rush Yds', 'Receiving Yds', 'Touchdowns',
    'TD Passes', 'Receptions', 'Completions', 'Interceptions',
  ],
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
//   'multi_league' — all games tonight / all sports query
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

  // Player name detection — covers "Mahomes prop", "LeBron points tonight"
  const detectedPlayerName =
    Object.keys(PLAYER_NAME_MAP).find((name) => q.includes(name)) || null;

    if(typeof DFS_KEYWORDS!=="undefined"&&DFS_KEYWORDS.some(k=>q.includes(k))){const d=Object.entries(LEAGUE_MAP).find(([kw])=>q.includes(kw));return{type:"dfs",league:d?.[1]||"NFL",extra:{}};}
  if(typeof KELLY_KEYWORDS!=="undefined"&&KELLY_KEYWORDS.some(k=>q.includes(k))){const d=Object.entries(LEAGUE_MAP).find(([kw])=>q.includes(kw));return{type:"kelly",league:d?.[1]||"NFL",extra:{}};}
  if(typeof CLV_KEYWORDS!=="undefined"&&CLV_KEYWORDS.some(k=>q.includes(k))){const d=Object.entries(LEAGUE_MAP).find(([kw])=>q.includes(kw));return{type:"clv",league:d?.[1]||"NFL",extra:{}};}
  // ── Arbitrage intent detection
  if (typeof ARBITRAGE_KEYWORDS !== 'undefined' && ARBITRAGE_KEYWORDS.some((k) => q.includes(k))) {
    const detectedLeagueArb = Object.entries(LEAGUE_MAP).find(([kw]) => q.includes(kw));
    return { type: 'arbitrage', league: detectedLeagueArb?.[1] || 'NFL', extra: {} };
  }

  // ── Parlay builder intent detection
  // Must NOT contain SGP keywords (those go to sgp path)
  if (typeof PARLAY_BUILDER_KEYWORDS !== 'undefined' && PARLAY_BUILDER_KEYWORDS.some((k) => q.includes(k)) && !q.includes('same game')) {
    const detectedLeagueParlay = Object.entries(LEAGUE_MAP).find(([kw]) => q.includes(kw));
    return { type: 'parlay_builder', league: detectedLeagueParlay?.[1] || 'NFL', extra: {} };
  }

  // ── Matchup intent detection — "Chiefs vs Raiders", "Lakers vs Warriors"
  // Must have a "vs" pattern AND a detectable team/player
  const hasVsPattern = /\b(vs\.?|versus|v\.?s\.?|vs )\b/i.test(prompt) || q.includes(' v ');
  if (hasVsPattern) {
    const detectedLeagueMatchup = Object.entries(LEAGUE_MAP).find(([kw]) => q.includes(kw));
    if (detectedLeagueMatchup) {
      return { type: 'matchup', league: detectedLeagueMatchup[1], extra: { rawQuery: prompt } };
    }
  }

  // ── Analysis intent detection (value bets, line movers, sharp picks, best available)
  if (VALUE_BETS_KEYWORDS && VALUE_BETS_KEYWORDS.some((k) => q.includes(k))) {
    const detectedLeagueAnalysis = Object.entries(LEAGUE_MAP).find(([kw]) => q.includes(kw));
    return { type: 'value_bets', league: detectedLeagueAnalysis?.[1] || 'NFL', extra: {} };
  }
  if (LINE_MOVERS_KEYWORDS && LINE_MOVERS_KEYWORDS.some((k) => q.includes(k))) {
    const detectedLeagueAnalysis = Object.entries(LEAGUE_MAP).find(([kw]) => q.includes(kw));
    return { type: 'line_movers', league: detectedLeagueAnalysis?.[1] || 'NFL', extra: {} };
  }
  if (SHARP_PICKS_KEYWORDS && SHARP_PICKS_KEYWORDS.some((k) => q.includes(k))) {
    const detectedLeagueAnalysis = Object.entries(LEAGUE_MAP).find(([kw]) => q.includes(kw));
    return { type: 'sharp_picks', league: detectedLeagueAnalysis?.[1] || 'NFL', extra: {} };
  }
  if (BEST_AVAILABLE_KEYWORDS && BEST_AVAILABLE_KEYWORDS.some((k) => q.includes(k))) {
    const detectedLeagueAnalysis = Object.entries(LEAGUE_MAP).find(([kw]) => q.includes(kw));
    return { type: 'best_available', league: detectedLeagueAnalysis?.[1] || 'NFL', extra: {} };
  }

  // Multi-league detection — "all games tonight", "all sports", "games today"
  const hasMultiLeague = MULTI_LEAGUE_KEYWORDS.some((k) => q.includes(k));
  if (hasMultiLeague) {
    const mentionedLeagues = MULTI_LEAGUE_ACTIVE.filter((lg) => q.includes(lg.toLowerCase()));
    return {
      type: 'multi_league',
      league: 'MULTI',
      extra: { leagues: mentionedLeagues.length > 0 ? mentionedLeagues : MULTI_LEAGUE_ACTIVE },
    };
  }

  if (
    !hasBettingKeyword && !hasGameKeyword && !hasPropStat &&
    !hasGameProp && !hasFuturesKw && !hasSGP && !hasPredMkt && !detectedPlayerName
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

  // Player name → league resolution (covers first-name-only queries)
  if (!detectedLeague && detectedPlayerName) {
    detectedLeague = PLAYER_NAME_MAP[detectedPlayerName];
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
    return { type: 'player_prop', league: detectedLeague, extra: { propType, playerName: detectedPlayerName } };
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
  // If a player name was detected without a prop stat keyword, treat as player prop
  if (detectedPlayerName && detectedLeague) {
    return { type: 'player_prop', league: detectedLeague, extra: { propType: '', playerName: detectedPlayerName } };
  }
  return { type: 'odds', league: detectedLeague };
}

export const TEAM_NAME_MAP = {
  "chiefs":"NFL","eagles":"NFL","cowboys":"NFL","patriots":"NFL","bills":"NFL","49ers":"NFL","niners":"NFL","ravens":"NFL","dolphins":"NFL","jets":"NFL","steelers":"NFL","bengals":"NFL","browns":"NFL","texans":"NFL","colts":"NFL","jaguars":"NFL","titans":"NFL","broncos":"NFL","raiders":"NFL","chargers":"NFL","seahawks":"NFL","rams":"NFL","cardinals":"NFL","packers":"NFL","lions":"NFL","vikings":"NFL","bears":"NFL","saints":"NFL","falcons":"NFL","buccaneers":"NFL","bucs":"NFL","commanders":"NFL","lakers":"NBA","celtics":"NBA","warriors":"NBA","heat":"NBA","bucks":"NBA","nuggets":"NBA","suns":"NBA","clippers":"NBA","knicks":"NBA","nets":"NBA","bulls":"NBA","spurs":"NBA","mavericks":"NBA","mavs":"NBA","76ers":"NBA","sixers":"NBA","raptors":"NBA","thunder":"NBA","okc":"NBA","pelicans":"NBA","hawks":"NBA","jazz":"NBA","timberwolves":"NBA","wolves":"NBA","grizzlies":"NBA","kings":"NBA","cavaliers":"NBA","cavs":"NBA","magic":"NBA","rockets":"NBA","blazers":"NBA","hornets":"NBA","pistons":"NBA","pacers":"NBA","wizards":"NBA","yankees":"MLB","red sox":"MLB","dodgers":"MLB","astros":"MLB","braves":"MLB","mets":"MLB","cubs":"MLB","white sox":"MLB","phillies":"MLB","padres":"MLB","mariners":"MLB","rays":"MLB","guardians":"MLB","twins":"MLB","bruins":"NHL","maple leafs":"NHL","leafs":"NHL","blackhawks":"NHL","penguins":"NHL","capitals":"NHL","caps":"NHL","lightning":"NHL","oilers":"NHL","flames":"NHL","canucks":"NHL","avalanche":"NHL","avs":"NHL","golden knights":"NHL","vgk":"NHL","kraken":"NHL"
};
