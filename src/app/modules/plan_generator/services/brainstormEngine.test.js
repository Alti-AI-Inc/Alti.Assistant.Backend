import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock dependencies
const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
  generateContent: mockGenerateContent,
}));
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

const mockConsume = vi.fn();
vi.mock('rate-limiter-flexible', () => ({
  RateLimiterRedis: vi.fn(() => ({
    consume: mockConsume,
  })),
}));

vi.mock('../../../../shared/redis.js', () => ({
  default: {}, // Mock redis client
}));

vi.mock('../../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock-key',
  },
}));

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
};
vi.mock('../../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

// Import the module to be tested
import {
  generateBrainstorm,
  generateSWOT,
  identifyStakeholders,
  defineSuccessMetrics,
  estimateResources,
} from './brainstormEngine.js';

// Test data
const sampleIdea = 'A new AI-powered coffee machine';
const sampleAnalysis = {
  plan_type: 'Business Plan',
  complexity: 'Medium',
  domains: ['Technology', 'Retail'],
  key_concepts: ['AI', 'Coffee', 'Automation'],
};
const sampleLimiterKey = 'user-123';

describe('brainstormEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    mockConsume.mockResolvedValue(undefined);
  });

  describe('generateBrainstorm', () => {
    it('should generate a brainstorm successfully with default aspects', async () => {
      const mockResponse = {
        swot_analysis: { strengths: ['Innovative'] },
        resource_needs: { budget_estimate: '$50k' },
        timeline_estimation: { total_duration: '6 months' },
        key_insights: ['High market potential'],
      };
      const mockResponseText = `\`\`\`json\n${JSON.stringify(mockResponse)}\n\`\`\``;
      mockGenerateContent.mockResolvedValue({
        response: { text: () => mockResponseText },
      });

      const result = await generateBrainstorm(sampleLimiterKey, sampleIdea, sampleAnalysis);

      expect(mockConsume).toHaveBeenCalledWith(sampleLimiterKey);
      expect(mockGetGenerativeModel).toHaveBeenCalled();
      expect(mockGenerateContent).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
      expect(mockLogger.info).toHaveBeenCalledWith('Brainstorming completed successfully');
    });

    it('should use requested aspects and context constraints in the prompt', async () => {
      const mockResponse = { key_insights: ['Constraints are tight'] };
      const mockResponseText = JSON.stringify(mockResponse);
      mockGenerateContent.mockResolvedValue({
        response: { text: () => mockResponseText },
      });

      const requestedAspects = ['SWOT_ANALYSIS'];
      const contextData = { constraints: { budget: '< $10k' } };

      await generateBrainstorm(sampleLimiterKey, sampleIdea, sampleAnalysis, requestedAspects, contextData);

      expect(mockGenerateContent).toHaveBeenCalled();
      const generatedPrompt = mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;

      expect(generatedPrompt).toContain('SWOT ANALYSIS');
      expect(generatedPrompt).not.toContain('RESOURCE NEEDS');
      expect(generatedPrompt).toContain('Constraints: {"budget":"< $10k"}');
    });

    it('should throw a 429 error when rate limited', async () => {
      const rateLimiterError = { msBeforeNext: 3600000 };
      mockConsume.mockRejectedValue(rateLimiterError);

      let thrownError;
      try {
        await generateBrainstorm(sampleLimiterKey, sampleIdea, sampleAnalysis);
      } catch (e) {
        thrownError = e;
      }

      expect(thrownError).toBeInstanceOf(Error);
      expect(thrownError.message).toBe('Too many brainstorm requests. Please try again in an hour.');
      expect(thrownError.status).toBe(429);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should re-throw unexpected errors from the rate limiter', async () => {
      const unexpectedError = new Error('Redis connection failed');
      mockConsume.mockRejectedValue(unexpectedError);

      await expect(
        generateBrainstorm(sampleLimiterKey, sampleIdea, sampleAnalysis)
      ).rejects.toThrow('Redis connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith('Unexpected error during rate limit check:', unexpectedError);
    });

    it('should throw an error if the AI model fails', async () => {
      const modelError = new Error('AI model failed');
      mockGenerateContent.mockRejectedValue(modelError);

      await expect(
        generateBrainstorm(sampleLimiterKey, sampleIdea, sampleAnalysis)
      ).rejects.toThrow('AI model failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Error generating brainstorm:', modelError);
    });

    it('should throw an error if the AI response does not contain JSON', async () => {
      mockGenerateContent.mockResolvedValue({
        response: { text: () => 'This is not a JSON response.' },
      });

      await expect(
        generateBrainstorm(sampleLimiterKey, sampleIdea, sampleAnalysis)
      ).rejects.toThrow('Failed to extract JSON from brainstorm');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('generateSWOT', () => {
    it('should generate a SWOT analysis successfully', async () => {
      const mockResponse = {
        strengths: ['S1'],
        weaknesses: ['W1'],
        opportunities: ['O1'],
        threats: ['T1'],
      };
      const mockResponseText = JSON.stringify(mockResponse);
      mockGenerateContent.mockResolvedValue({
        response: { text: () => mockResponseText },
      });

      const result = await generateSWOT(sampleLimiterKey, sampleIdea);

      expect(mockConsume).toHaveBeenCalledWith(sampleLimiterKey);
      expect(result).toEqual(mockResponse);
    });

    it('should throw a 429 error when rate limited', async () => {
      const rateLimiterError = { msBeforeNext: 3600000 };
      mockConsume.mockRejectedValue(rateLimiterError);

      let thrownError;
      try {
        await generateSWOT(sampleLimiterKey, sampleIdea);
      } catch (e) {
        thrownError = e;
      }

      expect(thrownError).toBeInstanceOf(Error);
      expect(thrownError.message).toBe('Too many SWOT requests. Please try again in an hour.');
      expect(thrownError.status).toBe(429);
    });

    it('should return null and log an error if the AI model fails', async () => {
      const modelError = new Error('AI model failed');
      mockGenerateContent.mockRejectedValue(modelError);

      const result = await generateSWOT(sampleLimiterKey, sampleIdea);

      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith('Error generating SWOT:', modelError);
    });

    it('should return null if the AI response does not contain JSON', async () => {
      mockGenerateContent.mockResolvedValue({
        response: { text: () => 'No JSON here.' },
      });

      const result = await generateSWOT(sampleLimiterKey, sampleIdea);
      expect(result).toBeNull();
    });
  });

  describe('identifyStakeholders', () => {
    it('should correctly identify and categorize stakeholders', () => {
      const brainstorm = {
        stakeholder_mapping: {
          primary_stakeholders: ['Customers', 'Development Team'],
          secondary_stakeholders: ['Investors', 'Marketing Management'],
        },
      };

      const result = identifyStakeholders(brainstorm, {});

      expect(result.primary).toEqual(['Customers', 'Development Team']);
      expect(result.secondary).toEqual(['Investors', 'Marketing Management']);
      expect(result.internal).toEqual(['Development Team', 'Marketing Management']);
      expect(result.external).toEqual(['Customers', 'Investors']);
    });

    it('should handle missing stakeholder data gracefully', () => {
      const brainstorm = {};
      const result = identifyStakeholders(brainstorm, {});

      expect(result).toEqual({
        primary: [],
        secondary: [],
        internal: [],
        external: [],
      });
    });

    it('should handle empty stakeholder arrays', () => {
      const brainstorm = {
        stakeholder_mapping: {
          primary_stakeholders: [],
          secondary_stakeholders: [],
        },
      };
      const result = identifyStakeholders(brainstorm, {});

      expect(result).toEqual({
        primary: [],
        secondary: [],
        internal: [],
        external: [],
      });
    });
  });

  describe('defineSuccessMetrics', () => {
    it('should return metrics from the brainstorm object if present', () => {
      const brainstorm = {
        success_metrics: {
          kpis: [{ metric: 'User Engagement', target: '1000 DAU' }],
          milestones: ['Launch MVP'],
        },
      };

      const result = defineSuccessMetrics(brainstorm, 'Business Plan');

      expect(result.kpis).toEqual([{ metric: 'User Engagement', target: '1000 DAU' }]);
      expect(result.milestones).toEqual(['Launch MVP']);
      expect(result.measurement_frequency).toBe('weekly');
      expect(result.review_cycle).toBe('monthly');
    });

    it('should return default metrics if KPIs are missing', () => {
      const brainstorm = {
        success_metrics: {
          milestones: ['Launch MVP'],
        },
      };

      const result = defineSuccessMetrics(brainstorm, 'Business Plan');

      expect(result.kpis.length).toBe(3);
      expect(result.kpis[0].metric).toBe('Project Completion Rate');
      expect(result.milestones).toEqual(['Launch MVP']);
    });

    it('should return default metrics if success_metrics object is missing', () => {
      const brainstorm = {};
      const result = defineSuccessMetrics(brainstorm, 'Business Plan');

      expect(result.kpis.length).toBe(3);
      expect(result.milestones).toEqual([]);
    });
  });

  describe('estimateResources', () => {
    it('should extract resources from the brainstorm object', () => {
      const brainstorm = {
        resource_needs: {
          budget_estimate: '$100,000',
          team_composition: ['Project Manager', '2 Engineers'],
          tools_and_technology: ['Node.js', 'React'],
          infrastructure: ['AWS'],
        },
        timeline_estimation: {
          total_duration: '9 months',
        },
      };

      const result = estimateResources(brainstorm, 'High');

      expect(result).toEqual({
        budget: '$100,000',
        team: ['Project Manager', '2 Engineers'],
        tools: ['Node.js', 'React'],
        infrastructure: ['AWS'],
        timeline: '9 months',
      });
    });

    it('should return default values for missing resource fields', () => {
      const brainstorm = {
        resource_needs: {
          budget_estimate: '$50,000',
        },
      };

      const result = estimateResources(brainstorm, 'Medium');

      expect(result).toEqual({
        budget: '$50,000',
        team: [],
        tools: [],
        infrastructure: [],
        timeline: 'To be determined',
      });
    });

    it('should return all default values if resource_needs is missing', () => {
      const brainstorm = {};
      const result = estimateResources(brainstorm, 'Low');

      expect(result).toEqual({
        budget: 'To be determined',
        team: [],
        tools: [],
        infrastructure: [],
        timeline: 'To be determined',
      });
    });
  });
});