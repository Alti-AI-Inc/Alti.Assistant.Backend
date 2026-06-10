import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cyberdeskController } from './cyberdesk.controller.js';
import { cyberdeskService } from './cyberdesk.service.js';

// Mock the cyberdeskService module
vi.mock('./cyberdesk.service.js', () => ({
  cyberdeskService: {
    launchDesktop: vi.fn(),
    getDesktopInfo: vi.fn(),
    clickMouse: vi.fn(),
    executeBash: vi.fn(),
    terminateDesktop: vi.fn(),
  },
}));

// Helper function to create mock Express response objects
const mockResponse = () => {
  const res = {};
  res.status = vi.fn().mockReturnThis(); // Allows chaining .status().json()
  res.json = vi.fn().mockReturnThis();
  return res;
};

let consoleErrorSpy;

beforeEach(() => {
  // Spy on console.error to prevent test output pollution and to assert calls
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  // Reset all mocks before each test to ensure isolation
  vi.clearAllMocks();
});

afterEach(() => {
  // Restore original console.error after each test
  consoleErrorSpy.mockRestore();
});

describe('cyberdeskController.launch', () => {
  it('should launch desktop and return 200 with success message', async () => {
    const req = {};
    const res = mockResponse();
    const mockResult = { desktopId: 'test-desktop-123', status: 'launched' };
    cyberdeskService.launchDesktop.mockResolvedValue(mockResult);

    await cyberdeskController.launch(req, res);

    expect(cyberdeskService.launchDesktop).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Desktop launched', data: mockResult });
  });

  it('should return 500 if cyberdeskService.launchDesktop fails', async () => {
    const req = {};
    const res = mockResponse();
    const mockError = new Error('Service launch failed');
    cyberdeskService.launchDesktop.mockRejectedValue(mockError);

    await cyberdeskController.launch(req, res);

    expect(cyberdeskService.launchDesktop).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to launch desktop.' });
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error launching desktop:', mockError);
  });
});

describe('cyberdeskController.info', () => {
  it('should return 200 with desktop info if ID is valid', async () => {
    const req = { params: { id: 'test-desktop-123' } };
    const res = mockResponse();
    const mockInfo = { id: 'test-desktop-123', status: 'running', ip: '192.168.1.100' };
    cyberdeskService.getDesktopInfo.mockResolvedValue(mockInfo);

    await cyberdeskController.info(req, res);

    expect(cyberdeskService.getDesktopInfo).toHaveBeenCalledTimes(1);
    expect(cyberdeskService.getDesktopInfo).toHaveBeenCalledWith('test-desktop-123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockInfo);
  });

  it('should return 400 if desktop ID is missing', async () => {
    const req = { params: {} };
    const res = mockResponse();

    await cyberdeskController.info(req, res);

    expect(cyberdeskService.getDesktopInfo).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Desktop ID is required and must be a string.' });
  });

  it('should return 400 if desktop ID is not a string', async () => {
    const req = { params: { id: 123 } };
    const res = mockResponse();

    await cyberdeskController.info(req, res);

    expect(cyberdeskService.getDesktopInfo).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Desktop ID is required and must be a string.' });
  });

  it('should return 500 if cyberdeskService.getDesktopInfo fails', async () => {
    const req = { params: { id: 'test-desktop-123' } };
    const res = mockResponse();
    const mockError = new Error('Service info retrieval failed');
    cyberdeskService.getDesktopInfo.mockRejectedValue(mockError);

    await cyberdeskController.info(req, res);

    expect(cyberdeskService.getDesktopInfo).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to retrieve desktop information.' });
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Error getting info for desktop ID ${req.params.id}:`, mockError);
  });
});

describe('cyberdeskController.click', () => {
  it('should return 200 after successful mouse click', async () => {
    const req = { params: { id: 'test-desktop-123' }, body: { x: 100, y: 200 } };
    const res = mockResponse();
    const mockResult = { status: 'click successful', x: 100, y: 200 };
    cyberdeskService.clickMouse.mockResolvedValue(mockResult);

    await cyberdeskController.click(req, res);

    expect(cyberdeskService.clickMouse).toHaveBeenCalledTimes(1);
    expect(cyberdeskService.clickMouse).toHaveBeenCalledWith('test-desktop-123', 100, 200);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockResult);
  });

  it('should return 400 if desktop ID is missing', async () => {
    const req = { params: {}, body: { x: 100, y: 200 } };
    const res = mockResponse();

    await cyberdeskController.click(req, res);

    expect(cyberdeskService.clickMouse).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Desktop ID is required and must be a string.' });
  });

  it('should return 400 if desktop ID is not a string', async () => {
    const req = { params: { id: 123 }, body: { x: 100, y: 200 } };
    const res = mockResponse();

    await cyberdeskController.click(req, res);

    expect(cyberdeskService.clickMouse).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Desktop ID is required and must be a string.' });
  });

  it('should return 400 if x coordinate is missing', async () => {
    const req = { params: { id: 'test-desktop-123' }, body: { y: 200 } };
    const res = mockResponse();

    await cyberdeskController.click(req, res);

    expect(cyberdeskService.clickMouse).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Coordinates x and y are required and must be numbers.' });
  });

  it('should return 400 if x coordinate is not a number', async () => {
    const req = { params: { id: 'test-desktop-123' }, body: { x: 'abc', y: 200 } };
    const res = mockResponse();

    await cyberdeskController.click(req, res);

    expect(cyberdeskService.clickMouse).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Coordinates x and y are required and must be numbers.' });
  });

  it('should return 400 if y coordinate is missing', async () => {
    const req = { params: { id: 'test-desktop-123' }, body: { x: 100 } };
    const res = mockResponse();

    await cyberdeskController.click(req, res);

    expect(cyberdeskService.clickMouse).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Coordinates x and y are required and must be numbers.' });
  });

  it('should return 400 if y coordinate is not a number', async () => {
    const req = { params: { id: 'test-desktop-123' }, body: { x: 100, y: 'def' } };
    const res = mockResponse();

    await cyberdeskController.click(req, res);

    expect(cyberdeskService.clickMouse).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Coordinates x and y are required and must be numbers.' });
  });

  it('should return 500 if cyberdeskService.clickMouse fails', async () => {
    const req = { params: { id: 'test-desktop-123' }, body: { x: 100, y: 200 } };
    const res = mockResponse();
    const mockError = new Error('Service click failed');
    cyberdeskService.clickMouse.mockRejectedValue(mockError);

    await cyberdeskController.click(req, res);

    expect(cyberdeskService.clickMouse).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to perform mouse click.' });
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Error clicking mouse for desktop ID ${req.params.id} at (${req.body.x}, ${req.body.y}):`, mockError);
  });
});

