import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { logger } from '../../../shared/logger.js';
import DocumentMetadata from './llamaindex.metadata.model.js';

vi.mock('fs', () => {
  const mockPromises = {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  };
  return {
    default: {
      existsSync: vi.fn().mockReturnValue(false),
      readFileSync: vi.fn().mockReturnValue('{}'),
      promises: mockPromises,
    },
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn().mockReturnValue('{}'),
    promises: mockPromises,
  };
});

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}));

vi.mock('./llamaindex.metadata.model.js', () => {
  const mockLean = vi.fn().mockResolvedValue([]);
  const mockFind = vi.fn().mockReturnValue({ lean: mockLean });
  return {
    default: {
      find: mockFind,
    }
  };
});

import { queryRouterService } from './llamaindex.queryRouter.js';

describe('QueryRouterService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRouterService.performanceScores.clear();
    queryRouterService.totalRouted = 0;
  });

  describe('Initialization (_loadState)', () => {
    it('should load state from file if it exists', () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(true);
      vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify({
        performanceScores: {
          'technical:vector': { count: 10, totalLatencyMs: 1000, totalQuality: 9, successes: 10, cacheHits: 2 }
        },
        totalRouted: 42
      }));

      queryRouterService._loadState();

      expect(queryRouterService.totalRouted).toBe(42);
      expect(queryRouterService.performanceScores.has('technical:vector')).toBe(true);
      expect(queryRouterService.performanceScores.get('technical:vector')).toEqual({
        count: 10,
        totalLatencyMs: 1000,
        totalQuality: 9,
        successes: 10,
        cacheHits: 2
      });
    });

    it('should handle errors gracefully when loading state fails', () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(true);
      vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
        throw new Error('Read error');
      });

      queryRouterService._loadState();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('QueryRouter: failed to load state'),
        'Read error'
      );
    });
  });

  describe('route', () => {
    it('should route a simple query to the default/best engine', async () => {
      const mockLean = vi.fn().mockResolvedValue([]);
      vi.mocked(DocumentMetadata.find).mockReturnValueOnce({ lean: mockLean });

      const decision = await queryRouterService.route('What is the API endpoint for login?');

      expect(decision).toBeDefined();
      expect(decision.engine).toBeDefined();
      expect(decision.confidence).toBeGreaterThanOrEqual(0);
      expect(decision.profile).toBe('technical');
      expect(decision.reasoning).toContain('Query classified as "technical" profile');
      expect(queryRouterService.totalRouted).toBe(1);
    });

    it('should route a conversational query to chat engine', async () => {
      const mockLean = vi.fn().mockResolvedValue([]);
      vi.mocked(DocumentMetadata.find).mockReturnValueOnce({ lean: mockLean });

      const decision = await queryRouterService.route('how do I set up this project?', { isFollowUp: true });

      expect(decision.profile).toBe('conversational');
      expect(decision.engine).toBe('chat');
      expect(decision.reasoning).toContain('follow-up question detected');
    });

    it('should use user metadata to boost profile scoring', async () => {
      const mockMetadata = [
        {
          topics: ['database', 'postgres'],
          entities: ['UserTable'],
          complexity: 'Highly Technical'
        }
      ];
      const mockLean = vi.fn().mockResolvedValue(mockMetadata);
      vi.mocked(DocumentMetadata.find).mockReturnValueOnce({ lean: mockLean });

      const decision = await queryRouterService.route('Tell me about the UserTable database schema');

      expect(decision.profile).toBe('structured');
      expect(decision.reasoning).toContain('Corpus contains 1 highly technical document profiles');
    });

    it('should handle DocumentMetadata fetch errors gracefully', async () => {
      const mockLean = vi.fn().mockRejectedValue(new Error('DB Connection Failed'));
      vi.mocked(DocumentMetadata.find).mockReturnValueOnce({ lean: mockLean });

      const decision = await queryRouterService.route('simple query');

      expect(decision).toBeDefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('QueryRouter: could not fetch DocumentMetadata for user default_user:'),
        'DB Connection Failed'
      );
    });

    it('should apply query length heuristics', async () => {
      const mockLean = vi.fn().mockResolvedValue([]);
      vi.mocked(DocumentMetadata.find).mockReturnValue({ lean: mockLean });

      const shortDecision = await queryRouterService.route('hi');
      expect(shortDecision.scores.cached).toBeGreaterThan(0);

      const longQuery = 'a'.repeat(201);
      const longDecision = await queryRouterService.route(longQuery);
      expect(longDecision.scores.fullspectrum).toBeGreaterThan(0);
    });
  });

  describe('recordOutcome', () => {
    it('should record performance metrics correctly', () => {
      queryRouterService.recordOutcome('vector', 'technical', {
        latencyMs: 150,
        qualityScore: 0.9,
        success: true,
        cacheHit: true
      });

      const key = 'technical:vector';
      expect(queryRouterService.performanceScores.has(key)).toBe(true);
      const record = queryRouterService.performanceScores.get(key);
      expect(record).toEqual({
        count: 1,
        totalLatencyMs: 150,
        totalQuality: 0.9,
        successes: 1,
        cacheHits: 1
      });
    });

    it('should trigger state persistence every 10 recordings', async () => {
      const saveSpy = vi.spyOn(queryRouterService, '_saveState').mockResolvedValue(undefined);

      for (let i = 1; i <= 10; i++) {
        queryRouterService.recordOutcome('vector', 'technical', { latencyMs: 100 });
      }

      expect(saveSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle errors during async state save', async () => {
      const saveSpy = vi.spyOn(queryRouterService, '_saveState').mockRejectedValue(new Error('Disk full'));

      for (let i = 1; i <= 10; i++) {
        queryRouterService.recordOutcome('vector', 'technical', { latencyMs: 100 });
      }

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        'QueryRouter: Error during async state save:',
        expect.any(Error)
      );
    });
  });

  describe('getAnalytics', () => {
    it('should return correct analytics summary', () => {
      queryRouterService.totalRouted = 5;
      queryRouterService.performanceScores.set('technical:vector', {
        count: 3,
        totalLatencyMs: 300,
        totalQuality: 2.7,
        successes: 3,
        cacheHits: 1
      });
      queryRouterService.performanceScores.set('research:hybrid', {
        count: 2,
        totalLatencyMs: 1000,
        totalQuality: 1.6,
        successes: 1,
        cacheHits: 0
      });

      const analytics = queryRouterService.getAnalytics();

      expect(analytics.totalRouted).toBe(5);
      expect(analytics.enginePerformance.vector).toEqual({
        totalQueries: 3,
        avgLatencyMs: 100,
        avgQuality: 0.9,
        successRate: 100,
        cacheHitRate: 33
      });
      expect(analytics.enginePerformance.hybrid).toEqual({
        totalQueries: 2,
        avgLatencyMs: 500,
        avgQuality: 0.8,
        successRate: 50,
        cacheHitRate: 0
      });
      expect(analytics.profileDistribution).toEqual({
        technical: 3,
        research: 2
      });
    });
  });

  describe('_saveState', () => {
    it('should write state to disk successfully', async () => {
      queryRouterService.totalRouted = 10;
      queryRouterService.performanceScores.set('technical:vector', {
        count: 1, totalLatencyMs: 100, totalQuality: 1, successes: 1, cacheHits: 0
      });

      await queryRouterService._saveState();

      expect(fs.promises.mkdir).toHaveBeenCalled();
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"totalRouted": 10'),
        expect.any(String)
      );
      expect(logger.info).toHaveBeenCalledWith('QueryRouter: state persisted');
    });

    it('should log warning if writing state fails', async () => {
      vi.mocked(fs.promises.writeFile).mockRejectedValueOnce(new Error('Write permission denied'));

      await queryRouterService._saveState();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('QueryRouter: failed to save state:'),
        'Write permission denied'
      );
    });
  });
});