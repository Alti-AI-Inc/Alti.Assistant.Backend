import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import {
  conversationalAssistant,
  generatePresentation,
  checkTaskStatus,
  editPresentation,
  derivePresentation,
  getPresentation,
} from './presentation.controller.js';

// Mock external dependencies
vi.mock('http-status', () => ({
  default: {
    OK: 200,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
  },
}));

// Mock catchAsync to simply return the function it wraps, allowing direct testing
vi.mock('../../../shared/catchAsync.js', () => ({
  default: (fn) => fn,
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const mockSendResponse = vi.fn();
vi.mock('../../../shared/sendResponse.js', () => ({
  default: mockSendResponse,
}));

const mockPresentationService = {
  generateGuestUserId: vi.fn(),
  processConversationalRequest: vi.fn(),
};
vi.mock('./presentation.service.js', () => ({
  presentationService: mockPresentationService,
}));

const mockConversationHelpers = {
  getConversationById: vi.fn(),
};
vi.mock('../conversations/conversation.helpers.js', () => ({
  conversationHelpers: mockConversationHelpers,
}));

const mockConversationService = {
  updatePresentationMetadata: vi.fn(),
};
vi.mock('../conversations/conversation.service.js', () => ({
  conversationService: mockConversationService,
}));

// Mock dynamically imported modules
const mockPresentonAPIClient = {
  generatePresentationAsync: vi.fn(),
  generatePresentation: vi.fn(),
  checkTaskStatus: vi.fn(),
  editPresentation: vi.fn(),
  derivePresentation: vi.fn(),
  getPresentation: vi.fn(),
};
const mockUploadPresentationToGCS = vi.fn();
const mockPath = {
  default: {
    basename: vi.fn(),
  },
};

vi.mock('./services/presentonAPIClient.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    presentonAPIClient: mockPresentonAPIClient,
  };
});

vi.mock('./services/gcsUploadService.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    uploadPresentationToGCS: mockUploadPresentationToGCS,
  };
});

vi.mock('path', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    default: {
      basename: mockPath.default.basename,
    },
  };
});

