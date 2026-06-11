import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../../../shared/logger.js';
import {
  getMarketsService,
  getLiveMarketsService,
  getPlayerPropsService,
  getGamePropsService,
  getFuturesMarketsService,
  getPeriodMarketsService,
  getAltLinesService,
  getFullMarketService,
  getFixturesService,
  getPlayersService,
  getTeamsService,
  getSeasonsService,
  getMarketSummariesService,
  getOrderbookService,
  buildDeeplinkService,
  getSGPOddsService,
  buildStreamUrl,
} from './predictiondata.service.js';

// Mock the logger
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const MOCK_API_KEY = 'test-api-key';

describe('PredictionData Service', () => {
  let fetchSpy;
  const originalApiKey = process.env.PREDICTIONDATA_API_KEY;

  beforeEach(() => {
    // Mock global fetch
    fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    // Set a mock API key
    process.env.PREDICTIONDATA_API_KEY = MOCK_API_KEY;
  });

  afterEach(() => {
    // Restore environment and mocks
    process.env.PREDICTIONDATA_API_KEY = originalApiKey;
    vi.clearAllMocks();
  });

  describe('API Key and Core Fetch Logic', () => {
    it('should return null and log a warning if API key is not set for GET requests', async () => {
      delete process.env.PREDICTIONDATA_API_KEY;
      const result = await getMarketsService('NFL');
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith('[PredictionData] PREDICTIONDATA_API_KEY not set. Real-time sports data unavailable.');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should return null and log a warning if API key is not set for POST requests', async () => {
      delete process.env.PREDICTIONDATA_API_KEY;
      const result = await buildDeeplinkService('fanduel', ['str1']);
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith('[PredictionData] PREDICTIONDATA_API_KEY not set.');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should throw an error on non-OK GET response', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Invalid API Key'),
      });
      await expect(getMarketsService('NFL')).rejects.toThrow('PredictionData API 401: Invalid API Key');
    });

    it('should throw an error on non-OK POST response', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request'),
      });
      await expect(buildDeeplinkService('fanduel', ['str1'])).rejects.toThrow('PredictionData API POST 400: Bad Request');
    });

    it('should correctly trim BOM and whitespace from API key', async () => {
      process.env.PREDICTIONDATA_API_KEY = `\uFEFF ${MOCK_API_KEY} `;
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ markets: [] }),
      });
      await getMarketsService('NFL');
      expect(fetchSpy).toHaveBeenCalled();
      const headers = fetchSpy.mock.calls[0][1].headers;
      expect(headers['X-API-KEY']).toBe(MOCK_API_KEY);
    });
  });

  describe('Market Services', () => {
    it('getMarketsService should call pdFetch with correct parameters', async () => {
      const mockResponse = { markets: [{ id: 1 }] };
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await getMarketsService(
        'NBA',
        'spread,total',
        '1H',
        '100,200',
        { propTypes: 'points', isLive: true, timedelta: 12, includeAlts: true, since: 12345 }
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.predictiondata.io/api/markets?league=NBA&bet_types=spread%2Ctotal&periods=1H&book_ids=100%2C200&prop_types=points&is_live=true&timedelta=12&include_alts=true&since=12345',
        expect.any(Object)
      );
      expect(result).toEqual(mockResponse.markets);
    });

    it('getMarketsService should return an empty array for nullish response', async () => {
        fetchSpy.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(null),
        });
        const result = await getMarketsService('NFL');
        expect(result).toEqual([]);
    });

    it('getLiveMarketsService should call getMarketsService with live options', async () => {
      fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve({ markets: [] }) });
      await getLiveMarketsService('NFL', 'moneyline', '100');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.predictiondata.io/api/markets?league=NFL&bet_types=moneyline&periods=FT&book_ids=100&is_live=true&timedelta=6',
        expect.any(Object)
      );
    });

    it('getPlayerPropsService should call getMarketsService for player props', async () => {
        fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve({ markets: [] }) });
        await getPlayerPropsService('MLB', 'strikeouts', '200', true);
        expect(fetchSpy).toHaveBeenCalledWith(
          'https://api.predictiondata.io/api/markets?league=MLB&bet_types=player_prop&periods=FT&book_ids=200&prop_types=strikeouts&timedelta=24&is_live=true',
          expect.any(Object)
        );
    });

    it('getGamePropsService should call getMarketsService for game props', async () => {
        fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve({ markets: [] }) });
        await getGamePropsService('UFC', 'method_of_victory', '300');
        expect(fetchSpy).toHaveBeenCalledWith(
          'https://api.predictiondata.io/api/markets?league=UFC&bet_types=game_prop&periods=FT&book_ids=300&prop_types=method_of_victory&timedelta=24',
          expect.any(Object)
        );
    });

    it('getFuturesMarketsService should call getMarketsService with large timedelta', async () => {
        fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve({ markets: [] }) });
        await getFuturesMarketsService('NFL', '100', 'Super Bowl Winner');
        expect(fetchSpy).toHaveBeenCalledWith(
          'https://api.predictiondata.io/api/markets?league=NFL&bet_types=future&periods=FT&book_ids=100&prop_types=Super+Bowl+Winner&timedelta=8760',
          expect.any(Object)
        );
    });

    it('getPeriodMarketsService should call getMarketsService with specified period', async () => {
        fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve({ markets: [] }) });
        await getPeriodMarketsService('NBA', '1Q', '400');
        expect(fetchSpy).toHaveBeenCalledWith(
          'https://api.predictiondata.io/api/markets?league=NBA&bet_types=moneyline%2Cspread%2Ctotal&periods=1Q&book_ids=400&timedelta=24',
          expect.any(Object)
        );
    });

    it('getAltLinesService should call getMarketsService with includeAlts=true', async () => {
        fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve({ markets: [] }) });
        await getAltLinesService('NFL', '100');
        expect(fetchSpy).toHaveBeenCalledWith(
          'https://api.predictiondata.io/api/markets?league=NFL&bet_types=spread%2Ctotal&periods=FT&book_ids=100&timedelta=24&include_alts=true',
          expect.any(Object)
        );
    });

    it('getFullMarketService should call getMarketsService with multiple bet types', async () => {
        fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve({ markets: [] }) });
        await getFullMarketService('NHL');
        expect(fetchSpy).toHaveBeenCalledWith(
          'https://api.predictiondata.io/api/markets?league=NHL&bet_types=moneyline%2Cspread%2Ctotal%2Cplayer_prop%2Cgame_prop&periods=FT&book_ids=100%2C200%2C300%2C400%2C250%2C700&timedelta=24',
          expect.any(Object)
        );
    });
  });

  describe('Reference Data Services', () => {
    it('getFixturesService should handle list response', async () => {
        const mockResponse = { fixtures: [{ id: 1 }] };
        fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockResponse) });
        const result = await getFixturesService('NFL,NBA', 24, false, 12345);
        expect(fetchSpy).toHaveBeenCalledWith(
            'https://api.predictiondata.io/api/fixtures?leagues=NFL%2CNBA&timedelta=24&return_map=false&since=12345',
            expect.any(Object)
        );
        expect(result).toEqual(mockResponse.fixtures);
    });

    it('getFixturesService should handle map response', async () => {
        const mockResponse = { fixtures: { '1': { id: 1 } } };
        fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockResponse) });
        const result = await getFixturesService('NFL', 48, true);
        expect(fetchSpy).toHaveBeenCalledWith(
            'https://api.predictiondata.io/api/fixtures?leagues=NFL&timedelta=48&return_map=true',
            expect.any(Object)
        );
        expect(result).toEqual(mockResponse.fixtures);
    });

    it('getPlayersService should handle map response by default', async () => {
        const mockResponse = { players: { 'p1': { id: 'p1' } } };
        fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockResponse) });
        const result = await getPlayersService('NBA');
        expect(fetchSpy).toHaveBeenCalledWith(
            'https://api.predictiondata.io/api/players?leagues=NBA&return_map=true',
            expect.any(Object)
        );
        expect(result).toEqual(mockResponse.players);
    });

    it('getTeamsService should handle list response', async () => {
        const mockResponse = { teams: [{ id: 't1' }] };
        fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockResponse) });
        const result = await getTeamsService('MLB', false, 54321);
        expect(fetchSpy).toHaveBeenCalledWith(
            'https://api.predictiondata.io/api/teams?leagues=MLB&return_map=false&since=54321',
            expect.any(Object)
        );
        expect(result).toEqual(mockResponse.teams);
    });

    it('getSeasonsService should call pdFetch and return an array', async () => {
        const mockResponse = [{ id: 's1' }];
        fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockResponse) });
        const result = await getSeasonsService('EPL');
        expect(fetchSpy).toHaveBeenCalledWith(
            'https://api.predictiondata.io/api/seasons?league=EPL',
            expect.any(Object)
        );
        expect(result).toEqual(mockResponse);
    });

    it('getSeasonsService should return empty array if response is not an array', async () => {
        fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: 'not an array' }) });
        const result = await getSeasonsService('EPL');
        expect(result).toEqual([]);
    });
  });

  describe('Exchange/Orderbook Services', () => {
    it('getMarketSummariesService should call pdFetch and return an array', async () => {
        const mockResponse = [{ slug: 'test-slug' }];
        fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockResponse) });
        const result = await getMarketSummariesService('NBA');
        expect(fetchSpy).toHaveBeenCalledWith(
            'https://api.predictiondata.io/api/market_summaries?league=NBA',
            expect.any(Object)
        );
        expect(result).toEqual(mockResponse);
    });

    it('getOrderbookService should call pdFetch with correct params', async () => {
        const mockResponse = [{ price: 0.5 }];
        fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockResponse) });
        const result = await getOrderbookService('test-slug', 194);
        expect(fetchSpy).toHaveBeenCalledWith(
            'https://api.predictiondata.io/api/orderbook?market_slug=test-slug&provider_id=194',
            expect.any(Object)
        );
        expect(result).toEqual(mockResponse);
    });
  });

  describe('Action (POST) Services', () => {
    it('buildDeeplinkService should call pdPost with correct body', async () => {
        const mockResponse = { url: 'http://deeplink.url' };
        fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockResponse) });
        const result = await buildDeeplinkService('draftkings', ['str1', 'str2'], 'parlay', 'nj');
        
        expect(fetchSpy).toHaveBeenCalledWith(
            'https://api.predictiondata.io/api/deeplink',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    sportsbook: 'draftkings',
                    bet_type: 'parlay',
                    deeplink_strings: ['str1', 'str2'],
                    region: 'nj'
                })
            })
        );
        expect(result).toEqual(mockResponse);
    });

    it('getSGPOddsService should call pdPost with correct body', async () => {
        const mockResponse = { draftkings: { american: 200 } };
        fetchSpy.mockResolvedValue({ ok: true, json: () => Promise.resolve(mockResponse) });
        const legs = [{ fixture_id: 1 }, { fixture_id: 1 }];
        const sportsbooks = ['draftkings'];
        const result = await getSGPOddsService(legs, sportsbooks);

        expect(fetchSpy).toHaveBeenCalledWith(
            'https://api.predictiondata.io/api/sgp',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ sportsbooks, legs })
            })
        );
        expect(result).toEqual(mockResponse);
    });

    it('getSGPOddsService should throw an error if less than 2 legs are provided', async () => {
        await expect(getSGPOddsService([{ fixture_id: 1 }])).rejects.toThrow('SGP requires at least 2 legs');
        await expect(getSGPOddsService([])).rejects.toThrow('SGP requires at least 2 legs');
        expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('Streaming URL Builder', () => {
    it('buildStreamUrl should construct a URL with all parameters', () => {
        const url = buildStreamUrl('NBA', '100,200', true);
        expect(url).toBe('https://stream.predictiondata.io/v1/markets?league=NBA&book_ids=100%2C200&include_alts=true');
    });

    it('buildStreamUrl should construct a URL with only league', () => {
        const url = buildStreamUrl('NFL');
        expect(url).toBe('https://stream.predictiondata.io/v1/markets?league=NFL');
    });

    it('buildStreamUrl should construct a base URL with no parameters', () => {
        const url = buildStreamUrl();
        expect(url).toBe('https://stream.predictiondata.io/v1/markets');
    });

    it('buildStreamUrl should NOT include the API key in the URL', () => {
        const url = buildStreamUrl('NBA');
        expect(url).not.toContain(MOCK_API_KEY);
    });
  });
});