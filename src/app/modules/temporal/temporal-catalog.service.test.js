import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import TemporalRepository from './temporal-repository.model.js';
import { TemporalCatalogService } from './temporal-catalog.service.js';

// Mock dependencies
vi.mock('fs');
vi.mock('./temporal-repository.model.js', () => ({
  default: {
    findOneAndUpdate: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn(),
    aggregate: vi.fn(),
  },
}));

// Reconstruct path constants as they are in the original file to ensure mocks work
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '../../../../..');
const SCAN_RESULTS_PATH = path.join(ROOT_DIR, 'scan_results.json');

describe('TemporalCatalogService', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    vi.resetAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('syncCatalog', () => {
    it('should return success:false if scan_results.json is not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await TemporalCatalogService.syncCatalog();

      expect(fs.existsSync).toHaveBeenCalledWith(SCAN_RESULTS_PATH);
      expect(result).toEqual({ success: false, message: 'scan_results.json not found' });
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Scan results file not found'));
      expect(TemporalRepository.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('should handle empty or invalid scan_results.json gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ approved: [] }));

      const result = await TemporalCatalogService.syncCatalog();

      expect(result).toEqual({ success: true, count: 0 });
      expect(TemporalRepository.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('should not sync repositories whose local folders do not exist', async () => {
      const mockScanData = {
        approved: [{ name: 'repo-1' }, { name: 'repo-2' }],
      };
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === SCAN_RESULTS_PATH) return true;
        // Pretend no local folders exist
        return false;
      });
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockScanData));

      const result = await TemporalCatalogService.syncCatalog();

      expect(result).toEqual({ success: true, count: 0 });
      expect(TemporalRepository.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('should sync approved repositories that exist locally', async () => {
      const mockScanData = {
        approved: [
          { name: 'repo-1', description: 'desc 1', primary_license: 'MIT', license_key: 'mit', url: 'http://repo1.com', stars: 10, archived: false },
          { name: 'repo-2', description: 'desc 2', primary_license: 'Apache-2.0', license_key: 'apache-2.0', url: 'http://repo2.com', stars: 20, archived: true },
          { name: 'repo-3-no-folder', description: 'desc 3', primary_license: 'GPL', license_key: 'gpl', url: 'http://repo3.com', stars: 30, archived: false },
        ],
      };
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (p === SCAN_RESULTS_PATH) return true;
        if (p.endsWith('repo-1') || p.endsWith('repo-2')) return true;
        return false;
      });
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockScanData));
      vi.mocked(TemporalRepository.findOneAndUpdate).mockResolvedValue({});

      const result = await TemporalCatalogService.syncCatalog();

      expect(result).toEqual({ success: true, count: 2 });
      expect(TemporalRepository.findOneAndUpdate).toHaveBeenCalledTimes(2);
      expect(TemporalRepository.findOneAndUpdate).toHaveBeenCalledWith(
        { name: 'repo-1' },
        expect.objectContaining({ name: 'repo-1', status: 'Active' }),
        { upsert: true, new: true }
      );
      expect(TemporalRepository.findOneAndUpdate).toHaveBeenCalledWith(
        { name: 'repo-2' },
        expect.objectContaining({ name: 'repo-2', status: 'Archived' }),
        { upsert: true, new: true }
      );
    });

    it('should handle upsert failures for some repositories and continue with others', async () => {
        const mockScanData = {
            approved: [
              { name: 'repo-1', url: 'http://repo1.com' },
              { name: 'repo-2-fail', url: 'http://repo2.com' },
              { name: 'repo-3', url: 'http://repo3.com' },
            ],
          };
          vi.mocked(fs.existsSync).mockReturnValue(true);
          vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockScanData));
          vi.mocked(TemporalRepository.findOneAndUpdate)
            .mockImplementation(async ({ name }) => {
                if (name === 'repo-2-fail') {
                    throw new Error('DB error');
                }
                return {};
            });

        const result = await TemporalCatalogService.syncCatalog();

        expect(result).toEqual({ success: true, count: 2 });
        expect(TemporalRepository.findOneAndUpdate).toHaveBeenCalledTimes(3);
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to upsert repository repo-2-fail: DB error'));
    });

    it('should handle general errors during synchronization', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockImplementation(() => {
            throw new Error('File read error');
        });

        const result = await TemporalCatalogService.syncCatalog();

        expect(result).toEqual({ success: false, error: 'File read error' });
        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Synchronization failed: File read error'));
    });
  });

  describe('searchCatalog', () => {
    const mockQueryBuilder = {
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn(),
    };

    beforeEach(() => {
        vi.mocked(TemporalRepository.find).mockReturnValue(mockQueryBuilder);
        vi.mocked(mockQueryBuilder.lean).mockResolvedValue([{ name: 'repo-1' }]);
        vi.mocked(TemporalRepository.countDocuments).mockResolvedValue(1);
    });

    it('should perform a search with default options', async () => {
        const result = await TemporalCatalogService.searchCatalog();

        expect(TemporalRepository.find).toHaveBeenCalledWith({});
        expect(mockQueryBuilder.sort).toHaveBeenCalledWith({ stars: -1 });
        expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
        expect(mockQueryBuilder.limit).toHaveBeenCalledWith(20);
        expect(result).toEqual({
            success: true,
            total: 1,
            page: 1,
            limit: 20,
            results: [{ name: 'repo-1' }],
        });
    });

    it('should use text search for valid queries', async () => {
        await TemporalCatalogService.searchCatalog('my awesome repo');
        
        expect(TemporalRepository.find).toHaveBeenCalledWith(
            { $text: { $search: 'awesome repo' } },
            { score: { $meta: 'textScore' } }
        );
        expect(mockQueryBuilder.sort).toHaveBeenCalledWith({ score: { $meta: 'textScore' }, stars: -1 });
    });

    it('should fall back to regex search if query has only stop words', async () => {
        await TemporalCatalogService.searchCatalog('show me the');

        expect(TemporalRepository.find).toHaveBeenCalledWith({
            $or: [
                { name: { $regex: 'show me the', $options: 'i' } },
                { description: { $regex: 'show me the', $options: 'i' } }
            ]
        });
        expect(mockQueryBuilder.sort).toHaveBeenCalledWith({ stars: -1 });
    });

    it('should sanitize the search query', async () => {
        await TemporalCatalogService.searchCatalog('my-repo with$special{chars}');

        expect(TemporalRepository.find).toHaveBeenCalledWith(
            expect.objectContaining({
                $text: { $search: 'my-repo withspecialchars' }
            }),
            expect.any(Object)
        );
    });

    it('should apply whitelisted filters and sorting options', async () => {
        const options = {
            license: 'mit',
            status: 'Active',
            sortBy: 'name',
            page: 3,
            limit: 15
        };
        await TemporalCatalogService.searchCatalog('', options);

        expect(TemporalRepository.find).toHaveBeenCalledWith({ license_key: 'mit', status: 'Active' });
        expect(mockQueryBuilder.sort).toHaveBeenCalledWith({ name: -1 });
        expect(mockQueryBuilder.skip).toHaveBeenCalledWith(30); // (3 - 1) * 15
        expect(mockQueryBuilder.limit).toHaveBeenCalledWith(15);
    });

    it('should ignore non-whitelisted filters and sorting options', async () => {
        const options = {
            license: 'gpl', // not in whitelist
            status: 'Pending', // not in whitelist
            sortBy: 'forks', // not in whitelist
        };
        await TemporalCatalogService.searchCatalog('', options);

        expect(TemporalRepository.find).toHaveBeenCalledWith({});
        expect(mockQueryBuilder.sort).toHaveBeenCalledWith({ stars: -1 });
    });

    it('should enforce pagination boundaries', async () => {
        const options = { page: -1, limit: 200 };
        const result = await TemporalCatalogService.searchCatalog('', options);

        expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
        expect(mockQueryBuiilder.limit).toHaveBeenCalledWith(100);
        expect(result.page).toBe(1);
        expect(result.limit).toBe(100);
    });

    it('should throw an error if the database query fails', async () => {
        const dbError = new Error('Database connection lost');
        vi.mocked(TemporalRepository.countDocuments).mockRejectedValue(dbError);

        await expect(TemporalCatalogService.searchCatalog()).rejects.toThrow('Failed to query Temporal catalog: Database connection lost');
    });
  });

  describe('getStats', () => {
    it('should return aggregated statistics successfully', async () => {
        const mockCombinedStats = [{
            _id: null,
            totalRepositories: 15,
            activeRepositories: 12,
            archivedRepositories: 3,
            totalStars: 1500,
            avgStars: 100.5
        }];
        const mockLicenseStats = [
            { _id: 'mit', count: 10 },
            { _id: 'apache-2.0', count: 5 }
        ];

        vi.mocked(TemporalRepository.aggregate)
            .mockResolvedValueOnce(mockCombinedStats)
            .mockResolvedValueOnce(mockLicenseStats);

        const result = await TemporalCatalogService.getStats();

        expect(result).toEqual({
            success: true,
            stats: {
                totalRepositories: 15,
                activeRepositories: 12,
                archivedRepositories: 3,
                totalStars: 1500,
                averageStars: 101, // Math.round(100.5)
                licenses: [
                    { name: 'mit', count: 10 },
                    { name: 'apache-2.0', count: 5 }
                ]
            }
        });
        expect(TemporalRepository.aggregate).toHaveBeenCalledTimes(2);
    });

    it('should handle cases with no repositories in the database', async () => {
        vi.mocked(TemporalRepository.aggregate)
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        const result = await TemporalCatalogService.getStats();

        expect(result).toEqual({
            success: true,
            stats: {
                totalRepositories: 0,
                activeRepositories: 0,
                archivedRepositories: 0,
                totalStars: 0,
                averageStars: 0,
                licenses: []
            }
        });
    });

    it('should throw an error if aggregation fails', async () => {
        const dbError = new Error('Aggregation failed');
        vi.mocked(TemporalRepository.aggregate).mockRejectedValue(dbError);

        await expect(TemporalCatalogService.getStats()).rejects.toThrow('Failed to retrieve Temporal catalog stats: Aggregation failed');
    });
  });
});