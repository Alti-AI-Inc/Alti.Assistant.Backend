import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';
import { generateImageUsingVertexAI } from '../googleService.js';
import {
  generateClarifyingQuestions,
  isUserFinished,
  updateRefinedPrompt,
  compileFinalPrompt,
} from '../llmService.js';

// Mock external modules
vi.mock('@google-cloud/storage');
vi.mock('uuid', () => ({
  v4: vi.fn(),
}));
vi.mock('../googleService.js');
vi.mock('../llmService.js');

// Import the nodes and routers to be tested
import {
  analyzeInitialPromptNode,
  processUserResponseNode,
  askQuestionNode,
  getConfirmationNode,
  compileFinalPromptNode,
  generateImageNode,
  routeInitial,
  routeNextStep,
} from '../nodes.js';

// Mock console.log to prevent test output pollution
const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('Image Assistant Nodes and Routers', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    // Reset environment variables
    delete process.env.GCS_IMAGE_BUCKET;
  });

  afterEach(() => {
    // Restore console after all tests
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // --- Nodes ---

  describe('analyzeInitialPromptNode', () => {
    it('should generate questions and return the first one as response', async () => {
      generateClarifyingQuestions.mockResolvedValueOnce(['Q1', 'Q2', 'Q3']);

      const initialState = {
        initialPrompt: 'A cat in space',
        conversationHistory: [],
      };

      const result = await analyzeInitialPromptNode(initialState);

      expect(generateClarifyingQuestions).toHaveBeenCalledWith('A cat in space');
      expect(result).toEqual({
        refinedPrompt: 'A cat in space',
        questions: ['Q2', 'Q3'],
        responseMessage: 'Q1',
        conversationHistory: [{ type: 'ai', message: 'Q1' }],
      });
    });

    it('should return a default confirmation message if no questions are generated', async () => {
      generateClarifyingQuestions.mockResolvedValueOnce([]);

      const initialState = {
        initialPrompt: 'A detailed cat in space',
        conversationHistory: [],
      };

      const result = await analyzeInitialPromptNode(initialState);

      expect(generateClarifyingQuestions).toHaveBeenCalledWith('A detailed cat in space');
      expect(result).toEqual({
        refinedPrompt: 'A detailed cat in space',
        questions: [],
        responseMessage: "I don't have any specific questions, but I think I have a good amount of detail now. Should I proceed with generating the image, or is there anything else you'd like to add?",
        conversationHistory: [{ type: 'ai', message: "I don't have any specific questions, but I think I have a good amount of detail now. Should I proceed with generating the image, or is there anything else you'd like to add?" }],
      });
    });

    it('should handle errors from generateClarifyingQuestions', async () => {
      const errorMessage = 'LLM service error';
      generateClarifyingQuestions.mockRejectedValueOnce(new Error(errorMessage));

      const initialState = {
        initialPrompt: 'A cat in space',
        conversationHistory: [],
      };

      const result = await analyzeInitialPromptNode(initialState);

      expect(generateClarifyingQuestions).toHaveBeenCalledWith('A cat in space');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error in analyzeInitialPromptNode:', expect.any(Error));
      expect(result).toEqual({
        refinedPrompt: 'A cat in space',
        questions: [],
        responseMessage: 'Sorry, I encountered an error while trying to understand your request. Please try again.',
        conversationHistory: [{ type: 'ai', message: 'Sorry, I encountered an error while trying to understand your request. Please try again.' }],
      });
    });
  });

  describe('processUserResponseNode', () => {
    it('should update the refined prompt with user response', async () => {
      updateRefinedPrompt.mockResolvedValueOnce('Updated refined prompt');

      const initialState = {
        refinedPrompt: 'Initial refined prompt',
        userResponse: 'User added more details',
        conversationHistory: [{ type: 'ai', message: 'Q1' }],
      };

      const result = await processUserResponseNode(initialState);

      expect(updateRefinedPrompt).toHaveBeenCalledWith(
        'Initial refined prompt',
        'User added more details',
        [{ type: 'ai', message: 'Q1' }]
      );
      expect(result).toEqual({
        refinedPrompt: 'Updated refined prompt',
        responseMessage: null,
        conversationHistory: [
          { type: 'ai', message: 'Q1' },
          { type: 'user', message: 'User added more details' },
        ],
      });
    });

    it('should handle errors from updateRefinedPrompt', async () => {
      const errorMessage = 'LLM update error';
      updateRefinedPrompt.mockRejectedValueOnce(new Error(errorMessage));

      const initialState = {
        refinedPrompt: 'Initial refined prompt',
        userResponse: 'User added more details',
        conversationHistory: [{ type: 'ai', message: 'Q1' }],
      };

      const result = await processUserResponseNode(initialState);

      expect(updateRefinedPrompt).toHaveBeenCalledWith(
        'Initial refined prompt',
        'User added more details',
        [{ type: 'ai', message: 'Q1' }]
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error in processUserResponseNode:', expect.any(Error));
      expect(result).toEqual({
        refinedPrompt: 'Initial refined prompt', // Prompt should not be updated on error
        responseMessage: 'Sorry, I encountered an error while processing your response. Please try again.',
        conversationHistory: [
          { type: 'ai', message: 'Q1' },
          { type: 'ai', message: 'Sorry, I encountered an error while processing your response. Please try again.' },
        ],
      });
    });
  });

  describe('askQuestionNode', () => {
    it('should return the next question and update the questions array', async () => {
      const initialState = {
        questions: ['Q2', 'Q3'],
        conversationHistory: [{ type: 'user', message: 'Response to Q1' }],
      };

      const result = await askQuestionNode(initialState);

      expect(result).toEqual({
        questions: ['Q3'], // Q2 should be shifted
        responseMessage: 'Q2',
        conversationHistory: [
          { type: 'user', message: 'Response to Q1' },
          { type: 'ai', message: 'Q2' },
        ],
      });
    });

    it('should return a fallback message if no questions are left', async () => {
      const initialState = {
        questions: [],
        conversationHistory: [{ type: 'user', message: 'Response to Q1' }],
      };

      const result = await askQuestionNode(initialState);

      expect(result).toEqual({
        questions: [],
        responseMessage: "It seems I've run out of questions. Should I proceed with generating the image, or is there anything else you'd like to add?",
        conversationHistory: [
          { type: 'user', message: 'Response to Q1' },
          { type: 'ai', message: "It seems I've run out of questions. Should I proceed with generating the image, or is there anything else you'd like to add?" },
        ],
      });
    });
  });

  describe('getConfirmationNode', () => {
    it('should return a standard confirmation message', async () => {
      const initialState = {
        conversationHistory: [{ type: 'user', message: 'Some details' }],
      };

      const result = await getConfirmationNode(initialState);

      const expectedMessage = "I think I have a good amount of detail now. Should I proceed with generating the image, or is there anything else you'd like to add?";
      expect(result).toEqual({
        responseMessage: expectedMessage,
        conversationHistory: [
          { type: 'user', message: 'Some details' },
          { type: 'ai', message: expectedMessage },
        ],
      });
    });
  });

  describe('compileFinalPromptNode', () => {
    it('should compile the final prompt successfully', async () => {
      compileFinalPrompt.mockResolvedValueOnce('Final prompt for image generation');

      const initialState = {
        refinedPrompt: 'Refined prompt details',
        conversationHistory: [{ type: 'ai', message: 'Confirmation' }],
      };

      const result = await compileFinalPromptNode(initialState);

      expect(compileFinalPrompt).toHaveBeenCalledWith('Refined prompt details');
      expect(result).toEqual({
        finalPrompt: 'Final prompt for image generation',
        responseMessage: "Great! I've created a detailed prompt based on our conversation. Now generating your image, this may take a moment...",
        conversationHistory: [
          { type: 'ai', message: 'Confirmation' },
          { type: 'ai', message: "Great! I've created a detailed prompt based on our conversation. Now generating your image, this may take a moment..." },
        ],
      });
    });

    it('should handle errors from compileFinalPrompt', async () => {
      const errorMessage = 'LLM compile error';
      compileFinalPrompt.mockRejectedValueOnce(new Error(errorMessage));

      const initialState = {
        refinedPrompt: 'Refined prompt details',
        conversationHistory: [{ type: 'ai', message: 'Confirmation' }],
      };

      const result = await compileFinalPromptNode(initialState);

      expect(compileFinalPrompt).toHaveBeenCalledWith('Refined prompt details');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error in compileFinalPromptNode:', expect.any(Error));
      expect(result).toEqual({
        finalPrompt: null,
        responseMessage: 'Sorry, I encountered an error while finalizing the prompt. Please try again.',
        conversationHistory: [
          { type: 'ai', message: 'Confirmation' },
          { type: 'ai', message: 'Sorry, I encountered an error while finalizing the prompt. Please try again.' },
        ],
      });
    });
  });

  describe('generateImageNode', () => {
    const mockImageBuffer = Buffer.from('image_data');
    const mockSignedUrl = 'http://signed.url/image.png';
    const mockFileName = 'generated-images/mock-uuid.png';

    let mockCreateWriteStream;
    let mockFile;
    let mockBucket;

    beforeEach(() => {
      process.env.GCS_IMAGE_BUCKET = 'test-bucket';
      uuidv4.mockReturnValue('mock-uuid');

      mockCreateWriteStream = vi.fn().mockImplementation(() => ({
        on: vi.fn().mockImplementation((event, cb) => {
          if (event === 'finish') {
            setTimeout(cb, 0); // Simulate async finish
          }
          return { on: vi.fn().mockImplementation(() => ({ on: vi.fn() })) }; // Chaining for error
        }),
        end: vi.fn(),
      }));

      mockFile = {
        createWriteStream: mockCreateWriteStream,
        getSignedUrl: vi.fn().mockResolvedValue([mockSignedUrl]),
      };

      mockBucket = {
        file: vi.fn().mockImplementation(() => mockFile),
      };

      Storage.mockImplementation(() => ({
        bucket: vi.fn().mockImplementation(() => mockBucket),
      }));
    });

    it('should generate, upload, and return a signed URL for the image', async () => {
      generateImageUsingVertexAI.mockResolvedValueOnce(mockImageBuffer);

      const initialState = {
        finalPrompt: 'A cat in space, high resolution',
        conversationHistory: [{ type: 'ai', message: 'Prompt compiled' }],
      };

      const result = await generateImageNode(initialState);

      expect(generateImageUsingVertexAI).toHaveBeenCalledWith('A cat in space, high resolution');
      expect(Storage).toHaveBeenCalledTimes(1);
      expect(mockBucket.file).toHaveBeenCalledWith(mockFileName);
      expect(mockCreateWriteStream).toHaveBeenCalledWith({
        resumable: false,
        contentType: 'image/png',
      });
      expect(mockFile.getSignedUrl).toHaveBeenCalledWith({
        action: 'read',
        expires: expect.any(Number),
      });
      expect(mockCreateWriteStream().end).toHaveBeenCalledWith(mockImageBuffer);

      expect(result).toEqual({
        imageUrl: mockSignedUrl,
        responseMessage: "Here is your generated image! Let me know if you'd like to create another one.",
        conversationHistory: [
          { type: 'ai', message: 'Prompt compiled' },
          { type: 'ai', message: "Here is your generated image! Let me know if you'd like to create another one." },
        ],
      });
    });

    it('should handle GCS_IMAGE_BUCKET not being set', async () => {
      delete process.env.GCS_IMAGE_BUCKET;

      const initialState = {
        finalPrompt: 'A cat in space',
        conversationHistory: [{ type: 'ai', message: 'Prompt compiled' }],
      };

      const result = await generateImageNode(initialState);

      expect(consoleErrorSpy).toHaveBeenCalledWith('GCS_IMAGE_BUCKET environment variable not set.');
      expect(generateImageUsingVertexAI).not.toHaveBeenCalled();
      expect(result).toEqual({
        imageUrl: null,
        responseMessage: 'Sorry, the image storage is not configured correctly. Please contact support.',
        conversationHistory: [
          { type: 'ai', message: 'Prompt compiled' },
          { type: 'ai', message: 'Sorry, the image storage is not configured correctly. Please contact support.' },
        ],
      });
    });

    it('should handle no image data returned from Vertex AI', async () => {
      generateImageUsingVertexAI.mockResolvedValueOnce(null); // Or Buffer.from('')

      const initialState = {
        finalPrompt: 'A cat in space',
        conversationHistory: [{ type: 'ai', message: 'Prompt compiled' }],
      };

      const result = await generateImageNode(initialState);

      expect(generateImageUsingVertexAI).toHaveBeenCalledWith('A cat in space');
      expect(mockBucket.file).not.toHaveBeenCalled(); // No file operations if no image data
      expect(result).toEqual({
        imageUrl: null,
        responseMessage: 'Sorry, I received no data from the image generation service. Please try again.',
        conversationHistory: [
          { type: 'ai', message: 'Prompt compiled' },
          { type: 'ai', message: 'Sorry, I received no data from the image generation service. Please try again.' },
        ],
      });
    });

    it('should handle errors during image generation', async () => {
      const errorMessage = 'Vertex AI error';
      generateImageUsingVertexAI.mockRejectedValueOnce(new Error(errorMessage));

      const initialState = {
        finalPrompt: 'A cat in space',
        conversationHistory: [{ type: 'ai', message: 'Prompt compiled' }],
      };

      const result = await generateImageNode(initialState);

      expect(generateImageUsingVertexAI).toHaveBeenCalledWith('A cat in space');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error in generateImageNode:', expect.any(Error));
      expect(mockBucket.file).not.toHaveBeenCalled();
      expect(result).toEqual({
        imageUrl: null,
        responseMessage: 'Sorry, I encountered an unexpected error while generating or saving the image. Please try again.',
        conversationHistory: [
          { type: 'ai', message: 'Prompt compiled' },
          { type: 'ai', message: 'Sorry, I encountered an unexpected error while generating or saving the image. Please try again.' },
        ],
      });
    });

    it('should handle errors during GCS stream write', async () => {
      generateImageUsingVertexAI.mockResolvedValueOnce(mockImageBuffer);
      const streamError = new Error('GCS stream write failed');

      mockCreateWriteStream = vi.fn().mockImplementation(() => ({
        on: vi.fn().mockImplementation((event, cb) => {
          if (event === 'error') {
            setTimeout(() => cb(streamError), 0); // Simulate async error
          }
          return { on: vi.fn().mockImplementation(() => ({ on: vi.fn() })) }; // Chaining for finish
        }),
        end: vi.fn(),
      }));
      mockFile.createWriteStream = mockCreateWriteStream;

      const initialState = {
        finalPrompt: 'A cat in space',
        conversationHistory: [{ type: 'ai', message: 'Prompt compiled' }],
      };

      const result = await generateImageNode(initialState);

      expect(generateImageUsingVertexAI).toHaveBeenCalledWith('A cat in space');
      expect(mockBucket.file).toHaveBeenCalledWith(mockFileName);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error in generateImageNode:', streamError);
      expect(consoleErrorSpy).toHaveBeenCalledWith('GCS Stream Error:', streamError);
      expect(result).toEqual({
        imageUrl: null,
        responseMessage: 'Sorry, I encountered an unexpected error while generating or saving the image. Please try again.',
        conversationHistory: [
          { type: 'ai', message: 'Prompt compiled' },
          { type: 'ai', message: 'Sorry, I encountered an unexpected error while generating or saving the image. Please try again.' },
        ],
      });
    });

    it('should handle errors during GCS signed URL generation', async () => {
      generateImageUsingVertexAI.mockResolvedValueOnce(mockImageBuffer);
      const signedUrlError = new Error('Signed URL generation failed');
      mockFile.getSignedUrl.mockRejectedValueOnce(signedUrlError);

      const initialState = {
        finalPrompt: 'A cat in space',
        conversationHistory: [{ type: 'ai', message: 'Prompt compiled' }],
      };

      const result = await generateImageNode(initialState);

      expect(generateImageUsingVertexAI).toHaveBeenCalledWith('A cat in space');
      expect(mockBucket.file).toHaveBeenCalledWith(mockFileName);
      expect(mockFile.getSignedUrl).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error in generateImageNode:', signedUrlError);
      expect(result).toEqual({
        imageUrl: null,
        responseMessage: 'Sorry, I encountered an unexpected error while generating or saving the image. Please try again.',
        conversationHistory: [
          { type: 'ai', message: 'Prompt compiled' },
          { type: 'ai', message: 'Sorry, I encountered an unexpected error while generating or saving the image. Please try again.' },
        ],
      });
    });
  });

  // --- Routers ---

  describe('routeInitial', () => {
    it('should return "analyze_prompt" if conversationHistory is empty', () => {
      const state = { conversationHistory: [] };
      expect(routeInitial(state)).toBe('analyze_prompt');
    });

    it('should return "process_response" if conversationHistory is not empty', () => {
      const state = { conversationHistory: [{ type: 'user', message: 'Hello' }] };
      expect(routeInitial(state)).toBe('process_response');
    });
  });

  describe('routeNextStep', () => {
    it('should return "compile_prompt" if user is finished', async () => {
      isUserFinished.mockResolvedValueOnce(true);
      const state = { questions: ['Q1'], userResponse: 'Yes, I am finished' };
      expect(await routeNextStep(state)).toBe('compile_prompt');
      expect(isUserFinished).toHaveBeenCalledWith('Yes, I am finished');
    });

    it('should return "ask_question" if user is not finished and there are questions', async () => {
      isUserFinished.mockResolvedValueOnce(false);
      const state = { questions: ['Q1', 'Q2'], userResponse: 'No, not yet' };
      expect(await routeNextStep(state)).toBe('ask_question');
      expect(isUserFinished).toHaveBeenCalledWith('No, not yet');
    });

    it('should return "get_confirmation" if user is not finished and no questions are left', async () => {
      isUserFinished.mockResolvedValueOnce(false);
      const state = { questions: [], userResponse: 'No, not yet' };
      expect(await routeNextStep(state)).toBe('get_confirmation');
      expect(isUserFinished).toHaveBeenCalledWith('No, not yet');
    });

    it('should default to not finished and ask question if isUserFinished throws an error and questions exist', async () => {
      isUserFinished.mockRejectedValueOnce(new Error('LLM check error'));
      const state = { questions: ['Q1'], userResponse: 'I am not sure' };
      expect(await routeNextStep(state)).toBe('ask_question');
      expect(isUserFinished).toHaveBeenCalledWith('I am not sure');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error checking if user is finished:', expect.any(Error));
    });

    it('should default to not finished and get confirmation if isUserFinished throws an error and no questions exist', async () => {
      isUserFinished.mockRejectedValueOnce(new Error('LLM check error'));
      const state = { questions: [], userResponse: 'I am not sure' };
      expect(await routeNextStep(state)).toBe('get_confirmation');
      expect(isUserFinished).toHaveBeenCalledWith('I am not sure');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error checking if user is finished:', expect.any(Error));
    });
  });
});