import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { composioController } from './composio.controller.js';

const {
  mockRouter,
  mockComposioController
} = vi.hoisted(() => {
  // Mock express and its Router
  const mockRouter = {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  };

  // Mock composioController methods
  const mockComposioController = {
    getAllIntegrations: vi.fn(),
    getAllConnectedAccountsService: vi.fn(),
    getGmailIntegration: vi.fn(),
    authorizeGmailIntegration: vi.fn(),
    initiateGmailConnection: vi.fn(),
    sendEmailWithComposio: vi.fn(),
    getYouTubeIntegration: vi.fn(),
    initiateYouTubeConnection: vi.fn(),
    searchYouTube: vi.fn(),
    disconnectYouTubeAccount: vi.fn(),
    startLinkedInOAuth: vi.fn(),
    handleLinkedInCallback: vi.fn(),
    postToLinkedIn: vi.fn(),
    initiateGoogleCalendarConnection: vi.fn(),
    createCalendarEvent: vi.fn(),
    getCalendarEvents: vi.fn(),
    deleteCalendarEvent: vi.fn(),
    updateCalendarEvent: vi.fn(),
    getGithubIntegration: vi.fn(),
    initiateGithubConnection: vi.fn(),
    createGithubIssue: vi.fn(),
    initiateAmazonConnection: vi.fn(),
    searchAmazonProduct: vi.fn(),
    initiateTwitterConnection: vi.fn(),
    postTweet: vi.fn(),
    followTwitterUser: vi.fn(),
    deleteTweet: vi.fn(),
    getTwitterUserByUsername: vi.fn(),
    sendDMByUsername: vi.fn(),
  };

  return {
    mockRouter,
    mockComposioController
  };
});

vi.mock('express', () => ({
  default: {
    Router: vi.fn().mockImplementation(() => mockRouter),
  },
}));

vi.mock('./composio.controller.js', () => ({
  composioController: mockComposioController,
}));

// Import the routes file AFTER mocks are set up.
// This will execute the route definitions and call the mocked router methods.
import { composioRoutes } from './composio.route.js';

describe('composio.route.js', () => {
  const mockReq = {};
  const mockRes = {};
  const mockNext = vi.fn();

  beforeEach(() => {
    // Clear all mocks before each test to ensure isolation
    vi.clearAllMocks();
  });

  it('should export the router instance', () => {
    expect(composioRoutes).toBe(mockRouter);
    expect(express.Router).toHaveBeenCalledTimes(1);
  });

  // Helper function to test a single route definition and its asyncHandler behavior
  const testRoute = (method, path, controllerMockFn) => {
    it(`should define a ${method.toUpperCase()} route for ${path} and correctly call ${controllerMockFn.name}`, async () => {
      // Find the specific call to the mock router method for this path
      const routeCall = mockRouter[method].mock.calls.find(call => call[0] === path);
      expect(routeCall).toBeDefined();
      expect(routeCall[0]).toBe(path);

      const handler = routeCall[1]; // This is the asyncHandler wrapper function
      expect(typeof handler).toBe('function');

      // --- Test successful execution ---
      mockNext.mockClear(); // Clear next mock for this sub-test
      controllerMockFn.mockClear(); // Clear controller mock for this sub-test

      controllerMockFn.mockResolvedValueOnce('success'); // Mock successful controller execution
      await handler(mockReq, mockRes, mockNext);

      expect(controllerMockFn).toHaveBeenCalledTimes(1);
      expect(controllerMockFn).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
      expect(mockNext).not.toHaveBeenCalled(); // next should not be called on success

      // --- Test error handling ---
      mockNext.mockClear(); // Clear next mock for this sub-test
      controllerMockFn.mockClear(); // Clear controller mock for this sub-test

      const error = new Error('Test error');
      controllerMockFn.mockRejectedValueOnce(error); // Mock controller throwing an error
      await handler(mockReq, mockRes, mockNext);

      expect(controllerMockFn).toHaveBeenCalledTimes(1);
      expect(controllerMockFn).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalledWith(error); // next should be called with the error
    });
  };

  // --- General routes ---
  testRoute('get', '/all/integrations', mockComposioController.getAllIntegrations);
  testRoute('get', '/connected-accounts', mockComposioController.getAllConnectedAccountsService);

  // --- Gmail routes ---
  testRoute('get', '/gmail/integration', mockComposioController.getGmailIntegration);
  testRoute('post', '/gmail/authorize', mockComposioController.authorizeGmailIntegration);
  testRoute('post', '/gmail/connect', mockComposioController.initiateGmailConnection);
  testRoute('post', '/gmail/send-email', mockComposioController.sendEmailWithComposio);

  // --- YouTube routes ---
  testRoute('get', '/youtube/integration', mockComposioController.getYouTubeIntegration);
  testRoute('post', '/youtube/connect', mockComposioController.initiateYouTubeConnection);
  testRoute('post', '/youtube/search', mockComposioController.searchYouTube);
  testRoute('delete', '/youtube/disconnect/:id', mockComposioController.disconnectYouTubeAccount);

  // --- LinkedIn routes ---
  testRoute('get', '/linkedin/auth/start', mockComposioController.startLinkedInOAuth);
  testRoute('get', '/linkedin/auth/callback', mockComposioController.handleLinkedInCallback);
  testRoute('post', '/linkedin/post', mockComposioController.postToLinkedIn);

  // --- Google Calendar routes ---
  testRoute('post', '/calendar/connect', mockComposioController.initiateGoogleCalendarConnection);
  testRoute('post', '/calendar/create-event', mockComposioController.createCalendarEvent);
  testRoute('post', '/calendar/events', mockComposioController.getCalendarEvents);
  testRoute('delete', '/calendar/delete-event', mockComposioController.deleteCalendarEvent);
  testRoute('patch', '/calendar/update-event', mockComposioController.updateCalendarEvent);

  // --- GitHub routes ---
  testRoute('get', '/github/integration', mockComposioController.getGithubIntegration);
  testRoute('post', '/github/connect', mockComposioController.initiateGithubConnection);
  testRoute('post', '/github/create-issue', mockComposioController.createGithubIssue);

  // --- Amazon Routes ---
  testRoute('post', '/amazon/connect', mockComposioController.initiateAmazonConnection);
  testRoute('post', '/amazon/search', mockComposioController.searchAmazonProduct);

  // --- Twitter Routes ---
  testRoute('post', '/twitter/connect', mockComposioController.initiateTwitterConnection);
  testRoute('post', '/twitter/post', mockComposioController.postTweet);
  testRoute('post', '/twitter/follow-user', mockComposioController.followTwitterUser);
  testRoute('post', '/twitter/delete-tweet', mockComposioController.deleteTweet);
  testRoute('post', '/twitter/user-lookup', mockComposioController.getTwitterUserByUsername);
  testRoute('post', '/twitter/send-message', mockComposioController.sendDMByUsername);
});