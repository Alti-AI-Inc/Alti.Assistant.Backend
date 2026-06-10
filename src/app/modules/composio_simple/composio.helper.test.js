import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import { GoogleGenAI } from '@google/genai';
import { Composio } from '@composio/core';
import Tool from '../composio_v2/tools.model.js';
import { generateContent } from './utils/gemini.js';
import { sanitizeToolForGemini } from './utils/toolSanitizer.js';

import {
  findAppropriateApp,
  getVectorSearchResults,
  generateAndExecuteTools,
  generateUserMessasgeFromContext,
  executeMultipleTools,
} from './composio.helper.js';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('@google/genai');
vi.mock('@composio/core');
vi.mock('../composio_v2/tools.model.js');
vi.mock('./utils/gemini.js');
vi.mock('./utils/toolSanitizer.js');
vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test-key',
    composio: { orgApiKey: 'test-org-key' },
  },
}));

const mockEmbedContent = vi.fn();
GoogleGenAI.mockImplementation(() => ({
  embedContent: mockEmbedContent,
}));

const mockExecuteToolCall = vi.fn();
Composio.mockImplementation(() => ({
  provider: {
    executeToolCall: mockExecuteToolCall,
  },
}));

const mockAggregate = vi.fn();
Tool.aggregate = mockAggregate;

