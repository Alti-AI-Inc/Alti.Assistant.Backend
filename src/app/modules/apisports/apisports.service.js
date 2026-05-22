/**
 * apisports.service.js — API-Sports.io Service Layer v14
 *
 * REST client for API-Sports.io APIs.
 * Supports ALL sports dynamically via their specific hosts:
 *   - Football/Soccer:   v3.football.api-sports.io
 *   - Basketball (NBA):  v1.basketball.api-sports.io
 *   - Baseball (MLB):    v1.baseball.api-sports.io
 *   - Hockey (NHL):      v1.hockey.api-sports.io
 *   - American Football: v1.american-football.api-sports.io
 *   - Rugby:             v1.rugby.api-sports.io
 *   - Cricket:           v1.cricket.api-sports.io
 *   - Volleyball:        v1.volleyball.api-sports.io
 *   - Handball:          v1.handball.api-sports.io
 *   - Formula 1:         v1.formula-1.api-sports.io
 *   - MMA (UFC):         v1.mma.api-sports.io
 *   - AFL:               v1.afl.api-sports.io
 *
 * Authentication: x-apisports-key header (via APISPORTS_API_KEY env variable)
 *
 * Out-of-the-box support for live scores, box scores/game statistics, standings,
 * head-to-head history, and team statistics. Includes a premium high-fidelity
 * mock engine that activates automatically when the API key is absent.
 */

import dotenv from 'dotenv';
import { logger } from '../../../shared/logger.js';

dotenv.config();

const getApiKey = () =>
  (process.env.APISPORTS_API_KEY || '').replace(/^\uFEFF+/, '').trim();

// ─── Sport Hosts ─────────────────────────────────────────────────────────────
const SPORT_HOSTS = {
  'football': 'v3.football.api-sports.io',
  'soccer': 'v3.football.api-sports.io',
  'basketball': 'v1.basketball.api-sports.io',
  'baseball': 'v1.baseball.api-sports.io',
  'hockey': 'v1.hockey.api-sports.io',
  'american-football': 'v1.american-football.api-sports.io',
  'rugby': 'v1.rugby.api-sports.io',
  'cricket': 'v1.cricket.api-sports.io',
  'volleyball': 'v1.volleyball.api-sports.io',
  'handball': 'v1.handball.api-sports.io',
  'formula-1': 'v1.formula-1.api-sports.io',
  'mma': 'v1.mma.api-sports.io',
  'afl': 'v1.afl.api-sports.io'
};

// Map standardized league codes to API-Sports identifiers
export const LEAGUE_MAP = {
  'NFL': { sport: 'american-football', leagueId: 1 },
  'NBA': { sport: 'basketball', leagueId: 12 },
  'MLB': { sport: 'baseball', leagueId: 1 },
  'NHL': { sport: 'hockey', leagueId: 57 },
  'EPL': { sport: 'football', leagueId: 39 },
  'MLS': { sport: 'football', leagueId: 253 },
  'SERA': { sport: 'football', leagueId: 135 },
  'LIGA': { sport: 'football', leagueId: 140 },
  'LIG1': { sport: 'football', leagueId: 61 },
  'BUND': { sport: 'football', leagueId: 78 },
  'UCL': { sport: 'football', leagueId: 2 },
  'F1': { sport: 'formula-1', leagueId: 1 },
  'UFC': { sport: 'mma', leagueId: 1 },
  'IPL': { sport: 'cricket', leagueId: 3 },
  'RWC': { sport: 'rugby', leagueId: 1 },
  'AFL': { sport: 'afl', leagueId: 1 },
  'VNL': { sport: 'volleyball', leagueId: 1 },
  'EHF': { sport: 'handball', leagueId: 1 }
};

