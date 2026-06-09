import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock express to control router behavior
const mockRouter = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  route: vi.fn(() => mockRouter), // Allow chaining .route().get().post() etc.
};

vi.mock('express', () => ({
  Router: vi.fn(() => mockRouter),
}));

// Mock the controller functions
const mockTaskController = {
  getAllTask: vi.fn(),
  bulkDeleteTask: vi.fn(),
  getTaskById: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  addTask: vi.fn(),
};
vi.mock('./notes.controller', () => mockTaskController);

// Mock the validateRequest middleware factory
// It takes a schema and returns a middleware function
const mockValidateRequest = vi.fn((schema) => vi.fn((req, res, next) => next()));
vi.mock('../../middlewares/validateRequest/validateRequest', () => ({
  validateRequest: mockValidateRequest,
}));

// Mock the validation schema (it's passed to validateRequest, so we just need a placeholder)
const mockTaskValidationSchema = {
  body: {
    type: 'object',
    properties: {
      title: { type: 'string' },
    },
  },
};
vi.mock('./notes.validation', () => mockTaskValidationSchema);

// Import the router file AFTER mocks are set up
// This will execute the router definitions and call the mocked methods
import router from './notes.route';

describe('Notes Router', () => {
  beforeEach(() => {
    // Clear all mocks before each test to ensure isolation
    vi.clearAllMocks();
    // Re-mock route chaining for each test, as clearAllMocks might reset mockImplementation
    mockRouter.route.mockImplementation(() => mockRouter);
  });

  it('should define the /all-note/:userId GET route', () => {
    expect(mockRouter.route).toHaveBeenCalledWith('/all-note/:userId');
    expect(mockRouter.get).toHaveBeenCalledWith(mockTaskController.getAllTask);
  });

  it('should define the /bulk-delete DELETE route', () => {
    expect(mockRouter.route).toHaveBeenCalledWith('/bulk-delete');
    expect(mockRouter.delete).toHaveBeenCalledWith(mockTaskController.bulkDeleteTask);
  });

  it('should define the /:id GET, PATCH, DELETE routes', () => {
    expect(mockRouter.route).toHaveBeenCalledWith('/:id');
    expect(mockRouter.get).toHaveBeenCalledWith(mockTaskController.getTaskById);
    expect(mockRouter.patch).toHaveBeenCalledWith(mockTaskController.updateTask);
    expect(mockRouter.delete).toHaveBeenCalledWith(mockTaskController.deleteTask);
  });

  it('should define the / POST route with validation middleware', () => {
    expect(mockRouter.route).toHaveBeenCalledWith('/');

    // Ensure validateRequest was called with the correct schema
    expect(mockValidateRequest).toHaveBeenCalledWith(mockTaskValidationSchema);

    // Ensure the post method was called with the middleware function returned by validateRequest
    // and the controller function.
    // We expect the first argument to be a function (the middleware) and the second to be the controller.
    expect(mockRouter.post).toHaveBeenCalledWith(expect.any(Function), mockTaskController.addTask);

    // To be more specific, we can find the call to `post` that corresponds to the '/' route
    // and check its arguments. Since the module is loaded once, the calls are made in order.
    // The last call to `post` should be for the '/' route.
    const postCalls = mockRouter.post.mock.calls;
    const lastPostCall = postCalls[postCalls.length - 1];

    expect(lastPostCall[0]).toBeInstanceOf(Function); // The middleware
    expect(lastPostCall[1]).toBe(mockTaskController.addTask); // The controller
  });

  it('should export the router instance', () => {
    expect(router).toBe(mockRouter);
  });
});