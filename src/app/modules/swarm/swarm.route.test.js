import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { SwarmController } from './swarm.controller.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';

// Mock dependencies
vi.mock('express', () => {
    const mockRouter = {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    };
    return {
        default: {
            Router: () => mockRouter,
        },
    };
});

vi.mock('./swarm.controller.js', () => ({
    SwarmController: {
        performSwarmStreamingSearch: vi.fn(),
        prewarmUserSandbox: vi.fn(),
        getGlobalStats: vi.fn(),
        updateGlobalConfig: vi.fn(),
    },
}));

vi.mock('../../middlewares/auth/optionalAuth.js', () => ({
    default: vi.fn().mockImplementation(() => (req, res, next) => next()),
}));

// Dynamically import the router file to apply mocks
const { SwarmRoutes } = await import('./swarm.route.js');
const router = express.Router();

describe('Swarm Routes', () => {
    let req;
    let res;
    let next;

    beforeEach(() => {
        req = {
            body: {},
            user: null,
        };
        res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn(),
        };
        next = vi.fn();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Middleware: requirePlatformOwner', () => {
        // The middleware is the 2nd argument in the call to router.get('/admin/stats', ...)
        const requirePlatformOwner = router.get.mock.calls.find(call => call[0] === '/admin/stats')[2];

        it('should return 401 if user is not authenticated', () => {
            req.user = null;
            requirePlatformOwner(req, res, next);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized: Authentication is required." });
            expect(next).not.toHaveBeenCalled();
        });

        it('should return 403 if user is not a platform owner', () => {
            req.user = { id: 'user1', role: 'user' };
            requirePlatformOwner(req, res, next);
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ message: "Forbidden: Platform Owner access required." });
            expect(next).not.toHaveBeenCalled();
        });

        it('should call next() if user has role "super_admin"', () => {
            req.user = { id: 'admin1', role: 'super_admin' };
            requirePlatformOwner(req, res, next);
            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it('should call next() if user has role "platform_owner"', () => {
            req.user = { id: 'owner1', role: 'platform_owner' };
            requirePlatformOwner(req, res, next);
            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it('should call next() if user has isPlatformOwner: true', () => {
            req.user = { id: 'owner2', role: 'admin', isPlatformOwner: true };
            requirePlatformOwner(req, res, next);
            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });
    });

    describe('Middleware: validatePrewarmRequest', () => {
        // The middleware is the 2nd argument in the call to router.post('/prewarm', ...)
        const validatePrewarmRequest = router.post.mock.calls.find(call => call[0] === '/prewarm')[2];

        describe('with userId in body', () => {
            it('should return 401 if user is not authenticated', () => {
                req.body.userId = 'user1';
                req.user = null;
                validatePrewarmRequest(req, res, next);
                expect(res.status).toHaveBeenCalledWith(401);
                expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized: Authentication is required to specify a user ID for pre-warming." });
                expect(next).not.toHaveBeenCalled();
            });

            it('should return 403 if authenticated user ID does not match body userId and user is not platform owner', () => {
                req.body.userId = 'user2';
                req.user = { id: 'user1', role: 'user' };
                validatePrewarmRequest(req, res, next);
                expect(res.status).toHaveBeenCalledWith(403);
                expect(res.json).toHaveBeenCalledWith({ message: "Forbidden: You can only pre-warm your own sandbox." });
                expect(next).not.toHaveBeenCalled();
            });

            it('should call next() if authenticated user ID matches body userId', () => {
                req.body.userId = 'user1';
                req.user = { id: 'user1', role: 'user' };
                validatePrewarmRequest(req, res, next);
                expect(next).toHaveBeenCalled();
                expect(res.status).not.toHaveBeenCalled();
            });

            it('should call next() if user is a platform owner, even if IDs do not match', () => {
                req.body.userId = 'user2';
                req.user = { id: 'admin1', role: 'super_admin' };
                validatePrewarmRequest(req, res, next);
                expect(next).toHaveBeenCalled();
                expect(res.status).not.toHaveBeenCalled();
            });
        });

        describe('without userId in body', () => {
            it('should return 400 if user is not authenticated', () => {
                req.user = null;
                validatePrewarmRequest(req, res, next);
                expect(res.status).toHaveBeenCalledWith(400);
                expect(res.json).toHaveBeenCalledWith({ message: "Bad Request: User ID is required if no authentication token is provided." });
                expect(next).not.toHaveBeenCalled();
            });

            it('should call next() if user is authenticated', () => {
                req.user = { id: 'user1', role: 'user' };
                validatePrewarmRequest(req, res, next);
                expect(next).toHaveBeenCalled();
                expect(res.status).not.toHaveBeenCalled();
            });
        });
    });

    describe('Route Definitions', () => {
        it('should define POST /stream route with optionalAuth and controller', () => {
            expect(router.post).toHaveBeenCalledWith(
                '/stream',
                expect.any(Function), // from optionalAuth()
                SwarmController.performSwarmStreamingSearch
            );
        });

        it('should define POST /prewarm route with optionalAuth, validation middleware, and controller', () => {
            expect(router.post).toHaveBeenCalledWith(
                '/prewarm',
                expect.any(Function), // from optionalAuth()
                expect.any(Function), // validatePrewarmRequest
                SwarmController.prewarmUserSandbox
            );
        });

        it('should define GET /admin/stats route with optionalAuth, platform owner check, and handler', () => {
            expect(router.get).toHaveBeenCalledWith(
                '/admin/stats',
                expect.any(Function), // from optionalAuth()
                expect.any(Function), // requirePlatformOwner
                expect.any(Function)  // inline handler
            );
        });

        it('should define POST /admin/config route with optionalAuth, platform owner check, and handler', () => {
            expect(router.post).toHaveBeenCalledWith(
                '/admin/config',
                expect.any(Function), // from optionalAuth()
                expect.any(Function), // requirePlatformOwner
                expect.any(Function)  // inline handler
            );
        });
    });

    describe('Inline Route Handlers', () => {
        describe('/admin/stats handler', () => {
            const statsHandler = router.get.mock.calls.find(call => call[0] === '/admin/stats')[3];

            it('should call SwarmController.getGlobalStats if it exists', () => {
                SwarmController.getGlobalStats.mockImplementation((req, res, next) => res.json({}));
                statsHandler(req, res, next);
                expect(SwarmController.getGlobalStats).toHaveBeenCalledWith(req, res, next);
            });

            it('should return default stats if SwarmController.getGlobalStats is not a function', () => {
                const originalFunc = SwarmController.getGlobalStats;
                SwarmController.getGlobalStats = undefined; // Simulate function not existing
                statsHandler(req, res, next);
                expect(res.json).toHaveBeenCalledWith({
                    message: "Global swarm statistics retrieved successfully.",
                    activeSwarms: 0,
                    totalSwarmsCreated: 0,
                    systemLoad: "nominal"
                });
                SwarmController.getGlobalStats = originalFunc; // Restore
            });
        });

        describe('/admin/config handler', () => {
            const configHandler = router.post.mock.calls.find(call => call[0] === '/admin/config')[3];

            it('should call SwarmController.updateGlobalConfig if it exists', () => {
                req.body = { setting: 'value' };
                SwarmController.updateGlobalConfig.mockImplementation((req, res, next) => res.json({}));
                configHandler(req, res, next);
                expect(SwarmController.updateGlobalConfig).toHaveBeenCalledWith(req, res, next);
            });

            it('should return default response if SwarmController.updateGlobalConfig is not a function', () => {
                req.body = { setting: 'value' };
                const originalFunc = SwarmController.updateGlobalConfig;
                SwarmController.updateGlobalConfig = undefined; // Simulate function not existing
                configHandler(req, res, next);
                expect(res.json).toHaveBeenCalledWith({
                    message: "System-wide swarm configuration updated successfully.",
                    config: { setting: 'value' }
                });
                SwarmController.updateGlobalConfig = originalFunc; // Restore
            });
        });
    });
});