import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usageLogService } from './usageLog.service.js';

// Mock external dependencies
// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn().mockImplementation(() => 'mock-uuid-123'),
}));

const {
  mockUsageLogCreate,
  mockGetTenantUsageSummary,
  mockGetUserUsageSummary,
  mockAggregate,
  mockLoggerError,
  mockCreateHash
} = vi.hoisted(() => {
  // Mock UsageLog model
  const mockUsageLogCreate = vi.fn();
  const mockGetTenantUsageSummary = vi.fn();
  const mockGetUserUsageSummary = vi.fn();
  const mockAggregate = vi.fn();

  // Mock logger
  const mockLoggerError = vi.fn();
  const mockCreateHash = vi.fn().mockImplementation(() => ({
    update: mockUpdate,
  }));

  return {
    mockUsageLogCreate,
    mockGetTenantUsageSummary,
    mockGetUserUsageSummary,
    mockAggregate,
    mockLoggerError,
    mockCreateHash
  };
});

vi.mock('./usageLog.model.js', () => ({
  default: {
    create: mockUsageLogCreate,
    getTenantUsageSummary: mockGetTenantUsageSummary,
    getUserUsageSummary: mockGetUserUsageSummary,
    aggregate: mockAggregate,
  },
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    error: mockLoggerError,
  },
}));

// Mock crypto for anonymizeIP
const mockDigest = vi.fn().mockImplementation(() => 'mockedhashvalue');
const mockUpdate = vi.fn().mockImplementation(() => ({
  digest: mockDigest,
}));
vi.mock('crypto', () => ({
  default: {
    createHash: mockCreateHash,
  },
}));

// Import internal functions for direct testing
import {
  mapEndpointToModule,
  extractAction,
  anonymizeIP,
  getStatusFromCode,
  getErrorType,
  createLogAsync,
} from './usageLog.service.js';

