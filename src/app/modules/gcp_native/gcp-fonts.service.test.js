import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import { GcpFontsService } from './gcp-fonts.service.js';

vi.mock('axios');
const { mockConfig } = vi.hoisted(() => ({
  mockConfig: {
    google_search_api_key: 'test-api-key',
  },
}));

vi.mock('../../../../config/index.js', () => ({
  default: mockConfig,
}));

vi.mock('../usage/usage.service.js', () => ({
  UsageService: {
    trackUsage: vi.fn(),
    hasExceededLimit: vi.fn().mockResolvedValue(false),
    record: vi.fn(),
  },
}));
vi.mock('../workspace/workspace.service.js', () => ({
  WorkspaceService: {
    getWorkspace: vi.fn(),
    isFeatureEnabled: vi.fn().mockResolvedValue(true),
  },
}));
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('GcpFontsService - resolveGoogleFonts', () => {
  const mockFontsData = {
    data: {
      items: [
        {
          family: 'Roboto',
          variants: ['regular', 'italic', '700'],
          subsets: ['latin', 'cyrillic'],
          version: 'v30',
          category: 'sans-serif',
          files: { regular: 'http://fonts.gstatic.com/roboto.ttf' }
        },
        {
          family: 'Open Sans',
          variants: ['regular', '600'],
          subsets: ['latin'],
          version: 'v28',
          category: 'sans-serif',
          files: { regular: 'http://fonts.gstatic.com/opensans.ttf' }
        },
        {
          family: 'Playfair Display',
          variants: ['regular', 'italic'],
          subsets: ['latin'],
          version: 'v37',
          category: 'serif',
          files: { regular: 'http://fonts.gstatic.com/playfair.ttf' }
        }
      ]
    }
  };

  const mockAuthContext = {
    workspaceId: 'test-workspace-id',
    user: {
      id: 'test-user-id',
      role: 'USER',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    config.google_search_api_key = 'test-api-key';
    delete process.env.GOOGLE_SEARCH_API_KEY;
  });

  it('should throw an authentication error if authContext is missing or invalid', async () => {
    await expect(GcpFontsService.resolveGoogleFonts(null)).rejects.toThrow(
      'Authentication context is required.'
    );
    await expect(GcpFontsService.resolveGoogleFonts({})).rejects.toThrow(
      'Authentication context is required.'
    );
  });

  it('should throw an error if Web Search/Fonts API Key is not configured', async () => {
    config.google_search_api_key = undefined;
    delete process.env.GOOGLE_SEARCH_API_KEY;

    await expect(GcpFontsService.resolveGoogleFonts(mockAuthContext, {})).rejects.toThrow(
      'Font service is currently unavailable due to a configuration issue.'
    );
  });

  it('should fallback to process.env.GOOGLE_SEARCH_API_KEY if config key is missing', async () => {
    config.google_search_api_key = undefined;
    process.env.GOOGLE_SEARCH_API_KEY = 'env-api-key';

    axios.get.mockResolvedValueOnce({ data: { items: [] } });

    const result = await GcpFontsService.resolveGoogleFonts(mockAuthContext, {});
    expect(result.success).toBe(true);
    expect(axios.get).toHaveBeenCalledWith(
      'https://www.googleapis.com/webfonts/v1/webfonts',
      expect.objectContaining({
        params: {
          key: 'env-api-key',
          sort: 'popularity'
        }
      })
    );
  });

  it('should resolve google fonts with default parameters successfully', async () => {
    axios.get.mockResolvedValueOnce(mockFontsData);

    const result = await GcpFontsService.resolveGoogleFonts(mockAuthContext, {});

    expect(result).toEqual({
      success: true,
      filterQuery: '',
      sortBy: 'popularity',
      totalCount: 3,
      returnedCount: 3,
      fonts: [
        {
          family: 'Roboto',
          variants: ['regular', 'italic', '700'],
          subsets: ['latin', 'cyrillic'],
          version: 'v30',
          category: 'sans-serif',
          files: { regular: 'http://fonts.gstatic.com/roboto.ttf' }
        },
        {
          family: 'Open Sans',
          variants: ['regular', '600'],
          subsets: ['latin'],
          version: 'v28',
          category: 'sans-serif',
          files: { regular: 'http://fonts.gstatic.com/opensans.ttf' }
        },
        {
          family: 'Playfair Display',
          variants: ['regular', 'italic'],
          subsets: ['latin'],
          version: 'v37',
          category: 'serif',
          files: { regular: 'http://fonts.gstatic.com/playfair.ttf' }
        }
      ]
    });

    expect(axios.get).toHaveBeenCalledWith(
      'https://www.googleapis.com/webfonts/v1/webfonts',
      {
        params: {
          key: 'test-api-key',
          sort: 'popularity'
        }
      }
    );
    expect(logger.info).toHaveBeenCalled();
  });

  it('should default to popularity and log warning if invalid sortBy parameter is provided', async () => {
    axios.get.mockResolvedValueOnce({ data: { items: [] } });

    const result = await GcpFontsService.resolveGoogleFonts(mockAuthContext, { sortBy: 'invalid-sort' });

    expect(result.sortBy).toBe('popularity');
    expect(logger.warn).toHaveBeenCalledWith(
      'GCP Fonts API: Invalid sortBy parameter "invalid-sort" provided for workspace test-workspace-id. Defaulting to "popularity".'
    );
    expect(axios.get).toHaveBeenCalledWith(
      'https://www.googleapis.com/webfonts/v1/webfonts',
      {
        params: {
          key: 'test-api-key',
          sort: 'popularity'
        }
      }
    );
  });

  it('should accept valid sortBy parameters', async () => {
    axios.get.mockResolvedValueOnce({ data: { items: [] } });

    const result = await GcpFontsService.resolveGoogleFonts(mockAuthContext, { sortBy: 'alpha' });

    expect(result.sortBy).toBe('alpha');
    expect(logger.warn).not.toHaveBeenCalled();
    expect(axios.get).toHaveBeenCalledWith(
      'https://www.googleapis.com/webfonts/v1/webfonts',
      {
        params: {
          key: 'test-api-key',
          sort: 'alpha'
        }
      }
    );
  });

  it('should filter fonts by filterQuery (case-insensitive)', async () => {
    axios.get.mockResolvedValueOnce(mockFontsData);

    const result = await GcpFontsService.resolveGoogleFonts(mockAuthContext, { filterQuery: 'roboto' });

    expect(result.totalCount).toBe(1);
    expect(result.returnedCount).toBe(1);
    expect(result.fonts[0].family).toBe('Roboto');
  });

  it('should limit the returned results', async () => {
    axios.get.mockResolvedValueOnce(mockFontsData);

    const result = await GcpFontsService.resolveGoogleFonts(mockAuthContext, { sortBy: 'popularity', limit: 2 });

    expect(result.totalCount).toBe(3);
    expect(result.returnedCount).toBe(2);
    expect(result.fonts).toHaveLength(2);
    expect(result.fonts[0].family).toBe('Roboto');
    expect(result.fonts[1].family).toBe('Open Sans');
  });

  it('should handle missing fields in API response and apply defaults', async () => {
    const incompleteData = {
      data: {
        items: [
          {
            family: 'Minimal Font'
          }
        ]
      }
    };
    axios.get.mockResolvedValueOnce(incompleteData);

    const result = await GcpFontsService.resolveGoogleFonts(mockAuthContext, {});

    expect(result.fonts[0]).toEqual({
      family: 'Minimal Font',
      variants: [],
      subsets: [],
      version: '',
      category: 'sans-serif',
      files: {}
    });
  });

  it('should handle empty items array from API', async () => {
    axios.get.mockResolvedValueOnce({ data: {} });

    const result = await GcpFontsService.resolveGoogleFonts(mockAuthContext, {});

    expect(result.totalCount).toBe(0);
    expect(result.returnedCount).toBe(0);
    expect(result.fonts).toEqual([]);
  });

  it('should catch API errors, log them, and throw a custom error message', async () => {
    const apiError = new Error('Network Error');
    axios.get.mockRejectedValueOnce(apiError);

    await expect(GcpFontsService.resolveGoogleFonts(mockAuthContext, {})).rejects.toThrow(
      'An unexpected error occurred while resolving Google Fonts.'
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('GCP Fonts API Resolution Error for workspace'),
      apiError
    );
  });
});