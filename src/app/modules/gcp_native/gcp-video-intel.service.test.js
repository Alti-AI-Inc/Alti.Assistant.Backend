import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleAuth } from 'google-auth-library';
import { GcpVideoIntelService } from './gcp-video-intel.service';
import { TenantUsageService } from '../tenant/tenant-usage.service.js';
import { NotificationService } from '../notification/notification.service.js';
import { logger } from '../../../shared/logger.js';

const {
  mockGcpClient,
  mockGetClient
} = vi.hoisted(() => {
  const mockGcpClient = {
    request: vi.fn(),
  };
  const mockGetClient = vi.fn().mockResolvedValue(mockGcpClient);
  return {
    mockGcpClient,
    mockGetClient
  };
});

// Mock dependencies
vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    constructor() {}
    getClient = mockGetClient;
  }
}));
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('../tenant/tenant-usage.service.js', () => ({
  TenantUsageService: {
    trackUsage: vi.fn(),
    checkQuota: vi.fn(),
  },
}));
vi.mock('../notification/notification.service.js', () => ({
  NotificationService: {
    sendNotification: vi.fn(),
    notifyTenantAdmins: vi.fn(),
    notifyPlatformOwners: vi.fn(),
  },
}));

// Reusable user contexts
const superAdminContext = { user: { id: 'super-1', role: 'super_admin', tenantId: null } };
const adminContext = { user: { id: 'admin-1', role: 'admin', tenantId: 'tenant-A' } };
const managerContext = { user: { id: 'manager-1', role: 'manager', tenantId: 'tenant-A' } };
const userContext = { user: { id: 'user-1', role: 'user', tenantId: 'tenant-A' } };
const userWithManagerContext = { user: { id: 'user-2', role: 'user', tenantId: 'tenant-A', managerId: 'manager-1' } };

