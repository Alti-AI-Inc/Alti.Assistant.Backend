import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import * as activities from './activities.js';
import { logger } from '../../../../../shared/logger.js';
import config from '../../../../../../config/index.js';
import { temporalWorkerCoordinator } from './worker';

const mockWorkerInstance = {
  run: vi.fn().mockImplementation(() => new Promise(() => {})),
  shutdown: vi.fn().mockImplementation(() => Promise.resolve()),
};

const {
  mockWorker,
  mockLogger,
  mockConfig
} = vi.hoisted(() => {
  const mockWorker = {
    create: vi.fn().mockImplementation(() => Promise.resolve(mockWorkerInstance)),
  };

  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const mockConfig = {
    temporal: {
      address: 'test-temporal:7233',
      namespace: 'test-namespace',
      active: true,
    },
  };

  return {
    mockWorker,
    mockLogger,
    mockConfig
  };
});

vi.mock('@temporalio/worker', () => ({
  Worker: mockWorker,
}));

vi.mock('path', () => ({
  default: {
    resolve: vi.fn().mockImplementation((_, p) => p),
    dirname: vi.fn().mockImplementation(() => '/mock/dir'),
  },
}));

vi.mock('url', () => ({
  fileURLToPath: vi.fn().mockImplementation(() => '/mock/file.js'),
}));

vi.mock('./activities.js', () => ({
  activities: {},
}));

vi.mock('../../../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../../../../../../config/index.js', () => ({
  default: mockConfig,
}));

const originalProcessEnv = process.env;

