import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import ApiError from '../../../errors/ApiError.js';
import httpStatus from 'http-status';
import BrowserSession from './browserUse.model.js';
import User from '../auth/auth.model.js';
import { withTenantFilter } from '../../helpers/tenantQuery.js';
import { BrowserUseServices } from './browserUse.service.js';

// Mock external dependencies
vi.mock('axios');
vi.mock('../../../../config/index.js', () => ({
  default: {
    browser_use_secret_key: 'test-browser-use-secret',
  },
}));
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('./browserUse.model.js');
vi.mock('../auth/auth.model.js');
vi.mock('../../helpers/tenantQuery.js', () => ({
  withTenantFilter: vi.fn().mockImplementation((req, query) => query), // Simple passthrough for testing tenant logic
}));

describe('BrowserUseServices', () => {
  const mockUserId = 'user123';
  const mockTenantId = 'tenant456';
  const mockSessionId = 'session789';
  const mockTaskId = 'task001';
  const mockPrompt = 'Go to google.com and search for vitest';
  const mockStructuredOutputSchema = { type: 'object', properties: { result: { type: 'string' } } };
  const mockReq = {
    user: {
      currentTenantId: mockTenantId,
    },
    tenantId: mockTenantId, // Fallback for direct tenantId on req
  };

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Mock Mongoose model methods
    BrowserSession.findOne = vi.fn();
    BrowserSession.create = vi.fn();
    BrowserSession.findOneAndUpdate = vi.fn();
    BrowserSession.find = vi.fn().mockReturnThis(); // Allow chaining .select(), .sort(), .lean()
    BrowserSession.prototype.save = vi.fn();

    User.findByIdAndUpdate = vi.fn();

    // Mock axios responses
    axios.post.mockResolvedValue({
      data: {
        id: mockTaskId,
        status: 'created',
        live_url: 'https://live.browser-use.com/task001',
        steps: [{ description: 'Initial step' }],
      },
    });
    axios.get.mockResolvedValue({
      data: {
        id: mockTaskId,
        status: 'completed',
        output: 'Search results for vitest',
        structured_output: { result: 'vitest search complete' },
        live_url: 'https://live.browser-use.com/task001',
        error_message: null,
        finished_at: new Date().toISOString(),
        steps: [{ description: 'Initial step' }, { description: 'Final step' }],
      },
    });

    // Mock chainable Mongoose methods for BrowserSession.find
    BrowserSession.find.mockReturnThis();
    BrowserSession.prototype.select = vi.fn().mockReturnThis();
    BrowserSession.prototype.sort = vi.fn().mockReturnThis();
    BrowserSession.prototype.lean = vi.fn().mockResolvedValue([]); // Default for find
  });

  describe('initiateTaskInSessionService', () => {
    it('should create a new session and add a task if no sessionId is provided', async () => {
      const mockNewSession = {
        _id: mockSessionId,
        user: mockUserId,
        tenantId: mockTenantId,
        responses: [{
          taskId: mockTaskId,
          status: 'created',
          prompt: mockPrompt,
          live_url: 'https://live.browser-use.com/task001',
          steps: [{ description: 'Initial step' }],
        }],
      };
      BrowserSession.create.mockResolvedValue(mockNewSession);

      const result = await BrowserUseServices.initiateTaskInSessionService(
        mockUserId,
        null, // No sessionId
        mockPrompt,
        mockStructuredOutputSchema,
        mockReq
      );

      expect(axios.post).toHaveBeenCalledWith(
        'https://api.browser-use.com/api/v1/run-task',
        {
          task: mockPrompt,
          secrets: {},
          allowed_domains: null,
          save_browser_data: true,
          llm_model: 'gemini-2.5-flash',
          use_adblock: true,
          use_proxy: true,
          highlight_elements: true,
          structured_output_json: mockStructuredOutputSchema,
        },
        {
          headers: {
            Authorization: `Bearer ${config.browser_use_secret_key}`,
            'Content-Type': 'application/json',
          },
        }
      );
      expect(BrowserSession.create).toHaveBeenCalledWith({
        user: mockUserId,
        tenantId: mockTenantId,
        responses: [{
          taskId: mockTaskId,
          status: 'created',
          prompt: mockPrompt,
          live_url: 'https://live.browser-use.com/task001',
          steps: [{ description: 'Initial step' }],
        }],
      });
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        mockUserId,
        { $push: { browserSessions: mockSessionId } }
      );
      expect(result).toEqual(mockNewSession);
      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { user: mockUserId }); // Called for User.findByIdAndUpdate implicitly
    });

    it('should add a task to an existing session if sessionId is provided', async () => {
      const mockExistingSession = {
        _id: mockSessionId,
        user: mockUserId,
        tenantId: mockTenantId,
        responses: [{
          taskId: 'oldTask',
          status: 'completed',
          prompt: 'Old prompt',
          live_url: 'old_url',
          steps: [],
        }],
        save: vi.fn().mockResolvedValue(true),
      };
      BrowserSession.findOne.mockResolvedValue(mockExistingSession);

      const result = await BrowserUseServices.initiateTaskInSessionService(
        mockUserId,
        mockSessionId,
        mockPrompt,
        null, // No structured output schema
        mockReq
      );

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ task: mockPrompt }),
        expect.any(Object)
      );
      expect(BrowserSession.findOne).toHaveBeenCalledWith({
        _id: mockSessionId,
        user: mockUserId,
        tenantId: mockTenantId,
      });
      expect(mockExistingSession.responses).toHaveLength(2);
      expect(mockExistingSession.responses[1]).toEqual({
        taskId: mockTaskId,
        status: 'created',
        prompt: mockPrompt,
        live_url: 'https://live.browser-use.com/task001',
        steps: [{ description: 'Initial step' }],
      });
      expect(mockExistingSession.save).toHaveBeenCalled();
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled(); // Not called for existing session
      expect(result).toEqual(mockExistingSession);
      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { _id: mockSessionId, user: mockUserId });
    });

    it('should throw ApiError if API does not return a task ID', async () => {
      axios.post.mockResolvedValue({ data: { status: 'failed' } }); // No 'id' field

      await expect(
        BrowserUseServices.initiateTaskInSessionService(
          mockUserId,
          null,
          mockPrompt,
          null,
          mockReq
        )
      ).rejects.toThrow(new ApiError(httpStatus.NOT_FOUND, 'API did not return a task ID'));
    });

    it('should throw ApiError if existing session is not found', async () => {
      BrowserSession.findOne.mockResolvedValue(null); // Session not found

      await expect(
        BrowserUseServices.initiateTaskInSessionService(
          mockUserId,
          mockSessionId,
          mockPrompt,
          null,
          mockReq
        )
      ).rejects.toThrow(new ApiError(httpStatus.NOT_FOUND, 'Session not found.'));
      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { _id: mockSessionId, user: mockUserId });
    });

    it('should handle req being null (no tenant filtering)', async () => {
      const mockNewSession = {
        _id: mockSessionId,
        user: mockUserId,
        tenantId: null, // No tenantId when req is null
        responses: [{
          taskId: mockTaskId,
          status: 'created',
          prompt: mockPrompt,
          live_url: 'https://live.browser-use.com/task001',
          steps: [{ description: 'Initial step' }],
        }],
      };
      BrowserSession.create.mockResolvedValue(mockNewSession);

      const result = await BrowserUseServices.initiateTaskInSessionService(
        mockUserId,
        null,
        mockPrompt,
        null,
        null // req is null
      );

      expect(BrowserSession.create).toHaveBeenCalledWith({
        user: mockUserId,
        tenantId: null,
        responses: expect.any(Array),
      });
      expect(withTenantFilter).not.toHaveBeenCalled();
      expect(result).toEqual(mockNewSession);
    });
  });

  describe('updateTaskStatusService', () => {
    it('should fetch task status from API and update the session', async () => {
      const mockUpdatedSession = {
        _id: mockSessionId,
        user: mockUserId,
        tenantId: mockTenantId,
        responses: [{
          taskId: mockTaskId,
          status: 'completed',
          output: 'Search results for vitest',
          structured_output: { result: 'vitest search complete' },
          live_url: 'https://live.browser-use.com/task001',
          error_message: null,
          finished_at: expect.any(String),
          steps: [{ description: 'Initial step' }, { description: 'Final step' }],
        }],
      };
      BrowserSession.findOneAndUpdate.mockResolvedValue(mockUpdatedSession);

      const result = await BrowserUseServices.updateTaskStatusService(
        mockSessionId,
        mockTaskId,
        mockReq
      );

      expect(axios.get).toHaveBeenCalledWith(
        `https://api.browser-use.com/api/v1/task/${mockTaskId}`,
        { headers: { Authorization: `Bearer ${config.browser_use_secret_key}` } }
      );
      expect(BrowserSession.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: mockSessionId, 'responses.taskId': mockTaskId, tenantId: mockTenantId },
        {
          $set: {
            'responses.$.status': 'completed',
            'responses.$.output': 'Search results for vitest',
            'responses.$.structured_output': { result: 'vitest search complete' },
            'responses.$.live_url': 'https://live.browser-use.com/task001',
            'responses.$.error_message': null,
            'responses.$.finished_at': expect.any(String),
            'responses.$.steps': [{ description: 'Initial step' }, { description: 'Final step' }],
          },
        },
        { new: true }
      );
      expect(result).toEqual(mockUpdatedSession);
      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { _id: mockSessionId, 'responses.taskId': mockTaskId });
    });

    it('should throw ApiError if task/session not found for update', async () => {
      BrowserSession.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        BrowserUseServices.updateTaskStatusService(
          mockSessionId,
          mockTaskId,
          mockReq
        )
      ).rejects.toThrow(new ApiError(httpStatus.NOT_FOUND, 'Task to update was not found in the session.'));
      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { _id: mockSessionId, 'responses.taskId': mockTaskId });
    });

    it('should handle req being null (no tenant filtering)', async () => {
      const mockUpdatedSession = {
        _id: mockSessionId,
        user: mockUserId,
        tenantId: null,
        responses: [{
          taskId: mockTaskId,
          status: 'completed',
          output: 'Search results for vitest',
          structured_output: { result: 'vitest search complete' },
          live_url: 'https://live.browser-use.com/task001',
          error_message: null,
          finished_at: expect.any(String),
          steps: [{ description: 'Initial step' }, { description: 'Final step' }],
        }],
      };
      BrowserSession.findOneAndUpdate.mockResolvedValue(mockUpdatedSession);

      const result = await BrowserUseServices.updateTaskStatusService(
        mockSessionId,
        mockTaskId,
        null // req is null
      );

      expect(BrowserSession.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: mockSessionId, 'responses.taskId': mockTaskId }, // No tenantId in query
        expect.any(Object),
        { new: true }
      );
      expect(withTenantFilter).not.toHaveBeenCalled();
      expect(result).toEqual(mockUpdatedSession);
    });
  });

  describe('getSessionsForUserService', () => {
    it('should retrieve sessions for a user with specific fields and sorting', async () => {
      const mockSessions = [
        { _id: 's1', user: mockUserId, tenantId: mockTenantId, responses: [{ prompt: 'Task 1' }], updatedAt: new Date() },
        { _id: 's2', user: mockUserId, tenantId: mockTenantId, responses: [{ prompt: 'Task 2' }], updatedAt: new Date() },
      ];
      BrowserSession.prototype.lean.mockResolvedValue(mockSessions);

      const result = await BrowserUseServices.getSessionsForUserService(mockUserId, mockReq);

      expect(BrowserSession.find).toHaveBeenCalledWith({ user: mockUserId, tenantId: mockTenantId });
      expect(BrowserSession.prototype.select).toHaveBeenCalledWith({
        'responses.prompt': { $slice: 1 },
        'responses.status': 0,
        'responses.output': 0,
        'responses.taskId': 0,
        'responses.live_url': 0,
        'responses.error_message': 0,
        'responses.finished_at': 0,
        'responses.structured_output': 0,
        'responses.createdAt': 0,
        'responses.updatedAt': 0,
      });
      expect(BrowserSession.prototype.sort).toHaveBeenCalledWith({ updatedAt: -1 });
      expect(BrowserSession.prototype.lean).toHaveBeenCalled();
      expect(result).toEqual(mockSessions);
      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { user: mockUserId });
    });

    it('should return an empty array if no sessions are found', async () => {
      BrowserSession.prototype.lean.mockResolvedValue([]);

      const result = await BrowserUseServices.getSessionsForUserService(mockUserId, mockReq);

      expect(result).toEqual([]);
    });

    it('should handle req being null (no tenant filtering)', async () => {
      const mockSessions = [
        { _id: 's1', user: mockUserId, tenantId: null, responses: [{ prompt: 'Task 1' }], updatedAt: new Date() },
      ];
      BrowserSession.prototype.lean.mockResolvedValue(mockSessions);

      const result = await BrowserUseServices.getSessionsForUserService(mockUserId, null); // req is null

      expect(BrowserSession.find).toHaveBeenCalledWith({ user: mockUserId }); // No tenantId in query
      expect(withTenantFilter).not.toHaveBeenCalled();
      expect(result).toEqual(mockSessions);
    });
  });

  describe('getSessionByIdService', () => {
    it('should retrieve a single session by ID for a user', async () => {
      const mockSession = {
        _id: mockSessionId,
        user: mockUserId,
        tenantId: mockTenantId,
        responses: [{ prompt: 'Full task details' }],
      };
      BrowserSession.findOne.mockResolvedValue(mockSession);
      BrowserSession.prototype.lean.mockResolvedValue(mockSession); // For the .lean() call

      const result = await BrowserUseServices.getSessionByIdService(mockSessionId, mockUserId, mockReq);

      expect(BrowserSession.findOne).toHaveBeenCalledWith({
        _id: mockSessionId,
        user: mockUserId,
        tenantId: mockTenantId,
      });
      expect(BrowserSession.prototype.lean).toHaveBeenCalled();
      expect(result).toEqual(mockSession);
      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { _id: mockSessionId, user: mockUserId });
    });

    it('should throw ApiError if session is not found or access denied', async () => {
      BrowserSession.findOne.mockResolvedValue(null);

      await expect(
        BrowserUseServices.getSessionByIdService(mockSessionId, mockUserId, mockReq)
      ).rejects.toThrow(new ApiError(httpStatus.NOT_FOUND, 'Session not found or access denied.'));
      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { _id: mockSessionId, user: mockUserId });
    });

    it('should handle req being null (no tenant filtering)', async () => {
      const mockSession = {
        _id: mockSessionId,
        user: mockUserId,
        tenantId: null,
        responses: [{ prompt: 'Full task details' }],
      };
      BrowserSession.findOne.mockResolvedValue(mockSession);
      BrowserSession.prototype.lean.mockResolvedValue(mockSession);

      const result = await BrowserUseServices.getSessionByIdService(mockSessionId, mockUserId, null); // req is null

      expect(BrowserSession.findOne).toHaveBeenCalledWith({
        _id: mockSessionId,
        user: mockUserId,
      }); // No tenantId in query
      expect(withTenantFilter).not.toHaveBeenCalled();
      expect(result).toEqual(mockSession);
    });
  });
});