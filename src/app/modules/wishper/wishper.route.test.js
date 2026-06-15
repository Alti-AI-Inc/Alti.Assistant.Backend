import { describe, it, expect, vi } from 'vitest';
import express from 'express';

// Mock express to capture router creation and method calls
const mockPost = vi.fn();

const {
  mockRouter,
  mockAudioUploader,
  mockWishperAiController,
  mockExtractTenantContext
} = vi.hoisted(() => {
  const mockRouter = {
    post: mockPost,
  };
  const mockAudioUploader = {
    single: mockAudioUploaderSingle,
  };
  const mockWishperAiController = {
    transcribeAudioToTextController: mockTranscribeAudioToTextController,
  };

  // Mock extractTenantContext, though it's not used in the active route, it's imported.
  const mockExtractTenantContext = vi.fn().mockImplementation((req, res, next) => next());

  return {
    mockRouter,
    mockAudioUploader,
    mockWishperAiController,
    mockExtractTenantContext
  };
});

vi.mock('express', () => ({
  default: {
    Router: vi.fn().mockImplementation(() => mockRouter),
  },
}));

// Mock audioUploader middleware
const mockAudioUploaderMiddleware = vi.fn().mockImplementation((req, res, next) => next());
const mockAudioUploaderSingle = vi.fn().mockImplementation(() => mockAudioUploaderMiddleware);
vi.mock('../../middlewares/uploder/uploadAudio.js', () => ({
  default: mockAudioUploader,
}));

// Mock WishperAiController
const mockTranscribeAudioToTextController = vi.fn();
vi.mock('./wishper.controller.js', () => ({
  WishperAiController: mockWishperAiController,
}));

vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext: mockExtractTenantContext,
}));

// Import the module under test AFTER mocks are set up
import { wishperAiRoutes } from './wishper.route.js';

describe('wishper.route', () => {
  it('should define the /whisper-transcribe POST route with audioUploader middleware and controller', () => {
    // Ensure express.Router was called to create the router
    expect(express.Router).toHaveBeenCalledTimes(1);

    // Ensure the post method was called on the router
    expect(mockPost).toHaveBeenCalledTimes(1);

    // Verify the arguments passed to router.post
    expect(mockPost).toHaveBeenCalledWith(
      '/whisper-transcribe',
      mockAudioUploaderMiddleware, // The middleware returned by audioUploader.single
      mockTranscribeAudioToTextController
    );

    // Verify that audioUploader.single was called with the correct field name
    expect(mockAudioUploader.single).toHaveBeenCalledTimes(1);
    expect(mockAudioUploader.single).toHaveBeenCalledWith('file');

    // Verify that the exported router is the mocked router instance
    expect(wishperAiRoutes).toBe(mockRouter);
  });
});