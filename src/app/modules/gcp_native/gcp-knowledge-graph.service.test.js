import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import { GcpKnowledgeGraphService } from './gcp-knowledge-graph.service.js';

// Mock dependencies
vi.mock('axios');
vi.mock('../../../../config/index.js', () => ({
  default: {
    google_search_api_key: 'test_api_key_from_config'
  }
}));
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

const mockApiResponse = {
  data: {
    '@context': {},
    '@type': 'ItemList',
    itemListElement: [
      {
        '@type': 'ListItem',
        result: {
          '@id': 'kg:/m/0d060g',
          name: 'Taylor Swift',
          '@type': ['Thing', 'Person'],
          description: 'American singer-songwriter',
          detailedDescription: {
            articleBody: 'Taylor Alison Swift is an American singer-songwriter...',
            url: 'https://en.wikipedia.org/wiki/Taylor_Swift',
            license: 'Creative Commons Attribution-ShareAlike License'
          },
          image: {
            contentUrl: 'http://t1.gstatic.com/images?q=tbn:ANd9GcQo2...',
            url: 'https://en.wikipedia.org/wiki/Taylor_Swift'
          },
          url: 'http://www.taylorswift.com/'
        },
        resultScore: 1000
      },
      {
        '@type': 'ListItem',
        result: {
          '@id': 'kg:/m/026z_6g',
          name: 'Taylor Swift',
          '@type': ['Thing', 'CreativeWork', 'MusicAlbum'],
          description: 'Album by Taylor Swift',
        },
        resultScore: 500
      }
    ]
  }
};

const mockEmptyApiResponse = {
  data: {
    '@context': {},
    '@type': 'ItemList',
    itemListElement: []
  }
};

