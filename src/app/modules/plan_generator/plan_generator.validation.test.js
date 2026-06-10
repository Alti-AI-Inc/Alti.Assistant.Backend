import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

// Mock dependencies before importing the module under test
const rateLimitOptions = {};
vi.mock('express-rate-limit', () => ({
  default: vi.fn(options => {
    // Capture options to test internal functions like keyGenerator and tieredLimit.
    // We can identify the limiter by its unique message.
    if (options.message?.error?.includes('AI-intensive')) {
      rateLimitOptions.aiLimiter = options;
    } else if (options.message?.error?.includes('messages too quickly')) {
      rateLimitOptions.chatLimiter = options;
    } else if (options.message?.error?.includes('export requests')) {
      rateLimitOptions.exportLimiter = options;
    } else if (options.message?.error?.includes('data requests')) {
      rateLimitOptions.dataLimiter = options;
    }
    return () => {}; // Return a dummy middleware
  }),
}));

vi.mock('rate-limit-redis', () => ({
  default: vi.fn().mockImplementation(() => ({
    // Mock RedisStore instance
  })),
}));

const mockRedisClient = {
  on: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  sendCommand: vi.fn(),
};
vi.mock('redis', () => ({
  createClient: vi.fn(() => mockRedisClient),
}));

// Import the module to be tested
import { PlanGeneratorValidation } from '../../../../src/app/modules/plan_generator/plan_generator.validation.js';
import { createClient } from 'redis';

