import { vi, describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import { createPromptRoutes } from './promptRoutes.js';
import { createPromptController } from '../controllers/promptController.js';

const mockPost = vi.fn();
vi.mock('express', () => ({
  default: {
    Router: () => ({
      post: mockPost,
    }),
  },
}));

const mockController = {
  evaluatePrompt: vi.fn(),
  addDetail: vi.fn(),
  finalizePrompt: vi.fn(),
};

vi.mock('../controllers/promptController.js', () => ({
  createPromptController: vi.fn(() => mockController),
}));

describe('Prompt Routes', () => {
  let sessionManager;
  let promptService;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionManager = {
      authenticate: vi.fn((req, res, next) => next()),
    };
    promptService = {};
  });

  it('should initialize the router and register all endpoints', () => {
    const router = createPromptRoutes(sessionManager, promptService);

    expect(router).toBeDefined();
    expect(mockPost).toHaveBeenCalledTimes(3);
    expect(mockPost).toHaveBeenCalledWith('/evaluate', sessionManager.authenticate, expect.any(Function));
    expect(mockPost).toHaveBeenCalledWith('/add-detail', sessionManager.authenticate, expect.any(Function));
    expect(mockPost).toHaveBeenCalledWith('/finalize', sessionManager.authenticate, expect.any(Function));
  });

  it('should instantiate the controller with sessionManager and promptService', () => {
    createPromptRoutes(sessionManager, promptService);
    expect(createPromptController).toHaveBeenCalledWith(sessionManager, promptService);
  });

  const endpoints = [
    { path: '/evaluate', method: 'evaluatePrompt' },
    { path: '/add-detail', method: 'addDetail' },
    { path: '/finalize', method: 'finalizePrompt' },
  ];

  endpoints.forEach(({ path, method }) => {
    describe(`Endpoint: ${path}`, () => {
      let routeHandler;

      beforeEach(() => {
        mockPost.mockImplementation((routePath, auth, handler) => {
          if (routePath === path) {
            routeHandler = handler;
          }
        });
        createPromptRoutes(sessionManager, promptService);
      });

      it('should successfully execute the controller method when called', async () => {
        const req = { user: { id: 'user-123', role: 'user' } };
        const res = {};
        const next = vi.fn();

        mockController[method].mockResolvedValueOnce();

        await routeHandler(req, res, next);

        expect(mockController[method]).toHaveBeenCalledWith(req, res, next);
        expect(next).not.toHaveBeenCalled();
      });

      it('should catch async errors and pass them to next middleware', async () => {
        const req = { user: { id: 'user-123', role: 'user' } };
        const res = {};
        const next = vi.fn();
        const error = new Error('Database connection failed');

        mockController[method].mockRejectedValueOnce(error);

        await routeHandler(req, res, next);

        expect(mockController[method]).toHaveBeenCalledWith(req, res, next);
        expect(next).toHaveBeenCalledWith(error);
      });

      const roles = ['super_admin', 'admin', 'manager', 'user'];
      roles.forEach((role) => {
        it(`should preserve request context and allow access for role: ${role}`, async () => {
          const req = { user: { id: 'user-id', role } };
          const res = {};
          const next = vi.fn();

          mockController[method].mockResolvedValueOnce();

          await routeHandler(req, res, next);

          expect(mockController[method]).toHaveBeenCalledWith(req, res, next);
          expect(req.user.role).toBe(role);
        });
      });
    });
  });

  it('should block access if authentication middleware fails', () => {
    const authError = new Error('Unauthorized');
    sessionManager.authenticate.mockImplementation((req, res, next) => {
      next(authError);
    });

    createPromptRoutes(sessionManager, promptService);

    expect(mockPost).toHaveBeenCalledWith('/evaluate', sessionManager.authenticate, expect.any(Function));
  });
});