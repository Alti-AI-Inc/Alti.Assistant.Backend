import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AuthorizationError,
  InsufficientCreditsError,
  RateLimitError,
  ServiceError,
} from '../../../../shared/errors.js';
import { planRefiner } from './planRefiner.js';

// Mock dependencies
vi.mock('rate-limiter-flexible');
vi.mock('redis', () => ({
  createClient: vi.fn(() => ({
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(true),
  })),
}));
vi.mock('@google/generative-ai');
vi.mock('../../../../config/index.js', () => ({
  default: {
    redis_url: 'mock_redis_url',
    gemini_secret_key: 'mock_gemini_key',
  },
}));
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('../../usage/usage.service.js');

// Dynamic import to get the mocked RateLimiterRedis
const { RateLimiterRedis } = await import('rate-limiter-flexible');
const { GoogleGenerativeAI } = await import('@google/generative-ai');
const { UsageService } = await import('../../usage/usage.service.js');

const mockConsume = vi.fn();
RateLimiterRedis.mockImplementation(() => ({
  consume: mockConsume,
}));

const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
  generateContent: mockGenerateContent,
}));
GoogleGenerativeAI.mockImplementation(() => ({
  getGenerativeModel: mockGetGenerativeModel,
}));

describe('planRefiner Service', () => {
  let mockPlan;
  let mockContext;
  let mockContextsByRole;

  beforeEach(() => {
    mockPlan = {
      id: 'plan123',
      workspaceId: 'ws-abc',
      title: 'My Test Plan',
      introduction: { summary: 'A simple plan.' },
      phases: [{ id: 1, name: 'Phase 1' }],
      resources: { budget: 1000 },
    };

    mockContext = {
      user: {
        id: 'user-xyz',
        workspaceId: 'ws-abc',
        role: 'user',
      },
      ip: '127.0.0.1',
    };

    mockContextsByRole = {
        user: { user: { id: 'user-xyz', workspaceId: 'ws-abc', role: 'user' }, ip: '127.0.0.1' },
        manager: { user: { id: 'manager-xyz', workspaceId: 'ws-abc', role: 'manager' }, ip: '127.0.0.1' },
        admin: { user: { id: 'admin-xyz', workspaceId: 'ws-abc', role: 'admin' }, ip: '127.0.0.1' },
        super_admin: { user: { id: 'super-admin-xyz', workspaceId: 'ws-abc', role: 'super_admin' }, ip: '127.0.0.1' },
    };

    UsageService.checkHasSufficientCredits.mockResolvedValue(true);
    UsageService.recordTokens.mockResolvedValue(true);
    mockConsume.mockResolvedValue(true);

    const mockApiResponse = {
      response: {
        text: () => JSON.stringify({ summary: 'A more detailed plan.' }),
        usageMetadata: { totalTokens: 100 },
      },
    };
    mockGenerateContent.mockResolvedValue(mockApiResponse);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Common Guards (Authorization, Credits, Rate Limiting)', () => {
    it('should throw AuthorizationError if user workspace does not match plan workspace', async () => {
      const differentWorkspaceContext = {
        ...mockContext,
        user: { ...mockContext.user, workspaceId: 'ws-def' },
      };
      await expect(planRefiner.refineSection(mockPlan, 'introduction', 'test', differentWorkspaceContext)).rejects.toThrow(AuthorizationError);
    });

    it('should throw AuthorizationError if user context is missing', async () => {
      await expect(planRefiner.refineSection(mockPlan, 'introduction', 'test', {})).rejects.toThrow(AuthorizationError);
    });

    it('should throw ServiceError if plan is malformed (missing workspaceId)', async () => {
        const malformedPlan = { id: 'plan123', title: 'No workspace' };
        await expect(planRefiner.refineSection(malformedPlan, 'introduction', 'test', mockContext)).rejects.toThrow(ServiceError);
    });

    it('should throw InsufficientCreditsError if credit check fails', async () => {
      UsageService.checkHasSufficientCredits.mockRejectedValue(new InsufficientCreditsError('Not enough credits'));
      await expect(planRefiner.refineSection(mockPlan, 'introduction', 'test', mockContext)).rejects.toThrow(InsufficientCreditsError);
    });

    it('should throw RateLimitError if rate limit is exceeded', async () => {
      mockConsume.mockRejectedValue({ msBeforeNext: 5000 });
      await expect(planRefiner.refineSection(mockPlan, 'introduction', 'test', mockContext)).rejects.toThrow(RateLimitError);
    });

    it('should call guards in the correct order: authorize, credits, rate limit', async () => {
        const authorizeSpy = vi.spyOn(planRefiner, 'refineSection').mockImplementationOnce(async (plan, section, req, context) => {
            // This is a bit of a hack to test the internal `authorizeAction`
            if (plan.workspaceId !== context.user.workspaceId) throw new AuthorizationError();
            await UsageService.checkHasSufficientCredits(context.user.workspaceId);
            // The mock for consume will be called by the original implementation
            return {};
        });

        // Fail at authorization
        const wrongContext = { ...mockContext, user: { ...mockContext.user, workspaceId: 'wrong-ws' } };
        await expect(planRefiner.refineSection(mockPlan, 'intro', 'test', wrongContext)).rejects.toThrow(AuthorizationError);
        expect(UsageService.checkHasSufficientCredits).not.toHaveBeenCalled();
        expect(mockConsume).not.toHaveBeenCalled();

        // Fail at credits
        UsageService.checkHasSufficientCredits.mockRejectedValueOnce(new InsufficientCreditsError());
        await expect(planRefiner.refineSection(mockPlan, 'intro', 'test', mockContext)).rejects.toThrow(InsufficientCreditsError);
        expect(UsageService.checkHasSufficientCredits).toHaveBeenCalledTimes(1);
        expect(mockConsume).not.toHaveBeenCalled();

        authorizeSpy.mockRestore();
    });

    it.each(Object.keys(mockContextsByRole))('should allow access for role "%s" when workspace matches', async (role) => {
        const context = mockContextsByRole[role];
        const result = await planRefiner.refineSection(mockPlan, 'introduction', 'test', context);
        expect(result).toBeDefined();
        expect(mockGenerateContent).toHaveBeenCalled();
    });
  });

  describe('refineSection', () => {
    it('should successfully refine a section', async () => {
      const refinedSection = { summary: 'A more detailed and refined plan.' };
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(refinedSection),
          usageMetadata: { totalTokens: 150 },
        },
      });

      const result = await planRefiner.refineSection(mockPlan, 'introduction', 'make it better', mockContext);

      expect(result).toEqual(refinedSection);
      expect(UsageService.checkHasSufficientCredits).toHaveBeenCalledWith('ws-abc');
      expect(mockConsume).toHaveBeenCalledWith('user-xyz');
      expect(mockGenerateContent).toHaveBeenCalled();
      expect(UsageService.recordTokens).toHaveBeenCalledWith('ws-abc', { totalTokens: 150 });
    });

    it('should throw an error if the section does not exist', async () => {
      await expect(planRefiner.refineSection(mockPlan, 'nonexistent_section', 'test', mockContext)).rejects.toThrow("Section 'nonexistent_section' not found in plan");
    });

    it('should throw an error if the AI response is not valid JSON', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => 'This is not JSON.',
          usageMetadata: { totalTokens: 50 },
        },
      });
      await expect(planRefiner.refineSection(mockPlan, 'introduction', 'test', mockContext)).rejects.toThrow('No valid JSON structure found in response');
    });

    it('should correctly parse JSON with markdown and trailing commas', async () => {
        const refinedSection = { summary: 'A more detailed and refined plan.' };
        const messyJson = `\`\`\`json\n${JSON.stringify(refinedSection, null, 2).replace('}', ',}')}\n\`\`\``;
        mockGenerateContent.mockResolvedValue({
          response: {
            text: () => messyJson,
            usageMetadata: { totalTokens: 150 },
          },
        });
  
        const result = await planRefiner.refineSection(mockPlan, 'introduction', 'make it better', mockContext);
        expect(result).toEqual(refinedSection);
      });
  });

  describe('adjustForConstraints', () => {
    it('should successfully adjust a plan for new constraints', async () => {
      const adjustedPlan = { ...mockPlan, resources: { budget: 500 } };
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(adjustedPlan),
          usageMetadata: { totalTokens: 500 },
        },
      });

      const result = await planRefiner.adjustForConstraints(mockPlan, { budget: '$500' }, mockContext);

      expect(result).toEqual(adjustedPlan);
      expect(mockGenerateContent).toHaveBeenCalled();
      expect(UsageService.recordTokens).toHaveBeenCalledWith('ws-abc', { totalTokens: 500 });
    });

    it('should throw an error if the AI call fails', async () => {
        mockGenerateContent.mockRejectedValue(new Error('AI API Error'));
        await expect(planRefiner.adjustForConstraints(mockPlan, { budget: '$500' }, mockContext)).rejects.toThrow('AI API Error');
    });
  });

  describe('addAlternatives', () => {
    it('should successfully generate alternatives', async () => {
      const alternatives = [{ approach: 'alt 1' }];
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({ alternatives }),
          usageMetadata: { totalTokens: 200 },
        },
      });

      const result = await planRefiner.addAlternatives(mockPlan, 'an idea', mockContext);
      expect(result).toEqual(alternatives);
    });

    it('should return an empty array if AI call fails (but not for guard errors)', async () => {
        mockGenerateContent.mockRejectedValue(new Error('AI API Error'));
        const result = await planRefiner.addAlternatives(mockPlan, 'an idea', mockContext);
        expect(result).toEqual([]);
    });

    it('should return an empty array if JSON parsing fails', async () => {
        mockGenerateContent.mockResolvedValue({
            response: { text: () => 'not json', usageMetadata: { totalTokens: 10 } },
        });
        const result = await planRefiner.addAlternatives(mockPlan, 'an idea', mockContext);
        expect(result).toEqual([]);
    });

    it('should still throw guard errors like AuthorizationError', async () => {
        const differentWorkspaceContext = { ...mockContext, user: { ...mockContext.user, workspaceId: 'ws-def' } };
        await expect(planRefiner.addAlternatives(mockPlan, 'an idea', differentWorkspaceContext)).rejects.toThrow(AuthorizationError);
    });
  });

  describe('optimizeTimeline', () => {
    it('should successfully optimize the timeline', async () => {
        const newPhases = [{ id: 1, name: 'Optimized Phase 1' }];
        mockGenerateContent.mockResolvedValue({
            response: { text: () => JSON.stringify(newPhases), usageMetadata: { totalTokens: 100 } },
        });
        const result = await planRefiner.optimizeTimeline(mockPlan, '3 months', mockContext);
        expect(result).toEqual(newPhases);
    });

    it('should return original phases if AI call fails', async () => {
        mockGenerateContent.mockRejectedValue(new Error('AI API Error'));
        const result = await planRefiner.optimizeTimeline(mockPlan, '3 months', mockContext);
        expect(result).toEqual(mockPlan.phases);
    });

    it('should return original phases if JSON parsing fails', async () => {
        mockGenerateContent.mockResolvedValue({
            response: { text: () => 'not json', usageMetadata: { totalTokens: 10 } },
        });
        const result = await planRefiner.optimizeTimeline(mockPlan, '3 months', mockContext);
        expect(result).toEqual(mockPlan.phases);
    });
  });

  describe('optimizeBudget', () => {
    it('should successfully optimize the budget', async () => {
        const newResources = { budget: 500 };
        mockGenerateContent.mockResolvedValue({
            response: { text: () => JSON.stringify(newResources), usageMetadata: { totalTokens: 100 } },
        });
        const result = await planRefiner.optimizeBudget(mockPlan, '$500', mockContext);
        expect(result).toEqual(newResources);
    });

    it('should return original resources if AI call fails', async () => {
        mockGenerateContent.mockRejectedValue(new Error('AI API Error'));
        const result = await planRefiner.optimizeBudget(mockPlan, '$500', mockContext);
        expect(result).toEqual(mockPlan.resources);
    });
  });

  describe('expandSection', () => {
    it('should successfully expand a section', async () => {
        const expandedIntro = { summary: 'A simple plan with a lot more detail now.' };
        mockGenerateContent.mockResolvedValue({
            response: { text: () => JSON.stringify(expandedIntro), usageMetadata: { totalTokens: 300 } },
        });
        const result = await planRefiner.expandSection(mockPlan, 'introduction', mockContext);
        expect(result).toEqual(expandedIntro);
    });

    it('should return original section if AI call fails', async () => {
        mockGenerateContent.mockRejectedValue(new Error('AI API Error'));
        const result = await planRefiner.expandSection(mockPlan, 'introduction', mockContext);
        expect(result).toEqual(mockPlan.introduction);
    });
  });

  describe('simplifyPlan', () => {
    it('should successfully simplify a plan', async () => {
        const simplifiedPlan = { ...mockPlan, title: 'Simple Plan' };
        mockGenerateContent.mockResolvedValue({
            response: { text: () => JSON.stringify(simplifiedPlan), usageMetadata: { totalTokens: 400 } },
        });
        const result = await planRefiner.simplifyPlan(mockPlan, mockContext);
        expect(result).toEqual(simplifiedPlan);
    });

    it('should return original plan if JSON parsing fails', async () => {
        mockGenerateContent.mockResolvedValue({
            response: { text: () => 'not json', usageMetadata: { totalTokens: 10 } },
        });
        const result = await planRefiner.simplifyPlan(mockPlan, mockContext);
        expect(result).toEqual(mockPlan);
    });
  });

  describe('applyFeedback', () => {
    it('should successfully apply feedback to a plan', async () => {
        const improvedPlan = { ...mockPlan, title: 'Improved Plan' };
        mockGenerateContent.mockResolvedValue({
            response: { text: () => JSON.stringify(improvedPlan), usageMetadata: { totalTokens: 600 } },
        });
        const result = await planRefiner.applyFeedback(mockPlan, 'Improve the title', [], mockContext);
        expect(result).toEqual(improvedPlan);
    });

    it('should include conversation history in the prompt', async () => {
        const history = [{ role: 'user', parts: [{ text: 'Old feedback' }] }];
        await planRefiner.applyFeedback(mockPlan, 'New feedback', history, mockContext);
        
        const prompt = mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;
        expect(prompt).toContain('Previous Conversation:');
        expect(prompt).toContain('Old feedback');
    });

    it('should throw an error if the AI call fails', async () => {
        mockGenerateContent.mockRejectedValue(new Error('AI API Error'));
        await expect(planRefiner.applyFeedback(mockPlan, 'feedback', [], mockContext)).rejects.toThrow('AI API Error');
    });
  });
});