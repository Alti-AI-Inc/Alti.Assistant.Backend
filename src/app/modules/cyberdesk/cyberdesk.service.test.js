import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status'; // Required for ApiError usage in launchDesktop test

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

  // Mock ApiError to allow checking its constructor calls
  const mockApiError = vi.fn().mockImplementation((status, message) => {
    const error = new Error(message);
    error.statusCode = status;
    return error;
  });

  // Mock config, allowing it to be reset for specific tests
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

// Import the service AFTER mocks are set up
let cyberdeskService;

describe('cyberdeskService', () => {
  beforeEach(async () => {
    // Clear all mock calls and reset mock implementations
    vi.clearAllMocks();
    mockLaunchDesktop.mockReset();
    mockGetDesktop.mockReset();
    mockExecuteComputerAction.mockReset();
    mockExecuteBashAction.mockReset();
    mockTerminateDesktop.mockReset();
    mockCreateCyberdeskClient.mockClear(); // Clear calls but keep implementation
    mockApiError.mockClear();

    // Reset config to default for each test
    mockConfig.cyberdesk_api_key = 'test-api-key';

    // Reset the module to clear the singleton client instance in getCyberdeskClient
    vi.resetModules();
    const module = await import('./cyberdesk.service.js');
    cyberdeskService = module.cyberdeskService;
  });

  // Test getCyberdeskClient's lazy initialization and singleton behavior
  it('should initialize cyberdesk client once and return the same instance', async () => {
    expect(mockCreateCyberdeskClient).not.toHaveBeenCalled();

    // First call to any service method will trigger client initialization
    await cyberdeskService.launchDesktop();
    expect(mockCreateCyberdeskClient).toHaveBeenCalledTimes(1);
    expect(mockCreateCyberdeskClient).toHaveBeenCalledWith({ apiKey: 'test-api-key' });

    // Subsequent calls should not re-initialize the client
    await cyberdeskService.launchDesktop();
    await cyberdeskService.getDesktopInfo('some-id');
    expect(mockCreateCyberdeskClient).toHaveBeenCalledTimes(1); // Still 1, proving singleton
  });

  it('should strip BOM from API key during client initialization', async () => {
    mockConfig.cyberdesk_api_key = '\uFEFFtest-api-key-with-bom';
    vi.resetModules(); // Reset to re-evaluate config and re-initialize client
    const module = await import('./cyberdesk.service.js');
    cyberdeskService = module.cyberdeskService;

    await cyberdeskService.launchDesktop();
    expect(mockCreateCyberdeskClient).toHaveBeenCalledWith({ apiKey: 'test-api-key-with-bom' });
  });

  // Test launchDesktop
  describe('launchDesktop', () => {
    it('should call launchDesktop on the client and return the result', async () => {
      const mockResult = { desktopId: '123', status: 'launching' };
      mockLaunchDesktop.mockResolvedValue(mockResult);

      const result = await cyberdeskService.launchDesktop();
      expect(mockLaunchDesktop).toHaveBeenCalledWith({ body: { timeout_ms: 600000 } });
      expect(result).toEqual(mockResult);
    });

    it('should throw ApiError if client launchDesktop returns an error', async () => {
      const errorMessage = 'Failed to launch desktop';
      mockLaunchDesktop.mockResolvedValue({ error: { message: errorMessage } });

      await expect(cyberdeskService.launchDesktop()).rejects.toThrow(mockApiError);
      expect(mockApiError).toHaveBeenCalledWith(httpStatus.BAD_REQUEST, errorMessage);
    });

    it('should throw ApiError with default message if client launchDesktop returns an error without message', async () => {
      mockLaunchDesktop.mockResolvedValue({ error: {} });

      await expect(cyberdeskService.launchDesktop()).rejects.toThrow(mockApiError);
      expect(mockApiError).toHaveBeenCalledWith(httpStatus.BAD_REQUEST, 'Cyberdesk API Error');
    });
  });

  // Test getDesktopInfo
  describe('getDesktopInfo', () => {
    const desktopId = 'test-desktop-id';

    it('should call getDesktop on the client and return the result', async () => {
      const mockResult = { id: desktopId, status: 'running' };
      mockGetDesktop.mockResolvedValue(mockResult);

      const result = await cyberdeskService.getDesktopInfo(desktopId);
      expect(mockGetDesktop).toHaveBeenCalledWith({ path: { id: desktopId } });
      expect(result).toEqual(mockResult);
    });

    it('should throw a generic Error if client getDesktop returns an error', async () => {
      const errorMessage = 'Desktop not found';
      mockGetDesktop.mockResolvedValue({ error: errorMessage }); // The service throws new Error(result.error)

      await expect(cyberdeskService.getDesktopInfo(desktopId)).rejects.toThrow(new Error(errorMessage));
    });
  });

  // Test clickMouse
  describe('clickMouse', () => {
    const desktopId = 'test-desktop-id';
    const x = 100;
    const y = 200;

    it('should call executeComputerAction on the client and return the result', async () => {
      const mockResult = { success: true };
      mockExecuteComputerAction.mockResolvedValue(mockResult);

      const result = await cyberdeskService.clickMouse(desktopId, x, y);
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

      await expect(cyberdeskService.clickMouse(desktopId, x, y)).rejects.toThrow(new Error(errorMessage));
    });

    it('should throw a generic Error with default message if client executeComputerAction returns an error without message', async () => {
      mockExecuteComputerAction.mockResolvedValue({ error: {} });

      await expect(cyberdeskService.clickMouse(desktopId, x, y)).rejects.toThrow(new Error('Unknown Cyberdesk Error'));
    });
  });

  // Test executeBash
  describe('executeBash', () => {
    const desktopId = 'test-desktop-id';
    const command = 'ls -la';

    it('should call executeBashAction on the client and return the result', async () => {
      const mockResult = { output: 'total 0' };
      mockExecuteBashAction.mockResolvedValue(mockResult);

      const result = await cyberdeskService.executeBash(desktopId, command);
      expect(mockExecuteBashAction).toHaveBeenCalledWith({
        path: { id: desktopId },
        body: { command },
      });
      expect(result).toEqual(mockResult);
    });

    it('should return the error object if client executeBashAction returns an error', async () => {
      const mockErrorResult = { error: { message: 'Bash command failed' } };
      mockExecuteBashAction.mockResolvedValue(mockErrorResult);

      const result = await cyberdeskService.executeBash(desktopId, command);
      expect(result).toEqual(mockErrorResult);
    });
  });

  // Test terminateDesktop
  describe('terminateDesktop', () => {
    const desktopId = 'test-desktop-id';

    it('should call terminateDesktop on the client and return the result', async () => {
      const mockResult = { success: true };
      mockTerminateDesktop.mockResolvedValue(mockResult);

      const result = await cyberdeskService.terminateDesktop(desktopId);
      expect(mockTerminateDesktop).toHaveBeenCalledWith({ path: { id: desktopId } });
      expect(result).toEqual(mockResult);
    });

    it('should return the error object if client terminateDesktop returns an error', async () => {
      const mockErrorResult = { error: { message: 'Termination failed' } };
      mockTerminateDesktop.mockResolvedValue(mockErrorResult);

      const result = await cyberdeskService.terminateDesktop(desktopId);
      expect(result).toEqual(mockErrorResult);
    });
  });
});