describe('composio.helper.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findAppropriateApp', () => {
    const mockApps = ['Google Calendar', 'Gmail', 'Jira'];
    const mockToolKits = { 'Google Calendar': 'v1', Jira: 'v2' };

    beforeEach(() => {
      fs.readFile.mockImplementation((path) => {
        if (path.includes('available_apps.json')) {
          return Promise.resolve(JSON.stringify(mockApps));
        }
        if (path.includes('toolkits.json')) {
          return Promise.resolve(JSON.stringify(mockToolKits));
        }
        return Promise.reject(new Error('File not found'));
      });
    });

    it('should identify and return appropriate apps and their toolkit versions', async () => {
      generateContent.mockResolvedValue({
        candidates: [{ content: { parts: [{ text: '["Google Calendar", "Gmail"]' }] } }],
      });

      const result = await findAppropriateApp('schedule a meeting and send an email');
      expect(result).toEqual({
        toolKitVersions: { 'Google Calendar': 'v1', Gmail: 'latest' },
        appList: ['Google Calendar', 'Gmail'],
      });
      expect(generateContent).toHaveBeenCalledOnce();
    });

    it('should handle LLM responses with surrounding text', async () => {
        generateContent.mockResolvedValue({
          candidates: [{ content: { parts: [{ text: 'Here are the apps: ["Jira"]' }] } }],
        });
  
        const result = await findAppropriateApp('create a ticket');
        expect(result).toEqual({
          toolKitVersions: { Jira: 'v2' },
          appList: ['Jira'],
        });
      });

    it('should filter out invalid or non-existent apps returned by the LLM', async () => {
      generateContent.mockResolvedValue({
        candidates: [{ content: { parts: [{ text: '["Gmail", "InvalidApp", "Jira"]' }] } }],
      });

      const result = await findAppropriateApp('some query');
      expect(result).toEqual({
        toolKitVersions: { Gmail: 'latest', Jira: 'v2' },
        appList: ['Gmail', 'Jira'],
      });
      expect(console.warn).toHaveBeenCalledWith(
        'LLM returned invalid or non-existent app names. They have been filtered out.',
        { original: ['Gmail', 'InvalidApp', 'Jira'], filtered: ['Gmail', 'Jira'] }
      );
    });

    it('should return empty lists if the LLM response is not a valid JSON array', async () => {
      generateContent.mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'This is not JSON' }] } }],
      });

      const result = await findAppropriateApp('some query');
      expect(result).toEqual({ toolKitVersions: {}, appList: [] });
    });

    it('should return empty lists if reading available_apps.json fails', async () => {
      fs.readFile.mockImplementation((path) => {
        if (path.includes('available_apps.json')) {
          return Promise.reject(new Error('Read error'));
        }
        return Promise.resolve(JSON.stringify(mockToolKits));
      });

      const result = await findAppropriateApp('some query');
      expect(result).toEqual({ toolKitVersions: {}, appList: [] });
      expect(console.error).toHaveBeenCalledWith('Error loading or parsing available_apps.json:', expect.any(Error));
    });

    it('should return empty lists if reading toolkits.json fails', async () => {
        fs.readFile.mockImplementation((path) => {
          if (path.includes('toolkits.json')) {
            return Promise.reject(new Error('Read error'));
          }
          return Promise.resolve(JSON.stringify(mockApps));
        });
  
        const result = await findAppropriateApp('some query');
        expect(result).toEqual({ toolKitVersions: {}, appList: [] });
        expect(console.error).toHaveBeenCalledWith('Error loading or parsing toolkits.json:', expect.any(Error));
      });

    it('should correctly build the prompt with chat history and context', async () => {
        generateContent.mockResolvedValue({ candidates: [] });
        const chatHistory = [{ role: 'user', content: 'find a time' }];
        const summarizedContext = 'The user wants to schedule a meeting.';
        
        await findAppropriateApp('with John', chatHistory, summarizedContext);

        const prompt = generateContent.mock.calls[0][1][0].parts[0].text;
        expect(prompt).toContain('Here is the chat history for context:');
        expect(prompt).toContain('[Message 1] USER: find a time');
        expect(prompt).toContain('Here is the summarized context for additional information:');
        expect(prompt).toContain('The user wants to schedule a meeting.');
    });
  });

  describe('getVectorSearchResults', () => {
    it('should embed the query and perform a vector search with the correct filter', async () => {
      const mockVector = [0.1, 0.2, 0.3];
      const mockSearchResults = [{ name: 'tool1', score: 0.9 }];
      mockEmbedContent.mockResolvedValue({ embedding: { values: mockVector } });
      mockAggregate.mockResolvedValue(mockSearchResults);

      const query = 'test query';
      const apps = ['Gmail', 'Jira'];
      const topK = 10;

      const result = await getVectorSearchResults(query, topK, apps);

      expect(mockEmbedContent).toHaveBeenCalledWith({
        model: 'embedding-001',
        content: { role: 'user', parts: [{ text: query }] },
      });
      expect(mockAggregate).toHaveBeenCalledWith([
        {
          $vectorSearch: {
            index: 'vector_index',
            path: 'embedding',
            queryVector: mockVector,
            numCandidates: 200,
            limit: topK,
            filter: { appName: { $in: apps } },
          },
        },
        {
          $project: {
            name: 1,
            description: 1,
            slug: 1,
            version: 1,
            appName: 1,
            input_parameters: 1,
            score: { $meta: 'vectorSearchScore' },
          },
        },
      ]);
      expect(result).toEqual(mockSearchResults);
    });
  });

  describe('generateAndExecuteTools', () => {
    const mockTools = [{ name: 'tool1' }];
    const mockToolkitVersions = { app: 'v1' };
    const entityId = 'user-123';

    it('should execute tools when function calls are present in the response', async () => {
      const mockFunctionCalls = [{ name: 'tool1', args: {} }];
      const mockExecutionResults = [{ status: 'success' }];
      generateContent.mockResolvedValue({ functionCalls: mockFunctionCalls });
      // This is a bit tricky since executeMultipleTools is in the same file.
      // For this test, we assume it works and focus on the orchestration logic.
      // Its own dedicated tests will cover its internals.
      // Here we can't mock it, so we mock its dependency `Composio`.
      mockExecuteToolCall.mockResolvedValue({ success: true });

      const result = await generateAndExecuteTools('do something', mockTools, mockToolkitVersions, entityId);

      expect(generateContent).toHaveBeenCalled();
      expect(mockExecuteToolCall).toHaveBeenCalled();
      expect(result.response.functionCalls).toEqual(mockFunctionCalls);
      expect(result.results[0].status).toBe('success');
    });

    it('should return empty results if no function calls are in the response', async () => {
        generateContent.mockResolvedValue({ text: 'No tools needed.' });
  
        const result = await generateAndExecuteTools('do something', mockTools, mockToolkitVersions, entityId);
  
        expect(generateContent).toHaveBeenCalled();
        expect(mockExecuteToolCall).not.toHaveBeenCalled();
        expect(result.results).toEqual([]);
        expect(result.response.text).toBe('No tools needed.');
      });

    it('should handle errors during tool execution', async () => {
        const mockFunctionCalls = [{ name: 'tool1', args: {} }];
        generateContent.mockResolvedValue({ functionCalls: mockFunctionCalls });
        mockExecuteToolCall.mockRejectedValue(new Error('Execution failed'));
  
        const result = await generateAndExecuteTools('do something', mockTools, mockToolkitVersions, entityId);
  
        expect(result.response.functionCalls).toEqual(mockFunctionCalls);
        expect(result.results).toEqual([]);
        expect(result.error).toBe('Execution failed');
      });
  });

  describe('generateUserMessasgeFromContext', () => {
    it('should generate a comprehensive message from context', async () => {
        const synthesizedMessage = 'Send an email to john@example.com with subject "Meeting"';
        generateContent.mockResolvedValue({
          candidates: [{ content: { parts: [{ text: synthesizedMessage }] } }],
        });
  
        const result = await generateUserMessasgeFromContext(
          'the subject is "Meeting"',
          '',
          [{ role: 'user', content: 'send email to john@example.com' }]
        );
  
        expect(generateContent).toHaveBeenCalled();
        expect(result).toBe(synthesizedMessage);
      });

    it('should fall back to the original message if LLM response is empty', async () => {
        generateContent.mockResolvedValue({ candidates: [{ content: { parts: [{ text: ' ' }] } }] });
        const userMessage = 'a new request';
  
        const result = await generateUserMessasgeFromContext(userMessage);
  
        expect(result).toBe(userMessage);
        expect(console.warn).toHaveBeenCalledWith('LLM response text was empty or malformed for user message generation. Returning original message.');
      });

    it('should fall back to the original message on generation error', async () => {
        generateContent.mockRejectedValue(new Error('API error'));
        const userMessage = 'a new request';
  
        const result = await generateUserMessasgeFromContext(userMessage);
  
        expect(result).toBe(userMessage);
        expect(console.error).toHaveBeenCalledWith('Error generating user message from context:', expect.any(Error));
      });
  });

  describe('executeMultipleTools', () => {
    const toolDefinitions = [
        { slug: 'create-event', appName: 'google', input_parameters: { properties: { title: { type: 'string' } }, required: ['title'] } },
        { slug: 'invite-user', appName: 'internal', input_parameters: { properties: { email: { type: 'string' } }, required: ['email'] } },
        { slug: 'delete-something', appName: 'internal', input_parameters: {} },
    ];
    const toolkitVersions = { google: 'v1', internal: 'v1' };

    it('should execute a valid tool call for a valid entity', async () => {
        const entityId = 'user-123';
        const functionCalls = [{ name: 'create-event', args: { title: 'My Event' } }];
        mockExecuteToolCall.mockResolvedValue({ success: true, eventId: 'evt-1' });

        const results = await executeMultipleTools(entityId, functionCalls, toolkitVersions, toolDefinitions);

        expect(mockExecuteToolCall).toHaveBeenCalledWith(entityId, functionCalls[0]);
        expect(results).toEqual([{
            tool: 'create-event',
            status: 'success',
            result: { success: true, eventId: 'evt-1' },
        }]);
    });

    it('should block execution for an invalid entityId', async () => {
        const entityId = 'invalid$entity';
        const functionCalls = [{ name: 'create-event', args: { title: 'My Event' } }];

        const results = await executeMultipleTools(entityId, functionCalls, toolkitVersions, toolDefinitions);

        expect(mockExecuteToolCall).not.toHaveBeenCalled();
        expect(results).toEqual([{
            tool: 'create-event',
            status: 'error',
            error: 'Invalid entityId provided. Execution blocked for security reasons.',
        }]);
    });

    it('should block execution if usage limits are exceeded', async () => {
        const entityId = 'user-123';
        // The placeholder check fails if calls > 50
        const functionCalls = Array(51).fill({ name: 'create-event', args: { title: 'Event' } });

        const results = await executeMultipleTools(entityId, functionCalls, toolkitVersions, toolDefinitions);

        expect(mockExecuteToolCall).not.toHaveBeenCalled();
        expect(results[0].status).toBe('error');
        expect(results[0].error).toContain('Plan limit exceeded');
    });

    describe('Role-Based Access Control (RBAC)', () => {
        it('should DENY a regular user from executing a manager-level tool', async () => {
            const entityId = 'user-123'; // Not a manager
            const functionCalls = [{ name: 'invite-user', args: { email: 'test@test.com' } }];

            const results = await executeMultipleTools(entityId, functionCalls, toolkitVersions, toolDefinitions);

            expect(mockExecuteToolCall).not.toHaveBeenCalled();
            expect(results).toEqual([{
                tool: 'invite-user',
                status: 'error',
                error: 'You do not have permission to perform this action.',
            }]);
        });

        it('should ALLOW a manager to execute a manager-level tool', async () => {
            const entityId = 'manager-456'; // Is a manager
            const functionCalls = [{ name: 'invite-user', args: { email: 'test@test.com' } }];
            mockExecuteToolCall.mockResolvedValue({ success: true });

            const results = await executeMultipleTools(entityId, functionCalls, toolkitVersions, toolDefinitions);

            expect(mockExecuteToolCall).toHaveBeenCalledWith(entityId, functionCalls[0]);
            expect(results[0].status).toBe('success');
        });

        it('should ALLOW a regular user to execute a general tool', async () => {
            const entityId = 'user-123';
            const functionCalls = [{ name: 'create-event', args: { title: 'My Event' } }];
            mockExecuteToolCall.mockResolvedValue({ success: true });

            const results = await executeMultipleTools(entityId, functionCalls, toolkitVersions, toolDefinitions);

            expect(mockExecuteToolCall).toHaveBeenCalledWith(entityId, functionCalls[0]);
            expect(results[0].status).toBe('success');
        });
    });

    it('should block execution of a non-existent tool', async () => {
        const entityId = 'user-123';
        const functionCalls = [{ name: 'non-existent-tool', args: {} }];

        const results = await executeMultipleTools(entityId, functionCalls, toolkitVersions, toolDefinitions);

        expect(mockExecuteToolCall).not.toHaveBeenCalled();
        expect(results).toEqual([{
            tool: 'non-existent-tool',
            status: 'error',
            error: "Tool 'non-existent-tool' not found or is not allowed.",
        }]);
    });

    it('should block execution if arguments are invalid (missing required)', async () => {
        const entityId = 'user-123';
        const functionCalls = [{ name: 'create-event', args: { wrong_arg: 'My Event' } }]; // Missing 'title'

        const results = await executeMultipleTools(entityId, functionCalls, toolkitVersions, toolDefinitions);

        expect(mockExecuteToolCall).not.toHaveBeenCalled();
        expect(results).toEqual([{
            tool: 'create-event',
            status: 'error',
            error: "Invalid arguments provided for tool 'create-event'.",
        }]);
    });

    it('should handle individual tool failures gracefully and continue execution', async () => {
        const entityId = 'manager-789';
        const functionCalls = [
            { name: 'create-event', args: { title: 'Success Event' } },
            { name: 'invite-user', args: { email: 'fail@test.com' } },
            { name: 'delete-something', args: {} }
        ];

        mockExecuteToolCall
            .mockResolvedValueOnce({ success: true, eventId: 'evt-1' })
            .mockRejectedValueOnce(new Error('API Failed'))
            .mockResolvedValueOnce({ success: true, deleted: true });

        const results = await executeMultipleTools(entityId, functionCalls, toolkitVersions, toolDefinitions);

        expect(mockExecuteToolCall).toHaveBeenCalledTimes(3);
        expect(results).toEqual([
            { tool: 'create-event', status: 'success', result: { success: true, eventId: 'evt-1' } },
            { tool: 'invite-user', status: 'error', error: 'An error occurred while trying to perform this action.' },
            { tool: 'delete-something', status: 'success', result: { success: true, deleted: true } }
        ]);
    });
  });
});