/**
 * Patch sportsIntentDB.js:
 * 1. Add MULTI_LEAGUE_KEYWORDS + MULTI_LEAGUE_ACTIVE
 * 2. Add BROADCAST_KEYWORDS
 * 3. Update detectSportsIntent for multi_league intent
 * 4. Add more player name shortcuts
 */
const fs = require('fs');
const file = 'c:\\Users\\hyper\\workspace\\Alti.Assistant\\Alti.Assistant.Backend\\src\\app\\helpers\\sportsIntentDB.js';
let content = fs.readFileSync(file, 'utf8');

let applied = 0;

// ─── 1. Add MULTI_LEAGUE_KEYWORDS after ALT_LINE_KEYWORDS closing ──────────────
const altLineEnd = `  'different number', 'move the line', 'adjusted line',\n];`;
const multiLeagueBlock = `  'different number', 'move the line', 'adjusted line',\n];\n\n// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n// MULTI-LEAGUE KEYWORDS\n// Triggers multi-league query across all active sports tonight\n// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nexport const MULTI_LEAGUE_KEYWORDS = [\n  'all sports', 'all games', 'all leagues', 'all games tonight', 'every game',\n  'every sport', 'all tonight', 'sports tonight', 'games today', 'all today',\n  'every league', 'multi sport', 'multi-sport', 'sports on today',\n  'whats on tonight', \"what's on tonight\", 'all nfl nba mlb', 'all major sports',\n];\n\n// Active leagues for multi-league all-sports queries\nexport const MULTI_LEAGUE_ACTIVE = ['NFL', 'NBA', 'MLB', 'NHL', 'UFC'];\n\n// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n// BROADCAST / TV CHANNEL KEYWORDS\n// User wants to know where to watch the game\n// \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nexport const BROADCAST_KEYWORDS = [\n  'on tv', 'where to watch', 'what channel', 'tv channel', 'broadcast',\n  'watch live', 'watch tonight', 'watch today', 'streaming',\n  'espn', 'nbc sports', 'fox sports', 'tnt', 'tbs', 'abc sports',\n  'peacock', 'amazon prime sports', 'apple tv plus', 'dazn', 'paramount plus',\n];\n`;

if (content.includes(altLineEnd)) {
  content = content.replace(altLineEnd, multiLeagueBlock);
  applied++;
  console.log('✅ 1. MULTI_LEAGUE_KEYWORDS + BROADCAST_KEYWORDS added');
} else {
  console.warn('⚠️ 1. Could not find ALT_LINE_KEYWORDS end marker');
}

// ─── 2. Add multi_league to intent type comment block ─────────────────────────
const oldComment = "//   'odds'         — standard moneyline + spread + total";
const newComment = "//   'odds'         — standard moneyline + spread + total\n//   'multi_league' — all games tonight / all sports query";
content = content.replace(oldComment, newComment);
applied++;
console.log('✅ 2. Comment updated with multi_league type');

// ─── 3. Update detectSportsIntent to check multi_league before null guard ──────
const oldNullGuard = `  // Player name detection \u2014 covers "Mahomes prop", "LeBron points tonight"
  const detectedPlayerName =
    Object.keys(PLAYER_NAME_MAP).find((name) => q.includes(name)) || null;

  if (
    !hasBettingKeyword && !hasGameKeyword && !hasPropStat &&
    !hasGameProp && !hasFuturesKw && !hasSGP && !hasPredMkt && !detectedPlayerName
  ) return null;`;

const newNullGuard = `  // Player name detection \u2014 covers "Mahomes prop", "LeBron points tonight"
  const detectedPlayerName =
    Object.keys(PLAYER_NAME_MAP).find((name) => q.includes(name)) || null;

  // Multi-league detection \u2014 "all games tonight", "all sports", "games today"
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
  ) return null;`;

if (content.includes(oldNullGuard)) {
  content = content.replace(oldNullGuard, newNullGuard);
  applied++;
  console.log('✅ 3. multi_league detection added to detectSportsIntent');
} else {
  console.warn('⚠️ 3. Could not find null guard block to update');
}

// ─── 4. Add additional player name shortcuts ───────────────────────────────────
const shortcutTarget = `  'kelce': 'NFL',`;
const shortcutReplacement = `  'kelce': 'NFL',
  'hurts': 'NFL', 'allen': 'NFL', 'burrow': 'NFL', 'henry': 'NFL',
  'barkley': 'NFL', 'mccaffrey': 'NFL', 'purdy': 'NFL', 'lamb': 'NFL',`;

if (content.includes(shortcutTarget)) {
  content = content.replace(shortcutTarget, shortcutReplacement);
  applied++;
  console.log('✅ 4. NFL player shortcuts added');
} else {
  console.warn('⚠️ 4. Could not find kelce shortcut insertion point');
}

const nhlShortcutTarget = `  'alexander ovechkin': 'NHL', 'ovi': 'NHL', 'ovechkin': 'NHL',`;
const nhlShortcutReplacement = `  'alexander ovechkin': 'NHL', 'ovi': 'NHL', 'ovechkin': 'NHL',
  'fox': 'NHL', 'shesterkin': 'NHL', 'josi': 'NHL', 'draisaitl': 'NHL',`;

if (content.includes(nhlShortcutTarget)) {
  content = content.replace(nhlShortcutTarget, nhlShortcutReplacement);
  applied++;
  console.log('✅ 4b. NHL player shortcuts added');
} else {
  console.warn('⚠️ 4b. Could not find NHL shortcut insertion point');
}

// Add more cross-sport shortcuts before the closing };  of PLAYER_NAME_MAP
const mapEnd = `  'coco gauff': 'TENNIS', 'gauff': 'TENNIS',\n  'elena rybakina': 'TENNIS', 'rybakina': 'TENNIS',\n};`;
const mapEndExpanded = `  'coco gauff': 'TENNIS', 'gauff': 'TENNIS',\n  'elena rybakina': 'TENNIS', 'rybakina': 'TENNIS',\n  // Golf shortcuts\n  'scheffler': 'GOLF', 'mcilroy': 'GOLF', 'morikawa': 'GOLF',\n  'schauffele': 'GOLF', 'hovland': 'GOLF',\n  // NBA shortcuts\n  'haliburton': 'NBA', 'booker': 'NBA', 'lillard': 'NBA',\n  'brunson': 'NBA', 'maxey': 'NBA', 'towns': 'NBA',\n  // MLB shortcuts\n  'strider': 'MLB', 'glasnow': 'MLB', 'skenes': 'MLB', 'cole': 'MLB',\n  'freeman': 'MLB', 'betts': 'MLB', 'alvarez': 'MLB', 'soto': 'MLB',\n};`;

if (content.includes(mapEnd)) {
  content = content.replace(mapEnd, mapEndExpanded);
  applied++;
  console.log('✅ 4c. Cross-sport player shortcuts added');
} else {
  console.warn('⚠️ 4c. Could not find PLAYER_NAME_MAP end to expand');
}

fs.writeFileSync(file, content, 'utf8');
console.log(`\nApplied ${applied}/6 patches. Final file size: ${content.length} bytes`);
