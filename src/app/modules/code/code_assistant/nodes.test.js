import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectIntentNode,
  routeOnIntent,
  generateCodeNode,
  explainCodeNode,
  debugCodeNode,
  bestPracticesNode,
  generalConversationNode,
} from './nodes.js';

// Mock dependencies
vi.mock('../llm.js', () => ({
  ai: {
    models: {
      generateContent: vi.fn(),
    },
  },
}));

vi.mock('../services/geminiCodeService.js', () => ({
  codeGenerator: vi.fn(),
  codeExplainer: vi.fn(),
  codeDebugger: vi.fn(),
  bestPracticesAdvisor: vi.fn(),
  generalCodeAssistant: vi.fn(),
}));

// Import mocked modules to access the mock functions
import { ai } from '../llm.js';
import {
  codeGenerator,
  codeExplainer,
  codeDebugger,
  bestPracticesAdvisor,
  generalCodeAssistant,
} from '../services/geminiCodeService.js';

describe('Code Assistant Nodes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Suppress console logs during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('detectIntentNode', () => {
    const baseState = {
      history: [
        { role: 'user', content: 'Hello' },
        { role: 'model', content: 'Hi there!' },
        { role: 'user', content: 'Write a function to sort an array.' },
      ],
    };

    it('should correctly detect and return a valid intent', async () => {
      ai.models.generateContent.mockResolvedValue({ text: 'generate_code' });

      const result = await detectIntentNode(baseState);

      expect(ai.models.generateContent).toHaveBeenCalledTimes(1);
      const calledWith = ai.models.generateContent.mock.calls[0][0];
      expect(calledWith.contents).toContain('User Message: "Write a function to sort an array."');
      expect(result).toEqual({ intent: 'generate_code' });
    });

    it('should trim whitespace from the LLM response', async () => {
      ai.models.generateContent.mockResolvedValue({ text: '  explain_code  \n' });

      const result = await detectIntentNode(baseState);

      expect(result).toEqual({ intent: 'explain_code' });
    });

    it('should default to "general_conversation" if the LLM call fails', async () => {
      ai.models.generateContent.mockRejectedValue(new Error('API Error'));

      const result = await detectIntentNode(baseState);

      expect(result).toEqual({ intent: 'general_conversation' });
      expect(console.error).toHaveBeenCalledWith('Error detecting intent:', expect.any(Error));
    });

    it('should default to "general_conversation" if the LLM response is not a string', async () => {
      ai.models.generateContent.mockResolvedValue({ text: null });

      const result = await detectIntentNode(baseState);

      expect(result).toEqual({ intent: 'general_conversation' });
      expect(console.warn).toHaveBeenCalledWith('LLM response.text was not a string or was empty. Defaulting to general_conversation.');
    });

    it('should default to "general_conversation" if the LLM response is empty', async () => {
      ai.models.generateContent.mockResolvedValue({ text: '' });

      const result = await detectIntentNode(baseState);

      expect(result).toEqual({ intent: 'general_conversation' });
    });
  });

  describe('routeOnIntent', () => {
    const validIntents = [
      'generate_code',
      'explain_code',
      'debug_code',
      'best_practices',
    ];

    it.each(validIntents)('should return "%s" for the intent "%s"', (intent) => {
      const state = { intent };
      const result = routeOnIntent(state);
      expect(result).toBe(intent);
    });

    const invalidIntents = [
      'general_conversation',
      'unknown_intent',
      'GENERATE_CODE', // Case-sensitive check
      null,
      undefined,
      '',
    ];

    it.each(invalidIntents)('should return "general_conversation" for the intent "%s"', (intent) => {
      const state = { intent };
      const result = routeOnIntent(state);
      expect(result).toBe('general_conversation');
    });

    it('should return "general_conversation" if intent is missing from state', () => {
        const state = { history: [] }; // No intent property
        const result = routeOnIntent(state);
        expect(result).toBe('general_conversation');
    });
  });

  describe('Task Execution Nodes (via executeTaskNode)', () => {
    const state = {
      intent: 'some_intent',
      history: [{ role: 'user', content: 'Do something' }],
    };

    const serviceMap = [
      { node: generateCodeNode, service: codeGenerator, intent: 'generate_code' },
      { node: explainCodeNode, service: codeExplainer, intent: 'explain_code' },
      { node: debugCodeNode, service: codeDebugger, intent: 'debug_code' },
      { node: bestPracticesNode, service: bestPracticesAdvisor, intent: 'best_practices' },
      { node: generalConversationNode, service: generalCodeAssistant, intent: 'general_conversation' },
    ];

    it.each(serviceMap)('should call $service.name and return the response for $node.name', async ({ node, service }) => {
      const serviceResponse = { data: `Response from ${service.name}` };
      service.mockResolvedValue(serviceResponse);

      const result = await node({ ...state, intent: 'test_intent' });

      expect(service).toHaveBeenCalledWith(state.history);
      expect(result).toEqual({ response: serviceResponse });
    });

    it.each(serviceMap)('should handle errors gracefully for $node.name', async ({ node, service, intent }) => {
      const errorMessage = 'Service failed';
      service.mockRejectedValue(new Error(errorMessage));

      const result = await node({ ...state, intent });

      expect(service).toHaveBeenCalledWith(state.history);
      expect(result).toEqual({
        response: { error: `Failed to process your request: ${errorMessage}` },
      });
      expect(console.error).toHaveBeenCalledWith(
        `Error executing task for intent ${intent}:`,
        expect.any(Error)
      );
    });
  });
});