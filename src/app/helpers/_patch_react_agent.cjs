/**
 * Patch reactAgent.js:
 * 1. Expand sports tool description with v4 capabilities
 * 2. Add multi-league, playerName filtering, DFS props, SGP auto-pricing, deeplinks
 */
const fs = require('fs');
const file = 'c:\\Users\\hyper\\workspace\\Alti.Assistant\\Alti.Assistant.Backend\\src\\app\\modules\\search\\services\\reactAgent.js';
let content = fs.readFileSync(file, 'utf8');

if (content.includes('REACT_AGENT_V4_SPORTS')) {
  console.log('Already patched — skipping');
  process.exit(0);
}

const oldDesc = `    description: \`Real-time sports betting odds, lines, and statistics from PredictionData.io. Use this tool for ANY query about:
- Current betting odds (moneyline, spread, point spread, over/under, totals) for any sport
- Player props: passing yards, rushing yards, receiving yards, touchdowns, receptions, strikeouts, home runs, points, rebounds, assists, goals, saves, shots, blocks, steals, etc.
- Game props: team to score first, both teams to score (BTTS), UFC fight outcome, method of victory, fight distance, etc.
- Futures odds: Super Bowl winner, NBA champion, Stanley Cup, World Series, MVP awards, Heisman Trophy, etc.
- Same Game Parlay (SGP) pricing from DraftKings, FanDuel, BetMGM, BetRivers
- Live in-game / in-progress game odds (live lines, live moneyline, live spread)
- First half / 1st quarter / 1st period / first 5 innings odds (period betting)
- Alternate lines (alternate spreads, alternate totals, alt lines)
- Polymarket / Kalshi prediction market odds and orderbook depth
- Line movement, steam moves, line changes (move_dir up/down indicators)
- Implied probability from current odds
- Game schedules, live scores, current period/clock, injury status
- All leagues: NFL, NBA, MLB, NHL, NCAA Football, NCAA Basketball, UFC, MLS, EPL, Serie A, La Liga, Bundesliga, Ligue 1, Champions League, Golf, Tennis
- All sportsbooks: FanDuel, DraftKings, Caesars, BetMGM, Pinnacle, ESPN Bet, BetRivers, bet365, Betway, Bovada, Fanatics, LowVig, Novig
Input: A natural language query about sports betting (e.g. "What is the Chiefs spread tonight?", "Show me NBA player props for LeBron", "What are the Super Bowl futures odds?", "Give me Patrick Mahomes passing yards prop")\``;

const newDesc = `    // REACT_AGENT_V4_SPORTS
    description: \`Real-time sports betting odds, lines, player props, and statistics from PredictionData.io. Use this tool for ANY query involving:

**ODDS & LINES**
- Moneyline, spread (point spread), over/under (totals), alternate lines, live in-game lines
- All periods: first half, 1st quarter/period, first 5 innings, etc.
- Line movement (up/down arrows), implied probability, fair value (no-vig odds)
- Opening line vs current line comparisons

**PLAYER PROPS** (by player name — auto-detected)
- NFL: passing yards, rushing yards, receiving yards, touchdowns, receptions, completions, interceptions, sacks, tackles
- NBA: points, rebounds, assists, 3-pointers, blocks, steals, double-double, triple-double
- MLB: strikeouts, hits, home runs, RBIs, total bases, earned runs, pitcher outs
- NHL: goals, assists, shots on goal, saves, points, blocked shots, powerplay points
- UFC: method of victory, fight distance, round betting, significant strikes, takedowns
- Golf: outright winner, top 5/10/20, make cut, head-to-head matchups, round score
- Tennis: match winner, total games/sets, correct score, aces, double faults
- DFS platforms: PrizePicks, Underdog Fantasy, Sleeper lines (alongside sportsbooks)
- Specific player queries: "Mahomes passing yards", "LeBron points tonight", "Jokic rebounds" — auto-resolved to correct league

**FUTURES & CHAMPIONSHIPS**
- Super Bowl winner, NBA champion, Stanley Cup, World Series, Champions League
- MVP, DPOY, Heisman Trophy, Cy Young, Calder Trophy, Hart Trophy
- Season win totals, make playoffs, conference/division winner
- Auto-filtered: "Who wins the Super Bowl?" returns ONLY Super Bowl Winner market

**SAME GAME PARLAY (SGP) — AUTO-PRICED**
- Provide 2+ legs from the same game and this tool calls the live SGP pricing API
- Example: "Price SGP: Chiefs ML + Mahomes over 280.5 yds + Kelce over 6.5 rec"
- Returns real combined odds from DraftKings, FanDuel, BetMGM, BetRivers
- Includes per-book deeplink URLs to place the bet directly

**PREDICTION MARKETS**
- Polymarket and Kalshi orderbook: bid/ask depth, best price, total volume
- Event contracts for political, sports, and financial events

**MULTI-SPORT / ALL GAMES**
- "All games tonight", "All sports today", "Every game right now" → fetches all major leagues simultaneously
- Covers NFL, NBA, MLB, NHL, UFC in a single response

**LIVE SCORES**
- Real-time game scores, current period/quarter/inning, game clock
- Live fixture status (in_progress, final, scheduled)

**ALL SUPPORTED LEAGUES**
NFL • NBA • MLB • NHL • UFC • MLS • EPL • Serie A • La Liga • Bundesliga • Ligue 1 • Champions League • NCAA Football • NCAA Basketball • Golf (PGA/LIV) • Tennis (ATP/WTA)

**ALL SUPPORTED SPORTSBOOKS**
FanDuel (100) • DraftKings (200) • Caesars (300) • BetMGM (400) • Pinnacle (250) • ESPN Bet (700) • bet365 (365) • BetRivers/Kambi (500) • Betway (555) • Bovada (643) • Fanatics (722) • LowVig (617) • Novig (192) • Circa (150) • Sporttrade (448) • PrizePicks (385) • Underdog Fantasy (387) • Sleeper (595)

Input: Any natural language sports betting query. Examples:
- "What is the Chiefs spread tonight?"
- "Show me all NBA player props for Nikola Jokic"  
- "What are the Super Bowl futures odds?"
- "Price an SGP: Bills ML + Josh Allen over 275 passing yards + Stefon Diggs over 5.5 receptions"
- "Show me all games tonight across all sports"
- "What are the Polymarket odds on the NBA Finals?"
- "Give me Golf outright winner odds at The Masters"\``;

content = content.replace(oldDesc, newDesc);
fs.writeFileSync(file, content, 'utf8');
console.log('SUCCESS: reactAgent.js sports tool description updated to v4');
console.log('New file size:', content.length, 'bytes');
