import { vi, expect, describe, it, beforeEach } from 'vitest';
import express from 'express';
import { createImageRoutes } from '../routes/imageRoutes.js';
import { createImageController } from '../controllers/imageController.js';

const {
  mockRouter,
  mockController
} = vi.hoisted(() => {
  // Mock express.Router to capture registered routes and handlers
  const mockRouter = {
    post: vi.fn(),
    // Add other HTTP methods if they were used, e.g., get, put, delete
  };

  // Mock createImageController to control its return value and spy on its methods
  const mockController = {
    editImage: vi.fn(),
    generateImage: vi.fn(),
    generateImageDirect: vi.fn(),
  };

  return {
    mockRouter,
    mockController
  };
});

vi.mock('express', () => ({
  default: {
    Router: vi.fn().mockImplementation(() => mockRouter),
  },
}));

vi.mock('../controllers/imageController.js', () => ({
  createImageController: vi.fn().mockImplementation(() => mockController),
}));

describe('imageRoutes', () => {
  let sessionManager;
  let imageService;
  let promptService;
  let router;

  beforeEach(() => {
    // Clear all mocks before each test to ensure isolation
    vi.clearAllMocks();

    // Initialize mock service dependencies
    sessionManager = {
      getSession: vi.fn(),
      setSession: vi.fn(),
    };
    imageService = {
      edit: vi.fn(),
      generate: vi.fn(),
      generateDirect: vi.fn(),
    };
    promptService = {
      processPrompt: vi.fn(),
    };

    // Call the function under test to create the router
    router = createImageRoutes(sessionManager, imageService, promptService);
  });

  it('should create an Express router instance', () => {
    expect(express.Router).toHaveBeenCalledTimes(1);
    expect(router).toBe(mockRouter); // Ensure our mock router is returned
  });

  it('should call createImageController with the provided dependencies', () => {
    expect(createImageController).toHaveBeenCalledTimes(1);
    expect(createImageController).toHaveBeenCalledWith(
      sessionManager,
      imageService,
      promptService
    );
  });

  it('should register the POST /edit route', () => {
    expect(mockRouter.post).toHaveBeenCalledWith('/edit', expect.any(Function));
  });

  it('should register the POST /generate route', () => {
    expect(mockRouter.post).toHaveBeenCalledWith('/generate', expect.any(Function));
  });

  it('should register the POST /generate-direct route', () => {
    expect(mockRouter.post).toHaveBeenCalledWith('/generate-direct', expect.any(Function));
  });

  describe('route handlers and asyncHandler behavior', () => {
    let req;
    let res;
    let next;

    // Helper function to get the handler for a specific route path
    const getRouteHandler = (path) => {
      const call = mockRouter.post.mock.calls.find(c => c[0] === path);
      return call ? call[1] : undefined; // The handler is the second argument
    };

    beforeEach(() => {
      // Mock Express request, response, and next objects
      req = { body: {}, params: {}, query: {} };
      res = {
        status: vi.fn().mockImplementation(() => res), // Chainable status method
        json: vi.fn().mockImplementation(() => res),   // Chainable json method
        send: vi.fn().mockImplementation(() => res),   // Chainable send method
      };
      next = vi.fn(); // Mock the next middleware function
    });

    describe('POST /edit handler', () => {
      it('should call controller.editImage and not call next on successful execution', async () => {
        const handler = getRouteHandler('/edit');
        mockController.editImage.mockResolvedValueOnce({ success: true, data: { jobId: '123' } });

        await handler(req, res, next);

        expect(mockController.editImage).toHaveBeenCalledWith(req, res, next);
        expect(next).not.toHaveBeenCalled(); // asyncHandler should not call next on success
      });

      it('should call next with the error if controller.editImage throws an error', async () => {
        const handler = getRouteHandler('/edit');
        const error = new Error('Failed to edit image');
        mockController.editImage.mockRejectedValueOnce(error);

        await handler(req, res, next);

        expect(mockController.editImage).toHaveBeenCalledWith(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(error); // asyncHandler should catch and pass error to next
      });
    });

    describe('POST /generate handler', () => {
      it('should call controller.generateImage and not call next on successful execution', async () => {
        const handler = getRouteHandler('/generate');
        mockController.generateImage.mockResolvedValueOnce({ success: true, data: { imageUrls: ['url1'] } });

        await handler(req, res, next);

        expect(mockController.generateImage).toHaveBeenCalledWith(req, res, next);
        expect(next).not.toHaveBeenCalled();
      });

      it('should call next with the error if controller.generateImage throws an error', async () => {
        const handler = getRouteHandler('/generate');
        const error = new Error('Failed to generate image');
        mockController.generateImage.mockRejectedValueOnce(error);

        await handler(req, res, next);

        expect(mockController.generateImage).toHaveBeenCalledWith(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(error);
      });
    });

    describe('POST /generate-direct handler', () => {
      it('should call controller.generateImageDirect and not call next on successful execution', async () => {
        const handler = getRouteHandler('/generate-direct');
        mockController.generateImageDirect.mockResolvedValueOnce({ success: true, data: { imageUrl: 'url2' } });

        await handler(req, res, next);

        expect(mockController.generateImageDirect).toHaveBeenCalledWith(req, res, next);
        expect(next).not.toHaveBeenCalled();
      });

      it('should call next with the error if controller.generateImageDirect throws an error', async () => {
        const handler = getRouteHandler('/generate-direct');
        const error = new Error('Failed to directly generate image');
        mockController.generateImageDirect.mockRejectedValueOnce(error);

        await handler(req, res, next);

        expect(mockController.generateImageDirect).toHaveBeenCalledWith(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(error);
      });
    });
  });
});