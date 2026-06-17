import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';

// Mock dependencies
const mockLaunchDesktop = vi.fn();
const mockGetDesktop = vi.fn();
const mockExecuteComputerAction = vi.fn();
const mockExecuteBashAction = vi.fn();
const mockTerminateDesktop = vi.fn();

const {
  mockCreateCyberdeskClient,
  mockApiError,
  mockConfig
} = vi.hoisted(() => {
  const mockCreateCyberdeskClient = vi.fn().mockImplementation(() => ({
    launchDesktop: mockLaunchDesktop,
    getDesktop: mockGetDesktop,
    executeComputerAction: mockExecuteComputerAction,
    executeBashAction: mockExecuteBashAction,
    terminateDesktop: mockTerminateDesktop,
  }));

  const mockApiError = vi.fn().mockImplementation(function(status, message) {
    const error = new Error(message);
    error.statusCode = status;
    Object.setPrototypeOf(error, mockApiError.prototype);
    return error;
  });
  Object.setPrototypeOf(mockApiError.prototype, Error.prototype);

  let mockConfig = {
    cyberdesk_api_key: 'test-api-key',
  };

  return {
    mockCreateCyberdeskClient,
    mockApiError,
    mockConfig
  };
});

vi.mock('cyberdesk', () => ({
  createCyberdeskClient: mockCreateCyberdeskClient,
}));

vi.mock('../../../errors/ApiError.js', () => ({
  default: mockApiError,
}));

vi.mock('../../../../config/index.js', () => ({
  default: mockConfig,
}));

let cyberdeskService;

