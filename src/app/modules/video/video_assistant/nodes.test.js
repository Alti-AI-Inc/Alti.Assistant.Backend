import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  analyzeInitialVideoPromptNode,
  processVideoUserResponseNode,
  askVideoQuestionNode,
  getVideoConfirmationNode,
  compileVideoFinalPromptNode,
  generateVideoNode,
  routeVideoInitial,
  routeVideoNextStep,
} from './nodes.js';

// Mock external dependencies
vi.mock('../videoGenerationService.js', () => ({
  generateVideoClarifyingQuestions: vi.fn(),
  isUserFinishedVideo: vi.fn(),
  updateVideoRefinedPrompt: vi.fn(),
  compileVideoFinalPrompt: vi.fn(),
}));

vi.mock('../videoService.js', () => ({
  generateVideo: vi.fn(), // Not used in the provided code, but good to mock
  generateVideoWithVertexAI: vi.fn(),
}));

// Import mocked functions
import {
  generateVideoClarifyingQuestions,
  isUserFinishedVideo,
  updateVideoRefinedPrompt,
  compileVideoFinalPrompt,
} from '../videoGenerationService.js';
import { generateVideoWithVertexAI } from '../videoService.js';

describe('Video Assistant Nodes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.log for cleaner test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('analyzeInitialVideoPromptNode', () => {
    it('should generate clarifying questions and set initial state', async () => {
      const initialPrompt = 'I want a video about cats.';
      const mockQuestions = ['What kind of cats?', 'What style should it be?'];
      generateVideoClarifyingQuestions.mockResolvedValue(mockQuestions);

      const state = { initialPrompt };
      const newState = await analyzeInitialVideoPromptNode(state);

      expect(generateVideoClarifyingQuestions).toHaveBeenCalledWith(initialPrompt);
      expect(newState).toEqual({
        refinedPrompt: initialPrompt,
        questions: ['What style should it be?'], // First question shifted
        responseMessage: 'What kind of cats?',
        conversationHistory: [{ type: 'ai', message: 'What kind of cats?' }],
      });
    });

    it('should handle no questions returned', async () => {
      const initialPrompt = 'A very specific prompt.';
      generateVideoClarifyingQuestions.mockResolvedValue([]);

      const state = { initialPrompt };
      const newState = await analyzeInitialVideoPromptNode(state);

      expect(generateVideoClarifyingQuestions).toHaveBeenCalledWith(initialPrompt);
      expect(newState).toEqual({
        refinedPrompt: initialPrompt,
        questions: [],
        responseMessage: undefined, // shift on empty array returns undefined
        conversationHistory: [{ type: 'ai', message: undefined }],
      });
    });
  });

  describe('processVideoUserResponseNode', () => {
    it('should update the refined prompt with user response', async () => {
      const refinedPrompt = 'Initial idea about dogs.';
      const userResponse = 'I want golden retrievers.';
      const conversationHistory = [{ type: 'ai', message: 'What kind of dogs?' }];
      const updatedPrompt = 'Initial idea about dogs, specifically golden retrievers.';
      updateVideoRefinedPrompt.mockResolvedValue(updatedPrompt);

      const state = { refinedPrompt, userResponse, conversationHistory };
      const newState = await processVideoUserResponseNode(state);

      expect(updateVideoRefinedPrompt).toHaveBeenCalledWith(
        refinedPrompt,
        userResponse,
        conversationHistory
      );
      expect(newState).toEqual({
        refinedPrompt: updatedPrompt,
        conversationHistory: [{ type: 'user', message: userResponse }],
      });
    });
  });

  describe('askVideoQuestionNode', () => {
    it('should return the next question from the list', async () => {
      const questions = ['Question 2', 'Question 3'];
      const state = { questions };
      const newState = await askVideoQuestionNode(state);

      expect(newState).toEqual({
        questions: ['Question 3'], // Question 2 shifted
        responseMessage: 'Question 2',
        conversationHistory: [{ type: 'ai', message: 'Question 2' }],
      });
    });

    it('should handle an empty questions array', async () => {
      const questions = [];
      const state = { questions };
      const newState = await askVideoQuestionNode(state);

      expect(newState).toEqual({
        questions: [],
        responseMessage: undefined, // shift on empty array returns undefined
        conversationHistory: [{ type: 'ai', message: undefined }],
      });
    });
  });

  describe('getVideoConfirmationNode', () => {
    it('should return a predefined confirmation message', async () => {
      const state = {};
      const newState = await getVideoConfirmationNode(state);
      const expectedMessage =
        "I think I have a good amount of detail now. Should I proceed with generating the video, or is there anything else you'd like to add?";

      expect(newState).toEqual({
        responseMessage: expectedMessage,
        conversationHistory: [{ type: 'ai', message: expectedMessage }],
      });
    });
  });

  describe('compileVideoFinalPromptNode', () => {
    it('should compile the final prompt and set generation status', async () => {
      const refinedPrompt = 'Detailed prompt for a video about space.';
      const finalPrompt = 'Final compiled prompt for video generation: space exploration.';
      compileVideoFinalPrompt.mockResolvedValue(finalPrompt);

      const state = { refinedPrompt };
      const newState = await compileVideoFinalPromptNode(state);
      const expectedMessage =
        "Great! I've created a detailed prompt based on our conversation. Now generating your video, this may take a few minutes...";

      expect(compileVideoFinalPrompt).toHaveBeenCalledWith(refinedPrompt);
      expect(newState).toEqual({
        finalPrompt,
        responseMessage: expectedMessage,
        conversationHistory: [{ type: 'ai', message: expectedMessage }],
        generationStatus: 'started',
      });
    });
  });

  describe('generateVideoNode', () => {
    it('should generate video successfully with provided parameters', async () => {
      const finalPrompt = 'A video about a cat playing with a ball.';
      const videoDuration = 10;
      const videoStyle = 'cartoon';
      const videoResolution = '1920x1080';
      const mockVideoUrl = 'http://example.com/video.mp4';
      generateVideoWithVertexAI.mockResolvedValue(mockVideoUrl);

      const state = { finalPrompt, videoDuration, videoStyle, videoResolution };
      const newState = await generateVideoNode(state);

      expect(generateVideoWithVertexAI).toHaveBeenCalledWith({
        prompt: finalPrompt,
        duration: videoDuration,
        style: videoStyle,
        resolution: videoResolution,
      });
      expect(newState).toEqual({
        videoUrl: mockVideoUrl,
        responseMessage: "Here is your generated video! Let me know if you'd like to create another one.",
        generationStatus: 'completed',
        generationProgress: 100,
      });
    });

    it('should use default parameters if not provided in state', async () => {
      const finalPrompt = 'A video about a dog.';
      const mockVideoUrl = 'http://example.com/dog_video.mp4';
      generateVideoWithVertexAI.mockResolvedValue(mockVideoUrl);

      const state = { finalPrompt }; // No duration, style, resolution
      const newState = await generateVideoNode(state);

      expect(generateVideoWithVertexAI).toHaveBeenCalledWith({
        prompt: finalPrompt,
        duration: 5, // Default
        style: 'realistic', // Default
        resolution: '1024x576', // Default
      });
      expect(newState.videoUrl).toBe(mockVideoUrl);
      expect(newState.generationStatus).toBe('completed');
    });

    it('should handle video generation service returning null', async () => {
      const finalPrompt = 'A video about a bird.';
      generateVideoWithVertexAI.mockResolvedValue(null);

      const state = { finalPrompt };
      const newState = await generateVideoNode(state);

      expect(generateVideoWithVertexAI).toHaveBeenCalledWith({
        prompt: finalPrompt,
        duration: 5,
        style: 'realistic',
        resolution: '1024x576',
      });
      expect(newState).toEqual({
        responseMessage: 'Sorry, I encountered an error while generating the video. Please try again.',
        generationStatus: 'failed',
      });
    });

    it('should handle errors during video generation', async () => {
      const finalPrompt = 'A video about a fish.';
      const errorMessage = 'API error';
      generateVideoWithVertexAI.mockRejectedValue(new Error(errorMessage));

      const state = { finalPrompt };
      const newState = await generateVideoNode(state);

      expect(generateVideoWithVertexAI).toHaveBeenCalledWith({
        prompt: finalPrompt,
        duration: 5,
        style: 'realistic',
        resolution: '1024x576',
      });
      expect(newState).toEqual({
        responseMessage: 'Sorry, I encountered an error while generating the video. Please try again.',
        generationStatus: 'failed',
      });
      expect(console.error).toHaveBeenCalledWith('Video generation error:', expect.any(Error));
    });
  });
});