describe('Presentation Controller', () => {
  let req, res;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Default mock req and res objects
    req = {
      body: {},
      params: {},
      query: {},
      user: {
        userId: 'testUserId',
        _id: 'testUserId',
      },
      isGuest: false,
    };
    res = {}; // sendResponse handles the actual response, so res object itself doesn't need methods like status/json
  });

  // --- conversationalAssistant tests ---
  describe('conversationalAssistant', () => {
    it('should return 400 if message is missing', async () => {
      req.body = { conversationId: 'conv123' };

      await conversationalAssistant(req, res);

      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Message is required',
      });
      expect(mockPresentationService.processConversationalRequest).not.toHaveBeenCalled();
    });

    it('should generate guest userId if req.isGuest is true', async () => {
      req.isGuest = true;
      req.user = null;
      req.body = { message: 'Hello', conversationId: 'conv123' };
      mockPresentationService.generateGuestUserId.mockReturnValue('guestUserId123');
      mockPresentationService.processConversationalRequest.mockResolvedValue({
        conversationId: 'conv123',
        success: true,
        needsMoreInfo: false,
        data: { text: 'response' },
      });

      await conversationalAssistant(req, res);

      expect(mockPresentationService.generateGuestUserId).toHaveBeenCalled();
      expect(mockPresentationService.processConversationalRequest).toHaveBeenCalledWith(
        'guestUserId123',
        'Hello',
        'conv123',
        true,
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: expect.any(Object),
      });
    });

    it('should use userId from req.body if provided, even for authenticated user', async () => {
      req.body = { message: 'Hello', conversationId: 'conv123', userId: 'overrideUserId' };
      mockPresentationService.processConversationalRequest.mockResolvedValue({
        conversationId: 'conv123',
        success: true,
        needsMoreInfo: false,
        data: { text: 'response' },
      });

      await conversationalAssistant(req, res);

      expect(mockPresentationService.generateGuestUserId).not.toHaveBeenCalled();
      expect(mockPresentationService.processConversationalRequest).toHaveBeenCalledWith(
        'overrideUserId',
        'Hello',
        'conv123',
        false,
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: expect.any(Object),
      });
    });

    it('should return 500 if userId cannot be determined', async () => {
      req.isGuest = true;
      req.user = null;
      req.body = { message: 'Hello' };
      mockPresentationService.generateGuestUserId.mockReturnValue(null); // Simulate failure to generate ID

      await conversationalAssistant(req, res);

      expect(mockPresentationService.generateGuestUserId).toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to generate user identifier',
      });
      expect(mockPresentationService.processConversationalRequest).not.toHaveBeenCalled();
    });

    it('should process conversational request and send success response', async () => {
      req.body = { message: 'Generate a presentation about AI', conversationId: 'conv123' };
      const mockResult = {
        conversationId: 'conv123',
        success: true,
        needsMoreInfo: false,
        data: { text: 'Here is your presentation outline.' },
      };
      mockPresentationService.processConversationalRequest.mockResolvedValue(mockResult);

      await conversationalAssistant(req, res);

      expect(mockPresentationService.processConversationalRequest).toHaveBeenCalledWith(
        'testUserId',
        'Generate a presentation about AI',
        'conv123',
        false,
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Request processed successfully',
        data: mockResult,
      });
      expect(logger.info).toHaveBeenCalledWith(
        `Presentation assistant request from authenticated user testUserId`
      );
      expect(logger.info).toHaveBeenCalledWith('Presentation assistant response:', {
        conversationId: mockResult.conversationId,
        success: mockResult.success,
        needsMoreInfo: mockResult.needsMoreInfo,
      });
    });

    it('should handle errors during conversational request processing', async () => {
      req.body = { message: 'Generate a presentation about AI' };
      const errorMessage = 'Service unavailable';
      const error = new Error(errorMessage);
      error.statusCode = 503;
      mockPresentationService.processConversationalRequest.mockRejectedValue(error);

      await conversationalAssistant(req, res);

      expect(mockPresentationService.processConversationalRequest).toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: 503,
        success: false,
        message: errorMessage,
        data: {
          conversationId: undefined, // No conversationId in req.body for this test case
          error: errorMessage,
        },
      });
      expect(logger.error).toHaveBeenCalledWith('Error in conversational assistant:', error);
    });

    it('should handle generic errors during conversational request processing', async () => {
      req.body = { message: 'Generate a presentation about AI', conversationId: 'conv123' };
      const errorMessage = 'Something went wrong';
      mockPresentationService.processConversationalRequest.mockRejectedValue(new Error(errorMessage));

      await conversationalAssistant(req, res);

      expect(mockPresentationService.processConversationalRequest).toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'An error occurred while processing your request',
        data: {
          conversationId: 'conv123',
          error: errorMessage,
        },
      });
      expect(logger.error).toHaveBeenCalledWith('Error in conversational assistant:', expect.any(Error));
    });
  });

  // --- generatePresentation tests ---
  describe('generatePresentation', () => {
    const commonParams = {
      content: 'AI in healthcare',
      n_slides: 5,
      language: 'en',
    };

    it('should call generatePresentationAsync for async requests', async () => {
      req.body = { ...commonParams, async: true };
      const mockResult = { taskId: 'task123' };
      mockPresentonAPIClient.generatePresentationAsync.mockResolvedValue(mockResult);

      await generatePresentation(req, res);

      expect(mockPresentonAPIClient.generatePresentationAsync).toHaveBeenCalledWith(
        expect.objectContaining(commonParams)
      );
      expect(mockPresentonAPIClient.generatePresentation).not.toHaveBeenCalled();
      expect(mockUploadPresentationToGCS).not.toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Presentation generation started',
        data: mockResult,
      });
      expect(logger.info).toHaveBeenCalledWith('Direct presentation generation request');
    });

    it('should call generatePresentation for sync requests and upload to GCS', async () => {
      req.body = { ...commonParams, async: false };
      const mockSyncResult = {
        downloadUrl: 'http://example.com/pres.pptx',
        presentation_id: 'pres456',
      };
      const mockUploadResult = { publicUrl: 'http://gcs.com/pres.pptx' };
      mockPresentonAPIClient.generatePresentation.mockResolvedValue(mockSyncResult);
      mockUploadPresentationToGCS.mockResolvedValue(mockUploadResult);
      mockPath.default.basename.mockReturnValue('pres.pptx');

      await generatePresentation(req, res);

      expect(mockPresentonAPIClient.generatePresentation).toHaveBeenCalledWith(
        expect.objectContaining(commonParams)
      );
      expect(mockPresentonAPIClient.generatePresentationAsync).not.toHaveBeenCalled();
      expect(mockUploadPresentationToGCS).toHaveBeenCalledWith(
        mockSyncResult.downloadUrl,
        'pres.pptx',
        'testUserId',
        expect.stringMatching(/^direct_\d+$/)
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Presentation generated successfully',
        data: { ...mockSyncResult, publicUrl: mockUploadResult.publicUrl },
      });
      expect(logger.info).toHaveBeenCalledWith(
        `Presentation uploaded to GCS: ${mockUploadResult.publicUrl}`
      );
    });

    it('should handle sync generation without downloadUrl gracefully', async () => {
      req.body = { ...commonParams, async: false };
      const mockSyncResult = { presentation_id: 'pres456' }; // No downloadUrl
      mockPresentonAPIClient.generatePresentation.mockResolvedValue(mockSyncResult);

      await generatePresentation(req, res);

      expect(mockPresentonAPIClient.generatePresentation).toHaveBeenCalled();
      expect(mockUploadPresentationToGCS).not.toHaveBeenCalled(); // No upload if no downloadUrl
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Presentation generated successfully',
        data: mockSyncResult,
      });
      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Presentation uploaded to GCS'));
    });

    it('should handle errors during GCS upload for sync generation', async () => {
      req.body = { ...commonParams, async: false };
      const mockSyncResult = {
        downloadUrl: 'http://example.com/pres.pptx',
        presentation_id: 'pres456',
      };
      const uploadError = new Error('GCS upload failed');
      mockPresentonAPIClient.generatePresentation.mockResolvedValue(mockSyncResult);
      mockUploadPresentationToGCS.mockRejectedValue(uploadError);
      mockPath.default.basename.mockReturnValue('pres.pptx');

      await generatePresentation(req, res);

      expect(mockPresentonAPIClient.generatePresentation).toHaveBeenCalled();
      expect(mockUploadPresentationToGCS).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith('Error uploading presentation to GCS:', uploadError);
      // Should still send success response for presentation generation, even if upload failed
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Presentation generated successfully',
        data: mockSyncResult, // publicUrl will be undefined as upload failed
      });
    });

    it('should handle errors during presentation generation', async () => {
      req.body = { ...commonParams, async: false };
      const errorMessage = 'API generation failed';
      const error = new Error(errorMessage);
      error.status = 400;
      mockPresentonAPIClient.generatePresentation.mockRejectedValue(error);

      await generatePresentation(req, res);

      expect(mockPresentonAPIClient.generatePresentation).toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: 400,
        success: false,
        message: errorMessage,
      });
      expect(logger.error).toHaveBeenCalledWith('Error generating presentation:', error);
    });

    it('should handle generic errors during presentation generation', async () => {
      req.body = { ...commonParams, async: true };
      const errorMessage = 'Unknown error';
      mockPresentonAPIClient.generatePresentationAsync.mockRejectedValue(new Error(errorMessage));

      await generatePresentation(req, res);

      expect(mockPresentonAPIClient.generatePresentationAsync).toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to generate presentation',
      });
      expect(logger.error).toHaveBeenCalledWith('Error generating presentation:', expect.any(Error));
    });
  });

  // --- checkTaskStatus tests ---
  describe('checkTaskStatus', () => {
    it('should retrieve taskId from req.params and check status', async () => {
      req.params = { taskId: 'task123' };
      const mockTaskResult = { status: 'pending' };
      mockPresentonAPIClient.checkTaskStatus.mockResolvedValue(mockTaskResult);

      await checkTaskStatus(req, res);

      expect(mockPresentonAPIClient.checkTaskStatus).toHaveBeenCalledWith('task123');
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Task status retrieved successfully',
        data: { ...mockTaskResult, publicUrl: null, uploadResult: null },
      });
      expect(logger.info).toHaveBeenCalledWith('Checking status for task task123');
    });

    it('should retrieve taskId from conversation metadata if conversationId is provided', async () => {
      req.query = { conversationId: 'conv123' };
      req.user = { userId: 'testUser' };
      mockConversationHelpers.getConversationById.mockResolvedValue({
        metadata: { presentation_metadata: { taskId: 'taskFromConv' } },
      });
      const mockTaskResult = { status: 'completed', data: { path: 'http://api.com/pres.pptx', presentation_id: 'pres789' } };
      const mockUploadResult = { publicUrl: 'http://gcs.com/pres.pptx' };
      mockPresentonAPIClient.checkTaskStatus.mockResolvedValue(mockTaskResult);
      mockUploadPresentationToGCS.mockResolvedValue(mockUploadResult);
      mockPath.default.basename.mockReturnValue('pres.pptx');
      mockConversationService.updatePresentationMetadata.mockResolvedValue({});

      await checkTaskStatus(req, res);

      expect(mockConversationHelpers.getConversationById).toHaveBeenCalledWith('conv123', 'testUser', req);
      expect(mockPresentonAPIClient.checkTaskStatus).toHaveBeenCalledWith('taskFromConv');
      expect(mockUploadPresentationToGCS).toHaveBeenCalledWith(
        mockTaskResult.data.path,
        'pres.pptx',
        'testUser',
        'conv123'
      );
      expect(mockConversationService.updatePresentationMetadata).toHaveBeenCalledWith(
        'conv123',
        'testUser',
        expect.objectContaining({
          taskId: 'taskFromConv',
          status: 'completed',
          publicUrl: mockUploadResult.publicUrl,
        }),
        req
      );
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Task status retrieved successfully',
        data: { ...mockTaskResult, publicUrl: mockUploadResult.publicUrl, uploadResult: mockUploadResult },
      });
      expect(logger.info).toHaveBeenCalledWith(`Retrieved taskId taskFromConv from conversation conv123`);
      expect(logger.info).toHaveBeenCalledWith(`Task taskFromConv presentation uploaded to GCS: ${mockUploadResult.publicUrl}`);
      expect(logger.info).toHaveBeenCalledWith(`Updated conversation conv123 with completion metadata`);
    });

    it('should return 400 if conversationId is provided but no taskId in metadata', async () => {
      req.query = { conversationId: 'conv123' };
      req.user = { userId: 'testUser' };
      mockConversationHelpers.getConversationById.mockResolvedValue({
        metadata: { presentation_metadata: {} }, // No taskId
      });

      await checkTaskStatus(req, res);

      expect(mockConversationHelpers.getConversationById).toHaveBeenCalledWith('conv123', 'testUser', req);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'No task ID found in conversation metadata',
      });
      expect(mockPresentonAPIClient.checkTaskStatus).not.toHaveBeenCalled();
    });

    it('should return 404 if conversationId is provided but conversation not found', async () => {
      req.query = { conversationId: 'nonExistentConv' };
      req.user = { userId: 'testUser' };
      mockConversationHelpers.getConversationById.mockRejectedValue(new Error('Conversation not found'));

      await checkTaskStatus(req, res);

      expect(mockConversationHelpers.getConversationById).toHaveBeenCalledWith('nonExistentConv', 'testUser', req);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Conversation not found',
      });
      expect(mockPresentonAPIClient.checkTaskStatus).not.toHaveBeenCalled();
    });

    it('should handle guest user for checkTaskStatus', async () => {
      req.isGuest = true;
      req.user = null;
      req.params = { taskId: 'guestTask123' };
      mockPresentationService.generateGuestUserId.mockReturnValue('guestUserId456');
      const mockTaskResult = { status: 'pending' };
      mockPresentonAPIClient.checkTaskStatus.mockResolvedValue(mockTaskResult);

      await checkTaskStatus(req, res);

      expect(mockPresentationService.generateGuestUserId).toHaveBeenCalled();
      expect(mockPresentonAPIClient.checkTaskStatus).toHaveBeenCalledWith('guestTask123');
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Task status retrieved successfully',
        data: { ...mockTaskResult, publicUrl: null, uploadResult: null },
      });
    });

    it('should handle userId override in query for checkTaskStatus', async () => {
      req.query = { userId: 'overrideUserId' };
      req.params = { taskId: 'task123' };
      const mockTaskResult = { status: 'pending' };
      mockPresentonAPIClient.checkTaskStatus.mockResolvedValue(mockTaskResult);

      await checkTaskStatus(req, res);

      expect(mockPresentationService.generateGuestUserId).not.toHaveBeenCalled();
      expect(mockPresentonAPIClient.checkTaskStatus).toHaveBeenCalledWith('task123');
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Task status retrieved successfully',
        data: { ...mockTaskResult, publicUrl: null, uploadResult: null },
      });
    });

    it('should handle errors during task status check', async () => {
      req.params = { taskId: 'task123' };
      const errorMessage = 'Task API failed';
      const error = new Error(errorMessage);
      error.status = 404;
      mockPresentonAPIClient.checkTaskStatus.mockRejectedValue(error);

      await checkTaskStatus(req, res);

      expect(mockPresentonAPIClient.checkTaskStatus).toHaveBeenCalledWith('task123');
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: 404,
        success: false,
        message: errorMessage,
      });
      expect(logger.error).toHaveBeenCalledWith('Error checking task status:', error);
    });

    it('should handle generic errors during task status check', async () => {
      req.params = { taskId: 'task123' };
      const errorMessage = 'Unknown error';
      mockPresentonAPIClient.checkTaskStatus.mockRejectedValue(new Error(errorMessage));

      await checkTaskStatus(req, res);

      expect(mockPresentonAPIClient.checkTaskStatus).toHaveBeenCalledWith('task123');
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to check task status',
      });
      expect(logger.error).toHaveBeenCalledWith('Error checking task status:', expect.any(Error));
    });

    it('should not update conversation metadata if upload fails', async () => {
      req.query = { conversationId: 'conv123' };
      req.user = { userId: 'testUser' };
      mockConversationHelpers.getConversationById.mockResolvedValue({
        metadata: { presentation_metadata: { taskId: 'taskFromConv' } },
      });
      const mockTaskResult = { status: 'completed', data: { path: 'http://api.com/pres.pptx', presentation_id: 'pres789' } };
      const uploadError = new Error('GCS upload failed');
      mockPresentonAPIClient.checkTaskStatus.mockResolvedValue(mockTaskResult);
      mockUploadPresentationToGCS.mockRejectedValue(uploadError);
      mockPath.default.basename.mockReturnValue('pres.pptx');

      await checkTaskStatus(req, res);

      expect(mockUploadPresentationToGCS).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith('Error uploading task presentation to GCS:', uploadError);
      expect(mockConversationService.updatePresentationMetadata).not.toHaveBeenCalled(); // Should not be called if upload fails
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Task status retrieved successfully',
        data: { ...mockTaskResult, publicUrl: null, uploadResult: undefined }, // publicUrl is null, uploadResult is undefined
      });
    });

    it('should not update conversation metadata if conversationId is not provided', async () => {
      req.params = { taskId: 'task123' };
      const mockTaskResult = { status: 'completed', data: { path: 'http://api.com/pres.pptx', presentation_id: 'pres789' } };
      const mockUploadResult = { publicUrl: 'http://gcs.com/pres.pptx' };
      mockPresentonAPIClient.checkTaskStatus.mockResolvedValue(mockTaskResult);
      mockUploadPresentationToGCS.mockResolvedValue(mockUploadResult);
      mockPath.default.basename.mockReturnValue('pres.pptx');

      await checkTaskStatus(req, res);

      expect(mockUploadPresentationToGCS).toHaveBeenCalled();
      expect(mockConversationService.updatePresentationMetadata).not.toHaveBeenCalled(); // Not called without conversationId
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Task status retrieved successfully',
        data: { ...mockTaskResult, publicUrl: mockUploadResult.publicUrl, uploadResult: mockUploadResult },
      });
    });
  });

  // --- editPresentation tests ---
  describe('editPresentation', () => {
    it('should call editPresentation service and send success response', async () => {
      req.body = {
        presentationId: 'pres123',
        slides: [{ id: 's1', content: 'new content' }],
        export_as: 'pptx',
      };
      const mockResult = {
        presentation_id: 'pres123',
        downloadUrl: 'http://example.com/edited.pptx',
      };
      mockPresentonAPIClient.editPresentation.mockResolvedValue(mockResult);

      await editPresentation(req, res);

      expect(mockPresentonAPIClient.editPresentation).toHaveBeenCalledWith(req.body);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Presentation edited successfully',
        data: mockResult,
      });
      expect(logger.info).toHaveBeenCalledWith('Editing presentation pres123');
    });

    it('should handle errors during presentation editing', async () => {
      req.body = { presentationId: 'pres123', slides: [] };
      const errorMessage = 'Edit API failed';
      const error = new Error(errorMessage);
      error.status = 400;
      mockPresentonAPIClient.editPresentation.mockRejectedValue(error);

      await editPresentation(req, res);

      expect(mockPresentonAPIClient.editPresentation).toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: 400,
        success: false,
        message: errorMessage,
      });
      expect(logger.error).toHaveBeenCalledWith('Error editing presentation:', error);
    });

    it('should handle generic errors during presentation editing', async () => {
      req.body = { presentationId: 'pres123', slides: [] };
      const errorMessage = 'Unknown error';
      mockPresentonAPIClient.editPresentation.mockRejectedValue(new Error(errorMessage));

      await editPresentation(req, res);

      expect(mockPresentonAPIClient.editPresentation).toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to edit presentation',
      });
      expect(logger.error).toHaveBeenCalledWith('Error editing presentation:', expect.any(Error));
    });
  });

  // --- derivePresentation tests ---
  describe('derivePresentation', () => {
    it('should call derivePresentation service and send success response', async () => {
      req.body = {
        presentationId: 'sourcePres123',
        slides: [{ content: 'new slide' }],
        export_as: 'pdf',
      };
      const mockResult = {
        presentation_id: 'derivedPres456',
        downloadUrl: 'http://example.com/derived.pdf',
      };
      mockPresentonAPIClient.derivePresentation.mockResolvedValue(mockResult);

      await derivePresentation(req, res);

      expect(mockPresentonAPIClient.derivePresentation).toHaveBeenCalledWith(req.body);
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'New presentation created successfully',
        data: mockResult,
      });
      expect(logger.info).toHaveBeenCalledWith('Deriving presentation from sourcePres123');
    });

    it('should handle errors during presentation derivation', async () => {
      req.body = { presentationId: 'sourcePres123', slides: [] };
      const errorMessage = 'Derive API failed';
      const error = new Error(errorMessage);
      error.status = 400;
      mockPresentonAPIClient.derivePresentation.mockRejectedValue(error);

      await derivePresentation(req, res);

      expect(mockPresentonAPIClient.derivePresentation).toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: 400,
        success: false,
        message: errorMessage,
      });
      expect(logger.error).toHaveBeenCalledWith('Error deriving presentation:', error);
    });

    it('should handle generic errors during presentation derivation', async () => {
      req.body = { presentationId: 'sourcePres123', slides: [] };
      const errorMessage = 'Unknown error';
      mockPresentonAPIClient.derivePresentation.mockRejectedValue(new Error(errorMessage));

      await derivePresentation(req, res);

      expect(mockPresentonAPIClient.derivePresentation).toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to create new presentation',
      });
      expect(logger.error).toHaveBeenCalledWith('Error deriving presentation:', expect.any(Error));
    });
  });

  // --- getPresentation tests ---
  describe('getPresentation', () => {
    it('should call getPresentation service and send success response', async () => {
      req.params = { presentationId: 'pres123' };
      const mockResult = {
        presentation_id: 'pres123',
        downloadUrl: 'http://example.com/pres.pptx',
        slides: [{ title: 'Intro' }],
      };
      mockPresentonAPIClient.getPresentation.mockResolvedValue(mockResult);

      await getPresentation(req, res);

      expect(mockPresentonAPIClient.getPresentation).toHaveBeenCalledWith('pres123');
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Presentation retrieved successfully',
        data: mockResult,
      });
      expect(logger.info).toHaveBeenCalledWith('Getting presentation pres123');
    });

    it('should handle errors during presentation retrieval', async () => {
      req.params = { presentationId: 'nonExistentPres' };
      const errorMessage = 'Presentation not found';
      const error = new Error(errorMessage);
      error.status = 404;
      mockPresentonAPIClient.getPresentation.mockRejectedValue(error);

      await getPresentation(req, res);

      expect(mockPresentonAPIClient.getPresentation).toHaveBeenCalledWith('nonExistentPres');
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: 404,
        success: false,
        message: errorMessage,
      });
      expect(logger.error).toHaveBeenCalledWith('Error getting presentation:', error);
    });

    it('should handle generic errors during presentation retrieval', async () => {
      req.params = { presentationId: 'pres123' };
      const errorMessage = 'Unknown error';
      mockPresentonAPIClient.getPresentation.mockRejectedValue(new Error(errorMessage));

      await getPresentation(req, res);

      expect(mockPresentonAPIClient.getPresentation).toHaveBeenCalled();
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to retrieve presentation',
      });
      expect(logger.error).toHaveBeenCalledWith('Error getting presentation:', expect.any(Error));
    });
  });
});