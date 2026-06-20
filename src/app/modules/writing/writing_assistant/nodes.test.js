import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  analyzeTopicNode,
  processResponseNode,
  askQuestionNode,
  getConfirmationNode,
  writeContentNode,
  routeInitial,
  routeNextStep,
} from './nodes.js';
import { isUserFinished } from '../llm.js';
import {
  generateWritingQuestions,
  updateWritingBrief,
  generateFinalContent,
  routeToSpecializedAgent,
} from '../service/writingService.js';

// Mock dependencies
vi.mock('../llm.js', () => ({
  isUserFinished: vi.fn(),
}));

vi.mock('../service/writingService.js', () => ({
  generateWritingQuestions: vi.fn(),
  updateWritingBrief: vi.fn(),
  generateFinalContent: vi.fn(),
  routeToSpecializedAgent: vi.fn(),
}));

describe('Writing Assistant Nodes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('analyzeTopicNode', () => {
    it('should generate initial questions and set up the state', async () => {
      const initialState = { initialTopic: 'Test Topic' };
      const mockQuestions = ['Question 1?', 'Question 2?'];
      generateWritingQuestions.mockResolvedValue([...mockQuestions]);

      const result = await analyzeTopicNode(initialState);

      expect(generateWritingQuestions).toHaveBeenCalledWith('Test Topic');
      expect(result).toEqual({
        writingBrief: 'Topic: Test Topic',
        questions: ['Question 2?'],
        responseMessage: 'Question 1?',
        history: [{ role: 'ai', content: 'Question 1?' }],
      });
    });
  });

  describe('processResponseNode', () => {
    it('should update the brief based on user input', async () => {
      const currentState = {
        writingBrief: 'Topic: Test Topic',
        userInput: 'My answer is...',
        history: [{ role: 'ai', content: 'Question 1?' }],
      };
      const updatedBrief = 'Topic: Test Topic\nQ1: My answer is...';
      updateWritingBrief.mockResolvedValue(updatedBrief);

      const result = await processResponseNode(currentState);

      expect(updateWritingBrief).toHaveBeenCalledWith(
        currentState.writingBrief,
        currentState.userInput,
        currentState.history
      );
      expect(result).toEqual({
        writingBrief: updatedBrief,
        history: [{ role: 'user', content: 'My answer is...' }],
      });
    });
  });

  describe('askQuestionNode', () => {
    it('should ask the next question from the list', async () => {
      const currentState = {
        questions: ['Next Question?', 'Last Question?'],
      };

      const result = await askQuestionNode(currentState);

      expect(result).toEqual({
        questions: ['Last Question?'],
        responseMessage: 'Next Question?',
        history: [{ role: 'ai', content: 'Next Question?' }],
      });
    });

    it('should handle an empty questions array gracefully', async () => {
      const currentState = {
        questions: [],
      };

      const result = await askQuestionNode(currentState);

      expect(result).toEqual({
        questions: [],
        responseMessage: undefined,
        history: [{ role: 'ai', content: undefined }],
      });
    });
  });

  describe('getConfirmationNode', () => {
    it('should return a confirmation message', async () => {
      const result = await getConfirmationNode({});

      expect(result).toEqual({
        responseMessage: 'I have a detailed brief now. Shall I start writing?',
        history: [
          {
            role: 'ai',
            content: 'I have a detailed brief now. Shall I start writing?',
          },
        ],
      });
    });
  });

  describe('writeContentNode', () => {
    it('should route to specialized agent and call generateFinalContent when selectedAgent is not set', async () => {
      const currentState = {
        initialTopic: 'Draft a simple nondisclosure agreement',
        userInput: 'Yes, please start.',
        history: [],
      };
      const mockStream = 'This is the final generated content stream.';
      routeToSpecializedAgent.mockResolvedValue({
        typeAgent: 'legal_nda',
        styleAgent: 'style_minimalist',
        purposeAgent: 'purpose_sell',
        isSwarm: true,
      });
      generateFinalContent.mockResolvedValue(mockStream);

      const result = await writeContentNode(currentState);

      expect(routeToSpecializedAgent).toHaveBeenCalledWith('Draft a simple nondisclosure agreement');
      expect(generateFinalContent).toHaveBeenCalledWith(
        'Draft a simple nondisclosure agreement',
        [],
        true,
        null,
        'legal_nda',
        'style_minimalist',
        'purpose_sell',
        true
      );
      expect(result).toEqual({
        finalContent: mockStream,
        selectedAgent: 'legal_nda',
        selectedStyle: 'style_minimalist',
        selectedPurpose: 'purpose_sell',
        isSwarm: true,
      });
    });

    it('should use existing selectedAgent, selectedStyle, selectedPurpose, isSwarm and not call routeToSpecializedAgent', async () => {
      const currentState = {
        initialTopic: 'Draft a lease',
        userInput: 'Go',
        selectedAgent: 'legal_lease',
        selectedStyle: 'style_plain_english',
        selectedPurpose: 'purpose_explain',
        isSwarm: false,
        history: [],
      };
      const mockStream = 'Lease agreement content.';
      generateFinalContent.mockResolvedValue(mockStream);

      const result = await writeContentNode(currentState);

      expect(routeToSpecializedAgent).not.toHaveBeenCalled();
      expect(generateFinalContent).toHaveBeenCalledWith(
        'Draft a lease',
        [],
        true,
        null,
        'legal_lease',
        'style_plain_english',
        'purpose_explain',
        false
      );
      expect(result).toEqual({
        finalContent: mockStream,
        selectedAgent: 'legal_lease',
        selectedStyle: 'style_plain_english',
        selectedPurpose: 'purpose_explain',
        isSwarm: false,
      });
    });
  });

  describe('routeInitial', () => {
    it('should return "analyze_topic" for a new conversation', () => {
      const state = { history: [] };
      const result = routeInitial(state);
      expect(result).toBe('analyze_topic');
    });

    it('should return "process_response" for an ongoing conversation', () => {
      const state = { history: [{ role: 'ai', content: 'Hello' }] };
      const result = routeInitial(state);
      expect(result).toBe('process_response');
    });
  });

  describe('routeNextStep', () => {
    it('should return "write_content" if user is finished', async () => {
      const state = { userInput: 'Yes, go ahead' };
      isUserFinished.mockResolvedValue(true);

      const result = await routeNextStep(state);

      expect(isUserFinished).toHaveBeenCalledWith('Yes, go ahead');
      expect(result).toBe('write_content');
    });

    it('should return "ask_question" if there are more questions', async () => {
      const state = {
        userInput: 'My answer',
        questions: ['Another question?'],
      };
      isUserFinished.mockResolvedValue(false);

      const result = await routeNextStep(state);

      expect(isUserFinished).toHaveBeenCalledWith('My answer');
      expect(result).toBe('ask_question');
    });

    it('should return "get_confirmation" if there are no more questions', async () => {
      const state = {
        userInput: 'My final answer',
        questions: [],
      };
      isUserFinished.mockResolvedValue(false);

      const result = await routeNextStep(state);

      expect(isUserFinished).toHaveBeenCalledWith('My final answer');
      expect(result).toBe('get_confirmation');
    });

    it('should return "get_confirmation" if questions property is missing', async () => {
        const state = {
          userInput: 'My final answer',
        };
        isUserFinished.mockResolvedValue(false);
  
        const result = await routeNextStep(state);
  
        expect(isUserFinished).toHaveBeenCalledWith('My final answer');
        expect(result).toBe('get_confirmation');
      });
  });
});