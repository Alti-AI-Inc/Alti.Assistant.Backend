import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import { SwarmController } from './swarm.controller.js';

// Mock dependencies
vi.mock('../../../shared/catchAsync.js', () => ({
  default: (fn) => fn, // Mock catchAsync to simply return the function for direct testing
}));
vi.mock('../../../shared/sendResponse.js', () => ({
  default: vi.fn(),
}));
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock('../search/search.service.js', () => ({
  searchService: {
    generateGuestUserId: vi.fn(),
    generateSearchConversationId: vi.fn(),
    handleSearchConversation: vi.fn(),
    addSearchQueryMessage: vi.fn(),
    addSearchResultMessage: vi.fn(),
    addErrorMessage: vi.fn(),
  },
}));
vi.mock('./swarm.service.js', () => ({
  SwarmService: {
    executeSwarmStream: vi.fn(),
  },
}));
vi.mock('../conversations/userMemory.service.js', () => ({
  userMemoryService: {
    asyncExtractFacts: vi.fn(),
  },
}));
vi.mock('../docker/dockerWorkspace.service.js', () => ({
  dockerWorkspaceService: {
    prewarmWorkspace: vi.fn(),
  },
}));

// Import mocked modules
import sendResponse from '../../../shared/sendResponse.js';
import { logger } from '../../../shared/logger.js';
import { searchService } from '../search/search.service.js';
import { SwarmService } from './swarm.service.js';
import { userMemoryService } from '../conversations/userMemory.service.js';
import { dockerWorkspaceService } from '../docker/dockerWorkspace.service.js';

