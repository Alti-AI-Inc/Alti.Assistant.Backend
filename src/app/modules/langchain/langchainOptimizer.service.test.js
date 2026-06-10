import { describe, it, expect, vi, beforeEach } from 'vitest';
import { langchainOptimizerService } from './langchainOptimizer.service.js';

// Mock dependencies
const mockGeminiSecretKey = 'mock-gemini-secret-key';
const mockLoggerInfo = vi.fn();
const mockLoggerError = vi.fn();

const mockChainFindById = vi.fn();
const mockExecutionFind = vi.fn();

const mockGoogleGenerativeAI = vi.fn(() => ({
  getGenerativeModel: vi.fn(() => ({
    generateContent: vi.fn(),
  })),
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: mockGoogleGenerativeAI,
}));

vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: mockGeminiSecretKey,
  },
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: mockLoggerInfo,
    error: mockLoggerError,
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

describe('langchainOptimizerService', () => {
  const chainId = 'chain123';
  const userId = 'user456';

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock for GoogleGenerativeAI to ensure a fresh instance for each test
    mockGoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: vi.fn(() => ({
        generateContent: vi.fn(),
      })),
    }));
  });

  describe('optimizeChain', () => {
    it('should throw an error if chain is not found', async () => {
      mockChainFindById.mockReturnValueOnce({ lean: vi.fn().mockResolvedValueOnce(null) });

      await expect(langchainOptimizerService.optimizeChain(chainId, userId)).rejects.toThrow(
        `LangChain chain not found: ${chainId}`
      );
      expect(mockLoggerInfo).toHaveBeenCalledWith(`LangchainOptimizer: running diagnostics on chain ${chainId}`);
      expect(mockLoggerError).toHaveBeenCalled(); // Should log the error before re-throwing
    });

    it('should return a message if no execution traces are found', async () => {
      mockChainFindById.mockReturnValueOnce({
        lean: vi.fn().mockResolvedValueOnce({
          _id: chainId,
          name: 'Test Chain',
          description: 'A test chain',
          steps: [],
        }),
      });
      mockExecutionFind.mockReturnValueOnce({
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
      expect(mockLoggerInfo).toHaveBeenCalledWith(`LangchainOptimizer: running diagnostics on chain ${chainId}`);
      expect(mockExecutionFind).toHaveBeenCalledWith({ chainId, userId });
      expect(mockGoogleGenerativeAI().getGenerativeModel().generateContent).not.toHaveBeenCalled();
    });

    it('should successfully optimize a chain with execution data', async () => {
      const mockChain = {
        _id: chainId,
        name: 'Test Chain',
        description: 'A test chain description',
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

      const mockGeminiResponse = {
        response: {
          text: () =>
            JSON.stringify({
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
            }),
        },
      };

      mockChainFindById.mockReturnValueOnce({ lean: vi.fn().mockResolvedValueOnce(mockChain) });
      mockExecutionFind.mockReturnValueOnce({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValueOnce(mockExecutions),
      });

      const mockGenerateContent = vi.fn().mockResolvedValueOnce(mockGeminiResponse);
      mockGoogleGenerativeAI().getGenerativeModel().generateContent = mockGenerateContent;

      const result = await langchainOptimizerService.optimizeChain(chainId, userId);

      expect(mockLoggerInfo).toHaveBeenCalledWith(`LangchainOptimizer: running diagnostics on chain ${chainId}`);
      expect(mockChainFindById).toHaveBeenCalledWith(chainId);
      expect(mockExecutionFind).toHaveBeenCalledWith({ chainId, userId });

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      const promptCall = mockGenerateContent.mock.calls[0][0];
      expect(promptCall.generationConfig.temperature).toBe(0.2);
      expect(promptCall.generationConfig.responseMimeType).toBe('application/json');
      expect(promptCall.contents[0].parts[0].text).toContain('You are an expert AI compiler and LangChain optimizer.');
      expect(promptCall.contents[0].parts[0].text).toContain(
        JSON.stringify(
          {
            chainName: mockChain.name,
            chainDescription: mockChain.description,
            successRate: '67%',
            avgDurationMs: 2667,
            slowSteps: [{ stepName: 'step2', avgDurationMs: 5000 }],
            frequentFailures: [
              {
                stepName: 'step2',
                stepType: 'parser',
                input: 'input4',
                error: 'Parse error',
                timestamp: expect.any(Date),
              },
            ],
            stepsConfig: [
              { name: 'step1', type: 'prompt', config: { prompt: 'Initial prompt' } },
              { name: 'step2', type: 'parser', config: {} },
            ],
          },
          null,
          2
        )
      );

      expect(result).toEqual({
        success: true,
        chainId,
        telemetry: {
          totalTraces: 3,
          successRate: '67%',
          averageDurationMs: 2667,
        },
        optimization: JSON.parse(mockGeminiResponse.response.text()),
      });
      expect(mockLoggerError).not.toHaveBeenCalled();
    });

    it('should handle Gemini API errors gracefully', async () => {
      const mockChain = {
        _id: chainId,
        name: 'Test Chain',
        description: 'A test chain description',
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
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValueOnce(mockExecutions),
      });

      const geminiError = new Error('Gemini API failed');
      const mockGenerateContent = vi.fn().mockRejectedValueOnce(geminiError);
      mockGoogleGenerativeAI().getGenerativeModel().generateContent = mockGenerateContent;

      await expect(langchainOptimizerService.optimizeChain(chainId, userId)).rejects.toThrow(
        `Failed to generate chain optimizations: ${geminiError.message}`
      );
      expect(mockLoggerError).toHaveBeenCalledWith('LangchainOptimizer error:', geminiError);
    });

    it('should handle invalid JSON response from Gemini', async () => {
      const mockChain = {
        _id: chainId,
        name: 'Test Chain',
        description: 'A test chain description',
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
          text: () => 'This is not valid JSON',
        },
      };

      mockChainFindById.mockReturnValueOnce({ lean: vi.fn().mockResolvedValueOnce(mockChain) });
      mockExecutionFind.mockReturnValueOnce({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValueOnce(mockExecutions),
      });

      const mockGenerateContent = vi.fn().mockResolvedValueOnce(mockGeminiResponse);
      mockGoogleGenerativeAI().getGenerativeModel().generateContent = mockGenerateContent;

      await expect(langchainOptimizerService.optimizeChain(chainId, userId)).rejects.toThrow(
        'Failed to generate chain optimizations: Unexpected token \'T\', "This is not valid JSON" is not valid JSON'
      );
      expect(mockLoggerError).toHaveBeenCalled(); // Expect logger.error to be called due to JSON.parse error
    });
  });
});