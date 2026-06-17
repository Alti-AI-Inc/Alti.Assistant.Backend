import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockLoggerInfo,
  mockLoggerError,
  mockChainFindById,
  mockExecutionFind,
  mockUser,
  mockTenant,
  mockNotification,
  mockGenerateContent,
  mockGetGenerativeModel,
  mockVertexAI
} = vi.hoisted(() => {
  const mockLoggerInfo = vi.fn();
  const mockLoggerError = vi.fn();

  const mockChainFindById = vi.fn();
  const mockExecutionFind = vi.fn();

  const mockUser = {
    findById: vi.fn(),
    findOne: vi.fn(),
    find: vi.fn(),
  };

  const mockTenant = {
    findById: vi.fn(),
    findOneAndUpdate: vi.fn(),
  };

  const mockNotification = {
    insertMany: vi.fn(),
  };

  const mockGenerateContent = vi.fn();
  const mockGetGenerativeModel = vi.fn().mockReturnValue({
    generateContent: mockGenerateContent,
  });
  const mockVertexAI = vi.fn().mockImplementation(function() {
    return {
      getGenerativeModel: mockGetGenerativeModel,
    };
  });

  return {
    mockLoggerInfo,
    mockLoggerError,
    mockChainFindById,
    mockExecutionFind,
    mockUser,
    mockTenant,
    mockNotification,
    mockGenerateContent,
    mockGetGenerativeModel,
    mockVertexAI
  };
});

vi.mock('@google-cloud/vertexai', () => ({
  VertexAI: mockVertexAI,
  HarmCategory: {
    HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
    HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
  },
  HarmBlockThreshold: {
    BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE',
  },
}));

vi.mock('mongoose', () => ({
  default: {
    models: {
      User: mockUser,
      Tenant: mockTenant,
      Notification: mockNotification,
    },
    model: (name) => {
      if (name === 'User') return mockUser;
      if (name === 'Tenant') return mockTenant;
      if (name === 'Notification') return mockNotification;
    },
  },
}));

vi.mock('../../../../config/index.js', () => ({
  default: {
    google: {
      gcp_project_id: 'mock-project',
      gcp_location: 'us-central1',
    },
  },
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
    warn: vi.fn(),
  },
}));

vi.mock('./langchain-chain.model.js', () => ({
  default: {
    findById: mockChainFindById,
  },
}));

vi.mock('./langchain-execution.model.js', () => ({
  default: {
    find: mockExecutionFind,
  },
}));

// Import service after mocks are established
import { langchainOptimizerService } from './langchainOptimizer.service.js';