describe('Video Assistant Routers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.log for cleaner test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('routeVideoInitial', () => {
    it('should route to analyze_video_prompt if conversationHistory is empty', () => {
      const state = { conversationHistory: [] };
      const route = routeVideoInitial(state);
      expect(route).toBe('analyze_video_prompt');
    });

    it('should route to analyze_video_prompt if conversationHistory is undefined', () => {
      const state = {};
      const route = routeVideoInitial(state);
      expect(route).toBe('analyze_video_prompt');
    });

    it('should route to process_video_response if conversationHistory is not empty', () => {
      const state = { conversationHistory: [{ type: 'user', message: 'Hello' }] };
      const route = routeVideoInitial(state);
      expect(route).toBe('process_video_response');
    });
  });

  describe('routeVideoNextStep', () => {
    it('should route to compile_video_prompt if user is finished', async () => {
      isUserFinishedVideo.mockResolvedValue(true);
      const state = { userResponse: 'Yes, I am finished.', questions: ['Q1'] };
      const route = await routeVideoNextStep(state);
      expect(isUserFinishedVideo).toHaveBeenCalledWith(state.userResponse);
      expect(route).toBe('compile_video_prompt');
    });

    it('should route to ask_video_question if there are remaining questions and user is not finished', async () => {
      isUserFinishedVideo.mockResolvedValue(false);
      const state = { userResponse: 'More details.', questions: ['Q1', 'Q2'] };
      const route = await routeVideoNextStep(state);
      expect(isUserFinishedVideo).toHaveBeenCalledWith(state.userResponse);
      expect(route).toBe('ask_video_question');
    });

    it('should route to get_video_confirmation if no more questions and user is not finished', async () => {
      isUserFinishedVideo.mockResolvedValue(false);
      const state = { userResponse: 'Okay.', questions: [] };
      const route = await routeVideoNextStep(state);
      expect(isUserFinishedVideo).toHaveBeenCalledWith(state.userResponse);
      expect(route).toBe('get_video_confirmation');
    });

    it('should route to get_video_confirmation if questions array is null/undefined and user is not finished', async () => {
      isUserFinishedVideo.mockResolvedValue(false);
      const state = { userResponse: 'Okay.', questions: null };
      const route = await routeVideoNextStep(state);
      expect(isUserFinishedVideo).toHaveBeenCalledWith(state.userResponse);
      expect(route).toBe('get_video_confirmation');
    });
  });
});