describe('SwarmController', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      body: {},
      user: null,
      isGuest: undefined,
    };

    mockRes = {
      setHeader: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      headersSent: false,
    };

    // Default mock implementations for services
    searchService.generateGuestUserId.mockReturnValue('guest_generated_id');
    searchService.generateSearchConversationId.mockReturnValue('conv_generated_id');
    searchService.handleSearchConversation.mockResolvedValue({
      conversationId: 'conv_existing_id',
      messages: [],
      messageCount: 0,
    });
    searchService.addSearchQueryMessage.mockResolvedValue(undefined);
    searchService.addSearchResultMessage.mockResolvedValue(undefined);
    searchService.addErrorMessage.mockResolvedValue(undefined);
    userMemoryService.asyncExtractFacts.mockResolvedValue(undefined);
    dockerWorkspaceService.prewarmWorkspace.mockResolvedValue(undefined);

    // Default mock for SwarmService.executeSwarmStream to yield some data
    SwarmService.executeSwarmStream.mockImplementation(async function* () {
      yield { type: 'agent_start', agent: 'test_agent' };
      yield { type: 'text', content: 'Hello' };
      yield { type: 'text', content: ' world.' };
      yield {
        type: 'metadata',
        reference: [{ title: 'Ref1', url: 'url1' }],
        citations: [{ index: 0, start: 0, end: 5, text: 'Hello' }],
      };
    });
  });

  describe('performSwarmStreamingSearch', () => {
    it('should return BAD_REQUEST if message is missing', async () => {
      mockReq.body = { conversationId: 'some_id' };
      mockReq.user = { userId: 'user123' };

      await SwarmController.performSwarmStreamingSearch(mockReq, mockRes);

      expect(sendResponse).toHaveBeenCalledWith(mockRes, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'A search query is required',
      });
      expect(mockRes.setHeader).not.toHaveBeenCalled();
      expect(mockRes.write).not.toHaveBeenCalled();
      expect(mockRes.end).not.toHaveBeenCalled();
    });

    it('should return INTERNAL_SERVER_ERROR if userId cannot be determined', async () => {
      mockReq.body = { message: 'test message' };
      mockReq.user = null; // No authenticated user
      mockReq.isGuest = false; // Explicitly not a guest, but no user ID
      searchService.generateGuestUserId.mockReturnValue(null); // Ensure guest ID generation fails if it were a guest

      await SwarmController.performSwarmStreamingSearch(mockReq, mockRes);

      expect(sendResponse).toHaveBeenCalledWith(mockRes, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to generate user identifier',
      });
      expect(mockRes.setHeader).not.toHaveBeenCalled();
      expect(mockRes.write).not.toHaveBeenCalled();
      expect(mockRes.end).not.toHaveBeenCalled();
    });

    it('should set SSE headers correctly', async () => {
      mockReq.body = { message: 'test message' };
      mockReq.user = { userId: 'user123' };

      await SwarmController.performSwarmStreamingSearch(mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    });

    it('should handle authenticated user and existing conversation', async () => {
      mockReq.body = { message: 'test message', conversationId: 'conv_123' };
      mockReq.user = { userId: 'auth_user_id' };
      searchService.handleSearchConversation.mockResolvedValueOnce({
        conversationId: 'conv_123',
        messages: [{ role: 'user', content: 'prev message' }],
        messageCount: 1,
      });

      await SwarmController.performSwarmStreamingSearch(mockReq, mockRes);

      expect(searchService.handleSearchConversation).toHaveBeenCalledWith(
        'auth_user_id',
        'conv_123',
        'test message',
        false, // isGuest
        mockReq
      );
      expect(searchService.addSearchQueryMessage).toHaveBeenCalledWith(
        'conv_123',
        'auth_user_id',
        'test message',
        false,
        mockReq
      );
      expect(SwarmService.executeSwarmStream).toHaveBeenCalledWith(
        'test message',
        [{ role: 'user', content: 'prev message' }], // conversationHistory
        'auth_user_id',
        { requireSearch: true }
      );
      expect(userMemoryService.asyncExtractFacts).toHaveBeenCalledWith(
        'auth_user_id',
        'test message',
        'Hello world.'
      );
      expect(mockRes.write).toHaveBeenCalledTimes(4); // connected, text, metadata, done
      expect(mockRes.end).toHaveBeenCalledTimes(1);
    });

    it('should handle guest user with provided valid guest userId', async () => {
      mockReq.body = { message: 'test message', userId: 'guest_abc123' };
      mockReq.isGuest = true;

      await SwarmController.performSwarmStreamingSearch(mockReq, mockRes);

      expect(searchService.generateGuestUserId).not.toHaveBeenCalled();
      expect(searchService.handleSearchConversation).toHaveBeenCalledWith(
        'guest_abc123',
        undefined, // No conversationId provided
        'test message',
        true, // isGuest
        mockReq
      );
      expect(searchService.addSearchQueryMessage).toHaveBeenCalledWith(
        'conv_existing_id', // From handleSearchConversation mock
        'guest_abc123',
        'test message',
        true,
        mockReq
      );
      expect(SwarmService.executeSwarmStream).toHaveBeenCalledWith(
        'test message',
        [], // No conversation history for new guest conversation
        'guest_abc123',
        { requireSearch: true }
      );
      expect(userMemoryService.asyncExtractFacts).not.toHaveBeenCalled(); // Not called for guest
      expect(mockRes.write).toHaveBeenCalledTimes(4);
      expect(mockRes.end).toHaveBeenCalledTimes(1);
    });

    it('should handle guest user without provided userId, generating one', async () => {
      mockReq.body = { message: 'test message' };
      mockReq.isGuest = true;

      await SwarmController.performSwarmStreamingSearch(mockReq, mockRes);

      expect(searchService.generateGuestUserId).toHaveBeenCalled();
      expect(searchService.handleSearchConversation).toHaveBeenCalledWith(
        'guest_generated_id',
        undefined,
        'test message',
        true,
        mockReq
      );
      expect(SwarmService.executeSwarmStream).toHaveBeenCalledWith(
        'test message',
        [],
        'guest_generated_id',
        { requireSearch: true }
      );
      expect(userMemoryService.asyncExtractFacts).not.toHaveBeenCalled();
      expect(mockRes.write).toHaveBeenCalledTimes(4);
      expect(mockRes.end).toHaveBeenCalledTimes(1);
    });

    it('should handle `requireSearch: false` correctly', async () => {
      mockReq.body = { message: 'test message', requireSearch: false };
      mockReq.user = { userId: 'auth_user_id' };

      await SwarmController.performSwarmStreamingSearch(mockReq, mockRes);

      expect(SwarmService.executeSwarmStream).toHaveBeenCalledWith(
        'test message',
        [],
        'auth_user_id',
        { requireSearch: false }
      );
    });

    it('should send correct SSE events for text and metadata', async () => {
      mockReq.body = { message: 'test message' };
      mockReq.user = { userId: 'user123' };

      const mockReferences = [{ title: 'Mock Ref', url: 'mock.url' }];
      const mockCitations = [{ index: 0, start: 0, end: 4, text: 'Mock' }];

      SwarmService.executeSwarmStream.mockImplementationOnce(async function* () {
        yield { type: 'text', content: 'First chunk. ' };
        yield { type: 'text', content: 'Second chunk.' };
        yield { type: 'metadata', reference: mockReferences, citations: mockCitations, timestamp: 12345 };
      });

      await SwarmController.performSwarmStreamingSearch(mockReq, mockRes);

      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('"type":"connected"'));
      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('"type":"text","content":"First chunk. "'));
      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('"type":"text","content":"Second chunk."'));
      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining(`"type":"metadata","reference":${JSON.stringify(mockReferences)},"citations":${JSON.stringify(mockCitations)}`));
      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('"type":"done"'));

      expect(searchService.addSearchResultMessage).toHaveBeenCalledWith(
        'conv_existing_id',
        'user123',
        'First chunk. Second chunk.',
        expect.objectContaining({
          reference: mockReferences,
          citationMetadata: { citations: mockCitations },
        }),
        false,
        mockReq
      );
    });

    it('should handle errors during streaming and send an error event', async () => {
      mockReq.body = { message: 'test message', conversationId: 'conv_error' };
      mockReq.user = { userId: 'user123' };
      const streamError = new Error('Stream failed');
      SwarmService.executeSwarmStream.mockImplementationOnce(async function* () {
        yield { type: 'text', content: 'Partial text.' };
        throw streamError;
      });

      await SwarmController.performSwarmStreamingSearch(mockReq, mockRes);

      expect(logger.error).toHaveBeenCalledWith('📡 Swarm Controller: Streaming Search Error:', streamError);
      expect(searchService.addErrorMessage).toHaveBeenCalledWith(
        'conv_error',
        'user123',
        'I apologize, but an error occurred while processing your streaming search request.',
        streamError,
        false,
        mockReq
      );
      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('"type":"connected"'));
      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('"type":"text","content":"Partial text."'));
      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining(`"type":"error","error":"${streamError.message}"`));
      expect(mockRes.end).toHaveBeenCalledTimes(1);
      expect(searchService.addSearchResultMessage).not.toHaveBeenCalled(); // Should not save partial result
      expect(userMemoryService.asyncExtractFacts).not.toHaveBeenCalled(); // Should not extract facts on error
    });

    it('should handle errors during streaming when headers are already sent', async () => {
      mockReq.body = { message: 'test message' };
      mockReq.user = { userId: 'user123' };
      const streamError = new Error('Stream failed after headers');
      SwarmService.executeSwarmStream.mockImplementationOnce(async function* () {
        yield { type: 'text', content: 'Partial text.' };
        mockRes.headersSent = true; // Simulate headers already sent
        throw streamError;
      });

      await SwarmController.performSwarmStreamingSearch(mockReq, mockRes);

      expect(mockRes.setHeader).not.toHaveBeenCalledWith('Content-Type', 'text/event-stream'); // Should not set headers again
      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining(`"type":"error","error":"${streamError.message}"`));
      expect(mockRes.end).toHaveBeenCalledTimes(1);
    });

    it('should handle error saving to conversation gracefully', async () => {
      mockReq.body = { message: 'test message' };
      mockReq.user = { userId: 'user123' };
      const streamError = new Error('Stream failed');
      const convSaveError = new Error('Failed to save conversation error');
      SwarmService.executeSwarmStream.mockImplementationOnce(async function* () {
        throw streamError;
      });
      searchService.addErrorMessage.mockRejectedValueOnce(convSaveError);

      await SwarmController.performSwarmStreamingSearch(mockReq, mockRes);

      expect(logger.error).toHaveBeenCalledWith('📡 Swarm Controller: Streaming Search Error:', streamError);
      expect(logger.error).toHaveBeenCalledWith('Failed to save error to conversation:', convSaveError);
      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining(`"type":"error","error":"${streamError.message}"`));
      expect(mockRes.end).toHaveBeenCalledTimes(1);
    });
  });

  describe('prewarmUserSandbox', () => {
    it('should prewarm for an authenticated user', async () => {
      mockReq.user = { userId: 'auth_user_id' };
      mockReq.isGuest = false;

      await SwarmController.prewarmUserSandbox(mockReq, mockRes);

      expect(logger.info).toHaveBeenCalledWith('[DOCKER PREWARM] Asynchronously pre-warming sandbox container for user: auth_user_id');
      expect(dockerWorkspaceService.prewarmWorkspace).toHaveBeenCalledWith('auth_user_id');
      expect(sendResponse).toHaveBeenCalledWith(mockRes, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Sandbox container pre-warming initiated successfully',
      });
    });

    it('should prewarm for a guest user with a valid guest_ prefixed userId in body', async () => {
      mockReq.body = { userId: 'guest_abc123' };
      mockReq.isGuest = true;

      await SwarmController.prewarmUserSandbox(mockReq, mockRes);

      expect(logger.info).toHaveBeenCalledWith('[DOCKER PREWARM] Asynchronously pre-warming sandbox container for user: guest_abc123');
      expect(dockerWorkspaceService.prewarmWorkspace).toHaveBeenCalledWith('guest_abc123');
      expect(sendResponse).toHaveBeenCalledWith(mockRes, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Sandbox container pre-warming initiated successfully',
      });
    });

    it('should NOT prewarm if no userId is available for guest user', async () => {
      mockReq.body = {}; // No userId in body
      mockReq.isGuest = true;

      await SwarmController.prewarmUserSandbox(mockReq, mockRes);

      expect(logger.info).not.toHaveBeenCalled();
      expect(dockerWorkspaceService.prewarmWorkspace).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(mockRes, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Sandbox container pre-warming initiated successfully',
      });
    });

    it('should NOT prewarm if provided guest userId is not guest_ prefixed', async () => {
      mockReq.body = { userId: 'invalid_user_id' };
      mockReq.isGuest = true;

      await SwarmController.prewarmUserSandbox(mockReq, mockRes);

      expect(logger.info).not.toHaveBeenCalled();
      expect(dockerWorkspaceService.prewarmWorkspace).not.toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(mockRes, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Sandbox container pre-warming initiated successfully',
      });
    });

    it('should log an error if prewarmWorkspace fails but still send success response', async () => {
      mockReq.user = { userId: 'auth_user_id' };
      mockReq.isGuest = false;
      const prewarmError = new Error('Docker prewarm failed');
      dockerWorkspaceService.prewarmWorkspace.mockRejectedValueOnce(prewarmError);

      await SwarmController.prewarmUserSandbox(mockReq, mockRes);

      expect(logger.info).toHaveBeenCalledWith('[DOCKER PREWARM] Asynchronously pre-warming sandbox container for user: auth_user_id');
      expect(dockerWorkspaceService.prewarmWorkspace).toHaveBeenCalledWith('auth_user_id');
      expect(logger.error).toHaveBeenCalledWith(`[DOCKER PREWARM ERROR] Failed to prewarm container for user auth_user_id: ${prewarmError.message}`);
      expect(sendResponse).toHaveBeenCalledWith(mockRes, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Sandbox container pre-warming initiated successfully',
      });
    });
  });
});