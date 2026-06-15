import { describe, it, expect, vi } from 'vitest';

const {
  mockPost
} = vi.hoisted(() => {
  // Setup mocks before importing the module under test
  const mockPost = vi.fn();

  return {
    mockPost
  };
});

vi.mock('express', () => {
  return {
    default: {
      Router: () => ({
        post: mockPost,
      }),
    },
  };
});

vi.mock('../../../shared/enum.js', () => ({
  ENUM_USER_ROLE: {
    ADMIN: 'ADMIN',
    USER: 'USER',
  },
}));

vi.mock('../../middlewares/auth/auth.js', () => ({
  default: (...roles) => `auth-middleware-mock-${roles.join('-')}`,
}));

vi.mock('./llama4.controller.js', () => ({
  Llama4AiController: {
    Llama4AiGetResponse: 'mock-llama4-get-response-controller',
  },
}));

// Import the router to trigger its definition
import { llama4AiRoutes } from './llama4.route.js';

describe('Llama4 Route Configuration', () => {
  it('should define the POST /get-response route with correct auth middleware and controller', () => {
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(
      '/get-response',
      'auth-middleware-mock-ADMIN-USER',
      'mock-llama4-get-response-controller'
    );
  });

  it('should export the router instance', () => {
    expect(llama4AiRoutes).toBeDefined();
  });
});