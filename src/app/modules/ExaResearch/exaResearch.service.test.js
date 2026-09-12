import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Space } from '../Space/space.model.js';
import { SpaceService } from '../Space/space.service.js';
import { ExaResearch } from './exaResearch.model.js';
import { ExaResearchService } from './exaResearch.service.js';
import { SearchSession } from './Searchresearch.model.js';

vi.mock('../Space/space.model.js', () => ({
  Space: {
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

vi.mock('../Space/space.service.js', () => ({
  SpaceService: {
    assertSpaceAccess: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('./exaResearch.model.js', () => ({
  ExaResearch: {
    create: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findOneAndDelete: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    updateOne: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock('./Searchresearch.model.js', () => ({
  SearchSession: {
    create: vi.fn(),
    findOne: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

describe('ExaResearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    SpaceService.assertSpaceAccess.mockResolvedValue(true);
    process.env.EXA_API_KEY = 'test-key';
    process.env.EXA_WEBHOOK_SECRET = 'whsec_test';
  });

  describe('runSearch / createSearchRecord', () => {
    it('creates the DB record first, sends its _id as externalId, and stores the returned webset', async () => {
      const recordId = 'record-1';
      ExaResearch.create.mockResolvedValue({ _id: recordId });
      SearchSession.create.mockResolvedValue({ _id: 'session-1' });

      const websetResponse = {
        id: 'ws_abc123',
        externalId: recordId,
        status: 'running',
        searches: [
          {
            id: 'ws_search_abc',
            status: 'running',
            query: 'AI automation',
            count: 10,
            criteria: [{ description: 'Is an AI company', successRate: null }],
            progress: { found: 0, completion: 0 },
          },
        ],
        enrichments: [],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => websetResponse,
      });

      const updatedDoc = { _id: recordId, websetId: 'ws_abc123', status: 'running' };
      ExaResearch.findByIdAndUpdate.mockResolvedValue(updatedDoc);

      const result = await ExaResearchService.runSearch('space-1', 'user-1', {
        query: 'AI automation',
        count: 10,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.exa.ai/websets/v0/websets/',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
            'Content-Type': 'application/json',
          }),
        })
      );

      const sentBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(sentBody).toMatchObject({
        search: { query: 'AI automation', count: 10 },
        externalId: recordId,
      });

      expect(ExaResearch.findByIdAndUpdate).toHaveBeenCalledWith(
        recordId,
        expect.objectContaining({
          $set: expect.objectContaining({
            websetId: 'ws_abc123',
            status: 'running',
            searches: expect.arrayContaining([
              expect.objectContaining({ searchId: 'ws_search_abc', query: 'AI automation' }),
            ]),
          }),
        }),
        { new: true }
      );

      expect(SearchSession.findByIdAndUpdate).toHaveBeenCalledWith('session-1', {
        $addToSet: { researches: recordId },
        $set: { lastSearchAt: expect.any(Date) },
      });
      expect(Space.findByIdAndUpdate).toHaveBeenCalledWith('space-1', {
        $inc: { searchCount: 1 },
      });

      expect(result).toEqual(updatedDoc);
    });

    it('marks the record failed when Exa rejects the create request', async () => {
      ExaResearch.create.mockResolvedValue({ _id: 'record-2' });
      SearchSession.create.mockResolvedValue({ _id: 'session-2' });

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: 'Invalid query' }),
      });

      const failedDoc = { _id: 'record-2', status: 'failed', errorMessage: 'Invalid query' };
      ExaResearch.findByIdAndUpdate.mockResolvedValue(failedDoc);

      const result = await ExaResearchService.runSearch('space-1', 'user-1', {
        query: 'bad query',
      });

      expect(ExaResearch.findByIdAndUpdate).toHaveBeenCalledWith(
        'record-2',
        { $set: { status: 'failed', errorMessage: 'Invalid query', requestParams: expect.any(Object) } },
        { new: true }
      );
      expect(result).toEqual(failedDoc);
    });
  });

  describe('syncSearchRecord', () => {
    it('pulls current state from Exa and updates the record', async () => {
      ExaResearch.findOne.mockResolvedValue({ _id: 'record-3', websetId: 'ws_abc123' });

      const websetResponse = {
        status: 'idle',
        searches: [],
        enrichments: [],
        items: [
          {
            id: 'wsi_1',
            source: 'search',
            properties: { type: 'company', url: 'https://example.com' },
            evaluations: [],
            enrichments: [],
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => websetResponse,
      });

      const syncedDoc = { _id: 'record-3', status: 'idle' };
      ExaResearch.findByIdAndUpdate.mockResolvedValue(syncedDoc);

      const result = await ExaResearchService.syncSearchRecord('space-1', 'record-3', 'user-1');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.exa.ai/websets/v0/websets/ws_abc123?expand=items',
        expect.objectContaining({ method: 'GET' })
      );
      expect(ExaResearch.findByIdAndUpdate).toHaveBeenCalledWith(
        'record-3',
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'idle',
            items: expect.arrayContaining([
              expect.objectContaining({ itemId: 'wsi_1' }),
            ]),
          }),
          $unset: { errorMessage: '' },
        }),
        { new: true }
      );
      expect(result).toEqual(syncedDoc);
    });

    it('throws when the record has no websetId yet', async () => {
      ExaResearch.findOne.mockResolvedValue({ _id: 'record-4', websetId: undefined });

      await expect(
        ExaResearchService.syncSearchRecord('space-1', 'record-4', 'user-1')
      ).rejects.toThrow('This record has no associated webset to sync yet.');
    });
  });

  describe('webhook handling', () => {
    it('verifies a correctly signed payload', () => {
      const secret = 'whsec_test';
      const rawBody = Buffer.from(JSON.stringify({ type: 'webset.idle' }));
      const timestamp = '1700000000';
      const signature = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${rawBody.toString('utf8')}`)
        .digest('hex');

      const isValid = ExaResearchService.verifyWebhookSignature(
        rawBody,
        `t=${timestamp},v1=${signature}`,
        secret
      );

      expect(isValid).toBe(true);
    });

    it('rejects a tampered payload', () => {
      const secret = 'whsec_test';
      const rawBody = Buffer.from(JSON.stringify({ type: 'webset.idle' }));
      const isValid = ExaResearchService.verifyWebhookSignature(
        rawBody,
        't=1700000000,v1=deadbeef',
        secret
      );

      expect(isValid).toBe(false);
    });

    it('applies a webset.idle event to the matching record by websetId', async () => {
      ExaResearch.findOneAndUpdate.mockResolvedValue({});

      await ExaResearchService.applyWebsetWebhookEvent('webset.idle', {
        id: 'ws_abc123',
        status: 'idle',
        searches: [],
        enrichments: [],
      });

      expect(ExaResearch.findOneAndUpdate).toHaveBeenCalledWith(
        { websetId: 'ws_abc123' },
        expect.objectContaining({ $set: expect.objectContaining({ status: 'idle' }) })
      );
    });

    it('pushes a new item on webset.item.created', async () => {
      ExaResearch.findOne.mockResolvedValue({ _id: 'record-5', items: [] });

      await ExaResearchService.applyWebsetWebhookEvent('webset.item.created', {
        id: 'wsi_1',
        websetId: 'ws_abc123',
        source: 'search',
        properties: { type: 'company', url: 'https://example.com' },
      });

      expect(ExaResearch.findByIdAndUpdate).toHaveBeenCalledWith('record-5', {
        $push: { items: expect.objectContaining({ itemId: 'wsi_1' }) },
      });
    });
  });
});