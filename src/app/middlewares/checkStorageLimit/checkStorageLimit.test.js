import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';

// Setup hoisting mocks
const {
  mockSubscriptionFindOne,
  mockGetTotalStorage,
  mockLoggerWarn,
  mockLoggerInfo,
} = vi.hoisted(() => ({
  mockSubscriptionFindOne: vi.fn(),
  mockGetTotalStorage: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerInfo: vi.fn(),
}));

// Mock Subscription Model
vi.mock('../../modules/subscription/subscription.model.js', () => ({
  default: {
    findOne: mockSubscriptionFindOne,
  },
}));

// Mock UserUsage Model
vi.mock('../../modules/usage/userUsage.model.js', () => ({
  default: {
    getTotalStorage: mockGetTotalStorage,
  },
}));

// Mock logger
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    warn: mockLoggerWarn,
    info: mockLoggerInfo,
    error: vi.fn(),
  },
}));

// Import the middleware
import checkStorageLimit from './checkStorageLimit.js';

describe('checkStorageLimit middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      isGuest: false,
      user: {
        id: 'user123',
      },
      currentTenantId: null,
      headers: {},
      file: null,
      files: null,
    };
    res = {
      setHeader: vi.fn(),
    };
    next = vi.fn();
  });

  describe('Bypass scenarios', () => {
    it('should call next() and bypass if request is guest (req.isGuest is true)', async () => {
      req.isGuest = true;
      await checkStorageLimit(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(mockSubscriptionFindOne).not.toHaveBeenCalled();
    });

    it('should call next() and bypass if req.user is missing', async () => {
      req.user = undefined;
      await checkStorageLimit(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(mockSubscriptionFindOne).not.toHaveBeenCalled();
    });

    it('should call next() and bypass if req.user.id is missing', async () => {
      req.user = {};
      await checkStorageLimit(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(mockSubscriptionFindOne).not.toHaveBeenCalled();
    });
  });

  describe('Storage limits enforcement', () => {
    it('should block uploads (413 Payload Too Large) if user has no subscription (treated as free plan with 0 limit)', async () => {
      mockSubscriptionFindOne.mockResolvedValue(null);
      req.file = { size: 500000 };

      await checkStorageLimit(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(httpStatus.PAYLOAD_TOO_LARGE);
      expect(error.message).toContain('File storage is not included in the Free plan');
    });

    it('should block uploads if user has an active subscription but storage limit is 0', async () => {
      mockSubscriptionFindOne.mockResolvedValue({
        plan: 'free',
        limits: { knowledgeLimit: 0 },
      });
      req.file = { size: 1000 };

      await checkStorageLimit(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(httpStatus.PAYLOAD_TOO_LARGE);
      expect(error.message).toContain('File storage is not included in the Free plan');
    });

    it('should block upload if incoming file exceeds remaining space', async () => {
      // 10 GB limit = 10737418240 bytes
      mockSubscriptionFindOne.mockResolvedValue({
        plan: 'explore',
        limits: { knowledgeLimit: 10737418240 },
      });
      // 9.9 GB used = 10630040780 bytes
      mockGetTotalStorage.mockResolvedValue(10630040780);
      // 200 MB incoming = 209715200 bytes -> exceeds limit by ~100MB
      req.file = { size: 209715200 };

      await checkStorageLimit(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(httpStatus.PAYLOAD_TOO_LARGE);
      expect(error.message).toContain('Storage limit exceeded');
    });

    it('should allow upload and attach req.incomingFileSize if space is sufficient', async () => {
      mockSubscriptionFindOne.mockResolvedValue({
        plan: 'explore',
        limits: { knowledgeLimit: 10737418240 },
      });
      mockGetTotalStorage.mockResolvedValue(5 * 1024 * 1024 * 1024); // 5 GB used
      req.file = { size: 100 * 1024 * 1024 }; // 100 MB incoming

      await checkStorageLimit(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-Storage-Used-Bytes', 5 * 1024 * 1024 * 1024);
      expect(res.setHeader).toHaveBeenCalledWith('X-Storage-Limit-Bytes', 10737418240);
      expect(next).toHaveBeenCalledWith();
      expect(req.incomingFileSize).toBe(100 * 1024 * 1024);
    });

    it('should resolve incoming size from content-length header if no multer files exist', async () => {
      mockSubscriptionFindOne.mockResolvedValue({
        plan: 'explore',
        limits: { knowledgeLimit: 10737418240 },
      });
      mockGetTotalStorage.mockResolvedValue(5 * 1024 * 1024 * 1024); // 5 GB used
      req.headers['content-length'] = String(50 * 1024 * 1024); // 50 MB

      await checkStorageLimit(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-Storage-Used-Bytes', 5 * 1024 * 1024 * 1024);
      expect(res.setHeader).toHaveBeenCalledWith('X-Storage-Limit-Bytes', 10737418240);
      expect(next).toHaveBeenCalledWith();
      expect(req.incomingFileSize).toBe(50 * 1024 * 1024);
    });
  });

  describe('Tenant scoping', () => {
    it('should query tenant subscription if currentTenantId is provided', async () => {
      req.currentTenantId = 'tenantXYZ';
      mockSubscriptionFindOne.mockResolvedValue({
        plan: 'execute',
        limits: { knowledgeLimit: 53687091200 }, // 50 GB
      });
      mockGetTotalStorage.mockResolvedValue(0);
      req.file = { size: 1000 };

      await checkStorageLimit(req, res, next);

      expect(mockSubscriptionFindOne).toHaveBeenCalledWith({
        tenantId: 'tenantXYZ',
        status: 'active',
      });
      expect(mockGetTotalStorage).toHaveBeenCalledWith('user123', 'tenantXYZ');
      expect(next).toHaveBeenCalledWith();
    });
  });
});
