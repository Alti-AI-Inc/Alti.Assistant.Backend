import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';

const {
  mockSendResponse,
  mockLogger
} = vi.hoisted(() => {
  // Mock dependencies BEFORE importing the controller
  const mockSendResponse = vi.fn();

  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
  };

  return {
    mockSendResponse,
    mockLogger
  };
});

vi.mock('../../../shared/sendResponse', () => ({
  sendResponse: mockSendResponse,
}));

vi.mock('../../../../config', () => ({
  livekit_api_key: 'test_api_key',
  livekit_secret_key: 'test_secret_key',
}));

vi.mock('../../../shared/logger', () => ({
  logger: mockLogger,
}));

// Mock the livekit-server-sdk, which is dynamically imported
const mockAddGrant = vi.fn();
const mockToJwt = vi.fn();
const MockAccessToken = vi.fn().mockImplementation(() => ({
  addGrant: mockAddGrant,
  toJwt: mockToJwt,
}));

vi.mock('livekit-server-sdk', () => ({
  AccessToken: MockAccessToken,
}));

// Mock the catchAsync wrapper to return the raw function for easier testing
vi.mock('../../../shared/catchAsync', () => ({
  catchAsync: vi.fn().mockImplementation(fn => fn),
}));

// Dynamically import the controller after all mocks are set up
const { authStreamingController } = await import(
  './streaming.controller.js'
);

describe('Streaming Controller', () => {
  beforeEach(() => {
    // Reset mocks before each test to ensure test isolation
    vi.clearAllMocks();
  });

  describe('authStreamingController', () => {
    it('should generate a LiveKit token and send a 201 CREATED response on success', async () => {
      // Arrange
      const req = {}; // Request object is not used in the controller
      const res = {}; // Response object is a placeholder for sendResponse
      const mockToken = 'mocked-jwt-token-string';
      mockToJwt.mockResolvedValue(mockToken);

      // Act
      await authStreamingController(req, res);

      // Assert
      // 1. Verify AccessToken was instantiated with correct config and a random identity
      expect(MockAccessToken).toHaveBeenCalledOnce();
      expect(MockAccessToken).toHaveBeenCalledWith(
        'test_api_key',
        'test_secret_key',
        {
          identity: expect.any(String),
          ttl: '60m',
        }
      );

      // 2. Verify the generated identity is an 8-character uppercase string
      const capturedIdentity = MockAccessToken.mock.calls[0][2].identity;
      expect(capturedIdentity).toHaveLength(8);
      expect(capturedIdentity).toMatch(/^[A-Z]{8}$/);

      // 3. Verify room grant was added correctly
      expect(mockAddGrant).toHaveBeenCalledOnce();
      expect(mockAddGrant).toHaveBeenCalledWith({
        roomJoin: true,
        room: 'alti-ai-room',
      });

      // 4. Verify the token was generated
      expect(mockToJwt).toHaveBeenCalledOnce();

      // 5. Verify logging calls
      expect(mockLogger.info).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith(capturedIdentity, 'participantName participantName');
      expect(mockLogger.info).toHaveBeenCalledWith(mockToken, 'resulttttttttt');

      // 6. Verify the success response was sent with the token
      expect(mockSendResponse).toHaveBeenCalledOnce();
      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: 'Generate auth token for streaming',
        data: mockToken,
      });
    });

    it('should throw an error if token generation fails', async () => {
      // Arrange
      const req = {};
      const res = {};
      const sdkError = new Error('LiveKit SDK failed');
      mockToJwt.mockRejectedValue(sdkError);

      // Act & Assert
      // The controller is wrapped in catchAsync, which would normally handle the error.
      // Since we've mocked catchAsync to be an identity function, the raw controller will throw.
      // This test confirms the controller propagates errors from its dependencies.
      await expect(authStreamingController(req, res)).rejects.toThrow(sdkError);

      // Verify that a response was not sent in case of an error
      expect(mockSendResponse).not.toHaveBeenCalled();
    });

    // Note: Role-based access checks and context boundaries are not implemented
    // in the provided controller. Therefore, there are no tests for these aspects.
    // The controller is publicly accessible as written.
  });
});