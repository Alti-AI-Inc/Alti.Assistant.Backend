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

const { mockPublishMessage, mockTopic } = vi.hoisted(() => {
  const mockPublishMessage = vi.fn().mockResolvedValue('mock-msg-id');
  const mockTopic = vi.fn().mockReturnValue({
    publishMessage: mockPublishMessage,
  });
  return { mockPublishMessage, mockTopic };
});

vi.mock('@google-cloud/pubsub', () => ({
  PubSub: class {
    constructor() {
      this.topic = mockTopic;
    }
  }
}));

vi.mock('../services/geminiCodeService.js', () => ({
  routeToSpecializedCodingAgent: vi.fn().mockResolvedValue({
    typeAgent: 'lang_python',
    styleAgent: 'style_pep8',
    purposeAgent: 'role_debugger',
    isSwarm: false,
  }),
}));

describe('Code Assistant Nodes', () => {
  beforeEach(() => {
    mockPublishMessage.mockClear();
    mockTopic.mockClear();
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

    it('should correctly queue intent detection task', async () => {
      const result = await detectIntentNode(baseState);

      expect(mockTopic).toHaveBeenCalledWith('code-assistant-workflow');
      expect(mockPublishMessage).toHaveBeenCalledWith({
        json: baseState,
        attributes: {
          task: 'detect_intent',
        },
      });
      expect(result).toEqual({ status: 'queued', messageId: 'mock-msg-id' });
    });

    it('should throw an error if publishing fails', async () => {
      mockPublishMessage.mockRejectedValueOnce(new Error('PubSub offline'));

      await expect(detectIntentNode(baseState)).rejects.toThrow('Failed to queue intent detection task.');
      expect(console.error).toHaveBeenCalledWith('Error publishing detect_intent task:', expect.any(Error));
    });
  });

  describe('routeOnIntent', () => {
    it.each([
      ['generate_code', 'generate_code'],
      ['explain_code', 'explain_code'],
      ['debug_code', 'debug_code'],
      ['best_practices', 'best_practices'],
      ['random_intent', 'general_conversation'],
      [undefined, 'general_conversation'],
    ])('should route intent %s to node %s', (intent, expectedNode) => {
      const state = { intent, history: [] };
      const nextNode = routeOnIntent(state);
      expect(nextNode).toBe(expectedNode);
    });
  });

  describe('Task Offloading Nodes', () => {
    const state = {
      history: [{ role: 'user', content: 'Help me write code' }],
    };

    const offloadNodes = [
      { node: generateCodeNode, taskName: 'generate_code' },
      { node: explainCodeNode, taskName: 'explain_code' },
      { node: debugCodeNode, taskName: 'debug_code' },
      { node: bestPracticesNode, taskName: 'best_practices' },
      { node: generalConversationNode, taskName: 'general_conversation' },
    ];

    it.each(offloadNodes)('should offload $taskName task to PubSub', async ({ node, taskName }) => {
      const result = await node(state);

      expect(mockTopic).toHaveBeenCalledWith('code-assistant-workflow');
      expect(mockPublishMessage).toHaveBeenCalledWith({
        json: {
          ...state,
          selectedAgent: 'lang_python',
          selectedStyle: 'style_pep8',
          selectedPurpose: 'role_debugger',
          isSwarm: false,
        },
        attributes: {
          task: taskName,
        },
      });
      expect(result).toEqual({
        status: 'queued',
        messageId: 'mock-msg-id',
        selectedAgent: 'lang_python',
        selectedStyle: 'style_pep8',
        selectedPurpose: 'role_debugger',
        isSwarm: false,
      });
    });

    it.each(offloadNodes)('should throw an error if offloading $taskName task fails', async ({ node, taskName }) => {
      mockPublishMessage.mockRejectedValueOnce(new Error('GCP API error'));

      await expect(node(state)).rejects.toThrow(`Failed to queue task: ${taskName}`);
      expect(console.error).toHaveBeenCalledWith(`Error publishing task ${taskName}:`, expect.any(Error));
    });
  });
});