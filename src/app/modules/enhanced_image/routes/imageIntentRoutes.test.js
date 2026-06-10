import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { createImageIntentRoutes } from './imageIntentRoutes.js';
import { createImageIntentController } from '../controllers/imageIntentController.js';

vi.mock('../controllers/imageIntentController.js', () => ({
  createImageIntentController: vi.fn()
}));

describe('imageIntentRoutes', () => {
  let mockSessionManager;
  let mockController;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionManager = { id: 'mock-session-manager' };
    mockController = {
      analyzeIntent: vi.fn()
    };
    createImageIntentController.mockReturnValue(mockController);
  });

  it('should register the POST /analyze-intent route with correct middlewares', () => {
    const router = createImageIntentRoutes(mockSessionManager);

    expect(createImageIntentController).toHaveBeenCalledWith(mockSessionManager);

    const routeLayer = router.stack.find(
      (layer) => layer.route && layer.route.path === '/analyze-intent'
    );

    expect(routeLayer).toBeDefined();
    expect(routeLayer.route.methods.post).toBe(true);
    expect(routeLayer.route.stack.length).toBe(2);
  });

  describe('validateAnalyzeIntentBody middleware', () => {
    let validateMiddleware;

    beforeEach(() => {
      const router = createImageIntentRoutes(mockSessionManager);
      const routeLayer = router.stack.find(
        (layer) => layer.route && layer.route.path === '/analyze-intent'
      );
      validateMiddleware = routeLayer.route.stack[0].handle;
    });

    it('should return 400 if req.body is missing', () => {
      const req = {};
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      validateMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Prompt is required and must be a non-empty string.'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 400 if prompt is missing in req.body', () => {
      const req = { body: {} };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      validateMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 400 if prompt is not a string', () => {
      const req = { body: { prompt: 123 } };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      validateMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 400 if prompt is an empty string', () => {
      const req = { body: { prompt: '' } };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      validateMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 400 if prompt is only whitespace', () => {
      const req = { body: { prompt: '   ' } };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      validateMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next() if prompt is a valid non-empty string', () => {
      const req = { body: { prompt: 'Generate a cat' } };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      const next = vi.fn();

      validateMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('catchAsync middleware wrapper', () => {
    let catchAsyncMiddleware;

    beforeEach(() => {
      const router = createImageIntentRoutes(mockSessionManager);
      const routeLayer = router.stack.find(
        (layer) => layer.route && layer.route.path === '/analyze-intent'
      );
      catchAsyncMiddleware = routeLayer.route.stack[1].handle;
    });

    it('should successfully execute the controller logic', async () => {
      const req = { body: { prompt: 'test' } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      mockController.analyzeIntent.mockResolvedValueOnce();

      catchAsyncMiddleware(req, res, next);

      await new Promise((resolve) => process.nextTick(resolve));

      expect(mockController.analyzeIntent).toHaveBeenCalledWith(req, res, next);
      expect(next).not.toHaveBeenCalled();
    });

    it('should catch async errors and pass them to next()', async () => {
      const req = { body: { prompt: 'test' } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();
      const error = new Error('Async error');

      mockController.analyzeIntent.mockRejectedValueOnce(error);

      catchAsyncMiddleware(req, res, next);

      await new Promise((resolve) => process.nextTick(resolve));

      expect(mockController.analyzeIntent).toHaveBeenCalledWith(req, res, next);
      expect(next).toHaveBeenCalledWith(error);
    });
  });
});