describe('langchainOptimizerService', () => {
  const chainId = 'chain123';
  const userId = 'user456';

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock responses for User and Tenant
    mockUser.findById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: userId,
        role: 'admin',
        tenantId: 'tenant123',
      }),
    });

    mockUser.find.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });

    mockUser.findOne.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
    });

    mockTenant.findById.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({
        _id: 'tenant123',
        name: 'Mock Tenant',
        status: 'active',
        aiUsage: {
          optimizationLimit: 100,
          optimizationCount: 0,
        },
      }),
    });

    mockTenant.findOneAndUpdate.mockResolvedValue({});
    mockNotification.insertMany.mockResolvedValue([]);
  });

  describe('optimizeChain', () => {
    it('should throw an error if chain is not found', async () => {
      mockChainFindById.mockReturnValueOnce({ lean: vi.fn().mockResolvedValueOnce(null) });

      await expect(langchainOptimizerService.optimizeChain(chainId, userId)).rejects.toThrow(
        `LangChain chain not found: ${chainId}`
      );
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'INFO',
          message: expect.stringContaining(`starting diagnostics on chain ${chainId}`),
        })
      );
      expect(mockLoggerError).toHaveBeenCalled(); // Should log the error before re-throwing
    });

    it('should return a message if no execution traces are found', async () => {
      mockChainFindById.mockReturnValueOnce({
        lean: vi.fn().mockResolvedValueOnce({
          _id: chainId,
          name: 'Test Chain',
          description: 'A test chain',
          steps: [],
          tenantId: 'tenant123',
          userId,
        }),
      });
      mockExecutionFind.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValueOnce([]),
      });

      const result = await langchainOptimizerService.optimizeChain(chainId, userId);

      expect(result).toEqual({
        success: true,
        message: 'No execution traces found for this chain. Execute the chain first to gather optimization telemetry.',
        recommendations: [],
      });
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'INFO',
          message: expect.stringContaining(`starting diagnostics on chain ${chainId}`),
        })
      );
      expect(mockExecutionFind).toHaveBeenCalledWith({ chainId, tenantId: 'tenant123' });
    });

    it('should successfully optimize a chain with execution data', async () => {
      const mockChain = {
        _id: chainId,
        name: 'Test Chain',
        description: 'A test chain description',
        tenantId: 'tenant123',
        userId,
        steps: [
          { name: 'step1', type: 'prompt', config: { prompt: 'Initial prompt' } },
          { name: 'step2', type: 'parser', config: {} },
        ],
      };
      const mockExecutions = [
        {
          _id: 'exec1',
          chainId,
          userId,
          status: 'success',
          totalDurationMs: 1000,
          createdAt: new Date(),
          stepsExecution: [
            { stepName: 'step1', stepType: 'prompt', durationMs: 500, status: 'success', input: 'input1' },
            { stepName: 'step2', stepType: 'parser', durationMs: 500, status: 'success', input: 'input2' },
          ],
        },
        {
          _id: 'exec2',
          chainId,
          userId,
          status: 'failed',
          totalDurationMs: 2000,
          createdAt: new Date(),
          stepsExecution: [
            { stepName: 'step1', stepType: 'prompt', durationMs: 1000, status: 'success', input: 'input3' },
            {
              stepName: 'step2',
              stepType: 'parser',
              durationMs: 1000,
              status: 'failed',
              input: 'input4',
              error: 'Parse error',
            },
          ],
        },
        {
          _id: 'exec3',
          chainId,
          userId,
          status: 'success',
          totalDurationMs: 5000, // Slow execution
          createdAt: new Date(),
          stepsExecution: [
            { stepName: 'step1', stepType: 'prompt', durationMs: 1000, status: 'success', input: 'input5' },
            { stepName: 'step2', stepType: 'parser', durationMs: 4000, status: 'success', input: 'input6' }, // Slow step
          ],
        },
      ];

      const responseText = JSON.stringify({
        traceSummary: {
          successRate: '67%',
          avgLatencyMs: 2667,
        },
        bottlenecks: [
          {
            stepName: 'step2',
            issue: 'Frequent parsing failures',
            recommendation: 'Review parser logic.',
          },
        ],
        promptRefinements: [],
        parameterTuning: [],
      });

      const mockGeminiResponse = {
        response: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: responseText,
                  },
                ],
              },
            },
          ],
        },
      };

      mockChainFindById.mockReturnValueOnce({ lean: vi.fn().mockResolvedValueOnce(mockChain) });
      mockExecutionFind.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValueOnce(mockExecutions),
      });

      mockGenerateContent.mockResolvedValueOnce(mockGeminiResponse);

      const result = await langchainOptimizerService.optimizeChain(chainId, userId);

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'INFO',
          message: expect.stringContaining(`starting diagnostics on chain ${chainId}`),
        })
      );
      expect(mockChainFindById).toHaveBeenCalledWith(chainId);
      expect(mockExecutionFind).toHaveBeenCalledWith({ chainId, tenantId: 'tenant123' });

      expect(mockGetGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-1.5-flash-001',
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        })
      );

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const promptCall = mockGenerateContent.mock.calls[0][0];
      expect(promptCall.contents[0].parts[0].text).toContain('You are an expert AI compiler and LangChain optimizer.');
      expect(promptCall.contents[0].parts[0].text).toContain('Test Chain');
      expect(promptCall.contents[0].parts[0].text).toContain('A test chain description');
      expect(promptCall.contents[0].parts[0].text).toContain('67%');
      expect(promptCall.contents[0].parts[0].text).toContain('step2');
      expect(promptCall.contents[0].parts[0].text).toContain('Parse error');

      expect(result).toEqual({
        success: true,
        chainId,
        telemetry: {
          totalTraces: 3,
          successRate: '67%',
          averageDurationMs: 2667,
        },
        optimization: JSON.parse(responseText),
      });
      expect(mockLoggerError).not.toHaveBeenCalled();
    });

    it('should handle Gemini API errors gracefully', async () => {
      const mockChain = {
        _id: chainId,
        name: 'Test Chain',
        description: 'A test chain description',
        tenantId: 'tenant123',
        userId,
        steps: [],
      };
      const mockExecutions = [
        {
          _id: 'exec1',
          chainId,
          userId,
          status: 'success',
          totalDurationMs: 1000,
          createdAt: new Date(),
          stepsExecution: [],
        },
      ];

      mockChainFindById.mockReturnValueOnce({ lean: vi.fn().mockResolvedValueOnce(mockChain) });
      mockExecutionFind.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValueOnce(mockExecutions),
      });

      const geminiError = new Error('Gemini API failed');
      mockGenerateContent.mockRejectedValueOnce(geminiError);

      await expect(langchainOptimizerService.optimizeChain(chainId, userId)).rejects.toThrow(
        'An unexpected error occurred while optimizing the chain.'
      );
      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'ERROR',
          message: expect.stringContaining(`LangchainOptimizer error on chain ${chainId}`),
        })
      );
    });

    it('should handle invalid JSON response from Gemini', async () => {
      const mockChain = {
        _id: chainId,
        name: 'Test Chain',
        description: 'A test chain description',
        tenantId: 'tenant123',
        userId,
        steps: [],
      };
      const mockExecutions = [
        {
          _id: 'exec1',
          chainId,
          userId,
          status: 'success',
          totalDurationMs: 1000,
          createdAt: new Date(),
          stepsExecution: [],
        },
      ];

      const mockGeminiResponse = {
        response: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'This is not valid JSON',
                  },
                ],
              },
            },
          ],
        },
      };

      mockChainFindById.mockReturnValueOnce({ lean: vi.fn().mockResolvedValueOnce(mockChain) });
      mockExecutionFind.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValueOnce(mockExecutions),
      });

      mockGenerateContent.mockResolvedValueOnce(mockGeminiResponse);

      await expect(langchainOptimizerService.optimizeChain(chainId, userId)).rejects.toThrow(
        'Failed to parse optimization suggestions from the AI model. The model may have returned an invalid format.'
      );
      expect(mockLoggerError).toHaveBeenCalled(); // Expect logger.error to be called due to JSON.parse error
    });
  });
});