describe('cyberdeskService', () => {
  const mockContext = {
    tenantId: 'test-tenant-id',
    userId: 'test-user-id',
    role: 'super_admin'
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLaunchDesktop.mockReset();
    mockGetDesktop.mockReset();
    mockExecuteComputerAction.mockReset();
    mockExecuteBashAction.mockReset();
    mockTerminateDesktop.mockReset();
    mockCreateCyberdeskClient.mockClear();
    mockApiError.mockClear();

    mockConfig.cyberdesk_api_key = 'test-api-key';

    // Default mock implementation to satisfy authorization check
    mockGetDesktop.mockResolvedValue({
      data: {
        id: 'test-desktop-id',
        status: 'running',
        metadata: {
          tenantId: 'test-tenant-id',
          userId: 'test-user-id'
        }
      }
    });

    mockLaunchDesktop.mockResolvedValue({
      desktopId: 'test-desktop-id',
      status: 'launching'
    });

    vi.resetModules();
    const module = await import('./cyberdesk.service.js');
    cyberdeskService = module.cyberdeskService;
  });

  it('should initialize cyberdesk client once and return the same instance', async () => {
    expect(mockCreateCyberdeskClient).not.toHaveBeenCalled();

    await cyberdeskService.launchDesktop(mockContext);
    expect(mockCreateCyberdeskClient).toHaveBeenCalledTimes(1);
    expect(mockCreateCyberdeskClient).toHaveBeenCalledWith({ apiKey: 'test-api-key' });

    await cyberdeskService.launchDesktop(mockContext);
    await cyberdeskService.getDesktopInfo(mockContext, 'some-id');
    expect(mockCreateCyberdeskClient).toHaveBeenCalledTimes(1);
  });

  it('should strip BOM from API key during client initialization', async () => {
    mockConfig.cyberdesk_api_key = '\uFEFFtest-api-key-with-bom';
    vi.resetModules();
    const module = await import('./cyberdesk.service.js');
    cyberdeskService = module.cyberdeskService;

    await cyberdeskService.launchDesktop(mockContext);
    expect(mockCreateCyberdeskClient).toHaveBeenCalledWith({ apiKey: 'test-api-key-with-bom' });
  });

  describe('launchDesktop', () => {
    it('should call launchDesktop on the client and return the result', async () => {
      const mockResult = { desktopId: '123', status: 'launching' };
      mockLaunchDesktop.mockResolvedValue(mockResult);

      const result = await cyberdeskService.launchDesktop(mockContext);
      expect(mockLaunchDesktop).toHaveBeenCalledWith({ body: { timeout_ms: 600000, metadata: { tenantId: 'test-tenant-id', userId: 'test-user-id', role: 'super_admin' } } });
      expect(result).toEqual(mockResult);
    });

    it('should throw ApiError if client launchDesktop returns an error', async () => {
      const errorMessage = 'Failed to launch desktop';
      mockLaunchDesktop.mockResolvedValue({ error: { message: errorMessage } });

      await expect(cyberdeskService.launchDesktop(mockContext)).rejects.toThrow(mockApiError);
      expect(mockApiError).toHaveBeenCalledWith(httpStatus.BAD_REQUEST, errorMessage);
    });

    it('should throw ApiError with default message if client launchDesktop returns an error without message', async () => {
      mockLaunchDesktop.mockResolvedValue({ error: {} });

      await expect(cyberdeskService.launchDesktop(mockContext)).rejects.toThrow(mockApiError);
      expect(mockApiError).toHaveBeenCalledWith(httpStatus.BAD_REQUEST, 'Cyberdesk API Error');
    });
  });

  describe('getDesktopInfo', () => {
    const desktopId = 'test-desktop-id';

    it('should call getDesktop on the client and return the result', async () => {
      const mockResult = {
        data: {
          id: desktopId,
          status: 'running',
          metadata: {
            tenantId: 'test-tenant-id',
            userId: 'test-user-id'
          }
        }
      };
      mockGetDesktop.mockResolvedValue(mockResult);

      const result = await cyberdeskService.getDesktopInfo(mockContext, desktopId);
      expect(mockGetDesktop).toHaveBeenCalledWith({ path: { id: desktopId } });
      expect(result).toEqual(mockResult);
    });

    it('should throw a generic Error if client getDesktop returns an error', async () => {
      const errorMessage = 'Desktop not found';
      mockGetDesktop.mockResolvedValue({ error: { message: errorMessage } });

      await expect(cyberdeskService.getDesktopInfo(mockContext, desktopId)).rejects.toThrow(mockApiError);
      expect(mockApiError).toHaveBeenCalledWith(httpStatus.NOT_FOUND, errorMessage);
    });
  });

  describe('clickMouse', () => {
    const desktopId = 'test-desktop-id';
    const x = 100;
    const y = 200;

    it('should call executeComputerAction on the client and return the result', async () => {
      const mockResult = { success: true };
      mockExecuteComputerAction.mockResolvedValue(mockResult);

      const result = await cyberdeskService.clickMouse(mockContext, desktopId, x, y);
      expect(mockExecuteComputerAction).toHaveBeenCalledWith({
        path: { id: desktopId },
        body: {
          type: 'click_mouse',
          x,
          y,
          button: 'left',
        },
      });
      expect(result).toEqual(mockResult);
    });

    it('should throw a generic Error if client executeComputerAction returns an error', async () => {
      const errorMessage = 'Click failed';
      mockExecuteComputerAction.mockResolvedValue({ error: { message: errorMessage } });

      await expect(cyberdeskService.clickMouse(mockContext, desktopId, x, y)).rejects.toThrow(mockApiError);
      expect(mockApiError).toHaveBeenCalledWith(httpStatus.INTERNAL_SERVER_ERROR, errorMessage);
    });

    it('should throw a generic Error with default message if client executeComputerAction returns an error without message', async () => {
      mockExecuteComputerAction.mockResolvedValue({ error: {} });

      await expect(cyberdeskService.clickMouse(mockContext, desktopId, x, y)).rejects.toThrow(mockApiError);
      expect(mockApiError).toHaveBeenCalledWith(httpStatus.INTERNAL_SERVER_ERROR, 'Cyberdesk Action Error');
    });
  });

  describe('executeBash', () => {
    const desktopId = 'test-desktop-id';
    const command = 'ls -la';

    it('should call executeBashAction on the client and return the result', async () => {
      const mockResult = { output: 'total 0' };
      mockExecuteBashAction.mockResolvedValue(mockResult);

      const result = await cyberdeskService.executeBash(mockContext, desktopId, command);
      expect(mockExecuteBashAction).toHaveBeenCalledWith({
        path: { id: desktopId },
        body: { command },
      });
      expect(result).toEqual(mockResult);
    });

    it('should throw ApiError if client executeBashAction returns an error', async () => {
      const errorMessage = 'Bash command failed';
      mockExecuteBashAction.mockResolvedValue({ error: { message: errorMessage } });

      await expect(cyberdeskService.executeBash(mockContext, desktopId, command)).rejects.toThrow(mockApiError);
      expect(mockApiError).toHaveBeenCalledWith(httpStatus.INTERNAL_SERVER_ERROR, errorMessage);
    });
  });

  describe('terminateDesktop', () => {
    const desktopId = 'test-desktop-id';

    it('should call terminateDesktop on the client and return the result', async () => {
      const mockResult = { success: true };
      mockTerminateDesktop.mockResolvedValue(mockResult);

      const result = await cyberdeskService.terminateDesktop(mockContext, desktopId);
      expect(mockTerminateDesktop).toHaveBeenCalledWith({ path: { id: desktopId } });
      expect(result).toEqual(mockResult);
    });

    it('should throw ApiError if client terminateDesktop returns an error', async () => {
      const errorMessage = 'Termination failed';
      mockTerminateDesktop.mockResolvedValue({ error: { message: errorMessage } });

      await expect(cyberdeskService.terminateDesktop(mockContext, desktopId)).rejects.toThrow(mockApiError);
      expect(mockApiError).toHaveBeenCalledWith(httpStatus.INTERNAL_SERVER_ERROR, errorMessage);
    });
  });
});