// ─── Core HTTP Fetcher ────────────────────────────────────────────────────────
async function apisportsFetch(sport, path, params = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    logger.warn(`[API-Sports] APISPORTS_API_KEY not set. Using Mock Engine for ${sport}.`);
    return null;
  }

  const host = SPORT_HOSTS[sport.toLowerCase()] || SPORT_HOSTS['football'];
  const url = new URL(`https://${host}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  }

  logger.info(`[API-Sports] GET https://${host}/${path} ${url.searchParams.toString()}`);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'x-apisports-key': apiKey,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`API-Sports API ${response.status}: ${text.slice(0, 200)}`);
    }

    const json = await response.json();
    if (json.errors && Object.keys(json.errors).length > 0) {
      const errStr = JSON.stringify(json.errors);
      logger.error(`[API-Sports] API returned errors: ${errStr}`);
      throw new Error(`API-Sports API Error: ${errStr}`);
    }

    return json.response || [];
  } catch (err) {
    logger.error(`[API-Sports] Fetch failed: ${err.message}`);
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HIGH-FIDELITY MOCK ENGINE (Auto-fallback to guarantee 100% developer sandbox up-time)
// ═══════════════════════════════════════════════════════════════════════════════

const generateMockLiveScores = (sport, leagueId) => {
  const s = sport.toLowerCase();
  if (s === 'football' || s === 'soccer') {
    return [
      {
        fixture: { id: 39001, status: { long: 'Halftime', short: 'HT', elapsed: 45 } },
        league: { id: leagueId || 39, name: 'Premier League' },
        teams: {
          home: { id: 33, name: 'Manchester United', logo: 'https://media.api-sports.io/football/teams/33.png' },
          away: { id: 34, name: 'Newcastle', logo: 'https://media.api-sports.io/football/teams/34.png' }
        },
        goals: { home: 2, away: 1 },
        score: { halftime: { home: 2, away: 1 }, fulltime: { home: null, away: null } }
      },
      {
        fixture: { id: 39002, status: { long: 'Second Half', short: '2H', elapsed: 72 } },
        league: { id: leagueId || 39, name: 'Premier League' },
        teams: {
          home: { id: 50, name: 'Manchester City', logo: 'https://media.api-sports.io/football/teams/50.png' },
          away: { id: 49, name: 'Chelsea', logo: 'https://media.api-sports.io/football/teams/49.png' }
        },
        goals: { home: 3, away: 2 },
        score: { halftime: { home: 1, away: 2 }, fulltime: { home: null, away: null } }
      }
    ];
  } else if (s === 'basketball') {
    return [
      {
        id: 12001,
        status: { long: 'Quarter 3', short: 'Q3', elapsed: 8 },
        league: { id: leagueId || 12, name: 'NBA' },
        teams: {
          home: { id: 147, name: 'Los Angeles Lakers', logo: 'https://media.api-sports.io/basketball/teams/147.png' },
          away: { id: 148, name: 'Boston Celtics', logo: 'https://media.api-sports.io/basketball/teams/148.png' }
        },
        scores: { home: { total: 84 }, away: { total: 78 } }
      }
    ];
  } else if (s === 'american-football') {
    return [
      {
        id: 1001,
        status: { long: 'Quarter 4', short: 'Q4', elapsed: 12 },
        league: { id: leagueId || 1, name: 'NFL' },
        teams: {
          home: { id: 1, name: 'Kansas City Chiefs', logo: 'https://media.api-sports.io/american-football/teams/1.png' },
          away: { id: 2, name: 'Philadelphia Eagles', logo: 'https://media.api-sports.io/american-football/teams/2.png' }
        },
        scores: { home: { total: 27 }, away: { total: 24 } }
      }
    ];
  } else if (s === 'formula-1') {
    return [
      {
        id: 101,
        competition: { name: 'Formula 1 Grand Prix de Monaco' },
        circuit: { name: 'Circuit de Monaco' },
        status: 'Live',
        laps: { current: 45, total: 78 },
        results: [
          { position: 1, driver: { name: 'Max Verstappen' }, team: { name: 'Red Bull Racing' }, gap: 'Leader' },
          { position: 2, driver: { name: 'Charles Leclerc' }, team: { name: 'Ferrari' }, gap: '+2.415s' },
          { position: 3, driver: { name: 'Lando Norris' }, team: { name: 'McLaren' }, gap: '+5.812s' }
        ]
      }
    ];
  } else if (s === 'mma') {
    return [
      {
        id: 201,
        league: { name: 'UFC 300' },
        category: 'Light Heavyweight Title Fight',
        status: 'Round 3',
        fighters: {
          home: { name: 'Alex Pereira', logo: 'https://media.api-sports.io/mma/fighters/alex-pereira.png' },
          away: { name: 'Jamahal Hill', logo: 'https://media.api-sports.io/mma/fighters/jamahal-hill.png' }
        },
        scores: { home: { round1: 10, round2: 10 }, away: { round1: 9, round2: 9 } }
      }
    ];
  } else if (s === 'cricket') {
    return [
      {
        id: 301,
        league: { name: 'IPL' },
        status: 'In Progress (1st Innings)',
        teams: {
          home: { name: 'Mumbai Indians' },
          away: { name: 'Chennai Super Kings' }
        },
        scores: {
          home: { runs: 182, wickets: 4, overs: 18.2 },
          away: { runs: 0, wickets: 0, overs: 0 }
        }
      }
    ];
  } else if (s === 'rugby') {
    return [
      {
        id: 401,
        league: { name: 'Rugby World Cup' },
        status: 'Second Half',
        teams: {
          home: { name: 'New Zealand All Blacks' },
          away: { name: 'South Africa Springboks' }
        },
        scores: { home: { total: 18 }, away: { total: 15 } }
      }
    ];
  } else if (s === 'afl') {
    return [
      {
        id: 501,
        league: { name: 'AFL' },
        status: 'Q3',
        teams: {
          home: { name: 'Collingwood Magpies' },
          away: { name: 'Richmond Tigers' }
        },
        scores: { home: { total: 84 }, away: { total: 72 } }
      }
    ];
  } else if (s === 'volleyball') {
    return [
      {
        id: 601,
        league: { name: 'Volleyball Nations League' },
        status: 'Set 4',
        teams: {
          home: { name: 'Poland' },
          away: { name: 'Italy' }
        },
        scores: { home: { sets: 2, points: 18 }, away: { sets: 1, points: 20 } }
      }
    ];
  } else if (s === 'handball') {
    return [
      {
        id: 701,
        league: { name: 'EHF Champions League' },
        status: 'Second Half',
        teams: {
          home: { name: 'Barcelona' },
          away: { name: 'Kiel' }
        },
        scores: { home: { total: 24 }, away: { total: 22 } }
      }
    ];
  }
  
  // Generic fallback
  return [
    {
      id: 9999,
      status: { long: 'In Progress', short: 'IP', elapsed: 30 },
      league: { id: leagueId || 1, name: 'Sport' },
      teams: {
        home: { id: 101, name: 'Home Team' },
        away: { id: 102, name: 'Away Team' }
      },
      scores: { home: { total: 2 }, away: { total: 1 } }
    }
  ];
};

const generateMockStandings = (sport, leagueId, season) => {
  const s = sport.toLowerCase();
  if (s === 'formula-1') {
    return [
      { rank: 1, driver: { name: 'Max Verstappen' }, team: { name: 'Red Bull Racing' }, points: 110, wins: 4 },
      { rank: 2, driver: { name: 'Charles Leclerc' }, team: { name: 'Ferrari' }, points: 86, wins: 1 },
      { rank: 3, driver: { name: 'Sergio Perez' }, team: { name: 'Red Bull Racing' }, points: 74, wins: 0 },
      { rank: 4, driver: { name: 'Lando Norris' }, team: { name: 'McLaren' }, points: 68, wins: 0 }
    ];
  } else if (s === 'mma') {
    return [
      { rank: 1, fighter: { name: 'Jon Jones' }, division: 'Heavyweight', record: '27-1-0', points: 100 },
      { rank: 2, fighter: { name: 'Alex Pereira' }, division: 'Light Heavyweight', record: '10-2-0', points: 95 },
      { rank: 3, fighter: { name: 'Islam Makhachev' }, division: 'Lightweight', record: '25-1-0', points: 90 },
      { rank: 4, fighter: { name: 'Leon Edwards' }, division: 'Welterweight', record: '22-3-0', points: 85 }
    ];
  } else if (s === 'cricket') {
    return [
      { rank: 1, team: { name: 'Rajasthan Royals' }, points: 16, played: 10, win: 8, lose: 2, netRunRate: '+0.622' },
      { rank: 2, team: { name: 'Kolkata Knight Riders' }, points: 14, played: 10, win: 7, lose: 3, netRunRate: '+1.098' },
      { rank: 3, team: { name: 'Sunrisers Hyderabad' }, points: 12, played: 10, win: 6, lose: 4, netRunRate: '+0.072' },
      { rank: 4, team: { name: 'Chennai Super Kings' }, points: 10, played: 10, win: 5, lose: 5, netRunRate: '+0.700' }
    ];
  } else if (s === 'rugby' || s === 'afl' || s === 'volleyball' || s === 'handball') {
    return [
      { rank: 1, team: { name: 'Team A' }, points: 32, played: 12, win: 10, lose: 2, goalsDiff: 85 },
      { rank: 2, team: { name: 'Team B' }, points: 28, played: 12, win: 9, lose: 3, goalsDiff: 42 },
      { rank: 3, team: { name: 'Team C' }, points: 22, played: 12, win: 7, lose: 5, goalsDiff: 12 },
      { rank: 4, team: { name: 'Team D' }, points: 16, played: 12, win: 5, lose: 7, goalsDiff: -24 }
    ];
  }

  // Default football-grade standings fallback
  return [
    {
      rank: 1,
      team: { id: 33, name: 'Manchester United', logo: 'https://media.api-sports.io/football/teams/33.png' },
      points: 78,
      goalsDiff: 32,
      form: 'WWDLW',
      all: { played: 34, win: 24, draw: 6, lose: 4, goals: { for: 70, against: 38 } }
    },
    {
      rank: 2,
      team: { id: 50, name: 'Manchester City', logo: 'https://media.api-sports.io/football/teams/50.png' },
      points: 75,
      goalsDiff: 40,
      form: 'WDLWW',
      all: { played: 34, win: 23, draw: 6, lose: 5, goals: { for: 82, against: 42 } }
    },
    {
      rank: 3,
      team: { id: 49, name: 'Chelsea', logo: 'https://media.api-sports.io/football/teams/49.png' },
      points: 68,
      goalsDiff: 18,
      form: 'LWWDD',
      all: { played: 34, win: 20, draw: 8, lose: 6, goals: { for: 62, against: 44 } }
    },
    {
      rank: 4,
      team: { id: 40, name: 'Liverpool', logo: 'https://media.api-sports.io/football/teams/40.png' },
      points: 65,
      goalsDiff: 15,
      form: 'WWDDL',
      all: { played: 34, win: 19, draw: 8, lose: 7, goals: { for: 58, against: 43 } }
    }
  ];
};

const generateMockFixtureStats = (sport, fixtureId) => {
  const s = sport.toLowerCase();
  if (s === 'formula-1') {
    return [
      {
        driver: { name: 'Max Verstappen' },
        statistics: [
          { type: 'Fastest Lap', value: '1:14.232' },
          { type: 'Grid Position', value: 1 },
          { type: 'Pit Stops', value: 2 },
          { type: 'Tires Used', value: 'Medium, Hard, Soft' }
        ]
      },
      {
        driver: { name: 'Charles Leclerc' },
        statistics: [
          { type: 'Fastest Lap', value: '1:14.415' },
          { type: 'Grid Position', value: 2 },
          { type: 'Pit Stops', value: 2 },
          { type: 'Tires Used', value: 'Medium, Hard' }
        ]
      }
    ];
  } else if (s === 'mma') {
    return [
      {
        team: { id: 1, name: 'Alex Pereira' },
        statistics: [
          { type: 'Significant Strikes', value: '42/68 (61%)' },
          { type: 'Takedowns', value: '0/1 (0%)' },
          { type: 'Control Time', value: '0:12' },
          { type: 'Knockdowns', value: 1 }
        ]
      },
      {
        team: { id: 2, name: 'Jamahal Hill' },
        statistics: [
          { type: 'Significant Strikes', value: '24/54 (44%)' },
          { type: 'Takedowns', value: '0/0 (0%)' },
          { type: 'Control Time', value: '0:00' },
          { type: 'Knockdowns', value: 0 }
        ]
      }
    ];
  } else if (s === 'cricket') {
    return [
      {
        team: { id: 1, name: 'Mumbai Indians' },
        statistics: [
          { type: 'Total Runs', value: 182 },
          { type: 'Wickets Lost', value: 4 },
          { type: 'Overs Bowled', value: 18.2 },
          { type: 'Run Rate', value: 9.93 },
          { type: 'Sixes Hit', value: 12 },
          { type: 'Fours Hit', value: 14 }
        ]
      },
      {
        team: { id: 2, name: 'Chennai Super Kings' },
        statistics: [
          { type: 'Total Runs', value: 178 },
          { type: 'Wickets Lost', value: 8 },
          { type: 'Overs Bowled', value: 20 },
          { type: 'Run Rate', value: 8.90 },
          { type: 'Sixes Hit', value: 8 },
          { type: 'Fours Hit', value: 10 }
        ]
      }
    ];
  }

  return [
    {
      team: { id: 33, name: 'Manchester United' },
      statistics: [
        { type: 'Shots on Goal', value: 8 },
        { type: 'Shots off Goal', value: 4 },
        { type: 'Total Shots', value: 12 },
        { type: 'Fouls', value: 11 },
        { type: 'Corner Kicks', value: 6 },
        { type: 'Offsides', value: 2 },
        { type: 'Ball Possession', value: '54%' },
        { type: 'Yellow Cards', value: 2 },
        { type: 'Red Cards', value: 0 },
        { type: 'Goalkeeper Saves', value: 3 }
      ]
    },
    {
      team: { id: 34, name: 'Newcastle' },
      statistics: [
        { type: 'Shots on Goal', value: 4 },
        { type: 'Shots off Goal', value: 5 },
        { type: 'Total Shots', value: 9 },
        { type: 'Fouls', value: 14 },
        { type: 'Corner Kicks', value: 4 },
        { type: 'Offsides', value: 1 },
        { type: 'Ball Possession', value: '46%' },
        { type: 'Yellow Cards', value: 3 },
        { type: 'Red Cards', value: 0 },
        { type: 'Goalkeeper Saves', value: 6 }
      ]
    }
  ];
};

const generateMockHeadToHead = (sport, teamAId, teamBId) => {
  const s = sport.toLowerCase();
  if (s === 'formula-1') {
    return {
      summary: { teamAWin: 8, teamBWin: 4, draws: 0, total: 12 },
      fixtures: [
        {
          id: 5001,
          date: '2025-05-18T14:00:00Z',
          teams: {
            home: { name: 'Max Verstappen' },
            away: { name: 'Charles Leclerc' }
          },
          score: { home: 1, away: 2 }
        }
      ]
    };
  }
  return {
    summary: { teamAWin: 12, teamBWin: 8, draws: 5, total: 25 },
    fixtures: [
      {
        id: 5001,
        date: '2025-12-15T20:00:00Z',
        teams: {
          home: { id: 33, name: 'Manchester United' },
          away: { id: 34, name: 'Newcastle' }
        },
        score: { home: 3, away: 1 }
      },
      {
        id: 5002,
        date: '2025-09-20T15:00:00Z',
        teams: {
          home: { id: 34, name: 'Newcastle' },
          away: { id: 33, name: 'Manchester United' }
        },
        score: { home: 2, away: 2 }
      },
      {
        id: 5003,
        date: '2025-04-10T19:45:00Z',
        teams: {
          home: { id: 33, name: 'Manchester United' },
          away: { id: 34, name: 'Newcastle' }
        },
        score: { home: 1, away: 0 }
      }
    ]
  };
};

const generateMockTeamStats = (sport, teamId, leagueId, season) => {
  return {
    form: 'WDLWW',
    fixtures: { played: 34, wins: 24, draws: 6, loses: 4 },
    goals: {
      for: { total: 70, average: 2.06 },
      against: { total: 38, average: 1.12 }
    },
    clean_sheets: 12,
    failed_to_score: 3,
    penalty: {
      scored: { total: 5, percentage: '100%' },
      missed: { total: 0, percentage: '0%' }
    }
  };
};

// ─── Exposed API Services ───────────────────────────────────────────────────

/**
 * Fetch live scores for a sport, optionally filtered by league.
 */
export const getLiveScores = async (sport, leagueId = null) => {
  logger.info(`[API-Sports] Fetching Live Scores for sport=${sport}, league=${leagueId || 'all'}`);
  const apiKey = getApiKey();
  if (!apiKey) {
    return generateMockLiveScores(sport, leagueId);
  }

  const s = sport.toLowerCase();
  let endpoint = 'games';
  let params = { live: leagueId ? String(leagueId) : 'all' };

  if (s === 'football' || s === 'soccer') {
    endpoint = 'fixtures';
  } else if (s === 'formula-1') {
    endpoint = 'races';
    params = { next: '5' };
  } else if (s === 'mma') {
    endpoint = 'fights';
    params = {};
  }
  
  return apisportsFetch(sport, endpoint, params);
};

/**
 * Fetch current season standings for a league.
 */
export const getStandings = async (sport, leagueId, season = new Date().getFullYear()) => {
  logger.info(`[API-Sports] Fetching Standings for sport=${sport}, league=${leagueId}, season=${season}`);
  const apiKey = getApiKey();
  if (!apiKey) {
    return generateMockStandings(sport, leagueId, season);
  }

  const s = sport.toLowerCase();
  let endpoint = 'standings';
  let params = { league: String(leagueId), season: String(season) };

  if (s === 'formula-1') {
    endpoint = 'rankings/drivers';
    params = { season: String(season) };
  } else if (s === 'mma') {
    endpoint = 'rankings';
    params = {};
  }

  const res = await apisportsFetch(sport, endpoint, params);
  
  if (s === 'football' || s === 'soccer') {
    if (res && res[0] && res[0].league && res[0].league.standings) {
      return res[0].league.standings[0] || [];
    }
  }
  return res || [];
};

/**
 * Fetch detailed match statistics (box score).
 */
export const getFixtureStats = async (sport, fixtureId) => {
  logger.info(`[API-Sports] Fetching Fixture Stats for sport=${sport}, fixtureId=${fixtureId}`);
  const apiKey = getApiKey();
  if (!apiKey) {
    return generateMockFixtureStats(sport, fixtureId);
  }

  const s = sport.toLowerCase();
  let endpoint = 'games/statistics';
  let params = { id: String(fixtureId) };

  if (s === 'football' || s === 'soccer') {
    endpoint = 'fixtures/statistics';
    params = { fixture: String(fixtureId) };
  } else if (s === 'formula-1') {
    endpoint = 'races';
    params = { id: String(fixtureId) };
  } else if (s === 'mma') {
    endpoint = 'fights';
    params = { id: String(fixtureId) };
  }

  return apisportsFetch(sport, endpoint, params);
};

/**
 * Fetch head-to-head historical matchups between two teams.
 */
export const getHeadToHead = async (sport, teamAId, teamBId) => {
  logger.info(`[API-Sports] Fetching H2H History for sport=${sport}, teamA=${teamAId}, teamB=${teamBId}`);
  const apiKey = getApiKey();
  if (!apiKey) {
    return generateMockHeadToHead(sport, teamAId, teamBId);
  }

  const s = sport.toLowerCase();
  let endpoint = 'games/headtohead';
  let params = { h2h: `${teamAId}-${teamBId}` };

  if (s === 'football' || s === 'soccer') {
    endpoint = 'fixtures/headtohead';
  } else if (s === 'formula-1') {
    endpoint = 'rankings/drivers';
    params = { season: new Date().getFullYear().toString() };
  } else if (s === 'mma') {
    endpoint = 'fights';
  }

  const fixtures = await apisportsFetch(sport, endpoint, params);
  
  // Calculate summary counts
  let teamAWin = 0, teamBWin = 0, draws = 0;
  if (Array.isArray(fixtures)) {
    fixtures.forEach(f => {
      const homeId = f.teams?.home?.id;
      const awayId = f.teams?.away?.id;
      const homeScore = f.goals?.home ?? f.scores?.home?.total;
      const awayScore = f.goals?.away ?? f.scores?.away?.total;
      
      if (homeScore !== undefined && awayScore !== undefined) {
        if (homeScore === awayScore) {
          draws++;
        } else if (homeScore > awayScore) {
          if (homeId === teamAId) teamAWin++;
          else teamBWin++;
        } else {
          if (awayId === teamAId) teamAWin++;
          else teamBWin++;
        }
      }
    });
  }

  return {
    summary: { teamAWin, teamBWin, draws, total: fixtures ? fixtures.length : 0 },
    fixtures: fixtures || []
  };
};

/**
 * Fetch overall statistics of a team in a specific league and season.
 */
export const getTeamStats = async (sport, teamId, leagueId, season = new Date().getFullYear()) => {
  logger.info(`[API-Sports] Fetching Team Stats for sport=${sport}, team=${teamId}, league=${leagueId}, season=${season}`);
  const apiKey = getApiKey();
  if (!apiKey) {
    return generateMockTeamStats(sport, teamId, leagueId, season);
  }

  const params = { team: String(teamId), league: String(leagueId), season: String(season) };
  return apisportsFetch(sport, 'teams/statistics', params);
};
