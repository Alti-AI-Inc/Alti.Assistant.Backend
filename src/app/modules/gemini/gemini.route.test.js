import { vi, describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockGeminiAiGetResponse = vi.fn((req, res) => res.status(200).json({ success: true, data: 'normal' }));
const mockGeminiFlashAiGetResponse = vi.fn((req, res) => res.status(200).json({ success: true, data: 'flash' }));

vi.mock('./gemini.controller.js', () => ({
  GeminiAiController: {
    GeminiAiGetResponse: (req, res, next) => mockGeminiAiGetResponse(req, res, next),
    GeminiFlashAiGetResponse: (req, res, next) => mockGeminiFlashAiGetResponse(req, res, next),
  }
}));

const mockAuthMiddleware = vi.fn((...roles) => {
  return (req, res, next) => {
    req.authRoles = roles;
    next();
  };
});

vi.mock('../../middlewares/auth/auth.js', () => ({
  default: (...roles) => mockAuthMiddleware(...roles)
}));

vi.mock('../../../shared/enum.js', () => ({
  ENUM_USER_ROLE: {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    MANAGER: 'manager',
    USER: 'user'
  }
}));

import { geminiAiRoutes } from './gemini.route.js';

const app = express();
app.use(express.json());
app.use('/api/v1/gemini', geminiAiRoutes);

describe('Gemini AI Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should secure /get-response with SUPER_ADMIN, ADMIN, MANAGER, and USER roles and route to GeminiAiGetResponse', async () => {
    const response = await request(app)
      .post('/api/v1/gemini/get-response')
      .send({ content: 'Hello AI' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: 'normal' });
    expect(mockAuthMiddleware).toHaveBeenCalledWith('super_admin', 'admin', 'manager', 'user');
    expect(mockGeminiAiGetResponse).toHaveBeenCalled();
  });

  it('should secure /flash/get-response with SUPER_ADMIN, ADMIN, MANAGER, and USER roles and route to GeminiFlashAiGetResponse', async () => {
    const response = await request(app)
      .post('/api/v1/gemini/flash/get-response')
      .send({ content: 'Hello Flash AI' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: 'flash' });
    expect(mockAuthMiddleware).toHaveBeenCalledWith('super_admin', 'admin', 'manager', 'user');
    expect(mockGeminiFlashAiGetResponse).toHaveBeenCalled();
  });
});