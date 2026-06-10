import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock dependencies
vi.mock('./composio-catalog.controller.js', () => ({
  ComposioCatalogController: {
    getRepositories: vi.fn(),
    getStats: vi.fn(),
    importSubmodule: vi.fn(),
  },
}));

vi.mock('../../middlewares/auth.middleware.js', () => ({
  authMiddleware: vi.fn((req, res, next) => next()),
}));

// Import router and mocked modules
import { composioCatalogRoutes } from './composio-catalog.route.js';
import { ComposioCatalogController } from './composio-catalog.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';

describe('Composio Catalog Routes', () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();

    // Re-create express app for each test to avoid side effects
    app = express();
    app.use(express.json());
    app.use('/api/composio-catalog', composioCatalogRoutes);

    // Error handling middleware to test asyncHandler
    app.use((err, req, res, next) => {
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    });
  });

  describe('GET /repositories', () => {
    it('should authenticate and return repositories successfully', async () => {
      ComposioCatalogController.getRepositories.mockImplementation((req, res) => {
        res.status(200).json([{ id: '1', name: 'repo-1' }]);
      });

      const response = await request(app)
        .get('/api/composio-catalog/repositories')
        .expect(200);

      expect(authMiddleware).toHaveBeenCalled();
      expect(ComposioCatalogController.getRepositories).toHaveBeenCalled();
      expect(response.body).toEqual([{ id: '1', name: 'repo-1' }]);
    });

    it('should handle errors thrown in getRepositories controller', async () => {
      ComposioCatalogController.getRepositories.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const response = await request(app)
        .get('/api/composio-catalog/repositories')
        .expect(500);

      expect(response.body.error).toBe('Database connection failed');
    });

    it('should handle rejected promises in getRepositories controller', async () => {
      ComposioCatalogController.getRepositories.mockRejectedValue(new Error('Async error'));

      const response = await request(app)
        .get('/api/composio-catalog/repositories')
        .expect(500);

      expect(response.body.error).toBe('Async error');
    });
  });

  describe('GET /stats', () => {
    it('should authenticate and return stats successfully', async () => {
      ComposioCatalogController.getStats.mockImplementation((req, res) => {
        res.status(200).json({ totalRepositories: 5 });
      });

      const response = await request(app)
        .get('/api/composio-catalog/stats')
        .expect(200);

      expect(authMiddleware).toHaveBeenCalled();
      expect(ComposioCatalogController.getStats).toHaveBeenCalled();
      expect(response.body).toEqual({ totalRepositories: 5 });
    });

    it('should handle errors in getStats controller', async () => {
      ComposioCatalogController.getStats.mockRejectedValue(new Error('Stats error'));

      const response = await request(app)
        .get('/api/composio-catalog/stats')
        .expect(500);

      expect(response.body.error).toBe('Stats error');
    });
  });

  describe('POST /import', () => {
    it('should authenticate and import submodule successfully', async () => {
      ComposioCatalogController.importSubmodule.mockImplementation((req, res) => {
        res.status(200).json({ message: 'Submodule imported successfully.', submoduleId: '123' });
      });

      const response = await request(app)
        .post('/api/composio-catalog/import')
        .send({ url: 'https://github.com/example/repo', branch: 'main' })
        .expect(200);

      expect(authMiddleware).toHaveBeenCalled();
      expect(ComposioCatalogController.importSubmodule).toHaveBeenCalled();
      expect(response.body).toEqual({
        message: 'Submodule imported successfully.',
        submoduleId: '123',
      });
    });

    it('should handle errors in importSubmodule controller', async () => {
      ComposioCatalogController.importSubmodule.mockRejectedValue(new Error('Import failed'));

      const response = await request(app)
        .post('/api/composio-catalog/import')
        .send({ url: 'invalid-url' })
        .expect(500);

      expect(response.body.error).toBe('Import failed');
    });
  });

  describe('Authentication Middleware', () => {
    it('should block access if authMiddleware returns an error or blocks the request', async () => {
      authMiddleware.mockImplementation((req, res, next) => {
        res.status(401).json({ error: 'Unauthorized' });
      });

      const response = await request(app)
        .get('/api/composio-catalog/repositories')
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
      expect(ComposioCatalogController.getRepositories).not.toHaveBeenCalled();
    });
  });
});