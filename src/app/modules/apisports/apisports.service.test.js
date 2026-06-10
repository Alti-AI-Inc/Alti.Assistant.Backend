import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as dotenv from 'dotenv';
import { logger } from '../../../shared/logger.js';

// Import the functions to be tested
import {
  LEAGUE_MAP,
  getLiveScores,
  getStandings,
  getFixtureStats,
  getHeadToHead,
  getTeamStats
} from './apisports.service.js';

// Mock dotenv.config() to prevent actual .env loading during tests
vi.mock('dotenv', () => ({
  config: vi.fn(),
}));

// Mock logger to prevent console output during tests and to spy on calls
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('apisports.service', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Clear process.env.APISPORTS_API_KEY for consistent testing
    delete process.env.APISPORTS_API_KEY;
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.APISPORTS_API_KEY;
  });

  // --- Test LEAGUE_MAP ---
  it('LEAGUE_MAP should be correctly defined and exported', () => {
    expect(LEAGUE_MAP).toBeDefined();
    expect(LEAGUE_MAP.NFL).toEqual({ sport: 'american-football', leagueId: 1 });
    expect(LEAGUE_MAP.NBA).toEqual({ sport: 'basketball', leagueId: 12 });
    expect(LEAGUE_MAP.EPL).toEqual({ sport: 'football', leagueId: 39 });
    expect(LEAGUE_MAP.F1).toEqual({ sport: 'formula-1', leagueId: 1 });
    expect(Object.keys(LEAGUE_MAP).length).toBeGreaterThan(5); // Check for a reasonable number of entries
  });

  // --- Test getApiKey behavior (indirectly via apisportsFetch's usage) ---
  describe('getApiKey behavior', () => {
    it('should return an empty string if APISPORTS_API_KEY is not set, triggering mock engine', async () => {
      delete process.env.APISPORTS_API_KEY;
      // Call a public function that uses apisportsFetch
      const result = await getLiveScores('football');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('APISPORTS_API_KEY not set. Using Mock Engine for football.'));
      expect(result).toBeInstanceOf(Array); // Should return mock data
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should use the API key if APISPORTS_API_KEY is set', async () => {
      process.env.APISPORTS_API_KEY = 'test_api_key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: [] }),
      });
      await getLiveScores('football');
      expect(logger.warn).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-apisports-key': 'test_api_key',
          }),
        })
      );
    });

    it('should remove BOM and trim whitespace from API key', async () => {
      process.env.APISPORTS_API_KEY = '\uFEFF  test_api_key_with_bom_and_space  ';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: [] }),
      });
      await getLiveScores('football');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-apisports-key': 'test_api_key_with_bom_and_space',
          }),
        })
      );
    });
  });

  // --- Test apisportsFetch core logic (indirectly via public functions) ---
  describe('apisportsFetch core logic', () => {
    beforeEach(() => {
      process.env.APISPORTS_API_KEY = 'test_api_key'; // Ensure API key is present for these tests
    });

    it('should construct the correct URL and headers for football', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: [] }),
      });
      await getLiveScores('football', 39); // Calls apisportsFetch('football', 'fixtures', { live: '39' })
      expect(mockFetch).toHaveBeenCalledWith(
        'https://v3.football.api-sports.io/fixtures?live=39',
        expect.objectContaining({
          headers: {
            'x-apisports-key': 'test_api_key',
            'Accept': 'application/json',
          },
        })
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[API-Sports] GET https://v3.football.api-sports.io/fixtures live=39'));
    });

    it('should construct the correct URL and headers for basketball', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: [] }),
      });
      await getLiveScores('basketball', 12); // Calls apisportsFetch('basketball', 'games', { live: '12' })
      expect(mockFetch).toHaveBeenCalledWith(
        'https://v1.basketball.api-sports.io/games?live=12',
        expect.objectContaining({
          headers: {
            'x-apisports-key': 'test_api_key',
            'Accept': 'application/json',
          },
        })
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[API-Sports] GET https://v1.basketball.api-sports.io/games live=12'));
    });

    it('should handle query parameters correctly, filtering out undefined/null/empty strings', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: {} }),
      });
      // This will call apisportsFetch with params like { team: '1', league: '2', season: '2023' }
      await getTeamStats('football', 1, 2, 2023);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://v3.football.api-sports.io/teams/statistics?team=1&league=2&season=2023',
        expect.any(Object)
      );
    });

    it('should throw an error on non-ok HTTP response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      });
      await expect(getLiveScores('football')).rejects.toThrow('API-Sports API 404: Not Found');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('[API-Sports] Fetch failed: API-Sports API 404: Not Found'));
    });

    it('should throw an error if API response contains errors object', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ errors: { code: '400', message: 'Invalid parameter' }, response: [] }),
      });
      await expect(getLiveScores('football')).rejects.toThrow('API-Sports API Error: {"code":"400","message":"Invalid parameter"}');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('[API-Sports] API returned errors: {"code":"400","message":"Invalid parameter"}'));
    });

    it('should return json.response on successful fetch', async () => {
      const mockApiResponse = [{ id: 1, name: 'Fixture 1' }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: mockApiResponse }),
      });
      const result = await getLiveScores('football');
      expect(result).toEqual(mockApiResponse);
    });

    it('should return an empty array if json.response is missing but no errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}), // No 'response' key
      });
      const result = await getLiveScores('football');
      expect(result).toEqual([]);
    });

    it('should default to football host if sport is unknown', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: [] }),
      });
      await getLiveScores('unknown-sport'); // This will default to football host
      expect(mockFetch).toHaveBeenCalledWith(
        'https://v3.football.api-sports.io/games?live=all', // getLiveScores defaults to 'games' and 'live=all'
        expect.any(Object)
      );
    });
  });

  // --- Test getLiveScores ---
  describe('getLiveScores', () => {
    it('should use mock engine if API key is not set', async () => {
      delete process.env.APISPORTS_API_KEY;
      const scores = await getLiveScores('football');
      expect(scores).toBeInstanceOf(Array);
      expect(scores.length).toBeGreaterThan(0);
      expect(scores[0]).toHaveProperty('fixture');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('APISPORTS_API_KEY not set. Using Mock Engine for football.'));
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch live football scores from API when key is set', async () => {
      process.env.APISPORTS_API_KEY = 'test_key';
      const mockData = [{ fixture: { id: 100 } }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: mockData }),
      });
      const scores = await getLiveScores('football', 39);
      expect(scores).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://v3.football.api-sports.io/fixtures?live=39',
        expect.any(Object)
      );
    });

    it('should fetch live basketball scores from API when key is set', async () => {
      process.env.APISPORTS_API_KEY = 'test_key';
      const mockData = [{ game: { id: 200 } }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: mockData }),
      });
      const scores = await getLiveScores('basketball', 12);
      expect(scores).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://v1.basketball.api-sports.io/games?live=12',
        expect.any(Object)
      );
    });

    it('should fetch F1 races from API when key is set', async () => {
      process.env.APISPORTS_API_KEY = 'test_key';
      const mockData = [{ race: { id: 300 } }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: mockData }),
      });
      const scores = await getLiveScores('formula-1');
      expect(scores).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://v1.formula-1.api-sports.io/races?next=5',
        expect.any(Object)
      );
    });

    it('should fetch MMA fights from API when key is set', async () => {
      process.env.APISPORTS_API_KEY = 'test_key';
      const mockData = [{ fight: { id: 400 } }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: mockData }),
      });
      const scores = await getLiveScores('mma');
      expect(scores).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://v1.mma.api-sports.io/fights',
        expect.any(Object)
      );
    });
  });

  // --- Test getStandings ---
  describe('getStandings', () => {
    it('should use mock engine if API key is not set', async () => {
      delete process.env.APISPORTS_API_KEY;
      const standings = await getStandings('football', 39);
      expect(standings).toBeInstanceOf(Array);
      expect(standings.length).toBeGreaterThan(0);
      expect(standings[0]).toHaveProperty('team');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('APISPORTS_API_KEY not set. Using Mock Engine for football.'));
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch football standings from API and extract nested data', async () => {
      process.env.APISPORTS_API_KEY = 'test_key';
      const mockApiData = {
        response: [{
          league: {
            id: 39,
            name: 'Premier League',
            standings: [[{ rank: 1, team: { name: 'Man Utd' } }]]
          }
        }]
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiData),
      });
      const standings = await getStandings('football', 39, 2023);
      expect(standings).toEqual([{ rank: 1, team: { name: 'Man Utd' } }]);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://v3.football.api-sports.io/standings?league=39&season=2023',
        expect.any(Object)
      );
    });

    it('should fetch F1 driver rankings from API', async () => {
      process.env.APISPORTS_API_KEY = 'test_key';
      const mockApiData = {
        response: [{ rank: 1, driver: { name: 'Max Verstappen' } }]
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiData),
      });
      const standings = await getStandings('formula-1', 1, 2023);
      expect(standings).toEqual(mockApiData.response);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://v1.formula-1.api-sports.io/rankings/drivers?season=2023',
        expect.any(Object)
      );
    });

    it('should fetch MMA rankings from API', async () => {
      process.env.APISPORTS_API_KEY = 'test_key';
      const mockApiData = {
        response: [{ rank: 1, fighter: { name: 'Jon Jones' } }]
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiData),
      });
      const standings = await getStandings('mma', 1, 2023);
      expect(standings).toEqual(mockApiData.response);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://v1.mma.api-sports.io/rankings',
        expect.any(Object)
      );
    });

    it('should handle empty standings response from API', async () => {
      process.env.APISPORTS_API_KEY = 'test_key';
      const mockApiData = { response: [] };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiData),
      });
      const standings = await getStandings('football', 999, 2023);
      expect(standings).toEqual([]);
    });

    it('should default season to current year if not provided', async () => {
      process.env.APISPORTS_API_KEY = 'test_key';
      const currentYear = new Date().getFullYear();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: [{ league: { standings: [[]] } }] }),
      });
      await getStandings('football', 39);
      expect(mockFetch).toHaveBeenCalledWith(
        `https://v3.football.api-sports.io/standings?league=39&season=${currentYear}`,
        expect.any(Object)
      );
    });
  });

  // --- Test getFixtureStats ---
  describe('getFixtureStats', () => {
    it('should use mock engine if API key is not set', async () => {
      delete process.env.APISPORTS_API_KEY;
      const stats = await getFixtureStats('football', 123);
      expect(stats).toBeInstanceOf(Array);
      expect(stats.length).toBeGreaterThan(0);
      expect(stats[0]).toHaveProperty('team');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('APISPORTS_API_KEY not set. Using Mock Engine for football.'));
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch football fixture stats from API', async () => {
      process.env.APISPORTS_API_KEY = 'test_key';
      const mockData = [{ team: { id: 33 }, statistics: [{ type: 'Shots on Goal', value: 5 }] }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: mockData }),
      });
      const stats = await getFixtureStats('football', 123);
      expect(stats).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://v3.football.api-sports.io/fixtures/statistics?fixture=123',
        expect.any(Object)
      );
    });

    it('should fetch F1 race stats from API', async () => {
      process.env.APISPORTS_API_KEY = 'test_key';
      const mockData = [{ driver: { name: 'Max' }, statistics: [{ type: 'Fastest Lap', value: '1:20' }] }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: mockData }),
      });
      const stats = await getFixtureStats('formula-1', 456);
      expect(stats).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://v1.formula-1.api-sports.io/races?id=456',
        expect.any(Object)
      );
    });

    it('should fetch MMA fight stats from API', async () => {
      process.env.APISPORTS_API_KEY = 'test_key';
      const mockData = [{ team: { name: 'Fighter A' }, statistics: [{ type: 'Strikes', value: '50' }] }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: mockData }),
      });
      const stats = await getFixtureStats('mma', 789);
      expect(stats).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://v1.mma.api-sports.io/fights?id=789',
        expect.any(Object)
      );
    });
  });

  // --- Test getHeadToHead ---
  describe('getHeadToHead', () => {
    it('should use mock engine if API key is not set', async () => {
      delete process.env.APISPORTS_API_KEY;
      const h2h = await getHeadToHead('football', 33, 34);
      expect(h2h).toHaveProperty('summary');
      expect(h2h).toHaveProperty('fixtures');
      expect(h2h.fixtures).toBeInstanceOf(Array);
      expect(h2h.fixtures.length).toBeGreaterThan(0);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('APISPORTS_API_KEY not set. Using Mock Engine for football.'));
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch football H2H from API and calculate summary', async () => {
      process.env.APISPORTS_API_KEY = 'test_key';
      const teamAId = 33;
      const teamBId = 34;
      const mockApiData = {
        response: [
          { fixture: { id: 1 }, teams: { home: { id: teamAId }, away: { id: teamBId } }, goals: { home: 3, away: 1 } }, // A wins
          { fixture: { id: 2 }, teams: { home: { id: teamBId }, away: { id: teamAId } }, goals: { home: 2, away: 2 } }, // Draw
          { fixture: { id: 3 }, teams: { home: { id: teamAId }, away: { id: teamBId } }, goals: { home: 1, away: 2 } }, // B wins
          { fixture: { id: 4 }, teams: { home: { id: teamBId }, away: { id: teamAId } }, goals: { home: 0, away: 1 } }, // A wins
          { fixture: { id: 5 }, teams: { home: { id: teamAId }, away: { id: teamBId } }, goals: { home: 1, away: 1 } }, // Draw
          { fixture: { id: 6 }, teams: { home: { id: teamBId }, away: { id: teamAId } }, goals: { home: 4, away: 2 } }, // B wins
        ]
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiData),
      });
      const h2h = await getHeadToHead('football', teamAId, teamBId);
      expect(h2h.summary).toEqual({ teamAWin: 2, teamBWin: 2, draws: 2, total: 6 });
      expect(h2h.fixtures).toEqual(mockApiData.response);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://v3.football.api-sports.io/fixtures/headtohead?h2h=33-34',
        expect.any(Object)
      );
    });

    it('should handle basketball scores for H2H summary', async () => {
      process.env.APISPORTS_API_KEY = 'test_key';
      const teamAId = 147;
      const teamBId = 148;
      const mockApiData = {
        response: [
          { id: 1, teams: { home: { id: teamAId }, away: { id: teamBId } }, scores: { home: { total: 100 }, away: { total: 90 } } }, // A wins
          { id: 2, teams: { home: { id: teamBId }, away: { id: teamAId } }, scores: { home: { total: 110 }, away: { total: 115 } } }, // A wins
          { id: 3, teams: { home: { id: teamAId }, away: { id: teamBId } }, scores: { home: { total: 80 }, away: { total: 95 } } }, // B wins
        ]
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiData),
      });
      const h2h = await getHeadToHead('basketball', teamAId, teamBId);
      expect(h2h.summary).toEqual({ teamAWin: 2, teamBWin: 1, draws: 0, total: 3 });
      expect(h2h.fixtures).toEqual(mockApiData.response);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://v1.basketball.api-sports.io/games/headtohead?h2h=147-148',
        expect.any(Object)
      );
    });

    it('should handle F1 H2H by fetching driver rankings', async () => {
      process.env.APISPORTS_API_KEY = 'test_key';
      const mockApiData = {
        response: [
          { rank: 1, driver: { name: 'Max Verstappen' } },
          { rank: 2, driver: { name: 'Charles Leclerc' } }
        ]
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiData),
      });
      const currentYear = new Date().getFullYear();
      const h2h = await getHeadToHead('formula-1', 1, 2); // Team IDs might not be relevant for F1 H2H in API-Sports
      expect(h2h.summary).toEqual({ teamAWin: 0, teamBWin: 0, draws: 0, total: 2 }); // Summary calculation might not apply directly to F1 rankings
      expect(h2h.fixtures).toEqual(mockApiData.response);
      expect(mockFetch).toHaveBeenCalledWith(
        `https://v1.formula-1.api-sports.io/rankings/drivers?season=${currentYear}`,
        expect.any(Object)
      );
    });

    it('should handle MMA H2H by fetching fights', async () => {
      process.env.APISPORTS_API_KEY = 'test_key';
      const mockApiData = {
        response: [
          { id: 1, fighters: { home: { name: 'Fighter A' }, away: { name: 'Fighter B' } } }
        ]
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockApiData),
      });
      const h2h = await getHeadToHead('mma', 1, 2);
      expect(h2h.summary).toEqual({ teamAWin: 0, teamBWin: 0, draws: 0, total: 1 }); // Summary calculation might not apply directly to MMA fights without scores
      expect(h2h.fixtures).toEqual(mockApiData.response);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://v1.mma.api-sports.io/fights',
        expect.any(Object)
      );
    });

    it('should return empty fixtures and zero summary if API returns no data', async () => {
      process.env.APISPORTS_API_KEY = 'test_key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: [] }),
      });
      const h2h = await getHeadToHead('football', 99, 100);
      expect(h2h.summary).toEqual({ teamAWin: 0, teamBWin: 0, draws: 0, total: 0 });
      expect(h2h.fixtures).toEqual([]);
    });
  });

  // --- Test getTeamStats ---
  describe('getTeamStats', () => {
    it('should use mock engine if API key is not set', async () => {
      delete process.env.APISPORTS_API_KEY;
      const stats = await getTeamStats('football', 33, 39);
      expect(stats).toHaveProperty('form');
      expect(stats).toHaveProperty('fixtures');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('APISPORTS_API_KEY not set. Using Mock Engine for football.'));
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch team stats from API when key is set', async () => {
      process.env.APISPORTS_API_KEY = 'test_key';
      const mockData = {
        form: 'WWDLW',
        fixtures: { played: 34, wins: 24, draws: 6, loses: 4 },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: mockData }),
      });
      const stats = await getTeamStats('football', 33, 39, 2023);
      expect(stats).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://v3.football.api-sports.io/teams/statistics?team=33&league=39&season=2023',
        expect.any(Object)
      );
    });

    it('should default season to current year if not provided', async () => {
      process.env.APISPORTS_API_KEY = 'test_key';
      const currentYear = new Date().getFullYear();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: {} }),
      });
      await getTeamStats('football', 33, 39);
      expect(mockFetch).toHaveBeenCalledWith(
        `https://v3.football.api-sports.io/teams/statistics?team=33&league=39&season=${currentYear}`,
        expect.any(Object)
      );
    });
  });

  // --- Test Mock Data Generation Functions (indirectly via public functions) ---
  describe('Mock Data Generation', () => {
    beforeEach(() => {
      delete process.env.APISPORTS_API_KEY; // Ensure mock engine is active
      vi.clearAllMocks(); // Clear logger.warn from previous tests
    });

    it('generateMockLiveScores should return data for various sports', async () => {
      expect((await getLiveScores('football')).length).toBeGreaterThan(0);
      expect((await getLiveScores('basketball')).length).toBeGreaterThan(0);
      expect((await getLiveScores('formula-1')).length).toBeGreaterThan(0);
      expect((await getLiveScores('mma')).length).toBeGreaterThan(0);
      expect((await getLiveScores('cricket')).length).toBeGreaterThan(0);
      expect((await getLiveScores('rugby')).length).toBeGreaterThan(0);
      expect((await getLiveScores('afl')).length).toBeGreaterThan(0);
      expect((await getLiveScores('volleyball')).length).toBeGreaterThan(0);
      expect((await getLiveScores('handball')).length).toBeGreaterThan(0);
      expect((await getLiveScores('unknown-sport')).length).toBeGreaterThan(0); // Generic fallback
    });

    it('generateMockStandings should return data for various sports', async () => {
      expect((await getStandings('football', 39)).length).toBeGreaterThan(0);
      expect((await getStandings('formula-1', 1)).length).toBeGreaterThan(0);
      expect((await getStandings('mma', 1)).length).toBeGreaterThan(0);
      expect((await getStandings('cricket', 3)).length).toBeGreaterThan(0);
      expect((await getStandings('rugby', 1)).length).toBeGreaterThan(0);
      expect((await getStandings('afl', 1)).length).toBeGreaterThan(0);
      expect((await getStandings('volleyball', 1)).length).toBeGreaterThan(0);
      expect((await getStandings('handball', 1)).length).toBeGreaterThan(0);
      expect((await getStandings('unknown-sport', 1)).length).toBeGreaterThan(0); // Generic fallback
    });

    it('generateMockFixtureStats should return data for various sports', async () => {
      expect((await getFixtureStats('football', 123)).length).toBeGreaterThan(0);
      expect((await getFixtureStats('formula-1', 101)).length).toBeGreaterThan(0);
      expect((await getFixtureStats('mma', 201)).length).toBeGreaterThan(0);
      expect((await getFixtureStats('cricket', 301)).length).toBeGreaterThan(0);
      expect((await getFixtureStats('unknown-sport', 999)).length).toBeGreaterThan(0); // Generic fallback
    });

    it('generateMockHeadToHead should return data for various sports', async () => {
      const footballH2H = await getHeadToHead('football', 33, 34);
      expect(footballH2H.fixtures.length).toBeGreaterThan(0);
      expect(footballH2H.summary.total).toBeGreaterThan(0);

      const f1H2H = await getHeadToHead('formula-1', 1, 2);
      expect(f1H2H.fixtures.length).toBeGreaterThan(0);
      expect(f1H2H.summary.total).toBeGreaterThan(0);
    });

    it('generateMockTeamStats should return data', async () => {
      const stats = await getTeamStats('football', 33, 39, 2023);
      expect(stats).toHaveProperty('form');
      expect(stats).toHaveProperty('fixtures');
      expect(stats).toHaveProperty('goals');
    });
  });
});