describe('TemporalWorkerCoordinator', () => {
  let coordinator;

  beforeEach(async () => {
    vi.clearAllMocks();

    process.env = { ...originalProcessEnv };
    process.env.OFFLINE_MODE = 'false';
    process.env.NODE_ENV = 'development';

    mockConfig.temporal = {
      address: 'test-temporal:7233',
      namespace: 'test-namespace',
      active: true,
    };

    coordinator = temporalWorkerCoordinator;

    coordinator.worker = null;
    coordinator.isRunning = false;
    coordinator.isMock = false;
  });

  afterEach(() => {
    process.env = originalProcessEnv;
  });

  it('should not start if already running', async () => {
    coordinator.isRunning = true;
    await coordinator.start();

    expect(mockLogger.info).toHaveBeenCalledWith('[Temporal Worker] Worker service is already running.');
    expect(mockWorker.create).not.toHaveBeenCalled();
    expect(coordinator.isRunning).toBe(true);
    expect(coordinator.isMock).toBe(false);
  });

  it('should start in mock mode if OFFLINE_MODE is true', async () => {
    process.env.OFFLINE_MODE = 'true';
    await coordinator.start();

    expect(mockLogger.info).toHaveBeenCalledWith('[Temporal Worker] System is operating in Offline/Test Mode. Starting Standby Mock Worker.');
    expect(coordinator.isMock).toBe(true);
    expect(coordinator.isRunning).toBe(true);
    expect(mockWorker.create).not.toHaveBeenCalled();
  });

  it('should start in mock mode if NODE_ENV is test', async () => {
    process.env.NODE_ENV = 'test';
    await coordinator.start();

    expect(mockLogger.info).toHaveBeenCalledWith('[Temporal Worker] System is operating in Offline/Test Mode. Starting Standby Mock Worker.');
    expect(coordinator.isMock).toBe(true);
    expect(coordinator.isRunning).toBe(true);
    expect(mockWorker.create).not.toHaveBeenCalled();
  });

  it('should start in mock mode if config.temporal.active is false', async () => {
    mockConfig.temporal.active = false;
    await coordinator.start();

    expect(mockLogger.info).toHaveBeenCalledWith('[Temporal Worker] System is operating in Offline/Test Mode. Starting Standby Mock Worker.');
    expect(coordinator.isMock).toBe(true);
    expect(coordinator.isRunning).toBe(true);
    expect(mockWorker.create).not.toHaveBeenCalled();
  });

  it('should successfully start a real Temporal worker', async () => {
    let resolveRun;
    const runPromise = new Promise((resolve) => {
      resolveRun = resolve;
    });
    mockWorkerInstance.run.mockReturnValueOnce(runPromise);

    await coordinator.start();

    expect(mockLogger.info).toHaveBeenCalledWith('[Temporal Worker] Initializing Worker connecting to cluster at test-temporal:7233...');
    expect(path.resolve).toHaveBeenCalledWith('/mock/dir', './workflows.js');
    expect(mockWorker.create).toHaveBeenCalledWith({
      workflowsPath: './workflows.js',
      activities,
      taskQueue: 'alti-workflows-queue',
      connectionOptions: {
        address: 'test-temporal:7233',
      },
      namespace: 'test-namespace',
    });
    expect(mockWorkerInstance.run).toHaveBeenCalled();
    expect(coordinator.isRunning).toBe(true);
    expect(coordinator.isMock).toBe(false);
    expect(mockLogger.info).toHaveBeenCalledWith('[Temporal Worker] Resilient Temporal Worker successfully started and polling: "alti-workflows-queue".');

    resolveRun();
    await Promise.resolve();

    expect(mockLogger.info).toHaveBeenCalledWith('[Temporal Worker] Worker run execution loop has cleanly exited.');
    expect(coordinator.isRunning).toBe(false);
  });

  it('should enter mock mode if Worker.create fails', async () => {
    const createError = new Error('Failed to connect to Temporal');
    mockWorker.create.mockRejectedValueOnce(createError);

    await coordinator.start();

    expect(mockLogger.warn).toHaveBeenCalledWith(`[Temporal Worker] Could not connect to live Temporal cluster: ${createError.message}. Entering Standby Emulation Mode.`);
    expect(coordinator.isMock).toBe(true);
    expect(coordinator.isRunning).toBe(true);
    expect(mockWorkerInstance.run).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith('[Temporal Worker] Safe Mock Standby Mode is active. Workflows will execute under client-side emulation.');
  });

  it('should enter mock mode if worker.run() fails', async () => {
    const runtimeError = new Error('Worker runtime crashed');
    mockWorkerInstance.run.mockRejectedValueOnce(runtimeError);

    await coordinator.start();

    expect(coordinator.isRunning).toBe(true);
    expect(coordinator.isMock).toBe(false);

    await Promise.resolve();

    expect(mockLogger.error).toHaveBeenCalledWith(`[Temporal Worker] Runtime error in execution loop: ${runtimeError.message}`);
    expect(coordinator.isRunning).toBe(true);
    expect(coordinator.isMock).toBe(true);
    expect(mockLogger.info).toHaveBeenCalledWith('[Temporal Worker] Safe Mock Standby Mode is active. Workflows will execute under client-side emulation.');
  });

  it('should do nothing if worker is not running when stop() is called', async () => {
    coordinator.isRunning = false;
    await coordinator.stop();

    expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('shutdown'));
    expect(mockWorkerInstance.shutdown).not.toHaveBeenCalled();
    expect(coordinator.isRunning).toBe(false);
  });

  it('should stop a mock worker gracefully', async () => {
    process.env.OFFLINE_MODE = 'true';
    await coordinator.start();
    expect(coordinator.isRunning).toBe(true);
    expect(coordinator.isMock).toBe(true);

    await coordinator.stop();

    expect(mockLogger.info).toHaveBeenCalledWith('[Temporal Worker] Standby Mock Worker stopped.');
    expect(coordinator.isRunning).toBe(false);
    expect(mockWorkerInstance.shutdown).not.toHaveBeenCalled();
  });

  it('should gracefully shut down a real Temporal worker', async () => {
    await coordinator.start();
    expect(coordinator.isRunning).toBe(true);
    expect(coordinator.isMock).toBe(false);

    await coordinator.stop();

    expect(mockLogger.info).toHaveBeenCalledWith('[Temporal Worker] Initiating graceful shutdown of polling worker...');
    expect(mockWorkerInstance.shutdown).toHaveBeenCalled();
    expect(coordinator.isRunning).toBe(false);
    expect(mockLogger.info).toHaveBeenCalledWith('[Temporal Worker] Polling worker successfully shut down.');
  });

  it('should handle errors during real worker shutdown', async () => {
    await coordinator.start();
    expect(coordinator.isRunning).toBe(true);

    const shutdownError = new Error('Shutdown failed');
    mockWorkerInstance.shutdown.mockRejectedValueOnce(shutdownError);

    await coordinator.stop();

    expect(mockWorkerInstance.shutdown).toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(`[Temporal Worker] Error during worker shutdown: ${shutdownError.message}`);
    expect(coordinator.isRunning).toBe(false);
  });
});