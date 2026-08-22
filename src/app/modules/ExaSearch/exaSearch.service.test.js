import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExaSearchService } from './exaSearch.service.js';
import { ExaSearch } from './seaSearch.model.js';
import { Space } from './space.model.js';

vi.mock('./space.model.js', () => ({
  Space: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

vi.mock('./seaSearch.model.js', () => ({
  ExaSearch: {
    create: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    deleteOne: vi.fn(),
  },
}));

describe('ExaSearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EXA_API_KEY = 'test-key';
  });

  it('should call the Exa API and persist search results in the space', async () => {
    const responseBody = {
      results: [
        {
          id: 'exa-1',
          title: 'Example result',
          url: 'https://example.com',
          author: 'Jane Doe',
          score: 0.91,
          text: 'This is the page text',
          summary: 'Useful summary',
          highlights: ['AI'],
          highlightScores: [0.98],
        },
      ],
    };

    const spaceDoc = {
      _id: 'space-1',
      owner: 'user-1',
      members: [],
      searchCount: 0,
    };

    const savedDoc = {
      _id: 'result-1',
      space: 'space-1',
      user: 'user-1',
      query: 'AI automation',
      results: [
        {
          exaId: 'exa-1',
          title: 'Example result',
          url: 'https://example.com',
          author: 'Jane Doe',
          score: 0.91,
          text: 'This is the page text',
          summary: 'Useful summary',
          highlights: ['AI'],
          highlightScores: [0.98],
        },
      ],
      resultCount: 1,
    };

    Space.findById.mockResolvedValue(spaceDoc);
    ExaSearch.create.mockResolvedValue(savedDoc);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => responseBody,
    });

    const result = await ExaSearchService.runSearch('space-1', 'user-1', {
      query: 'AI automation',
      searchType: 'auto',
      numResults: 5,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.exa.ai/search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
        }),
      })
    );

    expect(ExaSearch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        space: 'space-1',
        user: 'user-1',
        query: 'AI automation',
        results: expect.arrayContaining([
          expect.objectContaining({
            exaId: 'exa-1',
            url: 'https://example.com',
          }),
        ]),
      })
    );

    expect(result).toEqual(savedDoc);
  });
});