describe('usageLogService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers(); // For setImmediate and Date objects
  });

  afterEach(() => {
    vi.runOnlyPendingTimers(); // Ensure all setImmediate are run
    vi.useRealTimers();
  });

  describe('mapEndpointToModule', () => {
    it('should map auth endpoints correctly', () => {
      expect(mapEndpointToModule('/api/v1/auth/login', 'POST')).toEqual({
        module: 'auth',
        action: 'authenticate',
      });
      expect(mapEndpointToModule('/api/v1/auth/register', 'GET')).toEqual({
        module: 'auth',
        action: 'query',
      });
    });

    it('should map tenant endpoints correctly', () => {
      expect(mapEndpointToModule('/api/v1/tenant/create', 'POST')).toEqual({
        module: 'tenant',
        action: 'create',
      });
      expect(mapEndpointToModule('/api/v1/tenant/123', 'GET')).toEqual({
        module: 'tenant',
        action: 'read',
      });
    });

    it('should map legal-contract-review endpoints', () => {
      expect(
        mapEndpointToModule('/api/v1/legal-contract-review/analyze', 'POST')
      ).toEqual({ module: 'legal-contract-review', action: 'analyze' });
    });

    it('should map document-review endpoints', () => {
      expect(
        mapEndpointToModule('/api/v1/document-review/review', 'POST')
      ).toEqual({ module: 'document-review', action: 'review' });
    });

    it('should map document-analysis endpoints', () => {
      expect(
        mapEndpointToModule('/api/v1/document-analysis/analyze', 'POST')
      ).toEqual({ module: 'document-analysis', action: 'analyze' });
    });

    it('should map document-draft endpoints', () => {
      expect(
        mapEndpointToModule('/api/v1/document-draft/generate', 'POST')
      ).toEqual({ module: 'document-drafting', action: 'generate' });
    });

    it('should map knowledge-bank endpoints', () => {
      expect(
        mapEndpointToModule('/api/v1/knowledge-bank/search', 'GET')
      ).toEqual({ module: 'knowledge-bank', action: 'search' });
      expect(
        mapEndpointToModule('/api/v1/knowledgebank/upload', 'POST')
      ).toEqual({ module: 'knowledge-bank', action: 'upload' });
    });

    it('should map code generation endpoints', () => {
      expect(mapEndpointToModule('/api/v1/code/generate', 'POST')).toEqual({
        module: 'code-generation',
        action: 'generate',
      });
    });

    it('should map search endpoints', () => {
      expect(mapEndpointToModule('/api/v1/search/query', 'GET')).toEqual({
        module: 'search',
        action: 'search',
      });
    });

    it('should map deep-research endpoints', () => {
      expect(mapEndpointToModule('/api/v1/deep-research/analyze', 'POST')).toEqual({
        module: 'deep-research',
        action: 'analyze',
      });
      expect(mapEndpointToModule('/api/v1/research/query', 'GET')).toEqual({
        module: 'deep-research',
        action: 'read',
      });
    });

    it('should map presentation endpoints', () => {
      expect(mapEndpointToModule('/api/v1/presentation/generate', 'POST')).toEqual({
        module: 'presentation',
        action: 'generate',
      });
    });

    it('should map report endpoints', () => {
      expect(mapEndpointToModule('/api/v1/report/generate', 'POST')).toEqual({
        module: 'report-generation',
        action: 'generate',
      });
    });

    it('should map article endpoints', () => {
      expect(mapEndpointToModule('/api/v1/article/create', 'POST')).toEqual({
        module: 'article-writer',
        action: 'create',
      });
    });

    it('should map creative-writing endpoints', () => {
      expect(mapEndpointToModule('/api/v1/creative-writing/generate', 'POST')).toEqual({
        module: 'creative-writing',
        action: 'generate',
      });
    });

    it('should map rewrite endpoints', () => {
      expect(mapEndpointToModule('/api/v1/rewrite/text', 'POST')).toEqual({
        module: 'rewrite',
        action: 'create',
      });
    });

    it('should map translation endpoints', () => {
      expect(mapEndpointToModule('/api/v1/translation/text', 'POST')).toEqual({
        module: 'translation',
        action: 'create',
      });
      expect(mapEndpointToModule('/api/v1/translate/text', 'POST')).toEqual({
        module: 'translation',
        action: 'create',
      });
    });

    it('should map transcription endpoints', () => {
      expect(mapEndpointToModule('/api/v1/transcription/audio', 'POST')).toEqual({
        module: 'transcription',
        action: 'create',
      });
      expect(mapEndpointToModule('/api/v1/transcribe/audio', 'POST')).toEqual({
        module: 'transcription',
        action: 'create',
      });
    });

    it('should map brainstorm endpoints', () => {
      expect(mapEndpointToModule('/api/v1/brainstorm/ideas', 'POST')).toEqual({
        module: 'brainstorm',
        action: 'create',
      });
    });

    it('should map plan endpoints', () => {
      expect(mapEndpointToModule('/api/v1/plan/generate', 'POST')).toEqual({
        module: 'plan-generator',
        action: 'generate',
      });
    });

    it('should map image endpoints', () => {
      expect(mapEndpointToModule('/api/v1/image/generate', 'POST')).toEqual({
        module: 'image-generation',
        action: 'generate',
      });
    });

    it('should map stripe endpoints', () => {
      expect(mapEndpointToModule('/api/v1/stripe/webhook', 'POST')).toEqual({
        module: 'stripe',
        action: 'create',
      });
    });

    it('should return "other" for unmapped endpoints', () => {
      expect(mapEndpointToModule('/api/v1/unknown/path', 'GET')).toEqual({
        module: 'other',
        action: 'read',
      });
    });
  });

  describe('extractAction', () => {
    it('should extract action from path keywords', () => {
      expect(extractAction('/api/generate', 'POST')).toBe('generate');
      expect(extractAction('/api/analyze', 'GET')).toBe('analyze');
      expect(extractAction('/api/review', 'PUT')).toBe('review');
      expect(extractAction('/api/search', 'GET')).toBe('search');
      expect(extractAction('/api/create', 'POST')).toBe('create');
      expect(extractAction('/api/upload', 'POST')).toBe('upload');
      expect(extractAction('/api/download', 'GET')).toBe('download');
      expect(extractAction('/api/delete', 'DELETE')).toBe('delete');
    });

    it('should fallback to method-based action', () => {
      expect(extractAction('/api/items', 'GET')).toBe('read');
      expect(extractAction('/api/items', 'POST')).toBe('create');
      expect(extractAction('/api/items/1', 'PUT')).toBe('update');
      expect(extractAction('/api/items/1', 'PATCH')).toBe('update');
      expect(extractAction('/api/items/1', 'DELETE')).toBe('delete');
    });

    it('should return "unknown" for unsupported methods', () => {
      expect(extractAction('/api/items', 'OPTIONS')).toBe('unknown');
    });
  });

  describe('anonymizeIP', () => {
    it('should return null for null or undefined IP', () => {
      expect(anonymizeIP(null)).toBeNull();
      expect(anonymizeIP(undefined)).toBeNull();
      expect(anonymizeIP('')).toBeNull();
    });

    it('should anonymize a valid IP address', () => {
      const ip = '192.168.1.1';
      anonymizeIP(ip);
      expect(mockCreateHash).toHaveBeenCalledWith('sha256');
      expect(mockUpdate).toHaveBeenCalledWith(ip);
      expect(mockDigest).toHaveBeenCalledWith('hex');
      expect(anonymizeIP(ip)).toBe('mockedhashvalue');
    });
  });

  describe('getStatusFromCode', () => {
    it('should return "success" for 2xx codes', () => {
      expect(getStatusFromCode(200)).toBe('success');
      expect(getStatusFromCode(201)).toBe('success');
      expect(getStatusFromCode(299)).toBe('success');
    });

    it('should return "error" for 4xx and 5xx codes', () => {
      expect(getStatusFromCode(400)).toBe('error');
      expect(getStatusFromCode(404)).toBe('error');
      expect(getStatusFromCode(500)).toBe('error');
      expect(getStatusFromCode(599)).toBe('error');
    });

    it('should return "partial" for other codes', () => {
      expect(getStatusFromCode(100)).toBe('partial');
      expect(getStatusFromCode(300)).toBe('partial');
      expect(getStatusFromCode(302)).toBe('partial');
      expect(getStatusFromCode(600)).toBe('partial');
    });
  });

  describe('getErrorType', () => {
    it('should return correct error types for specific codes', () => {
      expect(getErrorType(400)).toBe('validation');
      expect(getErrorType(401)).toBe('authentication');
      expect(getErrorType(403)).toBe('authorization');
      expect(getErrorType(404)).toBe('not-found');
      expect(getErrorType(429)).toBe('rate-limit');
      expect(getErrorType(408)).toBe('timeout');
      expect(getErrorType(504)).toBe('timeout');
      expect(getErrorType(500)).toBe('server');
      expect(getErrorType(503)).toBe('server');
    });

    it('should return null for non-error or unmapped error codes', () => {
      expect(getErrorType(200)).toBeNull();
      expect(getErrorType(300)).toBeNull();
      expect(getErrorType(402)).toBeNull();
    });
  });

  describe('createLogAsync', () => {
    it('should call UsageLog.create with provided data asynchronously', async () => {
      const logData = {
        userId: 'user123',
        module: 'test',
        endpoint: '/test',
      };
      mockUsageLogCreate.mockResolvedValueOnce({});

      createLogAsync(logData);

      expect(mockUsageLogCreate).not.toHaveBeenCalled();

      vi.runAllImmediates();

      expect(mockUsageLogCreate).toHaveBeenCalledTimes(1);
      expect(mockUsageLogCreate).toHaveBeenCalledWith(logData);
      expect(mockLoggerError).not.toHaveBeenCalled();
    });

    it('should log an error if UsageLog.create fails', async () => {
      const logData = {
        userId: 'user123',
        tenantId: 'tenant456',
        module: 'test',
        endpoint: '/test',
      };
      const error = new Error('DB error');
      mockUsageLogCreate.mockRejectedValueOnce(error);

      createLogAsync(logData);

      vi.runAllImmediates();

      expect(mockUsageLogCreate).toHaveBeenCalledTimes(1);
      expect(mockUsageLogCreate).toHaveBeenCalledWith(logData);
      expect(mockLoggerError).toHaveBeenCalledTimes(1);
      expect(mockLoggerError).toHaveBeenCalledWith('Failed to create usage log:', {
        error: error.message,
        logData: {
          userId: logData.userId,
          tenantId: logData.tenantId,
          module: logData.module,
          endpoint: logData.endpoint,
        },
      });
    });
  });

  describe('logRequest', () => {
    it('should correctly process and log a successful request', () => {
      const startTime = Date.now() - 1000;
      const endTime = Date.now();
      const mockDate = new Date(startTime);

      vi.setSystemTime(mockDate);

      const data = {
        userId: 'user-abc',
        tenantId: 'tenant-xyz',
        endpoint: '/api/v1/document-analysis/analyze',
        method: 'POST',
        startTime: startTime,
        endTime: endTime,
        statusCode: 200,
        tokensUsed: 100,
        modelUsed: 'gpt-4',
        inputSize: 500,
        outputSize: 200,
        metadata: { key: 'value' },
        ipAddress: '192.168.1.1',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/100.0.4896.127 Safari/537.36',
      };

      const createLogAsyncSpy = vi.spyOn(createLogAsync, 'call');
      createLogAsyncSpy.mockImplementationOnce(() => {}); // Prevent actual async call

      usageLogService.logRequest(data);

      expect(createLogAsyncSpy).toHaveBeenCalledTimes(1);
      const loggedData = createLogAsyncSpy.mock.calls[0][1]; // The first argument to createLogAsync

      expect(loggedData).toEqual({
        timestamp: new Date(startTime),
        userId: 'user-abc',
        tenantId: 'tenant-xyz',
        module: 'document-analysis',
        action: 'analyze',
        endpoint: '/api/v1/document-analysis/analyze',
        method: 'POST',
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        duration: 1000,
        status: 'success',
        statusCode: 200,
        errorType: null,
        errorMessage: null,
        tokensUsed: 100,
        modelUsed: 'gpt-4',
        inputSize: 500,
        outputSize: 200,
        requestId: 'mock-uuid-123',
        ipAddress: 'mockedhashvalue',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/100.0.4896.127 Safari/537.36'.substring(
            0,
            200
          ),
        metadata: { key: 'value' },
      });

      expect(vi.mocked(mapEndpointToModule)).toHaveBeenCalledWith(
        '/api/v1/document-analysis/analyze',
        'POST'
      );
      expect(vi.mocked(getStatusFromCode)).toHaveBeenCalledWith(200);
      expect(vi.mocked(anonymizeIP)).toHaveBeenCalledWith('192.168.1.1');
      expect(vi.mocked(getErrorType)).toHaveBeenCalledWith(200);
      expect(vi.mocked(vi.importActual('uuid').v4)).toHaveBeenCalled();
    });

    it('should handle error requests correctly', () => {
      const startTime = Date.now() - 500;
      const endTime = Date.now();
      const mockDate = new Date(startTime);
      vi.setSystemTime(mockDate);

      const data = {
        userId: 'user-error',
        tenantId: 'tenant-error',
        endpoint: '/api/v1/auth/login',
        method: 'POST',
        startTime: startTime,
        endTime: endTime,
        statusCode: 401,
        errorMessage: 'Authentication failed',
        ipAddress: '10.0.0.1',
      };

      const createLogAsyncSpy = vi.spyOn(createLogAsync, 'call');
      createLogAsyncSpy.mockImplementationOnce(() => {});

      usageLogService.logRequest(data);

      expect(createLogAsyncSpy).toHaveBeenCalledTimes(1);
      const loggedData = createLogAsyncSpy.mock.calls[0][1];

      expect(loggedData.status).toBe('error');
      expect(loggedData.errorType).toBe('authentication');
      expect(loggedData.errorMessage).toBe('Authentication failed');
      expect(loggedData.module).toBe('auth');
      expect(loggedData.action).toBe('authenticate');
      expect(loggedData.duration).toBe(500);
      expect(loggedData.ipAddress).toBe('mockedhashvalue');
    });

    it('should handle partial data and default values', () => {
      const startTime = Date.now() - 200;
      const endTime = Date.now();
      const mockDate = new Date(startTime);
      vi.setSystemTime(mockDate);

      const data = {
        userId: 'user-minimal',
        endpoint: '/api/v1/unknown/path',
        method: 'GET',
        startTime: startTime,
        endTime: endTime,
        statusCode: 200,
      };

      const createLogAsyncSpy = vi.spyOn(createLogAsync, 'call');
      createLogAsyncSpy.mockImplementationOnce(() => {});

      usageLogService.logRequest(data);

      expect(createLogAsyncSpy).toHaveBeenCalledTimes(1);
      const loggedData = createLogAsyncSpy.mock.calls[0][1];

      expect(loggedData.tenantId).toBeNull();
      expect(loggedData.errorMessage).toBeNull();
      expect(loggedData.tokensUsed).toBe(0);
      expect(loggedData.modelUsed).toBeNull();
      expect(loggedData.inputSize).toBe(0);
      expect(loggedData.outputSize).toBe(0);
      expect(loggedData.metadata).toEqual({});
      expect(loggedData.ipAddress).toBeNull();
      expect(loggedData.userAgent).toBeNull();
      expect(loggedData.module).toBe('other');
      expect(loggedData.action).toBe('read');
      expect(loggedData.duration).toBe(200);
    });

    it('should truncate errorMessage and userAgent', () => {
      const startTime = Date.now() - 100;
      const endTime = Date.now();
      const mockDate = new Date(startTime);
      vi.setSystemTime(mockDate);

      const longString = 'a'.repeat(1000);
      const data = {
        userId: 'user-long',
        endpoint: '/api/v1/test',
        method: 'GET',
        startTime: startTime,
        endTime: endTime,
        statusCode: 400,
        errorMessage: longString,
        userAgent: longString,
      };

      const createLogAsyncSpy = vi.spyOn(createLogAsync, 'call');
      createLogAsyncSpy.mockImplementationOnce(() => {});

      usageLogService.logRequest(data);

      expect(createLogAsyncSpy).toHaveBeenCalledTimes(1);
      const loggedData = createLogAsyncSpy.mock.calls[0][1];

      expect(loggedData.errorMessage).toHaveLength(500);
      expect(loggedData.errorMessage).toBe(longString.substring(0, 500));
      expect(loggedData.userAgent).toHaveLength(200);
      expect(loggedData.userAgent).toBe(longString.substring(0, 200));
    });
  });

  describe('getTenantUsage', () => {
    it('should call UsageLog.getTenantUsageSummary and return data', async () => {
      const mockSummary = [{ total: 10, tokens: 500 }];
      mockGetTenantUsageSummary.mockResolvedValueOnce(mockSummary);

      const result = await usageLogService.getTenantUsage(
        'tenant123',
        new Date('2023-01-01'),
        new Date('2023-01-31')
      );

      expect(mockGetTenantUsageSummary).toHaveBeenCalledTimes(1);
      expect(mockGetTenantUsageSummary).toHaveBeenCalledWith(
        'tenant123',
        new Date('2023-01-01'),
        new Date('2023-01-31')
      );
      expect(result).toEqual(mockSummary);
      expect(mockLoggerError).not.toHaveBeenCalled();
    });

    it('should log error and re-throw if UsageLog.getTenantUsageSummary fails', async () => {
      const error = new Error('DB error');
      mockGetTenantUsageSummary.mockRejectedValueOnce(error);

      await expect(
        usageLogService.getTenantUsage(
          'tenant123',
          new Date('2023-01-01'),
          new Date('2023-01-31')
        )
      ).rejects.toThrow(error);

      expect(mockGetTenantUsageSummary).toHaveBeenCalledTimes(1);
      expect(mockLoggerError).toHaveBeenCalledTimes(1);
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Error getting tenant usage summary:',
        error
      );
    });
  });

  describe('getUserUsage', () => {
    it('should call UsageLog.getUserUsageSummary and return data', async () => {
      const mockSummary = [{ total: 5, tokens: 200 }];
      mockGetUserUsageSummary.mockResolvedValueOnce(mockSummary);

      const result = await usageLogService.getUserUsage(
        'user123',
        new Date('2023-01-01'),
        new Date('2023-01-31')
      );

      expect(mockGetUserUsageSummary).toHaveBeenCalledTimes(1);
      expect(mockGetUserUsageSummary).toHaveBeenCalledWith(
        'user123',
        new Date('2023-01-01'),
        new Date('2023-01-31')
      );
      expect(result).toEqual(mockSummary);
      expect(mockLoggerError).not.toHaveBeenCalled();
    });

    it('should log error and re-throw if UsageLog.getUserUsageSummary fails', async () => {
      const error = new Error('DB error');
      mockGetUserUsageSummary.mockRejectedValueOnce(error);

      await expect(
        usageLogService.getUserUsage(
          'user123',
          new Date('2023-01-01'),
          new Date('2023-01-31')
        )
      ).rejects.toThrow(error);

      expect(mockGetUserUsageSummary).toHaveBeenCalledTimes(1);
      expect(mockLoggerError).toHaveBeenCalledTimes(1);
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Error getting user usage summary:',
        error
      );
    });
  });

  describe('getUsageStats', () => {
    const mockNow = new Date('2023-10-26T10:00:00.000Z');
    const mock30DaysAgo = new Date('2023-09-26T10:00:00.000Z');

    beforeEach(() => {
      vi.setSystemTime(mockNow);
    });

    it('should call UsageLog.aggregate with default filters if none provided', async () => {
      const mockStats = [
        {
          totalRequests: 10,
          successCount: 8,
          errorCount: 2,
          avgDuration: 150,
          maxDuration: 300,
          minDuration: 50,
          totalTokens: 1000,
          avgTokens: 100,
        },
      ];
      mockAggregate.mockResolvedValueOnce(mockStats);

      const result = await usageLogService.getUsageStats({});

      expect(mockAggregate).toHaveBeenCalledTimes(1);
      const aggregateCall = mockAggregate.mock.calls[0][0];

      expect(aggregateCall[0].$match.timestamp.$gte).toEqual(mock30DaysAgo);
      expect(aggregateCall[0].$match.timestamp.$lte).toEqual(mockNow);
      expect(aggregateCall[0].$match.tenantId).toBeUndefined();
      expect(aggregateCall[0].$match.userId).toBeUndefined();
      expect(aggregateCall[0].$match.module).toBeUndefined();

      expect(aggregateCall[1].$group).toBeDefined();
      expect(aggregateCall[2].$project).toBeDefined();

      expect(result).toEqual({
        totalRequests: 10,
        successCount: 8,
        errorCount: 2,
        successRate: 80,
        avgDuration: 150,
        maxDuration: 300,
        minDuration: 50,
        totalTokens: 1000,
        avgTokens: 100,
      });
      expect(mockLoggerError).not.toHaveBeenCalled();
    });

    it('should call UsageLog.aggregate with provided filters', async () => {
      const startDate = new Date('2023-10-01');
      const endDate = new Date('2023-10-15');
      const filters = {
        tenantId: 'tenant123',
        userId: 'user456',
        module: 'auth',
        startDate,
        endDate,
      };
      const mockStats = [
        {
          totalRequests: 5,
          successCount: 4,
          errorCount: 1,
          avgDuration: 120,
          maxDuration: 250,
          minDuration: 80,
          totalTokens: 500,
          avgTokens: 100,
        },
      ];
      mockAggregate.mockResolvedValueOnce(mockStats);

      const result = await usageLogService.getUsageStats(filters);

      expect(mockAggregate).toHaveBeenCalledTimes(1);
      const aggregateCall = mockAggregate.mock.calls[0][0];

      expect(aggregateCall[0].$match.timestamp.$gte).toEqual(startDate);
      expect(aggregateCall[0].$match.timestamp.$lte).toEqual(endDate);
      expect(aggregateCall[0].$match.tenantId).toBe('tenant123');
      expect(aggregateCall[0].$match.userId).toBe('user456');
      expect(aggregateCall[0].$match.module).toBe('auth');

      expect(result).toEqual({
        totalRequests: 5,
        successCount: 4,
        errorCount: 1,
        successRate: 80,
        avgDuration: 120,
        maxDuration: 250,
        minDuration: 80,
        totalTokens: 500,
        avgTokens: 100,
      });
    });

    it('should return null if no stats are found', async () => {
      mockAggregate.mockResolvedValueOnce([]);

      const result = await usageLogService.getUsageStats({});

      expect(mockAggregate).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
    });

    it('should calculate successRate and round averages correctly', async () => {
      const mockStats = [
        {
          totalRequests: 3,
          successCount: 2,
          errorCount: 1,
          avgDuration: 123.456,
          maxDuration: 200,
          minDuration: 50,
          totalTokens: 333,
          avgTokens: 111.111,
        },
      ];
      mockAggregate.mockResolvedValueOnce(mockStats);

      const result = await usageLogService.getUsageStats({});

      expect(result.successRate).toBe(66.67);
      expect(result.avgDuration).toBe(123.46);
      expect(result.avgTokens).toBe(111.11);
    });

    it('should handle division by zero for successRate if totalRequests is 0', async () => {
      const mockStats = [
        {
          totalRequests: 0,
          successCount: 0,
          errorCount: 0,
          avgDuration: null,
          maxDuration: null,
          minDuration: null,
          totalTokens: 0,
          avgTokens: null,
        },
      ];
      mockAggregate.mockResolvedValueOnce(mockStats);

      const result = await usageLogService.getUsageStats({});

      expect(result.successRate).toBeNaN();
      expect(result.avgDuration).toBeNull();
      expect(result.avgTokens).toBeNull();
    });

    it('should log error and re-throw if UsageLog.aggregate fails', async () => {
      const error = new Error('Aggregation failed');
      mockAggregate.mockRejectedValueOnce(error);

      await expect(usageLogService.getUsageStats({})).rejects.toThrow(error);

      expect(mockAggregate).toHaveBeenCalledTimes(1);
      expect(mockLoggerError).toHaveBeenCalledTimes(1);
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Error getting usage stats:',
        error
      );
    });
  });
});