import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { createSessionController } from '../controllers/sessionController.js';
import { createSessionRoutes } from '../routes/sessionRoutes.js';

// Mock express and its Router method
vi.mock('express', () => {
  const mockRouter = {
    post: vi.fn(),
    delete: vi.fn(),
    use: vi.fn(), // Add use if needed, though not directly used in this file
  };
  return {
    default: {
      Router: vi.fn(() => mockRouter),
    },
  };
});

// Mock the sessionController module
const mockStartSession = vi.fn();
const mockDeleteSession = vi.fn();
const mockController = {
  startSession: mockStartSession,
  deleteSession: mockDeleteSession,
};
vi.mock('../controllers/sessionController.js', () => ({
  createSessionController: vi.fn(() => mockController),
}));

describe('sessionRoutes', () => {
  let mockSessionManager;
  let routerInstance;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    mockSessionManager = {
      // Mock any methods or properties sessionManager might have if needed by createSessionController
      someMethod: vi.fn(),
    };
    // Call the function to create the router and capture the instance
    routerInstance = createSessionRoutes(mockSessionManager);
  });

  it('should create an express router', () => {
    expect(express.Router).toHaveBeenCalledTimes(1);
    expect(routerInstance).toBeDefined();
  });

  it('should create a session controller with the provided session manager', () => {
    expect(createSessionController).toHaveBeenCalledTimes(1);
    expect(createSessionController).toHaveBeenCalledWith(mockSessionManager);
  });

  it('should register the POST /start route with controller.startSession', () => {
    const router = express.Router(); // Get the mock router instance
    expect(router.post).toHaveBeenCalledTimes(1);
    expect(router.post).toHaveBeenCalledWith('/start', mockStartSession);
  });

  it('should register the DELETE /:sessionId route with controller.deleteSession', () => {
    const router = express.Router(); // Get the mock router instance
    expect(router.delete).toHaveBeenCalledTimes(1);
    expect(router.delete).toHaveBeenCalledWith('/:sessionId', mockDeleteSession);
  });

  it('should return the configured router instance', () => {
    const expectedRouter = express.Router();
    expect(routerInstance).toBe(expectedRouter);
  });
});