describe('GcpVideoIntelService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    TenantUsageService.checkQuota.mockResolvedValue(true);
  });

  describe('startVideoAnalysis', () => {
    const inputUri = 'gs://bucket/video.mp4';
    const mockOperationName = 'operations/12345';

    describe('Context and Role Validation', () => {
      it('should throw if context is missing', async () => {
        await expect(GcpVideoIntelService.startVideoAnalysis(inputUri, null, [], null)).rejects.toThrow('Unauthorized: User context is missing.');
      });

      it('should throw if user has an invalid role', async () => {
        const invalidContext = { user: { role: 'guest', tenantId: 'tenant-A' } };
        await expect(GcpVideoIntelService.startVideoAnalysis(inputUri, null, [], invalidContext)).rejects.toThrow("Unauthorized: Invalid role 'guest'.");
      });

      it('should throw if a non-super_admin user is missing a tenantId', async () => {
        const noTenantContext = { user: { role: 'admin' } };
        await expect(GcpVideoIntelService.startVideoAnalysis(inputUri, null, [], noTenantContext)).rejects.toThrow('Unauthorized: Tenant context is missing.');
      });

      it('should allow super_admin without a tenantId', async () => {
        mockGcpClient.request.mockResolvedValue({ data: { name: mockOperationName } });
        await expect(GcpVideoIntelService.startVideoAnalysis(inputUri, null, [], superAdminContext)).resolves.toBeDefined();
        expect(TenantUsageService.checkQuota).not.toHaveBeenCalled();
      });
    });

    describe('Input Validation', () => {
      it('should throw if neither inputUri nor inputContent is provided', async () => {
        await expect(GcpVideoIntelService.startVideoAnalysis(null, null, [], adminContext)).rejects.toThrow('Either inputUri (GCS link) or inputContent (base64) must be provided.');
      });

      it('should throw if invalid features are provided', async () => {
        const invalidFeatures = ['LABEL_DETECTION', 'INVALID_FEATURE'];
        await expect(GcpVideoIntelService.startVideoAnalysis(inputUri, null, invalidFeatures, adminContext)).rejects.toThrow('Invalid video analysis features provided: INVALID_FEATURE.');
      });
    });

    describe('Quota and Usage', () => {
      it('should throw if tenant quota is exceeded', async () => {
        TenantUsageService.checkQuota.mockResolvedValue(false);
        await expect(GcpVideoIntelService.startVideoAnalysis(inputUri, null, [], adminContext)).rejects.toThrow('QuotaExceeded: Tenant has exceeded the video analysis quota limit.');
        expect(TenantUsageService.checkQuota).toHaveBeenCalledWith('tenant-A', 'video_analysis', 1);
      });

      it('should not check quota for super_admin', async () => {
        mockGcpClient.request.mockResolvedValue({ data: { name: mockOperationName } });
        await GcpVideoIntelService.startVideoAnalysis(inputUri, null, [], superAdminContext);
        expect(TenantUsageService.checkQuota).not.toHaveBeenCalled();
      });

      it('should track usage for non-super_admin users', async () => {
        mockGcpClient.request.mockResolvedValue({ data: { name: mockOperationName } });
        await GcpVideoIntelService.startVideoAnalysis(inputUri, null, [], adminContext);
        expect(TenantUsageService.trackUsage).toHaveBeenCalledWith('tenant-A', 'admin-1', 'video_analysis', 1);
      });

      it('should not track usage for super_admin', async () => {
        mockGcpClient.request.mockResolvedValue({ data: { name: mockOperationName } });
        await GcpVideoIntelService.startVideoAnalysis(inputUri, null, [], superAdminContext);
        expect(TenantUsageService.trackUsage).not.toHaveBeenCalled();
      });
    });

    describe('Notifications', () => {
      beforeEach(() => {
        mockGcpClient.request.mockResolvedValue({ data: { name: mockOperationName } });
      });

      it('should notify platform owners for super_admin actions', async () => {
        await GcpVideoIntelService.startVideoAnalysis(inputUri, null, [], superAdminContext);
        expect(NotificationService.notifyPlatformOwners).toHaveBeenCalledWith(expect.objectContaining({
          message: 'Platform Super Admin super-1 initiated video analysis.'
        }));
        expect(NotificationService.sendNotification).not.toHaveBeenCalled();
        expect(NotificationService.notifyTenantAdmins).not.toHaveBeenCalled();
      });

      it('should notify tenant admins for user actions', async () => {
        await GcpVideoIntelService.startVideoAnalysis(inputUri, null, [], userContext);
        expect(NotificationService.notifyTenantAdmins).toHaveBeenCalledWith('tenant-A', expect.objectContaining({
          message: 'Tenant user user-1 initiated video analysis.'
        }));
      });

      it('should notify a user\'s manager if managerId exists', async () => {
        await GcpVideoIntelService.startVideoAnalysis(inputUri, null, [], userWithManagerContext);
        expect(NotificationService.sendNotification).toHaveBeenCalledWith('manager-1', expect.objectContaining({
          message: 'Your direct report (User user-2) initiated video analysis.'
        }));
        expect(NotificationService.notifyTenantAdmins).toHaveBeenCalled(); // Also notifies admins
      });

      it('should not send manager/admin notifications for an admin user', async () => {
        await GcpVideoIntelService.startVideoAnalysis(inputUri, null, [], adminContext);
        expect(NotificationService.sendNotification).not.toHaveBeenCalled();
        expect(NotificationService.notifyTenantAdmins).not.toHaveBeenCalled();
        expect(NotificationService.notifyPlatformOwners).not.toHaveBeenCalled();
      });
    });

    describe('API Interaction and Success/Failure', () => {
      it('should successfully start analysis and return operation details', async () => {
        mockGcpClient.request.mockResolvedValue({
          data: { name: mockOperationName, done: false, metadata: { some: 'data' } }
        });
        const result = await GcpVideoIntelService.startVideoAnalysis(inputUri, null, ['TEXT_DETECTION'], adminContext);
        expect(mockGcpClient.request).toHaveBeenCalledWith({
          url: 'https://videointelligence.googleapis.com/v1/videos:annotate',
          method: 'POST',
          data: {
            features: ['TEXT_DETECTION'],
            inputUri: inputUri
          }
        });
        expect(result).toEqual({
          success: true,
          operationName: mockOperationName,
          done: false,
          metadata: { some: 'data' }
        });
      });

      it('should use inputContent if provided', async () => {
        mockGcpClient.request.mockResolvedValue({ data: { name: mockOperationName } });
        const inputContent = 'base64-string';
        await GcpVideoIntelService.startVideoAnalysis(null, inputContent, [], adminContext);
        expect(mockGcpClient.request).toHaveBeenCalledWith(expect.objectContaining({
          data: {
            features: expect.any(Array),
            inputContent: inputContent
          }
        }));
      });

      it('should throw if the API call fails', async () => {
        mockGcpClient.request.mockRejectedValue(new Error('API Error'));
        await expect(GcpVideoIntelService.startVideoAnalysis(inputUri, null, [], adminContext)).rejects.toThrow('GCP Video Analysis trigger failed: API Error');
      });

      it('should throw if the API response is missing an operation name', async () => {
        mockGcpClient.request.mockResolvedValue({ data: {} }); // No 'name' property
        await expect(GcpVideoIntelService.startVideoAnalysis(inputUri, null, [], adminContext)).rejects.toThrow('GCP Video Intelligence API did not return an operation name.');
      });
    });
  });

  describe('checkVideoAnalysisStatus', () => {
    const operationName = 'operations/12345';

    describe('Context and Boundary Validation', () => {
      it('should throw if context is missing', async () => {
        await expect(GcpVideoIntelService.checkVideoAnalysisStatus(operationName, null, 'tenant-A')).rejects.toThrow('Unauthorized: User context is missing.');
      });

      it('should throw on tenant boundary violation (IDOR)', async () => {
        await expect(GcpVideoIntelService.checkVideoAnalysisStatus(operationName, adminContext, 'tenant-B')).rejects.toThrow('Unauthorized: Tenant context boundary violation.');
      });

      it('should allow access if tenant IDs match', async () => {
        mockGcpClient.request.mockResolvedValue({ data: { name: operationName, done: false } });
        await expect(GcpVideoIntelService.checkVideoAnalysisStatus(operationName, adminContext, 'tenant-A')).resolves.toBeDefined();
      });

      it('should allow super_admin to bypass tenant boundary checks', async () => {
        mockGcpClient.request.mockResolvedValue({ data: { name: operationName, done: false } });
        await expect(GcpVideoIntelService.checkVideoAnalysisStatus(operationName, superAdminContext, 'tenant-A')).resolves.toBeDefined();
        await expect(GcpVideoIntelService.checkVideoAnalysisStatus(operationName, superAdminContext, 'tenant-B')).resolves.toBeDefined();
        await expect(GcpVideoIntelService.checkVideoAnalysisStatus(operationName, superAdminContext, null)).resolves.toBeDefined();
      });
    });

    describe('API Interaction and Result Parsing', () => {
      it('should return status for an incomplete operation', async () => {
        const rawResponse = { name: operationName, done: false };
        mockGcpClient.request.mockResolvedValue({ data: rawResponse });
        const result = await GcpVideoIntelService.checkVideoAnalysisStatus(operationName, adminContext, 'tenant-A');

        expect(mockGcpClient.request).toHaveBeenCalledWith({
          url: `https://videointelligence.googleapis.com/v1/${operationName}`,
          method: 'GET'
        });
        expect(result).toEqual({
          success: true,
          operationName,
          done: false,
          results: null,
          raw: rawResponse
        });
      });

      it('should parse and return results for a completed operation', async () => {
        const rawResponse = {
          name: operationName,
          done: true,
          response: {
            annotationResults: [{
              segmentLabelAnnotations: [{
                entity: { description: 'animal' },
                categoryEntities: [{ description: 'mammal' }],
                segments: [{
                  segment: { startTimeOffset: '1.2s', endTimeOffset: '3.4s' },
                  confidence: 0.9
                }]
              }],
              textAnnotations: [{
                text: 'Hello',
                segments: [{
                  segment: { startTimeOffset: '5.0s', endTimeOffset: '6.0s' },
                  confidence: 0.98
                }]
              }],
              explicitAnnotation: {
                frames: [{
                  timeOffset: '10.5s',
                  pornographyLikelihood: 'VERY_LIKELY'
                }]
              },
              shotAnnotations: [{
                startTimeOffset: '0s',
                endTimeOffset: '15.0s'
              }]
            }]
          }
        };
        mockGcpClient.request.mockResolvedValue({ data: rawResponse });
        const result = await GcpVideoIntelService.checkVideoAnalysisStatus(operationName, adminContext, 'tenant-A');

        expect(result.done).toBe(true);
        expect(result.results).toEqual({
          labels: [{
            entity: 'animal',
            categories: ['mammal'],
            segments: [{ start: 1.2, end: 3.4, confidence: 0.9 }]
          }],
          text: [{
            text: 'Hello',
            segments: [{ start: 5.0, end: 6.0, confidence: 0.98 }]
          }],
          explicit: [{
            timeOffset: 10.5,
            pornographyLikelihood: 'VERY_LIKELY'
          }],
          shots: [{ start: 0, end: 15.0 }]
        });
        expect(result.raw).toEqual(rawResponse);
      });

      it('should handle empty annotation results gracefully', async () => {
        const rawResponse = {
          name: operationName,
          done: true,
          response: { annotationResults: [{}] }
        };
        mockGcpClient.request.mockResolvedValue({ data: rawResponse });
        const result = await GcpVideoIntelService.checkVideoAnalysisStatus(operationName, adminContext, 'tenant-A');
        expect(result.done).toBe(true);
        expect(result.results).toEqual({
          labels: [],
          text: [],
          explicit: [],
          shots: []
        });
      });

      it('should throw if the API call fails', async () => {
        mockGcpClient.request.mockRejectedValue(new Error('API Error'));
        await expect(GcpVideoIntelService.checkVideoAnalysisStatus(operationName, adminContext, 'tenant-A')).rejects.toThrow('GCP Video Status Check failed: API Error');
      });
    });
  });

  describe('pollVideoAnalysis', () => {
    const operationName = 'operations/12345';

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should poll until the operation is done and return the final result', async () => {
      const incompleteResponse = { data: { name: operationName, done: false } };
      const completeResponse = { data: { name: operationName, done: true, response: { annotationResults: [{}] } } };

      // Mock the check status call to return incomplete, then complete
      mockGcpClient.request
        .mockResolvedValueOnce(incompleteResponse)
        .mockResolvedValueOnce(incompleteResponse)
        .mockResolvedValueOnce(completeResponse);

      const pollPromise = GcpVideoIntelService.pollVideoAnalysis(operationName, adminContext, 'tenant-A', 100, 5);

      // Advance timers to trigger polling
      await vi.advanceTimersByTimeAsync(100); // 1st poll -> 2nd check
      await vi.advanceTimersByTimeAsync(100); // 2nd poll -> 3rd check

      const result = await pollPromise;

      expect(mockGcpClient.request).toHaveBeenCalledTimes(3);
      expect(result.done).toBe(true);
      expect(result.results).toBeDefined();
    });

    it('should throw a timeout error if max attempts are reached', async () => {
      const incompleteResponse = { data: { name: operationName, done: false } };
      mockGcpClient.request.mockResolvedValue(incompleteResponse);

      const pollPromise = GcpVideoIntelService.pollVideoAnalysis(operationName, adminContext, 'tenant-A', 100, 3);

      const advancePromise = (async () => {
        await vi.advanceTimersByTimeAsync(100); // attempt 2
        await vi.advanceTimersByTimeAsync(100); // attempt 3
        await vi.advanceTimersByTimeAsync(100); // attempt 4 (exit loop)
      })();

      await Promise.all([
        expect(pollPromise).rejects.toThrow('Video Analysis polling timed out after 0.3 seconds.'),
        advancePromise
      ]);
      expect(mockGcpClient.request).toHaveBeenCalledTimes(3);
    });

    it('should forward context and tenantId correctly on each poll', async () => {
      const incompleteResponse = { data: { name: operationName, done: false } };
      const completeResponse = { data: { name: operationName, done: true, response: {} } };
      mockGcpClient.request
        .mockResolvedValueOnce(incompleteResponse)
        .mockResolvedValueOnce(completeResponse);

      const pollPromise = GcpVideoIntelService.pollVideoAnalysis(operationName, superAdminContext, 'tenant-B', 100, 3);
      await vi.advanceTimersByTimeAsync(100);
      await pollPromise;

      // checkVideoAnalysisStatus is called by pollVideoAnalysis, which in turn calls client.request
      // We can't directly check the args of checkVideoAnalysisStatus, but we can infer from the fact it didn't throw a boundary error
      // and that the mock was called twice.
      expect(mockGcpClient.request).toHaveBeenCalledTimes(2);
      // The test would fail before this if the context was not passed correctly, due to the mocked validation logic.
    });
  });
});