import { describe, it, expect, vi } from 'vitest';

// Mock the express router
const mockRouteMethods = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

const {
  mockRouter,
  mockController,
  mockValidateRequest,
  mockTenantContext
} = vi.hoisted(() => {
  const mockRouter = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    route: vi.fn().mockImplementation(() => mockRouteMethods), // route() returns an object with http methods
  };

  // Mock the controller (forumController and commentController both point to this)
  const mockController = {
    getForumById: vi.fn(),
    updateForum: vi.fn(),
    deleteForum: vi.fn(),
    getComment: vi.fn(),
    deleteComment: vi.fn(),
    getForumByEmail: vi.fn(),
    getForum: vi.fn(),
    getForumSuggestion: vi.fn(),
    addForum: vi.fn(),
    addUserForumActivity: vi.fn(),
  };

  // Mock middlewares
  const mockValidateRequest = {
    validateRequest: vi.fn().mockImplementation(() => (req, res, next) => next()), // Mock as a factory function
  };

  const mockTenantContext = {
    extractTenantContext: vi.fn().mockImplementation((req, res, next) => next()),
  };

  return {
    mockRouter,
    mockController,
    mockValidateRequest,
    mockTenantContext
  };
});

vi.mock('express', () => ({
  Router: vi.fn().mockImplementation(() => mockRouter),
}));

vi.mock('./forum.controller', () => mockController);

vi.mock('../../middlewares/validateRequest/validateRequest', () => mockValidateRequest);

vi.mock('../../middlewares/tenant/tenantContext', () => mockTenantContext);

// Mock validation schema (not directly used as a function, but imported)
vi.mock('./forum.validation', () => ({
  forumUserActivitiesValidationSchema: {},
}));

// Import the router file after all mocks are set up.
// This will execute the router definitions once, populating the mockRouter.
const forumRouter = require('./forum.route');

describe('Forum Routes', () => {
  // All assertions check the state of the mocks after the initial require() call.
  // No beforeEach cleanup is needed as the router setup happens only once.

  it('should define the /:id route with GET, PATCH, DELETE methods', () => {
    expect(mockRouter.route).toHaveBeenCalledWith('/:id');
    expect(mockRouteMethods.get).toHaveBeenCalledWith(mockTenantContext.extractTenantContext, mockController.getForumById);
    expect(mockRouteMethods.patch).toHaveBeenCalledWith(mockTenantContext.extractTenantContext, mockController.updateForum);
    expect(mockRouteMethods.delete).toHaveBeenCalledWith(mockTenantContext.extractTenantContext, mockController.deleteForum);
  });

  it('should define the /comment/:commentId route with GET method', () => {
    expect(mockRouter.route).toHaveBeenCalledWith('/comment/:commentId');
    expect(mockRouteMethods.get).toHaveBeenCalledWith(mockTenantContext.extractTenantContext, mockController.getComment);
  });

  it('should define the /deleteComment/:id route with DELETE method', () => {
    expect(mockRouter.route).toHaveBeenCalledWith('/deleteComment/:id');
    expect(mockRouteMethods.delete).toHaveBeenCalledWith(mockTenantContext.extractTenantContext, mockController.deleteComment);
  });

  it('should define the /getBlogByEmail/:email route with GET method', () => {
    expect(mockRouter.route).toHaveBeenCalledWith('/getBlogByEmail/:email');
    expect(mockRouteMethods.get).toHaveBeenCalledWith(mockTenantContext.extractTenantContext, mockController.getForumByEmail);
  });

  it('should define the / route with two GET methods and one POST method', () => {
    expect(mockRouter.route).toHaveBeenCalledWith('/');
    // The two GET calls are chained on the same route object
    expect(mockRouteMethods.get).toHaveBeenCalledTimes(2);
    expect(mockRouteMethods.get).toHaveBeenNthCalledWith(1, mockTenantContext.extractTenantContext, mockController.getForum);
    expect(mockRouteMethods.get).toHaveBeenNthCalledWith(2, mockTenantContext.extractTenantContext, mockController.getForumSuggestion);
    expect(mockRouteMethods.post).toHaveBeenCalledWith(mockTenantContext.extractTenantContext, mockController.addForum);
  });

  it('should define the /blog-suggestion/:suggestion route with GET method', () => {
    expect(mockRouter.route).toHaveBeenCalledWith('/blog-suggestion/:suggestion');
    expect(mockRouteMethods.get).toHaveBeenCalledWith(mockTenantContext.extractTenantContext, mockController.getForumSuggestion);
  });

  it('should define the /userForumActivity route with POST method', () => {
    expect(mockRouter.route).toHaveBeenCalledWith('/userForumActivity');
    expect(mockRouteMethods.post).toHaveBeenCalledWith(mockTenantContext.extractTenantContext, mockController.addUserForumActivity);
  });

  it('should export the router instance', () => {
    expect(forumRouter).toBe(mockRouter);
  });
});