describe('cyberdeskController.bash', () => {
  it('should return 200 after successful bash command execution', async () => {
    const req = { params: { id: 'test-desktop-123' }, body: { command: 'ls -la' } };
    const res = mockResponse();
    const mockResult = { output: 'total 0\ndrwxr-xr-x ...', exitCode: 0 };
    cyberdeskService.executeBash.mockResolvedValue(mockResult);

    await cyberdeskController.bash(req, res);

    expect(cyberdeskService.executeBash).toHaveBeenCalledTimes(1);
    expect(cyberdeskService.executeBash).toHaveBeenCalledWith('test-desktop-123', 'ls -la');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockResult);
  });

  it('should return 400 if desktop ID is missing', async () => {
    const req = { params: {}, body: { command: 'ls -la' } };
    const res = mockResponse();

    await cyberdeskController.bash(req, res);

    expect(cyberdeskService.executeBash).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Desktop ID is required and must be a string.' });
  });

  it('should return 400 if desktop ID is not a string', async () => {
    const req = { params: { id: 123 }, body: { command: 'ls -la' } };
    const res = mockResponse();

    await cyberdeskController.bash(req, res);

    expect(cyberdeskService.executeBash).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Desktop ID is required and must be a string.' });
  });

  it('should return 400 if command is missing', async () => {
    const req = { params: { id: 'test-desktop-123' }, body: {} };
    const res = mockResponse();

    await cyberdeskController.bash(req, res);

    expect(cyberdeskService.executeBash).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Command is required and must be a string.' });
  });

  it('should return 400 if command is not a string', async () => {
    const req = { params: { id: 'test-desktop-123' }, body: { command: 123 } };
    const res = mockResponse();

    await cyberdeskController.bash(req, res);

    expect(cyberdeskService.executeBash).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Command is required and must be a string.' });
  });

  it('should return 500 if cyberdeskService.executeBash fails', async () => {
    const req = { params: { id: 'test-desktop-123' }, body: { command: 'ls -la' } };
    const res = mockResponse();
    const mockError = new Error('Service bash execution failed');
    cyberdeskService.executeBash.mockRejectedValue(mockError);

    await cyberdeskController.bash(req, res);

    expect(cyberdeskService.executeBash).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to execute bash command.' });
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Error executing bash command for desktop ID ${req.params.id}: "${req.body.command}"`, mockError);
  });
});

describe('cyberdeskController.terminate', () => {
  it('should return 200 after successful desktop termination', async () => {
    const req = { params: { id: 'test-desktop-123' } };
    const res = mockResponse();
    const mockResult = { status: 'terminated', desktopId: 'test-desktop-123' };
    cyberdeskService.terminateDesktop.mockResolvedValue(mockResult);

    await cyberdeskController.terminate(req, res);

    expect(cyberdeskService.terminateDesktop).toHaveBeenCalledTimes(1);
    expect(cyberdeskService.terminateDesktop).toHaveBeenCalledWith('test-desktop-123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockResult);
  });

  it('should return 400 if desktop ID is missing', async () => {
    const req = { params: {} };
    const res = mockResponse();

    await cyberdeskController.terminate(req, res);

    expect(cyberdeskService.terminateDesktop).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Desktop ID is required and must be a string.' });
  });

  it('should return 400 if desktop ID is not a string', async () => {
    const req = { params: { id: 123 } };
    const res = mockResponse();

    await cyberdeskController.terminate(req, res);

    expect(cyberdeskService.terminateDesktop).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Desktop ID is required and must be a string.' });
  });

  it('should return 500 if cyberdeskService.terminateDesktop fails', async () => {
    const req = { params: { id: 'test-desktop-123' } };
    const res = mockResponse();
    const mockError = new Error('Service termination failed');
    cyberdeskService.terminateDesktop.mockRejectedValue(mockError);

    await cyberdeskController.terminate(req, res);

    expect(cyberdeskService.terminateDesktop).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Failed to terminate desktop.' });
    expect(consoleErrorSpy).toHaveBeenCalledWith(`Error terminating desktop ID ${req.params.id}:`, mockError);
  });
});