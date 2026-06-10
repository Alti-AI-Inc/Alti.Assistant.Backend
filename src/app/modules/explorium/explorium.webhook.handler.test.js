import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  verifyWebhookSignature,
  processWebhookEvent,
  webhookHandler,
} from './explorium.webhook.handler.js';

// Mock external dependencies
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

const mockRedisClient = {
  publish: vi.fn(),
  lpush: vi.fn(),
  ltrim: vi.fn(),
  expire: vi.fn(),
};
vi.mock('../../../shared/redis.js', () => ({
  RedisClient: mockRedisClient,
}));

const mockInvalidateCache = vi.fn();
vi.mock('./explorium.cache.js', () => ({
  invalidateCache: mockInvalidateCache,
}));

// Import the module itself to spy on internal functions
import * as ExploriumWebhookModule from './explorium.webhook.handler.js';

describe('explorium.webhook.handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock setImmediate for webhookHandler to control async processing
    vi.spyOn(global, 'setImmediate').mockImplementation((callback) => callback());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('classifyEvent', () => {
    // Access the internal classifyEvent function for direct testing
    const classifyEvent = ExploriumWebhookModule.classifyEvent;

    it('should classify funding events correctly', () => {
      expect(classifyEvent('new_funding_round')).toBe('funding');
      expect(classifyEvent('new_investment')).toBe('funding');
      expect(classifyEvent('ipo_announcement')).toBe('funding');
    });

    it('should classify growth events correctly', () => {
      expect(classifyEvent('new_product')).toBe('growth');
      expect(classifyEvent('new_office')).toBe('growth');
      expect(classifyEvent('company_award')).toBe('growth');
    });

    it('should classify risk events correctly', () => {
      expect(classifyEvent('lawsuits_and_legal_issues')).toBe('risk');
      expect(classifyEvent('outages_and_security_breaches')).toBe('risk');
      expect(classifyEvent('merger_and_acquisitions')).toBe('risk');
    });

    it('should classify hiring events correctly', () => {
      expect(classifyEvent('hiring_in_engineering_department')).toBe('hiring');
      expect(classifyEvent('increase_in_sales_department')).toBe('hiring');
      expect(classifyEvent('employee_joined_company')).toBe('hiring');
    });

    it('should classify prospect events correctly', () => {
      expect(classifyEvent('recently_changed_company')).toBe('prospect_change');
      expect(classifyEvent('employee_job_changes')).toBe('prospect_change');
      expect(classifyEvent('employee_workplace_anniversary')).toBe('prospect_change');
    });

    it('should classify unknown events as general', () => {
      expect(classifyEvent('unknown_event_type')).toBe('general');
      expect(classifyEvent('another_random_event')).toBe('general');
    });
  });

  describe('verifyWebhookSignature', () => {
    const secret = 'test_secret';
    const rawBody = Buffer.from('{"test": "payload"}', 'utf8');
    // Generated with createHmac('sha256', secret).update(rawBody).digest('hex')
    const expectedSignature = 'sha256=d343469a53103c20c0255301389308112196025232c9183424687d7b5394204d';

    it('should return true for a valid signature', () => {
      expect(verifyWebhookSignature(rawBody, expectedSignature, secret)).toBe(true);
    });

    it('should return true for a valid signature without sha256= prefix', () => {
      const bareSignature = expectedSignature.slice(7);
      expect(verifyWebhookSignature(rawBody, bareSignature, secret)).toBe(true);
    });

    it('should return false for an invalid signature', () => {
      const invalidSignature = 'sha256=d343469a53103c20c0255301389308112196025232c9183424687d7b5394204e'; // Last char changed
      expect(verifyWebhookSignature(rawBody, invalidSignature, secret)).toBe(false);
    });

    it('should return false for a missing signature', () => {
      expect(verifyWebhookSignature(rawBody, '', secret)).toBe(false);
    });

    it('should return true if secret is not configured', () => {
      expect(verifyWebhookSignature(rawBody, expectedSignature, '')).toBe(true);
      expect(verifyWebhookSignature(rawBody, 'any_signature', '')).toBe(true);
      expect(verifyWebhookSignature(rawBody, '', '')).toBe(true); // Even with missing signature
    });

    it('should handle rawBody as string', () => {
      const stringBody = '{"test": "payload"}';
      expect(verifyWebhookSignature(stringBody, expectedSignature, secret)).toBe(true);
    });

    it('should return false for malformed signature hex', () => {
      const malformedSignature = 'sha256=not-hex-data';
      expect(verifyWebhookSignature(rawBody, malformedSignature, secret)).toBe(false);
    });

    it('should return false for signature with incorrect length', () => {
      const shortSignature = 'sha256=d343469a53103c20c0255301389308112196025232c9183424687d7b5394204';
      expect(verifyWebhookSignature(rawBody, shortSignature, secret)).toBe(false);
    });
  });

  describe('storeBusinessEventInRedis', () => {
    // Access the internal storeBusinessEventInRedis function for direct testing
    const storeBusinessEventInRedis = ExploriumWebhookModule.storeBusinessEventInRedis;

    it('should store event in Redis if businessId is provided', async () => {
      const event = {
        event_type: 'new_funding_round',
        business_id: 'biz123',
        event_data: { amount: 100 },
        occurred_at: '2023-01-01T12:00:00Z',
      };
      await storeBusinessEventInRedis('biz123', event);

      expect(mockRedisClient.lpush).toHaveBeenCalledTimes(1);
      const [key, payloadStr] = mockRedisClient.lpush.mock.calls[0];
      expect(key).toBe('explorium:events:business:biz123');
      const payload = JSON.parse(payloadStr);
      expect(payload.event_type).toBe(event.event_type);
      expect(payload.event_data).toEqual(event.event_data);
      expect(payload.occurred_at).toBe(event.occurred_at);
      expect(payload.received_at).toBeDefined();

      expect(mockRedisClient.ltrim).toHaveBeenCalledWith('explorium:events:business:biz123', 0, 49);
      expect(mockRedisClient.expire).toHaveBeenCalledWith('explorium:events:business:biz123', 2592000);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should not store event if businessId is missing', async () => {
      const event = { event_type: 'new_funding_round' };
      await storeBusinessEventInRedis(undefined, event);
      expect(mockRedisClient.lpush).not.toHaveBeenCalled();
    });

    it('should log a warning if Redis operations fail', async () => {
      mockRedisClient.lpush.mockRejectedValueOnce(new Error('Redis error'));
      const event = { event_type: 'new_funding_round', business_id: 'biz123' };
      await storeBusinessEventInRedis('biz123', event);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('[Explorium Webhook] Failed to store event in Redis: Redis error'));
    });

    it('should use current date if occurred_at is missing', async () => {
      const event = { event_type: 'new_funding_round', business_id: 'biz123', event_data: { amount: 100 } };
      await storeBusinessEventInRedis('biz123', event);
      const [, payloadStr] = mockRedisClient.lpush.mock.calls[0];
      const payload = JSON.parse(payloadStr);
      expect(payload.occurred_at).toBeDefined();
      expect(payload.occurred_at).not.toBe(event.occurred_at); // Should be a new date
    });
  });

  describe('processWebhookEvent', () => {
    // Spy on internal handlers to check if they are called
    let handleFundingEventSpy;
    let handleGrowthEventSpy;
    let handleRiskEventSpy;
    let handleHiringEventSpy;
    let handleProspectEventSpy;
    let publishSpy; // Spy on the internal publish function

    beforeEach(() => {
      handleFundingEventSpy = vi.spyOn(ExploriumWebhookModule, 'handleFundingEvent').mockResolvedValue();
      handleGrowthEventSpy = vi.spyOn(ExploriumWebhookModule, 'handleGrowthEvent').mockResolvedValue();
      handleRiskEventSpy = vi.spyOn(ExploriumWebhookModule, 'handleRiskEvent').mockResolvedValue();
      handleHiringEventSpy = vi.spyOn(ExploriumWebhookModule, 'handleHiringEvent').mockResolvedValue();
      handleProspectEventSpy = vi.spyOn(ExploriumWebhookModule, 'handleProspectEvent').mockResolvedValue();
      publishSpy = vi.spyOn(ExploriumWebhookModule, 'publish').mockResolvedValue(); // Spy on internal publish
      vi.spyOn(ExploriumWebhookModule, 'storeBusinessEventInRedis').mockResolvedValue(); // Mock this as it's tested separately
    });

    it('should log a warning if event or event_type is missing', async () => {
      await processWebhookEvent({});
      expect(mockLogger.warn).toHaveBeenCalledWith('[Explorium Webhook] Received event without event_type');
      expect(handleFundingEventSpy).not.toHaveBeenCalled();
      expect(handleGrowthEventSpy).not.toHaveBeenCalled();
      expect(handleRiskEventSpy).not.toHaveBeenCalled();
      expect(handleHiringEventSpy).not.toHaveBeenCalled();
      expect(handleProspectEventSpy).not.toHaveBeenCalled();
    });

    it('should dispatch to handleFundingEvent for funding events', async () => {
      const event = { event_type: 'new_funding_round', business_id: 'biz1' };
      await processWebhookEvent(event);
      expect(handleFundingEventSpy).toHaveBeenCalledWith(event);
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('FUNDING'));
    });

    it('should dispatch to handleGrowthEvent for growth events', async () => {
      const event = { event_type: 'new_product', business_id: 'biz2' };
      await processWebhookEvent(event);
      expect(handleGrowthEventSpy).toHaveBeenCalledWith(event);
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('GROWTH'));
    });

    it('should dispatch to handleRiskEvent for risk events', async () => {
      const event = { event_type: 'lawsuits_and_legal_issues', business_id: 'biz3' };
      await processWebhookEvent(event);
      expect(handleRiskEventSpy).toHaveBeenCalledWith(event);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('RISK'));
    });

    it('should dispatch to handleHiringEvent for hiring events', async () => {
      const event = { event_type: 'employee_joined_company', business_id: 'biz4' };
      await processWebhookEvent(event);
      expect(handleHiringEventSpy).toHaveBeenCalledWith(event);
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('HIRING'));
    });

    it('should dispatch to handleProspectEvent for prospect events', async () => {
      const event = { event_type: 'recently_changed_company', prospect_id: 'prospect1', business_id: 'biz5' };
      await processWebhookEvent(event);
      expect(handleProspectEventSpy).toHaveBeenCalledWith(event);
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('PROSPECT'));
    });

    it('should handle general events', async () => {
      const event = { event_type: 'unknown_general_event', business_id: 'biz6' };
      await processWebhookEvent(event);
      expect(handleFundingEventSpy).not.toHaveBeenCalled();
      expect(handleGrowthEventSpy).not.toHaveBeenCalled();
      expect(handleRiskEventSpy).not.toHaveBeenCalled();
      expect(handleHiringEventSpy).not.toHaveBeenCalled();
      expect(handleProspectEventSpy).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(`[Explorium Webhook] General event: ${event.event_type}`);
      expect(publishSpy).toHaveBeenCalledWith('explorium:events:general', { ...event, category: 'general' });
    });

    // Test specific handler logic for one category to ensure mocks are working
    describe('handleFundingEvent (integration with mocks)', () => {
      beforeEach(() => {
        // Restore original implementation for handleFundingEvent to test its internal calls
        handleFundingEventSpy.mockRestore();
      });

      it('should invalidate cache and publish for funding events', async () => {
        const event = {
          event_type: 'new_funding_round',
          business_id: 'biz123',
          event_data: { amount: 100 },
          occurred_at: '2023-01-01T12:00:00Z',
        };
        await ExploriumWebhookModule.handleFundingEvent(event);

        expect(mockLogger.info).toHaveBeenCalledWith(`[Explorium Webhook] 💰 FUNDING: ${event.event_type} → business ${event.business_id}`);
        expect(mockInvalidateCache).toHaveBeenCalledWith('funding_and_acquisitions', { businessId: 'biz123' });
        expect(mockInvalidateCache).toHaveBeenCalledWith('firmographics', { businessId: 'biz123' });
        expect(mockInvalidateCache).toHaveBeenCalledWith('financial_metrics', { businessId: 'biz123' });
        expect(mockInvalidateCache).toHaveBeenCalledWith('competitive_landscape', { businessId: 'biz123' });
        expect(mockInvalidateCache).toHaveBeenCalledTimes(4);

        expect(ExploriumWebhookModule.storeBusinessEventInRedis).toHaveBeenCalledWith('biz123', event);

        expect(mockRedisClient.publish).toHaveBeenCalledWith(
          'explorium:events:funding',
          JSON.stringify({
            business_id: 'biz123',
            event_type: 'new_funding_round',
            event_data: { amount: 100 },
            occurred_at: '2023-01-01T12:00:00Z',
            category: 'funding',
          })
        );
      });
    });

    describe('handleGrowthEvent (integration with mocks)', () => {
      beforeEach(() => {
        handleGrowthEventSpy.mockRestore(); // Restore original implementation
      });

      it('should invalidate cache and publish for growth events', async () => {
        const event = {
          event_type: 'new_product',
          business_id: 'biz456',
          occurred_at: '2023-02-01T10:00:00Z',
        };
        await ExploriumWebhookModule.handleGrowthEvent(event);

        expect(mockLogger.info).toHaveBeenCalledWith(`[Explorium Webhook] 🚀 GROWTH: ${event.event_type} → business ${event.business_id}`);
        expect(mockInvalidateCache).toHaveBeenCalledWith('competitive_landscape', { businessId: 'biz456' });
        expect(mockInvalidateCache).toHaveBeenCalledWith('strategic_insights', { businessId: 'biz456' });
        expect(mockInvalidateCache).toHaveBeenCalledTimes(2);

        expect(ExploriumWebhookModule.storeBusinessEventInRedis).toHaveBeenCalledWith('biz456', event);

        expect(mockRedisClient.publish).toHaveBeenCalledWith(
          'explorium:events:growth',
          JSON.stringify({
            business_id: 'biz456',
            event_type: 'new_product',
            occurred_at: '2023-02-01T10:00:00Z',
            category: 'growth',
          })
        );
      });
    });

    describe('handleProspectEvent (integration with mocks)', () => {
      beforeEach(() => {
        handleProspectEventSpy.mockRestore();
      });

      it('should invalidate cache for prospect and contacts if prospect_id exists', async () => {
        const event = {
          event_type: 'recently_changed_company',
          prospect_id: 'prospect123',
          business_id: 'biz123',
          occurred_at: '2023-01-01T12:00:00Z',
        };
        await ExploriumWebhookModule.handleProspectEvent(event);

        expect(mockLogger.info).toHaveBeenCalledWith(`[Explorium Webhook] 👤 PROSPECT: ${event.event_type} → prospect ${event.prospect_id}`);
        expect(mockInvalidateCache).toHaveBeenCalledWith('professional_profile', { prospectId: 'prospect123' });
        expect(mockInvalidateCache).toHaveBeenCalledWith('contacts_information', { prospectId: 'prospect123' });
        expect(mockInvalidateCache).toHaveBeenCalledTimes(2);

        expect(ExploriumWebhookModule.storeBusinessEventInRedis).toHaveBeenCalledWith('biz123', event);

        expect(mockRedisClient.publish).toHaveBeenCalledWith(
          'explorium:events:prospects',
          JSON.stringify({
            prospect_id: 'prospect123',
            business_id: 'biz123',
            event_type: 'recently_changed_company',
            event_data: undefined, // event_data was not in the input event
            occurred_at: '2023-01-01T12:00:00Z',
            category: 'prospect_change',
          })
        );
      });

      it('should not invalidate prospect cache if prospect_id is missing', async () => {
        const event = {
          event_type: 'recently_changed_company',
          business_id: 'biz123',
          occurred_at: '2023-01-01T12:00:00Z',
        };
        await ExploriumWebhookModule.handleProspectEvent(event);

        expect(mockInvalidateCache).not.toHaveBeenCalledWith('professional_profile', expect.any(Object));
        expect(mockInvalidateCache).not.toHaveBeenCalledWith('contacts_information', expect.any(Object));
        expect(mockInvalidateCache).toHaveBeenCalledTimes(0);
      });
    });
  });

  describe('webhookHandler', () => {
    let mockReq;
    let mockRes;
    let verifyWebhookSignatureSpy;
    let processWebhookEventSpy;

    beforeEach(() => {
      mockReq = {
        body: Buffer.from('{"event_type": "new_funding_round", "business_id": "test_biz"}'),
        headers: {
          'x-explorium-signature': 'sha256=valid_signature',
        },
      };
      mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      process.env.EXPLORIUM_WEBHOOK_SECRET = 'test_secret';

      verifyWebhookSignatureSpy = vi.spyOn(ExploriumWebhookModule, 'verifyWebhookSignature');
      processWebhookEventSpy = vi.spyOn(ExploriumWebhookModule, 'processWebhookEvent').mockResolvedValue();
    });

    it('should return 401 if signature verification fails', async () => {
      verifyWebhookSignatureSpy.mockReturnValue(false);

      await webhookHandler(mockReq, mockRes);

      expect(verifyWebhookSignatureSpy).toHaveBeenCalledWith(
        mockReq.body,
        mockReq.headers['x-explorium-signature'],
        process.env.EXPLORIUM_WEBHOOK_SECRET
      );
      expect(mockLogger.warn).toHaveBeenCalledWith('[Explorium Webhook] Signature verification failed — request rejected');
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid webhook signature' });
      expect(processWebhookEventSpy).not.toHaveBeenCalled();
    });

    it('should return 400 if payload is invalid JSON', async () => {
      verifyWebhookSignatureSpy.mockReturnValue(true);
      mockReq.body = Buffer.from('this is not json');

      await webhookHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid JSON payload' });
      expect(processWebhookEventSpy).not.toHaveBeenCalled();
    });

    it('should process a single event successfully', async () => {
      verifyWebhookSignatureSpy.mockReturnValue(true);
      const eventPayload = { event_type: 'new_funding_round', business_id: 'test_biz' };
      mockReq.body = Buffer.from(JSON.stringify(eventPayload));

      await webhookHandler(mockReq, mockRes);

      expect(verifyWebhookSignatureSpy).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ received: true }));
      expect(mockLogger.info).toHaveBeenCalledWith('[Explorium Webhook] Processing 1 event(s)');
      expect(processWebhookEventSpy).toHaveBeenCalledWith(eventPayload);
      expect(mockLogger.error).not.toHaveBeenCalled(); // No errors during processing
    });

    it('should process multiple events successfully', async () => {
      verifyWebhookSignatureSpy.mockReturnValue(true);
      const eventsPayload = [
        { event_type: 'new_funding_round', business_id: 'test_biz_1' },
        { event_type: 'new_product', business_id: 'test_biz_2' },
      ];
      mockReq.body = Buffer.from(JSON.stringify(eventsPayload));

      await webhookHandler(mockReq, mockRes);

      expect(verifyWebhookSignatureSpy).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ received: true }));
      expect(mockLogger.info).toHaveBeenCalledWith('[Explorium Webhook] Processing 2 event(s)');
      expect(processWebhookEventSpy).toHaveBeenCalledTimes(2);
      expect(processWebhookEventSpy).toHaveBeenCalledWith(eventsPayload[0]);
      expect(processWebhookEventSpy).toHaveBeenCalledWith(eventsPayload[1]);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should log an error if processWebhookEvent fails for an event', async () => {
      verifyWebhookSignatureSpy.mockReturnValue(true);
      const eventsPayload = [
        { event_type: 'new_funding_round', business_id: 'test_biz_1' },
        { event_type: 'new_product', business_id: 'test_biz_2' },
      ];
      mockReq.body = Buffer.from(JSON.stringify(eventsPayload));

      processWebhookEventSpy.mockImplementation(async (event) => {
        if (event.event_type === 'new_product') {
          throw new Error('Processing error for new_product');
        }
        return Promise.resolve();
      });

      await webhookHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ received: true }));
      expect(processWebhookEventSpy).toHaveBeenCalledTimes(2);
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[Explorium Webhook] Handler error for "new_product": Processing error for new_product'
      );
      expect(mockLogger.error).toHaveBeenCalledTimes(1); // Only one error expected
    });

    it('should handle missing x-explorium-signature header gracefully', async () => {
      verifyWebhookSignatureSpy.mockReturnValue(false); // Assume secret is configured, so it fails
      mockReq.headers = {}; // No signature header
      mockReq.body = Buffer.from('{}');

      await webhookHandler(mockReq, mockRes);

      expect(verifyWebhookSignatureSpy).toHaveBeenCalledWith(
        mockReq.body,
        '', // Empty string for signature
        process.env.EXPLORIUM_WEBHOOK_SECRET
      );
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should use x-hub-signature-256 if x-explorium-signature is missing', async () => {
      verifyWebhookSignatureSpy.mockReturnValue(true);
      mockReq.headers = { 'x-hub-signature-256': 'sha256=valid_signature_hub' };
      mockReq.body = Buffer.from('{}');

      await webhookHandler(mockReq, mockRes);

      expect(verifyWebhookSignatureSpy).toHaveBeenCalledWith(
        mockReq.body,
        'sha256=valid_signature_hub',
        process.env.EXPLORIUM_WEBHOOK_SECRET
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it('should trim the secret from process.env', async () => {
      process.env.EXPLORIUM_WEBHOOK_SECRET = '  test_secret  '; // With whitespace
      verifyWebhookSignatureSpy.mockReturnValue(true);
      mockReq.body = Buffer.from('{}');

      await webhookHandler(mockReq, mockRes);

      expect(verifyWebhookSignatureSpy).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(String),
        'test_secret' // Should be trimmed
      );
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });
});