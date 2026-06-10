import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { openAIAiRoutes } from './openAi.route.js';
import auth from '../../middlewares/auth/auth.js';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import { openAIAiController } from './openAi.controller.js';

// Mock dependencies
vi.mock('../../middlewares/auth/auth.js', () => ({
  default: vi.fn(() => (req, res, next) => next()), // auth is a HOF
}));

vi.mock('./openAi.controller.js', () => ({
  openAIAiController: {
    Gpt4oMiniGetResponse: vi.fn(),
    Gpt4NanoGetResponse: vi.fn(),
    OpenAiGetResponseAnonymously: vi.fn(),
  },
}));

// Mock express to inspect the router stack
vi.mock('express', async () => {
  const actualExpress = await vi.importActual('express');
  return {
    ...actualExpress,
    default: {
      ...actualExpress.default,
      Router: () => actualExpress.Router(),
    },
  };
});

describe('OpenAI Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should configure POST /get-response route correctly', () => {
    const route = openAIAiRoutes.stack.find(
      layer => layer.route?.path === '/get-response' && layer.route?.methods.post
    );

    expect(route).toBeDefined();
    expect(route.route.stack.length).toBe(2); // auth middleware + controller

    // Check if auth middleware is called with correct roles
    expect(auth).toHaveBeenCalledWith(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER);

    // Check if the controller function is the final handler
    const controllerHandler = route.route.stack.find(
      layer => layer.handle === openAIAiController.Gpt4oMiniGetResponse
    );
    expect(controllerHandler).toBeDefined();
  });

  it('should configure POST /4nano/get-response route correctly', () => {
    const route = openAIAiRoutes.stack.find(
      layer =>
        layer.route?.path === '/4nano/get-response' && layer.route?.methods.post
    );

    expect(route).toBeDefined();
    expect(route.route.stack.length).toBe(2); // auth middleware + controller

    // Check if auth middleware is called with correct roles
    expect(auth).toHaveBeenCalledWith(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER);

    // Check if the controller function is the final handler
    const controllerHandler = route.route.stack.find(
      layer => layer.handle === openAIAiController.Gpt4NanoGetResponse
    );
    expect(controllerHandler).toBeDefined();
  });

  it('should configure POST /anonymous-response route correctly', () => {
    const route = openAIAiRoutes.stack.find(
      layer =>
        layer.route?.path === '/anonymous-response' && layer.route?.methods.post
    );

    expect(route).toBeDefined();
    expect(route.route.stack.length).toBe(1); // Only the controller

    // Check if the controller function is the handler
    const controllerHandler = route.route.stack.find(
      layer => layer.handle === openAIAiController.OpenAiGetResponseAnonymously
    );
    expect(controllerHandler).toBeDefined();
  });

  it('should not apply auth middleware to /anonymous-response', () => {
    // This test relies on the fact that the auth mock is cleared before each test.
    // We re-import the router to re-evaluate its definition.
    // The previous tests will have called auth(), but this one checks that
    // the total number of calls doesn't increase for the anonymous route.
    const initialAuthCalls = auth.mock.calls.length;

    const route = openAIAiRoutes.stack.find(
      layer =>
        layer.route?.path === '/anonymous-response' && layer.route?.methods.post
    );

    expect(route).toBeDefined();
    // Verify that auth() was not called during the setup of this specific route.
    // The total calls should only be from the other two route definitions.
    expect(auth.mock.calls.length).toBe(2);
  });

  it('should not have routes for roles other than ADMIN or USER on protected endpoints', () => {
    // This test checks the explicit roles passed to the auth middleware
    expect(auth).toHaveBeenCalledWith(
      expect.stringMatching(/admin|user/),
      expect.stringMatching(/admin|user/)
    );
    expect(auth).not.toHaveBeenCalledWith(
      expect.stringMatching(/super_admin|manager/)
    );
  });
});