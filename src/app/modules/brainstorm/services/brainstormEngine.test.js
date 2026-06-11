import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { brainstormEngine } from './brainstormEngine.js';
import { usageService } from '../../usage/usage.service.js';
import { logger } from '../../../../shared/logger.js';
import { AppError } from '../../../../shared/errors/AppError.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Mock dependencies
vi.mock('@google/generative-ai');
vi.mock('../../usage/usage.service.js', () => ({
  usageService: {
    trackAndVerify: vi.fn(),
  },
}));
vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('../../../../shared/errors/AppError.js');

// Mock implementation for the AI model
const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
  generateContent: mockGenerateContent,
}));

GoogleGenerativeAI.mockImplementation(() => ({
  getGenerativeModel: mockGetGenerativeModel,
}));

describe('brainstormEngine', () => {
  const mockContext = {
    user: { id: 'user-123', role: 'user' },
    workspace: { id: 'ws-456' },
  };

  const mockUsageMetadata = {
    promptTokenCount: 150,
    candidatesTokenCount: 850,
    totalTokenCount: 1000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    usageService.trackAndVerify.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- generateIdeas Tests ---
  describe('generateIdeas', () => {
    const baseParams = {
      idea: 'A new social media app for pet owners',
      brainstormType: 'product feature',
    };
    const mockResponseData = { mainIdeas: [{ id: 1, title: 'Pet Profiles' }] };

    beforeEach(() => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(mockResponseData),
          usageMetadata: mockUsageMetadata,
        },
      });
    });

    it('should generate ideas successfully with basic parameters', async () => {
      const result = await brainstormEngine.generateIdeas(baseParams, mockContext);

      expect(result).toEqual(mockResponseData);
      expect(mockGetGenerativeModel).toHaveBeenCalledWith(expect.any(Object));
      expect(mockGenerateContent).toHaveBeenCalledOnce();
      const prompt = mockGenerateContent.mock.calls[0][0];
      expect(prompt).toContain(baseParams.idea);
      expect(prompt).toContain('Technique: Free Association'); // Default technique
      expect(prompt).toContain('Depth Level: Standard'); // Default depth
      expect(usageService.trackAndVerify).toHaveBeenCalledWith({
        workspaceId: mockContext.workspace.id,
        userId: mockContext.user.id,
        feature: 'brainstorm_generate',
        tokens: {
          prompt: mockUsageMetadata.promptTokenCount,
          completion: mockUsageMetadata.candidatesTokenCount,
          total: mockUsageMetadata.totalTokenCount,
        },
      });
      expect(logger.info).toHaveBeenCalledWith(
        'Brainstorm ideas generated successfully',
        expect.any(Object)
      );
    });

    it('should build a comprehensive prompt with all optional parameters', async () => {
      const fullParams = {
        ...baseParams,
        technique: 'SCAMPER',
        perspectives: ['Technical', 'Marketing'],
        depth: 'Deep',
        focusAreas: ['Monetization', 'User Engagement'],
        constraints: {
          budget: '$50,000',
          timeline: '6 months',
          technology: ['React Native', 'Firebase'],
          targetAudience: 'Millennial dog owners',
          industry: 'Social Tech',
          competitors: ['Petfinder', 'Dog-stagram'],
        },
        additionalInstructions: 'Focus on gamification.',
      };

      await brainstormEngine.generateIdeas(fullParams, mockContext);

      expect(mockGenerateContent).toHaveBeenCalledOnce();
      const prompt = mockGenerateContent.mock.calls[0][0];
      expect(prompt).toContain('Technique: SCAMPER');
      expect(prompt).toContain('Perspectives: Technical, Marketing');
      expect(prompt).toContain('Depth Level: Deep');
      expect(prompt).toContain('Prioritize these focus areas: Monetization, User Engagement');
      expect(prompt).toContain('Budget: $50,000');
      expect(prompt).toContain('Timeline: 6 months');
      expect(prompt).toContain('Technology: React Native, Firebase');
      expect(prompt).toContain('Target Audience: Millennial dog owners');
      expect(prompt).toContain('Industry: Social Tech');
      expect(prompt).toContain('Competitors: Petfinder, Dog-stagram');
      expect(prompt).toContain('Additional Instructions: Focus on gamification.');
    });

    it('should throw a 401 AppError if context is missing', async () => {
      await expect(brainstormEngine.generateIdeas(baseParams, null)).rejects.toThrow(AppError);
      await expect(brainstormEngine.generateIdeas(baseParams, null)).rejects.toThrow(
        'Unauthorized: Missing user or workspace context.'
      );
    });

    it('should throw a 401 AppError if context.user is missing', async () => {
      await expect(
        brainstormEngine.generateIdeas(baseParams, { workspace: mockContext.workspace })
      ).rejects.toThrow('Unauthorized: Missing user or workspace context.');
    });

    it('should re-throw AppError from usageService', async () => {
      const limitError = new AppError('Usage limit exceeded', 429);
      usageService.trackAndVerify.mockRejectedValue(limitError);

      await expect(brainstormEngine.generateIdeas(baseParams, mockContext)).rejects.toThrow(
        'Usage limit exceeded'
      );
      expect(logger.error).not.toHaveBeenCalled(); // Should not log re-thrown AppErrors
    });

    it('should handle AI generation errors and throw a 500 AppError', async () => {
      const aiError = new Error('AI model failed');
      mockGenerateContent.mockRejectedValue(aiError);

      await expect(brainstormEngine.generateIdeas(baseParams, mockContext)).rejects.toThrow(
        'Failed to generate brainstorm ideas due to an internal error.'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error generating brainstorm ideas:',
        expect.objectContaining({
          error: aiError.message,
          workspaceId: mockContext.workspace.id,
        })
      );
    });

    it('should handle JSON parsing errors and throw a 500 AppError', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => 'This is not valid JSON',
          usageMetadata: mockUsageMetadata,
        },
      });

      await expect(brainstormEngine.generateIdeas(baseParams, mockContext)).rejects.toThrow(
        'Failed to generate brainstorm ideas due to an internal error.'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error generating brainstorm ideas:',
        expect.any(Object)
      );
    });
  });

  // --- applySCAMPER Tests ---
  describe('applySCAMPER', () => {
    const idea = 'A smart coffee mug';
    const mockResponseData = { substitute: ['use ceramic instead of plastic'] };

    beforeEach(() => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(mockResponseData),
          usageMetadata: mockUsageMetadata,
        },
      });
    });

    it('should apply SCAMPER technique successfully', async () => {
      const result = await brainstormEngine.applySCAMPER(idea, mockContext);

      expect(result).toEqual(mockResponseData);
      expect(mockGenerateContent).toHaveBeenCalledOnce();
      const prompt = mockGenerateContent.mock.calls[0][0];
      expect(prompt).toContain(idea);
      expect(prompt).toContain('Apply the SCAMPER technique');
      expect(usageService.trackAndVerify).toHaveBeenCalledWith(
        expect.objectContaining({ feature: 'brainstorm_scamper' })
      );
    });

    it('should throw a 401 AppError if context is missing', async () => {
      await expect(brainstormEngine.applySCAMPER(idea, null)).rejects.toThrow(
        'Unauthorized: Missing user or workspace context.'
      );
    });

    it('should handle AI errors and throw a 500 AppError', async () => {
      const aiError = new Error('AI model failed');
      mockGenerateContent.mockRejectedValue(aiError);

      await expect(brainstormEngine.applySCAMPER(idea, mockContext)).rejects.toThrow(
        'Failed to apply SCAMPER due to an internal error.'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error applying SCAMPER:',
        expect.objectContaining({ error: aiError.message })
      );
    });
  });

  // --- performSWOT Tests ---
  describe('performSWOT', () => {
    const idea = 'A new delivery drone service';
    const mockResponseData = { strengths: [{ title: 'Fast delivery' }] };

    beforeEach(() => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(mockResponseData),
          usageMetadata: mockUsageMetadata,
        },
      });
    });

    it('should perform SWOT analysis successfully', async () => {
      const result = await brainstormEngine.performSWOT(idea, mockContext);

      expect(result).toEqual(mockResponseData);
      expect(mockGenerateContent).toHaveBeenCalledOnce();
      const prompt = mockGenerateContent.mock.calls[0][0];
      expect(prompt).toContain(idea);
      expect(prompt).toContain('Perform a SWOT analysis');
      expect(usageService.trackAndVerify).toHaveBeenCalledWith(
        expect.objectContaining({ feature: 'brainstorm_swot' })
      );
    });

    it('should throw a 401 AppError if context is missing', async () => {
      await expect(brainstormEngine.performSWOT(idea, null)).rejects.toThrow(
        'Unauthorized: Missing user or workspace context.'
      );
    });

    it('should handle AI errors and throw a 500 AppError', async () => {
      const aiError = new Error('AI model failed');
      mockGenerateContent.mockRejectedValue(aiError);

      await expect(brainstormEngine.performSWOT(idea, mockContext)).rejects.toThrow(
        'Failed to perform SWOT analysis due to an internal error.'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error performing SWOT:',
        expect.objectContaining({ error: aiError.message })
      );
    });
  });

  // --- refineIdea Tests ---
  describe('refineIdea', () => {
    const originalIdea = 'A basic to-do list app';
    const feedback = 'It needs to be more collaborative';
    const focusOn = ['team features', 'integrations'];
    const mockResponseData = { refinedIdeas: [{ title: 'Collaborative Task Manager' }] };

    beforeEach(() => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(mockResponseData),
          usageMetadata: mockUsageMetadata,
        },
      });
    });

    it('should refine an idea successfully', async () => {
      const result = await brainstormEngine.refineIdea(originalIdea, feedback, focusOn, mockContext);

      expect(result).toEqual(mockResponseData);
      expect(mockGenerateContent).toHaveBeenCalledOnce();
      const prompt = mockGenerateContent.mock.calls[0][0];
      expect(prompt).toContain(originalIdea);
      expect(prompt).toContain(feedback);
      expect(prompt).toContain('Focus refinement on: team features, integrations');
      expect(usageService.trackAndVerify).toHaveBeenCalledWith(
        expect.objectContaining({ feature: 'brainstorm_refine' })
      );
    });

    it('should throw a 401 AppError if context is missing', async () => {
      await expect(brainstormEngine.refineIdea(originalIdea, feedback, focusOn, null)).rejects.toThrow(
        'Unauthorized: Missing user or workspace context.'
      );
    });

    it('should handle AI errors and throw a 500 AppError', async () => {
      const aiError = new Error('AI model failed');
      mockGenerateContent.mockRejectedValue(aiError);

      await expect(
        brainstormEngine.refineIdea(originalIdea, feedback, focusOn, mockContext)
      ).rejects.toThrow('Failed to refine idea due to an internal error.');
      expect(logger.error).toHaveBeenCalledWith(
        'Error refining idea:',
        expect.objectContaining({ error: aiError.message })
      );
    });
  });

  // --- analyzeFromPerspectives Tests ---
  describe('analyzeFromPerspectives', () => {
    const idea = 'A subscription box for rare plants';
    const perspectives = ['Business', 'Logistics'];
    const mockResponseData = { business: { opportunities: ['High margin'] } };

    beforeEach(() => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify(mockResponseData),
          usageMetadata: mockUsageMetadata,
        },
      });
    });

    it('should analyze an idea from perspectives successfully', async () => {
      const result = await brainstormEngine.analyzeFromPerspectives(idea, perspectives, mockContext);

      expect(result).toEqual(mockResponseData);
      expect(mockGenerateContent).toHaveBeenCalledOnce();
      const prompt = mockGenerateContent.mock.calls[0][0];
      expect(prompt).toContain(idea);
      expect(prompt).toContain('Perspectives to analyze: Business, Logistics');
      expect(usageService.trackAndVerify).toHaveBeenCalledWith(
        expect.objectContaining({ feature: 'brainstorm_perspectives' })
      );
    });

    it('should throw a 401 AppError if context is missing', async () => {
      await expect(
        brainstormEngine.analyzeFromPerspectives(idea, perspectives, null)
      ).rejects.toThrow('Unauthorized: Missing user or workspace context.');
    });

    it('should handle AI errors and throw a 500 AppError', async () => {
      const aiError = new Error('AI model failed');
      mockGenerateContent.mockRejectedValue(aiError);

      await expect(
        brainstormEngine.analyzeFromPerspectives(idea, perspectives, mockContext)
      ).rejects.toThrow('Failed to analyze perspectives due to an internal error.');
      expect(logger.error).toHaveBeenCalledWith(
        'Error analyzing perspectives:',
        expect.objectContaining({ error: aiError.message })
      );
    });
  });
});