describe('GcpKnowledgeGraphService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset process.env
    delete process.env.GOOGLE_SEARCH_API_KEY;
  });

  describe('lookupEntity', () => {
    it('should throw an error if API key is not configured in config or process.env', async () => {
      // Temporarily override the mock for this test
      vi.spyOn(config, 'google_search_api_key', 'get').mockReturnValue(undefined);

      await expect(GcpKnowledgeGraphService.lookupEntity('test')).rejects.toThrow(
        'Google Search API Key is not configured.'
      );
      expect(axios.get).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should use API key from config file when available', async () => {
      axios.get.mockResolvedValue(mockEmptyApiResponse);
      await GcpKnowledgeGraphService.lookupEntity('test');
      expect(axios.get).toHaveBeenCalledWith(
        'https://kgsearch.googleapis.com/v1/entities:search',
        {
          params: expect.objectContaining({
            key: 'test_api_key_from_config'
          })
        }
      );
    });

    it('should prioritize API key from process.env over config file', async () => {
      process.env.GOOGLE_SEARCH_API_KEY = 'test_api_key_from_env';
      axios.get.mockResolvedValue(mockEmptyApiResponse);
      await GcpKnowledgeGraphService.lookupEntity('test');
      expect(axios.get).toHaveBeenCalledWith(
        'https://kgsearch.googleapis.com/v1/entities:search',
        {
          params: expect.objectContaining({
            key: 'test_api_key_from_env'
          })
        }
      );
    });

    it('should make a successful API call and return formatted entities', async () => {
      axios.get.mockResolvedValue(mockApiResponse);
      const result = await GcpKnowledgeGraphService.lookupEntity('Taylor Swift');

      expect(logger.info).toHaveBeenCalledWith('GCP Knowledge Graph: Querying entity "Taylor Swift" (limit: 5, types: [])...');
      expect(axios.get).toHaveBeenCalledWith(
        'https://kgsearch.googleapis.com/v1/entities:search',
        {
          params: {
            query: 'Taylor Swift',
            key: 'test_api_key_from_config',
            limit: 5,
            languages: 'en'
          }
        }
      );
      expect(result).toEqual({
        success: true,
        query: 'Taylor Swift',
        totalCount: 2,
        entities: [
          {
            id: 'kg:/m/0d060g',
            name: 'Taylor Swift',
            types: ['Thing', 'Person'],
            description: 'American singer-songwriter',
            detailedDescription: {
              body: 'Taylor Alison Swift is an American singer-songwriter...',
              url: 'https://en.wikipedia.org/wiki/Taylor_Swift',
              license: 'Creative Commons Attribution-ShareAlike License'
            },
            image: {
              url: 'http://t1.gstatic.com/images?q=tbn:ANd9GcQo2...',
              sourceUrl: 'https://en.wikipedia.org/wiki/Taylor_Swift'
            },
            url: 'http://www.taylorswift.com/',
            relevanceScore: 1000
          },
          {
            id: 'kg:/m/026z_6g',
            name: 'Taylor Swift',
            types: ['Thing', 'CreativeWork', 'MusicAlbum'],
            description: 'Album by Taylor Swift',
            detailedDescription: { body: '', url: '', license: '' },
            image: { url: '', sourceUrl: '' },
            url: '',
            relevanceScore: 500
          }
        ]
      });
      expect(logger.info).toHaveBeenCalledWith('GCP Knowledge Graph: Found 2 entities for "Taylor Swift".');
    });

    it('should correctly handle custom limit, types, and languages', async () => {
      axios.get.mockResolvedValue(mockEmptyApiResponse);
      await GcpKnowledgeGraphService.lookupEntity('Google', 10, ['Organization'], ['en', 'es']);

      expect(axios.get).toHaveBeenCalledWith(
        'https://kgsearch.googleapis.com/v1/entities:search',
        {
          params: {
            query: 'Google',
            key: 'test_api_key_from_config',
            limit: 10,
            languages: 'en,es',
            types: 'Organization'
          }
        }
      );
    });

    it('should clamp the limit parameter to be between 1 and 500', async () => {
      axios.get.mockResolvedValue(mockEmptyApiResponse);

      // Test upper bound
      await GcpKnowledgeGraphService.lookupEntity('test', 600);
      expect(axios.get).toHaveBeenCalledWith(expect.any(String), { params: expect.objectContaining({ limit: 500 }) });

      // Test lower bound
      await GcpKnowledgeGraphService.lookupEntity('test', 0);
      expect(axios.get).toHaveBeenCalledWith(expect.any(String), { params: expect.objectContaining({ limit: 1 }) });

      // Test invalid number
      await GcpKnowledgeGraphService.lookupEntity('test', 'abc');
      expect(axios.get).toHaveBeenCalledWith(expect.any(String), { params: expect.objectContaining({ limit: 5 }) });
    });

    it('should handle non-array inputs for types and languages gracefully', async () => {
      axios.get.mockResolvedValue(mockEmptyApiResponse);
      await GcpKnowledgeGraphService.lookupEntity('test', 5, 'not-an-array', 'not-an-array');

      const calledParams = axios.get.mock.calls[0][1].params;
      expect(calledParams).not.toHaveProperty('types');
      expect(calledParams.languages).toBe('en');
    });

    it('should handle an empty API response correctly', async () => {
      axios.get.mockResolvedValue(mockEmptyApiResponse);
      const result = await GcpKnowledgeGraphService.lookupEntity('nonexistententity123');

      expect(result).toEqual({
        success: true,
        query: 'nonexistententity123',
        totalCount: 0,
        entities: []
      });
      expect(logger.info).toHaveBeenCalledWith('GCP Knowledge Graph: Found 0 entities for "nonexistententity123".');
    });

    it('should handle API call failure and throw a formatted error', async () => {
      const apiError = new Error('Network Error');
      axios.get.mockRejectedValue(apiError);

      await expect(GcpKnowledgeGraphService.lookupEntity('test')).rejects.toThrow(
        'GCP Knowledge Graph Lookup failed: Network Error'
      );
      expect(logger.error).toHaveBeenCalledWith('GCP Knowledge Graph Lookup Error:', apiError);
    });

    it('should handle malformed API response items without crashing', async () => {
      const malformedResponse = {
        data: {
          itemListElement: [
            {
              // Missing 'result' property entirely
              resultScore: 100
            },
            {
              result: {
                // Missing nested properties
                name: 'Incomplete Item'
              },
              resultScore: 50
            }
          ]
        }
      };
      axios.get.mockResolvedValue(malformedResponse);
      const result = await GcpKnowledgeGraphService.lookupEntity('malformed');

      expect(result.success).toBe(true);
      expect(result.totalCount).toBe(2);
      expect(result.entities).toEqual([
        {
          id: undefined,
          name: '',
          types: [],
          description: '',
          detailedDescription: { body: '', url: '', license: '' },
          image: { url: '', sourceUrl: '' },
          url: '',
          relevanceScore: 100
        },
        {
          id: undefined,
          name: 'Incomplete Item',
          types: [],
          description: '',
          detailedDescription: { body: '', url: '', license: '' },
          image: { url: '', sourceUrl: '' },
          url: '',
          relevanceScore: 50
        }
      ]);
    });
  });
});