// --- Zod Schema Tests ---
describe('PlanGeneratorValidation', () => {
  describe('conversationalRequestSchema', () => {
    const validUUID = uuidv4();
    it('should pass with a valid minimal request', () => {
      const result = PlanGeneratorValidation.conversationalRequestSchema.safeParse({
        body: { message: 'Hello, world!' },
      });
      expect(result.success).toBe(true);
    });

    it('should pass with all valid fields and trim the message', () => {
      const result = PlanGeneratorValidation.conversationalRequestSchema.safeParse({
        body: {
          message: '   Continue our discussion.   ',
          conversationId: validUUID,
          userId: validUUID,
        },
      });
      expect(result.success).toBe(true);
      expect(result.data.body.message).toBe('Continue our discussion.');
    });

    it('should fail if message is missing', () => {
      const result = PlanGeneratorValidation.conversationalRequestSchema.safeParse({ body: {} });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Message is required');
    });

    it('should fail if message is empty after trim', () => {
      const result = PlanGeneratorValidation.conversationalRequestSchema.safeParse({ body: { message: '   ' } });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Message cannot be empty');
    });

    it('should fail if message is too long', () => {
      const result = PlanGeneratorValidation.conversationalRequestSchema.safeParse({
        body: { message: 'a'.repeat(5001) },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Message too long');
    });

    it('should fail with an invalid conversationId UUID', () => {
      const result = PlanGeneratorValidation.conversationalRequestSchema.safeParse({
        body: { message: 'test', conversationId: 'not-a-uuid' },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Invalid Conversation ID format');
    });

    it('should fail with an invalid userId UUID', () => {
      const result = PlanGeneratorValidation.conversationalRequestSchema.safeParse({
        body: { message: 'test', userId: 'not-a-uuid' },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Invalid User ID format');
    });
  });

  describe('generatePlanSchema', () => {
    it('should pass with a valid minimal request', () => {
      const result = PlanGeneratorValidation.generatePlanSchema.safeParse({
        body: { idea: 'A great new idea for an app.' },
      });
      expect(result.success).toBe(true);
    });

    it('should pass with all valid optional fields', () => {
      const result = PlanGeneratorValidation.generatePlanSchema.safeParse({
        body: {
          idea: '   A detailed plan for a new SaaS product.   ',
          planType: 'startup_plan',
          complexity: 'complex',
          planDepth: 'comprehensive',
          domains: ['technical', 'business', 'marketing'],
          constraints: {
            budget: 50000,
            timeline: '6 months',
            teamSize: 10,
            resources: ['Senior Dev', 'Marketing Lead'],
          },
          brainstormAspects: ['market_analysis', 'swot_analysis'],
        },
      });
      expect(result.success).toBe(true);
      expect(result.data.body.idea).toBe('A detailed plan for a new SaaS product.');
    });

    it('should fail if idea is too short', () => {
      const result = PlanGeneratorValidation.generatePlanSchema.safeParse({ body: { idea: 'short' } });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Please provide a more detailed description of your idea');
    });

    it('should fail with invalid enum values for planType', () => {
      const result = PlanGeneratorValidation.generatePlanSchema.safeParse({
        body: { idea: 'A valid idea length', planType: 'invalid_type' },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain('Invalid enum value');
    });

    it('should fail with a negative budget', () => {
      const result = PlanGeneratorValidation.generatePlanSchema.safeParse({
        body: {
          idea: 'A valid idea length',
          constraints: { budget: -100 },
        },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Budget must be a positive number');
    });

    it('should fail if teamSize is not an integer', () => {
      const result = PlanGeneratorValidation.generatePlanSchema.safeParse({
        body: {
          idea: 'A valid idea length',
          constraints: { teamSize: 5.5 },
        },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Expected integer, received float');
    });
  });

  describe('refinePlanSchema', () => {
    const validUUID = uuidv4();
    it('should pass with valid required fields', () => {
      const result = PlanGeneratorValidation.refinePlanSchema.safeParse({
        body: {
          conversationId: validUUID,
          refinementRequest: 'Make the budget section more detailed.',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should pass with all valid fields and trim the request', () => {
      const result = PlanGeneratorValidation.refinePlanSchema.safeParse({
        body: {
          conversationId: validUUID,
          section: 'budget',
          refinementRequest: '   Elaborate on the marketing budget.   ',
          userId: validUUID,
        },
      });
      expect(result.success).toBe(true);
      expect(result.data.body.refinementRequest).toBe('Elaborate on the marketing budget.');
    });

    it('should fail if conversationId is missing or invalid', () => {
      let result = PlanGeneratorValidation.refinePlanSchema.safeParse({
        body: { refinementRequest: 'test' },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Conversation ID is required');

      result = PlanGeneratorValidation.refinePlanSchema.safeParse({
        body: { conversationId: 'not-a-uuid', refinementRequest: 'test' },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Invalid Conversation ID format');
    });

    it('should fail if refinementRequest is empty', () => {
      const result = PlanGeneratorValidation.refinePlanSchema.safeParse({
        body: { conversationId: validUUID, refinementRequest: ' ' },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Please describe what you want to refine');
    });
  });

  describe('exportPlanSchema', () => {
    const validUUID = uuidv4();
    it('should pass with only conversationId and default format to pdf', () => {
      const result = PlanGeneratorValidation.exportPlanSchema.safeParse({
        body: { conversationId: validUUID },
      });
      expect(result.success).toBe(true);
      expect(result.data.body.format).toBe('pdf');
    });

    it('should pass with a specified valid format', () => {
      const result = PlanGeneratorValidation.exportPlanSchema.safeParse({
        body: { conversationId: validUUID, format: 'docx' },
      });
      expect(result.success).toBe(true);
      expect(result.data.body.format).toBe('docx');
    });

    it('should fail with an invalid format', () => {
      const result = PlanGeneratorValidation.exportPlanSchema.safeParse({
        body: { conversationId: validUUID, format: 'txt' },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toContain("Invalid enum value. Expected 'pdf' | 'docx' | 'json' | 'markdown' | 'html'");
    });
  });

  describe('getConversationHistorySchema', () => {
    const validUUID = uuidv4();
    it('should pass with a valid UUID in params', () => {
      const result = PlanGeneratorValidation.getConversationHistorySchema.safeParse({
        params: { conversationId: validUUID },
      });
      expect(result.success).toBe(true);
    });

    it('should fail with an invalid UUID in params', () => {
      const result = PlanGeneratorValidation.getConversationHistorySchema.safeParse({
        params: { conversationId: 'invalid-id' },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Invalid Conversation ID format');
    });
  });

  describe('brainstormSchema', () => {
    it('should pass with a valid minimal request', () => {
      const result = PlanGeneratorValidation.brainstormSchema.safeParse({
        body: { idea: 'Brainstorming a new feature.' },
      });
      expect(result.success).toBe(true);
    });

    it('should pass with all valid optional fields', () => {
      const result = PlanGeneratorValidation.brainstormSchema.safeParse({
        body: {
          idea: 'Brainstorming a new fintech app.',
          aspects: ['technical_feasibility', 'market_analysis'],
          context: {
            industry: 'FinTech',
            targetMarket: 'Millennials',
            budget: 100000,
            timeline: '1 year',
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it('should fail if idea is too short', () => {
      const result = PlanGeneratorValidation.brainstormSchema.safeParse({ body: { idea: 'idea' } });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Please provide a more detailed description of your idea');
    });

    it('should fail with a non-positive budget in context', () => {
      const result = PlanGeneratorValidation.brainstormSchema.safeParse({
        body: {
          idea: 'A valid idea length',
          context: { budget: 0 },
        },
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].message).toBe('Budget must be a positive number');
    });
  });
});

// --- Rate Limiter Tests ---
describe('PlanGeneratorRateLimiters', () => {
  describe('keyGenerator', () => {
    // The keyGenerator function is the same for all limiters, so we test one.
    const { keyGenerator } = rateLimitOptions.aiLimiter;

    it('should prioritize req.user.id for authenticated users', () => {
      const req = {
        user: { id: 'user-123' },
        body: { userId: 'guest-abc' },
        ip: '127.0.0.1',
      };
      expect(keyGenerator(req)).toBe('user:user-123');
    });

    it('should use req.body.userId for guest users when req.user is not present', () => {
      const req = {
        body: { userId: 'guest-abc' },
        ip: '127.0.0.1',
      };
      expect(keyGenerator(req)).toBe('guest:guest-abc');
    });

    it('should fall back to req.ip for anonymous users', () => {
      const req = {
        ip: '127.0.0.1',
        body: {},
      };
      expect(keyGenerator(req)).toBe('ip:127.0.0.1');
    });

    it('should handle requests with no user, body, or ip gracefully', () => {
      const req = {};
      expect(keyGenerator(req)).toBe('ip:undefined');
    });
  });

  describe('tieredLimit', () => {
    it('aiLimiter should apply correct limits for authenticated vs guest users', () => {
      const { limit } = rateLimitOptions.aiLimiter;
      const authReq = { user: { id: 'user-123' } };
      const guestReq = {};
      expect(limit(authReq)).toBe(20);
      expect(limit(guestReq)).toBe(5);
    });

    it('chatLimiter should apply correct limits for authenticated vs guest users', () => {
      const { limit } = rateLimitOptions.chatLimiter;
      const authReq = { user: { id: 'user-123' } };
      const guestReq = {};
      expect(limit(authReq)).toBe(100);
      expect(limit(guestReq)).toBe(30);
    });

    it('exportLimiter should apply correct limits for authenticated vs guest users', () => {
      const { limit } = rateLimitOptions.exportLimiter;
      const authReq = { user: { id: 'user-123' } };
      const guestReq = {};
      expect(limit(authReq)).toBe(10);
      expect(limit(guestReq)).toBe(3);
    });

    it('dataLimiter should apply correct limits for authenticated vs guest users', () => {
      const { limit } = rateLimitOptions.dataLimiter;
      const authReq = { user: { id: 'user-123' } };
      const guestReq = {};
      expect(limit(authReq)).toBe(200);
      expect(limit(guestReq)).toBe(50);
    });
  });

  describe('Redis Client Initialization', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      vi.resetModules(); // This is crucial to re-run the IIFE
      vi.clearAllMocks();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
      vi.resetModules(); // Clean up for other test files
    });

    it('should create and connect a Redis client if REDIS_URL is set', async () => {
      process.env.REDIS_URL = 'redis://test-host:6379';

      const localMockClient = {
        on: vi.fn(),
        connect: vi.fn().mockResolvedValue(undefined),
        sendCommand: vi.fn(),
      };
      vi.mock('redis', () => ({
        createClient: vi.fn(() => localMockClient),
      }));

      // Dynamically import the module to trigger the IIFE with the new env
      await import('../../../../src/app/modules/plan_generator/plan_generator.validation.js');

      expect(createClient).toHaveBeenCalledWith({ url: 'redis://test-host:6379' });
      expect(localMockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(localMockClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(localMockClient.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
      expect(localMockClient.connect).toHaveBeenCalledTimes(1);
    });

    it('should not create a Redis client and should warn if REDIS_URL is not set', async () => {
      delete process.env.REDIS_URL;
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      vi.mock('redis', () => ({
        createClient: vi.fn(),
      }));

      await import('../../../../src/app/modules/plan_generator/plan_generator.validation.js');

      expect(createClient).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'WARNING: REDIS_URL is not set. Rate limiting will use in-memory store, which is not suitable for production clusters. Please configure it in your environment variables.'
      );
      consoleWarnSpy.mockRestore();
    });

    it('should handle Redis connection errors gracefully', async () => {
      process.env.REDIS_URL = 'redis://test-host:6379';
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const connectionError = new Error('Connection failed');

      const localMockClient = {
        on: vi.fn(),
        connect: vi.fn().mockRejectedValue(connectionError),
        sendCommand: vi.fn(),
      };
      vi.mock('redis', () => ({
        createClient: vi.fn(() => localMockClient),
      }));

      await import('../../../../src/app/modules/plan_generator/plan_generator.validation.js');

      // Wait for the promise rejection to be handled
      await new Promise(process.nextTick);

      expect(localMockClient.connect).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to connect to Redis for rate limiting:', connectionError);
      consoleErrorSpy.mockRestore();
    });
  });
});