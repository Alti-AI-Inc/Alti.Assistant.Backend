import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { langchainEvaluatorService } from './langchainEvaluator.service.js';
import LangchainChain from './langchain-chain.model.js';
import LangchainChainVersion from './langchain-version.model.js';
import { LangchainExecutionService } from './langchainExecution.service.js';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';

// Mock dependencies
const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
  generateContent: mockGenerateContent,
}));
const mockVertexAI = vi.fn(() => ({
  getGenerativeModel: mockGetGenerativeModel,
}));

vi.mock('@google-cloud/vertexai', () => ({
  VertexAI: mockVertexAI,
  HarmCategory: {
    HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
    HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
  },
  HarmBlockThreshold: {
    BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE',
  },
}));

vi.mock('../../../../config/index.js', async (importOriginal) => {
    const originalConfig = await importOriginal();
    return {
        default: {
            ...originalConfig.default,
            gcp_project_id: 'test-project',
            gcp_location: 'us-central1',
        }
    };
});

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./langchain-chain.model.js', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('./langchain-version.model.js', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

vi.mock('./langchainExecution.service.js', () => ({
  LangchainExecutionService: {
    executeSteps: vi.fn(),
  },
}));

describe('langchainEvaluatorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('benchmarkVersions', () => {
    const mockChain = {
      _id: 'chainId123',
      name: 'Test Chain',
      version: 2,
      steps: [{ id: 'current_step_1' }],
      inputVariables: ['topic'],
    };

    const mockVersion1 = {
      _id: 'versionId1',
      chainId: 'chainId123',
      versionNumber: 1,
      steps: [{ id: 'v1_step_1' }],
    };

    const mockTestSuite = [
      {
        inputs: { topic: 'AI in healthcare' },
        expectedCriteria: 'Discuss benefits and risks.',
      },
    ];

    it('should run a successful benchmark between a specific version and current', async () => {
      // Arrange
      vi.mocked(LangchainChain.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockChain),
      });
      vi.mocked(LangchainChainVersion.findOne).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockVersion1),
      });

      // Mock execution for Version A (v1)
      vi.mocked(LangchainExecutionService.executeSteps)
        .mockResolvedValueOnce({
          success: true,
          outputs: { result: 'Version 1 output.' },
          tokenUsage: { totalTokens: 100 },
        });

      // Mock execution for Version B (current)
      vi.mocked(LangchainExecutionService.executeSteps)
        .mockResolvedValueOnce({
          success: true,
          outputs: { result: 'Version 2 (current) is better.' },
          tokenUsage: { totalTokens: 120 },
        });

      // Mock grading for Version A
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          candidates: [{
            content: { parts: [{ text: JSON.stringify({
              relevance: { score: 0.8, justification: 'Good' },
              factualAccuracy: { score: 0.9, justification: 'Accurate' },
              structureAdherence: { score: 0.85, justification: 'Okay' },
            }) }] },
          }],
        },
      });

      // Mock grading for Version B
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          candidates: [{
            content: { parts: [{ text: JSON.stringify({
              relevance: { score: 0.9, justification: 'Very good' },
              factualAccuracy: { score: 0.95, justification: 'Very accurate' },
              structureAdherence: { score: 1.0, justification: 'Perfect' },
            }) }] },
          }],
        },
      });

      // Act
      const result = await langchainEvaluatorService.benchmarkVersions('chainId123', 1, 'current', mockTestSuite, 'user123');

      // Assert
      expect(result.success).toBe(true);
      expect(result.chainName).toBe('Test Chain');
      expect(result.versionA).toBe('1');
      expect(result.versionB).toBe('current');
      expect(result.comparisons).toHaveLength(1);

      // Check summary calculations
      expect(result.summary.versionA.label).toBe('v1');
      expect(result.summary.versionA.avgRelevance).toBe(0.8);
      expect(result.summary.versionA.avgTokens).toBe(100);
      expect(result.summary.versionA.overallQualityScore).toBeCloseTo((0.8 + 0.9 + 0.85) / 3);

      expect(result.summary.versionB.label).toBe('Current (v2)');
      expect(result.summary.versionB.avgRelevance).toBe(0.9);
      expect(result.summary.versionB.avgTokens).toBe(120);
      expect(result.summary.versionB.overallQualityScore).toBeCloseTo((0.9 + 0.95 + 1.0) / 3);

      // Check delta calculations
      expect(result.summary.deltas.qualityScoreImprovement).toBeCloseTo(0.1);
      expect(result.summary.deltas.tokenEfficiencyDelta).toBe(20);

      // Check context passing
      expect(LangchainExecutionService.executeSteps).toHaveBeenCalledWith(expect.any(Array), expect.any(Object), 'user123');
    });

    it('should throw an error if the chain is not found', async () => {
      vi.mocked(LangchainChain.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });
      await expect(langchainEvaluatorService.benchmarkVersions('nonexistent', 1, 2, [], 'user123'))
        .rejects.toThrow('Chain not found: nonexistent');
    });

    it('should throw an error if a version snapshot is not found', async () => {
      vi.mocked(LangchainChain.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockChain),
      });
      vi.mocked(LangchainChainVersion.findOne).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });
      await expect(langchainEvaluatorService.benchmarkVersions('chainId123', 99, 'current', [], 'user123'))
        .rejects.toThrow('Version snapshot v99 not found for chain chainId123');
    });

    it('should handle execution failure for one version', async () => {
      vi.mocked(LangchainChain.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockChain),
      });
      vi.mocked(LangchainChainVersion.findOne).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockVersion1),
      });

      // Version A succeeds
      vi.mocked(LangchainExecutionService.executeSteps)
        .mockResolvedValueOnce({
          success: true,
          outputs: { result: 'Version 1 output.' },
          tokenUsage: { totalTokens: 100 },
        });
      // Version B fails
      vi.mocked(LangchainExecutionService.executeSteps)
        .mockRejectedValueOnce(new Error('Execution failed'));

      // Grading for A
      mockGenerateContent.mockResolvedValueOnce({
        response: { candidates: [{ content: { parts: [{ text: JSON.stringify({ relevance: { score: 0.8, justification: 'Good' }}) }] } }] }
      });

      const result = await langchainEvaluatorService.benchmarkVersions('chainId123', 1, 'current', mockTestSuite, 'user123');

      expect(result.success).toBe(true);
      expect(result.comparisons[0].versionA.success).toBe(true);
      expect(result.comparisons[0].versionB.success).toBe(false);
      expect(result.comparisons[0].versionB.error).toBe('Execution failed');
      expect(result.comparisons[0].versionB.grades.relevance.justification).toBe('Execution failed');
      expect(result.summary.versionB.overallQualityScore).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Error executing version B for test case 0'
      }));
    });

    it('should use a default test case if none is provided', async () => {
      vi.mocked(LangchainChain.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockChain),
      });
      vi.mocked(LangchainExecutionService.executeSteps).mockResolvedValue({
        success: true,
        outputs: {},
        tokenUsage: { totalTokens: 10 },
      });
      mockGenerateContent.mockResolvedValue({
        response: { candidates: [{ content: { parts: [{ text: JSON.stringify({ relevance: { score: 1.0 }}) }] } }] }
      });

      await langchainEvaluatorService.benchmarkVersions('chainId123', 'current', 'current', [], 'user123');

      expect(LangchainExecutionService.executeSteps).toHaveBeenCalledWith(
        mockChain.steps,
        { topic: 'Test input value' }, // Default input generated from inputVariables
        'user123'
      );
    });

    it('should redact PII from inputs and outputs before sending to Gemini', async () => {
        const piiTestSuite = [{
            inputs: { email: 'test@example.com' },
            expectedCriteria: 'Check PII'
        }];
        vi.mocked(LangchainChain.findById).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockChain) });
        vi.mocked(LangchainExecutionService.executeSteps).mockResolvedValue({
            success: true,
            outputs: { phone: '123-456-7890', ssn: '000-00-0000' },
            tokenUsage: { totalTokens: 10 }
        });
        mockGenerateContent.mockResolvedValue({
            response: { candidates: [{ content: { parts: [{ text: JSON.stringify({ relevance: { score: 1.0 }}) }] } }] }
        });

        await langchainEvaluatorService.benchmarkVersions('chainId123', 'current', 'current', piiTestSuite, 'user123');

        const promptSentToGemini = mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;
        
        expect(promptSentToGemini).toContain('[EMAIL_REDACTED]');
        expect(promptSentToGemini).toContain('[PHONE_REDACTED]');
        expect(promptSentToGemini).toContain('[SSN_REDACTED]');
        expect(promptSentToGemini).not.toContain('test@example.com');
        expect(promptSentToGemini).not.toContain('123-456-7890');
        expect(promptSentToGemini).not.toContain('000-00-0000');
    });

    it('should handle Gemini grading failure gracefully', async () => {
        vi.mocked(LangchainChain.findById).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockChain) });
        vi.mocked(LangchainExecutionService.executeSteps).mockResolvedValue({
            success: true,
            outputs: { result: 'Some output' },
            tokenUsage: { totalTokens: 10 }
        });
        // Mock Gemini API to throw an error
        mockGenerateContent.mockRejectedValue(new Error('API limit reached'));

        const result = await langchainEvaluatorService.benchmarkVersions('chainId123', 'current', 'current', mockTestSuite, 'user123');

        expect(result.comparisons[0].versionA.grades.relevance.score).toBe(0.0);
        expect(result.comparisons[0].versionA.grades.relevance.justification).toBe('Grading failed: API limit reached');
        expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({
            message: 'Gemini grader failed',
            error: expect.objectContaining({ message: 'API limit reached' })
        }));
    });

    it('should handle unparsable JSON from Gemini', async () => {
        vi.mocked(LangchainChain.findById).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockChain) });
        vi.mocked(LangchainExecutionService.executeSteps).mockResolvedValue({
            success: true,
            outputs: { result: 'Some output' },
            tokenUsage: { totalTokens: 10 }
        });
        mockGenerateContent.mockResolvedValue({
            response: { candidates: [{ content: { parts: [{ text: 'This is not JSON' }] } }] }
        });

        const result = await langchainEvaluatorService.benchmarkVersions('chainId123', 'current', 'current', mockTestSuite, 'user123');

        expect(result.comparisons[0].versionA.grades.relevance.score).toBe(0.0);
        expect(result.comparisons[0].versionA.grades.relevance.justification).toBe('Failed to parse Gemini response');
        expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
            message: 'Failed to parse Gemini grader output JSON.'
        }));
    });

    it('should return default scores if Vertex AI is not configured', async () => {
        // Temporarily modify the mocked config for this test
        vi.mocked(config, true).gcp_project_id = undefined;
        // Need to re-import the service to make it re-evaluate the config
        const { langchainEvaluatorService: serviceWithoutConfig } = await import('./langchainEvaluator.service.js?t=' + Date.now());

        vi.mocked(LangchainChain.findById).mockReturnValue({ lean: vi.fn().mockResolvedValue(mockChain) });
        vi.mocked(LangchainExecutionService.executeSteps).mockResolvedValue({
            success: true,
            outputs: { result: 'Some output' },
            tokenUsage: { totalTokens: 10 }
        });

        const result = await serviceWithoutConfig.benchmarkVersions('chainId123', 'current', 'current', mockTestSuite, 'user123');

        expect(result.comparisons[0].versionA.grades.relevance.score).toBe(0.0);
        expect(result.comparisons[0].versionA.grades.relevance.justification).toBe('Grading skipped: Vertex AI not configured');
        expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
            message: 'Attempted to grade output, but Vertex AI is not initialized due to missing configuration. Returning default scores.'
        }));

        // Restore config for other tests
        vi.mocked(config, true).gcp_project_id = 'test-project';
    });
  });
});